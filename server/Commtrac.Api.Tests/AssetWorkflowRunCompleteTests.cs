using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// Characterises workflow run completion — especially the blocking-issue gate that
/// returns HTTP 422. Pins server behaviour before AssetWorkflowRunsController is
/// split in S6.
/// </summary>
[Collection(ApiTestCollection.Name)]
public class AssetWorkflowRunCompleteTests : IClassFixture<ApiTestFactory>
{
    private readonly ApiTestFactory _factory;

    public AssetWorkflowRunCompleteTests(ApiTestFactory factory) => _factory = factory;

    [Fact]
    public async Task CompleteRun_with_unresolved_blocking_issue_returns_422()
    {
        var (client, runId) = await CreateAuthenticatedClientWithRunAsync();
        var issuesJson = JsonSerializer.Serialize(new[]
        {
            new { id = "issue-1", isBlocking = true, resolved = false, title = "Motor overheating" },
        });

        var resp = await client.PostAsJsonAsync($"/api/asset-workflow-runs/{runId}/complete", new
        {
            stepResultsJson = "[]",
            issuesJson,
            completedByName = "Test Tech",
        });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, resp.StatusCode);
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.TryGetProperty("blockingCount", out var count));
        Assert.Equal(1, count.GetInt32());
        Assert.Contains("blocking issue", doc.RootElement.GetProperty("message").GetString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task CompleteRun_with_non_blocking_issue_succeeds()
    {
        var (client, runId) = await CreateAuthenticatedClientWithRunAsync();
        var issuesJson = JsonSerializer.Serialize(new[]
        {
            new { id = "issue-1", isBlocking = false, resolved = false, title = "Observation only" },
        });

        var resp = await client.PostAsJsonAsync($"/api/asset-workflow-runs/{runId}/complete", new
        {
            stepResultsJson = "[{\"stepId\":\"s1\",\"values\":{}}]",
            issuesJson,
            completedByName = "Test Tech",
        });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        Assert.Equal("Complete", doc.RootElement.GetProperty("status").GetString());
        Assert.True(doc.RootElement.GetProperty("isLocked").GetBoolean());
    }

    [Fact]
    public async Task CompleteRun_with_resolved_blocking_issue_succeeds()
    {
        var (client, runId) = await CreateAuthenticatedClientWithRunAsync();
        var issuesJson = JsonSerializer.Serialize(new[]
        {
            new { id = "issue-1", isBlocking = true, resolved = true, title = "Fixed on site" },
        });

        var resp = await client.PostAsJsonAsync($"/api/asset-workflow-runs/{runId}/complete", new
        {
            stepResultsJson = "[{\"stepId\":\"s1\",\"values\":{}}]",
            issuesJson,
            completedByName = "Test Tech",
        });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }

    private async Task<(HttpClient client, string runId)> CreateAuthenticatedClientWithRunAsync()
    {
        var client = _factory.CreateClient();
        var token = await LoginAsync(client);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var runId = await SeedRunAsync();
        return (client, runId);
    }

    private static async Task<string> LoginAsync(HttpClient client)
    {
        var resp = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "admin.dev@stratango.local",
            password = "Admin123!",
        });
        resp.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("token").GetString()!;
    }

    private async Task<string> SeedRunAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var projectId = Guid.NewGuid().ToString("N");
        var assetId = Guid.NewGuid().ToString("N");
        var configId = Guid.NewGuid().ToString("N");
        var runId = Guid.NewGuid().ToString("N");
        var productId = Guid.NewGuid().ToString("N");
        var now = DateTime.UtcNow;

        db.Projects.Add(new ProjectEntity
        {
            Id = projectId,
            CustomerName = "S3 Test Customer",
            CustomerId = "cust-s3",
            JobNumber = "JOB-S3",
            Description = "Workflow complete test fixture",
            StartDate = "2026-01-01",
            FinishDate = "2026-12-31",
            Office = "Test Office",
            Status = "Active",
            WorkflowMode = "INSTALLATION_ONLY",
            IsInstallationProject = true,
        });

        db.WorkflowConfigs.Add(new WorkflowConfigEntity
        {
            Id = configId,
            ProductId = productId,
            Name = "S3 Test Config",
            Status = "Published",
            Version = 1,
            StepsJson = "[]",
            MediaJson = "[]",
            FeatureSelectionsJson = "[]",
            CreatedAt = now,
            UpdatedAt = now,
        });

        db.ProjectAssets.Add(new ProjectAssetEntity
        {
            Id = assetId,
            ProjectId = projectId,
            ProductId = productId,
            AssetTag = "S3-001",
            Status = "InProgress",
        });

        db.AssetWorkflowRuns.Add(new AssetWorkflowRunEntity
        {
            Id = runId,
            AssetId = assetId,
            WorkflowConfigId = configId,
            WorkflowVersion = 1,
            WorkflowSnapshotJson = "{}",
            Status = "InProgress",
            IsLocked = false,
            StepResultsJson = "[]",
            IssuesJson = "[]",
            TimeTrackingJson = "[]",
            RunNumber = 1,
            StartedAt = now,
            CreatedAt = now,
            UpdatedAt = now,
        });

        await db.SaveChangesAsync();
        return runId;
    }
}
