using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/project-assets")]
[Authorize]
public class ProjectAssetsController : ControllerBase
{
    private readonly AppDbContext _db;

    public ProjectAssetsController(AppDbContext db)
    {
        _db = db;
    }

    // GET api/project-assets/workload-summary
    [HttpGet("workload-summary")]
    public async Task<ActionResult<IEnumerable<WorkloadSummaryDto>>> WorkloadSummary()
    {
        var assets = await _db.ProjectAssets
            .Where(a => a.AssignedUserId != null && a.AssignedUserId != ""
                     && (a.Status == "NotStarted" || a.Status == "InProgress"))
            .ToListAsync();

        var userIds = assets.Select(a => a.AssignedUserId!).Distinct().ToList();
        var users = await _db.Users
            .Where(u => userIds.Contains(u.Id))
            .Select(u => new { u.Id, u.FullName })
            .ToDictionaryAsync(u => u.Id, u => u.FullName);

        var summary = assets
            .GroupBy(a => a.AssignedUserId!)
            .Select(g => new WorkloadSummaryDto(
                g.Key,
                users.TryGetValue(g.Key, out var name) ? name : "Unknown",
                g.Count(a => a.Status == "NotStarted"),
                g.Count(a => a.Status == "InProgress"),
                g.Count()))
            .OrderByDescending(w => w.TotalAssigned)
            .ToList();

        return Ok(summary);
    }

    // GET api/project-assets/by-project/{projectId}
    [HttpGet("by-project/{projectId}")]
    public async Task<ActionResult<IEnumerable<ProjectAssetDto>>> GetByProject(string projectId)
    {
        var assets = await _db.ProjectAssets
            .Where(a => a.ProjectId == projectId)
            .OrderByDescending(a => a.CreatedAt)
            .ToListAsync();

        return Ok(assets.Select(ToDto));
    }

    // GET api/project-assets/by-product/{productId}
    [HttpGet("by-product/{productId}")]
    public async Task<ActionResult<IEnumerable<ProjectAssetDto>>> GetByProduct(string productId)
    {
        var assets = await _db.ProjectAssets
            .Where(a => a.ProductId == productId)
            .OrderByDescending(a => a.CreatedAt)
            .ToListAsync();

        return Ok(assets.Select(ToDto));
    }

    // GET api/project-assets/{id}
    [HttpGet("{id}")]
    public async Task<ActionResult<ProjectAssetDto>> GetById(string id)
    {
        var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == id);
        if (asset is null) return NotFound();
        return Ok(ToDto(asset));
    }

    // POST api/project-assets
    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<ProjectAssetDto>> Create([FromBody] UpsertProjectAssetRequest request)
    {
        var asset = new ProjectAssetEntity
        {
            ProjectId          = request.ProjectId ?? string.Empty,
            ProductId          = request.ProductId ?? string.Empty,
            ProductConfigId    = string.IsNullOrWhiteSpace(request.ProductConfigId) ? null : request.ProductConfigId,
            WorkflowTemplateId = string.IsNullOrWhiteSpace(request.WorkflowTemplateId) ? null : request.WorkflowTemplateId,
            AssetTag           = request.AssetTag?.Trim() ?? string.Empty,
            AssetName          = string.IsNullOrWhiteSpace(request.AssetName) ? null : request.AssetName.Trim(),
            SerialNumber       = string.IsNullOrWhiteSpace(request.SerialNumber) ? null : request.SerialNumber.Trim(),
            AssetModel         = string.IsNullOrWhiteSpace(request.AssetModel) ? null : request.AssetModel.Trim(),
            Manufacturer       = string.IsNullOrWhiteSpace(request.Manufacturer) ? null : request.Manufacturer.Trim(),
            Location           = string.IsNullOrWhiteSpace(request.Location) ? null : request.Location.Trim(),
            AssignedUserId     = string.IsNullOrWhiteSpace(request.AssignedUserId) ? null : request.AssignedUserId,
            Status             = string.IsNullOrWhiteSpace(request.Status) ? "NotStarted" : request.Status,
            Notes              = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
            FeatureValuesJson  = string.IsNullOrWhiteSpace(request.FeatureValuesJson) ? "{}" : request.FeatureValuesJson,
            IssuesJson         = string.IsNullOrWhiteSpace(request.IssuesJson) ? "[]" : request.IssuesJson,
        };
        _db.ProjectAssets.Add(asset);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = asset.Id }, ToDto(asset));
    }

    // POST api/project-assets/bulk
    [HttpPost("bulk")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<IEnumerable<ProjectAssetDto>>> BulkCreate([FromBody] BulkCreateProjectAssetsRequest request)
    {
        var created = new List<ProjectAssetEntity>();
        foreach (var item in request.Assets)
        {
            var asset = new ProjectAssetEntity
            {
                ProjectId          = request.ProjectId,
                ProductId          = request.ProductId,
                ProductConfigId    = string.IsNullOrWhiteSpace(item.ProductConfigId) ? null : item.ProductConfigId,
                WorkflowTemplateId = string.IsNullOrWhiteSpace(item.WorkflowTemplateId) ? null : item.WorkflowTemplateId,
                AssetTag           = item.AssetTag?.Trim() ?? string.Empty,
                AssetName          = string.IsNullOrWhiteSpace(item.AssetName) ? null : item.AssetName.Trim(),
                SerialNumber       = string.IsNullOrWhiteSpace(item.SerialNumber) ? null : item.SerialNumber.Trim(),
                AssetModel         = string.IsNullOrWhiteSpace(item.AssetModel) ? null : item.AssetModel.Trim(),
                Manufacturer       = string.IsNullOrWhiteSpace(item.Manufacturer) ? null : item.Manufacturer.Trim(),
                Location           = string.IsNullOrWhiteSpace(item.Location) ? null : item.Location.Trim(),
                AssignedUserId     = string.IsNullOrWhiteSpace(item.AssignedUserId) ? null : item.AssignedUserId,
                Status             = "NotStarted",
                Notes              = string.IsNullOrWhiteSpace(item.Notes) ? null : item.Notes.Trim(),
            };
            created.Add(asset);
            _db.ProjectAssets.Add(asset);
        }
        await _db.SaveChangesAsync();
        return Ok(created.Select(ToDto));
    }

    // PUT api/project-assets/{id}
    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<ProjectAssetDto>> Update(string id, [FromBody] UpsertProjectAssetRequest request)
    {
        var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == id);
        if (asset is null) return NotFound();

        if (!string.IsNullOrWhiteSpace(request.AssetTag))   asset.AssetTag        = request.AssetTag.Trim();
        if (request.AssetName is not null)                  asset.AssetName        = string.IsNullOrWhiteSpace(request.AssetName) ? null : request.AssetName.Trim();
        if (request.SerialNumber is not null)               asset.SerialNumber     = string.IsNullOrWhiteSpace(request.SerialNumber) ? null : request.SerialNumber.Trim();
        if (request.AssetModel is not null)                 asset.AssetModel       = string.IsNullOrWhiteSpace(request.AssetModel) ? null : request.AssetModel.Trim();
        if (request.Manufacturer is not null)               asset.Manufacturer     = string.IsNullOrWhiteSpace(request.Manufacturer) ? null : request.Manufacturer.Trim();
        if (request.Location is not null)                   asset.Location         = string.IsNullOrWhiteSpace(request.Location) ? null : request.Location.Trim();
        if (request.AssignedUserId is not null)             asset.AssignedUserId   = string.IsNullOrWhiteSpace(request.AssignedUserId) ? null : request.AssignedUserId;
        if (!string.IsNullOrWhiteSpace(request.Status))    asset.Status            = request.Status;
        if (request.Notes is not null)                      asset.Notes            = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        if (request.ProductConfigId is not null)            asset.ProductConfigId  = string.IsNullOrWhiteSpace(request.ProductConfigId) ? null : request.ProductConfigId;
        if (request.WorkflowTemplateId is not null)         asset.WorkflowTemplateId = string.IsNullOrWhiteSpace(request.WorkflowTemplateId) ? null : request.WorkflowTemplateId;
        if (request.WorkOrderId is not null)                asset.WorkOrderId      = string.IsNullOrWhiteSpace(request.WorkOrderId) ? null : request.WorkOrderId;
        if (request.FeatureValuesJson is not null)          asset.FeatureValuesJson = string.IsNullOrWhiteSpace(request.FeatureValuesJson) ? "{}" : request.FeatureValuesJson;
        if (request.IssuesJson is not null)                 asset.IssuesJson       = string.IsNullOrWhiteSpace(request.IssuesJson) ? "[]" : request.IssuesJson;
        if (request.ConfigLabel is not null)                asset.ConfigLabel      = string.IsNullOrWhiteSpace(request.ConfigLabel) ? null : request.ConfigLabel.Trim();
        asset.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(ToDto(asset));
    }

    // DELETE api/project-assets/{id}
    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Delete(string id)
    {
        var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == id);
        if (asset is null) return NotFound();

        // Remove dependent workflow records if those tables exist (migration may not be applied yet)
        try
        {
            var assignments = await _db.AssetWorkflowAssignments.Where(a => a.AssetId == id).ToListAsync();
            _db.AssetWorkflowAssignments.RemoveRange(assignments);

            var runs = await _db.AssetWorkflowRuns.Where(r => r.AssetId == id).ToListAsync();
            _db.AssetWorkflowRuns.RemoveRange(runs);
        }
        catch { /* tables may not exist yet if migration is pending — skip */ }

        _db.ProjectAssets.Remove(asset);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static ProjectAssetDto ToDto(ProjectAssetEntity a) =>
        new(a.Id, a.ProjectId, a.ProductId, a.ProductConfigId, a.WorkflowTemplateId,
            a.AssetTag, a.AssetName, a.SerialNumber, a.AssetModel, a.Manufacturer,
            a.Location, a.AssignedUserId, a.Status, a.WorkOrderId, a.Notes,
            a.FeatureValuesJson, a.IssuesJson, a.ConfigLabel, a.InstalledAt, a.InstalledBy,
            a.AsBuiltJson, a.CreatedAt, a.UpdatedAt);
}
