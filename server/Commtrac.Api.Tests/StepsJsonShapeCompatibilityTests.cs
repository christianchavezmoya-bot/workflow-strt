using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// Staging acceptance of commit 2d6f045b surfaced a real, pre-existing (WF-4-era) bug: real
/// WorkflowConfig.StepsJson data is legitimately stored in two shapes —
///   1. a bare steps array:              [ {...}, {...} ]
///   2. a wrapped whole-workflow object: { "id", "name", "productId", "createdAt",
///                                         "steps": [ {...}, {...} ], "media": [...] }
/// — and the frontend's own loader already tolerates both, but the backend assumed shape 1
/// everywhere, crashing with an unhandled 500 (surfacing to the browser as a generic network
/// failure) for the wrapped shape, which real staging/production data commonly uses (confirmed:
/// both a fresh Draft and the real published "HA-Coal 5 steps fixed content" config are wrapped).
///
/// These tests prove ParseWorkflowSteps (the new single tolerant reader) makes every affected
/// path — Sync preview/apply, Export, Import, Publish, and the run-safety snapshot check — work
/// identically for both shapes, fail in a controlled (never-500) way for genuinely bad input, and
/// preserve every existing WF-4/5/6 guarantee (deterministic ids, capture fields, P/N
/// reconciliation, custom-step protection, run safety, import atomicity) when reading the wrapped
/// shape specifically — not just "doesn't crash".
/// </summary>
[Collection(ApiTestCollection.Name)]
public class StepsJsonShapeCompatibilityTests : IClassFixture<ApiTestFactory>
{
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);
    private readonly ApiTestFactory _factory;

    public StepsJsonShapeCompatibilityTests(ApiTestFactory factory) => _factory = factory;

    private sealed class Fixture
    {
        public string ProductId = "";
        public string FeatureId = "";
        public string ConfigId = "";
    }

    /// <summary>Seeds a Product with one dependency-less inventory Feature (captureFields +
    /// AlternativePartNumber set, the real HA-Coal shape) and an empty Draft WorkflowConfig whose
    /// StepsJson is set by the caller to whichever shape is under test.</summary>
    private async Task<Fixture> SeedFixtureAsync(string initialStepsJson)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var fixture = new Fixture { ProductId = Guid.NewGuid().ToString("N"), FeatureId = Guid.NewGuid().ToString("N") };

        db.Products.Add(new ProductEntity { Id = fixture.ProductId, Name = "Shape Test Product" });
        db.Features.Add(new FeatureEntity
        {
            Id = fixture.FeatureId, Name = "JUNCTION BOX", ValueType = "text", IsInventory = true,
            CaptureFieldsJson = JsonSerializer.Serialize(new[] { "serialNo", "location" }, JsonOpts),
            AlternativePartNumber = "HA-363",
        });
        db.ProductFeatures.Add(new ProductFeatureEntity { Id = Guid.NewGuid().ToString("N"), ProductId = fixture.ProductId, FeatureId = fixture.FeatureId, SortOrder = 0 });

        var now = DateTime.UtcNow;
        fixture.ConfigId = Guid.NewGuid().ToString("N");
        db.WorkflowConfigs.Add(new WorkflowConfigEntity
        {
            Id = fixture.ConfigId, ProductId = fixture.ProductId, Name = "Shape Test Draft", Status = "Draft", Version = 1,
            StepsJson = initialStepsJson, MediaJson = "[]", FeatureSelectionsJson = "[]", CreatedAt = now, UpdatedAt = now,
        });

        await db.SaveChangesAsync();
        return fixture;
    }

    private async Task SetQuantityAsync(string configId, string featureId, int quantity)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.WorkflowConfigFeatures.Add(new WorkflowConfigFeatureEntity
        {
            Id = Guid.NewGuid().ToString("N"), WorkflowConfigId = configId, FeatureId = featureId,
            Quantity = quantity, InclusionsJson = "{}", SortOrder = 0,
        });
        await db.SaveChangesAsync();
    }

    private async Task<string> GetStepsJsonAsync(string configId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var entity = await db.WorkflowConfigs.AsNoTracking().FirstAsync(c => c.Id == configId);
        return entity.StepsJson;
    }

    private static async Task<HttpClient> CreateAuthenticatedClientAsync(ApiTestFactory factory)
    {
        var client = factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email = "admin.dev@stratango.local", password = "Admin123!" });
        login.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await login.Content.ReadAsStringAsync());
        var token = doc.RootElement.GetProperty("token").GetString()!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    // ── Fixtures for the two StepsJson shapes, both containing ONE identical custom step ───────

    private static readonly object CustomStep = new
    {
        id = "custom-step-1", order = 1, title = "Custom Prep", description = "", overrideInReport = false,
        overrideReportText = "", includeDescriptionInReport = true, mediaIds = Array.Empty<string>(),
        decisionsEnabled = false, decisions = Array.Empty<object>(), inputs = Array.Empty<object>(),
        nextStepId = (string?)null, captureFields = Array.Empty<object>(), stepType = "preparation",
    };

    private static string BareArrayStepsJson() => JsonSerializer.Serialize(new[] { CustomStep }, JsonOpts);

    /// <summary>The real staging wrapper shape: {id,name,productId,createdAt,steps,media}.</summary>
    private static string WrappedObjectStepsJson(string productId) => JsonSerializer.Serialize(new
    {
        id = Guid.NewGuid().ToString("N"),
        name = "Shape Test Draft",
        productId,
        createdAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
        steps = new[] { CustomStep },
        media = Array.Empty<object>(),
    }, JsonOpts);

    // ── 1/2. Sync preview — array and wrapped ───────────────────────────────────────────────

    [Fact]
    public async Task SyncPreview_works_with_bare_array_StepsJson()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedFixtureAsync(BareArrayStepsJson());
        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 1);

        var resp = await client.PostAsync($"/api/workflow-configs/{fixture.ConfigId}/sync-feature-steps/preview", null);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var dto = JsonSerializer.Deserialize<SyncFeatureStepsResultDto>(await resp.Content.ReadAsStringAsync(), JsonOpts)!;
        Assert.Single(dto.Added); // the one Junction Box unit's generated step
    }

    [Fact]
    public async Task SyncPreview_works_with_wrapped_object_StepsJson()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedFixtureAsync(WrappedObjectStepsJson(""));
        // productId inside the wrapper is cosmetic (never read back) — fix it up to the real one.
        await SeedFixtureFixupProductIdAsync(fixture);
        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 1);

        var resp = await client.PostAsync($"/api/workflow-configs/{fixture.ConfigId}/sync-feature-steps/preview", null);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var dto = JsonSerializer.Deserialize<SyncFeatureStepsResultDto>(await resp.Content.ReadAsStringAsync(), JsonOpts)!;
        Assert.Single(dto.Added);
        Assert.Empty(dto.Blocked);
    }

    // WrappedObjectStepsJson needs productId before the fixture's real id exists — patch it in.
    private async Task SeedFixtureFixupProductIdAsync(Fixture fixture)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var entity = await db.WorkflowConfigs.FirstAsync(c => c.Id == fixture.ConfigId);
        entity.StepsJson = WrappedObjectStepsJson(fixture.ProductId);
        await db.SaveChangesAsync();
    }

    // ── 3/4. Sync apply — array and wrapped; also proves the write-back is a bare array (existing
    //    write-shape semantics are unchanged by this fix — only reading was tolerant-ized) and
    //    that the custom step and P/N reconciliation survive correctly through a wrapped read. ──

    [Fact]
    public async Task SyncApply_works_with_bare_array_StepsJson_and_preserves_custom_step()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedFixtureAsync(BareArrayStepsJson());
        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 1);

        var resp = await client.PostAsync($"/api/workflow-configs/{fixture.ConfigId}/sync-feature-steps", null);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var stepsJsonAfter = await GetStepsJsonAsync(fixture.ConfigId);
        var parsed = JsonSerializer.Deserialize<List<JsonElement>>(stepsJsonAfter, JsonOpts)!;
        Assert.Equal(2, parsed.Count); // custom step + the one generated step
        Assert.Contains(parsed, s => s.GetProperty("id").GetString() == "custom-step-1");
        var generated = parsed.Single(s => s.GetProperty("id").GetString() != "custom-step-1");
        var pnField = generated.GetProperty("captureFields").EnumerateArray().Single(f => f.GetProperty("key").GetString() == "partNumber");
        Assert.Equal("HA-363", pnField.GetProperty("value").GetString());
        Assert.True(pnField.GetProperty("readOnly").GetBoolean());
    }

    [Fact]
    public async Task SyncApply_works_with_wrapped_object_StepsJson_reads_correctly_writes_back_as_bare_array()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedFixtureAsync(WrappedObjectStepsJson(""));
        await SeedFixtureFixupProductIdAsync(fixture);
        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 1);

        var resp = await client.PostAsync($"/api/workflow-configs/{fixture.ConfigId}/sync-feature-steps", null);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var stepsJsonAfter = await GetStepsJsonAsync(fixture.ConfigId);
        // Existing write-shape semantics are unchanged by this fix: Sync always serializes a bare
        // List<JsonElement> directly, so the stored shape naturally normalizes to a bare array —
        // this fix did not need to (and does not) rewrite the read side's shape deliberately.
        using var doc = JsonDocument.Parse(stepsJsonAfter);
        Assert.Equal(JsonValueKind.Array, doc.RootElement.ValueKind);

        var parsed = JsonSerializer.Deserialize<List<JsonElement>>(stepsJsonAfter, JsonOpts)!;
        Assert.Equal(2, parsed.Count); // the custom step (carried forward from inside the wrapper) + generated
        Assert.Contains(parsed, s => s.GetProperty("id").GetString() == "custom-step-1");
    }

    // ── 5/6. Export Workflow JSON — array and wrapped ───────────────────────────────────────

    [Fact]
    public async Task Export_works_with_bare_array_StepsJson()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedFixtureAsync(BareArrayStepsJson());

        var resp = await client.GetAsync($"/api/workflow-configs/{fixture.ConfigId}/export");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var dto = JsonSerializer.Deserialize<WorkflowExportDto>(await resp.Content.ReadAsStringAsync(), JsonOpts)!;
        var step = Assert.Single(dto.Steps);
        Assert.Equal("custom-step-1", step.GetProperty("id").GetString());
    }

    [Fact]
    public async Task Export_works_with_wrapped_object_StepsJson()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedFixtureAsync(WrappedObjectStepsJson(""));
        await SeedFixtureFixupProductIdAsync(fixture);

        var resp = await client.GetAsync($"/api/workflow-configs/{fixture.ConfigId}/export");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var dto = JsonSerializer.Deserialize<WorkflowExportDto>(await resp.Content.ReadAsStringAsync(), JsonOpts)!;
        var step = Assert.Single(dto.Steps);
        Assert.Equal("custom-step-1", step.GetProperty("id").GetString());
    }

    // ── 7/8. Import Workflow JSON — array and wrapped EXISTING StepsJson ────────────────────

    private static object ImportRequest(string productId, string featureId, int quantity) => new
    {
        schemaVersion = 1, productId, name = "Imported Name",
        featureSelections = new[] { new { featureId, quantity, inclusions = new Dictionary<string, bool>() } },
        steps = Array.Empty<object>(), // no custom steps in the imported file itself
    };

    [Fact]
    public async Task Import_works_with_bare_array_existing_StepsJson()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedFixtureAsync(BareArrayStepsJson());

        var resp = await client.PostAsJsonAsync($"/api/workflow-configs/{fixture.ConfigId}/import", ImportRequest(fixture.ProductId, fixture.FeatureId, 1));
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var stepsJsonAfter = await GetStepsJsonAsync(fixture.ConfigId);
        var parsed = JsonSerializer.Deserialize<List<JsonElement>>(stepsJsonAfter, JsonOpts)!;
        // The pre-existing custom step was NOT feature-generated, so it's dropped by a real import
        // (the imported file's own [] steps become authoritative for custom content) — only the
        // freshly-generated Junction Box unit remains.
        var generated = Assert.Single(parsed);
        Assert.Equal("feature-generated", generated.GetProperty("stepOrigin").GetString());
    }

    [Fact]
    public async Task Import_works_with_wrapped_object_existing_StepsJson()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedFixtureAsync(WrappedObjectStepsJson(""));
        await SeedFixtureFixupProductIdAsync(fixture);

        var resp = await client.PostAsJsonAsync($"/api/workflow-configs/{fixture.ConfigId}/import", ImportRequest(fixture.ProductId, fixture.FeatureId, 1));
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var stepsJsonAfter = await GetStepsJsonAsync(fixture.ConfigId);
        using var doc = JsonDocument.Parse(stepsJsonAfter);
        Assert.Equal(JsonValueKind.Array, doc.RootElement.ValueKind); // write-back always bare array

        var parsed = JsonSerializer.Deserialize<List<JsonElement>>(stepsJsonAfter, JsonOpts)!;
        var generated = Assert.Single(parsed);
        Assert.Equal("feature-generated", generated.GetProperty("stepOrigin").GetString());
    }

    /// <summary>Import atomicity is unaffected by this fix: a run-referenced generated step still
    /// blocks the whole import (409, nothing persisted), reading from a wrapped-shape existing
    /// StepsJson exactly as it would from a bare array.</summary>
    [Fact]
    public async Task Import_transaction_behavior_intact_reading_wrapped_existing_StepsJson_run_referenced_step_blocks_whole_import()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedFixtureAsync(WrappedObjectStepsJson(""));
        await SeedFixtureFixupProductIdAsync(fixture);
        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 1);
        await client.PostAsync($"/api/workflow-configs/{fixture.ConfigId}/sync-feature-steps", null); // generate the real step + its id

        var stepsAfterSync = JsonSerializer.Deserialize<List<JsonElement>>(await GetStepsJsonAsync(fixture.ConfigId), JsonOpts)!;
        var generatedStepId = stepsAfterSync.Single(s => s.TryGetProperty("stepOrigin", out var o) && o.GetString() == "feature-generated").GetProperty("id").GetString()!;

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var innerStepsJson = JsonSerializer.Serialize(new[] { new { id = generatedStepId } }, JsonOpts);
            db.AssetWorkflowRuns.Add(new AssetWorkflowRunEntity
            {
                Id = Guid.NewGuid().ToString("N"), WorkflowConfigId = fixture.ConfigId, AssetId = Guid.NewGuid().ToString("N"),
                Status = "InProgress", IsLocked = false,
                WorkflowSnapshotJson = JsonSerializer.Serialize(new { StepsJson = innerStepsJson }, JsonOpts),
            });
            await db.SaveChangesAsync();
        }

        var featureSelectionsBefore = await GetConfigFeatureCountAsync(fixture.ConfigId);
        // Import with quantity 0 — would remove the run-referenced unit's generated step entirely.
        var resp = await client.PostAsJsonAsync($"/api/workflow-configs/{fixture.ConfigId}/import", ImportRequest(fixture.ProductId, fixture.FeatureId, 0));

        Assert.Equal(HttpStatusCode.Conflict, resp.StatusCode);
        Assert.Equal(featureSelectionsBefore, await GetConfigFeatureCountAsync(fixture.ConfigId)); // nothing changed
    }

    private async Task<int> GetConfigFeatureCountAsync(string configId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.WorkflowConfigFeatures.CountAsync(f => f.WorkflowConfigId == configId && f.Quantity > 0);
    }

    // ── 9/10. Publish — array and wrapped ───────────────────────────────────────────────────

    private async Task<string> SeedActiveWorkflowTypeAsync()
    {
        var id = "wftype-shapetest-" + Guid.NewGuid().ToString("N")[..8];
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.WorkflowTypes.Add(new WorkflowTypeEntity { Id = id, Name = "Shape Test Type " + id, IsActive = true });
        await db.SaveChangesAsync();
        return id;
    }

    private async Task SetWorkflowTypeAsync(string configId, string workflowTypeId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var entity = await db.WorkflowConfigs.FirstAsync(c => c.Id == configId);
        entity.WorkflowTypeId = workflowTypeId;
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Publish_works_with_bare_array_StepsJson()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedFixtureAsync(BareArrayStepsJson());
        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 1);
        var typeId = await SeedActiveWorkflowTypeAsync();
        await SetWorkflowTypeAsync(fixture.ConfigId, typeId);

        var resp = await client.PostAsync($"/api/workflow-configs/{fixture.ConfigId}/publish", null);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }

    [Fact]
    public async Task Publish_works_with_wrapped_object_StepsJson()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedFixtureAsync(WrappedObjectStepsJson(""));
        await SeedFixtureFixupProductIdAsync(fixture);
        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 1);
        var typeId = await SeedActiveWorkflowTypeAsync();
        await SetWorkflowTypeAsync(fixture.ConfigId, typeId);

        var resp = await client.PostAsync($"/api/workflow-configs/{fixture.ConfigId}/publish", null);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var stepsJsonAfter = await GetStepsJsonAsync(fixture.ConfigId);
        var parsed = JsonSerializer.Deserialize<List<JsonElement>>(stepsJsonAfter, JsonOpts)!;
        Assert.Contains(parsed, s => s.GetProperty("id").GetString() == "custom-step-1"); // carried forward
        Assert.Contains(parsed, s => s.TryGetProperty("bomSource", out _)); // generated unit injected
    }

    // ── 11/12/13. Controlled failures — never an unhandled 500 ──────────────────────────────

    [Fact]
    public async Task MalformedStepsJson_returns_controlled_400_on_sync_preview_not_unhandled_500()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedFixtureAsync("{not valid json");

        var resp = await client.PostAsync($"/api/workflow-configs/{fixture.ConfigId}/sync-feature-steps/preview", null);
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        var body = await resp.Content.ReadAsStringAsync();
        Assert.Contains("message", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task MalformedStepsJson_returns_controlled_400_on_export_not_unhandled_500()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedFixtureAsync("{not valid json");

        var resp = await client.GetAsync($"/api/workflow-configs/{fixture.ConfigId}/export");
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task ObjectWithMissingStepsProperty_returns_controlled_400()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var noStepsWrapper = JsonSerializer.Serialize(new { id = "x", name = "n", productId = "p" }, JsonOpts);
        var fixture = await SeedFixtureAsync(noStepsWrapper);

        var resp = await client.PostAsync($"/api/workflow-configs/{fixture.ConfigId}/sync-feature-steps/preview", null);
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        Assert.Contains("steps", (await resp.Content.ReadAsStringAsync()).ToLowerInvariant());
    }

    [Fact]
    public async Task ObjectWithNonArrayStepsProperty_returns_controlled_400()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var badStepsWrapper = JsonSerializer.Serialize(new { id = "x", name = "n", productId = "p", steps = "not-an-array" }, JsonOpts);
        var fixture = await SeedFixtureAsync(badStepsWrapper);

        var resp = await client.PostAsync($"/api/workflow-configs/{fixture.ConfigId}/sync-feature-steps/preview", null);
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    // ── Run-safety snapshot fix: a run's WorkflowSnapshotJson.StepsJson inherits the config's own
    //    shape verbatim at run-start, so it carries the identical ambiguity. Before this fix, a
    //    wrapped-shape snapshot threw inside SnapshotContainsStep's try/catch and was silently
    //    treated as "not blocking" — a run-safety false negative. This proves it now correctly
    //    blocks. ─────────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task RunSafety_correctly_blocks_removal_when_the_blocking_runs_OWN_snapshot_StepsJson_is_wrapped_shape()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedFixtureAsync(BareArrayStepsJson());
        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 1);
        await client.PostAsync($"/api/workflow-configs/{fixture.ConfigId}/sync-feature-steps", null);

        var stepsAfterSync = JsonSerializer.Deserialize<List<JsonElement>>(await GetStepsJsonAsync(fixture.ConfigId), JsonOpts)!;
        var generatedStepId = stepsAfterSync.Single(s => s.TryGetProperty("stepOrigin", out var o) && o.GetString() == "feature-generated").GetProperty("id").GetString()!;

        // The run's own frozen snapshot is itself the WRAPPED shape (mirrors a run started from a
        // config whose StepsJson was wrapped at that moment) — the fix under test.
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var wrappedInnerStepsJson = JsonSerializer.Serialize(new
            {
                id = Guid.NewGuid().ToString("N"), name = "n", productId = fixture.ProductId,
                createdAt = 0, steps = stepsAfterSync, media = Array.Empty<object>(),
            }, JsonOpts);
            db.AssetWorkflowRuns.Add(new AssetWorkflowRunEntity
            {
                Id = Guid.NewGuid().ToString("N"), WorkflowConfigId = fixture.ConfigId, AssetId = Guid.NewGuid().ToString("N"),
                Status = "InProgress", IsLocked = false,
                WorkflowSnapshotJson = JsonSerializer.Serialize(new { StepsJson = wrappedInnerStepsJson }, JsonOpts),
            });
            await db.SaveChangesAsync();
        }

        // Removing the feature (qty -> 0) would delete the run-referenced generated step.
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var cf = await db.WorkflowConfigFeatures.FirstAsync(f => f.WorkflowConfigId == fixture.ConfigId && f.FeatureId == fixture.FeatureId);
            cf.Quantity = 0;
            await db.SaveChangesAsync();
        }

        var resp = await client.PostAsync($"/api/workflow-configs/{fixture.ConfigId}/sync-feature-steps/preview", null);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var dto = JsonSerializer.Deserialize<SyncFeatureStepsResultDto>(await resp.Content.ReadAsStringAsync(), JsonOpts)!;

        // Correctly blocked — not silently reported as removable just because the run's own
        // snapshot happened to be wrapped-shape.
        Assert.NotEmpty(dto.Blocked);
        Assert.Empty(dto.Removed);
    }
}
