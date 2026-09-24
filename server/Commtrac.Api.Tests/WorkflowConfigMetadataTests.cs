using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using BCrypt.Net;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// Workflow metadata fix (Description/Notes + CreatedBy/CreatedAt) — the follow-up implementation
/// to the read-only workflow-metadata audit. Every test here drives the REAL HTTP endpoints
/// through a real, freshly-issued JWT (never a mocked ClaimsPrincipal), because the bug this fix
/// addresses is specifically about how WorkflowConfigsController resolves identity from the
/// actual token shape AuthController.CreateToken() produces — a unit test stubbing ClaimTypes.Name
/// directly would not have caught the original bug and would not prove this fix either.
/// </summary>
[Collection(ApiTestCollection.Name)]
public class WorkflowConfigMetadataTests : IClassFixture<ApiTestFactory>
{
    private const string UserAEmail = "admin.dev@stratango.local"; // seeded by appsettings.Development.json (SeedAdmin)
    private const string UserAPassword = "Admin123!";
    private const string UserAFullName = "Chris Chavez";

    private const string UserBEmail = "user-b.metadata-test@stratango.local";
    private const string UserBPassword = "UserB123!";
    private const string UserBFullName = "Pat Reviewer";

    private readonly ApiTestFactory _factory;

    public WorkflowConfigMetadataTests(ApiTestFactory factory) => _factory = factory;

    // ── Test infrastructure ─────────────────────────────────────────────────────────────────

    private async Task<HttpClient> LoginAsync(string email, string password)
    {
        var client = _factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password });
        login.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await login.Content.ReadAsStringAsync());
        var token = doc.RootElement.GetProperty("token").GetString()!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    private Task<HttpClient> LoginAsUserAAsync() => LoginAsync(UserAEmail, UserAPassword);

    /// <summary>Seeds a second, independent active user directly (the Users API's Create()
    /// endpoint deliberately creates an inactive, invite-only account — too much unrelated
    /// friction for a test double). Idempotent across the [Collection]-shared factory: a repeat
    /// call for the same email is a no-op rather than a duplicate-row failure.</summary>
    private async Task EnsureUserBSeededAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        if (await db.Users.AnyAsync(u => u.Email == UserBEmail)) return;

        db.Users.Add(new UserEntity
        {
            Email = UserBEmail,
            FullName = UserBFullName,
            Role = "Project Manager",
            Office = "Atlanta, United States",
            IsActive = true,
            IsFirstLogin = false,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(UserBPassword),
        });
        await db.SaveChangesAsync();
    }

    private async Task<HttpClient> LoginAsUserBAsync()
    {
        await EnsureUserBSeededAsync();
        return await LoginAsync(UserBEmail, UserBPassword);
    }

    private async Task<WorkflowConfigEntity> GetEntityAsync(string id)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.WorkflowConfigs.AsNoTracking().FirstAsync(c => c.Id == id);
    }

    private static async Task<JsonElement> BodyAsync(HttpResponseMessage resp)
    {
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        return doc.RootElement.Clone();
    }

    private static string? GetStringOrNull(JsonElement el, string prop)
        => el.TryGetProperty(prop, out var v) && v.ValueKind != JsonValueKind.Null ? v.GetString() : null;

    // ── 1/2: Create with / without Notes ────────────────────────────────────────────────────

    [Fact]
    public async Task Create_with_notes_persists_notes()
    {
        var client = await LoginAsUserAAsync();

        var resp = await client.PostAsJsonAsync("/api/workflow-configs", new
        {
            name = "Metadata Test — With Notes",
            productId = "prod-metadata-test",
            notes = "A real description entered at creation time.",
        });

        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        var body = await BodyAsync(resp);
        Assert.Equal("A real description entered at creation time.", GetStringOrNull(body, "notes"));

        var entity = await GetEntityAsync(GetStringOrNull(body, "id")!);
        Assert.Equal("A real description entered at creation time.", entity.Notes);
    }

    [Fact]
    public async Task Create_without_notes_succeeds_with_null_notes()
    {
        var client = await LoginAsUserAAsync();

        var resp = await client.PostAsJsonAsync("/api/workflow-configs", new
        {
            name = "Metadata Test — No Notes",
            productId = "prod-metadata-test",
        });

        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        var body = await BodyAsync(resp);
        Assert.Null(GetStringOrNull(body, "notes"));
    }

    // ── 3/4: CreatedBy comes from the authenticated principal (Name, then Email fallback) ──────

    [Fact]
    public async Task Create_authenticated_as_UserA_sets_CreatedBy_to_UserA_display_name()
    {
        var client = await LoginAsUserAAsync();

        var resp = await client.PostAsJsonAsync("/api/workflow-configs", new
        {
            name = "Metadata Test — CreatedBy",
            productId = "prod-metadata-test",
        });

        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        var body = await BodyAsync(resp);
        // This is the exact regression the audit found: before the fix, this was always null.
        Assert.Equal(UserAFullName, GetStringOrNull(body, "createdBy"));
    }

    [Fact]
    public async Task Create_authenticated_as_UserB_sets_CreatedBy_to_UserB_not_UserA()
    {
        var client = await LoginAsUserBAsync();

        var resp = await client.PostAsJsonAsync("/api/workflow-configs", new
        {
            name = "Metadata Test — CreatedBy UserB",
            productId = "prod-metadata-test",
        });

        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        var body = await BodyAsync(resp);
        Assert.Equal(UserBFullName, GetStringOrNull(body, "createdBy"));
        Assert.NotEqual(UserAFullName, GetStringOrNull(body, "createdBy"));
    }

    // ── 5: request payload cannot override CreatedBy ────────────────────────────────────────

    [Fact]
    public async Task Create_request_cannot_override_CreatedBy_with_an_arbitrary_client_supplied_value()
    {
        var client = await LoginAsUserAAsync();

        // UpsertWorkflowConfigRequest has no CreatedBy/createdBy property at all — an attacker-
        // supplied extra JSON field must be silently ignored by model binding, never honored.
        var resp = await client.PostAsync(
            "/api/workflow-configs",
            JsonContent.Create(new Dictionary<string, object?>
            {
                ["name"] = "Metadata Test — Spoofed CreatedBy",
                ["productId"] = "prod-metadata-test",
                ["createdBy"] = "Not A Real User",
                ["creator"] = "Not A Real User",
                ["userName"] = "Not A Real User",
            }));

        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        var body = await BodyAsync(resp);
        Assert.Equal(UserAFullName, GetStringOrNull(body, "createdBy"));
        Assert.NotEqual("Not A Real User", GetStringOrNull(body, "createdBy"));
    }

    // ── 6: CreatedAt is generated server-side ───────────────────────────────────────────────

    [Fact]
    public async Task Create_generates_CreatedAt_server_side_near_now()
    {
        var client = await LoginAsUserAAsync();
        var before = DateTime.UtcNow.AddSeconds(-5);

        var resp = await client.PostAsJsonAsync("/api/workflow-configs", new
        {
            name = "Metadata Test — CreatedAt",
            productId = "prod-metadata-test",
        });
        var after = DateTime.UtcNow.AddSeconds(5);

        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        var body = await BodyAsync(resp);
        var entity = await GetEntityAsync(GetStringOrNull(body, "id")!);
        Assert.InRange(entity.CreatedAt, before, after);
    }

    // ── 7/8: Update persists Notes, never touches CreatedBy/CreatedAt ──────────────────────

    [Fact]
    public async Task Update_changes_notes_and_persists()
    {
        var client = await LoginAsUserAAsync();
        var created = await BodyAsync(await client.PostAsJsonAsync("/api/workflow-configs", new
        {
            name = "Metadata Test — Update Notes",
            productId = "prod-metadata-test",
            notes = "Original description.",
        }));
        var id = GetStringOrNull(created, "id")!;

        var updateResp = await client.PutAsJsonAsync($"/api/workflow-configs/{id}", new
        {
            notes = "Updated description.",
        });

        Assert.Equal(HttpStatusCode.OK, updateResp.StatusCode);
        var entity = await GetEntityAsync(id);
        Assert.Equal("Updated description.", entity.Notes);
    }

    [Fact]
    public async Task Update_by_UserB_leaves_original_CreatedBy_and_CreatedAt_from_UserA_unchanged()
    {
        var clientA = await LoginAsUserAAsync();
        var created = await BodyAsync(await PostCreateAsync(clientA, "Metadata Test — Update By UserB"));
        var id = GetStringOrNull(created, "id")!;
        var originalCreatedAt = (await GetEntityAsync(id)).CreatedAt;

        var clientB = await LoginAsUserBAsync();
        var updateResp = await clientB.PutAsJsonAsync($"/api/workflow-configs/{id}", new
        {
            notes = "Edited by a different user.",
        });

        Assert.Equal(HttpStatusCode.OK, updateResp.StatusCode);
        var entity = await GetEntityAsync(id);
        Assert.Equal(UserAFullName, entity.CreatedBy); // still the original creator
        Assert.Equal(originalCreatedAt, entity.CreatedAt); // unchanged
        Assert.Equal("Edited by a different user.", entity.Notes); // the edit itself did apply
    }

    // ── 9: Publish by a different user leaves CreatedBy/CreatedAt unchanged ────────────────

    [Fact]
    public async Task Publish_by_UserB_leaves_original_CreatedBy_and_CreatedAt_from_UserA_unchanged()
    {
        var clientA = await LoginAsUserAAsync();
        var created = await BodyAsync(await PostCreateAsync(clientA, "Metadata Test — Publish By UserB"));
        var id = GetStringOrNull(created, "id")!;
        var originalCreatedAt = (await GetEntityAsync(id)).CreatedAt;

        // A workflow type is required before Publish() will succeed (unrelated pre-existing
        // gate) — set it directly so this test stays scoped to the metadata question.
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var entity = await db.WorkflowConfigs.FirstAsync(c => c.Id == id);
            entity.WorkflowTypeId = "wftype-installation";
            await db.SaveChangesAsync();
        }

        var clientB = await LoginAsUserBAsync();
        var publishResp = await clientB.PostAsync($"/api/workflow-configs/{id}/publish", null);

        Assert.Equal(HttpStatusCode.OK, publishResp.StatusCode);
        var entityAfter = await GetEntityAsync(id);
        Assert.Equal("Published", entityAfter.Status);
        Assert.Equal(UserAFullName, entityAfter.CreatedBy); // still the original creator
        Assert.Equal(originalCreatedAt, entityAfter.CreatedAt); // unchanged
    }

    // ── 10: Clone by UserB from a workflow created by UserA ─────────────────────────────────

    [Fact]
    public async Task Clone_by_UserB_sets_clone_CreatedBy_to_UserB_and_leaves_source_CreatedBy_and_CreatedAt_untouched()
    {
        var clientA = await LoginAsUserAAsync();
        var created = await BodyAsync(await PostCreateAsync(clientA, "Metadata Test — Clone Source"));
        var sourceId = GetStringOrNull(created, "id")!;
        var sourceEntityBefore = await GetEntityAsync(sourceId);

        var clientB = await LoginAsUserBAsync();
        var cloneResp = await clientB.PostAsync($"/api/workflow-configs/{sourceId}/clone", null);

        Assert.Equal(HttpStatusCode.Created, cloneResp.StatusCode);
        var cloneBody = await BodyAsync(cloneResp);
        var cloneId = GetStringOrNull(cloneBody, "id")!;

        var cloneEntity = await GetEntityAsync(cloneId);
        Assert.Equal(UserBFullName, cloneEntity.CreatedBy); // the CLONING user, never the source's author
        Assert.NotEqual(sourceEntityBefore.CreatedBy, cloneEntity.CreatedBy);
        Assert.True(cloneEntity.CreatedAt > sourceEntityBefore.CreatedAt); // a genuinely new timestamp
        Assert.Equal(sourceId, cloneEntity.TemplateSourceId);

        var sourceEntityAfter = await GetEntityAsync(sourceId);
        Assert.Equal(UserAFullName, sourceEntityAfter.CreatedBy); // source's own authorship untouched
        Assert.Equal(sourceEntityBefore.CreatedAt, sourceEntityAfter.CreatedAt);
    }

    // ── 11: list/detail endpoints return the metadata fields ───────────────────────────────

    [Fact]
    public async Task ListByProduct_and_GetById_both_return_notes_createdBy_and_createdAt()
    {
        var client = await LoginAsUserAAsync();
        const string productId = "prod-metadata-list-test";
        var created = await BodyAsync(await client.PostAsJsonAsync("/api/workflow-configs", new
        {
            name = "Metadata Test — List Endpoint",
            productId,
            notes = "Visible in the list.",
        }));
        var id = GetStringOrNull(created, "id")!;

        var listResp = await client.GetAsync($"/api/workflow-configs/by-product/{productId}");
        Assert.Equal(HttpStatusCode.OK, listResp.StatusCode);
        using var listDoc = JsonDocument.Parse(await listResp.Content.ReadAsStringAsync());
        var listed = listDoc.RootElement.EnumerateArray().First(e => GetStringOrNull(e, "id") == id);
        Assert.Equal("Visible in the list.", GetStringOrNull(listed, "notes"));
        Assert.Equal(UserAFullName, GetStringOrNull(listed, "createdBy"));
        Assert.True(listed.TryGetProperty("createdAt", out _));

        var getResp = await client.GetAsync($"/api/workflow-configs/{id}");
        Assert.Equal(HttpStatusCode.OK, getResp.StatusCode);
        var got = await BodyAsync(getResp);
        Assert.Equal("Visible in the list.", GetStringOrNull(got, "notes"));
        Assert.Equal(UserAFullName, GetStringOrNull(got, "createdBy"));
    }

    // ── 12: historical/null CreatedBy is returned safely, never fabricated ──────────────────

    [Fact]
    public async Task Historical_row_with_null_CreatedBy_and_null_Notes_is_returned_safely_never_fabricated()
    {
        // Simulates a pre-fix historical row — direct DB insert with CreatedBy/Notes left null,
        // exactly as a genuinely un-attributed legacy workflow would look. No backfill/inference.
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var historicalId = Guid.NewGuid().ToString();
        db.WorkflowConfigs.Add(new WorkflowConfigEntity
        {
            Id = historicalId,
            ProductId = "prod-metadata-test",
            Name = "Historical Workflow (pre-fix)",
            Status = "Published",
            Notes = null,
            CreatedBy = null,
            CreatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            UpdatedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc),
        });
        await db.SaveChangesAsync();

        var client = await LoginAsUserAAsync();
        var resp = await client.GetAsync($"/api/workflow-configs/{historicalId}");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await BodyAsync(resp);
        Assert.Null(GetStringOrNull(body, "notes"));
        Assert.Null(GetStringOrNull(body, "createdBy"));
        // The row itself must never have been touched by the read.
        var entity = await GetEntityAsync(historicalId);
        Assert.Null(entity.Notes);
        Assert.Null(entity.CreatedBy);
    }

    private static Task<HttpResponseMessage> PostCreateAsync(HttpClient client, string name)
        => client.PostAsJsonAsync("/api/workflow-configs", new { name, productId = "prod-metadata-test" });
}
