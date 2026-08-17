using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// Characterises workflow progress save and issue patch endpoints — step results
/// persistence and asset status side effects. Pins server behaviour before S6 splits.
/// </summary>
[Collection(ApiTestCollection.Name)]
public class AssetWorkflowRunProgressTests : IClassFixture<ApiTestFactory>
{
    private readonly ApiTestFactory _factory;

    public AssetWorkflowRunProgressTests(ApiTestFactory factory) => _factory = factory;

    [Fact]
    public async Task SaveProgress_persists_step_results_json()
    {
        var client = await WorkflowRunTestHelpers.CreateAuthenticatedClientAsync(_factory);
        var fixture = await WorkflowRunTestHelpers.SeedRunAsync(_factory);
        var stepResults = "[{\"stepId\":\"s1\",\"values\":{\"note\":\"captured\"}}]";

        var resp = await client.PutAsJsonAsync($"/api/asset-workflow-runs/{fixture.RunId}", new
        {
            stepResultsJson = stepResults,
        });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        Assert.Equal(stepResults, doc.RootElement.GetProperty("stepResultsJson").GetString());
    }

    [Fact]
    public async Task SaveProgress_with_open_issue_sets_asset_status_to_Issue()
    {
        var client = await WorkflowRunTestHelpers.CreateAuthenticatedClientAsync(_factory);
        var fixture = await WorkflowRunTestHelpers.SeedRunAsync(_factory);
        var issuesJson = JsonSerializer.Serialize(new[]
        {
            new { id = "issue-1", isBlocking = false, resolved = false, title = "Minor defect" },
        });

        var resp = await client.PutAsJsonAsync($"/api/asset-workflow-runs/{fixture.RunId}", new
        {
            stepResultsJson = "[]",
            issuesJson,
        });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var assetStatus = await WorkflowRunTestHelpers.GetAssetStatusAsync(_factory, fixture.AssetId);
        Assert.Equal("Issue", assetStatus);
    }

    [Fact]
    public async Task SaveProgress_resolving_last_issue_clears_asset_Issue_status()
    {
        var client = await WorkflowRunTestHelpers.CreateAuthenticatedClientAsync(_factory);
        var openIssues = JsonSerializer.Serialize(new[]
        {
            new { id = "issue-1", isBlocking = false, resolved = false, title = "Minor defect" },
        });
        var fixture = await WorkflowRunTestHelpers.SeedRunAsync(
            _factory,
            assetStatus: "Issue",
            issuesJson: openIssues);

        var resolvedIssues = JsonSerializer.Serialize(new[]
        {
            new { id = "issue-1", isBlocking = false, resolved = true, title = "Minor defect" },
        });

        var resp = await client.PutAsJsonAsync($"/api/asset-workflow-runs/{fixture.RunId}", new
        {
            stepResultsJson = "[]",
            issuesJson = resolvedIssues,
        });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var assetStatus = await WorkflowRunTestHelpers.GetAssetStatusAsync(_factory, fixture.AssetId);
        Assert.Equal("InProgress", assetStatus);
    }

    [Fact]
    public async Task SaveProgress_on_locked_run_returns_bad_request()
    {
        var client = await WorkflowRunTestHelpers.CreateAuthenticatedClientAsync(_factory);
        var fixture = await WorkflowRunTestHelpers.SeedRunAsync(
            _factory,
            isLocked: true,
            assetStatus: "Complete",
            runStatus: "Complete",
            signatureStatus: "PendingCustomer");

        var resp = await client.PutAsJsonAsync($"/api/asset-workflow-runs/{fixture.RunId}", new
        {
            stepResultsJson = "[{\"stepId\":\"s1\",\"values\":{}}]",
        });

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        Assert.Contains("locked", doc.RootElement.GetProperty("message").GetString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task PatchIssues_on_active_run_with_open_issue_sets_asset_status_to_Issue()
    {
        var client = await WorkflowRunTestHelpers.CreateAuthenticatedClientAsync(_factory);
        var fixture = await WorkflowRunTestHelpers.SeedRunAsync(_factory);
        var issuesJson = JsonSerializer.Serialize(new[]
        {
            new { id = "issue-1", isBlocking = true, resolved = false, title = "Blocking fault" },
        });

        var resp = await client.PatchAsJsonAsync($"/api/asset-workflow-runs/{fixture.RunId}/issues", new
        {
            issuesJson,
        });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var assetStatus = await WorkflowRunTestHelpers.GetAssetStatusAsync(_factory, fixture.AssetId);
        Assert.Equal("Issue", assetStatus);
    }

    [Fact]
    public async Task PatchIssues_closing_last_issue_on_active_run_clears_asset_Issue_status()
    {
        var client = await WorkflowRunTestHelpers.CreateAuthenticatedClientAsync(_factory);
        var openIssues = JsonSerializer.Serialize(new[]
        {
            new { id = "issue-1", isBlocking = true, resolved = false, title = "Blocking fault" },
        });
        var fixture = await WorkflowRunTestHelpers.SeedRunAsync(
            _factory,
            assetStatus: "Issue",
            issuesJson: openIssues);

        var resp = await client.PatchAsJsonAsync($"/api/asset-workflow-runs/{fixture.RunId}/issues", new
        {
            issuesJson = "[]",
        });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var assetStatus = await WorkflowRunTestHelpers.GetAssetStatusAsync(_factory, fixture.AssetId);
        Assert.Equal("InProgress", assetStatus);
    }

    [Fact]
    public async Task PatchIssues_on_locked_run_with_no_open_issues_reflects_signature_status()
    {
        var client = await WorkflowRunTestHelpers.CreateAuthenticatedClientAsync(_factory);
        var openIssues = JsonSerializer.Serialize(new[]
        {
            new { id = "issue-1", isBlocking = true, resolved = false, title = "Post-complete issue" },
        });
        var fixture = await WorkflowRunTestHelpers.SeedRunAsync(
            _factory,
            isLocked: true,
            assetStatus: "Issue",
            runStatus: "Complete",
            signatureStatus: "Signed",
            issuesJson: openIssues);

        var resolvedIssues = JsonSerializer.Serialize(new[]
        {
            new { id = "issue-1", isBlocking = true, resolved = true, title = "Post-complete issue" },
        });

        var resp = await client.PatchAsJsonAsync($"/api/asset-workflow-runs/{fixture.RunId}/issues", new
        {
            issuesJson = resolvedIssues,
        });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var assetStatus = await WorkflowRunTestHelpers.GetAssetStatusAsync(_factory, fixture.AssetId);
        Assert.Equal("Closed", assetStatus);
    }
}
