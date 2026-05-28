using System.Security.Claims;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/mobile-upload")]
public class MobileUploadController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;

    public MobileUploadController(AppDbContext db, IWebHostEnvironment env)
    {
        _db = db;
        _env = env;
    }

    [HttpPost("token")]
    [Authorize]
    public async Task<IActionResult> CreateToken([FromBody] CreateTokenRequest request)
    {
        await ExpireStaleTokensAsync();

        var token = Guid.NewGuid().ToString("N")[..16];
        var entry = new MobileUploadTokenEntity
        {
            Token = token,
            Type = request.Type ?? "tips",
            LinkedTo = request.LinkedTo ?? string.Empty,
            CustomValuesJson = request.CustomValuesJson,
            Status = "pending",
            CreatedByUserId = User.FindFirstValue(ClaimTypes.NameIdentifier),
            CreatedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(10),
        };

        _db.MobileUploadTokens.Add(entry);
        await _db.SaveChangesAsync();

        return Ok(new { token, expiresAt = entry.ExpiresAtUtc });
    }

    [HttpGet("token/{token}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetTokenStatus(string token)
    {
        var entry = await _db.MobileUploadTokens.AsNoTracking().FirstOrDefaultAsync(t => t.Token == token);
        if (entry is null)
            return NotFound(new { status = "not_found" });

        if (IsPendingAndExpired(entry))
        {
            await MarkExpiredAsync(entry.Token);
            return Ok(new { status = "expired" });
        }

        return Ok(new { status = entry.Status, documentId = entry.DocumentId });
    }

    [HttpPost("{token}/upload")]
    [AllowAnonymous]
    [RequestSizeLimit(100_000_000)]
    public async Task<IActionResult> UploadFile(string token, [FromForm] IFormFile? file)
    {
        var entry = await _db.MobileUploadTokens.FirstOrDefaultAsync(t => t.Token == token);
        if (entry is null)
            return NotFound(new { error = "Token not found or expired." });

        if (IsPendingAndExpired(entry))
        {
            await MarkExpiredAsync(entry.Token);
            return BadRequest(new { error = "Token has expired." });
        }

        if (string.Equals(entry.Status, "complete", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { error = "File already uploaded for this token." });

        if (file == null || file.Length == 0)
            return BadRequest(new { error = "No file provided." });

        var storageRoot = Path.Combine(_env.ContentRootPath, "Storage", "Documents");
        Directory.CreateDirectory(storageRoot);

        var extension = Path.GetExtension(file.FileName);
        var storedName = $"{Guid.NewGuid()}{extension}";
        var storedPath = Path.Combine(storageRoot, storedName);

        await using (var stream = System.IO.File.Create(storedPath))
        {
            await file.CopyToAsync(stream);
        }

        var doc = new DocumentEntity
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
        entry.Status = "complete";
        entry.DocumentId = doc.Id;
        entry.ConsumedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        return Ok(new { documentId = doc.Id });
    }

    [HttpGet("{token}/info")]
    [AllowAnonymous]
    public async Task<IActionResult> GetTokenInfo(string token)
    {
        var entry = await _db.MobileUploadTokens.AsNoTracking().FirstOrDefaultAsync(t => t.Token == token);
        if (entry is null)
            return NotFound(new { error = "Token not found or expired." });

        if (IsPendingAndExpired(entry))
        {
            await MarkExpiredAsync(entry.Token);
            return Ok(new { error = "expired" });
        }

        return Ok(new
        {
            type = entry.Type,
            linkedTo = entry.LinkedTo,
            expiresAt = entry.ExpiresAtUtc,
            status = entry.Status,
            createdBy = entry.CreatedByUserId,
            consumedAt = entry.ConsumedAtUtc
        });
    }

    private async Task ExpireStaleTokensAsync()
    {
        var stale = await _db.MobileUploadTokens
            .Where(t => t.Status == "pending" && t.ExpiresAtUtc < DateTime.UtcNow)
            .ToListAsync();

        if (stale.Count == 0) return;

        foreach (var token in stale)
        {
            token.Status = "expired";
        }

        await _db.SaveChangesAsync();
    }

    private async Task MarkExpiredAsync(string token)
    {
        var entry = await _db.MobileUploadTokens.FirstOrDefaultAsync(t => t.Token == token);
        if (entry is null || !string.Equals(entry.Status, "pending", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        entry.Status = "expired";
        await _db.SaveChangesAsync();
    }

    private static bool IsPendingAndExpired(MobileUploadTokenEntity entry)
    {
        return string.Equals(entry.Status, "pending", StringComparison.OrdinalIgnoreCase)
               && entry.ExpiresAtUtc < DateTime.UtcNow;
    }
}

public record CreateTokenRequest(string? Type, string? LinkedTo, string? CustomValuesJson);
