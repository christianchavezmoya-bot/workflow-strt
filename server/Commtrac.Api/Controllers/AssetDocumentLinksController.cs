using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

/// <summary>
/// Manages the bridge between assets and library documents (max 3 per asset).
/// The library document (DocumentEntity) is the source of truth — detaching
/// a link does NOT delete the library document.
/// </summary>
[ApiController]
[Route("api/asset-document-links")]
[Authorize]
public class AssetDocumentLinksController : ControllerBase
{
    private const int MaxLinksPerAsset = 3;

    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;
    private readonly IDocumentSearchIndexQueue _searchIndexQueue;

    public AssetDocumentLinksController(AppDbContext db, IWebHostEnvironment env, IDocumentSearchIndexQueue searchIndexQueue)
    {
        _db = db;
        _env = env;
        _searchIndexQueue = searchIndexQueue;
    }

    // ── GET /by-asset/{assetId} ───────────────────────────────────────────────
    [HttpGet("by-asset/{assetId}")]
    public async Task<ActionResult<IEnumerable<AssetDocumentLinkDto>>> GetByAsset(string assetId)
    {
        var links = await _db.AssetDocumentLinks
            .Where(l => l.AssetId == assetId)
            .OrderBy(l => l.AttachedAt)
            .ToListAsync();

        var docIds = links.Select(l => l.DocumentId).ToList();
        var docs = await _db.Documents
            .Where(d => docIds.Contains(d.Id))
            .ToListAsync();

        var docMap = docs.ToDictionary(d => d.Id);

        // Auto-clean orphan links whose library document was deleted, so the
        // count check stays consistent and doesn't block future uploads.
        var orphans = links.Where(l => !docMap.ContainsKey(l.DocumentId)).ToList();
        if (orphans.Count > 0)
        {
            _db.AssetDocumentLinks.RemoveRange(orphans);
            await _db.SaveChangesAsync();
        }

        var result = links
            .Where(l => docMap.ContainsKey(l.DocumentId))
            .Select(l => ToDto(l, docMap[l.DocumentId]));

        return Ok(result);
    }

    /// <summary>
    /// GET /api/asset-document-links/counts?projectId=xxx
    /// GET /api/asset-document-links/counts?productId=xxx
    /// Returns { [assetId]: count } for non-orphan links — one query instead of N+1.
    /// </summary>
    [HttpGet("counts")]
    public async Task<ActionResult<Dictionary<string, int>>> GetCounts(
        [FromQuery] string? projectId,
        [FromQuery] string? productId)
    {
        if (string.IsNullOrWhiteSpace(projectId) && string.IsNullOrWhiteSpace(productId))
            return BadRequest("projectId or productId is required");

        IQueryable<string> assetIdsQuery = _db.ProjectAssets.AsNoTracking().Select(a => a.Id);
        if (!string.IsNullOrWhiteSpace(projectId))
            assetIdsQuery = _db.ProjectAssets.AsNoTracking().Where(a => a.ProjectId == projectId).Select(a => a.Id);
        else if (!string.IsNullOrWhiteSpace(productId))
            assetIdsQuery = _db.ProjectAssets.AsNoTracking().Where(a => a.ProductId == productId).Select(a => a.Id);

        var assetIds = await assetIdsQuery.ToListAsync();
        if (assetIds.Count == 0) return Ok(new Dictionary<string, int>());

        var counts = await _db.AssetDocumentLinks
            .AsNoTracking()
            .Where(l => assetIds.Contains(l.AssetId) && _db.Documents.Any(d => d.Id == l.DocumentId))
            .GroupBy(l => l.AssetId)
            .Select(g => new { AssetId = g.Key, Count = g.Count() })
            .ToListAsync();

        return Ok(counts.ToDictionary(c => c.AssetId, c => c.Count));
    }

    // ── POST / — attach existing library document ──────────────────────────────
    [HttpPost]
    public async Task<ActionResult<AssetDocumentLinkDto>> Attach([FromBody] CreateAssetDocumentLinkRequest request)
    {
        // Count only non-orphan links (library document must still exist).
        var count = await _db.AssetDocumentLinks
            .Where(l => l.AssetId == request.AssetId && _db.Documents.Any(d => d.Id == l.DocumentId))
            .CountAsync();
        if (count >= MaxLinksPerAsset)
            return BadRequest($"Maximum {MaxLinksPerAsset} documents per asset.");

        // Guard against duplicate links (same doc already attached to this asset)
        var existing = await _db.AssetDocumentLinks
            .FirstOrDefaultAsync(l => l.AssetId == request.AssetId && l.DocumentId == request.DocumentId);
        if (existing is not null)
            return Conflict("This document is already attached to this asset.");

        var doc = await _db.Documents.FirstOrDefaultAsync(d => d.Id == request.DocumentId);
        if (doc is null)
            return NotFound("Library document not found.");

        var link = new AssetDocumentLinkEntity
        {
            AssetId    = request.AssetId,
            DocumentId = request.DocumentId,
            AttachedBy = User.Identity?.Name ?? request.AttachedBy,
        };

        _db.AssetDocumentLinks.Add(link);
        await _db.SaveChangesAsync();
        _searchIndexQueue.EnqueueLibraryDocument(doc.Id);

        return CreatedAtAction(nameof(GetByAsset), new { assetId = link.AssetId }, ToDto(link, doc));
    }

    // ── POST /upload — upload new file → library doc + link (one atomic step) ─
    [HttpPost("upload")]
    [RequestSizeLimit(50_000_000)]
    public async Task<ActionResult<AssetDocumentLinkDto>> UploadAndLink([FromForm] UploadAndLinkRequest request)
    {
        if (request.File is null || request.File.Length == 0)
            return BadRequest("File is required.");

        // Count only non-orphan links (library document must still exist).
        var count = await _db.AssetDocumentLinks
            .Where(l => l.AssetId == request.AssetId && _db.Documents.Any(d => d.Id == l.DocumentId))
            .CountAsync();
        if (count >= MaxLinksPerAsset)
            return BadRequest($"Maximum {MaxLinksPerAsset} documents per asset.");

        // Store the file in the global library storage
        var storageRoot = Path.Combine(_env.ContentRootPath, "Storage", "Documents");
        Directory.CreateDirectory(storageRoot);

        var extension  = Path.GetExtension(request.File.FileName);
        var storedName = $"{Guid.NewGuid()}{extension}";
        var storedPath = Path.Combine(storageRoot, storedName);

        await using (var stream = System.IO.File.Create(storedPath))
        {
            await request.File.CopyToAsync(stream);
        }

        // Create the library document record
        var doc = new DocumentEntity
        {
            Name          = request.Name ?? request.File.FileName,
            Type          = request.Type ?? string.Empty,
            LinkedTo      = request.LinkedTo ?? string.Empty,
            UploadedAt    = DateTime.UtcNow.ToString("s"),
            FilePath      = Path.Combine("Storage", "Documents", storedName),
            ContentType   = request.File.ContentType,
            FileSize      = request.File.Length,
            CreatedBy        = User.Identity?.Name ?? request.AttachedBy,
            Notes            = request.Notes,
            CustomValuesJson = request.CustomValuesJson,
        };

        _db.Documents.Add(doc);

        // Create the link
        var link = new AssetDocumentLinkEntity
        {
            AssetId    = request.AssetId,
            DocumentId = doc.Id,
            AttachedBy = User.Identity?.Name ?? request.AttachedBy,
        };

        _db.AssetDocumentLinks.Add(link);
        await _db.SaveChangesAsync();
        _searchIndexQueue.EnqueueLibraryDocument(doc.Id);

        return CreatedAtAction(nameof(GetByAsset), new { assetId = link.AssetId }, ToDto(link, doc));
    }

    // ── DELETE /{id} — detach only (library document is NOT deleted) ──────────
    [HttpDelete("{id}")]
    public async Task<IActionResult> Detach(string id)
    {
        var link = await _db.AssetDocumentLinks.FirstOrDefaultAsync(l => l.Id == id);
        if (link is null) return NotFound();

        _db.AssetDocumentLinks.Remove(link);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ─── Mapping ──────────────────────────────────────────────────────────────

    private AssetDocumentLinkDto ToDto(AssetDocumentLinkEntity link, DocumentEntity doc)
        => new(
            link.Id,
            link.AssetId,
            link.DocumentId,
            link.AttachedBy,
            link.AttachedAt,
            ToDocDto(doc)
        );

    private DocumentDto ToDocDto(DocumentEntity doc)
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
                : $"{Request.Scheme}://{Request.Host}/api/documents/{doc.Id}/download",
            doc.CreatedBy,
            doc.Notes,
            doc.CustomValuesJson
        );
}

public class UploadAndLinkRequest
{
    [FromForm(Name = "assetId")]
    public string AssetId { get; set; } = string.Empty;

    [FromForm(Name = "file")]
    public IFormFile? File { get; set; }

    [FromForm(Name = "type")]
    public string? Type { get; set; }

    [FromForm(Name = "name")]
    public string? Name { get; set; }

    [FromForm(Name = "linkedTo")]
    public string? LinkedTo { get; set; }

    [FromForm(Name = "notes")]
    public string? Notes { get; set; }

    [FromForm(Name = "attachedBy")]
    public string? AttachedBy { get; set; }

    [FromForm(Name = "customValuesJson")]
    public string? CustomValuesJson { get; set; }
}
