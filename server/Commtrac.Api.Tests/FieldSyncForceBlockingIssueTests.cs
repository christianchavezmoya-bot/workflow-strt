using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// "X-Field-Sync: force" (or ?fieldSync=force) is how the phone's offline sync engine replays
/// queued work with phone-wins semantics. It is client-asserted, so it must not let a run be
/// completed with an unresolved blocking issue — on the per-op POST /complete or the batched
/// POST /sync-bundle. The legitimate offline behaviours it exists for (re-applying to an
/// already-locked run, skipping the required-media gate, replaying a run whose blocking issue
/// was resolved) keep working. A rejected replay is 422, which the sync engine retries while
/// keeping the phone's data, and is audited.
/// </summary>
[Collection(ApiTestCollection.Name)]
public class FieldSyncForceBlockingIssueTests : IClassFixture<ApiTestFactory>
{
    private const string Password = "FieldSync-Test-Passw0rd!";
    private const string OpenBlocking = """[{"id":"b1","description":"Earth fault","issueType":"blocking","severity":"high","isBlocking":true,"resolved":false,"reportedAt":"2026-10-20T01:00:00Z"}]""";
    private const string ResolvedBlocking = """[{"id":"b1","description":"Earth fault","issueType":"blocking","severity":"high","isBlocking":true,"resolved":true,"resolvedNote":"re-terminated","reportedAt":"2026-10-20T01:00:00Z"}]""";
    private const string OpenObservation = """[{"id":"o1","description":"Label faded","issueType":"observation","severity":"low","isBlocking":false,"resolved":false,"reportedAt":"2026-10-20T01:00:00Z"}]""";
    // Step s1 has a text input and a REQUIRED photo; the step results below never include the photo.
    private static readonly string Snapshot = JsonSerializer.Serialize(new
    {
        name = "Field sync fixture",
        stepsJson = JsonSerializer.Serialize(new[]
        {
            new { id = "s1", order = 1, title = "Check", inputs = new object[]
            {
                new { id = "t1", label = "Reading", type = "text", required = true },
                new { id = "p1", label = "Meter photo", type = "photo", required = true },
            } },
        }),
    });
    private const string StepResults = """[{"stepId":"s1","values":{"t1":"512"},"completedAt":"2026-10-20T02:00:00Z"}]""";

    private readonly ApiTestFactory _factory;
    public FieldSyncForceBlockingIssueTests(ApiTestFactory factory) => _factory = factory;

    private static string N() => Guid.NewGuid().ToString("N");

    private async Task<HttpClient> InstallerClientAsync()
    {
        string email;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var user = new UserEntity
            {
                Id = N(), Email = $"fieldsync-{N()[..8]}@example.test", FullName = "Field Sync Installer", Role = "Installer",
                Office = "Test Office", IsActive = true, IsFirstLogin = false, PasswordChangedAt = DateTime.UtcNow,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(Password),
            };
            db.Users.Add(user);
            await db.SaveChangesAsync();
            email = user.Email;
        }
        var client = _factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/auth/login", new { email, password = Password });
        resp.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", doc.RootElement.GetProperty("token").GetString());
        return client;
    }

    private async Task<string> SeedRunAsync(bool locked = false, string issuesJson = "[]")
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var now = DateTime.UtcNow;
        var (projectId, assetId, runId) = (N(), N(), N());
        db.Projects.Add(new ProjectEntity
        {
            Id = projectId, CustomerName = "Field Sync Customer", CustomerId = "cust-fs", JobNumber = $"JF{N()[..6]}",
            Description = "field sync fixture", StartDate = "2026-01-01", FinishDate = "2026-12-31", Office = "Test Office",
            Status = "Active", WorkflowMode = "INSTALLATION_ONLY", IsInstallationProject = true,
        });
        db.ProjectAssets.Add(new ProjectAssetEntity { Id = assetId, ProjectId = projectId, ProductId = N(), AssetTag = $"FS-{N()[..4]}", Status = "In Progress" });
        db.AssetWorkflowRuns.Add(new AssetWorkflowRunEntity
        {
            Id = runId, AssetId = assetId, WorkflowConfigId = N(), WorkflowVersion = 1, WorkflowSnapshotJson = Snapshot,
            Status = locked ? "Complete" : "InProgress", IsLocked = locked, SignatureStatus = locked ? "PendingInstaller" : "None",
            StepResultsJson = locked ? StepResults : "[]", IssuesJson = issuesJson, TimeTrackingJson = "[]", RunNumber = 1,
            StartedAt = now, CompletedAt = locked ? now : null, CreatedAt = now, UpdatedAt = now,
        });
        await db.SaveChangesAsync();
        return runId;
    }

    private async Task<(AssetWorkflowRunEntity Run, int ForceRejectAudits)> ReadAsync(string runId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var run = await db.AssetWorkflowRuns.AsNoTracking().FirstAsync(r => r.Id == runId);
        var audits = await db.AuditLogs.CountAsync(a => a.Action == "field_sync_force_blocking_rejected" && a.Details!.Contains($"run={runId};"));
        return (run, audits);
    }

    private static string State(AssetWorkflowRunEntity r) => $"{r.Status}|{r.IsLocked}|{r.SignatureStatus}|{r.IssuesJson}|{r.StepResultsJson}|{r.UpdatedAt:O}";

    public enum Force { None, Header, QueryString }

    private static HttpRequestMessage Complete(string runId, string issuesJson, Force force)
    {
        var url = $"/api/asset-workflow-runs/{runId}/complete" + (force == Force.QueryString ? "?fieldSync=force" : "");
        var req = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = JsonContent.Create(new { stepResultsJson = StepResults, issuesJson, completedByName = "Field Tech", completedAtUtc = "2026-10-20T03:00:00Z" }),
        };
        if (force == Force.Header) req.Headers.Add("X-Field-Sync", "force");
        return req;
    }

    private static HttpRequestMessage Bundle(string runId, string issuesJson, Force force)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, $"/api/asset-workflow-runs/{runId}/sync-bundle")
        {
            Content = JsonContent.Create(new { stepResultsJson = StepResults, issuesJson, completedByName = "Field Tech", completedAtUtc = "2026-10-20T03:00:00Z", idempotencyKey = N() }),
        };
        if (force == Force.Header) req.Headers.Add("X-Field-Sync", "force");
        return req;
    }

    // ── the bypass is closed ─────────────────────────────────────────────────────────

    [Theory]
    [InlineData(Force.Header)]
    [InlineData(Force.QueryString)]
    public async Task Forced_complete_with_an_unresolved_blocking_issue_is_422_and_changes_nothing(Force force)
    {
        var client = await InstallerClientAsync();
        var runId = await SeedRunAsync();
        var before = State((await ReadAsync(runId)).Run);

        var resp = await client.SendAsync(Complete(runId, OpenBlocking, force));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, resp.StatusCode); // 422 → the phone keeps and retries its queued work
        Assert.Contains("blocking", await resp.Content.ReadAsStringAsync());
        var (run, audits) = await ReadAsync(runId);
        Assert.Equal(before, State(run));
        Assert.Equal(1, audits);
    }

    [Fact]
    public async Task Forced_sync_bundle_with_an_unresolved_blocking_issue_is_422_and_changes_nothing()
    {
        var client = await InstallerClientAsync();
        var runId = await SeedRunAsync();
        var before = State((await ReadAsync(runId)).Run);

        var resp = await client.SendAsync(Bundle(runId, OpenBlocking, Force.Header));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, resp.StatusCode);
        var (run, audits) = await ReadAsync(runId);
        Assert.Equal(before, State(run));
        Assert.Equal(1, audits);
    }

    [Fact]
    public async Task Forced_reapply_onto_a_locked_run_cannot_introduce_an_unresolved_blocking_issue()
    {
        var client = await InstallerClientAsync();
        var runId = await SeedRunAsync(locked: true);
        var before = State((await ReadAsync(runId)).Run);

        var resp = await client.SendAsync(Complete(runId, OpenBlocking, Force.Header));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, resp.StatusCode);
        Assert.Equal(before, State((await ReadAsync(runId)).Run));
    }

    [Fact]
    public async Task Without_the_header_the_existing_422_is_unchanged_and_not_audited_as_a_forced_attempt()
    {
        var client = await InstallerClientAsync();
        var runId = await SeedRunAsync();
        var resp = await client.SendAsync(Complete(runId, OpenBlocking, Force.None));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, resp.StatusCode);
        var (run, audits) = await ReadAsync(runId);
        Assert.False(run.IsLocked);
        Assert.Equal(0, audits);
    }

    // ── legitimate offline replay keeps working ─────────────────────────────────────

    [Theory]
    [InlineData("resolved blocking issue")]
    [InlineData("open non-blocking issue")]
    [InlineData("no issues")]
    public async Task Forced_replay_of_a_valid_offline_completion_is_accepted_and_keeps_the_phones_issues(string which)
    {
        var issues = which switch { "resolved blocking issue" => ResolvedBlocking, "open non-blocking issue" => OpenObservation, _ => "[]" };
        var client = await InstallerClientAsync();
        var runId = await SeedRunAsync();

        var resp = await client.SendAsync(Complete(runId, issues, Force.Header));

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var (run, audits) = await ReadAsync(runId);
        Assert.True(run.IsLocked);
        Assert.Equal(issues, run.IssuesJson);
        Assert.Equal(0, audits);
    }

    [Fact]
    public async Task Forced_replay_still_skips_the_required_media_gate_so_offline_work_is_not_rejected()
    {
        var client = await InstallerClientAsync();
        // The fixture really trips the media rule without the header…
        var plain = await SeedRunAsync();
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.SendAsync(Complete(plain, "[]", Force.None))).StatusCode);
        // …and the offline replay is still exempt from it (unchanged behaviour).
        var forced = await SeedRunAsync();
        Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(Complete(forced, "[]", Force.Header))).StatusCode);
    }

    [Fact]
    public async Task Forced_reapply_onto_an_already_locked_run_still_wins_when_it_is_valid()
    {
        var client = await InstallerClientAsync();
        var runId = await SeedRunAsync(locked: true, issuesJson: "[]");
        var resp = await client.SendAsync(Complete(runId, OpenObservation, Force.Header));
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal(OpenObservation, (await ReadAsync(runId)).Run.IssuesJson);
    }

    [Fact]
    public async Task Forced_sync_bundle_of_a_valid_offline_completion_is_accepted()
    {
        var client = await InstallerClientAsync();
        var runId = await SeedRunAsync();
        var resp = await client.SendAsync(Bundle(runId, ResolvedBlocking, Force.Header));
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var (run, _) = await ReadAsync(runId);
        Assert.True(run.IsLocked);
        Assert.Equal(ResolvedBlocking, run.IssuesJson);
    }

    [Fact]
    public async Task A_rejected_replay_succeeds_once_the_phone_resolves_the_issue_and_retries()
    {
        var client = await InstallerClientAsync();
        var runId = await SeedRunAsync();
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.SendAsync(Complete(runId, OpenBlocking, Force.Header))).StatusCode);
        // The sync engine kept the queued action; after the issue is resolved locally the retry carries it resolved.
        Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(Complete(runId, ResolvedBlocking, Force.Header))).StatusCode);
        Assert.True((await ReadAsync(runId)).Run.IsLocked);
    }
}
