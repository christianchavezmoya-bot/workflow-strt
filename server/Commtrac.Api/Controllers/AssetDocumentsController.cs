using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/asset-documents")]
[Authorize]
public class AssetDocumentsController : ControllerBase
{
    private const int MaxDocsPerAsset = 3;
    private readonly AppDbContext _db;
    private readonly IDocumentSearchIndexQueue _searchIndexQueue;

    public AssetDocumentsController(AppDbContext db, IDocumentSearchIndexQueue searchIndexQueue)
    {
        _db = db;
        _searchIndexQueue = searchIndexQueue;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private string StorageRoot =>
        Path.Combine(Directory.GetCurrentDirectory(), "Storage", "Documents");

    private string AssetDir(string assetId) =>
        Path.Combine(StorageRoot, assetId);

    private static AssetDocumentRevisionDto ToRevDto(AssetDocumentRevisionEntity r) => new(
        r.Id, r.RevisionNumber, r.OriginalName,
        r.MimeType, r.FileSizeBytes, r.UploadedBy, r.UploadedAt
    );

    private async Task<AssetDocumentDto> ToDocDto(AssetDocumentEntity doc)
    {
        var revisions = await _db.AssetDocumentRevisions
            .Where(r => r.DocumentId == doc.Id)
            .OrderByDescending(r => r.RevisionNumber)
            .ToListAsync();

        var current = revisions.FirstOrDefault();
        return new AssetDocumentDto(
            doc.Id, doc.AssetId, doc.Label, doc.CreatedBy, doc.CreatedAt,
            current is null ? null : ToRevDto(current),
            revisions.Select(ToRevDto)
        );
    }

    // ── GET /by-asset/{assetId} ───────────────────────────────────────────────
    [HttpGet("by-asset/{assetId}")]
    public async Task<IActionResult> ListByAsset(string assetId)
    {
        var docs = await _db.AssetDocuments
            .Where(d => d.AssetId == assetId)
            .OrderBy(d => d.CreatedAt)
            .ToListAsync();

        var dtos = new List<AssetDocumentDto>();
        foreach (var doc in docs)
            dtos.Add(await ToDocDto(doc));

        return Ok(dtos);
    }

    // ── POST / — upload new document slot ────────────────────────────────────
    [HttpPost]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> Upload(
        [FromForm] string assetId,
        [FromForm] string label,
        [FromForm] string? uploadedBy,
        IFormFile file)
    {
        // Enforce cap
        var existing = await _db.AssetDocuments.CountAsync(d => d.AssetId == assetId);
        if (existing >= MaxDocsPerAsset)
            return BadRequest($"Maximum {MaxDocsPerAsset} documents per asset.");

        // Persist document record
        var doc = new AssetDocumentEntity
        {
            AssetId   = assetId,
            Label     = label,
            CreatedBy = uploadedBy,
        };
        _db.AssetDocuments.Add(doc);

        // Persist first revision
        var rev = await SaveRevisionFile(doc.Id, assetId, file, 1, uploadedBy);
        _db.AssetDocumentRevisions.Add(rev);

        await _db.SaveChangesAsync();
        _searchIndexQueue.EnqueueAssetDocument(doc.Id);
        return CreatedAtAction(nameof(ListByAsset), new { assetId }, await ToDocDto(doc));
    }

    // ── POST /{id}/revisions — replace with new revision ─────────────────────
    [HttpPost("{id}/revisions")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> AddRevision(
        string id,
        [FromForm] string? uploadedBy,
        IFormFile file)
    {
        var doc = await _db.AssetDocuments.FindAsync(id);
        if (doc is null) return NotFound();

        var nextRevNum = await _db.AssetDocumentRevisions
            .Where(r => r.DocumentId == id)
            .MaxAsync(r => (int?)r.RevisionNumber) ?? 0;
        nextRevNum++;

        var rev = await SaveRevisionFile(doc.Id, doc.AssetId, file, nextRevNum, uploadedBy);
        _db.AssetDocumentRevisions.Add(rev);
        await _db.SaveChangesAsync();
        _searchIndexQueue.EnqueueAssetDocument(doc.Id);

        return Ok(await ToDocDto(doc));
    }

    // ── GET /{id}/download — stream latest revision ───────────────────────────
    [HttpGet("{id}/download")]
    public async Task<IActionResult> Download(string id)
    {
        var rev = await _db.AssetDocumentRevisions
            .Where(r => r.DocumentId == id)
            .OrderByDescending(r => r.RevisionNumber)
            .FirstOrDefaultAsync();

        if (rev is null) return NotFound();
        return ServeFile(rev);
    }

    // ── GET /{id}/revisions/{revId}/download — stream specific revision ───────
    [HttpGet("{id}/revisions/{revId}/download")]
    public async Task<IActionResult> DownloadRevision(string id, string revId)
    {
        var rev = await _db.AssetDocumentRevisions
            .FirstOrDefaultAsync(r => r.DocumentId == id && r.Id == revId);

        if (rev is null) return NotFound();
        return ServeFile(rev);
    }

    // ── PATCH /{id} — relabel ─────────────────────────────────────────────────
    [HttpPatch("{id}")]
    public async Task<IActionResult> PatchLabel(string id, [FromBody] PatchDocumentLabelRequest req)
    {
        var doc = await _db.AssetDocuments.FindAsync(id);
        if (doc is null) return NotFound();

        doc.Label = req.Label;
        await _db.SaveChangesAsync();
        return Ok(await ToDocDto(doc));
    }

    // ── DELETE /{id} — remove all revisions + record ─────────────────────────
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        var doc = await _db.AssetDocuments.FindAsync(id);
        if (doc is null) return NotFound();

        var revisions = await _db.AssetDocumentRevisions
            .Where(r => r.DocumentId == id)
            .ToListAsync();

        // Delete files from disk
        foreach (var rev in revisions)
        {
            var path = Path.Combine(AssetDir(doc.AssetId), rev.StoredName);
            if (System.IO.File.Exists(path))
                System.IO.File.Delete(path);
        }

        _db.AssetDocumentRevisions.RemoveRange(revisions);
        _db.AssetDocuments.Remove(doc);
        await _db.SaveChangesAsync();
        _searchIndexQueue.RemoveAssetDocument(id);
        return NoContent();
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private async Task<AssetDocumentRevisionEntity> SaveRevisionFile(
        string documentId, string assetId, IFormFile file,
        int revisionNumber, string? uploadedBy)
    {
        var revId = Guid.NewGuid().ToString();
        var safeOriginal = Path.GetFileName(file.FileName)
            .Replace(" ", "_")
            .Replace("/", "_")
            .Replace("\\", "_");
        var storedName = $"{revId}_{safeOriginal}";

        var dir = AssetDir(assetId);
        Directory.CreateDirectory(dir);

        var filePath = Path.Combine(dir, storedName);
        await using var stream = new FileStream(filePath, FileMode.Create);
        await file.CopyToAsync(stream);

        return new AssetDocumentRevisionEntity
        {
            Id             = revId,
            DocumentId     = documentId,
            RevisionNumber = revisionNumber,
            OriginalName   = file.FileName,
            StoredName     = storedName,
            MimeType       = file.ContentType,
            FileSizeBytes  = file.Length,
            UploadedBy     = uploadedBy,
        };
    }

    private IActionResult ServeFile(AssetDocumentRevisionEntity rev)
    {
        var doc = _db.AssetDocuments.Find(rev.DocumentId);
        if (doc is null) return NotFound();

        var path = Path.Combine(AssetDir(doc.AssetId), rev.StoredName);
        if (!System.IO.File.Exists(path)) return NotFound("File not found on disk.");

        var stream = new FileStream(path, FileMode.Open, FileAccess.Read);
        return File(stream, rev.MimeType, rev.OriginalName);
    }
}
