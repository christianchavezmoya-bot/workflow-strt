using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/inspection-imports")]
[Authorize]
public class InspectionImportsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;

    public InspectionImportsController(AppDbContext db, IWebHostEnvironment env)
    {
        _db = db;
        _env = env;
    }

    // GET /api/inspection-imports?projectId=&assetId=&status=
    [HttpGet]
    public async Task<ActionResult<List<InspectionImportDto>>> GetAll(
        [FromQuery] string? projectId,
        [FromQuery] string? assetId,
        [FromQuery] string? status)
    {
        var query = _db.InspectionImports.AsQueryable();

        if (!string.IsNullOrWhiteSpace(projectId))
            query = query.Where(x => x.ProjectId == projectId);

        if (!string.IsNullOrWhiteSpace(assetId))
            query = query.Where(x => x.AssetId == assetId);

        if (!string.IsNullOrWhiteSpace(status))
            query = query.Where(x => x.Status == status);

        var items = await query
            .OrderByDescending(x => x.ReceivedAt)
            .ToListAsync();

        return Ok(items.Select(ToDto).ToList());
    }

    // GET /api/inspection-imports/{id}
    [HttpGet("{id}")]
    public async Task<ActionResult<InspectionImportDto>> GetById(string id)
    {
        var item = await _db.InspectionImports.FirstOrDefaultAsync(x => x.Id == id);
        if (item is null) return NotFound();
        return Ok(ToDto(item));
    }

    // POST /api/inspection-imports  (JSON body — small payloads, browser/web)
    [HttpPost]
    public async Task<ActionResult<InspectionImportDto>> Create([FromBody] CreateInspectionImportRequest request)
    {
        string? hash = null;
        if (!string.IsNullOrWhiteSpace(request.RawJson))
        {
            var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(request.RawJson));
            hash = Convert.ToHexString(bytes).ToLowerInvariant();

            if (await _db.InspectionImports.AnyAsync(x => x.ContentHash == hash && x.ProjectId == request.ProjectId))
                return Conflict(new { error = "Duplicate import: identical content already received for this project." });
        }

        var entity = new InspectionImportEntity
        {
            Source = request.Source ?? "LOCAL",
            FileName = request.FileName,
            ContentHash = hash,
            RawJson = request.RawJson,
            ProjectId = request.ProjectId,
            AssetId = request.AssetId,
            Status = string.IsNullOrWhiteSpace(request.ProjectId) ? "RECEIVED" : "NEEDS_ASSIGNMENT",
            UploadedBy = request.UploadedBy
        };

        _db.InspectionImports.Add(entity);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = entity.Id }, ToDto(entity));
    }

    // POST /api/inspection-imports/upload  (multipart — large files, mobile/native)
    [HttpPost("upload")]
    [RequestSizeLimit(20 * 1024 * 1024)] // 20 MB
    public async Task<ActionResult<InspectionImportDto>> Upload(
        [FromForm] IFormFile file,
        [FromForm] string? projectId,
        [FromForm] string? assetId,
        [FromForm] string? source,
        [FromForm] string? uploadedBy)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { error = "No file received." });

        if (!file.FileName.EndsWith(".json", StringComparison.OrdinalIgnoreCase) &&
            file.ContentType != "application/json" &&
            file.ContentType != "text/plain")
        {
            return BadRequest(new { error = "Only JSON files are accepted." });
        }

        // Compute hash to deduplicate
        string hash;
        string rawJson;
        using (var ms = new MemoryStream())
        {
            await file.CopyToAsync(ms);
            var rawBytes = ms.ToArray();
            hash = Convert.ToHexString(SHA256.HashData(rawBytes)).ToLowerInvariant();
            rawJson = Encoding.UTF8.GetString(rawBytes);
        }

        if (await _db.InspectionImports.AnyAsync(x => x.ContentHash == hash && x.ProjectId == projectId))
            return Conflict(new { error = "Duplicate import: identical content already received for this project." });

        // Save to disk when file is > 128 KB; store inline for smaller payloads
        string? rawPath = null;
        string? inlineJson = null;
        const int inlineThreshold = 128 * 1024;

        if (rawJson.Length > inlineThreshold)
        {
            var storageDir = Path.Combine(_env.ContentRootPath, "Storage", "InspectionImports");
            Directory.CreateDirectory(storageDir);
            var storedName = $"{Guid.NewGuid()}.json";
            rawPath = Path.Combine("Storage", "InspectionImports", storedName);
            var fullPath = Path.Combine(_env.ContentRootPath, rawPath);
            await System.IO.File.WriteAllTextAsync(fullPath, rawJson);
        }
        else
        {
            inlineJson = rawJson;
        }

        var entity = new InspectionImportEntity
        {
            Source = source ?? "LOCAL",
            FileName = file.FileName,
            ContentHash = hash,
            RawJson = inlineJson,
            RawPath = rawPath,
            ProjectId = projectId,
            AssetId = assetId,
            Status = string.IsNullOrWhiteSpace(projectId) ? "RECEIVED" : "NEEDS_ASSIGNMENT",
            UploadedBy = uploadedBy
        };

        _db.InspectionImports.Add(entity);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = entity.Id }, ToDto(entity));
    }

    // GET /api/inspection-imports/{id}/raw  — stream the raw JSON file from disk
    [HttpGet("{id}/raw")]
    public async Task<IActionResult> GetRaw(string id)
    {
        var item = await _db.InspectionImports.FirstOrDefaultAsync(x => x.Id == id);
        if (item is null) return NotFound();

        if (!string.IsNullOrWhiteSpace(item.RawJson))
            return Content(item.RawJson, "application/json");

        if (!string.IsNullOrWhiteSpace(item.RawPath))
        {
            var fullPath = Path.Combine(_env.ContentRootPath, item.RawPath);
            if (!System.IO.File.Exists(fullPath))
                return NotFound(new { error = "Stored file not found on disk." });

            var content = await System.IO.File.ReadAllTextAsync(fullPath);
            return Content(content, "application/json");
        }

        return NotFound(new { error = "No raw content stored." });
    }

    // POST /api/inspection-imports/{id}/assign
    [HttpPost("{id}/assign")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<InspectionImportDto>> Assign(string id, [FromBody] AssignInspectionImportRequest request)
    {
        var item = await _db.InspectionImports.FirstOrDefaultAsync(x => x.Id == id);
        if (item is null) return NotFound();

        if (string.IsNullOrWhiteSpace(request.ProjectId))
            return BadRequest(new { error = "ProjectId is required." });

        item.ProjectId = request.ProjectId;
        item.AssetId = request.AssetId;
        item.Status = string.IsNullOrWhiteSpace(request.AssetId) ? "NEEDS_ASSIGNMENT" : "MAPPED";
        await _db.SaveChangesAsync();

        return Ok(ToDto(item));
    }

    // PATCH /api/inspection-imports/{id}/fail
    [HttpPatch("{id}/fail")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<InspectionImportDto>> MarkFailed(string id, [FromBody] MarkImportFailedRequest request)
    {
        var item = await _db.InspectionImports.FirstOrDefaultAsync(x => x.Id == id);
        if (item is null) return NotFound();

        item.Status = "FAILED";
        item.ErrorText = request.ErrorText;
        await _db.SaveChangesAsync();

        return Ok(ToDto(item));
    }

    // DELETE /api/inspection-imports/{id}
    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Delete(string id)
    {
        var item = await _db.InspectionImports.FirstOrDefaultAsync(x => x.Id == id);
        if (item is null) return NotFound();

        // Remove stored file from disk if present
        if (!string.IsNullOrWhiteSpace(item.RawPath))
        {
            var fullPath = Path.Combine(_env.ContentRootPath, item.RawPath);
            if (System.IO.File.Exists(fullPath))
                System.IO.File.Delete(fullPath);
        }

        _db.InspectionImports.Remove(item);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static InspectionImportDto ToDto(InspectionImportEntity e) => new(
        e.Id,
        e.Source,
        e.ReceivedAt,
        e.FileName,
        e.ContentHash,
        // Return inline JSON only; large files should be fetched via GET /{id}/raw
        e.RawPath == null ? e.RawJson : null,
        e.ProjectId,
        e.AssetId,
        e.Status,
        e.ErrorText,
        e.MappedRunId,
        e.UploadedBy
    );
}

public record MarkImportFailedRequest(string? ErrorText);
