using System.Net;
using System.Net.Http.Json;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.Extensions.DependencyInjection;

namespace Commtrac.Api.Tests;

[Collection(ApiTestCollection.Name)]
public class ProjectWorkflowTypeTests : IClassFixture<ApiTestFactory>
{
    private readonly ApiTestFactory _factory;

    public ProjectWorkflowTypeTests(ApiTestFactory factory) => _factory = factory;

    [Fact]
    public async Task CreateProject_with_workflowTypeId_derives_inspection_mode()
    {
        var client = await WorkflowRunTestHelpers.CreateAuthenticatedClientAsync(_factory);

        var resp = await client.PostAsJsonAsync("/api/projects", new
        {
            id = "",
            customerName = "Type Test",
            customerId = "cust-type",
            jobNumber = "JOB-TYPE-1",
            purchaseOrderNumber = "",
            description = "Inspection-only project",
            startDate = "2026-01-01",
            finishDate = "2026-12-31",
            office = "Test Office",
            projectType = "Internal",
            status = "Draft",
            isInstallationProject = false,
            minimumCompletionPercent = 100,
            productIds = Array.Empty<string>(),
            productFeatureValues = new Dictionary<string, string>(),
            workflowTypeId = "wftype-inspection",
        });

        var body = await resp.Content.ReadAsStringAsync();
        Assert.True(resp.StatusCode == HttpStatusCode.Created, body);
        using var doc = System.Text.Json.JsonDocument.Parse(body);
        Assert.Equal("wftype-inspection", doc.RootElement.GetProperty("workflowTypeId").GetString());
        Assert.Equal("INSPECTION_ONLY", doc.RootElement.GetProperty("workflowMode").GetString());
        Assert.False(doc.RootElement.GetProperty("isInstallationProject").GetBoolean());
    }

    [Fact]
    public async Task AssignWorkflow_rejects_config_type_mismatch_for_typed_project()
    {
        var client = await WorkflowRunTestHelpers.CreateAuthenticatedClientAsync(_factory);
        var (_, assetId, _, inspectionConfigId) = await SeedTypedProjectAsync(
            workflowTypeId: "wftype-installation",
            workflowMode: "INSTALLATION_ONLY");

        var resp = await client.PostAsJsonAsync("/api/asset-workflow-assignments", new
        {
            assetId,
            workflowConfigId = inspectionConfigId,
            workflowTypeId = "wftype-inspection",
        });

        Assert.Equal(HttpStatusCode.Conflict, resp.StatusCode);
    }

    [Fact]
    public async Task AssignWorkflow_allows_any_published_config_for_legacy_mixed_project()
    {
        var client = await WorkflowRunTestHelpers.CreateAuthenticatedClientAsync(_factory);
        var (projectId, assetId, installConfigId, inspectionConfigId) = await SeedTypedProjectAsync(
            workflowTypeId: null,
            workflowMode: "MIXED");

        var resp = await client.PostAsJsonAsync("/api/asset-workflow-assignments", new
        {
            assetId,
            workflowConfigId = inspectionConfigId,
            workflowTypeId = "wftype-inspection",
        });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }

    private async Task<(string ProjectId, string AssetId, string InstallConfigId, string InspectionConfigId)>
        SeedTypedProjectAsync(string? workflowTypeId, string workflowMode)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var projectId = Guid.NewGuid().ToString("N");
        var assetId = Guid.NewGuid().ToString("N");
        var productId = Guid.NewGuid().ToString("N");
        var installConfigId = Guid.NewGuid().ToString("N");
        var inspectionConfigId = Guid.NewGuid().ToString("N");
        var now = DateTime.UtcNow;

        db.Projects.Add(new ProjectEntity
        {
            Id = projectId,
            CustomerName = "Assignment Guard Test",
            CustomerId = "cust-guard",
            JobNumber = "JOB-GUARD",
            Description = "Workflow type guard fixture",
            StartDate = "2026-01-01",
            FinishDate = "2026-12-31",
            Office = "Test Office",
            Status = "Active",
            WorkflowMode = workflowMode,
            WorkflowTypeId = workflowTypeId,
            IsInstallationProject = workflowMode is "INSTALLATION_ONLY" or "MIXED",
        });

        db.WorkflowConfigs.AddRange(
            new WorkflowConfigEntity
            {
                Id = installConfigId,
                ProductId = productId,
                Name = "Install Config",
                Status = "Published",
                WorkflowTypeId = "wftype-installation",
                Version = 1,
                StepsJson = "[]",
                MediaJson = "[]",
                FeatureSelectionsJson = "[]",
                CreatedAt = now,
                UpdatedAt = now,
            },
            new WorkflowConfigEntity
            {
                Id = inspectionConfigId,
                ProductId = productId,
                Name = "Inspection Config",
                Status = "Published",
                WorkflowTypeId = "wftype-inspection",
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
            AssetTag = "GUARD-001",
            Status = "NotStarted",
        });

        await db.SaveChangesAsync();
        return (projectId, assetId, installConfigId, inspectionConfigId);
    }
}
