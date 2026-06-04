using System.Security.Claims;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/notifications")]
[Authorize]
public class NotificationsController : ControllerBase
{
    private readonly NotificationFeedService _feed;

    public NotificationsController(NotificationFeedService feed)
    {
        _feed = feed;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<NotificationInboxDto>>> List(
        [FromQuery] bool includeRead = true,
        [FromQuery] int take = 50)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var role = User.FindFirstValue(ClaimTypes.Role);
        if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(role))
        {
            return Unauthorized();
        }

        return Ok(await _feed.ListForUserAsync(userId, role, includeRead, take));
    }

    [HttpPost("acknowledge")]
    public async Task<ActionResult<object>> Acknowledge([FromBody] AcknowledgeNotificationsRequest request)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var role = User.FindFirstValue(ClaimTypes.Role);
        if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(role))
        {
            return Unauthorized();
        }

        var updated = await _feed.MarkAsReadAsync(userId, role, request.NotificationIds);
        return Ok(new { updated });
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Create([FromBody] CreateNotificationRequest request)
    {
        await _feed.CreateAsync(request);
        return Accepted();
    }
}
