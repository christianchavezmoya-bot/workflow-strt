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
    public AssetWorkflowRunsController(AppDbContext db) => _db = db;

    private static AssetWorkflowRunDto ToDto(AssetWorkflowRunEntity e) => new(
        e.Id, e.AssetId, e.WorkflowConfigId, e.WorkflowVersion,
        e.WorkflowSnapshotJson, e.WorkOrderId, e.Status, e.IsLocked,
        e.TechnicianUserId, e.StepResultsJson, e.IssuesJson,
        e.RunNumber, e.CompletedByName,
        e.StartedAt, e.CompletedAt, e.CreatedAt, e.UpdatedAt
    );

    // GET api/asset-workflow-runs/by-asset/{assetId}
    [HttpGet("by-asset/{assetId}")]
    public async Task<IActionResult> ListByAsset(string assetId)
    {
        var runs = await _db.AssetWorkflowRuns
            .Where(r => r.AssetId == assetId)
            .OrderByDescending(r => r.StartedAt)
            .ToListAsync();
        return Ok(runs.Select(ToDto));
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
            RunNumber            = runCount + 1,
            StartedAt            = now,
            CreatedAt            = now,
            UpdatedAt            = now,
        };
        _db.AssetWorkflowRuns.Add(run);

        // Update asset status to InProgress if it was NotStarted
        var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == req.AssetId);
        if (asset is not null && asset.Status == "NotStarted")
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
        run.CompletedAt      = now;
        run.UpdatedAt        = now;

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

    // POST api/asset-workflow-runs/{id}/reopen  — Admin creates a new run from a locked run
    [HttpPost("{id}/reopen")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Reopen(string id)
    {
        var source = await _db.AssetWorkflowRuns.FirstOrDefaultAsync(r => r.Id == id);
        if (source is null) return NotFound();

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
            StartedAt            = now,
            CreatedAt            = now,
            UpdatedAt            = now,
        };
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

    // ── helpers ───────────────────────────────────────────────────────────────
    private static List<JsonElement> ParseIssues(string json)
    {
        try { return JsonSerializer.Deserialize<List<JsonElement>>(json) ?? new(); }
        catch { return new(); }
    }
}
