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

    private static async Task<HttpClient> CreateAuthenticatedClientAsync(ApiTestFactory factory)
    {
        var client = factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "admin@commtrac.local",
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
