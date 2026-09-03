namespace Commtrac.Api.RateLimiting;

/// <summary>
/// Centralized thresholds for the anonymous-endpoint rate limiting added in Phase 2.
/// Kept as named constants rather than scattered literals so every threshold has exactly
/// one definition, referenced identically by production wiring and tests.
/// </summary>
public static class SecurityRateLimitPolicies
{
    // ── Credential endpoints: /login, /2fa/login, /2fa/recovery ────────────────────────
    // IP dimension only. AuthController already enforces a 5-failed-attempts/15-minute
    // account lockout (keyed by email for login, by userId for 2FA) — that mechanism is
    // untouched by this PR. Adding a second, separately-tracked account-keyed limiter
    // here would duplicate that existing protection rather than add a distinct layer, so
    // credential endpoints get only the new IP dimension: a broader anti-abuse net that
    // catches one IP hammering many different accounts, which the account lockout alone
    // cannot see.
    public const int CredentialIpPermitLimit = 30;
    public static readonly TimeSpan CredentialIpWindow = TimeSpan.FromMinutes(5);

    // ── Email/OTP dispatch: /forgot-password, /request-otp ─────────────────────────────
    // Shared IP-dimension threshold across both endpoints in this family.
    public const int EmailDispatchIpPermitLimit = 10;
    public static readonly TimeSpan EmailDispatchIpWindow = TimeSpan.FromMinutes(15);

    // /forgot-password — recipient dimension, keyed by the normalized submitted email
    // (checked before the account-existence lookup, so the limiter behaves identically
    // whether or not the email belongs to a real user).
    public const int ForgotPasswordEmailPermitLimit = 3;
    public static readonly TimeSpan ForgotPasswordEmailWindow = TimeSpan.FromMinutes(15);

    // /public/sign/{tokenId}/request-otp — recipient dimension, keyed by tokenId (there is
    // no account identity on this anonymous endpoint; tokenId is the natural equivalent).
    public const int RequestOtpTokenPermitLimit = 3;
    public static readonly TimeSpan RequestOtpTokenWindow = TimeSpan.FromMinutes(15);

    // ── Token verification: /reset-password ─────────────────────────────────────────────
    // IP dimension only. Deliberately NOT partitioned on the reset token: the token is a
    // 256-bit CSPRNG value (RandomNumberGenerator.GetBytes(32)) and must never be logged,
    // cached, or used as any kind of lookup/partition key outside the DB comparison it
    // already goes through.
    public const int ResetPasswordIpPermitLimit = 10;
    public static readonly TimeSpan ResetPasswordIpWindow = TimeSpan.FromMinutes(15);

    // ── Public signing OTP submission: /public/sign/{tokenId}/submit ───────────────────
    // Token dimension: this counts *requests* to the endpoint, not incorrect OTP values
    // specifically — PublicSignController.Submit has no persistent "N wrong attempts"
    // state of its own, and this PR does not add one (see PR description). A request-rate
    // cap per tokenId is the intentionally chosen, simpler protection for this pass.
    public const int SubmitTokenPermitLimit = 5;
    public static readonly TimeSpan SubmitTokenWindow = TimeSpan.FromMinutes(15);

    // Generous IP outer limit — this endpoint is also hit during completely legitimate
    // multi-field-worker signing flows, so the IP dimension here is deliberately wide.
    public const int SubmitIpPermitLimit = 30;
    public static readonly TimeSpan SubmitIpWindow = TimeSpan.FromMinutes(5);
}
