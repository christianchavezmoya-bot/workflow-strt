using System.Security.Cryptography;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Schemas;
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
    private readonly IWorkflowRunAuthorizationService _workflowAuthorization;
    private readonly IInspectionImportValidatorService _validator;
    private readonly IInspectionImportAdapterService _adapter;

    public InspectionImportsController(
        AppDbContext db,
        IAccessScopeService accessScope,
        IProjectAuthorizationService projectAuthorization,
        IWorkflowRunAuthorizationService workflowAuthorization,
        IInspectionImportValidatorService validator,
        IInspectionImportAdapterService adapter)
    {
        _db = db;
        _accessScope = accessScope;
        _projectAuthorization = projectAuthorization;
        _workflowAuthorization = workflowAuthorization;
        _validator = validator;
        _adapter = adapter;
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

        var source = string.IsNullOrWhiteSpace(request.Source) ? "manual" : request.Source.Trim();
        var adaptedJson = _adapter.Adapt(request.RawJson, source);
        var validation = _validator.Validate(adaptedJson);

        var entity = new InspectionImportEntity
        {
            Id = Guid.NewGuid().ToString(),
            Source = source,
            ReceivedAt = DateTime.UtcNow,
            RawJson = adaptedJson,
            Hash = ComputeSha256(adaptedJson),
            ProjectId = resolvedProjectId,
            ProjectAssetId = asset?.Id,
            Status = status,
            Error = validation.IsValid ? null : validation.Error,
        };

        // Enforce 1-per-asset: archive any existing active import for this asset
        if (!string.IsNullOrWhiteSpace(asset?.Id))
        {
            var existing = await _db.InspectionImports
                .Where(i => i.ProjectAssetId == asset.Id && !i.IsArchived)
                .ToListAsync();
            var assetTag = asset.AssetTag ?? asset.Id;
            var project = string.IsNullOrWhiteSpace(resolvedProjectId)
                ? null
                : await _db.Projects.FirstOrDefaultAsync(p => p.Id == resolvedProjectId);
            var archiveRef = $"{project?.JobNumber ?? resolvedProjectId} / {assetTag} / {DateTime.UtcNow:yyyy-MM-dd}";
            foreach (var old in existing)
                ArchiveEntity(old, ResolveActorName(), "Superseded by new upload", archiveRef);
        }

        _db.InspectionImports.Add(entity);
        await TryCompleteInspectionOnlyAssetAsync(entity, asset, validation.Parsed);
        await _db.SaveChangesAsync();
        return Ok(ToDto(entity));
    }

    [HttpGet("projects/{projectId}/inspection-imports")]
    public async Task<ActionResult<IEnumerable<InspectionImportDto>>> ListByProject(
        string projectId,
        [FromQuery] string? status = null,
        [FromQuery] string? assetId = null,
        [FromQuery] bool includeArchived = false)
    {
        if (!await _accessScope.CanViewProjectAsync(User, projectId))
        {
            return NotFound();
        }

        var query = _db.InspectionImports
            .Where(i => i.ProjectId == projectId);

        if (!includeArchived)
            query = query.Where(i => !i.IsArchived);

        if (!string.IsNullOrWhiteSpace(status))
            query = query.Where(i => i.Status == status);

        if (!string.IsNullOrWhiteSpace(assetId))
            query = query.Where(i => i.ProjectAssetId == assetId);

        var items = await query
            .OrderByDescending(i => i.ReceivedAt)
            .ToListAsync();

        return Ok(items.Select(ToDto));
    }

    [HttpPost("inspection-imports/{id}/assign")]
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

        var assignValidation = _validator.Validate(entity.RawJson);
        entity.Error = assignValidation.IsValid ? null : assignValidation.Error;

        await TryCompleteInspectionOnlyAssetAsync(entity, asset, assignValidation.Parsed);
        await _db.SaveChangesAsync();
        return Ok(ToDto(entity));
    }

    [HttpPut("inspection-imports/{id}")]
    public async Task<ActionResult<InspectionImportDto>> Update(string id, [FromBody] UpdateInspectionImportRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.RawJson))
        {
            return BadRequest(new { message = "RawJson is required." });
        }

        var entity = await _db.InspectionImports.FirstOrDefaultAsync(i => i.Id == id);
        if (entity is null)
        {
            return NotFound();
        }

        ProjectAssetEntity? asset = null;
        if (!string.IsNullOrWhiteSpace(entity.ProjectAssetId))
        {
            asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == entity.ProjectAssetId);
        }

        if (!await CanManageInspectionImportAsync(entity, asset))
        {
            return Forbid();
        }

        entity.Source = string.IsNullOrWhiteSpace(request.Source) ? entity.Source : request.Source.Trim();
        var updatedAdapted = _adapter.Adapt(request.RawJson, entity.Source);
        entity.RawJson = updatedAdapted;
        entity.Hash = ComputeSha256(updatedAdapted);

        var updateValidation = _validator.Validate(updatedAdapted);
        entity.Error = updateValidation.IsValid ? null : updateValidation.Error;

        await TryCompleteInspectionOnlyAssetAsync(entity, asset, updateValidation.Parsed);
        await _db.SaveChangesAsync();
        return Ok(ToDto(entity));
    }

    [HttpDelete("inspection-imports/{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        var entity = await _db.InspectionImports.FirstOrDefaultAsync(i => i.Id == id);
        if (entity is null)
        {
            return NotFound();
        }

        ProjectAssetEntity? asset = null;
        if (!string.IsNullOrWhiteSpace(entity.ProjectAssetId))
        {
            asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == entity.ProjectAssetId);
        }

        if (!await CanManageInspectionImportAsync(entity, asset))
        {
            return Forbid();
        }

        var projectId = entity.ProjectId;
        var assetId = entity.ProjectAssetId;

        _db.InspectionImports.Remove(entity);
        await _db.SaveChangesAsync();

        if (!string.IsNullOrWhiteSpace(projectId) && !string.IsNullOrWhiteSpace(assetId))
        {
            await RecalculateInspectionOnlyAssetAsync(projectId, assetId);
            await _db.SaveChangesAsync();
        }

        return NoContent();
    }

    private async Task TryCompleteInspectionOnlyAssetAsync(
        InspectionImportEntity entity,
        ProjectAssetEntity? asset,
        CanonicalInspection? canonical = null)
    {
        if (asset is null || string.IsNullOrWhiteSpace(entity.ProjectId))
            return;

        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == entity.ProjectId);
        if (project is null || !string.Equals(project.WorkflowMode, ProjectEntity.WorkflowModeInspectionOnly, StringComparison.OrdinalIgnoreCase))
            return;

        var now = DateTime.UtcNow;
        var actorName = ResolveActorName();

        asset.Status = "Complete";
        asset.IssuesJson = "[]";
        asset.InstalledAt = now;
        asset.InstalledBy = actorName;
        asset.UpdatedAt = now;

        var inspectionConfigIds = await _db.WorkflowConfigs
            .Where(c => c.ConfigType != null && (c.ConfigType.ToLower() == "inspection" || c.ConfigType.ToLower() == "wftype-inspection"))
            .Select(c => c.Id)
            .ToListAsync();

        var openInspectionRuns = await _db.AssetWorkflowRuns
            .Where(r => r.AssetId == asset.Id && !r.IsLocked && inspectionConfigIds.Contains(r.WorkflowConfigId))
            .OrderByDescending(r => r.StartedAt)
            .ToListAsync();

        // No open inspection run exists — auto-create one so the import has a run to map to
        // and the user can generate a PDF from the inspection page.
        if (!openInspectionRuns.Any() && canonical is not null)
        {
            var syntheticRun = await CreateSyntheticInspectionRunAsync(asset, inspectionConfigIds, actorName, now);
            openInspectionRuns.Add(syntheticRun);
        }

        foreach (var run in openInspectionRuns)
        {
            run.Status = "Complete";
            run.IsLocked = true;
            run.SignatureStatus = "WaivedCustomer";
            run.CompletedByName = actorName;
            run.CompletedAt = now;
            run.UpdatedAt = now;

            if (canonical is not null)
            {
                run.StepResultsJson = BuildStepResultsJson(canonical);
                run.IssuesJson = BuildIssuesJson(canonical);
                if (entity.MappedRunId is null)
                {
                    entity.MappedRunId = run.Id;
                    entity.Status = InspectionImportEntity.StatusMapped;
                }
            }
            else
            {
                run.IssuesJson = "[]";
            }
        }
    }

    private async Task<AssetWorkflowRunEntity> CreateSyntheticInspectionRunAsync(
        ProjectAssetEntity asset,
        List<string> inspectionConfigIds,
        string actorName,
        DateTime now)
    {
        // Prefer a published inspection config for this product; fall back to any inspection config.
        var config = await _db.WorkflowConfigs
            .Where(c => c.ProductId == asset.ProductId && inspectionConfigIds.Contains(c.Id) && c.Status == "Published")
            .FirstOrDefaultAsync()
            ?? await _db.WorkflowConfigs
            .Where(c => inspectionConfigIds.Contains(c.Id) && c.Status == "Published")
            .FirstOrDefaultAsync();

        var configId = config?.Id ?? string.Empty;
        var snapshot = System.Text.Json.JsonSerializer.Serialize(new
        {
            id = configId,
            name = config?.DisplayName ?? config?.Name ?? "Inspection Import",
            version = config?.Version ?? 1,
            stepsJson = config?.StepsJson ?? "[]",
            mediaJson = config?.MediaJson ?? "[]",
            featureSelectionsJson = config?.FeatureSelectionsJson ?? "[]",
            snapshotAt = now,
        });

        var runCount = await _db.AssetWorkflowRuns
            .CountAsync(r => r.AssetId == asset.Id && r.WorkflowConfigId == configId);

        var run = new AssetWorkflowRunEntity
        {
            Id = Guid.NewGuid().ToString(),
            AssetId = asset.Id,
            WorkflowConfigId = configId,
            WorkflowVersion = config?.Version ?? 1,
            WorkflowSnapshotJson = snapshot,
            Status = "InProgress",
            IsLocked = false,
            TechnicianUserId = asset.AssignedUserId,
            StepResultsJson = "[]",
            IssuesJson = "[]",
            TimeTrackingJson = "[]",
            RunNumber = runCount + 1,
            StartedAt = now,
            CreatedAt = now,
            UpdatedAt = now,
        };

        _db.AssetWorkflowRuns.Add(run);
        return run;
    }

    private static string BuildStepResultsJson(CanonicalInspection canonical)
    {
        var completedAt = canonical.InspectionDate;
        var results = canonical.Results.Select(r =>
        {
            var values = new Dictionary<string, string>();
            if (!string.IsNullOrWhiteSpace(r.Value))  values["value"] = r.Value;
            if (!string.IsNullOrWhiteSpace(r.Unit))   values["unit"] = r.Unit;
            if (r.Pass.HasValue)                       values["pass"] = r.Pass.Value ? "true" : "false";
            if (!string.IsNullOrWhiteSpace(r.Label))  values["label"] = r.Label;
            if (!string.IsNullOrWhiteSpace(r.Notes))  values["notes"] = r.Notes;
            return new { stepId = r.CheckId, values, completedAt };
        });
        return JsonSerializer.Serialize(results);
    }

    private static string BuildIssuesJson(CanonicalInspection canonical)
    {
        var issues = canonical.Results
            .Where(r => r.Pass == false)
            .Select(r => new
            {
                id = Guid.NewGuid().ToString(),
                description = $"{r.Label ?? r.CheckId}: {r.Value ?? "Failed"}",
                issueType = "observation",
                severity = "medium",
                stepId = r.CheckId,
                stepTitle = r.Label ?? r.CheckId,
                reportedAt = canonical.InspectionDate,
                resolved = false,
                isBlocking = false,
                createdBy = "Inspection Import",
            });
        return JsonSerializer.Serialize(issues);
    }

    private async Task RecalculateInspectionOnlyAssetAsync(string projectId, string assetId)
    {
        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == projectId);
        if (project is null || !string.Equals(project.WorkflowMode, ProjectEntity.WorkflowModeInspectionOnly, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == assetId && a.ProjectId == projectId);
        if (asset is null)
        {
            return;
        }

        var inspectionConfigIds = await _db.WorkflowConfigs
            .Where(c => c.ConfigType != null && (c.ConfigType.ToLower() == "inspection" || c.ConfigType.ToLower() == "wftype-inspection"))
            .Select(c => c.Id)
            .ToListAsync();

        var runs = await _db.AssetWorkflowRuns
            .Where(r => r.AssetId == assetId && inspectionConfigIds.Contains(r.WorkflowConfigId))
            .ToListAsync();

        var hasExternalEvidence = await _db.InspectionImports.AnyAsync(i => i.ProjectAssetId == assetId);
        var hasCompletedRun = runs.Any(r => r.IsLocked && string.Equals(r.Status, "Complete", StringComparison.OrdinalIgnoreCase));
        var hasOpenRun = runs.Any(r => !r.IsLocked && string.Equals(r.Status, "InProgress", StringComparison.OrdinalIgnoreCase));

        asset.UpdatedAt = DateTime.UtcNow;

        if (hasExternalEvidence || hasCompletedRun)
        {
            asset.Status = "Complete";
            asset.IssuesJson = "[]";
            return;
        }

        asset.Status = hasOpenRun ? "InProgress" : "NotStarted";
        asset.InstalledAt = null;
        asset.InstalledBy = null;
    }

    [HttpPost("inspection-imports/{id}/archive")]
    public async Task<ActionResult<InspectionImportDto>> Archive(string id, [FromBody] ArchiveInspectionImportRequest request)
    {
        var entity = await _db.InspectionImports.FirstOrDefaultAsync(i => i.Id == id);
        if (entity is null)
            return NotFound();

        ProjectAssetEntity? asset = null;
        if (!string.IsNullOrWhiteSpace(entity.ProjectAssetId))
            asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == entity.ProjectAssetId);

        if (!await CanManageInspectionImportAsync(entity, asset))
            return Forbid();

        ArchiveEntity(entity, ResolveActorName(), request.Reason ?? "Manually archived", request.ArchiveRef);
        await _db.SaveChangesAsync();
        return Ok(ToDto(entity));
    }

    private void ArchiveEntity(InspectionImportEntity entity, string actor, string reason, string? archiveRef = null)
    {
        entity.IsArchived = true;
        entity.ArchivedAt = DateTime.UtcNow;
        entity.ArchivedBy = actor;
        entity.ArchiveReason = reason;
        entity.ArchiveRef = archiveRef;
    }

    private async Task<bool> CanManageInspectionImportAsync(InspectionImportEntity entity, ProjectAssetEntity? asset)
    {
        if (!string.IsNullOrWhiteSpace(entity.ProjectId) && await _projectAuthorization.CanEditProjectAsync(User, entity.ProjectId))
        {
            return true;
        }

        // Any user who can view the project can manage its inspection imports.
        // This matches the Create endpoint which only requires CanViewProject.
        if (!string.IsNullOrWhiteSpace(entity.ProjectId) && await _accessScope.CanViewProjectAsync(User, entity.ProjectId))
        {
            return true;
        }

        if (asset is null)
        {
            return false;
        }

        return await _workflowAuthorization.CanMutateWorkflowRunAsync(User, asset, run: null);
    }

    private string ResolveActorName()
    {
        var fullName = User.FindFirstValue("fullName")
            ?? User.FindFirstValue(ClaimTypes.Name)
            ?? User.Identity?.Name;
        return string.IsNullOrWhiteSpace(fullName) ? "User" : fullName;
    }

    private static bool IsInspectionConfig(string? configType)
    {
        var normalized = (configType ?? string.Empty).Trim().ToLowerInvariant();
        return normalized == "inspection" || normalized == "wftype-inspection";
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
        entity.MappedRunId,
        entity.IsArchived,
        entity.ArchivedAt,
        entity.ArchivedBy,
        entity.ArchiveReason,
        entity.ArchiveRef
    );

    private static string ComputeSha256(string rawJson)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(rawJson));
        return Convert.ToHexString(bytes);
    }
}
