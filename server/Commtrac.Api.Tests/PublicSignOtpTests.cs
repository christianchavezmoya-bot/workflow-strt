using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// Guards the fix for POST /api/public/sign/{tokenId}/request-otp unconditionally
/// returning the plaintext OTP and RecipientEmail in its HTTP response — defeating the
/// OTP's purpose as an out-of-band second factor. Outside Development the OTP must be
/// dispatched through the real email transport and never appear in the response; a
/// failed or merely-simulated send must not be reported as success.
/// </summary>
public class PublicSignOtpTests
{
    private static async Task<string> SeedTokenAsync(
        WebApplicationFactory<Program> factory,
        string recipientEmail = "signer@example.com",
        bool revoked = false,
        DateTime? expiresAtUtc = null,
        DateTime? usedAtUtc = null,
        string signerRole = "Customer")
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var id = Guid.NewGuid().ToString("N");
        db.SignatureTokens.Add(new SignatureTokenEntity
        {
            Id = id,
            RunId = "run-does-not-need-to-exist-for-request-otp",
            SignerRole = signerRole,
            RecipientEmail = recipientEmail,
            RecipientName = "Test Signer",
            CreatedByUserId = "test-admin",
            ExpiresAtUtc = expiresAtUtc ?? DateTime.UtcNow.AddDays(1),
            UsedAtUtc = usedAtUtc,
            IsRevoked = revoked,
        });
        await db.SaveChangesAsync();
        return id;
    }

    /// <summary>Full run + asset + token so /submit can be exercised end-to-end.</summary>
    private static async Task<(string tokenId, string runId, string assetId)> SeedSignableRunAsync(
        WebApplicationFactory<Program> factory, string recipientEmail = "signer@example.com")
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var now = DateTime.UtcNow;
        var projectId = Guid.NewGuid().ToString("N");
        var assetId = Guid.NewGuid().ToString("N");
        var configId = Guid.NewGuid().ToString("N");
        var runId = Guid.NewGuid().ToString("N");
        var productId = Guid.NewGuid().ToString("N");
        var tokenId = Guid.NewGuid().ToString("N");

        db.Projects.Add(new ProjectEntity
        {
            Id = projectId, CustomerName = "OTP Test Customer", CustomerId = "cust-otp",
            JobNumber = "JOB-OTP", Description = "OTP fixture", StartDate = "2026-01-01",
            FinishDate = "2026-12-31", Office = "Test Office", Status = "Active",
            WorkflowMode = "INSTALLATION_ONLY", IsInstallationProject = true,
        });
        db.WorkflowConfigs.Add(new WorkflowConfigEntity
        {
            Id = configId, ProductId = productId, Name = "OTP Test Config", Status = "Published",
            Version = 1, StepsJson = "[]", MediaJson = "[]", FeatureSelectionsJson = "[]",
            CreatedAt = now, UpdatedAt = now,
        });
        db.ProjectAssets.Add(new ProjectAssetEntity
        {
            Id = assetId, ProjectId = projectId, ProductId = productId, AssetTag = "OTP-001", Status = "InProgress",
        });
        db.AssetWorkflowRuns.Add(new AssetWorkflowRunEntity
        {
            Id = runId, AssetId = assetId, WorkflowConfigId = configId, WorkflowVersion = 1,
            WorkflowSnapshotJson = "{}", Status = "Completed", IsLocked = true,
            SignatureStatus = "PendingCustomer", StepResultsJson = "[]", IssuesJson = "[]",
            TimeTrackingJson = "[]", RunNumber = 1, StartedAt = now, CompletedAt = now,
            CreatedAt = now, UpdatedAt = now,
        });
        db.SignatureTokens.Add(new SignatureTokenEntity
        {
            Id = tokenId, RunId = runId, SignerRole = "Customer", RecipientEmail = recipientEmail,
            RecipientName = "Test Signer", CreatedByUserId = "test-admin",
            ExpiresAtUtc = now.AddDays(1),
        });
        await db.SaveChangesAsync();
        return (tokenId, runId, assetId);
    }

    private static async Task<SignatureTokenEntity?> GetTokenAsync(WebApplicationFactory<Program> factory, string tokenId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.SignatureTokens.AsNoTracking().FirstOrDefaultAsync(t => t.Id == tokenId);
    }

    private static HttpResponseMessage ResendSuccess(HttpRequestMessage req) =>
        new(HttpStatusCode.OK) { Content = new StringContent("""{"id":"fake-resend-id"}""") };

    private static HttpResponseMessage ResendProviderFailure(HttpRequestMessage req) =>
        new(HttpStatusCode.BadRequest)
        {
            Content = new StringContent("""{"statusCode":400,"name":"invalid_request","message":"simulated provider rejection"}"""),
        };

    // ── Disclosure: response contract ────────────────────────────────────────────

    [Fact]
    public async Task NonDevelopment_response_never_contains_plaintext_otp_or_devOtp_field()
    {
        using var factory = new PublicSignOtpTestFactory(resendResponder: ResendSuccess);
        var client = factory.CreateClient();
        var tokenId = await SeedTokenAsync(factory);

        var resp = await client.PostAsync($"/api/public/sign/{tokenId}/request-otp", null);
        var text = await resp.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        using var doc = JsonDocument.Parse(text);
        var props = doc.RootElement.EnumerateObject().Select(p => p.Name).ToArray();
        Assert.Equal(new[] { "message" }, props); // exactly one field, nothing else
        Assert.Equal("OTP sent", doc.RootElement.GetProperty("message").GetString());
        Assert.DoesNotContain("devOtp", text, StringComparison.OrdinalIgnoreCase);
        Assert.False(Regex.IsMatch(text, @"\b\d{6}\b"), $"response should contain no 6-digit code: {text}");
    }

    [Fact]
    public async Task NonDevelopment_response_never_contains_recipient_email()
    {
        using var factory = new PublicSignOtpTestFactory(resendResponder: ResendSuccess);
        var client = factory.CreateClient();
        const string recipient = "should-never-appear@example.com";
        var tokenId = await SeedTokenAsync(factory, recipientEmail: recipient);

        var resp = await client.PostAsync($"/api/public/sign/{tokenId}/request-otp", null);
        var text = await resp.Content.ReadAsStringAsync();

        Assert.DoesNotContain(recipient, text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("@", text); // no email-shaped content of any kind
    }

    // ── Real dispatch ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task NonDevelopment_dispatches_otp_to_the_token_recipient_via_email_abstraction()
    {
        HttpRequestMessage? captured = null;
        string? capturedBody = null;
        HttpResponseMessage Capture(HttpRequestMessage req)
        {
            captured = req;
            capturedBody = req.Content!.ReadAsStringAsync().GetAwaiter().GetResult();
            return ResendSuccess(req);
        }

        using var factory = new PublicSignOtpTestFactory(resendResponder: Capture);
        var client = factory.CreateClient();
        const string recipient = "capture-target@example.com";
        var tokenId = await SeedTokenAsync(factory, recipientEmail: recipient);

        var resp = await client.PostAsync($"/api/public/sign/{tokenId}/request-otp", null);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        Assert.NotNull(captured);
        Assert.Equal("https://api.resend.com/emails", captured!.RequestUri!.ToString());
        using var payload = JsonDocument.Parse(capturedBody!);
        var to = payload.RootElement.GetProperty("to").EnumerateArray().Select(e => e.GetString()).ToArray();
        Assert.Equal(new[] { recipient }, to);
        var otpInBody = Regex.Match(payload.RootElement.GetProperty("text").GetString()!, @"\b(\d{6})\b");
        Assert.True(otpInBody.Success, "email body should contain the 6-digit code");
    }

    [Fact]
    public async Task Stored_otp_is_a_sha256_hash_not_the_plaintext_code()
    {
        using var factory = new PublicSignOtpTestFactory(resendResponder: ResendSuccess);
        var client = factory.CreateClient();
        var tokenId = await SeedTokenAsync(factory);

        await client.PostAsync($"/api/public/sign/{tokenId}/request-otp", null);

        var token = await GetTokenAsync(factory, tokenId);
        Assert.NotNull(token!.OtpHash);
        Assert.Matches("^[0-9A-F]{64}$", token.OtpHash!); // SHA-256 hex, not a 6-digit code
        Assert.NotNull(token.OtpExpiresAtUtc);
    }

    // ── Correct / incorrect OTP through the real submit flow ───────────────────────

    [Fact]
    public async Task Correct_otp_allows_signature_submission()
    {
        string? sentCode = null;
        HttpResponseMessage CaptureCode(HttpRequestMessage req)
        {
            var body = req.Content!.ReadAsStringAsync().GetAwaiter().GetResult();
            using var payload = JsonDocument.Parse(body);
            sentCode = Regex.Match(payload.RootElement.GetProperty("text").GetString()!, @"\b(\d{6})\b").Groups[1].Value;
            return ResendSuccess(req);
        }

        using var factory = new PublicSignOtpTestFactory(resendResponder: CaptureCode);
        var client = factory.CreateClient();
        var (tokenId, _, _) = await SeedSignableRunAsync(factory);

        var otpResp = await client.PostAsync($"/api/public/sign/{tokenId}/request-otp", null);
        Assert.Equal(HttpStatusCode.OK, otpResp.StatusCode);
        Assert.False(string.IsNullOrWhiteSpace(sentCode));

        var submitResp = await client.PostAsJsonAsync($"/api/public/sign/{tokenId}/submit", new
        {
            signerName = "Jane Signer",
            consentConfirmed = true,
            reasonCode = "Approved",
            otpCode = sentCode,
        });

        Assert.Equal(HttpStatusCode.OK, submitResp.StatusCode);
    }

    [Fact]
    public async Task Incorrect_otp_is_rejected()
    {
        using var factory = new PublicSignOtpTestFactory(resendResponder: ResendSuccess);
        var client = factory.CreateClient();
        var (tokenId, _, _) = await SeedSignableRunAsync(factory);

        await client.PostAsync($"/api/public/sign/{tokenId}/request-otp", null);

        var submitResp = await client.PostAsJsonAsync($"/api/public/sign/{tokenId}/submit", new
        {
            signerName = "Jane Signer",
            consentConfirmed = true,
            reasonCode = "Approved",
            otpCode = "000000",
        });

        Assert.Equal(HttpStatusCode.BadRequest, submitResp.StatusCode);
        var text = await submitResp.Content.ReadAsStringAsync();
        Assert.Contains("Incorrect OTP", text);
    }

    // ── Development: explicitly gated, cannot leak elsewhere ───────────────────────

    [Fact]
    public async Task Development_echoes_otp_in_a_structured_field_without_a_real_send()
    {
        // No responder: Development must never attempt the email transport at all.
        using var factory = new PublicSignOtpTestFactory(environmentName: "Development", resendResponder: null);
        var client = factory.CreateClient();
        var tokenId = await SeedTokenAsync(factory);

        var resp = await client.PostAsync($"/api/public/sign/{tokenId}/request-otp", null);
        var text = await resp.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        using var doc = JsonDocument.Parse(text);
        Assert.Equal("OTP sent", doc.RootElement.GetProperty("message").GetString());
        var devOtp = doc.RootElement.GetProperty("devOtp").GetString();
        Assert.Matches("^[0-9]{6}$", devOtp!);
        // Structured field only — the old human-readable "OTP sent to X. (dev: Y)" message is gone.
        Assert.DoesNotContain("dev:", text, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Development_devOtp_field_is_absent_in_staging()
    {
        using var factory = new PublicSignOtpTestFactory(environmentName: "Staging", resendResponder: ResendSuccess);
        var client = factory.CreateClient();
        var tokenId = await SeedTokenAsync(factory);

        var resp = await client.PostAsync($"/api/public/sign/{tokenId}/request-otp", null);
        var text = await resp.Content.ReadAsStringAsync();

        using var doc = JsonDocument.Parse(text);
        var hasDevOtp = false;
        foreach (var p in doc.RootElement.EnumerateObject())
        {
            if (p.Name == "devOtp") hasDevOtp = true;
        }
        Assert.False(hasDevOtp, "devOtp must never be present outside Development");
    }

    // ── Delivery failure must not be reported as success ────────────────────────────

    [Fact]
    public async Task Provider_rejection_returns_failure_not_success_and_does_not_persist_otp()
    {
        using var factory = new PublicSignOtpTestFactory(resendResponder: ResendProviderFailure);
        var client = factory.CreateClient();
        var tokenId = await SeedTokenAsync(factory);

        var resp = await client.PostAsync($"/api/public/sign/{tokenId}/request-otp", null);
        var text = await resp.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadGateway, resp.StatusCode);
        Assert.DoesNotContain("OTP sent", text);

        var token = await GetTokenAsync(factory, tokenId);
        Assert.Null(token!.OtpHash); // never persisted — nothing to guess against
    }

    [Fact]
    public async Task Failed_send_does_not_clobber_a_previously_issued_valid_otp()
    {
        // First call succeeds and stores a real hash; second call's provider fails.
        var callCount = 0;
        HttpResponseMessage FirstOkThenFail(HttpRequestMessage req)
        {
            callCount++;
            return callCount == 1 ? ResendSuccess(req) : ResendProviderFailure(req);
        }

        using var factory = new PublicSignOtpTestFactory(resendResponder: FirstOkThenFail);
        var client = factory.CreateClient();
        var tokenId = await SeedTokenAsync(factory);

        await client.PostAsync($"/api/public/sign/{tokenId}/request-otp", null);
        var afterFirst = await GetTokenAsync(factory, tokenId);
        var hashAfterFirst = afterFirst!.OtpHash;
        Assert.NotNull(hashAfterFirst);

        var secondResp = await client.PostAsync($"/api/public/sign/{tokenId}/request-otp", null);
        Assert.Equal(HttpStatusCode.BadGateway, secondResp.StatusCode);

        var afterSecond = await GetTokenAsync(factory, tokenId);
        Assert.Equal(hashAfterFirst, afterSecond!.OtpHash); // untouched by the failed attempt
    }

    [Fact]
    public async Task Simulated_mode_no_transport_configured_is_not_reported_as_success()
    {
        // No Resend key configured at all, and Staging has no SMTP configured either —
        // this reproduces the exact "simulated" fallback path.
        using var factory = new PublicSignOtpTestFactory(resendResponder: null, configureResendKey: false);
        var client = factory.CreateClient();
        var tokenId = await SeedTokenAsync(factory);

        var resp = await client.PostAsync($"/api/public/sign/{tokenId}/request-otp", null);
        var text = await resp.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.BadGateway, resp.StatusCode);
        Assert.DoesNotContain("OTP sent", text);

        var token = await GetTokenAsync(factory, tokenId);
        Assert.Null(token!.OtpHash);
    }

    // ── Existing token-state guards are unaffected ──────────────────────────────────

    [Theory]
    [InlineData("revoked")]
    [InlineData("expired")]
    [InlineData("used")]
    public async Task Invalid_token_states_are_rejected_exactly_as_before(string state)
    {
        using var factory = new PublicSignOtpTestFactory(resendResponder: ResendSuccess);
        var client = factory.CreateClient();
        var tokenId = state switch
        {
            "revoked" => await SeedTokenAsync(factory, revoked: true),
            "expired" => await SeedTokenAsync(factory, expiresAtUtc: DateTime.UtcNow.AddMinutes(-1)),
            "used" => await SeedTokenAsync(factory, usedAtUtc: DateTime.UtcNow.AddMinutes(-1)),
            _ => throw new ArgumentOutOfRangeException(nameof(state)),
        };

        var resp = await client.PostAsync($"/api/public/sign/{tokenId}/request-otp", null);

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        var token = await GetTokenAsync(factory, tokenId);
        Assert.Null(token!.OtpHash); // no OTP ever generated for an invalid token
    }

    // ── No secret in logs ────────────────────────────────────────────────────────────

    [Fact]
    public async Task No_otp_code_appears_in_captured_logs_across_success_and_failure_paths()
    {
        // Note: ResendEmailService already logs "Email sent via Resend to {ToEmail}" as
        // normal operational telemetry (pre-existing, not introduced by this fix, and not
        // a secret — comparable to any audit trail). That is intentionally NOT asserted
        // against here; only the OTP code itself, which is the actual secret in scope.
        string? sentCode = null;
        var attempt = 0;
        HttpResponseMessage RespondAndCapture(HttpRequestMessage req)
        {
            attempt++;
            var body = req.Content!.ReadAsStringAsync().GetAwaiter().GetResult();
            using var payload = JsonDocument.Parse(body);
            sentCode = Regex.Match(payload.RootElement.GetProperty("text").GetString()!, @"\b(\d{6})\b").Groups[1].Value;
            return attempt == 1 ? ResendSuccess(req) : ResendProviderFailure(req);
        }

        using var factory = new PublicSignOtpTestFactory(resendResponder: RespondAndCapture);
        var client = factory.CreateClient();
        var tokenId = await SeedTokenAsync(factory, recipientEmail: "log-secrecy-check@example.com");

        await client.PostAsync($"/api/public/sign/{tokenId}/request-otp", null); // success
        await client.PostAsync($"/api/public/sign/{tokenId}/request-otp", null); // provider failure path

        Assert.False(string.IsNullOrWhiteSpace(sentCode));
        foreach (var line in factory.CapturedLogs)
        {
            Assert.DoesNotContain(sentCode!, line);
        }
    }
}
