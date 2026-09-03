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
    /// <summary>
    /// Fixed, non-dynamic labels for rejection logging. Deliberately distinct from raw
    /// <c>context.Request.Path</c>: the two public-sign routes embed the live signing
    /// tokenId as a URL segment, so logging the path directly would leak it. These labels
    /// are compile-time constants classified by route, never derived from request data.
    /// </summary>
    private static class RouteLabels
    {
        public const string Login = "/api/auth/login";
        public const string TwoFactorLogin = "/api/auth/2fa/login";
        public const string TwoFactorRecovery = "/api/auth/2fa/recovery";
        public const string ForgotPassword = "/api/auth/forgot-password";
        public const string ResetPassword = "/api/auth/reset-password";
        public const string PublicSignRequestOtp = "/api/public/sign/{tokenId}/request-otp";
        public const string PublicSignVerifyOtp = "/api/public/sign/{tokenId}/verify-otp";
        public const string PublicSignSubmit = "/api/public/sign/{tokenId}/submit";
    }

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

        if (path.Equals("/api/auth/login", StringComparison.OrdinalIgnoreCase))
        {
            if (!await TryAcquireAsync(context, _limiters.CredentialIp, ipKey, RouteLabels.Login))
            {
                return;
            }
        }
        else if (path.Equals("/api/auth/2fa/login", StringComparison.OrdinalIgnoreCase))
        {
            if (!await TryAcquireAsync(context, _limiters.CredentialIp, ipKey, RouteLabels.TwoFactorLogin))
            {
                return;
            }
        }
        else if (path.Equals("/api/auth/2fa/recovery", StringComparison.OrdinalIgnoreCase))
        {
            if (!await TryAcquireAsync(context, _limiters.CredentialIp, ipKey, RouteLabels.TwoFactorRecovery))
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
            if (!await TryAcquireAsync(context, _limiters.ForgotPasswordEmail, emailKey, RouteLabels.ForgotPassword))
            {
                return;
            }
            if (!await TryAcquireAsync(context, _limiters.EmailDispatchIp, ipKey, RouteLabels.ForgotPassword))
            {
                return;
            }
        }
        else if (path.Equals("/api/auth/reset-password", StringComparison.OrdinalIgnoreCase))
        {
            if (!await TryAcquireAsync(context, _limiters.ResetPasswordIp, ipKey, RouteLabels.ResetPassword))
            {
                return;
            }
        }
        else if (TryMatchPublicSignRoute(path, out var tokenId, out var action))
        {
            if (string.Equals(action, "request-otp", StringComparison.OrdinalIgnoreCase))
            {
                var tokenKey = $"token:{tokenId}";
                if (!await TryAcquireAsync(context, _limiters.RequestOtpToken, tokenKey, RouteLabels.PublicSignRequestOtp))
                {
                    return;
                }
                if (!await TryAcquireAsync(context, _limiters.EmailDispatchIp, ipKey, RouteLabels.PublicSignRequestOtp))
                {
                    return;
                }
            }
            else if (string.Equals(action, "submit", StringComparison.OrdinalIgnoreCase))
            {
                var tokenKey = $"token:{tokenId}";
                if (!await TryAcquireAsync(context, _limiters.SubmitToken, tokenKey, RouteLabels.PublicSignSubmit))
                {
                    return;
                }
                if (!await TryAcquireAsync(context, _limiters.SubmitIp, ipKey, RouteLabels.PublicSignSubmit))
                {
                    return;
                }
            }
            else if (string.Equals(action, "verify-otp", StringComparison.OrdinalIgnoreCase))
            {
                // Deliberately shares Submit's limiters, not a separate dimension: a
                // successful guess here is exactly as informative to an attacker as a
                // successful Submit would be, so it must cost the same rate-limit budget —
                // otherwise this pre-check would become a cheaper, unprotected way to brute
                // force the OTP ahead of the real Submit call.
                var tokenKey = $"token:{tokenId}";
                if (!await TryAcquireAsync(context, _limiters.SubmitToken, tokenKey, RouteLabels.PublicSignVerifyOtp))
                {
                    return;
                }
                if (!await TryAcquireAsync(context, _limiters.SubmitIp, ipKey, RouteLabels.PublicSignVerifyOtp))
                {
                    return;
                }
            }
        }

        await _next(context);
    }

    private async Task<bool> TryAcquireAsync(HttpContext context, NamedLimiter dimension, string key, string routeLabel)
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

        // Deliberately generic: routeLabel is always one of the fixed RouteLabels
        // constants above, never context.Request.Path (which embeds the live tokenId for
        // the two public-sign routes) and never the partition key or a derivative of it
        // (including a hash — not an appropriate anonymization boundary). No email, IP,
        // OTP, password, reset token, Authorization header, or internal limiter state.
        _logger.LogWarning("Rate limit exceeded for {Route}", routeLabel);

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
            || string.Equals(action, "verify-otp", StringComparison.OrdinalIgnoreCase)
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
