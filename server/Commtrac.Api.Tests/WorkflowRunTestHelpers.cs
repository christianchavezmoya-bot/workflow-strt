using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.Extensions.DependencyInjection;

namespace Commtrac.Api.Tests;

/// <summary>
/// Shared fixtures for asset-workflow-run controller characterisation tests.
/// </summary>
internal static class WorkflowRunTestHelpers
{
    internal sealed record RunFixture(string RunId, string AssetId, string ProjectId);

    internal static async Task<string> LoginAsync(HttpClient client)
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

    internal static async Task<HttpClient> CreateAuthenticatedClientAsync(ApiTestFactory factory)
    {
        var client = factory.CreateClient();
        var token = await LoginAsync(client);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    internal static async Task<RunFixture> SeedRunAsync(
        ApiTestFactory factory,
        bool isLocked = false,
        string assetStatus = "InProgress",
        string runStatus = "InProgress",
        string signatureStatus = "None",
        string issuesJson = "[]",
        string stepResultsJson = "[]")
    {
        using var scope = factory.Services.CreateScope();
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
            Description = "Workflow run test fixture",
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
            Status = assetStatus,
        });

        db.AssetWorkflowRuns.Add(new AssetWorkflowRunEntity
        {
            Id = runId,
            AssetId = assetId,
            WorkflowConfigId = configId,
            WorkflowVersion = 1,
            WorkflowSnapshotJson = "{}",
            Status = runStatus,
            IsLocked = isLocked,
            SignatureStatus = signatureStatus,
            StepResultsJson = stepResultsJson,
            IssuesJson = issuesJson,
            TimeTrackingJson = "[]",
            RunNumber = 1,
            StartedAt = now,
            CompletedAt = isLocked ? now : null,
            CreatedAt = now,
            UpdatedAt = now,
        });

        await db.SaveChangesAsync();
        return new RunFixture(runId, assetId, projectId);
    }

    internal static async Task<string?> GetAssetStatusAsync(ApiTestFactory factory, string assetId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var asset = await db.ProjectAssets.FindAsync(assetId);
        return asset?.Status;
    }
}
