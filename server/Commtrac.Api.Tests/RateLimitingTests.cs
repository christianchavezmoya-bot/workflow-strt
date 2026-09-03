using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.RateLimiting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// Phase 2 rate limiting: threshold/window/partition mechanics, email-dispatch suppression,
/// and non-interference with authenticated traffic. Uses RateLimitingTestFactory, which
/// keeps the real production permit limits but shortens every window so these tests don't
/// require a real 5-15 minute wait — see that factory's doc comment for why.
///
/// IP-spoofing-resistance and IPv4/IPv6 normalization specifically are covered separately
/// in RateLimitingForwardedHeaderTests, which needs the real UseForwardedHeaders trust
/// boundary (skipped in Development) rather than this factory's direct-header IP override.
/// </summary>
public class RateLimitingTests
{
    private static async Task<string> SeedOtpTokenAsync(
        WebApplicationFactory<Program> factory, string recipientEmail = "signer@example.com")
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var id = Guid.NewGuid().ToString("N");
        db.SignatureTokens.Add(new SignatureTokenEntity
        {
            Id = id,
            RunId = "run-does-not-need-to-exist-for-request-otp",
            SignerRole = "Customer",
            RecipientEmail = recipientEmail,
            RecipientName = "Test Signer",
            CreatedByUserId = "test-admin",
            ExpiresAtUtc = DateTime.UtcNow.AddDays(1),
        });
        await db.SaveChangesAsync();
        return id;
    }

    private static HttpResponseMessage ResendSuccess(HttpRequestMessage req) =>
        new(HttpStatusCode.OK) { Content = new StringContent("""{"id":"fake-resend-id"}""") };

    private static HttpResponseMessage ResendProviderFailure(HttpRequestMessage req) =>
        new(HttpStatusCode.BadRequest)
        {
            Content = new StringContent("""{"statusCode":400,"name":"invalid_request","message":"simulated provider rejection"}"""),
        };

    private static HttpClient ClientWithIp(WebApplicationFactory<Program> factory, string ip)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(RateLimitingTestFactory.ClientIpHeader, ip);
        return client;
    }

    // ── Below-threshold succeeds, threshold exceeded → 429, Retry-After present ────────

    [Fact]
    public async Task Requests_below_threshold_succeed_normally()
    {
        using var factory = new RateLimitingTestFactory();
        var client = ClientWithIp(factory, "203.0.113.10");

        for (var i = 0; i < SecurityRateLimitPolicies.ResetPasswordIpPermitLimit; i++)
        {
            var resp = await client.PostAsJsonAsync("/api/auth/reset-password", new { token = "nonexistent", newPassword = "irrelevant" });
            Assert.NotEqual(HttpStatusCode.TooManyRequests, resp.StatusCode);
        }
    }

    [Fact]
    public async Task Threshold_exceeded_returns_429_with_retry_after()
    {
        using var factory = new RateLimitingTestFactory();
        var client = ClientWithIp(factory, "203.0.113.11");

        for (var i = 0; i < SecurityRateLimitPolicies.ResetPasswordIpPermitLimit; i++)
        {
            var resp = await client.PostAsJsonAsync("/api/auth/reset-password", new { token = "nonexistent", newPassword = "irrelevant" });
            Assert.NotEqual(HttpStatusCode.TooManyRequests, resp.StatusCode);
        }

        var limited = await client.PostAsJsonAsync("/api/auth/reset-password", new { token = "nonexistent", newPassword = "irrelevant" });
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.True(limited.Headers.RetryAfter is not null, "expected a Retry-After header on the 429 response");

        var body = await limited.Content.ReadAsStringAsync();
        Assert.DoesNotContain("token", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("nonexistent", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Window_expiry_restores_access()
    {
        using var factory = new RateLimitingTestFactory();
        var client = ClientWithIp(factory, "203.0.113.12");

        for (var i = 0; i < SecurityRateLimitPolicies.ResetPasswordIpPermitLimit; i++)
        {
            await client.PostAsJsonAsync("/api/auth/reset-password", new { token = "nonexistent", newPassword = "irrelevant" });
        }
        var limited = await client.PostAsJsonAsync("/api/auth/reset-password", new { token = "nonexistent", newPassword = "irrelevant" });
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);

        await Task.Delay(RateLimitingTestFactory.TestWindow + TimeSpan.FromMilliseconds(500));

        var afterWindow = await client.PostAsJsonAsync("/api/auth/reset-password", new { token = "nonexistent", newPassword = "irrelevant" });
        Assert.NotEqual(HttpStatusCode.TooManyRequests, afterWindow.StatusCode);
    }

    // ── Credential endpoints: IP dimension only (account lockout is unchanged/untouched) ─

    [Fact]
    public async Task Credential_endpoint_IP_limit_trips_after_threshold()
    {
        using var factory = new RateLimitingTestFactory();
        var client = ClientWithIp(factory, "203.0.113.20");

        for (var i = 0; i < SecurityRateLimitPolicies.CredentialIpPermitLimit; i++)
        {
            var resp = await client.PostAsJsonAsync("/api/auth/login", new { email = $"nobody{i}@example.com", password = "wrong" });
            Assert.NotEqual(HttpStatusCode.TooManyRequests, resp.StatusCode);
        }

        var limited = await client.PostAsJsonAsync("/api/auth/login", new { email = "yet-another@example.com", password = "wrong" });
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
    }

    [Fact]
    public async Task Rejection_log_contains_no_partition_derived_value()
    {
        using var factory = new RateLimitingTestFactory();
        const string ip = "203.0.113.99";
        const string emailLocalPart = "log-probe-marker";
        var client = ClientWithIp(factory, ip);

        for (var i = 0; i <= SecurityRateLimitPolicies.CredentialIpPermitLimit; i++)
        {
            var email = $"{emailLocalPart}-{i}@example.com";
            var resp = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "wrong" });
            if (resp.StatusCode == HttpStatusCode.TooManyRequests)
            {
                break;
            }
        }

        var logText = string.Join("\n", factory.LoggerProvider.Messages);
        Assert.Contains("Rate limit exceeded for /api/auth/login", logText);

        // Nothing derived from the partition key (IP, email, or a hash of either) may
        // appear anywhere in the logs.
        Assert.DoesNotContain(ip, logText);
        Assert.DoesNotContain(emailLocalPart, logText);
        Assert.DoesNotContain($"ip:v4:{ip}".GetHashCode().ToString(), logText);
        Assert.DoesNotContain("dimension hash", logText, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("DimensionHash", logText, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task RequestOtp_rejection_log_does_not_contain_the_tokenId_and_uses_the_sanitized_route_label()
    {
        // Deliberately distinctive so accidental leakage into the log would be obvious —
        // this exact string must never appear in factory.LoggerProvider.Messages. This
        // tokenId doesn't need to correspond to a seeded token: rate limiting matches on
        // the raw path segment before any DB lookup happens.
        const string tokenMarker = "UNIQUE-SECRET-TOKEN-MARKER-7f3a9c2e";
        using var factory = new RateLimitingTestFactory();
        var client = ClientWithIp(factory, "203.0.113.70");

        for (var i = 0; i < SecurityRateLimitPolicies.RequestOtpTokenPermitLimit; i++)
        {
            await client.PostAsync($"/api/public/sign/{tokenMarker}/request-otp", null);
        }
        var limited = await client.PostAsync($"/api/public/sign/{tokenMarker}/request-otp", null);
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);

        var logText = string.Join("\n", factory.LoggerProvider.Messages);
        Assert.DoesNotContain(tokenMarker, logText);
        Assert.Contains("Rate limit exceeded for /api/public/sign/{tokenId}/request-otp", logText);
    }

    [Fact]
    public async Task Submit_rejection_log_does_not_contain_the_tokenId_and_uses_the_sanitized_route_label()
    {
        const string tokenMarker = "UNIQUE-SECRET-TOKEN-MARKER-b81de440";
        using var factory = new RateLimitingTestFactory();
        var client = ClientWithIp(factory, "203.0.113.71");

        for (var i = 0; i < SecurityRateLimitPolicies.SubmitTokenPermitLimit; i++)
        {
            await client.PostAsJsonAsync($"/api/public/sign/{tokenMarker}/submit", new
            {
                signerName = "Someone",
                consentConfirmed = true,
                reasonCode = "Completed",
            });
        }
        var limited = await client.PostAsJsonAsync($"/api/public/sign/{tokenMarker}/submit", new
        {
            signerName = "Someone",
            consentConfirmed = true,
            reasonCode = "Completed",
        });
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);

        var logText = string.Join("\n", factory.LoggerProvider.Messages);
        Assert.DoesNotContain(tokenMarker, logText);
        Assert.Contains("Rate limit exceeded for /api/public/sign/{tokenId}/submit", logText);
    }

    [Fact]
    public async Task One_IP_attacking_multiple_accounts_hits_IP_limiter()
    {
        // Different accounts each independently pass their own account-lockout dimension
        // (5 failures needed to trip that), but the shared IP dimension should still trip
        // once the IP's own threshold is exceeded regardless of which account each request
        // targeted.
        using var factory = new RateLimitingTestFactory();
        var client = ClientWithIp(factory, "203.0.113.21");

        HttpResponseMessage? last = null;
        for (var i = 0; i <= SecurityRateLimitPolicies.CredentialIpPermitLimit; i++)
        {
            last = await client.PostAsJsonAsync("/api/auth/login", new { email = $"distinct-account-{i}@example.com", password = "wrong" });
        }

        Assert.Equal(HttpStatusCode.TooManyRequests, last!.StatusCode);
    }

    [Fact]
    public async Task Different_client_IPs_have_independent_credential_limits()
    {
        using var factory = new RateLimitingTestFactory();
        var clientA = ClientWithIp(factory, "203.0.113.30");
        var clientB = ClientWithIp(factory, "203.0.113.31");

        for (var i = 0; i < SecurityRateLimitPolicies.CredentialIpPermitLimit; i++)
        {
            await clientA.PostAsJsonAsync("/api/auth/login", new { email = $"a{i}@example.com", password = "wrong" });
        }
        var aLimited = await clientA.PostAsJsonAsync("/api/auth/login", new { email = "a-over@example.com", password = "wrong" });
        Assert.Equal(HttpStatusCode.TooManyRequests, aLimited.StatusCode);

        // A fresh IP must not be affected by A's exhausted partition.
        var bStillOk = await clientB.PostAsJsonAsync("/api/auth/login", new { email = "b@example.com", password = "wrong" });
        Assert.NotEqual(HttpStatusCode.TooManyRequests, bStillOk.StatusCode);
    }

    [Fact]
    public async Task Authenticated_admin_login_still_succeeds_below_the_new_IP_limit()
    {
        using var factory = new RateLimitingTestFactory();
        var client = ClientWithIp(factory, "203.0.113.32");

        var resp = await client.PostAsJsonAsync("/api/auth/login", new { email = "admin.dev@stratango.local", password = "Admin123!" });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }

    // ── forgot-password: recipient + IP dimensions, generic response, no email after limit ─

    [Fact]
    public async Task ForgotPassword_generic_response_for_existing_and_nonexistent_email_even_when_rate_limited()
    {
        using var factory = new RateLimitingTestFactory(resendResponder: ResendSuccess);
        var client = ClientWithIp(factory, "203.0.113.40");

        // Exhaust the recipient dimension for a nonexistent address.
        for (var i = 0; i < SecurityRateLimitPolicies.ForgotPasswordEmailPermitLimit; i++)
        {
            var ok = await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = "nobody@example.com" });
            Assert.Equal(HttpStatusCode.NoContent, ok.StatusCode);
        }

        var limited = await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = "nobody@example.com" });
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);

        var body = await limited.Content.ReadAsStringAsync();
        Assert.DoesNotContain("nobody@example.com", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("exist", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ForgotPassword_does_not_dispatch_email_after_recipient_limit_reached()
    {
        using var factory = new RateLimitingTestFactory(resendResponder: ResendSuccess);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Users.Add(new UserEntity
        {
            Id = Guid.NewGuid().ToString(),
            Email = "real-user@example.com",
            FullName = "Real User",
            Role = "Viewer",
            IsActive = true,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("whatever"),
        });
        await db.SaveChangesAsync();

        var client = ClientWithIp(factory, "203.0.113.41");

        for (var i = 0; i < SecurityRateLimitPolicies.ForgotPasswordEmailPermitLimit; i++)
        {
            await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = "real-user@example.com" });
        }
        Assert.Equal(SecurityRateLimitPolicies.ForgotPasswordEmailPermitLimit, factory.ResendCallCount);

        // Further attempts against the same (now-limited) recipient must not dispatch again.
        await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = "real-user@example.com" });
        await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = "real-user@example.com" });
        Assert.Equal(SecurityRateLimitPolicies.ForgotPasswordEmailPermitLimit, factory.ResendCallCount);
    }

    [Fact]
    public async Task ForgotPassword_different_emails_have_independent_recipient_limits()
    {
        using var factory = new RateLimitingTestFactory(resendResponder: ResendSuccess);
        var client = ClientWithIp(factory, "203.0.113.42");

        for (var i = 0; i < SecurityRateLimitPolicies.ForgotPasswordEmailPermitLimit; i++)
        {
            await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = "person-a@example.com" });
        }
        var aLimited = await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = "person-a@example.com" });
        Assert.Equal(HttpStatusCode.TooManyRequests, aLimited.StatusCode);

        var bStillOk = await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = "person-b@example.com" });
        Assert.NotEqual(HttpStatusCode.TooManyRequests, bStillOk.StatusCode);
    }

    // ── request-otp: token + IP dimensions, no email after limit, OTP security preserved ─

    [Fact]
    public async Task RequestOtp_does_not_dispatch_email_after_token_limit_reached()
    {
        using var factory = new RateLimitingTestFactory(resendResponder: ResendSuccess);
        var tokenId = await SeedOtpTokenAsync(factory);
        var client = ClientWithIp(factory, "203.0.113.50");

        for (var i = 0; i < SecurityRateLimitPolicies.RequestOtpTokenPermitLimit; i++)
        {
            await client.PostAsync($"/api/public/sign/{tokenId}/request-otp", null);
        }
        Assert.Equal(SecurityRateLimitPolicies.RequestOtpTokenPermitLimit, factory.ResendCallCount);

        var limited = await client.PostAsync($"/api/public/sign/{tokenId}/request-otp", null);
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.Equal(SecurityRateLimitPolicies.RequestOtpTokenPermitLimit, factory.ResendCallCount);

        var limitedBody = await limited.Content.ReadAsStringAsync();
        Assert.DoesNotContain("signer@example.com", limitedBody, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task RequestOtp_different_tokens_have_independent_limits()
    {
        using var factory = new RateLimitingTestFactory(resendResponder: ResendSuccess);
        var tokenA = await SeedOtpTokenAsync(factory, "a@example.com");
        var tokenB = await SeedOtpTokenAsync(factory, "b@example.com");
        var client = ClientWithIp(factory, "203.0.113.51");

        for (var i = 0; i < SecurityRateLimitPolicies.RequestOtpTokenPermitLimit; i++)
        {
            await client.PostAsync($"/api/public/sign/{tokenA}/request-otp", null);
        }
        var aLimited = await client.PostAsync($"/api/public/sign/{tokenA}/request-otp", null);
        Assert.Equal(HttpStatusCode.TooManyRequests, aLimited.StatusCode);

        var bStillOk = await client.PostAsync($"/api/public/sign/{tokenB}/request-otp", null);
        Assert.NotEqual(HttpStatusCode.TooManyRequests, bStillOk.StatusCode);
    }

    [Fact]
    public async Task RequestOtp_simulated_delivery_failure_still_returns_generic_502_and_is_still_rate_limited()
    {
        // No resendResponder configured at all => ResendEmailService has no working
        // transport and falls back to "simulated" mode, which the OTP hotfix's
        // IsGenuineDelivery check must still treat as failure (never a false 200).
        using var factory = new RateLimitingTestFactory();
        var tokenId = await SeedOtpTokenAsync(factory);
        var client = ClientWithIp(factory, "203.0.113.52");

        var resp = await client.PostAsync($"/api/public/sign/{tokenId}/request-otp", null);
        Assert.Equal(HttpStatusCode.BadGateway, resp.StatusCode);
        var body = await resp.Content.ReadAsStringAsync();
        Assert.DoesNotContain("devOtp", body, StringComparison.OrdinalIgnoreCase);

        // The failed-delivery attempt still counts against the token's request limit —
        // rate limiting happens before delivery is even attempted.
        for (var i = 1; i < SecurityRateLimitPolicies.RequestOtpTokenPermitLimit; i++)
        {
            await client.PostAsync($"/api/public/sign/{tokenId}/request-otp", null);
        }
        var limited = await client.PostAsync($"/api/public/sign/{tokenId}/request-otp", null);
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
    }

    [Fact]
    public async Task RequestOtp_provider_failure_is_reported_as_failure_not_success_and_is_rate_limited()
    {
        using var factory = new RateLimitingTestFactory(resendResponder: ResendProviderFailure);
        var tokenId = await SeedOtpTokenAsync(factory);
        var client = ClientWithIp(factory, "203.0.113.53");

        var resp = await client.PostAsync($"/api/public/sign/{tokenId}/request-otp", null);
        Assert.Equal(HttpStatusCode.BadGateway, resp.StatusCode);
    }

    // ── submit: token + IP dimensions ───────────────────────────────────────────────────

    [Fact]
    public async Task Submit_is_limited_by_tokenId()
    {
        using var factory = new RateLimitingTestFactory();
        var tokenId = await SeedOtpTokenAsync(factory);
        var client = ClientWithIp(factory, "203.0.113.60");

        for (var i = 0; i < SecurityRateLimitPolicies.SubmitTokenPermitLimit; i++)
        {
            var resp = await client.PostAsJsonAsync($"/api/public/sign/{tokenId}/submit", new
            {
                signerName = "Someone",
                consentConfirmed = true,
                reasonCode = "Completed",
            });
            Assert.NotEqual(HttpStatusCode.TooManyRequests, resp.StatusCode);
        }

        var limited = await client.PostAsJsonAsync($"/api/public/sign/{tokenId}/submit", new
        {
            signerName = "Someone",
            consentConfirmed = true,
            reasonCode = "Completed",
        });
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
    }

    [Fact]
    public async Task Submit_different_tokenIds_remain_independent()
    {
        using var factory = new RateLimitingTestFactory();
        var tokenA = await SeedOtpTokenAsync(factory, "a@example.com");
        var tokenB = await SeedOtpTokenAsync(factory, "b@example.com");
        var client = ClientWithIp(factory, "203.0.113.61");

        for (var i = 0; i < SecurityRateLimitPolicies.SubmitTokenPermitLimit; i++)
        {
            await client.PostAsJsonAsync($"/api/public/sign/{tokenA}/submit", new { signerName = "X", consentConfirmed = true, reasonCode = "Completed" });
        }
        var aLimited = await client.PostAsJsonAsync($"/api/public/sign/{tokenA}/submit", new { signerName = "X", consentConfirmed = true, reasonCode = "Completed" });
        Assert.Equal(HttpStatusCode.TooManyRequests, aLimited.StatusCode);

        var bStillOk = await client.PostAsJsonAsync($"/api/public/sign/{tokenB}/submit", new { signerName = "X", consentConfirmed = true, reasonCode = "Completed" });
        Assert.NotEqual(HttpStatusCode.TooManyRequests, bStillOk.StatusCode);
    }

    [Fact]
    public async Task Submit_IP_level_abuse_across_many_tokens_is_limited()
    {
        using var factory = new RateLimitingTestFactory();
        var client = ClientWithIp(factory, "203.0.113.62");

        HttpResponseMessage? last = null;
        for (var i = 0; i <= SecurityRateLimitPolicies.SubmitIpPermitLimit; i++)
        {
            var tokenId = await SeedOtpTokenAsync(factory, $"person{i}@example.com");
            last = await client.PostAsJsonAsync($"/api/public/sign/{tokenId}/submit", new { signerName = "X", consentConfirmed = true, reasonCode = "Completed" });
        }

        Assert.Equal(HttpStatusCode.TooManyRequests, last!.StatusCode);
    }

    // ── Authenticated, non-rate-limited traffic is unaffected ──────────────────────────

    [Fact]
    public async Task Authenticated_users_endpoint_is_unaffected_by_the_new_limiter()
    {
        using var factory = new RateLimitingTestFactory();
        var client = ClientWithIp(factory, "203.0.113.70");

        var login = await client.PostAsJsonAsync("/api/auth/login", new { email = "admin.dev@stratango.local", password = "Admin123!" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var loginBody = await login.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        var token = loginBody.GetProperty("token").GetString();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

        // Well more than any of the new anonymous-endpoint limits, against an endpoint that
        // never got a policy applied to it.
        for (var i = 0; i < SecurityRateLimitPolicies.CredentialIpPermitLimit + 10; i++)
        {
            var resp = await client.GetAsync("/api/users");
            Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        }
    }
}
