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

    public InspectionImportsController(AppDbContext db)
    {
        _db = db;
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

    // POST /api/inspection-imports
    [HttpPost]
    public async Task<ActionResult<InspectionImportDto>> Create([FromBody] CreateInspectionImportRequest request)
    {
        string? hash = null;
        if (!string.IsNullOrWhiteSpace(request.RawJson))
        {
            var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(request.RawJson));
            hash = Convert.ToHexString(bytes).ToLowerInvariant();

            // Deduplicate by hash within the same project
            if (await _db.InspectionImports.AnyAsync(x => x.ContentHash == hash && x.ProjectId == request.ProjectId))
                return Conflict(new { error = "Duplicate import: identical content already received for this project." });
        }

        var status = (string.IsNullOrWhiteSpace(request.ProjectId)) ? "RECEIVED" : "NEEDS_ASSIGNMENT";

        var entity = new InspectionImportEntity
        {
            Source = request.Source ?? "LOCAL",
            FileName = request.FileName,
            ContentHash = hash,
            RawJson = request.RawJson,
            ProjectId = request.ProjectId,
            AssetId = request.AssetId,
            Status = status,
            UploadedBy = request.UploadedBy
        };

        _db.InspectionImports.Add(entity);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = entity.Id }, ToDto(entity));
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
        item.Status = "MAPPED";
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
        e.RawJson,
        e.ProjectId,
        e.AssetId,
        e.Status,
        e.ErrorText,
        e.MappedRunId,
        e.UploadedBy
    );
}

public record MarkImportFailedRequest(string? ErrorText);
