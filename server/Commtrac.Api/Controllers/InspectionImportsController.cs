using System.Security.Cryptography;
using System.Text;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api")]
[Authorize]
public class InspectionImportsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IAccessScopeService _accessScope;
    private readonly IProjectAuthorizationService _projectAuthorization;

    public InspectionImportsController(
        AppDbContext db,
        IAccessScopeService accessScope,
        IProjectAuthorizationService projectAuthorization)
    {
        _db = db;
        _accessScope = accessScope;
        _projectAuthorization = projectAuthorization;
    }

    [HttpPost("inspection-imports")]
    public async Task<ActionResult<InspectionImportDto>> Create([FromBody] CreateInspectionImportRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.RawJson))
        {
            return BadRequest(new { message = "RawJson is required." });
        }

        if (!string.IsNullOrWhiteSpace(request.ProjectId) && !await _accessScope.CanViewProjectAsync(User, request.ProjectId))
        {
            return NotFound();
        }

        ProjectAssetEntity? asset = null;
        if (!string.IsNullOrWhiteSpace(request.ProjectAssetId))
        {
            asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == request.ProjectAssetId);
            if (asset is null)
            {
                return BadRequest(new { message = "Project asset not found." });
            }
        }

        var resolvedProjectId = request.ProjectId ?? asset?.ProjectId;
        var status = !string.IsNullOrWhiteSpace(resolvedProjectId) && asset is not null
            ? InspectionImportEntity.StatusReceived
            : InspectionImportEntity.StatusNeedsAssignment;

        var entity = new InspectionImportEntity
        {
            Id = Guid.NewGuid().ToString(),
            Source = string.IsNullOrWhiteSpace(request.Source) ? "manual" : request.Source.Trim(),
            ReceivedAt = DateTime.UtcNow,
            RawJson = request.RawJson,
            Hash = ComputeSha256(request.RawJson),
            ProjectId = resolvedProjectId,
            ProjectAssetId = asset?.Id,
            Status = status,
        };

        _db.InspectionImports.Add(entity);
        await _db.SaveChangesAsync();
        return Ok(ToDto(entity));
    }

    [HttpGet("projects/{projectId}/inspection-imports")]
    public async Task<ActionResult<IEnumerable<InspectionImportDto>>> ListByProject(
        string projectId,
        [FromQuery] string? status = null,
        [FromQuery] string? assetId = null)
    {
        if (!await _accessScope.CanViewProjectAsync(User, projectId))
        {
            return NotFound();
        }

        var query = _db.InspectionImports
            .Where(i => i.ProjectId == projectId);

        if (!string.IsNullOrWhiteSpace(status))
        {
            query = query.Where(i => i.Status == status);
        }

        if (!string.IsNullOrWhiteSpace(assetId))
        {
            query = query.Where(i => i.ProjectAssetId == assetId);
        }

        var items = await query
            .OrderByDescending(i => i.ReceivedAt)
            .ToListAsync();

        return Ok(items.Select(ToDto));
    }

    [HttpPost("inspection-imports/{id}/assign")]
    [Authorize(Roles = "Admin,Project Manager,Engineer")]
    public async Task<ActionResult<InspectionImportDto>> Assign(string id, [FromBody] AssignInspectionImportRequest request)
    {
        var entity = await _db.InspectionImports.FirstOrDefaultAsync(i => i.Id == id);
        if (entity is null)
        {
            return NotFound();
        }

        if (!await _projectAuthorization.CanEditProjectAsync(User, request.ProjectId))
        {
            return Forbid();
        }

        var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == request.ProjectAssetId);
        if (asset is null || asset.ProjectId != request.ProjectId)
        {
            return BadRequest(new { message = "Project asset does not belong to the specified project." });
        }

        entity.ProjectId = request.ProjectId;
        entity.ProjectAssetId = request.ProjectAssetId;
        entity.Status = InspectionImportEntity.StatusReceived;
        entity.Error = null;

        await _db.SaveChangesAsync();
        return Ok(ToDto(entity));
    }

    private static InspectionImportDto ToDto(InspectionImportEntity entity) => new(
        entity.Id,
        entity.Source,
        entity.ReceivedAt,
        entity.RawJson,
        entity.Hash,
        entity.ProjectId,
        entity.ProjectAssetId,
        entity.Status,
        entity.Error,
        entity.MappedRunId
    );

    private static string ComputeSha256(string rawJson)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(rawJson));
        return Convert.ToHexString(bytes);
    }
}
