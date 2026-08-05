using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/dashboard")]
[Authorize(Roles = "Admin,Project Manager")]
public class DashboardController : ControllerBase
{
    private readonly AppDbContext _db;

    public DashboardController(AppDbContext db) => _db = db;

    // ── Evidence Completeness ────────────────────────────────────────────────

    [HttpGet("evidence-completeness")]
    public async Task<ActionResult<EvidenceCompletenessDto>> EvidenceCompleteness([FromQuery] int windowDays = 90)
    {
        var cutoff = DateTime.UtcNow.AddDays(-windowDays);

        // Slim projection — avoid hydrating StepResultsJson blobs into entities.
        var runRows = await _db.AssetWorkflowRuns
            .AsNoTracking()
            .Where(r => r.Status == "Complete" && r.CompletedAt >= cutoff)
            .Select(r => new
            {
                r.AssetId,
                Signed = r.SignatureStatus == "Signed" || r.CustomerSignedAt != null,
                HasMedia = r.StepResultsJson.Contains("/storage/")
                    || r.StepResultsJson.Contains(".jpg")
                    || r.StepResultsJson.Contains(".png")
                    || r.StepResultsJson.Contains(".pdf"),
                NoIssues = r.IssuesJson == "[]" || r.IssuesJson == "" || r.IssuesJson == null,
            })
            .ToListAsync();

        if (runRows.Count == 0)
            return Ok(new EvidenceCompletenessDto(windowDays, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, new()));

        var assetIds = runRows.Select(r => r.AssetId).Distinct().ToList();
        var assetToProject = await _db.ProjectAssets
            .AsNoTracking()
            .Where(a => assetIds.Contains(a.Id))
            .Select(a => new { a.Id, a.ProjectId })
            .ToDictionaryAsync(a => a.Id, a => a.ProjectId);

        var projectIds = assetToProject.Values.Distinct().ToList();
        var projectMap = await _db.Projects
            .AsNoTracking()
            .Where(p => projectIds.Contains(p.Id))
            .Select(p => new { p.Id, p.JobNumber, p.CustomerName })
            .ToDictionaryAsync(p => p.Id);

        int signed = 0, allSteps = 0, hasMedia = 0, noIssues = 0;
        var projectScores = new Dictionary<string, List<int>>();

        foreach (var run in runRows)
        {
            if (run.Signed) signed++;
            allSteps++;
            if (run.HasMedia) hasMedia++;
            if (run.NoIssues) noIssues++;

            int runScore = (new[] { run.Signed, true, run.HasMedia, run.NoIssues }.Count(x => x) * 25);

            if (assetToProject.TryGetValue(run.AssetId, out var pid))
            {
                if (!projectScores.ContainsKey(pid)) projectScores[pid] = new();
                projectScores[pid].Add(runScore);
            }
        }

        int total = runRows.Count;
        int Pct(int n) => total > 0 ? (int)Math.Round(n * 100.0 / total) : 0;
        int overall = (Pct(signed) + Pct(allSteps) + Pct(hasMedia) + Pct(noIssues)) / 4;

        var byProject = projectScores
            .Select(kv =>
            {
                var avg = (int)Math.Round(kv.Value.Average());
                projectMap.TryGetValue(kv.Key, out var proj);
                return new EvidenceProjectDto(
                    kv.Key,
                    proj?.JobNumber ?? kv.Key,
                    proj?.CustomerName ?? "",
                    kv.Value.Count,
                    avg
                );
            })
            .OrderBy(p => p.Score)
            .ToList();

        return Ok(new EvidenceCompletenessDto(
            windowDays, total,
            signed, Pct(signed),
            allSteps, Pct(allSteps),
            hasMedia, Pct(hasMedia),
            noIssues, Pct(noIssues),
            overall,
            byProject
        ));
    }

    // ── Workflow Health Score ────────────────────────────────────────────────

    [HttpGet("workflow-health")]
    public async Task<ActionResult<WorkflowHealthDto>> WorkflowHealth([FromQuery] int windowDays = 90)
    {
        var now    = DateTime.UtcNow;
        var cutoff = now.AddDays(-windowDays);
        var prev   = now.AddDays(-windowDays * 2);

        var currentRows = await _db.AssetWorkflowRuns
            .AsNoTracking()
            .Where(r => r.StartedAt >= cutoff)
            .Select(r => new HealthRunRow(
                r.AssetId,
                r.WorkflowConfigId,
                r.Status,
                r.RunNumber,
                r.IssuesJson,
                r.SignatureStatus,
                r.CustomerSignedAt))
            .ToListAsync();

        var previousRows = await _db.AssetWorkflowRuns
            .AsNoTracking()
            .Where(r => r.StartedAt >= prev && r.StartedAt < cutoff)
            .Select(r => new HealthRunRow(
                r.AssetId,
                r.WorkflowConfigId,
                r.Status,
                r.RunNumber,
                r.IssuesJson,
                r.SignatureStatus,
                r.CustomerSignedAt))
            .ToListAsync();

        int currentScore  = currentRows.Count  > 0 ? ComputeScore(ComputeMetrics(currentRows))  : 0;
        int previousScore = previousRows.Count > 0 ? ComputeScore(ComputeMetrics(previousRows)) : 0;

        var (compRate, firstSucc, stepPass, cleanClose) = ComputeMetrics(currentRows);

        var assetIds  = currentRows.Select(r => r.AssetId).Distinct().ToList();
        var configIds = currentRows.Select(r => r.WorkflowConfigId).Distinct().ToList();

        var assignments = await _db.AssetWorkflowAssignments
            .AsNoTracking()
            .Where(a => assetIds.Contains(a.AssetId) && configIds.Contains(a.WorkflowConfigId))
            .Select(a => new { a.AssetId, a.WorkflowConfigId, a.WorkflowTypeId })
            .ToListAsync();

        var assignmentMap = assignments
            .GroupBy(a => (a.AssetId, a.WorkflowConfigId))
            .ToDictionary(g => g.Key, g => g.First().WorkflowTypeId);

        var typeIds = assignments.Select(a => a.WorkflowTypeId).Where(t => t != null).Distinct().ToList();
        var typeNames = await _db.WorkflowTypes
            .AsNoTracking()
            .Where(t => typeIds.Contains(t.Id))
            .Select(t => new { t.Id, t.Name })
            .ToDictionaryAsync(t => t.Id, t => t.Name);

        string GetTypeId(HealthRunRow r) =>
            assignmentMap.TryGetValue((r.AssetId, r.WorkflowConfigId), out var tid) ? tid ?? "" : "";

        var byType = currentRows
            .GroupBy(GetTypeId)
            .Where(g => g.Key != "")
            .Select(g =>
            {
                var rows = g.ToList();
                var score = ComputeScore(ComputeMetrics(rows));
                typeNames.TryGetValue(g.Key, out var name);
                return new WorkflowTypeHealthDto(name ?? g.Key, rows.Count, score);
            })
            .OrderByDescending(t => t.RunCount)
            .ToList();

        return Ok(new WorkflowHealthDto(
            windowDays,
            currentScore,
            previousScore,
            currentScore - previousScore,
            currentRows.Count,
            compRate, firstSucc, stepPass, cleanClose,
            byType
        ));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private sealed record HealthRunRow(
        string AssetId,
        string WorkflowConfigId,
        string Status,
        int RunNumber,
        string? IssuesJson,
        string? SignatureStatus,
        DateTime? CustomerSignedAt);

    private static (int completionRate, int firstRunSuccessRate, int stepPassRate, int cleanClosureRate)
        ComputeMetrics(IReadOnlyList<HealthRunRow> runs)
    {
        if (runs.Count == 0) return (0, 0, 0, 0);

        int completed = runs.Count(r => r.Status == "Complete");
        int compRate  = (int)Math.Round(completed * 100.0 / runs.Count);

        var firstRuns    = runs.Where(r => r.RunNumber == 1).ToList();
        int firstSuccess = firstRuns.Count > 0
            ? (int)Math.Round(firstRuns.Count(r => r.Status == "Complete") * 100.0 / firstRuns.Count)
            : 0;

        int withoutIssues = runs.Count(r =>
            r.Status == "Complete" &&
            (r.IssuesJson == "[]" || string.IsNullOrWhiteSpace(r.IssuesJson)));
        int stepPass = completed > 0 ? (int)Math.Round(withoutIssues * 100.0 / completed) : 0;

        int cleanClose = completed > 0
            ? (int)Math.Round(runs.Count(r =>
                r.Status == "Complete" &&
                (r.SignatureStatus == "Signed" || r.CustomerSignedAt.HasValue) &&
                (r.IssuesJson == "[]" || string.IsNullOrWhiteSpace(r.IssuesJson))) * 100.0 / completed)
            : 0;

        return (compRate, firstSuccess, stepPass, cleanClose);
    }

    private static int ComputeScore((int c, int f, int s, int cl) m) =>
        (m.c + m.f + m.s + m.cl) / 4;
}
