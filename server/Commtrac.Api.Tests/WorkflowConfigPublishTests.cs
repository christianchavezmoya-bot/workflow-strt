using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Commtrac.Api.Tests;

[Collection(ApiTestCollection.Name)]
public class WorkflowConfigPublishTests : IClassFixture<ApiTestFactory>
{
    private readonly ApiTestFactory _factory;

    public WorkflowConfigPublishTests(ApiTestFactory factory) => _factory = factory;

    [Fact]
    public async Task Publish_without_workflow_type_returns_400()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigWithoutTypeAsync();

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/publish", null);

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        var body = await resp.Content.ReadAsStringAsync();
        Assert.Contains("workflow type", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Publish_with_workflow_type_succeeds()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigWithTypeAsync("wftype-installation");

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/publish", null);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }

    // WF-1: WorkflowConfigFeature.quantity is the canonical quantity authority for generated
    // steps; FeatureSelection.activeCount (persisted on WorkflowConfig.FeatureSelectionsJson) is a
    // legacy compatibility mirror only and must never be read by Publish()'s step generation. This
    // seeds a deliberately mismatched activeCount to prove generation ignores it.
    [Fact]
    public async Task Publish_generated_step_quantity_uses_WorkflowConfigFeature_not_FeatureSelection_activeCount()
    {
        var client = await CreateAuthenticatedClientAsync();
        const int canonicalQuantity = 5;
        const string mismatchedActiveCount = "999";
        var (configId, featureId, depId) = await SeedDraftConfigWithFeatureAsync(
            isInventory: true, quantity: canonicalQuantity, mismatchedActiveCount: mismatchedActiveCount);

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/publish", null);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var body = await resp.Content.ReadAsStringAsync();
        // The response DTO legitimately echoes the raw (mismatched) FeatureSelectionsJson back
        // verbatim, so assert on the *generated step description* specifically, not the whole body.
        Assert.Contains($"Quantity: {canonicalQuantity}.", body);
        Assert.DoesNotContain($"Quantity: {mismatchedActiveCount}.", body);
    }

    private async Task<(string configId, string featureId, string depId)> SeedDraftConfigWithFeatureAsync(
        bool isInventory, int quantity, string mismatchedActiveCount)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var now = DateTime.UtcNow;

        var featureId = Guid.NewGuid().ToString("N");
        db.Features.Add(new FeatureEntity
        {
            Id = featureId,
            Name = "Test Camera",
            ValueType = "component",
            IsInventory = isInventory,
        });

        var depId = Guid.NewGuid().ToString("N");
        db.FeatureDependencies.Add(new FeatureDependencyEntity
        {
            Id = depId,
            FeatureId = featureId,
            Name = "Camera Unit",
            IsInventory = isInventory,
            CaptureFieldsJson = "[\"serialNo\"]",
        });

        var configId = Guid.NewGuid().ToString("N");
        db.WorkflowConfigs.Add(new WorkflowConfigEntity
        {
            Id = configId,
            ProductId = "prod-test",
            Name = "Feature Quantity Draft",
            Status = "Draft",
            WorkflowTypeId = "wftype-installation",
            Version = 1,
            StepsJson = "[]",
            MediaJson = "[]",
            // Deliberately mismatched vs. WorkflowConfigFeature.Quantity below — proves Publish()
            // does not read this legacy field as an authority.
            FeatureSelectionsJson = $"[{{\"featureId\":\"{featureId}\",\"included\":true,\"activeCount\":{mismatchedActiveCount}}}]",
            CreatedAt = now,
            UpdatedAt = now,
        });

        db.WorkflowConfigFeatures.Add(new WorkflowConfigFeatureEntity
        {
            Id = Guid.NewGuid().ToString("N"),
            WorkflowConfigId = configId,
            FeatureId = featureId,
            Quantity = quantity,
            InclusionsJson = $"{{\"{depId}\":true}}",
        });

        await db.SaveChangesAsync();
        return (configId, featureId, depId);
    }

    private static async Task<HttpClient> CreateAuthenticatedClientAsync(ApiTestFactory factory)
    {
        var client = factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "admin.dev@stratango.local",
            password = "Admin123!",
        });
        login.EnsureSuccessStatusCode();
        using var doc = System.Text.Json.JsonDocument.Parse(await login.Content.ReadAsStringAsync());
        var token = doc.RootElement.GetProperty("token").GetString()!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    private Task<HttpClient> CreateAuthenticatedClientAsync() => CreateAuthenticatedClientAsync(_factory);

    private async Task<string> SeedDraftConfigWithoutTypeAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var id = Guid.NewGuid().ToString("N");
        var now = DateTime.UtcNow;
        db.WorkflowConfigs.Add(new WorkflowConfigEntity
        {
            Id = id,
            ProductId = "prod-test",
            Name = "Untyped Draft",
            Status = "Draft",
            Version = 1,
            StepsJson = "[]",
            MediaJson = "[]",
            FeatureSelectionsJson = "[]",
            CreatedAt = now,
            UpdatedAt = now,
        });
        await db.SaveChangesAsync();
        return id;
    }

    private async Task<string> SeedDraftConfigWithTypeAsync(string workflowTypeId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var id = Guid.NewGuid().ToString("N");
        var now = DateTime.UtcNow;
        db.WorkflowConfigs.Add(new WorkflowConfigEntity
        {
            Id = id,
            ProductId = "prod-test",
            Name = "Typed Draft",
            Status = "Draft",
            WorkflowTypeId = workflowTypeId,
            Version = 1,
            StepsJson = "[]",
            MediaJson = "[]",
            FeatureSelectionsJson = "[]",
            CreatedAt = now,
            UpdatedAt = now,
        });
        await db.SaveChangesAsync();
        return id;
    }
}
