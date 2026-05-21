using System.Security.Claims;
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
    private readonly IDocumentAuthorizationService _documentAuthorization;

    public DocumentsController(
        AppDbContext db,
        IWebHostEnvironment env,
        IDocumentSearchIndexQueue searchIndexQueue,
        AuditLogService audit,
        IDocumentAuthorizationService documentAuthorization)
    {
        _db = db;
        _env = env;
        _searchIndexQueue = searchIndexQueue;
        _audit = audit;
        _documentAuthorization = documentAuthorization;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<DocumentDto>>> GetAll()
    {
        var docs = await _db.Documents.OrderByDescending(d => d.UploadedAt).ToListAsync();
        var visible = new List<DocumentDto>(docs.Count);
        foreach (var doc in docs)
        {
            if (await _documentAuthorization.CanViewDocumentAsync(User, doc))
            {
                visible.Add(ToDto(doc, Request));
            }
        }

        return Ok(visible);
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<DocumentDto>> Create([FromBody] DocumentDto request)
    {
        var ownership = await _documentAuthorization.ResolveOwnershipAsync(request.ProjectId, request.AssetId, request.LinkedTo);
        if (!await CanCreateOrUpdateForOwnershipAsync(request.VisibilityScope, ownership.ProjectId, ownership.AssetId))
        {
            return Forbid();
        }

        var doc = new DocumentEntity
        {
            Id = string.IsNullOrWhiteSpace(request.Id) ? Guid.NewGuid().ToString() : request.Id,
            VisibilityScope = ResolveVisibilityScope(request.VisibilityScope, ownership.ProjectId, ownership.AssetId, false),
            ProjectId = ownership.ProjectId,
            AssetId = ownership.AssetId,
            Name = request.Name,
            Type = request.Type,
            LinkedTo = request.LinkedTo,
            UploadedAt = request.UploadedAt,
            ContentType = request.ContentType,
            FileSize = request.FileSize,
            DownloadUrl = request.DownloadUrl,
            CreatedBy = User.Identity?.Name ?? request.CreatedBy,
            CreatedByUserId = GetCurrentUserId(),
            Notes = request.Notes,
            CustomValuesJson = request.CustomValuesJson,
            IsLegacyUnclassified = false
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

        var ownership = await _documentAuthorization.ResolveOwnershipAsync(request.ProjectId, request.AssetId, request.LinkedTo);
        if (!await CanCreateOrUpdateForOwnershipAsync(request.VisibilityScope, ownership.ProjectId, ownership.AssetId))
        {
            return Forbid();
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
            VisibilityScope = ResolveVisibilityScope(request.VisibilityScope, ownership.ProjectId, ownership.AssetId, false),
            ProjectId = ownership.ProjectId,
            AssetId = ownership.AssetId,
            Name = request.File.FileName,
            Type = request.Type ?? string.Empty,
            LinkedTo = request.LinkedTo ?? string.Empty,
            UploadedAt = DateTime.UtcNow.ToString("s"),
            FilePath = Path.Combine("Storage", "Documents", storedName),
            ContentType = request.File.ContentType,
            FileSize = request.File.Length,
            CreatedBy = User.Identity?.Name ?? request.CreatedBy,
            CreatedByUserId = GetCurrentUserId(),
            Notes = request.Notes,
            CustomValuesJson = request.CustomValuesJson,
            IsLegacyUnclassified = false
        };

        _db.Documents.Add(doc);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetAll), new { id = doc.Id }, ToDto(doc, Request));
    }

    [HttpGet("{id}/download")]
    public async Task<IActionResult> Download(string id)
    {
        var doc = await _db.Documents.FirstOrDefaultAsync(d => d.Id == id);
        if (doc is null || string.IsNullOrWhiteSpace(doc.FilePath) || !await _documentAuthorization.CanViewDocumentAsync(User, doc))
        {
            return NotFound();
        }

        var fullPath = Path.Combine(_env.ContentRootPath, doc.FilePath);
        if (!System.IO.File.Exists(fullPath))
        {
            return NotFound();
        }

        var contentType = string.IsNullOrWhiteSpace(doc.ContentType) ? "application/octet-stream" : doc.ContentType;
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
        if (!await _documentAuthorization.CanEditDocumentAsync(User, doc)) return Forbid();

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
        if (!await _documentAuthorization.CanEditDocumentAsync(User, doc)) return Forbid();

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

        if (!await _documentAuthorization.CanEditDocumentAsync(User, doc))
        {
            return Forbid();
        }

        var ownership = await _documentAuthorization.ResolveOwnershipAsync(request.ProjectId ?? doc.ProjectId, request.AssetId ?? doc.AssetId, request.LinkedTo);
        var visibilityScope = ResolveVisibilityScope(request.VisibilityScope, ownership.ProjectId, ownership.AssetId, false);
        if (!await CanCreateOrUpdateForOwnershipAsync(visibilityScope, ownership.ProjectId, ownership.AssetId))
        {
            return Forbid();
        }

        doc.VisibilityScope = visibilityScope;
        doc.ProjectId = ownership.ProjectId;
        doc.AssetId = ownership.AssetId;
        doc.Name = request.Name;
        doc.Type = request.Type;
        doc.LinkedTo = request.LinkedTo;
        doc.UploadedAt = request.UploadedAt;
        doc.ContentType = request.ContentType;
        doc.FileSize = request.FileSize;
        if (string.IsNullOrWhiteSpace(doc.CreatedBy))
            doc.CreatedBy = User.Identity?.Name ?? request.CreatedBy;
        if (string.IsNullOrWhiteSpace(doc.CreatedByUserId))
            doc.CreatedByUserId = GetCurrentUserId();
        doc.Notes = request.Notes;
        doc.CustomValuesJson = request.CustomValuesJson;
        doc.IsLegacyUnclassified = false;
        if (string.IsNullOrWhiteSpace(doc.FilePath))
            doc.DownloadUrl = request.DownloadUrl;

        await _db.SaveChangesAsync();
        return Ok(ToDto(doc, Request));
    }

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

    private async Task<bool> CanCreateOrUpdateForOwnershipAsync(string? visibilityScope, string? projectId, string? assetId)
    {
        if (!string.IsNullOrWhiteSpace(projectId))
        {
            return await _documentAuthorization.CanEditDocumentAsync(User, new DocumentEntity
            {
                VisibilityScope = ResolveVisibilityScope(visibilityScope, projectId, assetId, false),
                ProjectId = projectId,
                AssetId = assetId,
                CreatedByUserId = GetCurrentUserId(),
                IsLegacyUnclassified = false
            });
        }

        var role = User.FindFirstValue(ClaimTypes.Role) ?? User.FindFirst("role")?.Value;
        if (string.Equals(ResolveVisibilityScope(visibilityScope, projectId, assetId, false), "Global", StringComparison.OrdinalIgnoreCase))
        {
            return User.IsInRole("Admin")
                || string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase)
                || string.Equals(role, "Project Manager", StringComparison.OrdinalIgnoreCase);
        }

        return User.IsInRole("Admin")
            || string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase);
    }

    private string? GetCurrentUserId() =>
        User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirst("sub")?.Value
        ?? User.FindFirst("nameid")?.Value;

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
                ? doc.DownloadUrl
                : $"{request.Scheme}://{request.Host}/api/documents/{doc.Id}/download",
            doc.CreatedBy,
            doc.Notes,
            doc.CustomValuesJson,
            doc.VisibilityScope,
            doc.ProjectId,
            doc.AssetId,
            doc.CreatedByUserId,
            doc.IsLegacyUnclassified
        );

    private static string ResolveVisibilityScope(string? requestedScope, string? projectId, string? assetId, bool isLegacyUnclassified)
    {
        if (isLegacyUnclassified)
        {
            return "Legacy";
        }

        if (!string.IsNullOrWhiteSpace(assetId))
        {
            return "Asset";
        }

        if (!string.IsNullOrWhiteSpace(projectId))
        {
            return "Project";
        }

        return string.Equals(requestedScope, "Global", StringComparison.OrdinalIgnoreCase)
            ? "Global"
            : "Global";
    }
}

public class UploadDocumentRequest
{
    [FromForm(Name = "file")]
    public IFormFile? File { get; set; }
    [FromForm(Name = "type")]
    public string? Type { get; set; }
    [FromForm(Name = "visibilityScope")]
    public string? VisibilityScope { get; set; }
    [FromForm(Name = "projectId")]
    public string? ProjectId { get; set; }
    [FromForm(Name = "assetId")]
    public string? AssetId { get; set; }
    [FromForm(Name = "linkedTo")]
    public string? LinkedTo { get; set; }
    [FromForm(Name = "createdBy")]
    public string? CreatedBy { get; set; }
    [FromForm(Name = "notes")]
    public string? Notes { get; set; }
    [FromForm(Name = "customValuesJson")]
    public string? CustomValuesJson { get; set; }
}
