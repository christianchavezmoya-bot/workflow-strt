using System.Text.Json;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/documents")]
[Authorize]
public class DocumentsController : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;
    private readonly IDocumentSearchIndexQueue _searchIndexQueue;
    private readonly AuditLogService _audit;

    public DocumentsController(AppDbContext db, IWebHostEnvironment env, IDocumentSearchIndexQueue searchIndexQueue, AuditLogService audit)
    {
        _db = db;
        _env = env;
        _searchIndexQueue = searchIndexQueue;
        _audit = audit;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<DocumentDto>>> GetAll()
    {
        var docs = await _db.Documents.OrderByDescending(d => d.UploadedAt).ToListAsync();
        return Ok(docs.Select(doc => ToDto(doc, Request)));
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<DocumentDto>> Create([FromBody] DocumentDto request)
    {
        var doc = new DocumentEntity
        {
            Id = string.IsNullOrWhiteSpace(request.Id) ? Guid.NewGuid().ToString() : request.Id,
            Name = request.Name,
            Type = request.Type,
            LinkedTo = request.LinkedTo,
            UploadedAt = request.UploadedAt,
            ContentType = request.ContentType,
            FileSize = request.FileSize,
            DownloadUrl = request.DownloadUrl,
            CreatedBy = User.Identity?.Name ?? request.CreatedBy,
            Notes = request.Notes,
            CustomValuesJson = request.CustomValuesJson
        };

        _db.Documents.Add(doc);
        await _db.SaveChangesAsync();
        _searchIndexQueue.EnqueueLibraryDocument(doc.Id);
        return CreatedAtAction(nameof(GetAll), new { id = doc.Id }, ToDto(doc, Request));
    }

    [HttpPost("upload")]
    [Authorize(Roles = "Admin,Project Manager")]
    [RequestSizeLimit(50_000_000)]
    public async Task<ActionResult<DocumentDto>> Upload([FromForm] UploadDocumentRequest request)
    {
        if (request.File == null || request.File.Length == 0)
        {
            return BadRequest("File is required.");
        }

        var storageRoot = Path.Combine(_env.ContentRootPath, "Storage", "Documents");
        Directory.CreateDirectory(storageRoot);

        var extension = Path.GetExtension(request.File.FileName);
        var storedName = $"{Guid.NewGuid()}{extension}";
        var storedPath = Path.Combine(storageRoot, storedName);

        await using (var stream = System.IO.File.Create(storedPath))
        {
            await request.File.CopyToAsync(stream);
        }

        var doc = new DocumentEntity
        {
            Name = request.File.FileName,
            Type = request.Type ?? string.Empty,
            LinkedTo = request.LinkedTo ?? string.Empty,
            UploadedAt = DateTime.UtcNow.ToString("s"),
            FilePath = Path.Combine("Storage", "Documents", storedName),
            ContentType = request.File.ContentType,
            FileSize = request.File.Length,
            CreatedBy = User.Identity?.Name ?? request.CreatedBy,
            Notes = request.Notes,
            CustomValuesJson = request.CustomValuesJson
        };

        _db.Documents.Add(doc);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetAll), new { id = doc.Id }, ToDto(doc, Request));
    }

    [HttpGet("{id}/download")]
    [AllowAnonymous]
    public async Task<IActionResult> Download(string id)
    {
        var doc = await _db.Documents.FirstOrDefaultAsync(d => d.Id == id);
        if (doc is null || string.IsNullOrWhiteSpace(doc.FilePath))
        {
            return NotFound();
        }

        var fullPath = Path.Combine(_env.ContentRootPath, doc.FilePath);
        if (!System.IO.File.Exists(fullPath))
        {
            return NotFound();
        }

        var contentType = string.IsNullOrWhiteSpace(doc.ContentType) ? "application/octet-stream" : doc.ContentType;
        // inline disposition: browser opens PDF/images in-tab; filename still available for "Save As"
        var safeName = Uri.EscapeDataString(doc.Name ?? "document");
        Response.Headers["Content-Disposition"] = $"inline; filename*=UTF-8''{safeName}";
        return PhysicalFile(fullPath, contentType, enableRangeProcessing: true);
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Delete(string id)
    {
        var doc = await _db.Documents.IgnoreQueryFilters().FirstOrDefaultAsync(d => d.Id == id);
        if (doc is null) return NotFound();
        if (doc.IsDeleted) return NoContent();

        doc.IsDeleted = true;
        doc.DeletedAtUtc = DateTime.UtcNow;
        doc.DeletedByUserId = User.FindFirst("sub")?.Value ?? User.FindFirst("nameid")?.Value;
        await _db.SaveChangesAsync();
        _searchIndexQueue.RemoveLibraryDocument(id);
        await _audit.LogAsync(User, HttpContext, "document_archived", $"{doc.Name} ({doc.Id})");
        return NoContent();
    }

    [HttpPost("{id}/restore")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Restore(string id)
    {
        var doc = await _db.Documents.IgnoreQueryFilters().FirstOrDefaultAsync(d => d.Id == id);
        if (doc is null) return NotFound();

        if (!string.IsNullOrWhiteSpace(doc.FilePath))
        {
            var fullPath = Path.Combine(_env.ContentRootPath, doc.FilePath);
            if (!System.IO.File.Exists(fullPath))
            {
                return Conflict("Physical file is missing from storage.");
            }
        }

        doc.IsDeleted = false;
        doc.DeletedAtUtc = null;
        doc.DeletedByUserId = null;
        doc.DeleteReason = null;
        await _db.SaveChangesAsync();
        _searchIndexQueue.EnqueueLibraryDocument(id);
        await _audit.LogAsync(User, HttpContext, "document_restored", $"{doc.Name} ({doc.Id})");
        return NoContent();
    }

    [HttpDelete("{id}/purge")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Purge(string id)
    {
        var doc = await _db.Documents.IgnoreQueryFilters().FirstOrDefaultAsync(d => d.Id == id);
        if (doc is null) return NotFound();

        if (!string.IsNullOrWhiteSpace(doc.FilePath))
        {
            var fullPath = Path.Combine(_env.ContentRootPath, doc.FilePath);
            if (System.IO.File.Exists(fullPath))
            {
                System.IO.File.Delete(fullPath);
            }
        }

        _db.Documents.Remove(doc);
        await _db.SaveChangesAsync();
        _searchIndexQueue.RemoveLibraryDocument(id);
        await _audit.LogAsync(User, HttpContext, "document_purged", $"{doc.Name} ({doc.Id})");
        return NoContent();
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<DocumentDto>> Update(string id, [FromBody] DocumentDto request)
    {
        var doc = await _db.Documents.FirstOrDefaultAsync(d => d.Id == id);
        if (doc is null)
        {
            return NotFound();
        }

        doc.Name = request.Name;
        doc.Type = request.Type;
        doc.LinkedTo = request.LinkedTo;
        doc.UploadedAt = request.UploadedAt;
        doc.ContentType = request.ContentType;
        doc.FileSize = request.FileSize;
        // Preserve original creator — only set if not already recorded
        if (string.IsNullOrWhiteSpace(doc.CreatedBy))
            doc.CreatedBy = User.Identity?.Name ?? request.CreatedBy;
        doc.Notes = request.Notes;
        doc.CustomValuesJson = request.CustomValuesJson;
        // Only update DownloadUrl for URL-linked docs (uploaded docs use FilePath, not DownloadUrl)
        if (string.IsNullOrWhiteSpace(doc.FilePath))
            doc.DownloadUrl = request.DownloadUrl;

        await _db.SaveChangesAsync();
        return Ok(ToDto(doc, Request));
    }

    // ── Document UI Config (tabs + custom fields) ────────────────────────────

    [HttpGet("config")]
    public async Task<ActionResult<DocumentConfigDto>> GetConfig()
    {
        var config = await _db.DocumentConfigs.FirstOrDefaultAsync(c => c.Id == 1);
        return Ok(new DocumentConfigDto(
            config?.TabsJson ?? "[]",
            config?.FieldsJson ?? "[]"
        ));
    }

    [HttpPut("config")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<DocumentConfigDto>> SaveConfig([FromBody] DocumentConfigDto dto)
    {
        var config = await _db.DocumentConfigs.FirstOrDefaultAsync(c => c.Id == 1);
        if (config == null)
        {
            config = new DocumentConfigEntity { Id = 1, TabsJson = dto.TabsJson, FieldsJson = dto.FieldsJson };
            _db.DocumentConfigs.Add(config);
        }
        else
        {
            config.TabsJson = dto.TabsJson;
            config.FieldsJson = dto.FieldsJson;
        }
        await _db.SaveChangesAsync();
        return Ok(new DocumentConfigDto(config.TabsJson, config.FieldsJson));
    }

    private static DocumentDto ToDto(DocumentEntity doc, HttpRequest request)
        => new(
            doc.Id,
            doc.Name,
            doc.Type,
            doc.LinkedTo,
            doc.UploadedAt,
            doc.ContentType,
            doc.FileSize,
            string.IsNullOrWhiteSpace(doc.FilePath)
                ? doc.DownloadUrl   // URL-linked document — use stored URL
                : $"{request.Scheme}://{request.Host}/api/documents/{doc.Id}/download",
            doc.CreatedBy,
            doc.Notes,
            doc.CustomValuesJson
        );
}

public class UploadDocumentRequest
{
    [FromForm(Name = "file")]
    public IFormFile? File { get; set; }
    [FromForm(Name = "type")]
    public string? Type { get; set; }
    [FromForm(Name = "linkedTo")]
    public string? LinkedTo { get; set; }
    [FromForm(Name = "createdBy")]
    public string? CreatedBy { get; set; }
    [FromForm(Name = "notes")]
    public string? Notes { get; set; }
    [FromForm(Name = "customValuesJson")]
    public string? CustomValuesJson { get; set; }
}
