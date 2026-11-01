using System;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;
using Commtrac.Api.Authorization;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// Customer-signature waivers (run → "WaivedCustomer") are limited to Admin / Project Manager or a
/// user connected to that asset (assigned user, run technician, project manager, team member).
/// Covers both server paths that waive on request: POST asset-workflow-runs/{id}/waive-customer-signature
/// and the INSPECTION_ONLY auto-complete in POST inspection-imports. Users log in for real, so the
/// JWT role / id claims are exercised as in production.
/// </summary>
[Collection(ApiTestCollection.Name)]
public class CustomerWaiverAuthorizationTests : IClassFixture<ApiTestFactory>
{
    private const string Password = "Waiver-Test-Passw0rd!";
    private readonly ApiTestFactory _factory;

    public CustomerWaiverAuthorizationTests(ApiTestFactory factory) => _factory = factory;

    private sealed record Fixture(string ProjectId, string AssetId, string RunId);

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
        string? assignedUserId = null, string? technicianUserId = null, string? projectManager = null, string[]? teamMemberIds = null)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var now = DateTime.UtcNow;
        var f = new Fixture(N(), N(), N());
        db.Projects.Add(new ProjectEntity
        {
            Id = f.ProjectId, CustomerName = "Waiver Customer", CustomerId = "cust-waiver", JobNumber = $"JW{N()[..6]}",
            Description = "waiver authz fixture", StartDate = "2026-01-01", FinishDate = "2026-12-31", Office = "Test Office",
            Status = "Active", WorkflowMode = workflowMode, IsInstallationProject = workflowMode != "INSPECTION_ONLY",
            ProjectManager = projectManager, TeamMemberIdsJson = JsonSerializer.Serialize(teamMemberIds ?? Array.Empty<string>()),
        });
        db.ProjectAssets.Add(new ProjectAssetEntity
        {
            Id = f.AssetId, ProjectId = f.ProjectId, ProductId = N(), AssetTag = $"WV-{N()[..4]}", Status = "Complete", AssignedUserId = assignedUserId,
        });
        db.AssetWorkflowRuns.Add(new AssetWorkflowRunEntity
        {
            Id = f.RunId, AssetId = f.AssetId, WorkflowConfigId = N(), WorkflowVersion = 1, WorkflowSnapshotJson = "{}",
            Status = locked ? "Complete" : "InProgress", IsLocked = locked, SignatureStatus = signatureStatus,
            StepResultsJson = "[]", IssuesJson = "[]", TimeTrackingJson = "[]", RunNumber = 1, TechnicianUserId = technicianUserId,
            StartedAt = now, CompletedAt = locked ? now : null, CreatedAt = now, UpdatedAt = now,
        });
        await db.SaveChangesAsync();
        return f;
    }

    private async Task<(AssetWorkflowRunEntity Run, AuditLogEntity[] Audit)> ReadAsync(Fixture f)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var run = await db.AssetWorkflowRuns.AsNoTracking().FirstAsync(r => r.Id == f.RunId);
        var tag = (await db.ProjectAssets.AsNoTracking().FirstAsync(a => a.Id == f.AssetId)).AssetTag;
        var audit = await db.AuditLogs.AsNoTracking().Where(a => a.Details != null && a.Details.Contains($"asset={tag};")).ToArrayAsync();
        return (run, audit);
    }

    private static Task<HttpResponseMessage> WaiveAsync(HttpClient client, Fixture f, string? reason = null) =>
        reason is null
            ? client.PostAsync($"/api/asset-workflow-runs/{f.RunId}/waive-customer-signature", null) // what the app sends today
            : client.PostAsJsonAsync($"/api/asset-workflow-runs/{f.RunId}/waive-customer-signature", new { reason });

    // ── explicit waiver endpoint: negative ────────────────────────────────────────────

    [Fact]
    public async Task Installer_cannot_waive_an_unrelated_assets_customer_signature()
    {
        var installer = await SeedUserAsync("Installer");
        var f = await SeedAsync(assignedUserId: await SeedUserAsync("Installer"), teamMemberIds: new[] { N() });

        var resp = await WaiveAsync(await ClientAsAsync(installer), f, "trying");

        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
        var (run, audit) = await ReadAsync(f);
        Assert.Equal("PendingCustomer", run.SignatureStatus);
        var denied = Assert.Single(audit);
        Assert.Equal(CustomerWaiverPolicy.DeniedAction, denied.Action);
        Assert.Equal(installer, denied.UserId);
    }

    [Theory]
    [InlineData("Viewer")]
    [InlineData("Supervisor")]
    public async Task Other_non_privileged_roles_cannot_waive_unrelated_assets(string role)
    {
        var user = await SeedUserAsync(role);
        var f = await SeedAsync();
        var resp = await WaiveAsync(await ClientAsAsync(user), f);
        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
        Assert.Equal("PendingCustomer", (await ReadAsync(f)).Run.SignatureStatus);
    }

    [Fact]
    public async Task Unauthenticated_waiver_is_rejected()
    {
        var f = await SeedAsync();
        var resp = await WaiveAsync(_factory.CreateClient(), f);
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
        Assert.Equal("PendingCustomer", (await ReadAsync(f)).Run.SignatureStatus);
    }

    [Fact]
    public async Task Unauthorized_caller_learns_nothing_about_run_state()
    {
        var installer = await SeedUserAsync("Installer");
        var unlocked = await SeedAsync(locked: false, signatureStatus: "None");
        // Without the authorization-first ordering this would be 400 "Run must be completed…".
        Assert.Equal(HttpStatusCode.Forbidden, (await WaiveAsync(await ClientAsAsync(installer), unlocked)).StatusCode);
    }

    // ── explicit waiver endpoint: positive ────────────────────────────────────────────

    public enum Relation { AssignedToAsset, RunTechnician, ProjectManagerField, TeamMember }

    [Theory]
    [InlineData(Relation.AssignedToAsset)]
    [InlineData(Relation.RunTechnician)]
    [InlineData(Relation.ProjectManagerField)]
    [InlineData(Relation.TeamMember)]
    public async Task Installer_connected_to_the_work_can_waive(Relation relation)
    {
        var installer = await SeedUserAsync("Installer");
        var f = relation switch
        {
            Relation.AssignedToAsset => await SeedAsync(assignedUserId: installer),
            Relation.RunTechnician => await SeedAsync(technicianUserId: installer),
            Relation.ProjectManagerField => await SeedAsync(projectManager: installer),
            _ => await SeedAsync(teamMemberIds: new[] { N(), installer }),
        };

        var resp = await WaiveAsync(await ClientAsAsync(installer), f); // no body, as the current clients send

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var (run, audit) = await ReadAsync(f);
        Assert.Equal("WaivedCustomer", run.SignatureStatus);
        var row = Assert.Single(audit);
        Assert.Equal(CustomerWaiverPolicy.WaivedAction, row.Action);
        Assert.Equal(installer, row.UserId);
        Assert.Contains("reason=(none given)", row.Details);
    }

    [Theory]
    [InlineData("Admin")]
    [InlineData("Project Manager")]
    public async Task Privileged_roles_can_waive_any_asset_and_the_reason_is_audited(string role)
    {
        var user = await SeedUserAsync(role);
        var f = await SeedAsync();
        var before = DateTime.UtcNow.AddSeconds(-5);

        var resp = await WaiveAsync(await ClientAsAsync(user), f, "Customer unavailable on site; PM approved");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var (run, audit) = await ReadAsync(f);
        Assert.Equal("WaivedCustomer", run.SignatureStatus);
        var row = Assert.Single(audit);
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
        var resp = await WaiveAsync(await ClientAsAsync(pm), f, new string('x', 301));
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        Assert.Equal("PendingCustomer", (await ReadAsync(f)).Run.SignatureStatus);
    }

    [Fact]
    public async Task Authorized_caller_still_gets_the_existing_state_checks()
    {
        var pm = await SeedUserAsync("Project Manager");
        var client = await ClientAsAsync(pm);
        Assert.Equal(HttpStatusCode.BadRequest, (await WaiveAsync(client, await SeedAsync(locked: false, signatureStatus: "None"))).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await WaiveAsync(client, await SeedAsync(signatureStatus: "Signed"))).StatusCode);
    }

    // ── inspection-import auto-complete (also sets WaivedCustomer) ───────────────────

    private static Task<HttpResponseMessage> ImportAsync(HttpClient client, Fixture f) =>
        client.PostAsJsonAsync("/api/inspection-imports", new { source = "LOCAL", fileName = "x.json", projectId = f.ProjectId, assetId = f.AssetId });

    [Fact]
    public async Task Unrelated_installer_import_does_not_complete_or_waive_the_asset()
    {
        var installer = await SeedUserAsync("Installer");
        var f = await SeedAsync(workflowMode: "INSPECTION_ONLY", locked: false, signatureStatus: "None");

        var resp = await ImportAsync(await ClientAsAsync(installer), f);

        Assert.Equal(HttpStatusCode.Created, resp.StatusCode); // the import itself is still recorded for a PM to assign
        var (run, audit) = await ReadAsync(f);
        Assert.False(run.IsLocked);
        Assert.Equal("None", run.SignatureStatus);
        Assert.Equal(CustomerWaiverPolicy.DeniedAction, Assert.Single(audit).Action);
    }

    [Fact]
    public async Task Assigned_installer_import_completes_and_waives_as_before_with_an_audit_row()
    {
        var installer = await SeedUserAsync("Installer");
        var f = await SeedAsync(workflowMode: "INSPECTION_ONLY", locked: false, signatureStatus: "None", assignedUserId: installer);

        var resp = await ImportAsync(await ClientAsAsync(installer), f);

        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        var (run, audit) = await ReadAsync(f);
        Assert.True(run.IsLocked);
        Assert.Equal("WaivedCustomer", run.SignatureStatus);
        var row = Assert.Single(audit);
        Assert.Equal(CustomerWaiverPolicy.WaivedAction, row.Action);
        Assert.Equal(installer, row.UserId);
        Assert.Contains("via=inspection-import:", row.Details);
    }
}
