using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/dashboard")]
[Authorize(Roles = "Admin,Project Manager")]
public class DashboardController : ControllerBase
{
    private readonly AppDbContext _db;
    private static readonly JsonSerializerOptions _json = new() { PropertyNameCaseInsensitive = true };

    public DashboardController(AppDbContext db) => _db = db;

    // ── Evidence Completeness ────────────────────────────────────────────────

    [HttpGet("evidence-completeness")]
    public async Task<ActionResult<EvidenceCompletenessDto>> EvidenceCompleteness([FromQuery] int windowDays = 90)
    {
        var cutoff = DateTime.UtcNow.AddDays(-windowDays);

        var runs = await DashboardReadQueries.GetCompletedRunsForEvidenceAsync(_db, cutoff);

        if (runs.Count == 0)
            return Ok(new EvidenceCompletenessDto(windowDays, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, new()));

        // Collect asset IDs to look up project info
        var assetIds = runs.Select(r => r.AssetId).Distinct().ToList();
        var assets = await _db.ProjectAssets
            .Where(a => assetIds.Contains(a.Id))
            .Select(a => new { a.Id, a.ProjectId })
            .ToListAsync();
        var assetToProject = assets.ToDictionary(a => a.Id, a => a.ProjectId);

        var projectIds = assets.Select(a => a.ProjectId).Distinct().ToList();
        var projects = await _db.Projects
            .Where(p => projectIds.Contains(p.Id))
            .Select(p => new { p.Id, p.JobNumber, p.CustomerName })
            .ToListAsync();
        var projectMap = projects.ToDictionary(p => p.Id);

        int signed = 0, allSteps = 0, hasMedia = 0, noIssues = 0;

        // Per-project: (projectId → list of per-run scores 0-100)
        var projectScores = new Dictionary<string, List<int>>();

        foreach (var run in runs)
        {
            var (s, a, m, n) = EvaluateEvidenceRun(run);
            if (s) signed++;
            if (a) allSteps++;
            if (m) hasMedia++;
            if (n) noIssues++;

            int runScore = (new[] { s, a, m, n }.Count(x => x) * 25);

            if (assetToProject.TryGetValue(run.AssetId, out var pid))
            {
                if (!projectScores.ContainsKey(pid)) projectScores[pid] = new();
                projectScores[pid].Add(runScore);
            }
        }

        int total = runs.Count;
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
            signed,   Pct(signed),
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
        var now      = DateTime.UtcNow;
        var cutoff   = now.AddDays(-windowDays);
        var prev     = now.AddDays(-windowDays * 2);

        var currentRuns = await DashboardReadQueries.GetRunsForHealthAsync(_db, cutoff);

        var previousRuns = await DashboardReadQueries.GetRunsForHealthAsync(_db, prev, cutoff);

        int currentScore  = currentRuns.Count  > 0 ? ComputeScore(ComputeHealthMetrics(currentRuns))  : 0;
        int previousScore = previousRuns.Count > 0 ? ComputeScore(ComputeHealthMetrics(previousRuns)) : 0;

        var (compRate, firstSucc, stepPass, cleanClose) = ComputeHealthMetrics(currentRuns);

        // Per-type breakdown via AssetWorkflowAssignment
        var assetIds2  = currentRuns.Select(r => r.AssetId).Distinct().ToList();
        var configIds2 = currentRuns.Select(r => r.WorkflowConfigId).Distinct().ToList();

        var assignments = await _db.AssetWorkflowAssignments
            .Where(a => assetIds2.Contains(a.AssetId) && configIds2.Contains(a.WorkflowConfigId))
            .Select(a => new { a.AssetId, a.WorkflowConfigId, a.WorkflowTypeId })
            .ToListAsync();

        var assignmentMap = assignments
            .GroupBy(a => (a.AssetId, a.WorkflowConfigId))
            .ToDictionary(g => g.Key, g => g.First().WorkflowTypeId);

        var typeIds = assignments.Select(a => a.WorkflowTypeId).Where(t => t != null).Distinct().ToList();
        var typeNames = await _db.WorkflowTypes
            .Where(t => typeIds.Contains(t.Id))
            .Select(t => new { t.Id, t.Name })
            .ToDictionaryAsync(t => t.Id, t => t.Name);

        string GetTypeId(DashboardReadQueries.HealthRunRow r) =>
            assignmentMap.TryGetValue((r.AssetId, r.WorkflowConfigId), out var tid) ? tid ?? "" : "";

        var byType = currentRuns
            .GroupBy(GetTypeId)
            .Where(g => g.Key != "")
            .Select(g =>
            {
                var grouped = g.ToList();
                var score = ComputeScore(ComputeHealthMetrics(grouped));
                typeNames.TryGetValue(g.Key, out var name);
                return new WorkflowTypeHealthDto(name ?? g.Key, grouped.Count, score);
            })
            .OrderByDescending(t => t.RunCount)
            .ToList();

        return Ok(new WorkflowHealthDto(
            windowDays,
            currentScore,
            previousScore,
            currentScore - previousScore,
            currentRuns.Count,
            compRate, firstSucc, stepPass, cleanClose,
            byType
        ));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static (bool signed, bool allSteps, bool hasMedia, bool noIssues) EvaluateEvidenceRun(
        DashboardReadQueries.EvidenceRunRow run)
    {
        bool signed   = run.SignatureStatus == "Signed" || run.CustomerSignedAt.HasValue;
        bool allSteps = run.Status == "Complete";

        bool hasMedia = false;
        try
        {
            var results = JsonSerializer.Deserialize<JsonElement[]>(run.StepResultsJson, _json);
            if (results != null)
            {
                foreach (var el in results)
                {
                    if (el.TryGetProperty("values", out var vals))
                    {
                        foreach (var prop in vals.EnumerateObject())
                        {
                            var v = prop.Value.GetString() ?? "";
                            if (v.Contains("/storage/") || v.Contains(".jpg") || v.Contains(".png") || v.Contains(".pdf")
                                || v.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase)
                                || v.StartsWith("data:video/", StringComparison.OrdinalIgnoreCase))
                            {
                                hasMedia = true;
                                break;
                            }
                        }
                    }
                    if (hasMedia) break;
                }
            }
        }
        catch { /* ignore parse errors */ }

        bool noIssues = run.IssuesJson == "[]" || string.IsNullOrWhiteSpace(run.IssuesJson);
        if (!noIssues)
        {
            try
            {
                var issues = JsonSerializer.Deserialize<JsonElement[]>(run.IssuesJson, _json);
                noIssues = issues == null || issues.Length == 0;
            }
            catch { noIssues = false; }
        }

        return (signed, allSteps, hasMedia, noIssues);
    }

    private static (int completionRate, int firstRunSuccessRate, int stepPassRate, int cleanClosureRate)
        ComputeHealthMetrics(List<DashboardReadQueries.HealthRunRow> runs)
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
