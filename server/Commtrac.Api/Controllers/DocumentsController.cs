using System.Text.Json;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Commtrac.Api.Services.Storage;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/documents")]
[Authorize]
public class DocumentsController : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly HashSet<string> DocumentManagers = new(StringComparer.OrdinalIgnoreCase)
    {
        "Admin",
        "Project Manager"
    };
    private readonly AppDbContext _db;
    private readonly IFileStorageService _files;
    private readonly IDocumentSearchIndexQueue _searchIndexQueue;

    public DocumentsController(AppDbContext db, IFileStorageService files, IDocumentSearchIndexQueue searchIndexQueue)
    {
        _db = db;
        _files = files;
        _searchIndexQueue = searchIndexQueue;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<DocumentDto>>> GetAll([FromQuery] bool includeDeleted = false)
    {
        var docsQuery = includeDeleted ? _db.Documents.IgnoreQueryFilters() : _db.Documents;
        var docs = await docsQuery.OrderByDescending(d => d.UploadedAt).ToListAsync();
        return Ok(docs.Select(doc => ToDto(doc, Request)));
    }

    [HttpPost]
    public async Task<ActionResult<DocumentDto>> Create([FromBody] DocumentDto request)
    {
        if (!await CanUploadDocumentsAsync())
        {
            return Forbid();
        }

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
    [RequestSizeLimit(50_000_000)]
    public async Task<ActionResult<DocumentDto>> Upload([FromForm] UploadDocumentRequest request)
    {
        if (!await CanUploadDocumentsAsync())
        {
            return Forbid();
        }

        if (request.File == null || request.File.Length == 0)
        {
            return BadRequest("File is required.");
        }

        var extension = Path.GetExtension(request.File.FileName);
        var storedName = $"{Guid.NewGuid()}{extension}";
        var relativePath = _files.BuildRelativePath("Storage", "Documents", storedName);

        await _files.SaveAsync(relativePath, request.File.OpenReadStream());

        var doc = new DocumentEntity
        {
            Name = request.File.FileName,
            Type = request.Type ?? string.Empty,
            LinkedTo = request.LinkedTo ?? string.Empty,
            UploadedAt = DateTime.UtcNow.ToString("s"),
            FilePath = relativePath,
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
    public async Task<IActionResult> Download(string id)
    {
        var doc = await _db.Documents.FirstOrDefaultAsync(d => d.Id == id);
        if (doc is null || string.IsNullOrWhiteSpace(doc.FilePath))
        {
            return NotFound();
        }

        var fullPath = _files.GetAbsolutePath(doc.FilePath);
        if (!_files.Exists(doc.FilePath))
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
    public async Task<IActionResult> Delete(string id)
    {
        if (!await CanDeleteDocumentsAsync())
        {
            return Forbid();
        }

        var doc = await _db.Documents.IgnoreQueryFilters().FirstOrDefaultAsync(d => d.Id == id);
        if (doc is null) return NotFound();
        if (doc.IsDeleted) return NoContent();

        doc.IsDeleted = true;
        doc.DeletedAtUtc = DateTime.UtcNow;
        doc.DeletedByUserId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{id}/restore")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Restore(string id)
    {
        var doc = await _db.Documents.IgnoreQueryFilters().FirstOrDefaultAsync(d => d.Id == id);
        if (doc is null) return NotFound();

        doc.IsDeleted = false;
        doc.DeletedAtUtc = null;
        doc.DeletedByUserId = null;
        doc.DeleteReason = null;
        await _db.SaveChangesAsync();
        _searchIndexQueue.EnqueueLibraryDocument(id);
        return NoContent();
    }

    [HttpDelete("{id}/purge")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Purge(string id)
    {
        if (!await CanDeleteDocumentsAsync())
        {
            return Forbid();
        }

        var doc = await _db.Documents.IgnoreQueryFilters().FirstOrDefaultAsync(d => d.Id == id);
        if (doc is null) return NotFound();

        if (!string.IsNullOrWhiteSpace(doc.FilePath))
        {
            _files.Delete(doc.FilePath);
        }

        _db.Documents.Remove(doc);
        await _db.SaveChangesAsync();
        _searchIndexQueue.RemoveLibraryDocument(id);
        return NoContent();
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<DocumentDto>> Update(string id, [FromBody] DocumentDto request)
    {
        if (!await CanUploadDocumentsAsync())
        {
            return Forbid();
        }

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

    private async Task<bool> CanUploadDocumentsAsync()
    {
        return await HasDocumentPermissionAsync((documents) => documents.Upload);
    }

    private async Task<bool> CanDeleteDocumentsAsync()
    {
        return await HasDocumentPermissionAsync((documents) => documents.Delete);
    }

    private async Task<bool> HasDocumentPermissionAsync(Func<DocumentsDomainPermissions, bool> selector)
    {
        var role = User.FindFirstValue(ClaimTypes.Role)?.Trim();
        if (string.IsNullOrWhiteSpace(role))
        {
            return false;
        }

        var config = await _db.RoleConfigs.AsNoTracking().FirstOrDefaultAsync();
        if (!string.IsNullOrWhiteSpace(config?.ConfigJson))
        {
            try
            {
                var roles = JsonSerializer.Deserialize<Dictionary<string, RolePermissions>>(config.ConfigJson, JsonOptions);
                if (roles != null)
                {
                    var matchedRole = roles.FirstOrDefault(entry => string.Equals(entry.Key, role, StringComparison.OrdinalIgnoreCase));
                    if (!string.IsNullOrWhiteSpace(matchedRole.Key))
                    {
                        return selector(ResolveDocumentPermissions(role, matchedRole.Value));
                    }
                }
            }
            catch
            {
                // Fall through to defaults if role config JSON cannot be parsed.
            }
        }

        return selector(GetDefaultDocumentPermissions(role));
    }

    private static DocumentsDomainPermissions ResolveDocumentPermissions(string role, RolePermissions permissions)
    {
        if (permissions.Domains?.Documents != null)
        {
            return permissions.Domains.Documents;
        }

        if (DocumentManagers.Contains(role))
        {
            return new DocumentsDomainPermissions(true, "all", true, true);
        }

        return new DocumentsDomainPermissions(true, "all", false, false);
    }

    private static DocumentsDomainPermissions GetDefaultDocumentPermissions(string role)
    {
        return DocumentManagers.Contains(role)
            ? new DocumentsDomainPermissions(true, "all", true, true)
            : new DocumentsDomainPermissions(true, "all", false, false);
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
            doc.CustomValuesJson,
            doc.IsDeleted,
            doc.DeletedAtUtc,
            doc.DeletedByUserId,
            doc.DeleteReason
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
