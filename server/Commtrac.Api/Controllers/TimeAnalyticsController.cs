using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/time-analytics")]
[Authorize]
public class TimeAnalyticsController : ControllerBase
{
    private readonly TimeAnalyticsSnapshotService _snapshot;

    public TimeAnalyticsController(TimeAnalyticsSnapshotService snapshot) => _snapshot = snapshot;

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
        CancellationToken ct)
    {
        var snapshot = await _snapshot.BuildAsync(from, to, customerId, productId, projectId, ct);
        return Ok(snapshot);
    }
}
