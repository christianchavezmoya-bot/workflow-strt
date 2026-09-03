using System;
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
/// Guards POST /api/public/sign/{tokenId}/verify-otp — a pre-check the frontend calls to
/// decide when to reveal the signing acknowledgement step, added to fix a UI sequencing bug
/// (DEV acceptance follow-up: the acknowledgement checkbox could be ticked, enabling Submit,
/// before OTP was ever verified). This endpoint must:
///  - accept exactly the same codes Submit would accept, and reject exactly what Submit would
///    reject (it reuses PublicSignController.TryValidateOtp, the same helper Submit calls),
///  - never persist anything or consume the token — it is a read-only pre-check, and Submit
///    remains the sole authoritative, state-changing OTP gate,
///  - never leak the token's OTP hash, expiry, or any other internal state in its response.
/// </summary>
public class PublicSignVerifyOtpTests
{
    /// <summary>Full run + asset + token so /submit can also be exercised after verify-otp.</summary>
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
            Id = projectId, CustomerName = "Verify-OTP Test Customer", CustomerId = "cust-verify-otp",
            JobNumber = "JOB-VERIFY-OTP", Description = "verify-otp fixture", StartDate = "2026-01-01",
            FinishDate = "2026-12-31", Office = "Test Office", Status = "Active",
            WorkflowMode = "INSTALLATION_ONLY", IsInstallationProject = true,
        });
        db.WorkflowConfigs.Add(new WorkflowConfigEntity
        {
            Id = configId, ProductId = productId, Name = "Verify-OTP Test Config", Status = "Published",
            Version = 1, StepsJson = "[]", MediaJson = "[]", FeatureSelectionsJson = "[]",
            CreatedAt = now, UpdatedAt = now,
        });
        db.ProjectAssets.Add(new ProjectAssetEntity
        {
            Id = assetId, ProjectId = projectId, ProductId = productId, AssetTag = "VOTP-001", Status = "InProgress",
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

    private static async Task<(PublicSignOtpTestFactory factory, HttpClient client, string tokenId, string code)>
        SeedWithIssuedOtpAsync()
    {
        string? sentCode = null;
        HttpResponseMessage CaptureCode(HttpRequestMessage req)
        {
            var body = req.Content!.ReadAsStringAsync().GetAwaiter().GetResult();
            using var payload = JsonDocument.Parse(body);
            sentCode = Regex.Match(payload.RootElement.GetProperty("text").GetString()!, @"\b(\d{6})\b").Groups[1].Value;
            return ResendSuccess(req);
        }

        var factory = new PublicSignOtpTestFactory(resendResponder: CaptureCode);
        var client = factory.CreateClient();
        var (tokenId, _, _) = await SeedSignableRunAsync(factory);

        var otpResp = await client.PostAsync($"/api/public/sign/{tokenId}/request-otp", null);
        Assert.Equal(HttpStatusCode.OK, otpResp.StatusCode);
        Assert.False(string.IsNullOrWhiteSpace(sentCode));

        return (factory, client, tokenId, sentCode!);
    }

    [Fact]
    public async Task Correct_otp_is_verified()
    {
        var (factory, client, tokenId, code) = await SeedWithIssuedOtpAsync();
        using var _ = factory;

        var resp = await client.PostAsJsonAsync($"/api/public/sign/{tokenId}/verify-otp", new { otpCode = code });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("verified").GetBoolean());
    }

    [Fact]
    public async Task Incorrect_otp_is_rejected_with_the_same_generic_message_as_submit()
    {
        var (factory, client, tokenId, _) = await SeedWithIssuedOtpAsync();
        using var _ = factory;

        var resp = await client.PostAsJsonAsync($"/api/public/sign/{tokenId}/verify-otp", new { otpCode = "000000" });

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        var text = await resp.Content.ReadAsStringAsync();
        Assert.Contains("Incorrect OTP", text);
    }

    [Fact]
    public async Task Missing_otp_code_is_rejected_when_an_otp_was_issued()
    {
        var (factory, client, tokenId, _) = await SeedWithIssuedOtpAsync();
        using var _ = factory;

        var resp = await client.PostAsJsonAsync($"/api/public/sign/{tokenId}/verify-otp", new { otpCode = (string?)null });

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        var text = await resp.Content.ReadAsStringAsync();
        Assert.Contains("required", text, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Verify_otp_does_not_consume_the_token_and_submit_can_still_succeed_afterward()
    {
        var (factory, client, tokenId, code) = await SeedWithIssuedOtpAsync();
        using var _ = factory;

        var verifyResp = await client.PostAsJsonAsync($"/api/public/sign/{tokenId}/verify-otp", new { otpCode = code });
        Assert.Equal(HttpStatusCode.OK, verifyResp.StatusCode);

        var afterVerify = await GetTokenAsync(factory, tokenId);
        Assert.Null(afterVerify!.UsedAtUtc); // pre-check must not consume the token

        var submitResp = await client.PostAsJsonAsync($"/api/public/sign/{tokenId}/submit", new
        {
            signerName = "Jane Signer",
            consentConfirmed = true,
            reasonCode = "Approved",
            otpCode = code,
        });

        Assert.Equal(HttpStatusCode.OK, submitResp.StatusCode);
        var afterSubmit = await GetTokenAsync(factory, tokenId);
        Assert.NotNull(afterSubmit!.UsedAtUtc); // only Submit consumes it
    }

    [Fact]
    public async Task Submitting_without_ever_calling_verify_otp_is_still_rejected_by_submit()
    {
        // verify-otp is a pre-check only — skipping it entirely must not weaken Submit's own
        // independent enforcement in any way.
        var (factory, client, tokenId, _) = await SeedWithIssuedOtpAsync();
        using var _ = factory;

        var submitResp = await client.PostAsJsonAsync($"/api/public/sign/{tokenId}/submit", new
        {
            signerName = "Jane Signer",
            consentConfirmed = true,
            reasonCode = "Approved",
            otpCode = "000000",
        });

        Assert.Equal(HttpStatusCode.BadRequest, submitResp.StatusCode);
    }

    [Fact]
    public async Task No_otp_ever_requested_means_verify_otp_succeeds_without_a_code_matching_the_optional_otp_path()
    {
        // Mirrors Submit's own behavior: if the customer never clicked "Request OTP" for this
        // token (OtpHash is null), OTP is not required at all — this pre-check must agree.
        using var factory = new PublicSignOtpTestFactory(resendResponder: ResendSuccess);
        var client = factory.CreateClient();
        var (tokenId, _, _) = await SeedSignableRunAsync(factory);

        var resp = await client.PostAsJsonAsync($"/api/public/sign/{tokenId}/verify-otp", new { otpCode = (string?)null });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("verified").GetBoolean());
    }

    [Fact]
    public async Task Invalid_token_returns_generic_error_and_no_verified_field()
    {
        using var factory = new PublicSignOtpTestFactory(resendResponder: ResendSuccess);
        var client = factory.CreateClient();

        var resp = await client.PostAsJsonAsync("/api/public/sign/does-not-exist/verify-otp", new { otpCode = "123456" });

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        var text = await resp.Content.ReadAsStringAsync();
        Assert.DoesNotContain("verified", text, StringComparison.OrdinalIgnoreCase);
    }
}
