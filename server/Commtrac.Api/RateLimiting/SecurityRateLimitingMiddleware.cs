using System.Text.Json;
using System.Threading.RateLimiting;
using Microsoft.Extensions.Primitives;

namespace Commtrac.Api.RateLimiting;

/// <summary>
/// Applies Phase 2's anonymous-endpoint rate limits before the matching controller action
/// ever runs. Implemented as a small hand-written middleware rather than the declarative
/// Microsoft.AspNetCore.RateLimiting `[EnableRateLimiting]` + named-policy system: that
/// system associates exactly one partition-key function per named policy, and several
/// endpoints here need two independent dimensions (e.g. recipient email AND client IP,
/// each with its own threshold) that must each be checked and can each reject on their own.
/// Composing that declaratively is the "materially duplicates/conflicts" case the PR
/// discussion flagged — a purpose-built middleware using the same underlying
/// System.Threading.RateLimiting primitives (PartitionedRateLimiter, SlidingWindowRateLimiter)
/// is more direct without fighting the framework's per-policy model. This still is "ASP.NET
/// Core built-in rate limiting" at the primitive-library level; it's the higher-level
/// middleware/attribute convenience layer specifically that isn't used, and only because it
/// doesn't fit the dual-dimension requirement.
///
/// Must be registered after UseForwardedHeaders() (so RemoteIpAddress is already the real,
/// trust-boundary-checked client IP — see ClientIpKeyResolver) and before MapControllers()
/// (so a rejected request never reaches the controller, and in particular never reaches the
/// email-dispatch code in ForgotPassword/RequestOtp).
/// </summary>
public sealed class SecurityRateLimitingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly SecurityRateLimiterRegistry _limiters;
    private readonly ILogger<SecurityRateLimitingMiddleware> _logger;

    public SecurityRateLimitingMiddleware(RequestDelegate next, SecurityRateLimiterRegistry limiters, ILogger<SecurityRateLimitingMiddleware> logger)
    {
        _next = next;
        _limiters = limiters;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (!HttpMethods.IsPost(context.Request.Method))
        {
            await _next(context);
            return;
        }

        var path = context.Request.Path;
        var ipKey = ClientIpKeyResolver.Resolve(context);

        if (path.Equals("/api/auth/login", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/api/auth/2fa/login", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/api/auth/2fa/recovery", StringComparison.OrdinalIgnoreCase))
        {
            if (!await TryAcquireAsync(context, _limiters.CredentialIp, ipKey))
            {
                return;
            }
        }
        else if (path.Equals("/api/auth/forgot-password", StringComparison.OrdinalIgnoreCase))
        {
            var email = await TryReadEmailFromBodyAsync(context);
            var emailKey = NormalizeEmailKey(email);

            // Recipient dimension first: cheaper to reject on, and the more specific
            // "this recipient is being spammed" signal.
            if (!await TryAcquireAsync(context, _limiters.ForgotPasswordEmail, emailKey))
            {
                return;
            }
            if (!await TryAcquireAsync(context, _limiters.EmailDispatchIp, ipKey))
            {
                return;
            }
        }
        else if (path.Equals("/api/auth/reset-password", StringComparison.OrdinalIgnoreCase))
        {
            if (!await TryAcquireAsync(context, _limiters.ResetPasswordIp, ipKey))
            {
                return;
            }
        }
        else if (TryMatchPublicSignRoute(path, out var tokenId, out var action))
        {
            if (string.Equals(action, "request-otp", StringComparison.OrdinalIgnoreCase))
            {
                var tokenKey = $"token:{tokenId}";
                if (!await TryAcquireAsync(context, _limiters.RequestOtpToken, tokenKey))
                {
                    return;
                }
                if (!await TryAcquireAsync(context, _limiters.EmailDispatchIp, ipKey))
                {
                    return;
                }
            }
            else if (string.Equals(action, "submit", StringComparison.OrdinalIgnoreCase))
            {
                var tokenKey = $"token:{tokenId}";
                if (!await TryAcquireAsync(context, _limiters.SubmitToken, tokenKey))
                {
                    return;
                }
                if (!await TryAcquireAsync(context, _limiters.SubmitIp, ipKey))
                {
                    return;
                }
            }
        }

        await _next(context);
    }

    private async Task<bool> TryAcquireAsync(HttpContext context, NamedLimiter dimension, string key)
    {
        using var lease = await dimension.Limiter.AcquireAsync(key, permitCount: 1, context.RequestAborted);
        if (lease.IsAcquired)
        {
            return true;
        }

        // Empirically, SlidingWindowRateLimiter with QueueLimit=0 does not populate
        // RetryAfter lease metadata on rejection in this SDK. Fall back to the dimension's
        // own configured window as a generic, non-request-specific estimate — a static
        // policy constant, not internal limiter/request state.
        TimeSpan? retryAfter = lease.TryGetMetadata(MetadataName.RetryAfter, out var ra) ? ra : dimension.Window;

        // Deliberately generic: no partition key or derivative of it (including a hash —
        // not an appropriate anonymization boundary), no email/tokenId/IP, no internal
        // limiter state.
        _logger.LogWarning("Rate limit exceeded for {Path}", context.Request.Path);

        context.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        context.Response.ContentType = "application/json";
        if (retryAfter.HasValue)
        {
            context.Response.Headers.RetryAfter = new StringValues(((int)Math.Ceiling(retryAfter.Value.TotalSeconds)).ToString());
        }
        await context.Response.WriteAsJsonAsync(new { message = "Too many requests. Please try again later." }, context.RequestAborted);
        return false;
    }

    private static bool TryMatchPublicSignRoute(PathString path, out string tokenId, out string action)
    {
        tokenId = string.Empty;
        action = string.Empty;

        const string prefix = "/api/public/sign/";
        var value = path.Value;
        if (value is null || !value.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var remainder = value[prefix.Length..];
        var segments = remainder.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length != 2)
        {
            return false;
        }

        tokenId = segments[0];
        action = segments[1];
        return string.Equals(action, "request-otp", StringComparison.OrdinalIgnoreCase)
            || string.Equals(action, "submit", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Peeks the request body for the top-level "email" field without consuming it for the
    /// downstream [FromBody] model binder — buffers, reads, then rewinds to position 0.
    /// Never logs the body content.
    /// </summary>
    private static async Task<string?> TryReadEmailFromBodyAsync(HttpContext context)
    {
        try
        {
            context.Request.EnableBuffering();
            using var doc = await JsonDocument.ParseAsync(context.Request.Body, default, context.RequestAborted);
            context.Request.Body.Position = 0;

            if (doc.RootElement.ValueKind == JsonValueKind.Object
                && doc.RootElement.TryGetProperty("email", out var emailProp)
                && emailProp.ValueKind == JsonValueKind.String)
            {
                return emailProp.GetString();
            }
        }
        catch (JsonException)
        {
            // Malformed body — let the real [FromBody] binder produce the normal 400.
        }
        finally
        {
            if (context.Request.Body.CanSeek)
            {
                context.Request.Body.Position = 0;
            }
        }

        return null;
    }

    private static string NormalizeEmailKey(string? email)
    {
        var trimmed = email?.Trim().ToLowerInvariant();
        // No email present/parseable: fall back to a single shared bounded partition
        // rather than skipping the recipient-dimension check entirely.
        return string.IsNullOrEmpty(trimmed) ? "email:unknown" : $"email:{trimmed}";
    }
}
