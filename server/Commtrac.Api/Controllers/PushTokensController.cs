using System.Security.Claims;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/push-tokens")]
[Authorize]
public class PushTokensController : ControllerBase
{
    private readonly AppDbContext _db;

    public PushTokensController(AppDbContext db)
    {
        _db = db;
    }

    [HttpPost]
    public async Task<IActionResult> Register([FromBody] RegisterPushTokenRequest request)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();
        if (string.IsNullOrWhiteSpace(request.Token)) return BadRequest(new { error = "token required" });

        var platform = string.IsNullOrWhiteSpace(request.Platform)
            ? "unknown"
            : request.Platform.Trim().ToLowerInvariant();

        var existing = await _db.PushDeviceTokens
            .FirstOrDefaultAsync(t => t.Token == request.Token.Trim());

        var now = DateTime.UtcNow;
        if (existing is null)
        {
            _db.PushDeviceTokens.Add(new PushDeviceTokenEntity
            {
                UserId = userId,
                Token = request.Token.Trim(),
                Platform = platform,
                CreatedAtUtc = now,
                UpdatedAtUtc = now,
            });
        }
        else
        {
            existing.UserId = userId;
            existing.Platform = platform;
            existing.UpdatedAtUtc = now;
        }

        await _db.SaveChangesAsync();
        return Ok(new { registered = true });
    }

    [HttpDelete]
    public async Task<IActionResult> Unregister([FromBody] UnregisterPushTokenRequest request)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();
        if (string.IsNullOrWhiteSpace(request.Token)) return BadRequest(new { error = "token required" });

        var existing = await _db.PushDeviceTokens
            .FirstOrDefaultAsync(t => t.Token == request.Token.Trim() && t.UserId == userId);

        if (existing is not null)
        {
            _db.PushDeviceTokens.Remove(existing);
            await _db.SaveChangesAsync();
        }

        return Ok(new { removed = existing is not null });
    }
}
