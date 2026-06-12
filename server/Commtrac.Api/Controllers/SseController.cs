using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Mvc;
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
public class SseController : ControllerBase
{
    private readonly SseHub       _hub;
    private readonly IConfiguration _config;

    public SseController(SseHub hub, IConfiguration config)
    {
        _hub    = hub;
        _config = config;
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

        var conn = _hub.Connect(userId);

        // Heartbeat loop — writes to the channel every 30 s so the TCP socket stays alive
        // behind reverse proxies / firewalls that would otherwise close idle connections.
        using var hbTimer = new PeriodicTimer(TimeSpan.FromSeconds(30));
        var heartbeat = HeartbeatLoopAsync(conn, hbTimer, ct);

        try
        {
            // Send a connected event so the client knows the stream is live
            await WriteLineAsync($"event: connected\ndata: {{\"userId\":\"{userId}\"}}\n\n", ct);

            await foreach (var msg in conn.Channel.Reader.ReadAllAsync(ct))
            {
                await WriteLineAsync($"event: {msg.Event}\ndata: {msg.Data}\n\n", ct);
                await Response.Body.FlushAsync(ct);
            }
        }
        catch (OperationCanceledException) { /* client disconnected — normal */ }
        finally
        {
            _hub.Disconnect(conn);
            await heartbeat; // let the heartbeat task finish cleanly
        }
    }

    // GET api/sse/status  (health-check, no auth)
    [HttpGet("status")]
    public IActionResult Status() =>
        Ok(new { connections = _hub.ConnectionCount, utc = DateTime.UtcNow });

    // ── Helpers ───────────────────────────────────────────────────────────────

    private async Task WriteLineAsync(string text, CancellationToken ct)
    {
        var bytes = Encoding.UTF8.GetBytes(text);
        await Response.Body.WriteAsync(bytes, ct);
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
        catch (OperationCanceledException) { /* expected on disconnect */ }
    }

    private ClaimsPrincipal? ValidateToken(string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;

        var jwtKey      = _config["Jwt:Key"]      ?? "dev-only-change-me";
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
