using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;
using Commtrac.Api.Authorization;
using Commtrac.Api.Controllers;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// Customer-signature waivers (run → "WaivedCustomer") are limited to Admin / Project Manager or a
/// member of that project's team / its named project manager — relationships only Admin/PM can set.
/// Asset assignment and run technician are NOT enough on their own: non-privileged users can set
/// both (assignment "takeover", client-supplied technician id at run start), and these tests prove
/// that path cannot be used to grant oneself a waiver. Covers both server paths that waive on
/// request: POST asset-workflow-runs/{id}/waive-customer-signature and the INSPECTION_ONLY
/// auto-complete in POST inspection-imports. Users log in for real, so JWT role/id claims are
/// exercised as in production.
/// </summary>
[Collection(ApiTestCollection.Name)]
public class CustomerWaiverAuthorizationTests : IClassFixture<ApiTestFactory>
{
    private const string Password = "Waiver-Test-Passw0rd!";
    private const string BlockingOpen = """[{"id":"b1","description":"Earth fault","issueType":"blocking","severity":"high","isBlocking":true,"resolved":false,"reportedAt":"2026-10-20T01:00:00Z"}]""";
    private const string BlockingResolved = """[{"id":"b1","description":"Earth fault","issueType":"blocking","severity":"high","isBlocking":true,"resolved":true,"reportedAt":"2026-10-20T01:00:00Z"}]""";
    private readonly ApiTestFactory _factory;

    public CustomerWaiverAuthorizationTests(ApiTestFactory factory) => _factory = factory;

    private sealed record Fixture(string ProjectId, string AssetId, string RunId, string ConfigId);

    private static string N() => Guid.NewGuid().ToString("N");

    private async Task<string> SeedUserAsync(string role)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var user = new UserEntity
        {
            Id = N(), Email = $"waiver-{role.Replace(' ', '-').ToLowerInvariant()}-{N()[..8]}@example.test",
            FullName = $"Waiver Test {role}", Role = role, Office = "Test Office", IsActive = true, IsFirstLogin = false,
            PasswordChangedAt = DateTime.UtcNow, PasswordHash = BCrypt.Net.BCrypt.HashPassword(Password),
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user.Id;
    }

    private async Task<HttpClient> ClientAsAsync(string userId)
    {
        string email;
        using (var scope = _factory.Services.CreateScope())
        {
            email = (await scope.ServiceProvider.GetRequiredService<AppDbContext>().Users.FindAsync(userId))!.Email;
        }
        var client = _factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/auth/login", new { email, password = Password });
        resp.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", doc.RootElement.GetProperty("token").GetString());
        return client;
    }

    private async Task<Fixture> SeedAsync(
        string workflowMode = "INSTALLATION_ONLY", bool locked = true, string signatureStatus = "PendingCustomer",
        string? assignedUserId = null, string? technicianUserId = null, string? projectManager = null, string[]? teamMemberIds = null,
        string runIssuesJson = "[]", string assetIssuesJson = "[]", bool assetDeleted = false, bool projectDeleted = false,
        bool orphanRun = false)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var now = DateTime.UtcNow;
        var f = new Fixture(N(), N(), N(), N());
        var productId = N();
        db.Projects.Add(new ProjectEntity
        {
            Id = f.ProjectId, CustomerName = "Waiver Customer", CustomerId = "cust-waiver", JobNumber = $"JW{N()[..6]}",
            Description = "waiver authz fixture", StartDate = "2026-01-01", FinishDate = "2026-12-31", Office = "Test Office",
            Status = "Active", WorkflowMode = workflowMode, IsInstallationProject = workflowMode != "INSPECTION_ONLY",
            ProjectManager = projectManager, TeamMemberIdsJson = JsonSerializer.Serialize(teamMemberIds ?? Array.Empty<string>()),
            IsDeleted = projectDeleted, DeletedAtUtc = projectDeleted ? now : null,
        });
        db.WorkflowConfigs.Add(new WorkflowConfigEntity
        {
            Id = f.ConfigId, ProductId = productId, Name = "Waiver Config", Status = "Published", Version = 1,
            StepsJson = "[]", MediaJson = "[]", FeatureSelectionsJson = "[]", CreatedAt = now, UpdatedAt = now,
        });
        db.ProjectAssets.Add(new ProjectAssetEntity
        {
            Id = f.AssetId, ProjectId = f.ProjectId, ProductId = productId, AssetTag = $"WV-{N()[..4]}", Status = "Complete",
            AssignedUserId = assignedUserId, IssuesJson = assetIssuesJson, IsDeleted = assetDeleted, DeletedAtUtc = assetDeleted ? now : null,
        });
        db.AssetWorkflowRuns.Add(new AssetWorkflowRunEntity
        {
            Id = f.RunId, AssetId = orphanRun ? N() : f.AssetId, WorkflowConfigId = f.ConfigId, WorkflowVersion = 1, WorkflowSnapshotJson = "{}",
            Status = locked ? "Complete" : "InProgress", IsLocked = locked, SignatureStatus = signatureStatus,
            StepResultsJson = "[]", IssuesJson = runIssuesJson, TimeTrackingJson = "[]", RunNumber = 1, TechnicianUserId = technicianUserId,
            StartedAt = now, CompletedAt = locked ? now : null, CreatedAt = now, UpdatedAt = now,
        });
        await db.SaveChangesAsync();
        return f;
    }

    /// <summary>Everything a waiver could change, plus audit rows and notifications, for before/after comparison.</summary>
    private sealed record Snapshot(string RunState, string AssetState, string ProjectState, int RunCount, int Notifications, AuditLogEntity[] Audit)
    {
        public AssetWorkflowRunEntity? Run { get; init; }
    }

    private async Task<Snapshot> SnapshotAsync(Fixture f)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var run = await db.AssetWorkflowRuns.AsNoTracking().FirstAsync(r => r.Id == f.RunId);
        var asset = await db.ProjectAssets.IgnoreQueryFilters().AsNoTracking().FirstAsync(a => a.Id == f.AssetId);
        var project = await db.Projects.IgnoreQueryFilters().AsNoTracking().FirstAsync(p => p.Id == f.ProjectId);
        var audit = await db.AuditLogs.AsNoTracking()
            .Where(a => a.Details != null && (a.Details.Contains($"asset={asset.AssetTag};") || a.Details.Contains($"run={f.RunId};")))
            .ToArrayAsync();
        return new Snapshot(
            $"{run.Status}|{run.IsLocked}|{run.SignatureStatus}|{run.CompletedAt:O}|{run.UpdatedAt:O}|{run.IssuesJson}|{run.TechnicianUserId}",
            $"{asset.Status}|{asset.AssignedUserId}|{asset.IssuesJson}|{asset.UpdatedAt:O}",
            $"{project.Status}|{project.ProjectManager}|{project.TeamMemberIdsJson}",
            await db.AssetWorkflowRuns.CountAsync(r => r.AssetId == f.AssetId),
            await db.NotificationInbox.CountAsync(),
            audit) { Run = run };
    }

    private static void AssertOnlyDenialAudited(Snapshot before, Snapshot after, string actorId)
    {
        Assert.Equal(before.RunState, after.RunState);
        Assert.Equal(before.AssetState, after.AssetState);
        Assert.Equal(before.ProjectState, after.ProjectState);
        Assert.Equal(before.RunCount, after.RunCount);
        Assert.Equal(before.Notifications, after.Notifications);
        var added = after.Audit.Where(a => before.Audit.All(b => b.Id != a.Id)).ToArray();
        var row = Assert.Single(added);
        Assert.Equal(CustomerWaiverPolicy.DeniedAction, row.Action);
        Assert.Equal(actorId, row.UserId);
    }

    private static Task<HttpResponseMessage> WaiveAsync(HttpClient client, Fixture f, string? reason = null) =>
        reason is null
            ? client.PostAsync($"/api/asset-workflow-runs/{f.RunId}/waive-customer-signature", null) // what the app sends today
            : client.PostAsJsonAsync($"/api/asset-workflow-runs/{f.RunId}/waive-customer-signature", new { reason });

    // ── explicit waiver endpoint: unrelated users ───────────────────────────────────

    [Theory]
    [InlineData("Installer")]
    [InlineData("Viewer")]
    [InlineData("Supervisor")]
    public async Task Unrelated_non_privileged_user_gets_403_and_nothing_but_an_audit_row_changes(string role)
    {
        var user = await SeedUserAsync(role);
        var f = await SeedAsync(assignedUserId: await SeedUserAsync("Installer"), teamMemberIds: new[] { N() });
        var before = await SnapshotAsync(f);

        var resp = await WaiveAsync(await ClientAsAsync(user), f, "trying");

        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
        AssertOnlyDenialAudited(before, await SnapshotAsync(f), user);
    }

    [Fact]
    public async Task Unauthenticated_waiver_is_rejected_without_any_change()
    {
        var f = await SeedAsync();
        var before = await SnapshotAsync(f);
        Assert.Equal(HttpStatusCode.Unauthorized, (await WaiveAsync(_factory.CreateClient(), f)).StatusCode);
        var after = await SnapshotAsync(f);
        Assert.Equal(before.RunState, after.RunState);
        Assert.Equal(before.Audit.Length, after.Audit.Length);
    }

    [Fact]
    public async Task Unauthorized_caller_learns_nothing_about_run_state()
    {
        var installer = await SeedUserAsync("Installer");
        var unlocked = await SeedAsync(locked: false, signatureStatus: "None");
        // Without the authorization-first ordering this would be 400 "Run must be completed…".
        Assert.Equal(HttpStatusCode.Forbidden, (await WaiveAsync(await ClientAsAsync(installer), unlocked)).StatusCode);
    }

    // ── privilege escalation: self-grantable relationships do not authorize a waiver ──

    [Theory]
    [InlineData("Installer")]
    [InlineData("Viewer")]
    [InlineData("Supervisor")]
    public async Task Taking_over_the_asset_assignment_does_not_grant_a_waiver(string role)
    {
        var user = await SeedUserAsync(role);
        var f = await SeedAsync(assignedUserId: await SeedUserAsync("Installer"));
        var client = await ClientAsAsync(user);

        // The takeover itself is an intended field feature and still works…
        var claim = await client.PatchAsJsonAsync($"/api/project-assets/{f.AssetId}/assignment", new { assignedUserId = user });
        Assert.Equal(HttpStatusCode.OK, claim.StatusCode);
        var before = await SnapshotAsync(f);
        Assert.Contains($"|{user}|", before.AssetState);

        // …but being the assignee is not enough to waive the customer signature.
        Assert.Equal(HttpStatusCode.Forbidden, (await WaiveAsync(client, f)).StatusCode);
        AssertOnlyDenialAudited(before, await SnapshotAsync(f), user);
    }

    [Fact]
    public async Task Naming_yourself_technician_on_a_new_run_does_not_grant_a_waiver()
    {
        var installer = await SeedUserAsync("Installer");
        var f = await SeedAsync();
        var client = await ClientAsAsync(installer);

        var start = await client.PostAsJsonAsync("/api/asset-workflow-runs",
            new { assetId = f.AssetId, workflowConfigId = f.ConfigId, technicianUserId = installer });
        Assert.True(start.IsSuccessStatusCode, $"run start returned {(int)start.StatusCode}");
        var before = await SnapshotAsync(f);

        Assert.Equal(HttpStatusCode.Forbidden, (await WaiveAsync(client, f)).StatusCode);
        AssertOnlyDenialAudited(before, await SnapshotAsync(f), installer);
    }

    [Fact]
    public async Task Being_recorded_as_the_run_technician_is_not_enough_on_its_own()
    {
        var installer = await SeedUserAsync("Installer");
        var f = await SeedAsync(technicianUserId: installer, assignedUserId: installer);
        var before = await SnapshotAsync(f);
        Assert.Equal(HttpStatusCode.Forbidden, (await WaiveAsync(await ClientAsAsync(installer), f)).StatusCode);
        AssertOnlyDenialAudited(before, await SnapshotAsync(f), installer);
    }

    [Theory]
    [InlineData("Installer")]
    [InlineData("Viewer")]
    [InlineData("Supervisor")]
    public async Task Cannot_add_yourself_to_the_project_team_or_make_yourself_its_manager(string role)
    {
        var user = await SeedUserAsync(role);
        var f = await SeedAsync();
        var client = await ClientAsAsync(user);
        var project = await (await client.GetAsync($"/api/projects/{f.ProjectId}")).Content.ReadFromJsonAsync<JsonElement>();
        var edited = JsonSerializer.Deserialize<System.Collections.Generic.Dictionary<string, object?>>(project.GetRawText())!;
        edited["teamMemberIds"] = new[] { user };
        edited["projectManager"] = user;
        // (GET /api/projects/{id} itself re-derives the project status from its assets — existing
        // behaviour — so compare against a snapshot taken after it.)
        var before = await SnapshotAsync(f);

        var put = await client.PutAsJsonAsync($"/api/projects/{f.ProjectId}", edited);

        Assert.Equal(HttpStatusCode.Forbidden, put.StatusCode);
        var after = await SnapshotAsync(f);
        Assert.Equal(before.ProjectState, after.ProjectState);
        Assert.EndsWith("||[]", after.ProjectState); // still no project manager, no team members
        Assert.Equal(HttpStatusCode.Forbidden, (await WaiveAsync(client, f)).StatusCode);
    }

    // ── legitimate users ─────────────────────────────────────────────────────────────

    public enum Relation { TeamMember, ProjectManagerField, TeamMemberAlsoAssignedAndTechnician }

    [Theory]
    [InlineData(Relation.TeamMember)]
    [InlineData(Relation.ProjectManagerField)]
    [InlineData(Relation.TeamMemberAlsoAssignedAndTechnician)]
    public async Task Installer_on_the_project_can_waive(Relation relation)
    {
        var installer = await SeedUserAsync("Installer");
        var f = relation switch
        {
            Relation.TeamMember => await SeedAsync(teamMemberIds: new[] { N(), installer }),
            Relation.ProjectManagerField => await SeedAsync(projectManager: installer),
            _ => await SeedAsync(teamMemberIds: new[] { installer }, assignedUserId: installer, technicianUserId: installer),
        };

        var resp = await WaiveAsync(await ClientAsAsync(installer), f); // no body, as the current clients send

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var after = await SnapshotAsync(f);
        Assert.Equal("WaivedCustomer", after.Run!.SignatureStatus);
        var row = Assert.Single(after.Audit);
        Assert.Equal(CustomerWaiverPolicy.WaivedAction, row.Action);
        Assert.Equal(installer, row.UserId);
        Assert.Contains("reason=(none given)", row.Details);
    }

    [Theory]
    [InlineData("Admin")]
    [InlineData("Project Manager")]
    public async Task Privileged_roles_can_waive_any_live_asset_and_the_reason_is_audited(string role)
    {
        var user = await SeedUserAsync(role);
        var f = await SeedAsync();
        var before = DateTime.UtcNow.AddSeconds(-5);

        var resp = await WaiveAsync(await ClientAsAsync(user), f, "Customer unavailable on site; PM approved");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var after = await SnapshotAsync(f);
        Assert.Equal("WaivedCustomer", after.Run!.SignatureStatus);
        var row = Assert.Single(after.Audit);
        Assert.Equal(CustomerWaiverPolicy.WaivedAction, row.Action);
        Assert.Equal(user, row.UserId);
        Assert.EndsWith("@example.test", row.UserEmail);
        Assert.Contains("reason=Customer unavailable on site; PM approved", row.Details);
        Assert.Contains($"run={f.RunId}", row.Details);
        Assert.True(row.Timestamp >= before && row.Timestamp <= DateTime.UtcNow.AddSeconds(5));
    }

    [Fact]
    public async Task Reason_longer_than_300_characters_is_rejected_and_nothing_changes()
    {
        var pm = await SeedUserAsync("Project Manager");
        var f = await SeedAsync();
        var before = await SnapshotAsync(f);
        Assert.Equal(HttpStatusCode.BadRequest, (await WaiveAsync(await ClientAsAsync(pm), f, new string('x', 301))).StatusCode);
        var after = await SnapshotAsync(f);
        Assert.Equal(before.RunState, after.RunState);
        Assert.Equal(before.AssetState, after.AssetState);
    }

    [Fact]
    public async Task Authorized_caller_still_gets_the_existing_state_checks()
    {
        var pm = await SeedUserAsync("Project Manager");
        var client = await ClientAsAsync(pm);
        Assert.Equal(HttpStatusCode.BadRequest, (await WaiveAsync(client, await SeedAsync(locked: false, signatureStatus: "None"))).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await WaiveAsync(client, await SeedAsync(signatureStatus: "Signed"))).StatusCode);
    }

    // ── missing / deleted relationships: refused for every role, no override ─────────

    public enum Broken { AssetDeleted, ProjectDeleted, OrphanRun }

    [Theory]
    [InlineData(Broken.AssetDeleted, "Admin")]
    [InlineData(Broken.ProjectDeleted, "Project Manager")]
    [InlineData(Broken.OrphanRun, "Admin")]
    public async Task Privileged_users_cannot_waive_when_the_asset_or_project_is_missing_or_deleted(Broken broken, string role)
    {
        var user = await SeedUserAsync(role);
        var f = await SeedAsync(assetDeleted: broken == Broken.AssetDeleted, projectDeleted: broken == Broken.ProjectDeleted, orphanRun: broken == Broken.OrphanRun);
        var before = await SnapshotAsync(f);

        var resp = await WaiveAsync(await ClientAsAsync(user), f);

        Assert.Equal(HttpStatusCode.Conflict, resp.StatusCode);
        var after = await SnapshotAsync(f);
        Assert.Equal(before.RunState, after.RunState);
        Assert.Equal(before.AssetState, after.AssetState);
    }

    [Theory]
    [InlineData(Broken.AssetDeleted)]
    [InlineData(Broken.ProjectDeleted)]
    public async Task Team_members_cannot_waive_when_the_asset_or_project_is_deleted(Broken broken)
    {
        var installer = await SeedUserAsync("Installer");
        var f = await SeedAsync(teamMemberIds: new[] { installer }, assetDeleted: broken == Broken.AssetDeleted, projectDeleted: broken == Broken.ProjectDeleted);
        var before = await SnapshotAsync(f);
        Assert.Equal(HttpStatusCode.Forbidden, (await WaiveAsync(await ClientAsAsync(installer), f)).StatusCode);
        Assert.Equal(before.RunState, (await SnapshotAsync(f)).RunState);
    }

    // ── inspection-import auto-complete (also sets WaivedCustomer) ───────────────────

    private static Task<HttpResponseMessage> ImportAsync(HttpClient client, Fixture f) =>
        client.PostAsJsonAsync("/api/inspection-imports", new { source = "LOCAL", fileName = "x.json", projectId = f.ProjectId, assetId = f.AssetId });

    [Theory]
    [InlineData(false)] // unrelated
    [InlineData(true)]  // only assigned to the asset (self-grantable) — still not enough
    public async Task Import_by_a_user_not_on_the_project_does_not_complete_or_waive(bool assigned)
    {
        var installer = await SeedUserAsync("Installer");
        var f = await SeedAsync(workflowMode: "INSPECTION_ONLY", locked: false, signatureStatus: "None", assignedUserId: assigned ? installer : null);
        var before = await SnapshotAsync(f);

        var resp = await ImportAsync(await ClientAsAsync(installer), f);

        Assert.Equal(HttpStatusCode.Created, resp.StatusCode); // the import itself is still recorded for a PM to assign
        AssertOnlyDenialAudited(before, await SnapshotAsync(f), installer);
    }

    [Fact]
    public async Task Import_by_a_team_member_completes_and_waives_with_an_audit_row()
    {
        var installer = await SeedUserAsync("Installer");
        var f = await SeedAsync(workflowMode: "INSPECTION_ONLY", locked: false, signatureStatus: "None", teamMemberIds: new[] { installer }, runIssuesJson: BlockingResolved);

        var resp = await ImportAsync(await ClientAsAsync(installer), f);

        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        var after = await SnapshotAsync(f);
        Assert.True(after.Run!.IsLocked);
        Assert.Equal("WaivedCustomer", after.Run.SignatureStatus);
        var row = Assert.Single(after.Audit);
        Assert.Equal(CustomerWaiverPolicy.WaivedAction, row.Action);
        Assert.Contains("via=inspection-import:", row.Details);
    }

    [Theory]
    [InlineData("run")]
    [InlineData("asset")]
    public async Task Import_never_overwrites_an_unresolved_blocking_issue_even_for_a_project_manager(string where)
    {
        var pm = await SeedUserAsync("Project Manager");
        var f = await SeedAsync(workflowMode: "INSPECTION_ONLY", locked: false, signatureStatus: "None",
            runIssuesJson: where == "run" ? BlockingOpen : "[]", assetIssuesJson: where == "asset" ? BlockingOpen : "[]");
        var before = await SnapshotAsync(f);

        var resp = await ImportAsync(await ClientAsAsync(pm), f);

        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        var after = await SnapshotAsync(f);
        AssertOnlyDenialAudited(before, after, pm);
        Assert.Contains("unresolved blocking issue", after.Audit.Single(a => before.Audit.All(b => b.Id != a.Id)).Details);
    }

    [Theory]
    [InlineData(null, false)]
    [InlineData("", false)]
    [InlineData("[]", false)]
    [InlineData(BlockingResolved, false)]
    [InlineData("""[{"isBlocking":false,"resolved":false}]""", false)]
    [InlineData(BlockingOpen, true)]
    [InlineData("""[{"isBlocking":true}]""", true)]
    [InlineData("not json", true)]
    [InlineData("""{"isBlocking":true}""", true)]
    public void Blocking_issue_detection_is_conservative(string? json, bool expected) =>
        Assert.Equal(expected, InspectionImportsController.HasOpenBlockingIssue(json));
}
