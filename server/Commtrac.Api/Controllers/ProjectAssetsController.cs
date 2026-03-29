using System.Text.Json;
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
    private static readonly JsonSerializerOptions _json = new() { PropertyNameCaseInsensitive = true };

    public ProjectAssetsController(AppDbContext db)
    {
        _db = db;
    }

    // GET api/project-assets/my-project-ids
    [HttpGet("my-project-ids")]
    public async Task<ActionResult<IEnumerable<string>>> MyProjectIds()
    {
        var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrWhiteSpace(userId)) return Ok(Array.Empty<string>());

        var projectIds = await _db.ProjectAssets
            .Where(a => a.AssignedUserId == userId)
            .Select(a => a.ProjectId)
            .Distinct()
            .ToListAsync();
        return Ok(projectIds);
    }

    // GET api/project-assets/active-summary
    // Returns per-project asset counts (active = NotStarted + InProgress)
    [HttpGet("active-summary")]
    public async Task<ActionResult<IEnumerable<ProjectAssetSummaryDto>>> ActiveSummary()
    {
        var counts = await _db.ProjectAssets
            .GroupBy(a => a.ProjectId)
            .Select(g => new ProjectAssetSummaryDto(
                g.Key,
                g.Count(a => a.Status == "NotStarted"),
                g.Count(a => a.Status == "InProgress"),
                g.Count(a => a.Status == "Complete" || a.Status == "Completed"),
                g.Count()))
            .ToListAsync();
        return Ok(counts);
    }

    // GET api/project-assets/open  — all assets not yet Complete, joined with parent project info
    [HttpGet("open")]
    public async Task<ActionResult<IEnumerable<OpenAssetDto>>> GetOpen()
    {
        var assets = await _db.ProjectAssets
            .Where(a => a.Status == "NotStarted" || a.Status == "InProgress")
            .OrderBy(a => a.ProjectId).ThenBy(a => a.AssetTag)
            .ToListAsync();

        var assetIds = assets.Select(a => a.Id).Distinct().ToList();
        var latestRuns = await _db.AssetWorkflowRuns
            .Where(r => assetIds.Contains(r.AssetId))
            .OrderByDescending(r => r.StartedAt)
            .ThenByDescending(r => r.UpdatedAt)
            .ToListAsync();
        var latestRunByAsset = latestRuns
            .GroupBy(r => r.AssetId)
            .ToDictionary(g => g.Key, g => g.First());

        var projectIds = assets.Select(a => a.ProjectId).Distinct().ToList();
        var projects = await _db.Projects
            .Where(p => projectIds.Contains(p.Id))
            .Select(p => new { p.Id, p.JobNumber, p.Office, p.OfficeId })
            .ToDictionaryAsync(p => p.Id);

        var result = assets.Select(a =>
        {
            projects.TryGetValue(a.ProjectId, out var proj);
            latestRunByAsset.TryGetValue(a.Id, out var latestRun);
            var counts = latestRun is null
                ? (RequiredItems: 0, CompletedItems: 0, MissingItems: 0)
                : CountWorkflowEvidence(latestRun.WorkflowSnapshotJson, latestRun.StepResultsJson);
            var summary = BuildWorkflowSummary(a, latestRun);
            return new OpenAssetDto(
                a.Id, a.ProjectId,
                proj?.JobNumber ?? "",
                proj?.Office ?? "",
                proj?.OfficeId,
                a.AssetTag, a.AssetName, a.AssetModel, a.Manufacturer,
                a.Status,
                latestRun?.Status,
                counts.CompletedItems,
                counts.RequiredItems,
                counts.MissingItems,
                summary.EvidenceStatus,
                a.AssignedUserId, a.Location
            );
        });

        return Ok(result);
    }

    // GET api/project-assets/workload-summary
    [HttpGet("workload-summary")]
    public async Task<ActionResult<IEnumerable<WorkloadSummaryDto>>> WorkloadSummary()
    {
        var assets = await _db.ProjectAssets
            .Where(a => a.AssignedUserId != null && a.AssignedUserId != ""
                     && (a.Status == "NotStarted" || a.Status == "InProgress"))
            .ToListAsync();

        var userIds   = assets.Select(a => a.AssignedUserId!).Distinct().ToList();
        var projectIds = assets.Select(a => a.ProjectId).Distinct().ToList();
        var assetIds   = assets.Select(a => a.Id).Distinct().ToList();

        var users = await _db.Users
            .Where(u => userIds.Contains(u.Id))
            .Select(u => new { u.Id, u.FullName })
            .ToDictionaryAsync(u => u.Id, u => u.FullName);

        var projects = await _db.Projects
            .Where(p => projectIds.Contains(p.Id))
            .Select(p => new { p.Id, p.JobNumber })
            .ToDictionaryAsync(p => p.Id, p => p.JobNumber);

        // Get latest in-progress run per asset for start time
        var runs = await _db.AssetWorkflowRuns
            .Where(r => assetIds.Contains(r.AssetId) && !r.IsLocked)
            .OrderByDescending(r => r.StartedAt)
            .ToListAsync();

        var latestRunByAsset = runs
            .GroupBy(r => r.AssetId)
            .ToDictionary(g => g.Key, g => g.First());

        var opts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };

        var summary = assets
            .GroupBy(a => a.AssignedUserId!)
            .Select(g =>
            {
                var userId = g.Key;
                var name   = users.TryGetValue(userId, out var n) ? n : "Unknown";
                var inProgressAssets = g.Where(a => a.Status == "InProgress").ToList();

                // Distinct job numbers
                var jobNumbers = g
                    .Select(a => projects.TryGetValue(a.ProjectId, out var j) ? j : null)
                    .Where(j => j != null)
                    .Distinct()
                    .ToList()!;

                // Any unresolved issues across assets
                bool hasIssues = inProgressAssets.Any(a =>
                {
                    if (string.IsNullOrEmpty(a.IssuesJson) || a.IssuesJson == "[]") return false;
                    try
                    {
                        var issues = JsonSerializer.Deserialize<List<JsonElement>>(a.IssuesJson, opts) ?? [];
                        return issues.Any(i =>
                        {
                            i.TryGetProperty("resolved", out var r);
                            return r.ValueKind != JsonValueKind.True;
                        });
                    }
                    catch { return false; }
                });

                // Step progress from in-progress workflow runs
                int completedSteps = 0, totalSteps = 0;
                foreach (var asset in inProgressAssets)
                {
                    if (!latestRunByAsset.TryGetValue(asset.Id, out var run)) continue;
                    try
                    {
                        var results = JsonSerializer.Deserialize<JsonElement[]>(run.StepResultsJson ?? "[]", opts);
                        completedSteps += results?.Length ?? 0;
                    }
                    catch { }
                    try
                    {
                        using var doc = JsonDocument.Parse(run.WorkflowSnapshotJson ?? "{}");
                        if (doc.RootElement.TryGetProperty("steps", out var steps))
                            totalSteps += steps.GetArrayLength();
                    }
                    catch { }
                }

                // Earliest start time for in-progress assets
                DateTime? startedAt = inProgressAssets
                    .Select(a => latestRunByAsset.TryGetValue(a.Id, out var r) ? r.StartedAt : (DateTime?)null)
                    .Where(d => d != null)
                    .OrderBy(d => d)
                    .FirstOrDefault();

                return new WorkloadSummaryDto(
                    userId, name,
                    g.Count(a => a.Status == "NotStarted"),
                    inProgressAssets.Count(a => latestRunByAsset.TryGetValue(a.Id, out var run) && run.Status == "InProgress"),
                    inProgressAssets.Count(a => latestRunByAsset.TryGetValue(a.Id, out var run) && run.Status == "Paused"),
                    g.Count(),
                    jobNumbers!,
                    hasIssues,
                    completedSteps,
                    totalSteps,
                    startedAt?.ToString("o"));
            })
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

        return Ok(await MapAssetsToDtosAsync(assets));
    }

    // GET api/project-assets/by-product/{productId}
    [HttpGet("by-product/{productId}")]
    public async Task<ActionResult<IEnumerable<ProjectAssetDto>>> GetByProduct(string productId)
    {
        var assets = await _db.ProjectAssets
            .Where(a => a.ProductId == productId)
            .OrderByDescending(a => a.CreatedAt)
            .ToListAsync();

        return Ok(await MapAssetsToDtosAsync(assets));
    }

    // GET api/project-assets/{id}
    [HttpGet("{id}")]
    public async Task<ActionResult<ProjectAssetDto>> GetById(string id)
    {
        var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == id);
        if (asset is null) return NotFound();
        return Ok(await ToDtoAsync(asset));
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
        return CreatedAtAction(nameof(GetById), new { id = asset.Id }, await ToDtoAsync(asset));
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
        return Ok(await MapAssetsToDtosAsync(created));
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
        return Ok(await ToDtoAsync(asset));
    }

    // PATCH api/project-assets/{id}/issues — update issuesJson only; open to all authenticated users (Engineers, Installers, etc.)
    [HttpPatch("{id}/issues")]
    public async Task<ActionResult<ProjectAssetDto>> PatchIssues(string id, [FromBody] PatchIssuesRequest request)
    {
        var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == id);
        if (asset is null) return NotFound();

        asset.IssuesJson = string.IsNullOrWhiteSpace(request.IssuesJson) ? "[]" : request.IssuesJson;
        asset.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(await ToDtoAsync(asset));
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

    private async Task<List<ProjectAssetDto>> MapAssetsToDtosAsync(IEnumerable<ProjectAssetEntity> assets)
    {
        var assetList = assets.ToList();
        var summaries = await BuildWorkflowSummariesAsync(assetList);
        return assetList.Select(asset => ToDto(asset, summaries.GetValueOrDefault(asset.Id))).ToList();
    }

    private async Task<ProjectAssetDto> ToDtoAsync(ProjectAssetEntity asset)
    {
        var summaries = await BuildWorkflowSummariesAsync([asset]);
        return ToDto(asset, summaries.GetValueOrDefault(asset.Id));
    }

    private async Task<Dictionary<string, ProjectAssetWorkflowSummaryDto>> BuildWorkflowSummariesAsync(IEnumerable<ProjectAssetEntity> assets)
    {
        var assetList = assets.ToList();
        if (assetList.Count == 0) return new();

        var assetIds = assetList.Select(a => a.Id).Distinct().ToList();
        var latestRuns = await _db.AssetWorkflowRuns
            .Where(r => assetIds.Contains(r.AssetId))
            .OrderByDescending(r => r.StartedAt)
            .ThenByDescending(r => r.UpdatedAt)
            .ToListAsync();

        var latestRunByAsset = latestRuns
            .GroupBy(r => r.AssetId)
            .ToDictionary(g => g.Key, g => g.First());

        var summaries = new Dictionary<string, ProjectAssetWorkflowSummaryDto>(assetIds.Count);
        foreach (var asset in assetList)
        {
            latestRunByAsset.TryGetValue(asset.Id, out var latestRun);
            summaries[asset.Id] = BuildWorkflowSummary(asset, latestRun);
        }

        return summaries;
    }

    private static ProjectAssetWorkflowSummaryDto BuildWorkflowSummary(ProjectAssetEntity asset, AssetWorkflowRunEntity? latestRun)
    {
        var hasWorkflow = !string.IsNullOrWhiteSpace(asset.ProductConfigId)
            || !string.IsNullOrWhiteSpace(asset.WorkflowTemplateId)
            || latestRun is not null;

        if (latestRun is null)
        {
            return new ProjectAssetWorkflowSummaryDto(
                hasWorkflow,
                hasWorkflow ? "Pending" : "None",
                0,
                0,
                0,
                null,
                null,
                false,
                null,
                HasOpenIssues(asset.IssuesJson),
                null,
                null
            );
        }

        var counts = CountWorkflowEvidence(latestRun.WorkflowSnapshotJson, latestRun.StepResultsJson);
        var hasOpenIssues = HasOpenIssues(latestRun.IssuesJson) || HasOpenIssues(asset.IssuesJson);

        var evidenceStatus = "Pending";
        if (string.Equals(latestRun.Status, "Paused", StringComparison.OrdinalIgnoreCase))
        {
            evidenceStatus = "Paused";
        }
        else if (!latestRun.IsLocked || string.Equals(latestRun.Status, "InProgress", StringComparison.OrdinalIgnoreCase))
        {
            evidenceStatus = "Running";
        }
        else if (counts.MissingItems > 0)
        {
            evidenceStatus = "MissingData";
        }
        else
        {
            evidenceStatus = "Complete";
        }

        return new ProjectAssetWorkflowSummaryDto(
            true,
            evidenceStatus,
            counts.RequiredItems,
            counts.CompletedItems,
            counts.MissingItems,
            latestRun.Id,
            latestRun.Status,
            latestRun.IsLocked,
            latestRun.SignatureStatus,
            hasOpenIssues,
            latestRun.StartedAt,
            latestRun.CompletedAt
        );
    }

    private static bool HasOpenIssues(string? issuesJson)
    {
        if (string.IsNullOrWhiteSpace(issuesJson) || issuesJson == "[]") return false;
        try
        {
            var issues = JsonSerializer.Deserialize<List<JsonElement>>(issuesJson, _json) ?? [];
            return issues.Any(issue =>
                !issue.TryGetProperty("resolved", out var resolvedEl) ||
                resolvedEl.ValueKind != JsonValueKind.True);
        }
        catch
        {
            return false;
        }
    }

    private static (int RequiredItems, int CompletedItems, int MissingItems) CountWorkflowEvidence(string? workflowSnapshotJson, string? stepResultsJson)
    {
        var stepsById = ParseWorkflowSteps(workflowSnapshotJson)
            .Where(step => !string.IsNullOrWhiteSpace(step.Id))
            .ToDictionary(step => step.Id, step => step);

        if (stepsById.Count == 0 || string.IsNullOrWhiteSpace(stepResultsJson))
            return (0, 0, 0);

        try
        {
            var results = JsonSerializer.Deserialize<List<WorkflowStepResultSummary>>(stepResultsJson, _json) ?? [];
            int requiredItems = 0;
            int completedItems = 0;

            foreach (var result in results.Where(r => !string.Equals(r.StepId, "__nav__", StringComparison.OrdinalIgnoreCase)))
            {
                if (string.IsNullOrWhiteSpace(result.StepId) || !stepsById.TryGetValue(result.StepId, out var step))
                    continue;

                var values = result.Values ?? new Dictionary<string, string>();

                foreach (var input in step.Inputs ?? [])
                {
                    var raw = values.GetValueOrDefault(input.Id);
                    if (string.Equals(input.Type, "photo", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(input.Type, "video", StringComparison.OrdinalIgnoreCase))
                    {
                        requiredItems++;
                        if (GetMediaCaptureCount(raw) > 0) completedItems++;
                        continue;
                    }

                    if (input.Required && HasInputValue(input, raw))
                    {
                        requiredItems++;
                        completedItems++;
                    }
                    else if (input.Required)
                    {
                        requiredItems++;
                    }
                }

                foreach (var field in step.CaptureFields ?? [])
                {
                    if (!field.Required) continue;
                    requiredItems++;
                    if (!string.IsNullOrWhiteSpace(values.GetValueOrDefault(field.Id)))
                        completedItems++;
                }
            }

            return (requiredItems, completedItems, Math.Max(requiredItems - completedItems, 0));
        }
        catch
        {
            return (0, 0, 0);
        }
    }

    private static List<WorkflowStepSummary> ParseWorkflowSteps(string? workflowSnapshotJson)
    {
        if (string.IsNullOrWhiteSpace(workflowSnapshotJson)) return [];

        try
        {
            using var snapshotDoc = JsonDocument.Parse(workflowSnapshotJson);
            if (!snapshotDoc.RootElement.TryGetProperty("stepsJson", out var stepsJsonEl))
                return [];

            var stepsRaw = stepsJsonEl.GetString();
            if (string.IsNullOrWhiteSpace(stepsRaw)) return [];

            using var stepsDoc = JsonDocument.Parse(stepsRaw);
            if (stepsDoc.RootElement.ValueKind == JsonValueKind.Array)
            {
                return JsonSerializer.Deserialize<List<WorkflowStepSummary>>(stepsDoc.RootElement.GetRawText(), _json) ?? [];
            }

            if (stepsDoc.RootElement.ValueKind == JsonValueKind.Object
                && stepsDoc.RootElement.TryGetProperty("steps", out var stepsEl)
                && stepsEl.ValueKind == JsonValueKind.Array)
            {
                return JsonSerializer.Deserialize<List<WorkflowStepSummary>>(stepsEl.GetRawText(), _json) ?? [];
            }
        }
        catch { }

        return [];
    }

    private static bool HasInputValue(WorkflowInputSummary input, string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return false;

        if (string.Equals(input.Type, "component", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                var parsed = JsonSerializer.Deserialize<Dictionary<string, string>>(raw, _json) ?? new();
                return parsed.Values.Any(value => !string.IsNullOrWhiteSpace(value));
            }
            catch
            {
                return false;
            }
        }

        return !string.IsNullOrWhiteSpace(raw);
    }

    private static int GetMediaCaptureCount(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return 0;
        if (raw.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase)
            || raw.StartsWith("data:video/", StringComparison.OrdinalIgnoreCase))
        {
            return 1;
        }

        try
        {
            var parsed = JsonSerializer.Deserialize<List<string>>(raw, _json) ?? [];
            return parsed.Count(value => !string.IsNullOrWhiteSpace(value));
        }
        catch
        {
            return 0;
        }
    }

    private static ProjectAssetDto ToDto(ProjectAssetEntity a, ProjectAssetWorkflowSummaryDto? workflowSummary) =>
        new(a.Id, a.ProjectId, a.ProductId, a.ProductConfigId, a.WorkflowTemplateId,
            a.AssetTag, a.AssetName, a.SerialNumber, a.AssetModel, a.Manufacturer,
            a.Location, a.AssignedUserId, a.Status, a.WorkOrderId, a.Notes,
            a.FeatureValuesJson, a.IssuesJson, a.ConfigLabel, a.InstalledAt, a.InstalledBy,
            a.AsBuiltJson, a.CreatedAt, a.UpdatedAt, workflowSummary);

    private sealed class WorkflowStepSummary
    {
        [System.Text.Json.Serialization.JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;
        [System.Text.Json.Serialization.JsonPropertyName("inputs")]
        public List<WorkflowInputSummary>? Inputs { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("captureFields")]
        public List<WorkflowCaptureFieldSummary>? CaptureFields { get; set; }
    }

    private sealed class WorkflowInputSummary
    {
        [System.Text.Json.Serialization.JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;
        [System.Text.Json.Serialization.JsonPropertyName("type")]
        public string Type { get; set; } = string.Empty;
        [System.Text.Json.Serialization.JsonPropertyName("required")]
        public bool Required { get; set; }
    }

    private sealed class WorkflowCaptureFieldSummary
    {
        [System.Text.Json.Serialization.JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;
        [System.Text.Json.Serialization.JsonPropertyName("required")]
        public bool Required { get; set; }
    }

    private sealed class WorkflowStepResultSummary
    {
        [System.Text.Json.Serialization.JsonPropertyName("stepId")]
        public string StepId { get; set; } = string.Empty;
        [System.Text.Json.Serialization.JsonPropertyName("values")]
        public Dictionary<string, string>? Values { get; set; }
    }
}
