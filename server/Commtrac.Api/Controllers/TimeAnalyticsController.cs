using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/time-analytics")]
// Was bare [Authorize], so every signed-in role — including Viewer — could read time and
// cost analytics, while DashboardController next door has always been Admin + Project
// Manager. The analytics.view flag now decides, falling back to those two roles.
[Authorize]
public class TimeAnalyticsController : ControllerBase
{
    private readonly TimeAnalyticsSnapshotService _snapshot;
    private readonly RolePermissionService _perm;

    public TimeAnalyticsController(TimeAnalyticsSnapshotService snapshot, RolePermissionService perm)
    {
        _snapshot = snapshot;
        _perm = perm;
    }

    /// <summary>
    /// Aggregated analytics snapshot for the Time Analytics dashboard.
    /// Built from workflow runs, project assets, projects, customers, products, and users.
    /// </summary>
    [HttpGet("snapshot")]
    public async Task<IActionResult> GetSnapshot(
        [FromQuery] string? from,
        [FromQuery] string? to,
        [FromQuery] string? customerId,
        [FromQuery] string? productId,
        [FromQuery] string? projectId,
        [FromQuery] double? hourlyRate,
        [FromQuery] double? revenueMultiplier,
        [FromQuery] double? quotedRatio,
        CancellationToken ct)
    {
        if (!await _perm.HasAsync(User, "analytics", "view", ct)) return Forbid();

        var finance = new TimeAnalyticsFinanceParamsDto(
            HourlyRate: hourlyRate is > 0 ? hourlyRate.Value : 85,
            RevenueMultiplier: revenueMultiplier is > 0 ? revenueMultiplier.Value : 1.35,
            QuotedRatio: quotedRatio is > 0 and <= 1 ? quotedRatio.Value : 0.92);

        var snapshot = await _snapshot.BuildAsync(
            from, to, customerId, productId, projectId, finance, ct);
        return Ok(snapshot);
    }
}
