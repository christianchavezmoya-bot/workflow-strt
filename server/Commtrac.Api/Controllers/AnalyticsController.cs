using System.Security.Claims;
using System.Text.Json;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/analytics")]
public class AnalyticsController : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOpts =
        new(JsonSerializerDefaults.Web);

    private readonly AppDbContext _db;

    public AnalyticsController(AppDbContext db)
    {
        _db = db;
    }

    /// <summary>
    /// Accept a batch of analytics events from the frontend.
    /// AllowAnonymous so pre-login events (onboarding_started, etc.) still reach the server.
    /// JWT identity is used opportunistically when present.
    /// </summary>
    [HttpPost("events")]
    [AllowAnonymous]
    public async Task<IActionResult> IngestBatch([FromBody] AnalyticsEventBatchRequest request)
    {
        if (request.Events is not { Count: > 0 })
            return NoContent();

        var events = request.Events.Take(100).ToList();

        var authedUserId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var authedRole   = User.FindFirstValue(ClaimTypes.Role);
        var now = DateTime.UtcNow;

        foreach (var ev in events)
        {
            if (string.IsNullOrWhiteSpace(ev.EventName))
                continue;

            var occurredAt = now;
            if (!string.IsNullOrWhiteSpace(ev.OccurredAtUtc)
                && DateTime.TryParse(ev.OccurredAtUtc, out var parsed))
            {
                occurredAt = parsed.ToUniversalTime();
            }

            _db.AnalyticsEvents.Add(new AnalyticsEventEntity
            {
                EventName     = ev.EventName[..Math.Min(ev.EventName.Length, 80)],
                UserId        = ev.UserId ?? authedUserId,
                Role          = ev.Role   ?? authedRole,
                PayloadJson   = ev.Payload is not null
                    ? JsonSerializer.Serialize(ev.Payload, JsonOpts)
                    : "{}",
                OccurredAtUtc = occurredAt,
                ReceivedAtUtc = now,
            });
        }

        await _db.SaveChangesAsync();
        return NoContent();
    }
}
