using System.Linq.Expressions;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Services;

/// <summary>
/// Read-path helpers for dashboard endpoints. Resolves the latest run per asset using a
/// lightweight head query, then loads full run rows only for those IDs (never all history).
/// </summary>
public static class DashboardReadQueries
{
    private sealed record RunHead(string Id, string AssetId, DateTime StartedAt, DateTime UpdatedAt);

    /// <summary>Latest run per asset (by StartedAt, then UpdatedAt). Optional filter e.g. !IsLocked.</summary>
    public static async Task<Dictionary<string, AssetWorkflowRunEntity>> GetLatestRunsByAssetIdAsync(
        AppDbContext db,
        IEnumerable<string> assetIds,
        Expression<Func<AssetWorkflowRunEntity, bool>>? runFilter = null)
    {
        var ids = assetIds.Distinct().ToList();
        if (ids.Count == 0)
            return new Dictionary<string, AssetWorkflowRunEntity>();

        var query = db.AssetWorkflowRuns.AsNoTracking().Where(r => ids.Contains(r.AssetId));
        if (runFilter is not null)
            query = query.Where(runFilter);

        var heads = await query
            .Select(r => new RunHead(r.Id, r.AssetId, r.StartedAt, r.UpdatedAt))
            .ToListAsync();

        var latestIds = heads
            .GroupBy(h => h.AssetId)
            .Select(g => g
                .OrderByDescending(x => x.StartedAt)
                .ThenByDescending(x => x.UpdatedAt)
                .First()
                .Id)
            .ToList();

        if (latestIds.Count == 0)
            return new Dictionary<string, AssetWorkflowRunEntity>();

        var runs = await db.AssetWorkflowRuns
            .AsNoTracking()
            .Where(r => latestIds.Contains(r.Id))
            .ToListAsync();

        return runs.ToDictionary(r => r.AssetId);
    }

    /// <summary>Issue-bearing runs projected to Id + AssetId + IssuesJson only (no media blobs).</summary>
    public static async Task<List<RunIssuesRow>> GetIssueRunsAsync(
        AppDbContext db,
        IReadOnlyList<string>? restrictToAssetIds = null)
    {
        var query = db.AssetWorkflowRuns
            .AsNoTracking()
            .Where(r => r.IssuesJson != null && r.IssuesJson != "[]" && r.IssuesJson != "");

        if (restrictToAssetIds is { Count: > 0 })
            query = query.Where(r => restrictToAssetIds.Contains(r.AssetId));

        return await query
            .Select(r => new RunIssuesRow(r.Id, r.AssetId, r.IssuesJson))
            .ToListAsync();
    }

    public sealed record RunIssuesRow(string Id, string AssetId, string IssuesJson);

    public sealed record AssetIssuesRow(
        string Id,
        string ProjectId,
        string AssetTag,
        string? AssetName,
        string? Location,
        string IssuesJson);

    public sealed record ProjectIssuesRow(string Id, string JobNumber, string CustomerName);

    public static async Task<List<AssetIssuesRow>> GetAssetsWithIssuesAsync(
        AppDbContext db,
        IReadOnlyList<string>? restrictToAssetIds = null)
    {
        var query = db.ProjectAssets
            .AsNoTracking()
            .Where(a => a.IssuesJson != null && a.IssuesJson != "[]" && a.IssuesJson != "");

        if (restrictToAssetIds is { Count: > 0 })
            query = query.Where(a => restrictToAssetIds.Contains(a.Id));

        return await query
            .Select(a => new AssetIssuesRow(
                a.Id,
                a.ProjectId,
                a.AssetTag,
                a.AssetName,
                a.Location,
                a.IssuesJson))
            .ToListAsync();
    }

    public static async Task<Dictionary<string, ProjectIssuesRow>> GetProjectsByIdAsync(
        AppDbContext db,
        IEnumerable<string> projectIds)
    {
        var ids = projectIds.Distinct().ToList();
        if (ids.Count == 0)
            return new Dictionary<string, ProjectIssuesRow>();

        var rows = await db.Projects
            .AsNoTracking()
            .Where(p => ids.Contains(p.Id))
            .Select(p => new ProjectIssuesRow(p.Id, p.JobNumber, p.CustomerName))
            .ToListAsync();

        return rows.ToDictionary(p => p.Id);
    }

    /// <summary>Pending signature runs — scalar columns only, no StepResultsJson / WorkflowSnapshotJson.</summary>
    public sealed record PendingSignatureRunRow(
        string Id,
        string AssetId,
        string? CompletedByName,
        DateTime? CompletedAt,
        DateTime UpdatedAt,
        DateTime StartedAt,
        DateTime CreatedAt,
        int RunNumber,
        string SignatureStatus);

    public static async Task<List<PendingSignatureRunRow>> GetPendingSignatureRunsAsync(AppDbContext db)
    {
        return await db.AssetWorkflowRuns
            .AsNoTracking()
            .Where(r => r.IsLocked && (r.SignatureStatus == "PendingInstaller" || r.SignatureStatus == "PendingCustomer"))
            .Select(r => new PendingSignatureRunRow(
                r.Id,
                r.AssetId,
                r.CompletedByName,
                r.CompletedAt,
                r.UpdatedAt,
                r.StartedAt,
                r.CreatedAt,
                r.RunNumber,
                r.SignatureStatus))
            .ToListAsync();
    }

    public sealed record PendingSignatureAssetRow(
        string Id,
        string ProjectId,
        string AssetTag,
        string? AssetName,
        string? AssignedUserId);

    public static async Task<List<PendingSignatureAssetRow>> GetPendingSignatureAssetsAsync(
        AppDbContext db,
        IEnumerable<string> assetIds)
    {
        var ids = assetIds.Distinct().ToList();
        if (ids.Count == 0)
            return [];

        return await db.ProjectAssets
            .AsNoTracking()
            .Where(a => ids.Contains(a.Id))
            .Select(a => new PendingSignatureAssetRow(
                a.Id,
                a.ProjectId,
                a.AssetTag,
                a.AssetName,
                a.AssignedUserId))
            .ToListAsync();
    }

    /// <summary>Evidence analytics — keeps StepResultsJson for has-media check; drops workflow snapshot.</summary>
    public sealed record EvidenceRunRow(
        string AssetId,
        string Status,
        DateTime? CompletedAt,
        string SignatureStatus,
        DateTime? CustomerSignedAt,
        string IssuesJson,
        string StepResultsJson);

    public static async Task<List<EvidenceRunRow>> GetCompletedRunsForEvidenceAsync(
        AppDbContext db,
        DateTime cutoffUtc)
    {
        return await db.AssetWorkflowRuns
            .AsNoTracking()
            .Where(r => r.Status == "Complete" && r.CompletedAt >= cutoffUtc)
            .Select(r => new EvidenceRunRow(
                r.AssetId,
                r.Status,
                r.CompletedAt,
                r.SignatureStatus,
                r.CustomerSignedAt,
                r.IssuesJson,
                r.StepResultsJson))
            .ToListAsync();
    }

    /// <summary>Workflow health — scalar columns only (no JSON blobs).</summary>
    public sealed record HealthRunRow(
        string AssetId,
        string WorkflowConfigId,
        string Status,
        int RunNumber,
        string IssuesJson,
        string SignatureStatus,
        DateTime? CustomerSignedAt,
        DateTime StartedAt);

    public static async Task<List<HealthRunRow>> GetRunsForHealthAsync(
        AppDbContext db,
        DateTime fromUtc,
        DateTime? toUtcExclusive = null)
    {
        var query = db.AssetWorkflowRuns
            .AsNoTracking()
            .Where(r => r.StartedAt >= fromUtc);

        if (toUtcExclusive.HasValue)
            query = query.Where(r => r.StartedAt < toUtcExclusive.Value);

        return await query
            .Select(r => new HealthRunRow(
                r.AssetId,
                r.WorkflowConfigId,
                r.Status,
                r.RunNumber,
                r.IssuesJson,
                r.SignatureStatus,
                r.CustomerSignedAt,
                r.StartedAt))
            .ToListAsync();
    }

    public static async Task<Dictionary<string, AssetIssuesRow>> GetAssetIssueContextByIdsAsync(
        AppDbContext db,
        IEnumerable<string> assetIds)
    {
        var ids = assetIds.Distinct().ToList();
        if (ids.Count == 0)
            return new Dictionary<string, AssetIssuesRow>();

        var rows = await db.ProjectAssets
            .AsNoTracking()
            .Where(a => ids.Contains(a.Id))
            .Select(a => new AssetIssuesRow(
                a.Id,
                a.ProjectId,
                a.AssetTag,
                a.AssetName,
                a.Location,
                a.IssuesJson))
            .ToListAsync();

        return rows.ToDictionary(a => a.Id);
    }
}
