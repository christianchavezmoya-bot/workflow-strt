using System.Threading.RateLimiting;

namespace Commtrac.Api.RateLimiting;

/// <summary>
/// A configured limiter dimension: the underlying limiter instance plus the window it was
/// configured with (exposed so the middleware can report a useful Retry-After even in the
/// cases documented below where the lease itself doesn't supply exact retry metadata).
/// </summary>
public sealed record NamedLimiter(PartitionedRateLimiter<string> Limiter, TimeSpan Window);

/// <summary>
/// Holds the sliding-window limiter instances backing Phase 2's anonymous-endpoint rate
/// limiting, one per named dimension in <see cref="SecurityRateLimitPolicies"/>.
///
/// Registered as a singleton so partitions persist for the lifetime of the process (this is
/// an in-memory, per-instance limiter — see the "known limitations" note in the PR
/// description regarding multiple ECS tasks). Each PartitionedRateLimiter created via
/// PartitionedRateLimiter.Create already evicts idle partitions automatically, so this does
/// not reproduce the unbounded-growth characteristic of AuthController's existing
/// _loginAttempts/_2faAttempts dictionaries.
///
/// The windows are constructor parameters, defaulted to the real production thresholds from
/// SecurityRateLimitPolicies, specifically so tests can construct a registry with short
/// (e.g. 2-second) windows to exercise window-expiry behavior deterministically without a
/// 15-minute real-time wait. Production wiring (Program.cs) always uses the parameterless
/// constructor — the thresholds actually enforced in production are never touched by this.
/// (System.Threading.RateLimiting's SlidingWindowRateLimiterOptions in this SDK version has
/// no TimeProvider hook to fake the clock instead, which would have been the alternative.)
///
/// Note: empirically, SlidingWindowRateLimiter with QueueLimit=0 (immediate rejection, no
/// queueing — the correct choice for these endpoints) does not populate RetryAfter lease
/// metadata on rejection in this SDK. The middleware falls back to the dimension's own
/// configured window as a safe, generic Retry-After estimate in that case.
/// </summary>
public sealed class SecurityRateLimiterRegistry
{
    public NamedLimiter CredentialIp { get; }
    public NamedLimiter EmailDispatchIp { get; }
    public NamedLimiter ForgotPasswordEmail { get; }
    public NamedLimiter RequestOtpToken { get; }
    public NamedLimiter ResetPasswordIp { get; }
    public NamedLimiter SubmitToken { get; }
    public NamedLimiter SubmitIp { get; }

    public SecurityRateLimiterRegistry(
        int credentialIpPermitLimit = SecurityRateLimitPolicies.CredentialIpPermitLimit,
        TimeSpan? credentialIpWindow = null,
        int emailDispatchIpPermitLimit = SecurityRateLimitPolicies.EmailDispatchIpPermitLimit,
        TimeSpan? emailDispatchIpWindow = null,
        int forgotPasswordEmailPermitLimit = SecurityRateLimitPolicies.ForgotPasswordEmailPermitLimit,
        TimeSpan? forgotPasswordEmailWindow = null,
        int requestOtpTokenPermitLimit = SecurityRateLimitPolicies.RequestOtpTokenPermitLimit,
        TimeSpan? requestOtpTokenWindow = null,
        int resetPasswordIpPermitLimit = SecurityRateLimitPolicies.ResetPasswordIpPermitLimit,
        TimeSpan? resetPasswordIpWindow = null,
        int submitTokenPermitLimit = SecurityRateLimitPolicies.SubmitTokenPermitLimit,
        TimeSpan? submitTokenWindow = null,
        int submitIpPermitLimit = SecurityRateLimitPolicies.SubmitIpPermitLimit,
        TimeSpan? submitIpWindow = null)
    {
        CredentialIp = Create(credentialIpPermitLimit, credentialIpWindow ?? SecurityRateLimitPolicies.CredentialIpWindow);
        EmailDispatchIp = Create(emailDispatchIpPermitLimit, emailDispatchIpWindow ?? SecurityRateLimitPolicies.EmailDispatchIpWindow);
        ForgotPasswordEmail = Create(forgotPasswordEmailPermitLimit, forgotPasswordEmailWindow ?? SecurityRateLimitPolicies.ForgotPasswordEmailWindow);
        RequestOtpToken = Create(requestOtpTokenPermitLimit, requestOtpTokenWindow ?? SecurityRateLimitPolicies.RequestOtpTokenWindow);
        ResetPasswordIp = Create(resetPasswordIpPermitLimit, resetPasswordIpWindow ?? SecurityRateLimitPolicies.ResetPasswordIpWindow);
        SubmitToken = Create(submitTokenPermitLimit, submitTokenWindow ?? SecurityRateLimitPolicies.SubmitTokenWindow);
        SubmitIp = Create(submitIpPermitLimit, submitIpWindow ?? SecurityRateLimitPolicies.SubmitIpWindow);
    }

    private static NamedLimiter Create(int permitLimit, TimeSpan window)
    {
        var limiter = PartitionedRateLimiter.Create<string, string>(key =>
            RateLimitPartition.GetSlidingWindowLimiter(key, _ => new SlidingWindowRateLimiterOptions
            {
                PermitLimit = permitLimit,
                Window = window,
                SegmentsPerWindow = Math.Max(1, Math.Min(6, permitLimit)),
                QueueLimit = 0, // reject immediately rather than queueing — this protects
                                 // login/OTP/reset endpoints, not throughput-sensitive ones.
                AutoReplenishment = true,
            }));
        return new NamedLimiter(limiter, window);
    }
}
