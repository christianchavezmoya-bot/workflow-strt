using System.Text.Json;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/projects/{projectId}/assets/{projectAssetId}/inspections/runs")]
[Authorize]
public class ProjectInspectionRunsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IAccessScopeService _accessScope;
    private readonly IProjectAuthorizationService _projectAuthorization;
    private readonly IWorkflowRunAuthorizationService _workflowAuthorization;

    public ProjectInspectionRunsController(
        AppDbContext db,
        IAccessScopeService accessScope,
        IProjectAuthorizationService projectAuthorization,
        IWorkflowRunAuthorizationService workflowAuthorization)
    {
        _db = db;
        _accessScope = accessScope;
        _projectAuthorization = projectAuthorization;
        _workflowAuthorization = workflowAuthorization;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<AssetWorkflowRunDto>>> List(string projectId, string projectAssetId)
    {
        var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == projectAssetId);
        if (asset is null || asset.ProjectId != projectId)
        {
            return NotFound();
        }

        if (!await _accessScope.CanViewProjectAsync(User, projectId))
        {
            return NotFound();
        }

        var inspectionConfigIds = await _db.WorkflowConfigs
            .Where(c => IsInspectionConfig(c.ConfigType))
            .Select(c => c.Id)
            .ToListAsync();

        var runs = await _db.AssetWorkflowRuns
            .Where(r => r.AssetId == projectAssetId && inspectionConfigIds.Contains(r.WorkflowConfigId))
            .OrderByDescending(r => r.StartedAt)
            .ToListAsync();

        return Ok(runs.Select(ToDto));
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager,Engineer")]
    public async Task<ActionResult<AssetWorkflowRunDto>> Create(string projectId, string projectAssetId, [FromBody] CreateInspectionRunRequest request)
    {
        var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == projectAssetId);
        if (asset is null || asset.ProjectId != projectId)
        {
            return NotFound();
        }

        if (!await _projectAuthorization.CanEditProjectAsync(User, projectId))
        {
            return Forbid();
        }

        if (!await _workflowAuthorization.CanStartWorkflowRunAsync(User, asset))
        {
            return Forbid();
        }

        var config = await _db.WorkflowConfigs.FirstOrDefaultAsync(c => c.Id == request.WorkflowConfigId);
        if (config is null)
        {
            return BadRequest(new { message = "WorkflowConfig not found." });
        }

        if (config.Status != "Published")
        {
            return BadRequest(new { message = "Only Published configurations can be executed." });
        }

        if (!IsInspectionConfig(config.ConfigType))
        {
            return BadRequest(new { message = "WorkflowConfig is not an inspection workflow." });
        }

        var existingRun = await _db.AssetWorkflowRuns
            .Where(r => r.AssetId == projectAssetId && r.WorkflowConfigId == request.WorkflowConfigId && !r.IsLocked)
            .OrderByDescending(r => r.StartedAt)
            .FirstOrDefaultAsync();
        if (existingRun is not null)
        {
            return Ok(ToDto(existingRun));
        }

        var snapshot = JsonSerializer.Serialize(new
        {
            id = config.Id,
            name = config.Name,
            version = config.Version,
            stepsJson = config.StepsJson,
            mediaJson = config.MediaJson,
            featureSelectionsJson = config.FeatureSelectionsJson,
            snapshotAt = DateTime.UtcNow,
        });

        var runCount = await _db.AssetWorkflowRuns
            .CountAsync(r => r.AssetId == projectAssetId && r.WorkflowConfigId == request.WorkflowConfigId);

        var now = DateTime.UtcNow;
        var run = new AssetWorkflowRunEntity
        {
            Id = Guid.NewGuid().ToString(),
            AssetId = projectAssetId,
            WorkflowConfigId = request.WorkflowConfigId,
            WorkflowVersion = config.Version,
            WorkflowSnapshotJson = snapshot,
            Status = "InProgress",
            IsLocked = false,
            TechnicianUserId = string.IsNullOrWhiteSpace(request.TechnicianUserId) ? asset.AssignedUserId : request.TechnicianUserId,
            StepResultsJson = "[]",
            IssuesJson = "[]",
            TimeTrackingJson = "[]",
            ProductiveSeconds = 0,
            DowntimeSeconds = 0,
            DowntimeEvents = 0,
            RunNumber = runCount + 1,
            StartedAt = now,
            CreatedAt = now,
            UpdatedAt = now,
        };

        _db.AssetWorkflowRuns.Add(run);
        asset.UpdatedAt = now;
        if (asset.Status == "NotStarted")
        {
            asset.Status = "InProgress";
        }

        await _db.SaveChangesAsync();
        return Ok(ToDto(run));
    }

    private static bool IsInspectionConfig(string? configType)
    {
        var normalized = (configType ?? string.Empty).Trim().ToLowerInvariant();
        return normalized == "inspection" || normalized == "wftype-inspection";
    }

    private static AssetWorkflowRunDto ToDto(AssetWorkflowRunEntity e) => new(
        e.Id, e.AssetId, e.WorkflowConfigId, e.WorkflowVersion,
        e.WorkflowSnapshotJson, e.WorkOrderId, e.Status, e.IsLocked,
        e.TechnicianUserId, e.StepResultsJson, e.IssuesJson,
        e.TimeTrackingJson, e.ProductiveSeconds, e.DowntimeSeconds, e.DowntimeEvents,
        e.RunNumber, e.CompletedByName,
        e.SignatureStatus, e.InstallerSignedAt, e.CustomerSignedAt,
        e.StartedAt, e.CompletedAt, e.CreatedAt, e.UpdatedAt,
        e.BomActualJson
    );
}
