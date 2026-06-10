using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/asset-workflow-runs")]
[Authorize]
public class AssetWorkflowRunsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly NotificationFeedService _feed;
    private readonly ILogger<AssetWorkflowRunsController> _logger;
    public AssetWorkflowRunsController(AppDbContext db, NotificationFeedService feed, ILogger<AssetWorkflowRunsController> logger)
    {
        _db = db;
        _feed = feed;
        _logger = logger;
    }

    private sealed class RunTimeEntry
    {
        [System.Text.Json.Serialization.JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();
        [System.Text.Json.Serialization.JsonPropertyName("category")]
        public string Category { get; set; } = "productive";
        [System.Text.Json.Serialization.JsonPropertyName("startedAtUtc")]
        public DateTime StartedAtUtc { get; set; } = DateTime.UtcNow;
        [System.Text.Json.Serialization.JsonPropertyName("endedAtUtc")]
        public DateTime? EndedAtUtc { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("reason")]
        public string? Reason { get; set; }
    }

    private static readonly JsonSerializerOptions _caseInsensitive = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private static string NormalizeRunStatus(string raw)
    {
        var value = raw.Trim().ToLowerInvariant().Replace("-", "").Replace("_", "").Replace(" ", "");
        return value switch
        {
            "inprogress" => "InProgress",
            "paused" => "Paused",
            "complete" or "completed" => "Complete",
            "issue" => "Issue",
            _ => raw
        };
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

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? projectId,
        [FromQuery] string? assetId,
        [FromQuery] string? workflowType,
        [FromQuery] string? workflowTypeId,
        [FromQuery] string? status)
    {
        var query = _db.AssetWorkflowRuns.AsQueryable();

        if (!string.IsNullOrWhiteSpace(assetId))
        {
            query = query.Where(r => r.AssetId == assetId);
        }
        else if (!string.IsNullOrWhiteSpace(projectId))
        {
            var projectAssetIds = await _db.ProjectAssets
                .Where(a => a.ProjectId == projectId)
                .Select(a => a.Id)
                .ToListAsync();
            query = query.Where(r => projectAssetIds.Contains(r.AssetId));
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            var normalizedStatus = NormalizeRunStatus(status);
            query = query.Where(r => r.Status == normalizedStatus);
        }

        var runs = await query
            .OrderByDescending(r => r.StartedAt)
            .ThenByDescending(r => r.UpdatedAt)
            .ToListAsync();

        if (runs.Count == 0)
        {
            return Ok(Array.Empty<AssetWorkflowRunListItemDto>());
        }

        var assetIds = runs.Select(r => r.AssetId).Distinct().ToList();
        var configIds = runs.Select(r => r.WorkflowConfigId).Distinct().ToList();

        var assets = await _db.ProjectAssets
            .Where(a => assetIds.Contains(a.Id))
            .ToListAsync();
        var assetsById = assets.ToDictionary(a => a.Id);

        var configs = await _db.WorkflowConfigs
            .Where(c => configIds.Contains(c.Id))
            .ToListAsync();
        var configsById = configs.ToDictionary(c => c.Id);

        var assignments = await _db.AssetWorkflowAssignments
            .Where(a => assetIds.Contains(a.AssetId) && configIds.Contains(a.WorkflowConfigId) && a.Active)
            .ToListAsync();

        var typeIds = assignments.Select(a => a.WorkflowTypeId)
            .Concat(configs.Where(c => !string.IsNullOrWhiteSpace(c.WorkflowTypeId)).Select(c => c.WorkflowTypeId!))
            .Distinct()
            .ToList();
        var typesById = await _db.WorkflowTypes
            .Where(t => typeIds.Contains(t.Id))
            .ToDictionaryAsync(t => t.Id, t => t.Name);

        var userIds = assets.Where(a => !string.IsNullOrWhiteSpace(a.AssignedUserId)).Select(a => a.AssignedUserId!).Distinct().ToList();
        var usersById = await _db.Users
            .Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.FullName);

        var items = runs.Select(run =>
        {
            assetsById.TryGetValue(run.AssetId, out var asset);
            configsById.TryGetValue(run.WorkflowConfigId, out var config);
            var assignment = assignments.FirstOrDefault(a => a.AssetId == run.AssetId && a.WorkflowConfigId == run.WorkflowConfigId);
            var resolvedWorkflowTypeId = assignment?.WorkflowTypeId ?? config?.WorkflowTypeId;
            var resolvedWorkflowTypeName =
                (resolvedWorkflowTypeId != null && typesById.TryGetValue(resolvedWorkflowTypeId, out var knownType) ? knownType : null)
                ?? config?.ConfigType
                ?? "Workflow";
            var assignedTo = asset?.AssignedUserId is { Length: > 0 } assignedUserId && usersById.TryGetValue(assignedUserId, out var fullName)
                ? fullName
                : null;

            return new AssetWorkflowRunListItemDto(
                run.Id,
                run.AssetId,
                asset?.ProjectId ?? string.Empty,
                run.WorkflowConfigId,
                resolvedWorkflowTypeId,
                resolvedWorkflowTypeName,
                asset?.AssetName ?? asset?.AssetTag,
                asset?.AssignedUserId,
                assignedTo,
                run.Status,
                run.IsLocked,
                run.StartedAt,
                run.CompletedAt,
                run.UpdatedAt
            );
        });

        if (!string.IsNullOrWhiteSpace(workflowTypeId))
        {
            items = items.Where(i => i.WorkflowTypeId == workflowTypeId);
        }

        if (!string.IsNullOrWhiteSpace(workflowType))
        {
            items = items.Where(i => string.Equals(i.WorkflowTypeName, workflowType, StringComparison.OrdinalIgnoreCase));
        }

        return Ok(items.ToList());
    }

    // GET api/asset-workflow-runs/by-project/{projectId} — latest run per asset for a project
    [HttpGet("by-project/{projectId}")]
    public async Task<IActionResult> ListByProject(string projectId)
    {
        try
        {
            var assetIds = await _db.ProjectAssets
                .Where(a => a.ProjectId == projectId)
                .Select(a => a.Id)
                .ToListAsync();

            var runs = await _db.AssetWorkflowRuns
                .Where(r => assetIds.Contains(r.AssetId))
                .OrderByDescending(r => r.StartedAt)
                .ToListAsync();

            // Return only the latest run per asset per workflow config
            var latest = runs
                .GroupBy(r => new { r.AssetId, r.WorkflowConfigId })
                .Select(g => g.First())
                .ToList();

            return Ok(latest.Select(ToDto));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to list workflow runs for project {ProjectId}", projectId);
            return Ok(Array.Empty<AssetWorkflowRunDto>());
        }
    }

    // GET api/asset-workflow-runs/open-issues — all unresolved issues across every run, with project context
    // Optional ?userId={id} filters to issues on assets assigned to that user
    [HttpGet("open-issues")]
    public async Task<IActionResult> GetOpenIssues([FromQuery] string? userId = null)
    {
        try
        {
            // If userId is provided, only consider assets assigned to that user
            var assignedAssetIds = !string.IsNullOrWhiteSpace(userId)
                ? await _db.ProjectAssets
                    .Where(a => a.AssignedUserId == userId)
                    .Select(a => a.Id)
                    .ToListAsync()
                : null;

            var runs = await _db.AssetWorkflowRuns
                .Where(r => r.IssuesJson != null && r.IssuesJson != "[]" && r.IssuesJson != "")
                .ToListAsync();

            var assetIds = runs.Select(r => r.AssetId).Distinct().ToList();
            
            // Filter runs to only those on user's assigned assets if userId provided
            if (assignedAssetIds is not null)
            {
                assetIds = assetIds.Intersect(assignedAssetIds).ToList();
                runs = runs.Where(r => assetIds.Contains(r.AssetId)).ToList();
            }

            var assets   = await _db.ProjectAssets.Where(a => assetIds.Contains(a.Id)).ToListAsync();

            var projectIds = assets.Select(a => a.ProjectId).Distinct().ToList();
            var projects   = await _db.Projects.Where(p => projectIds.Contains(p.Id)).ToListAsync();

            var result = new List<OpenIssueDto>();
            var opts   = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };

            // ── 1. Workflow-run issues ─────────────────────────────────────
            foreach (var run in runs)
            {
                var asset   = assets.FirstOrDefault(a => a.Id == run.AssetId);
                if (asset is null) continue;
                var project = projects.FirstOrDefault(p => p.Id == asset.ProjectId);

                List<JsonElement> issues;
                try { issues = JsonSerializer.Deserialize<List<JsonElement>>(run.IssuesJson, opts) ?? []; }
                catch { continue; }

                foreach (var iss in issues)
                {
                    if (iss.TryGetProperty("resolved", out var resolvedEl) && resolvedEl.GetBoolean()) continue;

                    string Get(string key) => iss.TryGetProperty(key, out var el) ? el.GetString() ?? "" : "";
                    bool   GetBool(string key) => iss.TryGetProperty(key, out var el) && el.GetBoolean();

                    result.Add(new OpenIssueDto(
                        IssueId:      Get("id"),
                        Description:  Get("description"),
                        IssueType:    Get("issueType"),
                        Severity:     Get("severity"),
                        IsBlocking:   GetBool("isBlocking"),
                        ReportedAt:   Get("reportedAt"),
                        CreatedBy:    Get("createdBy"),
                        StepTitle:    Get("stepTitle"),
                        RunId:        run.Id,
                        AssetId:      asset.Id,
                        AssetTag:     asset.AssetTag,
                        AssetName:    asset.AssetName ?? asset.AssetTag,
                        AssetLocation: asset.Location ?? "",
                        ProjectId:    asset.ProjectId,
                        JobNumber:    project?.JobNumber ?? "",
                        CustomerName: project?.CustomerName ?? "",
                        Source:       "run"
                    ));
                }
            }

            // ── 2. Manually-added asset-level issues ──────────────────────
            var assetsWithIssuesQuery = _db.ProjectAssets
                .Where(a => a.IssuesJson != null && a.IssuesJson != "[]" && a.IssuesJson != "");

            // Filter to user's assigned assets if userId provided
            if (assignedAssetIds is not null)
            {
                assetsWithIssuesQuery = assetsWithIssuesQuery.Where(a => assignedAssetIds.Contains(a.Id));
            }

            var assetsWithIssues = await assetsWithIssuesQuery.ToListAsync();

            var assetProjectIds2 = assetsWithIssues.Select(a => a.ProjectId).Distinct().ToList();
            var projects2 = await _db.Projects.Where(p => assetProjectIds2.Contains(p.Id)).ToListAsync();

            foreach (var asset in assetsWithIssues)
            {
                var project = projects2.FirstOrDefault(p => p.Id == asset.ProjectId);

                List<JsonElement> issues;
                try { issues = JsonSerializer.Deserialize<List<JsonElement>>(asset.IssuesJson!, opts) ?? []; }
                catch { continue; }

                foreach (var iss in issues)
                {
                    if (iss.TryGetProperty("resolved", out var resolvedEl) && resolvedEl.GetBoolean()) continue;

                    string Get(string key) => iss.TryGetProperty(key, out var el) ? el.GetString() ?? "" : "";
                    bool   GetBool(string key) => iss.TryGetProperty(key, out var el) && el.GetBoolean();

                    result.Add(new OpenIssueDto(
                        IssueId:      Get("id"),
                        Description:  Get("description"),
                        IssueType:    Get("issueType"),
                        Severity:     Get("severity"),
                        IsBlocking:   GetBool("isBlocking"),
                        ReportedAt:   Get("reportedAt"),
                        CreatedBy:    Get("createdBy"),
                        StepTitle:    null,
                        RunId:        "",
                        AssetId:      asset.Id,
                        AssetTag:     asset.AssetTag,
                        AssetName:    asset.AssetName ?? asset.AssetTag,
                        AssetLocation: asset.Location ?? "",
                        ProjectId:    asset.ProjectId,
                        JobNumber:    project?.JobNumber ?? "",
                        CustomerName: project?.CustomerName ?? "",
                        Source:       "asset"
                    ));
                }
            }

            var severityOrder = new Dictionary<string, int> { ["high"] = 0, ["medium"] = 1, ["low"] = 2 };
            result.Sort((a, b) =>
            {
                if (a.IsBlocking != b.IsBlocking) return a.IsBlocking ? -1 : 1;
                var sa = severityOrder.GetValueOrDefault(a.Severity, 3);
                var sb = severityOrder.GetValueOrDefault(b.Severity, 3);
                if (sa != sb) return sa.CompareTo(sb);
                return string.Compare(b.ReportedAt, a.ReportedAt, StringComparison.Ordinal);
            });

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to aggregate open issues");
            return Ok(Array.Empty<OpenIssueDto>());
        }
    }

    // GET api/asset-workflow-runs/by-asset/{assetId}
    [HttpGet("by-asset/{assetId}")]
    public async Task<IActionResult> ListByAsset(string assetId)
    {
        try
        {
            var runs = await _db.AssetWorkflowRuns
                .Where(r => r.AssetId == assetId)
                .OrderByDescending(r => r.StartedAt)
                .ToListAsync();
            return Ok(runs.Select(ToDto));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to list workflow runs for asset {AssetId}", assetId);
            return Ok(Array.Empty<AssetWorkflowRunDto>());
        }
    }

    // GET api/asset-workflow-runs/{id}
    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        var run = await _db.AssetWorkflowRuns.FirstOrDefaultAsync(r => r.Id == id);
        if (run is null) return NotFound();
        return Ok(ToDto(run));
    }

    // POST api/asset-workflow-runs  — start a new run (takes snapshot of config)
    [HttpPost]
    public async Task<IActionResult> StartRun([FromBody] StartRunRequest req)
    {
        var config = await _db.WorkflowConfigs.FirstOrDefaultAsync(c => c.Id == req.WorkflowConfigId);
        if (config is null) return BadRequest(new { message = "WorkflowConfig not found." });
        if (config.Status != "Published")
            return BadRequest(new { message = "Only Published configurations can be executed." });

        // Idempotent: return existing active (non-locked) run so progress is preserved across sessions
        var existingRun = await _db.AssetWorkflowRuns
            .Where(r => r.AssetId == req.AssetId && r.WorkflowConfigId == req.WorkflowConfigId && !r.IsLocked)
            .OrderByDescending(r => r.StartedAt)
            .FirstOrDefaultAsync();
        if (existingRun is not null)
            return Ok(ToDto(existingRun));

        // Snapshot: freeze the full config at this moment
        var snapshot = JsonSerializer.Serialize(new
        {
            id                   = config.Id,
            name                 = config.Name,
            version              = config.Version,
            stepsJson            = config.StepsJson,
            mediaJson            = config.MediaJson,
            featureSelectionsJson = config.FeatureSelectionsJson,
            snapshotAt           = DateTime.UtcNow,
        });

        var runCount = await _db.AssetWorkflowRuns
            .CountAsync(r => r.AssetId == req.AssetId && r.WorkflowConfigId == req.WorkflowConfigId);

        var now = DateTime.UtcNow;
        var run = new AssetWorkflowRunEntity
        {
            Id                   = Guid.NewGuid().ToString(),
            AssetId              = req.AssetId,
            WorkflowConfigId     = req.WorkflowConfigId,
            WorkflowVersion      = config.Version,
            WorkflowSnapshotJson = snapshot,
            Status               = "InProgress",
            IsLocked             = false,
            TechnicianUserId     = req.TechnicianUserId,
            StepResultsJson      = "[]",
            IssuesJson           = "[]",
            TimeTrackingJson     = "[]",
            ProductiveSeconds    = 0,
            DowntimeSeconds      = 0,
            DowntimeEvents       = 0,
            RunNumber            = runCount + 1,
            StartedAt            = now,
            CreatedAt            = now,
            UpdatedAt            = now,
        };
        StartProductivePeriod(run, now, "Run started");
        _db.AssetWorkflowRuns.Add(run);

        // Update asset status to InProgress whenever a new run is created
        var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == req.AssetId);
        if (asset is not null)
        {
            asset.Status    = "InProgress";
            asset.UpdatedAt = now;
        }

        await _db.SaveChangesAsync();
        await NotifyRunEventAsync(
            run,
            "workflow-started",
            "info",
            "Workflow started",
            $"{ResolveActorName()} started workflow for asset {{asset}} on job {{job}}.",
            notifyInstaller: false);
        return CreatedAtAction(nameof(GetById), new { id = run.Id }, ToDto(run));
    }

    // PUT api/asset-workflow-runs/{id}  — save progress (blocked if locked)
    [HttpPut("{id}")]
    public async Task<IActionResult> SaveProgress(string id, [FromBody] SaveRunProgressRequest req)
    {
        var run = await _db.AssetWorkflowRuns.FirstOrDefaultAsync(r => r.Id == id);
        if (run is null) return NotFound();
        if (run.IsLocked)
            return BadRequest(new { message = "This run is locked (completed). Re-run to create a new run." });
        var previousStatus = run.Status;
        var previousIssuesJson = run.IssuesJson;

        run.StepResultsJson = req.StepResultsJson;
        if (req.IssuesJson is not null) run.IssuesJson = req.IssuesJson;
        if (req.Status is not null)     run.Status     = req.Status;
        run.UpdatedAt = DateTime.UtcNow;
        ApplyStatusDrivenTimeTracking(run, req.Status, run.UpdatedAt);
        RecomputeRunTimeMetrics(run, run.UpdatedAt);

        // Update asset status based on current open issues in this run
        if (req.IssuesJson is not null)
        {
            var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == run.AssetId);
            if (asset is not null && asset.Status != "NotStarted")
            {
                var issues = ParseIssues(req.IssuesJson);
                var hasOpenIssues = issues.Any(i =>
                    i.TryGetProperty("resolved", out var r) && !r.GetBoolean());
                asset.Status    = hasOpenIssues ? "Issue" : "InProgress";
                asset.UpdatedAt = DateTime.UtcNow;
            }
        }

        await _db.SaveChangesAsync();
        if (!string.Equals(previousStatus, run.Status, StringComparison.OrdinalIgnoreCase))
        {
            var eventType = run.Status switch
            {
                "Paused" => "workflow-paused",
                "InProgress" => "workflow-resumed",
                "Issue" => "workflow-issue",
                _ => "workflow-updated"
            };
            var severity = run.Status == "Issue" ? "warning" : "info";
            var title = run.Status switch
            {
                "Paused" => "Workflow paused",
                "InProgress" => "Workflow resumed",
                "Issue" => "Workflow issue raised",
                _ => $"Workflow status changed to {run.Status}"
            };
            await NotifyRunEventAsync(
                run,
                eventType,
                severity,
                title,
                $"{ResolveActorName()} changed workflow status to {run.Status} for asset {{asset}} on job {{job}}.",
                notifyInstaller: run.Status is "Issue" or "Paused");
        }

        if (req.IssuesJson is not null && CountOpenIssues(req.IssuesJson) > CountOpenIssues(previousIssuesJson))
        {
            await NotifyRunEventAsync(
                run,
                "workflow-issue",
                "warning",
                "New workflow issue",
                $"{ResolveActorName()} added or reopened issues for asset {{asset}} on job {{job}}.",
                notifyInstaller: true);
        }
        return Ok(ToDto(run));
    }

    // POST api/asset-workflow-runs/{id}/complete
    [HttpPost("{id}/complete")]
    public async Task<IActionResult> CompleteRun(string id, [FromBody] CompleteRunRequest req)
    {
        var run = await _db.AssetWorkflowRuns.FirstOrDefaultAsync(r => r.Id == id);
        if (run is null) return NotFound();
        if (run.IsLocked)
            return BadRequest(new { message = "This run is already locked." });

        // Check for unresolved BLOCKING issues
        var issues = ParseIssues(req.IssuesJson);
        var blockingOpen = issues.Count(i =>
            i.TryGetProperty("isBlocking", out var b) && b.GetBoolean() &&
            i.TryGetProperty("resolved",   out var r) && !r.GetBoolean());

        if (blockingOpen > 0)
            return UnprocessableEntity(new
            {
                message = $"Cannot complete: {blockingOpen} blocking issue(s) must be resolved first.",
                blockingCount = blockingOpen
            });

        var now = DateTime.UtcNow;
        run.StepResultsJson  = req.StepResultsJson;
        run.IssuesJson       = req.IssuesJson;
        run.Status           = "Complete";
        run.IsLocked         = true;
        run.CompletedByName  = req.CompletedByName;
        run.SignatureStatus  = "PendingInstaller";
        run.CompletedAt      = now;
        run.UpdatedAt        = now;
        if (!string.IsNullOrWhiteSpace(req.BomActualJson))
            run.BomActualJson = req.BomActualJson;
        CloseAnyOpenTimeEntry(run, now);
        RecomputeRunTimeMetrics(run, now);

        // Update asset status — Complete only if no open issues remain across all runs
        var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == run.AssetId);
        if (asset is not null)
        {
            // Check all runs for this asset for any open issues (blocking OR non-blocking)
            var allRuns    = await _db.AssetWorkflowRuns.Where(r => r.AssetId == run.AssetId).ToListAsync();
            var anyBlock   = allRuns.Any(r =>
                ParseIssues(r.IssuesJson).Any(i =>
                    i.TryGetProperty("isBlocking", out var b) && b.GetBoolean() &&
                    i.TryGetProperty("resolved",   out var rv) && !rv.GetBoolean()));
            var anyOpenIssue = allRuns.Any(r =>
                ParseIssues(r.IssuesJson).Any(i =>
                    i.TryGetProperty("resolved", out var rv) && !rv.GetBoolean()));

            asset.Status    = anyOpenIssue ? "Issue" : "Complete";
            asset.UpdatedAt = now;
            // Record who completed the installation and when (only on first successful completion)
            if (!anyBlock && asset.InstalledAt is null)
            {
                asset.InstalledAt = now;
                asset.InstalledBy = req.CompletedByName;
            }
            // Build as-built JSON from capture fields defined in the workflow snapshot
            if (!anyBlock)
            {
                asset.AsBuiltJson = BuildAsBuiltJson(run.WorkflowSnapshotJson, req.StepResultsJson, now);
            }
        }

        await _db.SaveChangesAsync();
        await NotifyRunEventAsync(
            run,
            "workflow-completed",
            "success",
            "Workflow completed",
            $"{(req.CompletedByName ?? ResolveActorName())} completed workflow for asset {{asset}} on job {{job}}.",
            notifyInstaller: false);
        if (asset is not null && string.Equals(asset.Status, "Complete", StringComparison.OrdinalIgnoreCase))
        {
            await NotifyAssetEventAsync(
                asset,
                "asset-completed",
                "success",
                "Asset completed",
                $"{asset.AssetTag} was fully completed on job {{job}} by {(req.CompletedByName ?? ResolveActorName())}.",
                notifyInstaller: false,
                runId: run.Id);
        }
        return Ok(ToDto(run));
    }

    // PATCH api/asset-workflow-runs/{id}/issues — update issues on any run (inc. locked)
    [HttpPatch("{id}/issues")]
    public async Task<IActionResult> PatchIssues(string id, [FromBody] PatchIssuesRequest req)
    {
        var run = await _db.AssetWorkflowRuns.FirstOrDefaultAsync(r => r.Id == id);
        if (run is null) return NotFound();

        run.IssuesJson = req.IssuesJson ?? "[]";
        run.UpdatedAt  = DateTime.UtcNow;

        // Recalculate asset status now that issues may have changed
        var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == run.AssetId);
        if (asset is not null)
        {
            var allRuns = await _db.AssetWorkflowRuns.Where(r => r.AssetId == run.AssetId).ToListAsync();
            // Any open issue (blocking OR non-blocking) keeps the asset in "Issue" state
            var anyOpenIssue = allRuns.Any(r => {
                var json = r.Id == id ? (req.IssuesJson ?? "[]") : r.IssuesJson;
                return ParseIssues(json).Any(i =>
                    i.TryGetProperty("resolved", out var rv) && !rv.GetBoolean());
            });
            var anyLocked = allRuns.Any(r => r.IsLocked || r.Id == id);
            if (anyLocked)
            {
                asset.Status    = anyOpenIssue ? "Issue" : "Complete";
                asset.UpdatedAt = DateTime.UtcNow;
            }
        }

        await _db.SaveChangesAsync();
        if (CountOpenIssues(req.IssuesJson) > 0)
        {
            await NotifyRunEventAsync(
                run,
                "workflow-issues-updated",
                "warning",
                "Workflow issues updated",
                $"{ResolveActorName()} updated workflow issues for asset {{asset}} on job {{job}}.",
                notifyInstaller: true);
        }
        return Ok(ToDto(run));
    }

    // PATCH api/asset-workflow-runs/{id}/step-results — update step results on a locked/complete run (e.g. adding photos)
    [HttpPatch("{id}/step-results")]
    public async Task<IActionResult> PatchStepResults(string id, [FromBody] PatchStepResultsRequest req)
    {
        var run = await _db.AssetWorkflowRuns.FirstOrDefaultAsync(r => r.Id == id);
        if (run is null) return NotFound();

        run.StepResultsJson = req.StepResultsJson;
        run.UpdatedAt       = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        await NotifyRunEventAsync(
            run,
            "workflow-media-updated",
            "info",
            "Workflow media updated",
            $"{req.AmendedByName ?? ResolveActorName()} uploaded or amended workflow media for asset {{asset}} on job {{job}}.",
            notifyInstaller: false);
        return Ok(ToDto(run));
    }

    // PATCH api/asset-workflow-runs/{id}/time-entries — replace time entries (works on locked runs for retroactive correction)
    [HttpPatch("{id}/time-entries")]
    public async Task<IActionResult> PatchTimeEntries(string id, [FromBody] PatchTimeEntriesRequest req)
    {
        var run = await _db.AssetWorkflowRuns.FirstOrDefaultAsync(r => r.Id == id);
        if (run is null) return NotFound();

        run.TimeTrackingJson = req.TimeEntriesJson;
        run.UpdatedAt = DateTime.UtcNow;
        RecomputeRunTimeMetrics(run, DateTime.UtcNow);

        await _db.SaveChangesAsync();
        return Ok(ToDto(run));
    }

    // POST api/asset-workflow-runs/{id}/reopen  — Admin creates a new run from a locked run
    [HttpPost("{id}/reopen")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Reopen(string id)
    {
        var source = await _db.AssetWorkflowRuns.FirstOrDefaultAsync(r => r.Id == id);
        if (source is null) return NotFound();

        var runCount = await _db.AssetWorkflowRuns
            .CountAsync(r => r.AssetId == source.AssetId && r.WorkflowConfigId == source.WorkflowConfigId);

        var now = DateTime.UtcNow;
        var newRun = new AssetWorkflowRunEntity
        {
            Id                   = Guid.NewGuid().ToString(),
            AssetId              = source.AssetId,
            WorkflowConfigId     = source.WorkflowConfigId,
            WorkflowVersion      = source.WorkflowVersion,
            WorkflowSnapshotJson = source.WorkflowSnapshotJson, // use same snapshot
            Status               = "InProgress",
            IsLocked             = false,
            StepResultsJson      = "[]",
            IssuesJson           = "[]",
            TimeTrackingJson     = "[]",
            ProductiveSeconds    = 0,
            DowntimeSeconds      = 0,
            DowntimeEvents       = 0,
            RunNumber            = runCount + 1,
            StartedAt            = now,
            CreatedAt            = now,
            UpdatedAt            = now,
        };
        StartProductivePeriod(newRun, now, "Re-run started");
        _db.AssetWorkflowRuns.Add(newRun);

        var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == source.AssetId);
        if (asset is not null && asset.Status == "Complete")
        {
            asset.Status    = "InProgress";
            asset.UpdatedAt = now;
        }

        await _db.SaveChangesAsync();
        await NotifyRunEventAsync(
            newRun,
            "workflow-reopened",
            "warning",
            "Workflow reopened",
            $"{ResolveActorName()} reopened workflow for asset {{asset}} on job {{job}}.",
            notifyInstaller: false);
        return CreatedAtAction(nameof(GetById), new { id = newRun.Id }, ToDto(newRun));
    }

    // POST api/asset-workflow-runs/{id}/time-entry
    [HttpPost("{id}/time-entry")]
    public async Task<IActionResult> TrackTimeEntry(string id, [FromBody] TrackRunTimeRequest req)
    {
        var run = await _db.AssetWorkflowRuns.FirstOrDefaultAsync(r => r.Id == id);
        if (run is null) return NotFound();
        if (run.IsLocked)
            return BadRequest(new { message = "This run is locked (completed)." });

        var now = DateTime.UtcNow;
        var startAt = ParseUtcOr(req.StartedAtUtc, now);
        var endAt = ParseUtcOr(req.EndedAtUtc, now);
        var action = (req.Action ?? string.Empty).Trim().ToLowerInvariant();

        switch (action)
        {
            case "startproductive":
            case "resumeproductive":
                CloseOpenCategory(run, "downtime", endAt);
                StartProductivePeriod(run, startAt, req.Reason ?? "Resumed");
                run.Status = "InProgress";
                break;
            case "startdowntime":
            case "stopproductive":
                CloseOpenCategory(run, "productive", endAt);
                StartDowntimePeriod(run, startAt, req.Reason ?? "Paused");
                break;
            case "stopdowntime":
                CloseOpenCategory(run, "downtime", endAt);
                break;
            case "stopall":
            case "pause":
                // Close whatever is open (productive or downtime) → idle state
                CloseAnyOpenTimeEntry(run, endAt);
                run.Status = "Paused";
                break;
            default:
                return BadRequest(new { message = "Unknown action. Use StartProductive, ResumeProductive, StartDowntime, StopDowntime, StopAll." });
        }

        run.UpdatedAt = now;
        RecomputeRunTimeMetrics(run, now);
        await _db.SaveChangesAsync();
        if (action is "pause" or "stopall")
        {
            await NotifyRunEventAsync(
                run,
                "workflow-paused",
                "warning",
                "Workflow paused",
                $"{ResolveActorName()} paused workflow for asset {{asset}} on job {{job}}.",
                notifyInstaller: true);
        }
        else if (action is "resumeproductive" or "startproductive")
        {
            await NotifyRunEventAsync(
                run,
                "workflow-resumed",
                "info",
                "Workflow resumed",
                $"{ResolveActorName()} resumed workflow for asset {{asset}} on job {{job}}.",
                notifyInstaller: false);
        }
        return Ok(ToDto(run));
    }

    // ── helpers ───────────────────────────────────────────────────────────────
    private string ResolveActorName()
    {
        return User.Identity?.Name
            ?? User.FindFirst("email")?.Value
            ?? User.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value
            ?? "A user";
    }

    private static int CountOpenIssues(string? issuesJson)
    {
        if (string.IsNullOrWhiteSpace(issuesJson) || issuesJson == "[]")
        {
            return 0;
        }

        try
        {
            var issues = JsonSerializer.Deserialize<List<JsonElement>>(issuesJson) ?? [];
            return issues.Count(issue =>
                !issue.TryGetProperty("resolved", out var resolved) ||
                resolved.ValueKind != JsonValueKind.True);
        }
        catch
        {
            return 0;
        }
    }

    private async Task NotifyRunEventAsync(
        AssetWorkflowRunEntity run,
        string eventType,
        string severity,
        string title,
        string template,
        bool notifyInstaller)
    {
        var asset = await _db.ProjectAssets.AsNoTracking().FirstOrDefaultAsync(a => a.Id == run.AssetId);
        if (asset is null) return;
        await NotifyAssetEventAsync(asset, eventType, severity, title, template, notifyInstaller, run.Id);
    }

    private async Task NotifyAssetEventAsync(
        ProjectAssetEntity asset,
        string eventType,
        string severity,
        string title,
        string template,
        bool notifyInstaller,
        string? runId)
    {
        var project = await _db.Projects.AsNoTracking().FirstOrDefaultAsync(p => p.Id == asset.ProjectId);
        var message = template
            .Replace("{asset}", asset.AssetTag, StringComparison.Ordinal)
            .Replace("{job}", project?.JobNumber ?? "unknown", StringComparison.Ordinal);
        var actorUserId = User.FindFirst("sub")?.Value
            ?? User.FindFirst("nameid")?.Value
            ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var actorName = ResolveActorName();

        await _feed.NotifyRolesAsync(
            eventType,
            severity,
            title,
            message,
            ["Admin", "Project Manager"],
            asset.ProjectId,
            asset.Id,
            runId,
            "project-asset",
            asset.Id,
            actorUserId,
            actorName);

        if (notifyInstaller && !string.IsNullOrWhiteSpace(asset.AssignedUserId))
        {
            await _feed.NotifyUsersAsync(
                eventType,
                severity,
                title,
                message,
                [asset.AssignedUserId],
                asset.ProjectId,
                asset.Id,
                runId,
                "project-asset",
                asset.Id,
                actorUserId,
                actorName);
        }
    }

    private static List<JsonElement> ParseIssues(string json)
    {
        try { return JsonSerializer.Deserialize<List<JsonElement>>(json) ?? new(); }
        catch { return new(); }
    }

    private static DateTime ParseUtcOr(string? value, DateTime fallbackUtc)
    {
        if (string.IsNullOrWhiteSpace(value)) return fallbackUtc;
        // Use DateTimeOffset so the "Z" / "+HH:mm" designator is preserved
        // correctly regardless of the server's local timezone.
        // DateTime.TryParse alone converts "Z" to local time on non-UTC servers.
        if (DateTimeOffset.TryParse(value, out var dto)) return dto.UtcDateTime;
        return fallbackUtc;
    }

    private static List<RunTimeEntry> ParseTimeEntries(string json)
    {
        try { return JsonSerializer.Deserialize<List<RunTimeEntry>>(json, _caseInsensitive) ?? new(); }
        catch { return new(); }
    }

    private static void SaveTimeEntries(AssetWorkflowRunEntity run, List<RunTimeEntry> entries)
    {
        run.TimeTrackingJson = JsonSerializer.Serialize(entries.OrderBy(e => e.StartedAtUtc).ToList(), _caseInsensitive);
    }

    private static void CloseAnyOpenTimeEntry(AssetWorkflowRunEntity run, DateTime atUtc)
    {
        var entries = ParseTimeEntries(run.TimeTrackingJson);
        var open = entries.LastOrDefault(e => e.EndedAtUtc is null);
        if (open is null) return;
        open.EndedAtUtc = atUtc;
        SaveTimeEntries(run, entries);
    }

    private static void CloseOpenCategory(AssetWorkflowRunEntity run, string category, DateTime atUtc)
    {
        var entries = ParseTimeEntries(run.TimeTrackingJson);
        var open = entries.LastOrDefault(e => e.EndedAtUtc is null && e.Category == category);
        if (open is null) return;
        open.EndedAtUtc = atUtc;
        SaveTimeEntries(run, entries);
    }

    private static bool HasOpenCategory(AssetWorkflowRunEntity run, string category)
    {
        return ParseTimeEntries(run.TimeTrackingJson).Any(e => e.EndedAtUtc is null && e.Category == category);
    }

    private static void StartProductivePeriod(AssetWorkflowRunEntity run, DateTime atUtc, string? reason)
    {
        if (HasOpenCategory(run, "productive")) return;
        var entries = ParseTimeEntries(run.TimeTrackingJson);
        entries.Add(new RunTimeEntry
        {
            Id = Guid.NewGuid().ToString(),
            Category = "productive",
            StartedAtUtc = atUtc,
            EndedAtUtc = null,
            Reason = reason
        });
        SaveTimeEntries(run, entries);
    }

    private static void StartDowntimePeriod(AssetWorkflowRunEntity run, DateTime atUtc, string? reason)
    {
        if (HasOpenCategory(run, "downtime")) return;
        var entries = ParseTimeEntries(run.TimeTrackingJson);
        entries.Add(new RunTimeEntry
        {
            Id = Guid.NewGuid().ToString(),
            Category = "downtime",
            StartedAtUtc = atUtc,
            EndedAtUtc = null,
            Reason = reason
        });
        SaveTimeEntries(run, entries);
    }

    private static void ApplyStatusDrivenTimeTracking(AssetWorkflowRunEntity run, string? incomingStatus, DateTime nowUtc)
    {
        if (string.IsNullOrWhiteSpace(incomingStatus)) return;
        if (incomingStatus.Equals("Issue", StringComparison.OrdinalIgnoreCase))
        {
            CloseOpenCategory(run, "productive", nowUtc);
            StartDowntimePeriod(run, nowUtc, "Issue status");
            return;
        }
        if (incomingStatus.Equals("InProgress", StringComparison.OrdinalIgnoreCase))
        {
            CloseOpenCategory(run, "downtime", nowUtc);
            StartProductivePeriod(run, nowUtc, "In progress");
        }
    }

    private static void RecomputeRunTimeMetrics(AssetWorkflowRunEntity run, DateTime nowUtc)
    {
        var entries = ParseTimeEntries(run.TimeTrackingJson);
        var productive = 0;
        var downtime = 0;
        var downtimeEvents = 0;
        foreach (var entry in entries)
        {
            var end = entry.EndedAtUtc ?? nowUtc;
            var seconds = (int)Math.Max(0, (end - entry.StartedAtUtc).TotalSeconds);
            if (entry.Category == "downtime")
            {
                downtime += seconds;
                downtimeEvents++;
            }
            else
            {
                productive += seconds;
            }
        }

        run.ProductiveSeconds = productive;
        run.DowntimeSeconds = downtime;
        run.DowntimeEvents = downtimeEvents;
        SaveTimeEntries(run, entries);
    }

    // ── as-built builder ─────────────────────────────────────────────────────

    private sealed class CaptureFieldDef
    {
        [System.Text.Json.Serialization.JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;
        [System.Text.Json.Serialization.JsonPropertyName("key")]
        public string Key { get; set; } = string.Empty;
        [System.Text.Json.Serialization.JsonPropertyName("label")]
        public string Label { get; set; } = string.Empty;
        [System.Text.Json.Serialization.JsonPropertyName("type")]
        public string Type { get; set; } = "text";
        [System.Text.Json.Serialization.JsonPropertyName("unit")]
        public string? Unit { get; set; }
    }

    private sealed class SnapshotStep
    {
        [System.Text.Json.Serialization.JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;
        [System.Text.Json.Serialization.JsonPropertyName("title")]
        public string Title { get; set; } = string.Empty;
        [System.Text.Json.Serialization.JsonPropertyName("captureFields")]
        public List<CaptureFieldDef>? CaptureFields { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("repeatable")]
        public bool Repeatable { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("repeatLabel")]
        public string? RepeatLabel { get; set; }
    }

    private sealed class StepResultEntry
    {
        [System.Text.Json.Serialization.JsonPropertyName("stepId")]
        public string StepId { get; set; } = string.Empty;
        [System.Text.Json.Serialization.JsonPropertyName("values")]
        public Dictionary<string, string>? Values { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("iterationIndex")]
        public int? IterationIndex { get; set; }
    }

    private sealed class AsBuiltEntry
    {
        [System.Text.Json.Serialization.JsonPropertyName("key")]
        public string Key { get; set; } = string.Empty;
        [System.Text.Json.Serialization.JsonPropertyName("label")]
        public string Label { get; set; } = string.Empty;
        [System.Text.Json.Serialization.JsonPropertyName("value")]
        public string Value { get; set; } = string.Empty;
        [System.Text.Json.Serialization.JsonPropertyName("unit")]
        public string? Unit { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("stepTitle")]
        public string StepTitle { get; set; } = string.Empty;
        [System.Text.Json.Serialization.JsonPropertyName("iterationIndex")]
        public int? IterationIndex { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("capturedAt")]
        public string CapturedAt { get; set; } = string.Empty;
    }

    private static string BuildAsBuiltJson(string snapshotJson, string stepResultsJson, DateTime completedAt)
    {
        try
        {
            // Parse snapshot — stepsJson contains the full serialized Workflow object
            var snapshotDoc = JsonDocument.Parse(snapshotJson);
            if (!snapshotDoc.RootElement.TryGetProperty("stepsJson", out var stepsJsonEl))
                return "{}";

            var stepsRaw = stepsJsonEl.GetString() ?? "[]";

            // stepsJson may be either a bare steps array OR a full Workflow object
            List<SnapshotStep> steps;
            try
            {
                var wfDoc = JsonDocument.Parse(stepsRaw);
                if (wfDoc.RootElement.ValueKind == JsonValueKind.Object &&
                    wfDoc.RootElement.TryGetProperty("steps", out var stepsEl))
                {
                    steps = JsonSerializer.Deserialize<List<SnapshotStep>>(stepsEl.GetRawText(), _caseInsensitive) ?? new();
                }
                else
                {
                    steps = JsonSerializer.Deserialize<List<SnapshotStep>>(stepsRaw, _caseInsensitive) ?? new();
                }
            }
            catch { steps = new(); }

            var stepResults = JsonSerializer.Deserialize<List<StepResultEntry>>(stepResultsJson, _caseInsensitive) ?? new();

            // Group results by stepId (repeatable steps have multiple entries with different iterationIndex)
            var resultsByStep = stepResults
                .GroupBy(r => r.StepId)
                .ToDictionary(g => g.Key, g => g.OrderBy(r => r.IterationIndex ?? 0).ToList());

            var entries = new List<AsBuiltEntry>();
            foreach (var step in steps)
            {
                if (step.CaptureFields is null || step.CaptureFields.Count == 0) continue;
                var stepLabel = step.RepeatLabel ?? "Unit";
                var iterations = resultsByStep.TryGetValue(step.Id, out var rs) ? rs : new();

                if (!iterations.Any())
                {
                    // No results for this step — skip
                    continue;
                }

                foreach (var result in iterations)
                {
                    var values = result.Values ?? new Dictionary<string, string>();
                    foreach (var field in step.CaptureFields)
                    {
                        if (!values.TryGetValue(field.Id, out var raw) || string.IsNullOrWhiteSpace(raw))
                            continue;
                        entries.Add(new AsBuiltEntry
                        {
                            Key            = step.Repeatable ? $"{field.Key}_{stepLabel.ToLower()}_{(result.IterationIndex ?? 0) + 1}" : field.Key,
                            Label          = step.Repeatable ? $"{field.Label} — {stepLabel} {(result.IterationIndex ?? 0) + 1}" : field.Label,
                            Value          = raw,
                            Unit           = field.Unit,
                            StepTitle      = step.Title,
                            IterationIndex = result.IterationIndex,
                            CapturedAt     = completedAt.ToString("O"),
                        });
                    }
                }
            }

            return JsonSerializer.Serialize(new { fields = entries, completedAt = completedAt.ToString("O") }, _caseInsensitive);
        }
        catch
        {
            return "{}";
        }
    }

    // GET api/asset-workflow-runs/pending-signatures — locked runs awaiting customer sign-off, with project context
    // Optional ?userId={id} filters to signatures on assets assigned to that user
    [HttpGet("pending-signatures")]
    public async Task<IActionResult> GetPendingSignatures([FromQuery] string? userId = null)
    {
        try
        {
            var runs = await _db.AssetWorkflowRuns
                .Where(r => r.IsLocked && r.SignatureStatus == "PendingCustomer")
                .OrderByDescending(r => r.CompletedAt)
                .ToListAsync();

            var assetIds  = runs.Select(r => r.AssetId).Distinct().ToList();
            var assets    = await _db.ProjectAssets.Where(a => assetIds.Contains(a.Id)).ToListAsync();

            // Filter to user's assigned assets if userId provided
            if (!string.IsNullOrWhiteSpace(userId))
            {
                var assignedAssetIds = assets
                    .Where(a => a.AssignedUserId == userId)
                    .Select(a => a.Id)
                    .ToHashSet();
                runs = runs.Where(r => assignedAssetIds.Contains(r.AssetId)).ToList();
                assets = assets.Where(a => assignedAssetIds.Contains(a.Id)).ToList();
            }

            var projectIds = assets.Select(a => a.ProjectId).Distinct().ToList();
            var projects  = await _db.Projects.Where(p => projectIds.Contains(p.Id)).ToListAsync();

            var result = runs.Select(r =>
            {
                var asset   = assets.FirstOrDefault(a => a.Id == r.AssetId);
                var project = asset is null ? null : projects.FirstOrDefault(p => p.Id == asset.ProjectId);
                return new PendingSignatureDto(
                    RunId:        r.Id,
                    AssetId:      r.AssetId,
                    AssetTag:     asset?.AssetTag ?? "",
                    AssetName:    asset?.AssetName ?? asset?.AssetTag ?? "",
                    ProjectId:    asset?.ProjectId ?? "",
                    JobNumber:    project?.JobNumber ?? "",
                    CustomerName: project?.CustomerName ?? "",
                    CompletedAt:  r.CompletedAt?.ToString("O") ?? "",
                    CompletedBy:  r.CompletedByName ?? ""
                );
            });

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get pending signatures");
            return Ok(Array.Empty<PendingSignatureDto>());
        }
    }

    // POST api/asset-workflow-runs/{id}/waive-customer-signature
    [HttpPost("{id}/waive-customer-signature")]
    public async Task<ActionResult<AssetWorkflowRunDto>> WaiveCustomerSignature(string id)
    {
        var run = await _db.AssetWorkflowRuns.FindAsync(id);
        if (run is null) return NotFound();
        if (!run.IsLocked) return BadRequest(new { message = "Run must be completed before waiving customer signature." });
        if (run.SignatureStatus != "PendingCustomer")
            return UnprocessableEntity(new { message = "Run is not currently awaiting customer signature." });

        run.SignatureStatus = "WaivedCustomer";
        run.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(ToDto(run));
    }
}
