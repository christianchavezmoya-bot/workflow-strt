using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Schemas;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/inspection-imports")]
[Authorize]
public class InspectionImportsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;
    private readonly IInspectionImportAdapterService _adapter;
    private readonly IInspectionImportValidatorService _validator;

    public InspectionImportsController(
        AppDbContext db,
        IWebHostEnvironment env,
        IInspectionImportAdapterService adapter,
        IInspectionImportValidatorService validator)
    {
        _db = db;
        _env = env;
        _adapter = adapter;
        _validator = validator;
    }

    // GET /api/inspection-imports?projectId=&assetId=&projectAssetId=&status=
    [HttpGet]
    public async Task<ActionResult<List<InspectionImportDto>>> GetAll(
        [FromQuery] string? projectId,
        [FromQuery] string? assetId,
        [FromQuery] string? projectAssetId,
        [FromQuery] string? status)
    {
        var query = _db.InspectionImports.AsQueryable();
        var effectiveAssetId = !string.IsNullOrWhiteSpace(projectAssetId) ? projectAssetId : assetId;

        if (!string.IsNullOrWhiteSpace(projectId))
            query = query.Where(x => x.ProjectId == projectId);

        if (!string.IsNullOrWhiteSpace(effectiveAssetId))
            query = query.Where(x => x.AssetId == effectiveAssetId);

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
        var effectiveAssetId = !string.IsNullOrWhiteSpace(request.ProjectAssetId) ? request.ProjectAssetId : request.AssetId;
        var source = request.Source ?? "LOCAL";

        string? adaptedJson = null;
        string? hash = null;
        string? validationError = null;
        CanonicalInspection? canonical = null;

        if (!string.IsNullOrWhiteSpace(request.RawJson))
        {
            adaptedJson = _adapter.Adapt(request.RawJson, source);
            var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(adaptedJson));
            hash = Convert.ToHexString(bytes).ToLowerInvariant();

            if (await _db.InspectionImports.AnyAsync(x => x.ContentHash == hash && x.ProjectId == request.ProjectId))
                return Conflict(new { error = "Duplicate import: identical content already received for this project." });

            var validation = _validator.Validate(adaptedJson);
            validationError = validation.IsValid ? null : validation.Error;
            canonical = validation.Parsed;
        }

        var entity = new InspectionImportEntity
        {
            Source = source,
            FileName = request.FileName,
            ContentHash = hash,
            RawJson = adaptedJson,
            ProjectId = request.ProjectId,
            AssetId = effectiveAssetId,
            Status = string.IsNullOrWhiteSpace(request.ProjectId) ? "RECEIVED" : "NEEDS_ASSIGNMENT",
            UploadedBy = request.UploadedBy,
            ErrorText = validationError,
        };

        _db.InspectionImports.Add(entity);
        await TryCompleteInspectionOnlyAssetAsync(entity, canonical);
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
        [FromForm] string? projectAssetId,
        [FromForm] string? source,
        [FromForm] string? uploadedBy)
    {
        var effectiveAssetId = !string.IsNullOrWhiteSpace(projectAssetId) ? projectAssetId : assetId;
        var effectiveSource = source ?? "LOCAL";

        if (file is null || file.Length == 0)
            return BadRequest(new { error = "No file received." });

        if (!file.FileName.EndsWith(".json", StringComparison.OrdinalIgnoreCase) &&
            file.ContentType != "application/json" &&
            file.ContentType != "text/plain")
        {
            return BadRequest(new { error = "Only JSON files are accepted." });
        }

        string rawText;
        using (var ms = new MemoryStream())
        {
            await file.CopyToAsync(ms);
            rawText = Encoding.UTF8.GetString(ms.ToArray());
        }

        var adaptedJson = _adapter.Adapt(rawText, effectiveSource);
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(adaptedJson))).ToLowerInvariant();

        if (await _db.InspectionImports.AnyAsync(x => x.ContentHash == hash && x.ProjectId == projectId))
            return Conflict(new { error = "Duplicate import: identical content already received for this project." });

        var validation = _validator.Validate(adaptedJson);
        var canonical = validation.Parsed;

        var entity = new InspectionImportEntity
        {
            Source = effectiveSource,
            FileName = file.FileName,
            ContentHash = hash,
            RawJson = adaptedJson,
            ProjectId = projectId,
            AssetId = effectiveAssetId,
            Status = string.IsNullOrWhiteSpace(projectId) ? "RECEIVED" : "NEEDS_ASSIGNMENT",
            UploadedBy = uploadedBy,
            ErrorText = validation.IsValid ? null : validation.Error,
        };

        _db.InspectionImports.Add(entity);
        await TryCompleteInspectionOnlyAssetAsync(entity, canonical);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = entity.Id }, ToDto(entity));
    }

    // GET /api/inspection-imports/{id}/raw
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
        var effectiveAssetId = !string.IsNullOrWhiteSpace(request.ProjectAssetId) ? request.ProjectAssetId : request.AssetId;

        if (string.IsNullOrWhiteSpace(request.ProjectId))
            return BadRequest(new { error = "ProjectId is required." });

        item.ProjectId = request.ProjectId;
        item.AssetId = effectiveAssetId;
        item.Status = "MAPPED";

        // Re-validate to get canonical data for step result population
        var validation = _validator.Validate(item.RawJson);
        if (!validation.IsValid && item.ErrorText is null)
            item.ErrorText = validation.Error;

        await TryCompleteInspectionOnlyAssetAsync(item, validation.Parsed);
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

    // ── Auto-complete logic for inspection-only projects ──────────────────────

    private async Task TryCompleteInspectionOnlyAssetAsync(InspectionImportEntity entity, CanonicalInspection? canonical)
    {
        if (string.IsNullOrWhiteSpace(entity.AssetId) || string.IsNullOrWhiteSpace(entity.ProjectId))
            return;

        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == entity.ProjectId);
        if (project?.WorkflowMode != "INSPECTION_ONLY") return;

        var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == entity.AssetId);
        if (asset is null) return;

        var now = DateTime.UtcNow;
        var actorName = ResolveActorName();

        var inspectionConfigIds = await _db.WorkflowConfigs
            .Where(c => c.WorkflowTypeId == "wftype-inspection" && c.Status == "Published")
            .Select(c => c.Id)
            .ToListAsync();

        List<AssetWorkflowRunEntity> openRuns;
        if (inspectionConfigIds.Count > 0)
        {
            openRuns = await _db.AssetWorkflowRuns
                .Where(r => r.AssetId == entity.AssetId && !r.IsLocked && inspectionConfigIds.Contains(r.WorkflowConfigId))
                .OrderByDescending(r => r.StartedAt)
                .ToListAsync();
        }
        else
        {
            openRuns = await _db.AssetWorkflowRuns
                .Where(r => r.AssetId == entity.AssetId && !r.IsLocked)
                .OrderByDescending(r => r.StartedAt)
                .ToListAsync();
        }

        if (openRuns.Count == 0)
        {
            var syntheticRun = await CreateSyntheticInspectionRunAsync(asset, inspectionConfigIds, actorName, now);
            _db.AssetWorkflowRuns.Add(syntheticRun);
            openRuns.Add(syntheticRun);
        }

        foreach (var run in openRuns)
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
            }
            else
            {
                run.IssuesJson = "[]";
            }

            if (entity.MappedRunId is null)
            {
                entity.MappedRunId = run.Id;
                entity.Status = "MAPPED";
            }

            // Ensure a workflow assignment exists so the run is visible in the UI history panel.
            if (!string.IsNullOrWhiteSpace(run.WorkflowConfigId))
            {
                var existingAssignment = await _db.AssetWorkflowAssignments
                    .AnyAsync(a => a.AssetId == entity.AssetId && a.WorkflowConfigId == run.WorkflowConfigId);
                if (!existingAssignment)
                {
                    _db.AssetWorkflowAssignments.Add(new AssetWorkflowAssignmentEntity
                    {
                        AssetId = entity.AssetId!,
                        WorkflowConfigId = run.WorkflowConfigId,
                        WorkflowTypeId = "wftype-inspection",
                        Active = true,
                        AssignedBy = actorName,
                    });
                }
            }
        }

        asset.Status = "Complete";
        asset.IssuesJson = "[]";
        asset.InstalledAt = now;
        asset.InstalledBy = actorName;
        asset.UpdatedAt = now;
    }

    private async Task<AssetWorkflowRunEntity> CreateSyntheticInspectionRunAsync(
        ProjectAssetEntity asset,
        List<string> inspectionConfigIds,
        string actorName,
        DateTime now)
    {
        WorkflowConfigEntity? config = null;
        if (inspectionConfigIds.Count > 0)
        {
            config = await _db.WorkflowConfigs
                .Where(c => inspectionConfigIds.Contains(c.Id) && c.ProductId == asset.ProductId)
                .FirstOrDefaultAsync()
                ?? await _db.WorkflowConfigs
                .Where(c => inspectionConfigIds.Contains(c.Id))
                .FirstOrDefaultAsync();
        }

        var configId = config?.Id ?? string.Empty;
        var snapshot = JsonSerializer.Serialize(new
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

        return new AssetWorkflowRunEntity
        {
            Id = Guid.NewGuid().ToString(),
            AssetId = asset.Id,
            WorkflowConfigId = configId,
            WorkflowVersion = config?.Version ?? 1,
            WorkflowSnapshotJson = snapshot,
            Status = "InProgress",
            IsLocked = false,
            TechnicianUserId = asset.AssignedUserId,
            RunNumber = runCount + 1,
            StepResultsJson = "[]",
            IssuesJson = "[]",
            StartedAt = now,
            CreatedAt = now,
            UpdatedAt = now,
        };
    }

    private static string BuildStepResultsJson(CanonicalInspection canonical)
    {
        var completedAt = canonical.InspectionDate;
        var results = canonical.Results.Select(r =>
        {
            var values = new Dictionary<string, string>();
            if (!string.IsNullOrWhiteSpace(r.Value))  values["value"] = r.Value;
            if (!string.IsNullOrWhiteSpace(r.Unit))   values["unit"] = r.Unit!;
            if (r.Pass.HasValue)                       values["pass"] = r.Pass.Value ? "true" : "false";
            if (!string.IsNullOrWhiteSpace(r.Label))  values["label"] = r.Label!;
            if (!string.IsNullOrWhiteSpace(r.Notes))  values["notes"] = r.Notes!;
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

    private string ResolveActorName()
    {
        var name = User.FindFirstValue("fullName") ?? User.FindFirstValue(ClaimTypes.Name);
        return string.IsNullOrWhiteSpace(name) ? "System" : name;
    }

    private static InspectionImportDto ToDto(InspectionImportEntity e) => new(
        e.Id,
        e.Source,
        e.ReceivedAt,
        e.FileName,
        e.ContentHash,
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
