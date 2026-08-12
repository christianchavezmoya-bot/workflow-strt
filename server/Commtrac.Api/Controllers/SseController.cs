using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using Commtrac.Api.Hosting;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;

namespace Commtrac.Api.Controllers;

/// <summary>
/// Server-Sent Events endpoint.
/// EventSource cannot send custom headers, so the JWT is passed as ?token=...
/// The endpoint validates it manually with the same key/issuer/audience used by the
/// standard JwtBearer middleware.
/// </summary>
[ApiController]
[Route("api/sse")]
// Exempt from the global fallback policy: EventSource cannot send an Authorization
// header, so the JWT arrives as ?token=... and is validated by hand in ValidateToken
// below. The endpoint is not unauthenticated — it authenticates itself.
[AllowAnonymous]
public class SseController : ControllerBase
{
    private readonly SseHub       _hub;
    private readonly IConfiguration _config;
    private readonly IHostEnvironment _environment;

    // Hard ceiling on a single SSE stream's lifetime. A client that vanishes ungracefully
    // (mobile Wi-Fi drop, device sleep) may never trigger RequestAborted; without a ceiling
    // the stream — and its socket handle + channel — could live forever. At the deadline we
    // close cleanly and EventSource reconnects automatically.
    private static readonly TimeSpan MaxConnectionLifetime = TimeSpan.FromMinutes(30);

    // A write to a dead-but-not-yet-reset socket can hang; time it out so the connection is
    // reaped promptly instead of lingering.
    private static readonly TimeSpan WriteTimeout = TimeSpan.FromSeconds(15);

    public SseController(SseHub hub, IConfiguration config, IHostEnvironment environment)
    {
        _hub    = hub;
        _config = config;
        _environment = environment;
    }

    // GET api/sse/events?token=<jwt>
    [HttpGet("events")]
    public async Task Events([FromQuery] string? token, CancellationToken ct)
    {
        var principal = ValidateToken(token);
        if (principal is null)
        {
            Response.StatusCode = 401;
            await Response.WriteAsync("Unauthorized", ct);
            return;
        }

        var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId))
        {
            Response.StatusCode = 401;
            return;
        }

        // SSE response headers
        Response.Headers["Content-Type"]      = "text/event-stream; charset=utf-8";
        Response.Headers["Cache-Control"]     = "no-cache, no-store";
        Response.Headers["X-Accel-Buffering"] = "no";   // nginx: disable proxy buffering
        Response.Headers["Connection"]        = "keep-alive";

        // Cap this stream's lifetime (see MaxConnectionLifetime). linkedCt fires on client
        // abort OR at the deadline, guaranteeing the stream cannot live indefinitely.
        using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(ct);
        lifetime.CancelAfter(MaxConnectionLifetime);
        var linkedCt = lifetime.Token;

        var conn = _hub.Connect(userId);

        // Heartbeat loop — writes to the channel every 30 s so the TCP socket stays alive
        // behind reverse proxies / firewalls that would otherwise close idle connections.
        using var hbTimer = new PeriodicTimer(TimeSpan.FromSeconds(30));
        var heartbeat = HeartbeatLoopAsync(conn, hbTimer, linkedCt);

        try
        {
            // Send a connected event so the client knows the stream is live
            await WriteEventAsync($"event: connected\ndata: {{\"userId\":\"{userId}\"}}\n\n", linkedCt);

            await foreach (var msg in conn.Channel.Reader.ReadAllAsync(linkedCt))
            {
                await WriteEventAsync($"event: {msg.Event}\ndata: {msg.Data}\n\n", linkedCt);
            }
        }
        catch (OperationCanceledException) { /* client disconnected / lifetime elapsed / write timed out — normal */ }
        catch (Exception) { /* broken pipe or write failure — reaped by finally */ }
        finally
        {
            lifetime.Cancel();       // stop the heartbeat loop
            _hub.Disconnect(conn);   // remove from hub + complete the channel
            try { await heartbeat; } catch { /* already torn down */ }
        }
    }

    // GET api/sse/status  (health-check, no auth)
    [HttpGet("status")]
    public IActionResult Status() =>
        Ok(new { connections = _hub.ConnectionCount, utc = DateTime.UtcNow });

    // ── Helpers ───────────────────────────────────────────────────────────────

    private async Task WriteEventAsync(string text, CancellationToken ct)
    {
        // Guard every write with a timeout so a dead socket that never faults the write
        // (client gone but TCP not yet reset) unblocks the loop and gets reaped.
        using var writeCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        writeCts.CancelAfter(WriteTimeout);
        var bytes = Encoding.UTF8.GetBytes(text);
        await Response.Body.WriteAsync(bytes, writeCts.Token);
        await Response.Body.FlushAsync(writeCts.Token);
    }

    private static async Task HeartbeatLoopAsync(
        SseConnection  conn,
        PeriodicTimer  timer,
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
        catch (OperationCanceledException) { /* expected on disconnect / lifetime end */ }
        catch (ChannelClosedException) { /* channel completed during reap — expected */ }
    }

    private ClaimsPrincipal? ValidateToken(string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;

        var jwtKey      = JwtKeyResolver.Resolve(_config, _environment);
        var jwtIssuer   = _config["Jwt:Issuer"]   ?? "commtrac";
        var jwtAudience = _config["Jwt:Audience"] ?? "commtrac-ui";

        try
        {
            var handler = new JwtSecurityTokenHandler();
            var key     = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));

            var principal = handler.ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuer           = true,
                ValidateAudience         = true,
                ValidateLifetime         = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer              = jwtIssuer,
                ValidAudience            = jwtAudience,
                IssuerSigningKey         = key,
                ClockSkew                = TimeSpan.FromSeconds(60),
            }, out _);

            return principal;
        }
        catch { return null; }
    }
}
