using System;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// The public e-sign summary carries the run's workflow type so the customer-facing PDF title and
/// filename name the real type (the unauthenticated page can't read the workflow-types catalog).
/// </summary>
public class PublicSignSummaryWorkflowTypeTests
{
    private static HttpResponseMessage ResendSuccess(HttpRequestMessage req) =>
        new(HttpStatusCode.OK) { Content = new StringContent("""{"id":"fake-resend-id"}""") };

    private static async Task<string> SeedRunAsync(
        WebApplicationFactory<Program> factory, string? workflowTypeId, string? configType, (string id, string name)? customType = null)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var now = DateTime.UtcNow;
        string N() => Guid.NewGuid().ToString("N");
        var (projectId, assetId, configId, runId, productId, tokenId) = (N(), N(), N(), N(), N(), N());

        if (customType is { } ct)
        {
            db.WorkflowTypes.Add(new WorkflowTypeEntity { Id = ct.id, Name = ct.name, SortOrder = 99, IsActive = true });
        }
        db.Projects.Add(new ProjectEntity
        {
            Id = projectId, CustomerName = "Type Test Customer", CustomerId = "cust-type", JobNumber = "J000376",
            Description = "type fixture", StartDate = "2026-01-01", FinishDate = "2026-12-31", Office = "Test Office",
            Status = "Active", WorkflowMode = "INSTALLATION_ONLY", IsInstallationProject = true,
        });
        db.WorkflowConfigs.Add(new WorkflowConfigEntity
        {
            Id = configId, ProductId = productId, Name = "HA-Coal SAT", Status = "Published", Version = 1,
            StepsJson = "[]", MediaJson = "[]", FeatureSelectionsJson = "[]", CreatedAt = now, UpdatedAt = now,
            WorkflowTypeId = workflowTypeId, ConfigType = configType,
        });
        db.ProjectAssets.Add(new ProjectAssetEntity { Id = assetId, ProjectId = projectId, ProductId = productId, AssetTag = "CM-102", Status = "Closed" });
        db.AssetWorkflowRuns.Add(new AssetWorkflowRunEntity
        {
            Id = runId, AssetId = assetId, WorkflowConfigId = configId, WorkflowVersion = 1, WorkflowSnapshotJson = "{}",
            Status = "Completed", IsLocked = true, SignatureStatus = "PendingCustomer", StepResultsJson = "[]",
            IssuesJson = "[]", TimeTrackingJson = "[]", RunNumber = 1, StartedAt = now, CompletedAt = now,
            CreatedAt = now, UpdatedAt = now,
        });
        db.SignatureTokens.Add(new SignatureTokenEntity
        {
            Id = tokenId, RunId = runId, SignerRole = "Customer", RecipientEmail = "signer@example.com",
            RecipientName = "Test Signer", CreatedByUserId = "test-admin", ExpiresAtUtc = now.AddDays(1),
        });
        await db.SaveChangesAsync();
        return tokenId;
    }

    private static async Task<JsonElement> GetSummaryAsync(WebApplicationFactory<Program> factory, string tokenId)
    {
        var resp = await factory.CreateClient().GetAsync($"/api/public/sign/{tokenId}");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        return JsonDocument.Parse(await resp.Content.ReadAsStringAsync()).RootElement.Clone();
    }

    private static string? Str(JsonElement root, string name) =>
        root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    [Fact]
    public async Task Seeded_catalog_type_is_returned_with_its_name()
    {
        using var factory = new PublicSignOtpTestFactory(resendResponder: ResendSuccess);
        var token = await SeedRunAsync(factory, "wftype-commissioning", null);
        var summary = await GetSummaryAsync(factory, token);
        Assert.Equal("wftype-commissioning", Str(summary, "workflowTypeId"));
        Assert.Equal("Commissioning", Str(summary, "workflowTypeName"));
    }

    [Fact]
    public async Task Custom_catalog_type_name_is_returned()
    {
        using var factory = new PublicSignOtpTestFactory(resendResponder: ResendSuccess);
        var customId = "custom-" + Guid.NewGuid().ToString("N")[..8];
        var token = await SeedRunAsync(factory, customId, null, (customId, "Site Acceptance Test"));
        var summary = await GetSummaryAsync(factory, token);
        Assert.Equal("Site Acceptance Test", Str(summary, "workflowTypeName"));
    }

    [Fact]
    public async Task Legacy_config_without_type_id_returns_its_config_type_text()
    {
        using var factory = new PublicSignOtpTestFactory(resendResponder: ResendSuccess);
        var token = await SeedRunAsync(factory, null, "Install");
        var summary = await GetSummaryAsync(factory, token);
        Assert.Null(Str(summary, "workflowTypeId"));
        Assert.Null(Str(summary, "workflowTypeName"));
        Assert.Equal("Install", Str(summary, "workflowConfigType"));
    }
}
