using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// Client issue lists (save progress, complete, sync bundle, patch issues) are merged with the
/// issues recorded on the server instead of replacing them: omission never deletes, so a
/// completion can't silently drop an unresolved blocking issue (with or without X-Field-Sync:
/// force); deletion is explicit and an open blocking issue may only be deleted or downgraded by
/// Admin/PM or its recorded creator; resolutions, comments and media survive offline replay and
/// concurrent edits. Real logins, so the JWT id/role claims are exercised.
/// </summary>
[Collection(ApiTestCollection.Name)]
public class RunIssuePreservationTests : IClassFixture<ApiTestFactory>
{
    private const string Password = "Issue-Test-Passw0rd!";
    private readonly ApiTestFactory _factory;
    public RunIssuePreservationTests(ApiTestFactory factory) => _factory = factory;

    private static string N() => Guid.NewGuid().ToString("N");

    private async Task<(string Id, HttpClient Client)> UserAsync(string role)
    {
        string email, id;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var user = new UserEntity
            {
                Id = N(), Email = $"issues-{role.Replace(' ', '-').ToLowerInvariant()}-{N()[..8]}@example.test", FullName = $"Issues {role}",
                Role = role, Office = "Test Office", IsActive = true, IsFirstLogin = false, PasswordChangedAt = DateTime.UtcNow,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(Password),
            };
            db.Users.Add(user);
            await db.SaveChangesAsync();
            (email, id) = (user.Email, user.Id);
        }
        var client = _factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/auth/login", new { email, password = Password });
        resp.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", doc.RootElement.GetProperty("token").GetString());
        return (id, client);
    }

    private async Task<string> SeedRunAsync(string issuesJson, bool locked = false)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var now = DateTime.UtcNow;
        var (projectId, assetId, runId) = (N(), N(), N());
        db.Projects.Add(new ProjectEntity
        {
            Id = projectId, CustomerName = "Issues Customer", CustomerId = "cust-issues", JobNumber = $"JX{N()[..6]}",
            Description = "issue preservation fixture", StartDate = "2026-01-01", FinishDate = "2026-12-31", Office = "Test Office",
            Status = "Active", WorkflowMode = "INSTALLATION_ONLY", IsInstallationProject = true,
        });
        db.ProjectAssets.Add(new ProjectAssetEntity { Id = assetId, ProjectId = projectId, ProductId = N(), AssetTag = $"IX-{N()[..4]}", Status = "In Progress" });
        db.AssetWorkflowRuns.Add(new AssetWorkflowRunEntity
        {
            Id = runId, AssetId = assetId, WorkflowConfigId = N(), WorkflowVersion = 1, WorkflowSnapshotJson = "{}",
            Status = locked ? "Complete" : "InProgress", IsLocked = locked, SignatureStatus = locked ? "PendingInstaller" : "None",
            StepResultsJson = "[]", IssuesJson = issuesJson, TimeTrackingJson = "[]", RunNumber = 1,
            StartedAt = now, CompletedAt = locked ? now : null, CreatedAt = now, UpdatedAt = now,
        });
        await db.SaveChangesAsync();
        return runId;
    }

    private async Task<AssetWorkflowRunEntity> RunAsync(string runId)
    {
        using var scope = _factory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<AppDbContext>().AssetWorkflowRuns.AsNoTracking().FirstAsync(r => r.Id == runId);
    }

    private async Task<int> RefusalAuditsAsync(string runId)
    {
        using var scope = _factory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<AppDbContext>().AuditLogs
            .CountAsync(a => a.Action == "run_issue_change_refused" && a.Details!.Contains($"run={runId};"));
    }

    private static string State(AssetWorkflowRunEntity r) => $"{r.Status}|{r.IsLocked}|{r.SignatureStatus}|{r.IssuesJson}|{r.UpdatedAt:O}";
    private static JsonObject? Issue(AssetWorkflowRunEntity r, string id) =>
        ((JsonArray)JsonNode.Parse(r.IssuesJson)!).OfType<JsonObject>().FirstOrDefault(o => (string?)o["id"] == id);

    private static string PmBlocking(string pmId) =>
        $$"""[{"id":"pm-b1","description":"Earth fault (PM)","issueType":"blocking","severity":"high","isBlocking":true,"resolved":false,"createdByUserId":"{{pmId}}","comments":[{"id":"c-pm","text":"Do not energise"}],"reportMedia":["data:image/png;base64,AAAA"]}]""";

    private static Task<HttpResponseMessage> SendAsync(HttpClient c, HttpMethod m, string url, object body, bool force = false)
    {
        var req = new HttpRequestMessage(m, url) { Content = JsonContent.Create(body) };
        if (force) req.Headers.Add("X-Field-Sync", "force");
        return c.SendAsync(req);
    }

    private static Task<HttpResponseMessage> Complete(HttpClient c, string runId, string issuesJson, bool force = false, string[]? deleted = null) =>
        SendAsync(c, HttpMethod.Post, $"/api/asset-workflow-runs/{runId}/complete",
            new { stepResultsJson = "[]", issuesJson, completedByName = "Tech", deletedIssueIds = deleted }, force);

    private static Task<HttpResponseMessage> Save(HttpClient c, string runId, string issuesJson, string[]? deleted = null, bool force = false) =>
        SendAsync(c, HttpMethod.Put, $"/api/asset-workflow-runs/{runId}", new { stepResultsJson = "[]", issuesJson, status = "InProgress", deletedIssueIds = deleted }, force);

    // ── omission is not deletion ─────────────────────────────────────────────────────

    [Theory]
    [InlineData(false)]
    [InlineData(true)] // malicious/forced: X-Field-Sync: force doesn't change it
    public async Task Completing_with_a_payload_that_leaves_out_a_recorded_blocking_issue_is_422_and_changes_nothing(bool force)
    {
        var (pm, _) = await UserAsync("Project Manager");
        var (_, installer) = await UserAsync("Installer");
        var runId = await SeedRunAsync(PmBlocking(pm));
        var before = State(await RunAsync(runId));

        var resp = await Complete(installer, runId, "[]", force);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, resp.StatusCode);
        Assert.Equal(before, State(await RunAsync(runId)));
    }

    [Fact]
    public async Task Forced_sync_bundle_that_leaves_out_a_recorded_blocking_issue_is_422()
    {
        var (pm, _) = await UserAsync("Project Manager");
        var (_, installer) = await UserAsync("Installer");
        var runId = await SeedRunAsync(PmBlocking(pm));
        var before = State(await RunAsync(runId));

        var resp = await SendAsync(installer, HttpMethod.Post, $"/api/asset-workflow-runs/{runId}/sync-bundle",
            new { stepResultsJson = "[]", issuesJson = "[]", completedByName = "Tech", idempotencyKey = N() }, force: true);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, resp.StatusCode);
        Assert.Equal(before, State(await RunAsync(runId)));
    }

    [Fact]
    public async Task Saving_progress_keeps_recorded_issues_the_payload_omits_including_ones_added_concurrently()
    {
        var (pm, _) = await UserAsync("Project Manager");
        var (instId, installer) = await UserAsync("Installer");
        // The phone only knew about o1; a PM added pm-b1 while it was offline.
        var runId = await SeedRunAsync(PmBlocking(pm).TrimEnd(']') + """,{"id":"o1","description":"Label","isBlocking":false,"resolved":false}]""");

        var resp = await Save(installer, runId, """[{"id":"n1","description":"New from phone","isBlocking":false,"resolved":false,"createdByUserId":"spoofed"}]""");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var run = await RunAsync(runId);
        Assert.NotNull(Issue(run, "pm-b1"));
        Assert.NotNull(Issue(run, "o1"));
        Assert.Equal(instId, (string?)Issue(run, "n1")![RunIssueMerge.CreatedByUserIdKey]); // stamped by the server, not the client
    }

    [Fact]
    public async Task Patching_issues_with_an_omission_keeps_the_issue()
    {
        var (pm, pmClient) = await UserAsync("Project Manager");
        var runId = await SeedRunAsync(PmBlocking(pm), locked: true);
        var resp = await pmClient.PatchAsJsonAsync($"/api/asset-workflow-runs/{runId}/issues", new { issuesJson = "[]" });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.NotNull(Issue(await RunAsync(runId), "pm-b1"));
    }

    // ── explicit, authorized deletion ───────────────────────────────────────────────

    [Fact]
    public async Task An_installer_cannot_delete_a_PMs_open_blocking_issue_even_explicitly()
    {
        var (pm, _) = await UserAsync("Project Manager");
        var (_, installer) = await UserAsync("Installer");
        var runId = await SeedRunAsync(PmBlocking(pm));
        var before = State(await RunAsync(runId));

        var resp = await Save(installer, runId, "[]", deleted: new[] { "pm-b1" });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, resp.StatusCode);
        Assert.Contains("issue_change_refused", await resp.Content.ReadAsStringAsync());
        Assert.Equal(before, State(await RunAsync(runId)));
        Assert.Equal(1, await RefusalAuditsAsync(runId));
    }

    [Fact]
    public async Task A_project_manager_can_delete_it_explicitly()
    {
        var (pm, pmClient) = await UserAsync("Project Manager");
        var runId = await SeedRunAsync(PmBlocking(pm));
        var resp = await Save(pmClient, runId, "[]", deleted: new[] { "pm-b1" });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Null(Issue(await RunAsync(runId), "pm-b1"));
    }

    [Fact]
    public async Task An_installer_can_delete_a_blocking_issue_they_recorded_but_another_installer_cannot()
    {
        var (_, installerA) = await UserAsync("Installer");
        var (_, installerB) = await UserAsync("Installer");
        var runId = await SeedRunAsync("[]");
        const string flagged = """[{"id":"mine","description":"Wrong flag","isBlocking":true,"resolved":false,"severity":"high"}]""";
        Assert.Equal(HttpStatusCode.OK, (await Save(installerA, runId, flagged)).StatusCode); // autosaved; server stamps A

        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Save(installerB, runId, "[]", deleted: new[] { "mine" })).StatusCode);
        Assert.NotNull(Issue(await RunAsync(runId), "mine"));

        Assert.Equal(HttpStatusCode.OK, (await Save(installerA, runId, "[]", deleted: new[] { "mine" })).StatusCode); // flag cancelled
        Assert.Null(Issue(await RunAsync(runId), "mine"));
    }

    [Fact]
    public async Task An_installer_cannot_downgrade_a_PMs_blocking_issue_to_non_blocking()
    {
        var (pm, _) = await UserAsync("Project Manager");
        var (_, installer) = await UserAsync("Installer");
        var runId = await SeedRunAsync(PmBlocking(pm));
        var before = State(await RunAsync(runId));

        var resp = await Save(installer, runId, """[{"id":"pm-b1","description":"Earth fault (PM)","isBlocking":false,"severity":"low","resolved":false}]""");

        Assert.Equal(HttpStatusCode.UnprocessableEntity, resp.StatusCode);
        Assert.Equal(before, State(await RunAsync(runId)));
    }

    // ── legitimate resolution and offline replay ────────────────────────────────────

    [Fact]
    public async Task Offline_replay_that_resolves_the_PMs_blocking_issue_completes_and_keeps_its_comments_and_media()
    {
        var (pm, _) = await UserAsync("Project Manager");
        var (_, installer) = await UserAsync("Installer");
        var runId = await SeedRunAsync(PmBlocking(pm));
        const string phone = """[{"id":"pm-b1","description":"Earth fault (PM)","issueType":"blocking","severity":"high","isBlocking":true,"resolved":true,"resolutionNote":"re-terminated","resolutionMedia":["data:image/png;base64,BBBB"],"comments":[{"id":"c-tech","text":"fixed on site"}]}]""";

        var resp = await Complete(installer, runId, phone, force: true);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var run = await RunAsync(runId);
        Assert.True(run.IsLocked);
        var issue = Issue(run, "pm-b1")!;
        Assert.True((bool)issue["resolved"]!);
        Assert.Equal(pm, (string?)issue[RunIssueMerge.CreatedByUserIdKey]);
        Assert.Equal(new[] { "c-pm", "c-tech" }, ((JsonArray)issue["comments"]!).Select(n => (string?)n!["id"]));
        Assert.Equal("data:image/png;base64,AAAA", (string?)((JsonArray)issue["reportMedia"]!)[0]);
    }

    [Fact]
    public async Task Concurrent_edit_a_PM_resolution_made_while_the_phone_was_offline_is_kept_and_the_replay_completes()
    {
        var (pm, pmClient) = await UserAsync("Project Manager");
        var (_, installer) = await UserAsync("Installer");
        var runId = await SeedRunAsync(PmBlocking(pm));
        // PM resolves on the server…
        var resolved = PmBlocking(pm).Replace("\"resolved\":false", "\"resolved\":true,\"resolutionNote\":\"PM verified\"");
        Assert.Equal(HttpStatusCode.OK, (await pmClient.PatchAsJsonAsync($"/api/asset-workflow-runs/{runId}/issues", new { issuesJson = resolved })).StatusCode);

        // …while the phone replays its stale, unresolved copy (plus its own new note).
        var stale = PmBlocking(pm).Replace("\"comments\":[{\"id\":\"c-pm\",\"text\":\"Do not energise\"}]", "\"comments\":[{\"id\":\"c-pm\",\"text\":\"Do not energise\"},{\"id\":\"c-phone\",\"text\":\"waiting\"}]");
        var resp = await Complete(installer, runId, stale, force: true);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode); // not stuck in a 422 retry loop
        var issue = Issue(await RunAsync(runId), "pm-b1")!;
        Assert.True((bool)issue["resolved"]!);
        Assert.Equal("PM verified", (string?)issue["resolutionNote"]);
        Assert.Equal(new[] { "c-pm", "c-phone" }, ((JsonArray)issue["comments"]!).Select(n => (string?)n!["id"]));
    }

    [Fact]
    public async Task An_unreadable_issue_list_is_400_and_changes_nothing()
    {
        var (pm, pmClient) = await UserAsync("Project Manager");
        var runId = await SeedRunAsync(PmBlocking(pm));
        var before = State(await RunAsync(runId));
        Assert.Equal(HttpStatusCode.BadRequest, (await Complete(pmClient, runId, "{\"not\":\"an array\"}")).StatusCode);
        Assert.Equal(before, State(await RunAsync(runId)));
    }
}
