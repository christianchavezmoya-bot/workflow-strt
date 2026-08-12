using System.Globalization;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/sync")]
[Authorize]
public class SyncChangesController : ControllerBase
{
    private readonly AppDbContext _db;

    public SyncChangesController(AppDbContext db) => _db = db;

    /// <summary>
    /// Lightweight change feed for native delta sync — entity ids updated since a timestamp.
    /// </summary>
    [HttpGet("changes")]
    public async Task<IActionResult> GetChanges([FromQuery] string? since, CancellationToken ct)
    {
        var sinceUtc = ParseSince(since) ?? DateTime.UtcNow.AddHours(-24);

        var assetRows = await _db.ProjectAssets.AsNoTracking()
            .Where(a => !a.IsDeleted && a.UpdatedAt >= sinceUtc)
            .Select(a => new { a.Id, a.ProjectId })
            .ToListAsync(ct);

        var runRows = await _db.AssetWorkflowRuns.AsNoTracking()
            .Where(r => r.UpdatedAt >= sinceUtc)
            .Select(r => new { r.Id, r.AssetId })
            .ToListAsync(ct);

        var assetIds = assetRows.Select(a => a.Id).Distinct().ToList();
        var runIds = runRows.Select(r => r.Id).Distinct().ToList();
        var projectIds = assetRows.Select(a => a.ProjectId).Distinct().ToList();

        if (runRows.Count > 0)
        {
            var runAssetIds = runRows.Select(r => r.AssetId).Distinct().ToList();
            var extraProjects = await _db.ProjectAssets.AsNoTracking()
                .Where(a => runAssetIds.Contains(a.Id))
                .Select(a => a.ProjectId)
                .Distinct()
                .ToListAsync(ct);
            projectIds = projectIds.Concat(extraProjects).Distinct().ToList();
        }

        var dto = new SyncChangesDto(
            ServerTime: DateTime.UtcNow.ToString("o"),
            ProjectIds: projectIds,
            AssetIds: assetIds,
            RunIds: runIds,
            TotalChanges: assetIds.Count + runIds.Count);

        return Ok(dto);
    }

    private static DateTime? ParseSince(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var dt))
            return DateTime.SpecifyKind(dt.ToUniversalTime(), DateTimeKind.Utc);
        return null;
    }
}
