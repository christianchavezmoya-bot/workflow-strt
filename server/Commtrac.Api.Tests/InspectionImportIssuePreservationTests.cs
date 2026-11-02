using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Commtrac.Api.Controllers;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// An inspection import that auto-completes an INSPECTION_ONLY asset must never lose issues that
/// were already recorded: run issues are merged with the import's failed checks (not replaced, and
/// not cleared when the import has no parsable content), the asset's own issue list is left alone,
/// reprocessing doesn't duplicate imported issues, and a resolution made after import survives
/// reprocessing. An unresolved blocking issue still stops auto-completion altogether.
/// </summary>
[Collection(ApiTestCollection.Name)]
public class InspectionImportIssuePreservationTests : IClassFixture<ApiTestFactory>
{
    private const string Password = "Import-Test-Passw0rd!";
    private readonly ApiTestFactory _factory;

    public InspectionImportIssuePreservationTests(ApiTestFactory factory) => _factory = factory;

    private static string N() => Guid.NewGuid().ToString("N");

    // A field-recorded issue with resolution, comments and media; and a resolved blocking issue.
    private const string ExistingRunIssues = """
        [{"id":"field-1","description":"Gland loose","issueType":"observation","severity":"medium","isBlocking":false,"resolved":false,
          "reportedAt":"2026-10-20T01:00:00Z","comments":[{"id":"c1","text":"seen on site"}],"reportMedia":["data:image/png;base64,AAAA"]},
         {"id":"field-2","description":"Earth fault","issueType":"blocking","severity":"high","isBlocking":true,"resolved":true,
          "resolvedNote":"re-terminated","reportedAt":"2026-10-20T02:00:00Z"}]
        """;
    private const string ExistingAssetIssues = """[{"id":"asset-1","description":"Label faded","isBlocking":false,"resolved":false}]""";
    private const string OpenBlocking = """[{"id":"b1","description":"Earth fault","isBlocking":true,"resolved":false}]""";
    private const string InspectionJson = """
        {"inspectionDate":"2026-10-21","technicianName":"Inspector","results":[
          {"checkId":"ir-test","label":"Insulation resistance","value":"0.2","unit":"MOhm","pass":false},
          {"checkId":"visual","label":"Visual","value":"OK","pass":true}]}
        """;

    private async Task<HttpClient> PmClientAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var user = new UserEntity
        {
            Id = N(), Email = $"import-pm-{N()[..8]}@example.test", FullName = "Import Test PM", Role = "Project Manager",
            Office = "Test Office", IsActive = true, IsFirstLogin = false, PasswordChangedAt = DateTime.UtcNow,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(Password),
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        var client = _factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/auth/login", new { email = user.Email, password = Password });
        resp.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", doc.RootElement.GetProperty("token").GetString());
        return client;
    }

    private async Task<(string ProjectId, string AssetId, string RunId)> SeedAsync(string runIssues, string assetIssues = "[]")
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var now = DateTime.UtcNow;
        var (projectId, assetId, runId) = (N(), N(), N());
        db.Projects.Add(new ProjectEntity
        {
            Id = projectId, CustomerName = "Import Customer", CustomerId = "cust-import", JobNumber = $"JI{N()[..6]}",
            Description = "import fixture", StartDate = "2026-01-01", FinishDate = "2026-12-31", Office = "Test Office",
            Status = "Active", WorkflowMode = "INSPECTION_ONLY", IsInstallationProject = false,
        });
        db.ProjectAssets.Add(new ProjectAssetEntity
        {
            Id = assetId, ProjectId = projectId, ProductId = N(), AssetTag = $"IM-{N()[..4]}", Status = "In Progress", IssuesJson = assetIssues,
        });
        db.AssetWorkflowRuns.Add(new AssetWorkflowRunEntity
        {
            Id = runId, AssetId = assetId, WorkflowConfigId = N(), WorkflowVersion = 1, WorkflowSnapshotJson = "{}",
            Status = "InProgress", IsLocked = false, SignatureStatus = "None", StepResultsJson = "[]", IssuesJson = runIssues,
            TimeTrackingJson = "[]", RunNumber = 1, StartedAt = now, CreatedAt = now, UpdatedAt = now,
        });
        await db.SaveChangesAsync();
        return (projectId, assetId, runId);
    }

    private async Task<(AssetWorkflowRunEntity Run, ProjectAssetEntity Asset)> ReadAsync(string runId, string assetId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return (await db.AssetWorkflowRuns.AsNoTracking().FirstAsync(r => r.Id == runId),
                await db.ProjectAssets.AsNoTracking().FirstAsync(a => a.Id == assetId));
    }

    private static JsonArray Issues(string json) => (JsonArray)JsonNode.Parse(json)!;
    private static JsonNode? ById(JsonArray issues, string id) => issues.FirstOrDefault(i => (string?)i?["id"] == id);

    private static async Task<string> ImportAsync(HttpClient client, string projectId, string assetId, string? rawJson)
    {
        var resp = await client.PostAsJsonAsync("/api/inspection-imports", new { source = "LOCAL", fileName = $"{N()}.json", rawJson, projectId, assetId });
        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("id").GetString()!;
    }

    [Fact]
    public async Task Completing_from_an_inspection_merges_its_failed_checks_into_the_recorded_issues()
    {
        var client = await PmClientAsync();
        var (projectId, assetId, runId) = await SeedAsync(ExistingRunIssues, ExistingAssetIssues);

        await ImportAsync(client, projectId, assetId, InspectionJson);

        var (run, asset) = await ReadAsync(runId, assetId);
        Assert.True(run.IsLocked);
        var issues = Issues(run.IssuesJson);
        Assert.Equal(3, issues.Count);
        foreach (var original in Issues(ExistingRunIssues))
        {
            Assert.True(JsonNode.DeepEquals(original, ById(issues, (string)original!["id"]!)), $"issue {original["id"]} was altered");
        }
        var imported = ById(issues, $"{InspectionImportsController.ImportedIssueIdPrefix}ir-test")!;
        Assert.Equal(false, (bool?)imported["resolved"]);
        Assert.Equal(false, (bool?)imported["isBlocking"]);
        Assert.Null(ById(issues, $"{InspectionImportsController.ImportedIssueIdPrefix}visual")); // passed check → no issue
        Assert.Equal(ExistingAssetIssues, asset.IssuesJson); // the asset's issue list is no longer cleared
    }

    [Fact]
    public async Task An_import_without_parsable_content_no_longer_clears_the_runs_issues()
    {
        var client = await PmClientAsync();
        var (projectId, assetId, runId) = await SeedAsync(ExistingRunIssues, ExistingAssetIssues);

        await ImportAsync(client, projectId, assetId, rawJson: null);

        var (run, asset) = await ReadAsync(runId, assetId);
        Assert.True(run.IsLocked);
        Assert.Equal(ExistingRunIssues, run.IssuesJson); // byte-for-byte
        Assert.Equal(ExistingAssetIssues, asset.IssuesJson);
    }

    [Fact]
    public async Task Reprocessing_does_not_duplicate_imported_issues_and_keeps_a_later_resolution()
    {
        var client = await PmClientAsync();
        var (projectId, assetId, runId) = await SeedAsync(ExistingRunIssues);
        var importId = await ImportAsync(client, projectId, assetId, InspectionJson);

        // A PM resolves the imported issue after the import.
        var importedId = $"{InspectionImportsController.ImportedIssueIdPrefix}ir-test";
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var run = await db.AssetWorkflowRuns.FirstAsync(r => r.Id == runId);
            var issues = Issues(run.IssuesJson);
            ById(issues, importedId)!["resolved"] = true;
            ById(issues, importedId)!["resolvedNote"] = "retested OK";
            run.IssuesJson = issues.ToJsonString();
            await db.SaveChangesAsync();
        }

        var reprocess = await client.PostAsync($"/api/inspection-imports/{importId}/reprocess", null);
        Assert.Equal(HttpStatusCode.OK, reprocess.StatusCode);

        var after = Issues((await ReadAsync(runId, assetId)).Run.IssuesJson);
        Assert.Equal(3, after.Count);
        Assert.Single(after, i => (string?)i?["id"] == importedId);
        Assert.Equal(true, (bool?)ById(after, importedId)!["resolved"]);
        Assert.Equal("retested OK", (string?)ById(after, importedId)!["resolvedNote"]);
    }

    [Fact]
    public async Task An_open_blocking_issue_still_stops_auto_completion_and_survives()
    {
        var client = await PmClientAsync();
        var (projectId, assetId, runId) = await SeedAsync(OpenBlocking);

        await ImportAsync(client, projectId, assetId, InspectionJson);

        var (run, _) = await ReadAsync(runId, assetId);
        Assert.False(run.IsLocked);
        Assert.Equal(OpenBlocking, run.IssuesJson);
    }

    // ── MergeIssuesJson ─────────────────────────────────────────────────────────────

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("[]")]
    public void Empty_existing_takes_the_imported_issues(string? existing)
    {
        var merged = Issues(InspectionImportsController.MergeIssuesJson(existing, """[{"id":"inspection-import:a","resolved":false}]"""));
        Assert.Single(merged);
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("""{"id":"x"}""")]
    public void Unreadable_or_non_array_existing_issues_are_returned_untouched(string existing) =>
        Assert.Equal(existing, InspectionImportsController.MergeIssuesJson(existing, """[{"id":"inspection-import:a"}]"""));

    [Fact]
    public void Same_id_keeps_the_recorded_issue_and_nothing_added_returns_the_original_bytes()
    {
        const string existing = """[ {"id":"inspection-import:a","resolved":true,"note":"é"} ]""";
        Assert.Equal(existing, InspectionImportsController.MergeIssuesJson(existing, """[{"id":"inspection-import:a","resolved":false}]"""));
    }

    [Fact]
    public void New_and_id_less_imported_issues_are_appended_after_all_existing_ones()
    {
        var merged = Issues(InspectionImportsController.MergeIssuesJson(
            """[{"id":"x"},{"no":"id"}]""", """[{"id":"x"},{"id":"y"},{"also":"no id"}]"""));
        Assert.Equal(4, merged.Count);
        Assert.Equal("x", (string?)merged[0]!["id"]);
        Assert.Equal("id", (string?)merged[1]!["no"]);
        Assert.Equal("y", (string?)merged[2]!["id"]);
        Assert.Equal("no id", (string?)merged[3]!["also"]);
    }

    [Fact]
    public void Unreadable_imported_issues_leave_the_existing_list_intact()
    {
        const string existing = """[{"id":"x"}]""";
        Assert.Equal(existing, InspectionImportsController.MergeIssuesJson(existing, "garbage"));
    }
}
