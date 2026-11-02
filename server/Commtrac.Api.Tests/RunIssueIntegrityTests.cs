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
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// Integrity of run issue writes (RunIssueMerge) on all four endpoints — save progress, complete,
/// sync-bundle, patch issues:
///   - malformed client lists are rejected (400) and unreadable recorded lists fail closed (422):
///     no data loss, no completion, no locking, run and asset untouched;
///   - explicit deletions / blocking downgrades leave durable audit rows (actor, issue, run,
///     operation, UTC time); refusals are audited; offline replays and duplicate submissions don't
///     duplicate change rows, and identical refusals within 10 minutes are recorded once;
///   - a request mixing allowed changes with a refused delete/downgrade changes nothing at all.
/// </summary>
[Collection(ApiTestCollection.Name)]
public class RunIssueIntegrityTests : IClassFixture<ApiTestFactory>
{
    private const string Password = "Integrity-Test-Passw0rd!";
    private readonly ApiTestFactory _factory;
    public RunIssueIntegrityTests(ApiTestFactory factory) => _factory = factory;

    private static string N() => Guid.NewGuid().ToString("N");

    private sealed record User(string Id, string Email, HttpClient Client);
    private sealed record Fixture(string RunId, string AssetId);

    // One logged-in user per role per test host: logging in for every test would trip the real
    // credential rate limit (30 per 5 minutes per IP). Each test still seeds its own run.
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<(ApiTestFactory, string), Task<User>> Users = new();

    private Task<User> UserAsync(string role) => Users.GetOrAdd((_factory, role), key => LoginNewUserAsync(key.Item2));

    private async Task<User> LoginNewUserAsync(string role)
    {
        string email, id;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var user = new UserEntity
            {
                Id = N(), Email = $"integrity-{role.Replace(' ', '-').ToLowerInvariant()}-{N()[..8]}@example.test", FullName = $"Integrity {role}",
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
        return new User(id, email, client);
    }

    private async Task<Fixture> SeedAsync(string issuesJson, bool locked = false)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var now = DateTime.UtcNow;
        var (projectId, assetId, runId) = (N(), N(), N());
        db.Projects.Add(new ProjectEntity
        {
            Id = projectId, CustomerName = "Integrity Customer", CustomerId = "cust-int", JobNumber = $"JN{N()[..6]}",
            Description = "issue integrity fixture", StartDate = "2026-01-01", FinishDate = "2026-12-31", Office = "Test Office",
            Status = "Active", WorkflowMode = "INSTALLATION_ONLY", IsInstallationProject = true,
        });
        db.ProjectAssets.Add(new ProjectAssetEntity { Id = assetId, ProjectId = projectId, ProductId = N(), AssetTag = $"IN-{N()[..4]}", Status = "Issue", IssuesJson = "[]" });
        db.AssetWorkflowRuns.Add(new AssetWorkflowRunEntity
        {
            Id = runId, AssetId = assetId, WorkflowConfigId = N(), WorkflowVersion = 1, WorkflowSnapshotJson = "{}",
            Status = locked ? "Complete" : "InProgress", IsLocked = locked, SignatureStatus = locked ? "PendingInstaller" : "None",
            StepResultsJson = """[{"stepId":"s1","values":{"t1":"recorded"}}]""", IssuesJson = issuesJson, TimeTrackingJson = "[]", RunNumber = 1,
            StartedAt = now, CompletedAt = locked ? now : null, CreatedAt = now, UpdatedAt = now,
        });
        await db.SaveChangesAsync();
        return new Fixture(runId, assetId);
    }

    /// <summary>Everything a write could touch on the run and its asset.</summary>
    private async Task<string> StateAsync(Fixture f)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var r = await db.AssetWorkflowRuns.AsNoTracking().FirstAsync(x => x.Id == f.RunId);
        var a = await db.ProjectAssets.AsNoTracking().FirstAsync(x => x.Id == f.AssetId);
        return $"run:{r.Status}|{r.IsLocked}|{r.SignatureStatus}|{r.CompletedAt:O}|{r.UpdatedAt:O}|{r.IssuesJson}|{r.StepResultsJson}|{r.TimeTrackingJson}"
             + $" asset:{a.Status}|{a.IssuesJson}|{a.UpdatedAt:O}|{a.InstalledAt:O}";
    }

    private async Task<AuditLogEntity[]> AuditAsync(Fixture f)
    {
        using var scope = _factory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<AppDbContext>().AuditLogs.AsNoTracking()
            .Where(a => a.Details != null && a.Details.Contains($"run={f.RunId};")).OrderBy(a => a.Timestamp).ToArrayAsync();
    }

    private static string PmBlocking(string pmId) =>
        $$"""[{"id":"pm-b1","description":"Earth fault","isBlocking":true,"resolved":false,"severity":"high","createdByUserId":"{{pmId}}"},{"id":"o1","description":"Label","isBlocking":false,"resolved":false}]""";

    public enum Op { Save, Complete, SyncBundle, Patch }

    private static Task<HttpResponseMessage> WriteAsync(HttpClient c, Op op, Fixture f, string issuesJson, string[]? deleted = null, bool force = false)
    {
        var (method, url, body) = op switch
        {
            Op.Save => (HttpMethod.Put, $"/api/asset-workflow-runs/{f.RunId}", (object)new { stepResultsJson = """[{"stepId":"s1","values":{"t1":"from client"}}]""", issuesJson, status = "Paused", deletedIssueIds = deleted }),
            Op.Complete => (HttpMethod.Post, $"/api/asset-workflow-runs/{f.RunId}/complete", new { stepResultsJson = "[]", issuesJson, completedByName = "Tech", deletedIssueIds = deleted }),
            Op.SyncBundle => (HttpMethod.Post, $"/api/asset-workflow-runs/{f.RunId}/sync-bundle", new { stepResultsJson = "[]", issuesJson, completedByName = "Tech", idempotencyKey = N(), deletedIssueIds = deleted }),
            _ => (HttpMethod.Patch, $"/api/asset-workflow-runs/{f.RunId}/issues", new { issuesJson, deletedIssueIds = deleted }),
        };
        var req = new HttpRequestMessage(method, url) { Content = JsonContent.Create(body) };
        if (force) req.Headers.Add("X-Field-Sync", "force");
        return c.SendAsync(req);
    }

    // ── 1/2/3: malformed client payloads and unreadable stored data ─────────────────

    public static TheoryData<Op, string> MalformedPayloads()
    {
        var data = new TheoryData<Op, string>();
        var payloads = new[]
        {
            "not json", """{"id":"x"}""", """["text"]""", """[{"description":"no id"}]""",
            """[{"id":"a"},{"id":"a"}]""", """[{"id":"a","isBlocking":"true","resolved":false}]""",
        };
        foreach (var op in new[] { Op.Save, Op.Complete, Op.SyncBundle, Op.Patch })
            foreach (var p in payloads) data.Add(op, p);
        return data;
    }

    [Theory]
    [MemberData(nameof(MalformedPayloads))]
    public async Task A_malformed_client_issue_list_is_400_and_changes_nothing(Op op, string payload)
    {
        var pm = await UserAsync("Project Manager");
        var f = await SeedAsync(PmBlocking(pm.Id));
        var before = await StateAsync(f);

        var resp = await WriteAsync(pm.Client, op, f, payload, force: true);

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode); // 400 is retried by the native sync engine, not dropped
        Assert.Contains("issues_invalid", await resp.Content.ReadAsStringAsync());
        Assert.Equal(before, await StateAsync(f));
    }

    [Theory]
    [InlineData(Op.Save)]
    [InlineData(Op.Complete)]
    [InlineData(Op.SyncBundle)]
    [InlineData(Op.Patch)]
    public async Task Unreadable_recorded_issues_fail_closed_even_for_an_admin_with_a_valid_payload(Op op)
    {
        var admin = await UserAsync("Admin");
        const string corrupt = """[{"id":"pm-b1","isBlocking":true,"resolved":false""";
        var f = await SeedAsync(corrupt);
        var before = await StateAsync(f);

        var resp = await WriteAsync(admin.Client, op, f, """[{"id":"n1","isBlocking":false,"resolved":true}]""", force: true);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, resp.StatusCode);
        Assert.Contains("stored_issues_unreadable", await resp.Content.ReadAsStringAsync());
        Assert.Equal(before, await StateAsync(f)); // not replaced, not completed, not locked
        Assert.Equal("run_issues_stored_unreadable", Assert.Single(await AuditAsync(f)).Action);
    }

    [Fact]
    public async Task A_progress_save_that_carries_no_issue_list_still_works_on_a_run_with_unreadable_issues()
    {
        var installer = await UserAsync("Installer");
        const string corrupt = "not json";
        var f = await SeedAsync(corrupt);
        var resp = await installer.Client.PutAsJsonAsync($"/api/asset-workflow-runs/{f.RunId}",
            new { stepResultsJson = """[{"stepId":"s1","values":{"t1":"new"}}]""", issuesJson = (string?)null, status = "InProgress" });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Contains($"|{corrupt}|", await StateAsync(f)); // issues untouched
    }

    // ── 4/5: durable audit records, offline replay and duplicates ──────────────────

    [Fact]
    public async Task An_explicit_deletion_leaves_a_durable_audit_row_with_actor_issue_run_operation_and_utc_time()
    {
        var pm = await UserAsync("Project Manager");
        var f = await SeedAsync(PmBlocking(pm.Id));
        var t0 = DateTime.UtcNow.AddSeconds(-2);

        var resp = await WriteAsync(pm.Client, Op.Save, f, """[{"id":"o1","description":"Label","isBlocking":false,"resolved":false}]""", deleted: new[] { "pm-b1" });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var row = Assert.Single(await AuditAsync(f));
        Assert.Equal("run_issue_deleted", row.Action);
        Assert.Equal(pm.Id, row.UserId);
        Assert.Equal(pm.Email, row.UserEmail);
        Assert.Contains("via=save-progress;", row.Details);
        Assert.Contains($"run={f.RunId};", row.Details);
        Assert.Contains($"asset={f.AssetId};", row.Details);
        Assert.Contains("issue=pm-b1", row.Details);
        Assert.InRange(row.Timestamp, t0, DateTime.UtcNow.AddSeconds(2));
    }

    [Fact]
    public async Task A_permitted_blocking_downgrade_leaves_a_durable_audit_row()
    {
        var pm = await UserAsync("Project Manager");
        var f = await SeedAsync(PmBlocking(pm.Id));
        const string downgraded = """[{"id":"pm-b1","description":"Earth fault","isBlocking":false,"resolved":false,"severity":"low"},{"id":"o1","description":"Label","isBlocking":false,"resolved":false}]""";

        Assert.Equal(HttpStatusCode.OK, (await WriteAsync(pm.Client, Op.Patch, f, downgraded)).StatusCode);

        var row = Assert.Single(await AuditAsync(f));
        Assert.Equal("run_issue_downgraded", row.Action);
        Assert.Equal(pm.Id, row.UserId);
        Assert.Contains("via=patch-issues;", row.Details);
        Assert.Contains("issue=pm-b1", row.Details);
    }

    [Theory]
    [InlineData(Op.Save)]
    [InlineData(Op.Patch)]
    public async Task Replaying_the_same_deletion_offline_records_it_once(Op op)
    {
        var pm = await UserAsync("Project Manager");
        var f = await SeedAsync(PmBlocking(pm.Id));
        const string remaining = """[{"id":"o1","description":"Label","isBlocking":false,"resolved":false}]""";

        Assert.Equal(HttpStatusCode.OK, (await WriteAsync(pm.Client, op, f, remaining, deleted: new[] { "pm-b1" }, force: true)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await WriteAsync(pm.Client, op, f, remaining, deleted: new[] { "pm-b1" }, force: true)).StatusCode); // duplicate replay

        Assert.Single(await AuditAsync(f), a => a.Action == "run_issue_deleted");
    }

    [Fact]
    public async Task A_completion_replayed_after_it_already_applied_does_not_duplicate_the_deletion_record()
    {
        var pm = await UserAsync("Project Manager");
        var f = await SeedAsync(PmBlocking(pm.Id));
        const string remaining = """[{"id":"o1","description":"Label","isBlocking":false,"resolved":false}]""";

        Assert.Equal(HttpStatusCode.OK, (await WriteAsync(pm.Client, Op.SyncBundle, f, remaining, deleted: new[] { "pm-b1" }, force: true)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await WriteAsync(pm.Client, Op.Complete, f, remaining, deleted: new[] { "pm-b1" }, force: true)).StatusCode); // forced re-apply onto the locked run

        Assert.Single(await AuditAsync(f), a => a.Action == "run_issue_deleted");
    }

    [Fact]
    public async Task Repeated_identical_refusals_from_offline_retries_are_recorded_once_but_a_different_refusal_is_recorded()
    {
        var pm = await UserAsync("Project Manager");
        var installer = await UserAsync("Installer");
        var f = await SeedAsync(PmBlocking(pm.Id).Replace("]", """,{"id":"pm-b2","isBlocking":true,"resolved":false}]"""));

        for (var i = 0; i < 3; i++)
            Assert.Equal(HttpStatusCode.UnprocessableEntity, (await WriteAsync(installer.Client, Op.Save, f, "[]", deleted: new[] { "pm-b1" }, force: true)).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await WriteAsync(installer.Client, Op.Save, f, "[]", deleted: new[] { "pm-b2" }, force: true)).StatusCode);

        var refusals = (await AuditAsync(f)).Where(a => a.Action == "run_issue_change_refused").ToArray();
        Assert.Equal(2, refusals.Length);
        Assert.All(refusals, r => Assert.Equal(installer.Id, r.UserId));
        Assert.Contains(refusals, r => r.Details!.EndsWith("refused=pm-b1"));
        Assert.Contains(refusals, r => r.Details!.EndsWith("refused=pm-b2"));
    }

    // ── 6: a refused delete/downgrade can't partially mutate the run or asset ───────

    [Theory]
    [InlineData(Op.Save, "delete")]
    [InlineData(Op.Save, "downgrade")]
    [InlineData(Op.Complete, "delete")]
    [InlineData(Op.SyncBundle, "downgrade")]
    [InlineData(Op.Patch, "delete")]
    [InlineData(Op.Patch, "downgrade")]
    public async Task A_request_mixing_allowed_changes_with_a_refused_one_changes_nothing(Op op, string refused)
    {
        var pm = await UserAsync("Project Manager");
        var installer = await UserAsync("Installer");
        var f = await SeedAsync(PmBlocking(pm.Id));
        var before = await StateAsync(f);
        // Allowed parts: a new issue, deleting the non-blocking o1, new step results / status (save).
        // Refused part: deleting or downgrading the PM's open blocking issue.
        var issues = refused == "downgrade"
            ? """[{"id":"pm-b1","description":"Earth fault","isBlocking":false,"resolved":false,"severity":"low"},{"id":"n1","description":"new","isBlocking":false,"resolved":false}]"""
            : """[{"id":"n1","description":"new","isBlocking":false,"resolved":false}]""";
        var deleted = refused == "delete" ? new[] { "o1", "pm-b1" } : new[] { "o1" };

        var resp = await WriteAsync(installer.Client, op, f, issues, deleted, force: true);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, resp.StatusCode);
        Assert.Equal(before, await StateAsync(f));
        var audit = await AuditAsync(f);
        Assert.DoesNotContain(audit, a => a.Action is "run_issue_deleted" or "run_issue_downgraded");
        Assert.Equal("run_issue_change_refused", Assert.Single(audit).Action);
    }

    // ── 7: valid sync and resolution are unaffected ────────────────────────────────

    [Fact]
    public async Task A_valid_offline_replay_that_resolves_the_issue_completes_with_no_change_audit()
    {
        var pm = await UserAsync("Project Manager");
        var installer = await UserAsync("Installer");
        var f = await SeedAsync(PmBlocking(pm.Id));
        const string resolved = """[{"id":"pm-b1","description":"Earth fault","isBlocking":true,"resolved":true,"resolutionNote":"fixed"},{"id":"o1","description":"Label","isBlocking":false,"resolved":true}]""";

        var resp = await WriteAsync(installer.Client, Op.SyncBundle, f, resolved, force: true);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Contains("run:Complete|True|", await StateAsync(f));
        Assert.Empty(await AuditAsync(f)); // resolving isn't a deletion or downgrade
        using var scope = _factory.Services.CreateScope();
        var run = await scope.ServiceProvider.GetRequiredService<AppDbContext>().AssetWorkflowRuns.AsNoTracking().FirstAsync(r => r.Id == f.RunId);
        var issue = ((JsonArray)JsonNode.Parse(run.IssuesJson)!).OfType<JsonObject>().First(o => (string?)o["id"] == "pm-b1");
        Assert.True((bool)issue["resolved"]!);
    }
}
