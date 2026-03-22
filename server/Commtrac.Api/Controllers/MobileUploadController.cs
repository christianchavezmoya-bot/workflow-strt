using System.Collections.Concurrent;
using Commtrac.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/mobile-upload")]
public class MobileUploadController : ControllerBase
{
    // ── In-memory token store (no DB migration needed) ──────────────────────
    private record UploadToken(
        string Token,
        string Type,
        string LinkedTo,
        string? CustomValuesJson,
        DateTime ExpiresAt,
        string Status,          // "pending" | "complete" | "expired"
        string? DocumentId
    );

    private static readonly ConcurrentDictionary<string, UploadToken> Tokens = new();

    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;

    public MobileUploadController(AppDbContext db, IWebHostEnvironment env)
    {
        _db = db;
        _env = env;
    }

    // ── POST /api/mobile-upload/token ────────────────────────────────────────
    // Called by desktop to create a token. Requires auth.
    [HttpPost("token")]
    [Authorize]
    public IActionResult CreateToken([FromBody] CreateTokenRequest request)
    {
        // Purge expired tokens
        var expired = Tokens.Where(kvp => kvp.Value.ExpiresAt < DateTime.UtcNow).Select(kvp => kvp.Key).ToList();
        foreach (var k in expired) Tokens.TryRemove(k, out _);

        var token = Guid.NewGuid().ToString("N")[..16]; // 16-char token
        var entry = new UploadToken(
            Token: token,
            Type: request.Type ?? "tips",
            LinkedTo: request.LinkedTo ?? "",
            CustomValuesJson: request.CustomValuesJson,
            ExpiresAt: DateTime.UtcNow.AddMinutes(10),
            Status: "pending",
            DocumentId: null
        );
        Tokens[token] = entry;

        return Ok(new { token, expiresAt = entry.ExpiresAt });
    }

    // ── GET /api/mobile-upload/token/{token} ─────────────────────────────────
    // Polled by desktop every 3s. No auth required (token IS the secret).
    [HttpGet("token/{token}")]
    [AllowAnonymous]
    public IActionResult GetTokenStatus(string token)
    {
        if (!Tokens.TryGetValue(token, out var entry))
            return NotFound(new { status = "not_found" });

        if (entry.ExpiresAt < DateTime.UtcNow)
        {
            Tokens.TryRemove(token, out _);
            return Ok(new { status = "expired" });
        }

        return Ok(new { status = entry.Status, documentId = entry.DocumentId });
    }

    // ── POST /api/mobile-upload/{token}/upload ───────────────────────────────
    // Called by the phone. No auth — validated via token.
    [HttpPost("{token}/upload")]
    [AllowAnonymous]
    [RequestSizeLimit(100_000_000)]
    public async Task<IActionResult> UploadFile(string token, [FromForm] IFormFile? file)
    {
        if (!Tokens.TryGetValue(token, out var entry))
            return NotFound(new { error = "Token not found or expired." });

        if (entry.ExpiresAt < DateTime.UtcNow)
        {
            Tokens.TryRemove(token, out _);
            return BadRequest(new { error = "Token has expired." });
        }

        if (entry.Status == "complete")
            return BadRequest(new { error = "File already uploaded for this token." });

        if (file == null || file.Length == 0)
            return BadRequest(new { error = "No file provided." });

        // Save file using same storage pattern as DocumentsController
        var storageRoot = Path.Combine(_env.ContentRootPath, "Storage", "Documents");
        Directory.CreateDirectory(storageRoot);

        var extension = Path.GetExtension(file.FileName);
        var storedName = $"{Guid.NewGuid()}{extension}";
        var storedPath = Path.Combine(storageRoot, storedName);

        await using (var stream = System.IO.File.Create(storedPath))
        {
            await file.CopyToAsync(stream);
        }

        var doc = new Commtrac.Api.Models.DocumentEntity
        {
            Name = file.FileName,
            Type = entry.Type,
            LinkedTo = entry.LinkedTo,
            UploadedAt = DateTime.UtcNow.ToString("s"),
            FilePath = Path.Combine("Storage", "Documents", storedName),
            ContentType = file.ContentType,
            FileSize = file.Length,
            CreatedBy = "mobile-upload",
            Notes = null,
            CustomValuesJson = entry.CustomValuesJson
        };

        _db.Documents.Add(doc);
        await _db.SaveChangesAsync();

        // Mark token complete
        Tokens[token] = entry with { Status = "complete", DocumentId = doc.Id };

        return Ok(new { documentId = doc.Id });
    }

    // ── GET /api/mobile-upload/{token}/info ──────────────────────────────────
    // Called by phone landing page to get context (type label etc.)
    [HttpGet("{token}/info")]
    [AllowAnonymous]
    public IActionResult GetTokenInfo(string token)
    {
        if (!Tokens.TryGetValue(token, out var entry))
            return NotFound(new { error = "Token not found or expired." });
        if (entry.ExpiresAt < DateTime.UtcNow)
            return Ok(new { error = "expired" });
        return Ok(new { type = entry.Type, linkedTo = entry.LinkedTo, expiresAt = entry.ExpiresAt });
    }
}

public record CreateTokenRequest(string? Type, string? LinkedTo, string? CustomValuesJson);
