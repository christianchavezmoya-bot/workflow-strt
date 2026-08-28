using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Threading.Channels;
using Commtrac.Api.Data;
using Commtrac.Api.Hosting;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;

namespace Commtrac.Api.Controllers;

/// <summary>
/// Server-Sent Events endpoint.
/// Clients obtain a short-lived opaque ticket via POST /api/sse/ticket (Authorization header),
/// then connect with GET /api/sse/events?ticket=...
/// Legacy ?token= JWT query auth is supported temporarily for safe rollout.
/// </summary>
[ApiController]
[Route("api/sse")]
[AllowAnonymous]
public class SseController : ControllerBase
{
    private readonly SseHub _hub;
    private readonly SseTicketStore _tickets;
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;
    private readonly IHostEnvironment _environment;

    private static readonly TimeSpan MaxConnectionLifetime = TimeSpan.FromMinutes(30);
    private static readonly TimeSpan WriteTimeout = TimeSpan.FromSeconds(15);

    public SseController(
        SseHub hub,
        SseTicketStore tickets,
        AppDbContext db,
        IConfiguration config,
        IHostEnvironment environment)
    {
        _hub = hub;
        _tickets = tickets;
        _db = db;
        _config = config;
        _environment = environment;
    }

    /// <summary>Exchange a valid JWT session for a single-use SSE connection ticket.</summary>
    [HttpPost("ticket")]
    [Authorize]
    public async Task<ActionResult<SseTicketResponse>> IssueTicket(CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId))
        {
            return Unauthorized();
        }

        var sessionId = User.FindFirstValue("sid");
        if (!await IsSessionValidAsync(sessionId, ct))
        {
            return Unauthorized();
        }

        var result = _tickets.TryIssue(userId, sessionId);
        if (result.Status == SseTicketIssueStatus.RateLimited)
        {
            Response.Headers.RetryAfter = result.RetryAfterSeconds.ToString();
            return StatusCode(429, new { message = "Too many SSE ticket requests. Try again shortly." });
        }

        return Ok(new SseTicketResponse(result.Ticket!, result.ExpiresInSeconds));
    }

    // GET api/sse/events?ticket=<opaque>  (preferred)
    // GET api/sse/events?token=<jwt>      (legacy — remove after all clients migrate)
    [HttpGet("events")]
    public async Task Events([FromQuery] string? ticket, [FromQuery] string? token, CancellationToken ct)
    {
        string? userId = null;

        if (!string.IsNullOrWhiteSpace(ticket))
        {
            if (!_tickets.TryConsume(ticket, out var ticketUserId, out var ticketSessionId))
            {
                Response.StatusCode = 401;
                await Response.WriteAsync("Unauthorized", ct);
                return;
            }

            if (!await IsSessionValidAsync(ticketSessionId, ct))
            {
                Response.StatusCode = 401;
                await Response.WriteAsync("Unauthorized", ct);
                return;
            }

            userId = ticketUserId;
        }
        else if (!string.IsNullOrWhiteSpace(token))
        {
            var principal = ValidateLegacyJwt(token);
            if (principal is null)
            {
                Response.StatusCode = 401;
                await Response.WriteAsync("Unauthorized", ct);
                return;
            }

            userId = principal.FindFirstValue(ClaimTypes.NameIdentifier);
            var sessionId = principal.FindFirstValue("sid");
            if (!await IsSessionValidAsync(sessionId, ct))
            {
                Response.StatusCode = 401;
                await Response.WriteAsync("Unauthorized", ct);
                return;
            }
        }
        else
        {
            Response.StatusCode = 401;
            await Response.WriteAsync("Unauthorized", ct);
            return;
        }

        if (string.IsNullOrWhiteSpace(userId))
        {
            Response.StatusCode = 401;
            return;
        }

        Response.Headers["Content-Type"] = "text/event-stream; charset=utf-8";
        Response.Headers["Cache-Control"] = "no-cache, no-store";
        Response.Headers["X-Accel-Buffering"] = "no";
        Response.Headers["Connection"] = "keep-alive";

        using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(ct);
        lifetime.CancelAfter(MaxConnectionLifetime);
        var linkedCt = lifetime.Token;

        var conn = _hub.Connect(userId);

        using var hbTimer = new PeriodicTimer(TimeSpan.FromSeconds(30));
        var heartbeat = HeartbeatLoopAsync(conn, hbTimer, linkedCt);

        try
        {
            await WriteEventAsync($"event: connected\ndata: {{\"userId\":\"{userId}\"}}\n\n", linkedCt);

            await foreach (var msg in conn.Channel.Reader.ReadAllAsync(linkedCt))
            {
                await WriteEventAsync($"event: {msg.Event}\ndata: {msg.Data}\n\n", linkedCt);
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception) { }
        finally
        {
            lifetime.Cancel();
            _hub.Disconnect(conn);
            try { await heartbeat; } catch { }
        }
    }

    [HttpGet("status")]
    public IActionResult Status() =>
        Ok(new { connections = _hub.ConnectionCount, utc = DateTime.UtcNow });

    private async Task<bool> IsSessionValidAsync(string? sessionId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(sessionId)) return true;

        var session = await _db.Sessions
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == sessionId, ct);

        return session is not null && !session.IsRevoked;
    }

    private async Task WriteEventAsync(string text, CancellationToken ct)
    {
        using var writeCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        writeCts.CancelAfter(WriteTimeout);
        var bytes = Encoding.UTF8.GetBytes(text);
        await Response.Body.WriteAsync(bytes, writeCts.Token);
        await Response.Body.FlushAsync(writeCts.Token);
    }

    private static async Task HeartbeatLoopAsync(
        SseConnection conn,
        PeriodicTimer timer,
        CancellationToken ct)
    {
        try
        {
            while (await timer.WaitForNextTickAsync(ct))
            {
                await conn.Channel.Writer.WriteAsync(
                    new SseMessage { Event = "heartbeat", Data = "{}" }, ct);
            }
        }
        catch (OperationCanceledException) { }
        catch (ChannelClosedException) { }
    }

    private ClaimsPrincipal? ValidateLegacyJwt(string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;

        var jwtKey = JwtKeyResolver.Resolve(_config, _environment);
        var jwtIssuer = _config["Jwt:Issuer"] ?? "commtrac";
        var jwtAudience = _config["Jwt:Audience"] ?? "commtrac-ui";

        try
        {
            var handler = new JwtSecurityTokenHandler();
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));

            return handler.ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = jwtIssuer,
                ValidAudience = jwtAudience,
                IssuerSigningKey = key,
                ClockSkew = TimeSpan.FromSeconds(60),
            }, out _);
        }
        catch
        {
            return null;
        }
    }
}
