using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Commtrac.Api.Data;
using Commtrac.Api.Models;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/asset-workflow-runs")]
[Authorize]
public class AssetWorkflowRunsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<AssetWorkflowRunsController> _logger;
    public AssetWorkflowRunsController(AppDbContext db, ILogger<AssetWorkflowRunsController> logger)
    {
        _db = db;
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

    private static AssetWorkflowRunDto ToDto(AssetWorkflowRunEntity e) => new(
        e.Id, e.AssetId, e.WorkflowConfigId, e.WorkflowVersion,
        e.WorkflowSnapshotJson, e.WorkOrderId, e.Status, e.IsLocked,
        e.TechnicianUserId, e.StepResultsJson, e.IssuesJson,
        e.TimeTrackingJson, e.ProductiveSeconds, e.DowntimeSeconds, e.DowntimeEvents,
        e.RunNumber, e.CompletedByName,
        e.SignatureStatus, e.InstallerSignedAt, e.CustomerSignedAt,
        e.StartedAt, e.CompletedAt, e.CreatedAt, e.UpdatedAt
    );

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
        CloseAnyOpenTimeEntry(run, now);
        RecomputeRunTimeMetrics(run, now);

        // Update asset status — Complete only if no open blocking issues remain across all runs
        var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == run.AssetId);
        if (asset is not null)
        {
            // Check all runs for this asset for any open blocking issues
            var allRuns  = await _db.AssetWorkflowRuns.Where(r => r.AssetId == run.AssetId).ToListAsync();
            var anyBlock = allRuns.Any(r =>
                ParseIssues(r.IssuesJson).Any(i =>
                    i.TryGetProperty("isBlocking", out var b) && b.GetBoolean() &&
                    i.TryGetProperty("resolved",   out var rv) && !rv.GetBoolean()));

            asset.Status    = anyBlock ? "Issue" : "Complete";
            asset.UpdatedAt = now;
        }

        await _db.SaveChangesAsync();
        return Ok(ToDto(run));
    }

    // PATCH api/asset-workflow-runs/{id}/issues — update issues on any run (inc. locked)
    [HttpPatch("{id}/issues")]
    public async Task<IActionResult> PatchIssues(string id, [FromBody] PatchIssuesRequest req)
    {
        var run = await _db.AssetWorkflowRuns.FirstOrDefaultAsync(r => r.Id == id);
        if (run is null) return NotFound();

        run.IssuesJson = req.IssuesJson;
        run.UpdatedAt  = DateTime.UtcNow;

        // Recalculate asset status now that issues may have changed
        var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == run.AssetId);
        if (asset is not null)
        {
            var allRuns = await _db.AssetWorkflowRuns.Where(r => r.AssetId == run.AssetId).ToListAsync();
            var anyBlock = allRuns.Any(r => {
                var json = r.Id == id ? req.IssuesJson : r.IssuesJson;
                return ParseIssues(json).Any(i =>
                    i.TryGetProperty("isBlocking", out var b) && b.GetBoolean() &&
                    i.TryGetProperty("resolved",   out var rv) && !rv.GetBoolean());
            });
            var anyLocked = allRuns.Any(r => r.IsLocked || r.Id == id);
            if (anyLocked)
            {
                asset.Status    = anyBlock ? "Issue" : "Complete";
                asset.UpdatedAt = DateTime.UtcNow;
            }
        }

        await _db.SaveChangesAsync();
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
            default:
                return BadRequest(new { message = "Unknown action. Use StartProductive, ResumeProductive, StartDowntime, StopDowntime." });
        }

        run.UpdatedAt = now;
        RecomputeRunTimeMetrics(run, now);
        await _db.SaveChangesAsync();
        return Ok(ToDto(run));
    }

    // ── helpers ───────────────────────────────────────────────────────────────
    private static List<JsonElement> ParseIssues(string json)
    {
        try { return JsonSerializer.Deserialize<List<JsonElement>>(json) ?? new(); }
        catch { return new(); }
    }

    private static DateTime ParseUtcOr(string? value, DateTime fallbackUtc)
    {
        if (string.IsNullOrWhiteSpace(value)) return fallbackUtc;
        if (!DateTime.TryParse(value, out var parsed)) return fallbackUtc;
        return parsed.Kind == DateTimeKind.Utc ? parsed : DateTime.SpecifyKind(parsed, DateTimeKind.Utc);
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
