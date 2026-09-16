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
/// Builder UX Simplification + Feature Capture Integration phase: covers the real-world HA-Coal
/// shape — inventory Features with NO FeatureDependency rows, whose capture definitions
/// (Serial Number, Firmware, Location, Certification, ...) live directly on
/// FeatureEntity.CaptureFieldsJson (Settings → Features "Feature: Yes" capture-field picker).
///
/// Before this phase, ReconcileFeatureStepsAsync (used by both Sync Feature Steps and Publish)
/// only ever read FeatureDependency rows, so a Feature shaped exactly like the real staging
/// HA-Coal product (0 Dependencies, populated Feature.captureFields) generated ZERO steps
/// regardless of quantity — only the client's buildAutoSteps() (Regenerate Workflow) already had
/// this fallback. These tests cover the server-side synthetic-dependency fallback that brings
/// Sync/Publish to parity with Regenerate for this shape, plus the new workflow-scoped
/// authoring-context endpoint and the Feature.captureFields addition to the Product-level context.
/// </summary>
[Collection(ApiTestCollection.Name)]
public class FeatureCaptureFieldFallbackTests : IClassFixture<ApiTestFactory>
{
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);
    private readonly ApiTestFactory _factory;

    public FeatureCaptureFieldFallbackTests(ApiTestFactory factory) => _factory = factory;

    private sealed class Fixture
    {
        public string ProductId = "";
        public string FeatureId = "";
        public string ConfigId = "";
    }

    /// <summary>Seeds one Product with one inventory Feature that has captureFields set directly
    /// on the Feature (["serialNo","firmware","location","certification"]) and deliberately ZERO
    /// FeatureDependency rows — the real HA-Coal shape — plus an empty Draft WorkflowConfig.</summary>
    private async Task<Fixture> SeedDependencyLessFeatureAsync(string[]? captureFields = null)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var fixture = new Fixture
        {
            ProductId = Guid.NewGuid().ToString("N"),
            FeatureId = Guid.NewGuid().ToString("N"),
        };

        db.Products.Add(new ProductEntity { Id = fixture.ProductId, Name = "HA-Coal-Shaped Product" });
        db.Features.Add(new FeatureEntity
        {
            Id = fixture.FeatureId,
            Name = "JUNCTION BOX",
            ValueType = "text",
            IsInventory = true,
            CaptureFieldsJson = JsonSerializer.Serialize(captureFields ?? new[] { "serialNo", "firmware", "location", "certification" }, JsonOpts),
            AlternativePartNumber = "JB-100",
        });
        db.ProductFeatures.Add(new ProductFeatureEntity { Id = Guid.NewGuid().ToString("N"), ProductId = fixture.ProductId, FeatureId = fixture.FeatureId, SortOrder = 0 });

        var now = DateTime.UtcNow;
        fixture.ConfigId = Guid.NewGuid().ToString("N");
        db.WorkflowConfigs.Add(new WorkflowConfigEntity
        {
            Id = fixture.ConfigId, ProductId = fixture.ProductId, Name = "Dependency-less Draft", Status = "Draft", Version = 1,
            StepsJson = "[]", MediaJson = "[]", FeatureSelectionsJson = "[]", CreatedAt = now, UpdatedAt = now,
        });

        await db.SaveChangesAsync();
        return fixture;
    }

    private async Task SetQuantityAsync(string configId, string featureId, int quantity)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var existing = await db.WorkflowConfigFeatures.FirstOrDefaultAsync(f => f.WorkflowConfigId == configId && f.FeatureId == featureId);
        if (existing is null)
        {
            db.WorkflowConfigFeatures.Add(new WorkflowConfigFeatureEntity
            {
                Id = Guid.NewGuid().ToString("N"), WorkflowConfigId = configId, FeatureId = featureId,
                Quantity = quantity, InclusionsJson = "{}", SortOrder = 0,
            });
        }
        else
        {
            existing.Quantity = quantity;
        }
        await db.SaveChangesAsync();
    }

    private async Task SetFeatureCaptureFieldsAsync(string featureId, string[] captureFields)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var feature = await db.Features.FirstAsync(f => f.Id == featureId);
        feature.CaptureFieldsJson = JsonSerializer.Serialize(captureFields, JsonOpts);
        await db.SaveChangesAsync();
    }

    private async Task SetFeaturePartNumberAsync(string featureId, string? alternativePartNumber)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var feature = await db.Features.FirstAsync(f => f.Id == featureId);
        feature.AlternativePartNumber = alternativePartNumber;
        await db.SaveChangesAsync();
    }

    private async Task<string> PublishAsync(HttpClient client, string configId)
    {
        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/publish", null);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadAsStringAsync();
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

    private async Task<SyncFeatureStepsResultDto> SyncAsync(HttpClient client, string configId)
    {
        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/sync-feature-steps", null);
        resp.EnsureSuccessStatusCode();
        return JsonSerializer.Deserialize<SyncFeatureStepsResultDto>(await resp.Content.ReadAsStringAsync(), JsonOpts)!;
    }

    private async Task<List<JsonElement>> GetStepsAsync(string configId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var entity = await db.WorkflowConfigs.AsNoTracking().FirstAsync(c => c.Id == configId);
        return JsonSerializer.Deserialize<List<JsonElement>>(entity.StepsJson, JsonOpts) ?? new();
    }

    // ── Test 1/6: Sync generates steps for a dependency-less inventory Feature, sourced from
    //    Feature.captureFields ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Sync_generates_installation_step_from_FeatureCaptureFields_when_no_dependencies_exist()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedDependencyLessFeatureAsync(new[] { "serialNo", "firmware", "location", "certification" });
        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 1);

        var result = await SyncAsync(client, fixture.ConfigId);

        var added = Assert.Single(result.Added);
        Assert.Equal("installation", added.StepType);
        Assert.Equal(fixture.FeatureId, added.FeatureId);
        Assert.Equal(1, added.UnitIndex);
        Assert.Equal($"feature:{fixture.FeatureId}:unit:1:installation", added.GeneratorKey);

        var steps = await GetStepsAsync(fixture.ConfigId);
        var step = Assert.Single(steps);
        var captureFieldKeys = step.GetProperty("captureFields").EnumerateArray()
            .Select(f => f.GetProperty("key").GetString()).ToList();
        // P/N (from Feature.AlternativePartNumber, seeded as "JB-100") always leads, read-only.
        Assert.Equal(new[] { "partNumber", "serialNo", "firmware", "location", "certification" }, captureFieldKeys);
        Assert.All(step.GetProperty("captureFields").EnumerateArray(), f => Assert.Equal(fixture.FeatureId, f.GetProperty("featureId").GetString()));

        var pnField = step.GetProperty("captureFields").EnumerateArray().Single(f => f.GetProperty("key").GetString() == "partNumber");
        Assert.True(pnField.GetProperty("readOnly").GetBoolean());
        Assert.Equal("JB-100", pnField.GetProperty("value").GetString());
        Assert.False(pnField.GetProperty("required").GetBoolean());
    }

    // ── Test 2: qty 0 generates nothing ─────────────────────────────────────────────────────

    [Fact]
    public async Task Sync_generates_nothing_when_quantity_is_zero()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedDependencyLessFeatureAsync();
        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 0);

        var result = await SyncAsync(client, fixture.ConfigId);

        Assert.Empty(result.Added);
        Assert.Empty(await GetStepsAsync(fixture.ConfigId));
    }

    // ── Test 10: qty 3 → 5 adds only Units 4 and 5, Units 1-3 keep their identities ─────────

    [Fact]
    public async Task Sync_quantity_increase_adds_only_the_new_units()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedDependencyLessFeatureAsync();
        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 3);
        await SyncAsync(client, fixture.ConfigId);
        var stepIdsBefore = (await GetStepsAsync(fixture.ConfigId)).Select(s => s.GetProperty("id").GetString()).ToHashSet();
        Assert.Equal(3, stepIdsBefore.Count);

        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 5);
        var result = await SyncAsync(client, fixture.ConfigId);

        Assert.Equal(2, result.Added.Count);
        Assert.Equal(new[] { 4, 5 }, result.Added.Select(a => a.UnitIndex).OrderBy(x => x));
        Assert.Empty(result.Removed);
        Assert.Equal(3, result.Unchanged.Count); // units 1-3 byte-identical, untouched

        var stepsAfter = await GetStepsAsync(fixture.ConfigId);
        Assert.Equal(5, stepsAfter.Count);
        var stepIdsAfter = stepsAfter.Select(s => s.GetProperty("id").GetString()).ToHashSet();
        Assert.True(stepIdsBefore.IsSubsetOf(stepIdsAfter)); // units 1-3 kept their exact ids
    }

    // ── Sync qty 5 → 2 removes Units 3-5 (run-safety permitting) ────────────────────────────

    [Fact]
    public async Task Sync_quantity_decrease_removes_the_extra_units()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedDependencyLessFeatureAsync();
        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 5);
        await SyncAsync(client, fixture.ConfigId);
        Assert.Equal(5, (await GetStepsAsync(fixture.ConfigId)).Count);

        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 2);
        var result = await SyncAsync(client, fixture.ConfigId);

        Assert.Equal(3, result.Removed.Count);
        Assert.Equal(new[] { 3, 4, 5 }, result.Removed.Select(r => r.UnitIndex).OrderBy(x => x));
        Assert.Empty(result.Blocked);

        var stepsAfter = await GetStepsAsync(fixture.ConfigId);
        Assert.Equal(2, stepsAfter.Count);
    }

    // ── Test 11: a Product capture-field change (Certification added) propagates via Sync,
    //    without touching a pre-existing custom step ────────────────────────────────────────

    [Fact]
    public async Task Sync_reflects_added_FeatureCaptureField_without_touching_custom_steps()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedDependencyLessFeatureAsync(new[] { "serialNo", "location" });
        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 1);
        await SyncAsync(client, fixture.ConfigId);

        // A custom (non-generated) step must survive every subsequent sync untouched.
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var entity = await db.WorkflowConfigs.FirstAsync(c => c.Id == fixture.ConfigId);
            var steps = JsonSerializer.Deserialize<List<JsonElement>>(entity.StepsJson, JsonOpts)!.Cast<object>().ToList();
            steps.Add(new
            {
                id = "custom-prep", order = 99, title = "Custom Prep", description = "", overrideInReport = false,
                overrideReportText = "", includeDescriptionInReport = true, mediaIds = Array.Empty<string>(),
                decisionsEnabled = false, decisions = Array.Empty<object>(), inputs = Array.Empty<object>(),
                nextStepId = (string?)null, captureFields = Array.Empty<object>(), stepType = "preparation",
            });
            entity.StepsJson = JsonSerializer.Serialize(steps, JsonOpts);
            await db.SaveChangesAsync();
        }

        // Product master change: Settings → Features adds "certification".
        await SetFeatureCaptureFieldsAsync(fixture.FeatureId, new[] { "serialNo", "location", "certification" });

        var result = await SyncAsync(client, fixture.ConfigId);

        Assert.Single(result.Updated);
        Assert.Contains(result.Updated[0].AppliedFieldIds ?? new(), id => id != null);

        var stepsAfter = await GetStepsAsync(fixture.ConfigId);
        Assert.Equal(2, stepsAfter.Count); // the generated step + the untouched custom step
        Assert.Contains(stepsAfter, s => s.GetProperty("id").GetString() == "custom-prep"
            && s.GetProperty("title").GetString() == "Custom Prep");

        var generated = stepsAfter.Single(s => s.GetProperty("id").GetString() != "custom-prep");
        var keys = generated.GetProperty("captureFields").EnumerateArray().Select(f => f.GetProperty("key").GetString()).ToList();
        Assert.Contains("certification", keys);
        Assert.Contains("serialNo", keys);
        Assert.Contains("location", keys);
    }

    // ── Test 7/8/9: workflow-scoped authoring-context — qty>0 only, real ids, captureFields ──

    [Fact]
    public async Task AuthoringContext_includes_only_selected_features_with_quantity_and_captureFields()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedDependencyLessFeatureAsync(new[] { "serialNo", "certification" });
        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 3);

        var resp = await client.GetAsync($"/api/workflow-configs/{fixture.ConfigId}/authoring-context");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var dto = JsonSerializer.Deserialize<WorkflowAuthoringContextDto>(await resp.Content.ReadAsStringAsync(), JsonOpts)!;

        Assert.Equal(1, dto.SchemaVersion);
        Assert.Equal(fixture.ProductId, dto.Product.Id);
        Assert.Equal(fixture.ConfigId, dto.WorkflowConfigId);
        var feature = Assert.Single(dto.Features);
        Assert.Equal(fixture.FeatureId, feature.FeatureId);
        Assert.Equal("JUNCTION BOX", feature.Name);
        Assert.Equal(3, feature.Quantity);
        Assert.Equal(new[] { "serialNo", "certification" }, feature.CaptureFields);
        Assert.Equal("JB-100", feature.AlternativePartNumber);
    }

    [Fact]
    public async Task AuthoringContext_excludes_zero_quantity_features()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedDependencyLessFeatureAsync();
        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 0);

        var resp = await client.GetAsync($"/api/workflow-configs/{fixture.ConfigId}/authoring-context");
        var dto = JsonSerializer.Deserialize<WorkflowAuthoringContextDto>(await resp.Content.ReadAsStringAsync(), JsonOpts)!;

        Assert.Empty(dto.Features);
    }

    // ── Product-level Workflow Context now surfaces Feature.captureFields too ───────────────

    [Fact]
    public async Task ProductWorkflowContext_includes_FeatureCaptureFields()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedDependencyLessFeatureAsync(new[] { "serialNo", "firmware", "location", "certification" });

        var resp = await client.GetAsync($"/api/products/{fixture.ProductId}/workflow-context");
        var dto = JsonSerializer.Deserialize<ProductWorkflowContextDto>(await resp.Content.ReadAsStringAsync(), JsonOpts)!;

        var feature = Assert.Single(dto.Features);
        Assert.Equal(new[] { "serialNo", "firmware", "location", "certification" }, feature.CaptureFields);
        Assert.Empty(feature.Dependencies); // matches the known real HA-Coal fact: 0 FeatureDependency rows
    }

    // ── UX correction 3: Product P/N visible read-only on every generated physical unit ────

    [Fact]
    public async Task Sync_shows_PartNumber_read_only_on_every_physical_unit_JunctionBox_x3()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedDependencyLessFeatureAsync(new[] { "serialNo", "certification" });
        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 3);

        await SyncAsync(client, fixture.ConfigId);

        var steps = await GetStepsAsync(fixture.ConfigId);
        Assert.Equal(3, steps.Count);
        foreach (var unitIndex in new[] { 1, 2, 3 })
        {
            var step = steps.Single(s => s.GetProperty("stepUnitIndex").GetInt32() == unitIndex);
            var pnField = step.GetProperty("captureFields").EnumerateArray().Single(f => f.GetProperty("key").GetString() == "partNumber");
            Assert.True(pnField.GetProperty("readOnly").GetBoolean());
            Assert.False(pnField.GetProperty("required").GetBoolean());
            Assert.Equal("JB-100", pnField.GetProperty("value").GetString());
            // Serial/Certification remain present and editable alongside the reference field —
            // an ordinary field simply has no "readOnly" property at all (defaults falsy).
            var serialField = step.GetProperty("captureFields").EnumerateArray().Single(f => f.GetProperty("key").GetString() == "serialNo");
            Assert.False(serialField.TryGetProperty("readOnly", out _));
        }
    }

    [Fact]
    public async Task Sync_retroactively_adds_PartNumber_to_an_already_generated_step_once_Product_master_defines_it()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedDependencyLessFeatureAsync(new[] { "serialNo", "location" });
        await SetFeaturePartNumberAsync(fixture.FeatureId, null); // no P/N configured yet
        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 1);
        await SyncAsync(client, fixture.ConfigId);

        var beforeStep = Assert.Single(await GetStepsAsync(fixture.ConfigId));
        Assert.DoesNotContain(beforeStep.GetProperty("captureFields").EnumerateArray(), f => f.GetProperty("key").GetString() == "partNumber");
        var serialFieldIdBefore = beforeStep.GetProperty("captureFields").EnumerateArray().Single(f => f.GetProperty("key").GetString() == "serialNo").GetProperty("id").GetString();

        // Product master is later given a P/N.
        await SetFeaturePartNumberAsync(fixture.FeatureId, "JB-200");
        var result = await SyncAsync(client, fixture.ConfigId);

        Assert.Single(result.Updated);
        var afterStep = Assert.Single(await GetStepsAsync(fixture.ConfigId));
        var pnField = afterStep.GetProperty("captureFields").EnumerateArray().Single(f => f.GetProperty("key").GetString() == "partNumber");
        Assert.Equal("JB-200", pnField.GetProperty("value").GetString());
        // Serial Number's identity is unaffected by the P/N field being added alongside it.
        Assert.Equal(serialFieldIdBefore, afterStep.GetProperty("captureFields").EnumerateArray().Single(f => f.GetProperty("key").GetString() == "serialNo").GetProperty("id").GetString());
    }

    [Fact]
    public async Task Publish_generates_PartNumber_and_FeatureCaptureFields_for_a_dependency_less_feature()
    {
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.WorkflowTypes.Add(new WorkflowTypeEntity { Id = "wftype-installation-test", Name = "Installation", IsActive = true });
            await db.SaveChangesAsync();
        }

        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedDependencyLessFeatureAsync(new[] { "serialNo", "certification" });
        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 1);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var entity = await db.WorkflowConfigs.FirstAsync(c => c.Id == fixture.ConfigId);
            entity.WorkflowTypeId = "wftype-installation-test";
            await db.SaveChangesAsync();
        }

        await PublishAsync(client, fixture.ConfigId);

        var steps = await GetStepsAsync(fixture.ConfigId);
        var step = Assert.Single(steps);
        var pnField = step.GetProperty("captureFields").EnumerateArray().Single(f => f.GetProperty("key").GetString() == "partNumber");
        Assert.True(pnField.GetProperty("readOnly").GetBoolean());
        Assert.Equal("JB-100", pnField.GetProperty("value").GetString());
        Assert.Contains(step.GetProperty("captureFields").EnumerateArray(), f => f.GetProperty("key").GetString() == "serialNo");
        Assert.Contains(step.GetProperty("captureFields").EnumerateArray(), f => f.GetProperty("key").GetString() == "certification");
    }

    // ── UX correction 4: capture-field REMOVAL is reconciled safely, symmetric to the existing
    //    add-field coverage ────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Sync_removes_a_dropped_FeatureCaptureField_preserves_remaining_field_identities_and_custom_steps()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedDependencyLessFeatureAsync(new[] { "serialNo", "location", "certification" });
        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 1);
        await SyncAsync(client, fixture.ConfigId);

        var beforeStep = Assert.Single(await GetStepsAsync(fixture.ConfigId));
        var beforeFields = beforeStep.GetProperty("captureFields").EnumerateArray()
            .ToDictionary(f => f.GetProperty("key").GetString()!, f => f.GetProperty("id").GetString()!);
        Assert.Equal(new HashSet<string> { "partNumber", "serialNo", "location", "certification" }, beforeFields.Keys.ToHashSet());

        // A pre-existing custom step must survive the removal untouched.
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var entity = await db.WorkflowConfigs.FirstAsync(c => c.Id == fixture.ConfigId);
            var steps = JsonSerializer.Deserialize<List<JsonElement>>(entity.StepsJson, JsonOpts)!.Cast<object>().ToList();
            steps.Add(new
            {
                id = "custom-prep-removal", order = 99, title = "Custom Prep", description = "", overrideInReport = false,
                overrideReportText = "", includeDescriptionInReport = true, mediaIds = Array.Empty<string>(),
                decisionsEnabled = false, decisions = Array.Empty<object>(), inputs = Array.Empty<object>(),
                nextStepId = (string?)null, captureFields = Array.Empty<object>(), stepType = "preparation",
            });
            entity.StepsJson = JsonSerializer.Serialize(steps, JsonOpts);
            await db.SaveChangesAsync();
        }

        // Product master change: Settings → Features drops "certification".
        await SetFeatureCaptureFieldsAsync(fixture.FeatureId, new[] { "serialNo", "location" });

        var result = await SyncAsync(client, fixture.ConfigId);

        Assert.Single(result.Updated);
        Assert.Empty(result.Blocked); // no run references this step, so removal is safe

        var stepsAfter = await GetStepsAsync(fixture.ConfigId);
        Assert.Equal(2, stepsAfter.Count); // the generated step + the untouched custom step
        Assert.Contains(stepsAfter, s => s.GetProperty("id").GetString() == "custom-prep-removal");

        var generated = stepsAfter.Single(s => s.GetProperty("id").GetString() != "custom-prep-removal");
        var afterFields = generated.GetProperty("captureFields").EnumerateArray()
            .ToDictionary(f => f.GetProperty("key").GetString()!, f => f.GetProperty("id").GetString()!);

        // certification removed; serialNo/location/partNumber retain their exact prior ids —
        // deterministic identity preserved, not regenerated with new ids.
        Assert.Equal(new HashSet<string> { "partNumber", "serialNo", "location" }, afterFields.Keys.ToHashSet());
        Assert.Equal(beforeFields["serialNo"], afterFields["serialNo"]);
        Assert.Equal(beforeFields["location"], afterFields["location"]);
        Assert.Equal(beforeFields["partNumber"], afterFields["partNumber"]);
    }

    [Fact]
    public async Task Sync_removal_is_run_safety_gated_a_blocked_field_stays_and_is_reported_blocked()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedDependencyLessFeatureAsync(new[] { "serialNo", "location", "certification" });
        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 1);
        await SyncAsync(client, fixture.ConfigId);

        var generatedStepId = Assert.Single(await GetStepsAsync(fixture.ConfigId)).GetProperty("id").GetString()!;

        // Simulate an active (unlocked) run whose frozen snapshot still references this generated
        // step — the same shape AssetWorkflowRunsController's start-run action writes (see
        // FindBlockingRunsAsync/SnapshotContainsStep: WorkflowSnapshotJson.StepsJson is itself a
        // serialized JSON string, a two-stage parse).
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var innerStepsJson = JsonSerializer.Serialize(new[] { new { id = generatedStepId } }, JsonOpts);
            var run = new AssetWorkflowRunEntity
            {
                Id = Guid.NewGuid().ToString("N"),
                WorkflowConfigId = fixture.ConfigId,
                AssetId = Guid.NewGuid().ToString("N"),
                Status = "InProgress",
                IsLocked = false,
                WorkflowSnapshotJson = JsonSerializer.Serialize(new { StepsJson = innerStepsJson }, JsonOpts),
            };
            db.AssetWorkflowRuns.Add(run);
            await db.SaveChangesAsync();
        }

        await SetFeatureCaptureFieldsAsync(fixture.FeatureId, new[] { "serialNo", "location" }); // drops "certification"
        var result = await SyncAsync(client, fixture.ConfigId);

        Assert.NotEmpty(result.Blocked); // the run-referenced step's removal is refused
        var stepAfter = Assert.Single(await GetStepsAsync(fixture.ConfigId));
        // The field is NOT removed — run-safety kept it, exactly as WF-4 already guarantees for
        // dependency-driven removals.
        Assert.Contains(stepAfter.GetProperty("captureFields").EnumerateArray(), f => f.GetProperty("key").GetString() == "certification");
    }

    // ── Capture-field "definition change" coverage: the current data model (Feature.captureFields
    //    as a flat string-key array, no per-key type) has no independent "type" to change for this
    //    fallback path — a rename (key swap) is the closest representable "definition change", and
    //    is exercised here as an add+remove combo. ──────────────────────────────────────────────

    [Fact]
    public async Task Sync_reflects_a_capture_field_rename_as_a_combined_add_and_remove()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedDependencyLessFeatureAsync(new[] { "serialNo", "location", "certification" });
        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 1);
        await SyncAsync(client, fixture.ConfigId);
        var beforeFields = Assert.Single(await GetStepsAsync(fixture.ConfigId)).GetProperty("captureFields").EnumerateArray()
            .ToDictionary(f => f.GetProperty("key").GetString()!, f => f.GetProperty("id").GetString()!);

        // "location" is redefined to "ipAddress" — a different capture key entirely.
        await SetFeatureCaptureFieldsAsync(fixture.FeatureId, new[] { "serialNo", "ipAddress", "certification" });
        var result = await SyncAsync(client, fixture.ConfigId);

        Assert.Single(result.Updated);
        var afterFields = Assert.Single(await GetStepsAsync(fixture.ConfigId)).GetProperty("captureFields").EnumerateArray()
            .ToDictionary(f => f.GetProperty("key").GetString()!, f => f.GetProperty("id").GetString()!);

        Assert.Equal(new HashSet<string> { "partNumber", "serialNo", "ipAddress", "certification" }, afterFields.Keys.ToHashSet());
        Assert.DoesNotContain("location", afterFields.Keys);
        // Untouched keys keep their exact prior ids.
        Assert.Equal(beforeFields["serialNo"], afterFields["serialNo"]);
        Assert.Equal(beforeFields["certification"], afterFields["certification"]);
    }

    // ── FINAL PRE-COMMIT CORRECTION: P/N is Product/Feature master data and must stay
    //    synchronized with it — reconciled on every Sync exactly like any other master-data-
    //    derived field, not "write once and never touch again". ─────────────────────────────────

    private JsonElement PartNumberField(JsonElement step) =>
        step.GetProperty("captureFields").EnumerateArray().Single(f => f.GetProperty("key").GetString() == "partNumber");

    private bool HasPartNumberField(JsonElement step) =>
        step.GetProperty("captureFields").EnumerateArray().Any(f => f.GetProperty("key").GetString() == "partNumber");

    [Fact]
    public async Task PartNumber_initial_generation_is_read_only_with_stable_deterministic_id()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedDependencyLessFeatureAsync(new[] { "serialNo" });
        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 1);

        await SyncAsync(client, fixture.ConfigId);
        var step1 = Assert.Single(await GetStepsAsync(fixture.ConfigId));
        var pn1 = PartNumberField(step1);
        Assert.True(pn1.GetProperty("readOnly").GetBoolean());
        Assert.False(pn1.GetProperty("required").GetBoolean());
        Assert.Equal("JB-100", pn1.GetProperty("value").GetString());

        // Identity is stable across a no-op re-sync (nothing changed).
        await SyncAsync(client, fixture.ConfigId);
        var pn2 = PartNumberField(Assert.Single(await GetStepsAsync(fixture.ConfigId)));
        Assert.Equal(pn1.GetProperty("id").GetString(), pn2.GetProperty("id").GetString());
    }

    [Fact]
    public async Task PartNumber_value_change_updates_in_place_same_id_other_fields_untouched_never_run_safety_gated()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedDependencyLessFeatureAsync(new[] { "serialNo", "location" });
        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 1);
        await SyncAsync(client, fixture.ConfigId);

        var before = Assert.Single(await GetStepsAsync(fixture.ConfigId));
        var pnIdBefore = PartNumberField(before).GetProperty("id").GetString();
        var serialIdBefore = before.GetProperty("captureFields").EnumerateArray().Single(f => f.GetProperty("key").GetString() == "serialNo").GetProperty("id").GetString();
        var locationIdBefore = before.GetProperty("captureFields").EnumerateArray().Single(f => f.GetProperty("key").GetString() == "location").GetProperty("id").GetString();

        // Even with a blocking run present on this exact step, a value-only P/N refresh must still
        // apply — updating a read-only reference value can never discard a technician's answer.
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var stepId = before.GetProperty("id").GetString()!;
            db.AssetWorkflowRuns.Add(new AssetWorkflowRunEntity
            {
                Id = Guid.NewGuid().ToString("N"),
                WorkflowConfigId = fixture.ConfigId,
                AssetId = Guid.NewGuid().ToString("N"),
                Status = "InProgress",
                IsLocked = false,
                WorkflowSnapshotJson = JsonSerializer.Serialize(new { StepsJson = JsonSerializer.Serialize(new[] { new { id = stepId } }, JsonOpts) }, JsonOpts),
            });
            await db.SaveChangesAsync();
        }

        // Product master change: HA-363 -> HA-364.
        await SetFeaturePartNumberAsync(fixture.FeatureId, "HA-364");
        var result = await SyncAsync(client, fixture.ConfigId);

        Assert.Single(result.Updated);
        Assert.Empty(result.Blocked); // the run only blocks unsafe removals, not this in-place update

        var after = Assert.Single(await GetStepsAsync(fixture.ConfigId));
        var pnAfter = PartNumberField(after);
        Assert.Equal("HA-364", pnAfter.GetProperty("value").GetString());
        Assert.Equal(pnIdBefore, pnAfter.GetProperty("id").GetString()); // same deterministic id, only the value changed
        Assert.True(pnAfter.GetProperty("readOnly").GetBoolean());

        // Unrelated fields are not deleted/recreated.
        Assert.Equal(serialIdBefore, after.GetProperty("captureFields").EnumerateArray().Single(f => f.GetProperty("key").GetString() == "serialNo").GetProperty("id").GetString());
        Assert.Equal(locationIdBefore, after.GetProperty("captureFields").EnumerateArray().Single(f => f.GetProperty("key").GetString() == "location").GetProperty("id").GetString());
        Assert.Equal(3, after.GetProperty("captureFields").GetArrayLength()); // partNumber + serialNo + location, nothing duplicated
    }

    [Fact]
    public async Task PartNumber_cleared_on_Product_master_is_removed_where_run_safety_permits_other_fields_and_custom_steps_untouched()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedDependencyLessFeatureAsync(new[] { "serialNo" });
        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 1);
        await SyncAsync(client, fixture.ConfigId);

        var before = Assert.Single(await GetStepsAsync(fixture.ConfigId));
        Assert.True(HasPartNumberField(before));
        var serialIdBefore = before.GetProperty("captureFields").EnumerateArray().Single(f => f.GetProperty("key").GetString() == "serialNo").GetProperty("id").GetString();

        // A pre-existing custom step must survive the removal untouched.
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var entity = await db.WorkflowConfigs.FirstAsync(c => c.Id == fixture.ConfigId);
            var steps = JsonSerializer.Deserialize<List<JsonElement>>(entity.StepsJson, JsonOpts)!.Cast<object>().ToList();
            steps.Add(new
            {
                id = "custom-prep-pn-clear", order = 99, title = "Custom Prep", description = "", overrideInReport = false,
                overrideReportText = "", includeDescriptionInReport = true, mediaIds = Array.Empty<string>(),
                decisionsEnabled = false, decisions = Array.Empty<object>(), inputs = Array.Empty<object>(),
                nextStepId = (string?)null, captureFields = Array.Empty<object>(), stepType = "preparation",
            });
            entity.StepsJson = JsonSerializer.Serialize(steps, JsonOpts);
            await db.SaveChangesAsync();
        }

        // Product master change: HA-364 -> cleared.
        await SetFeaturePartNumberAsync(fixture.FeatureId, null);
        var result = await SyncAsync(client, fixture.ConfigId);

        Assert.Single(result.Updated);
        Assert.Empty(result.Blocked); // nothing references this run, so the removal is safe

        var stepsAfter = await GetStepsAsync(fixture.ConfigId);
        Assert.Equal(2, stepsAfter.Count); // the generated step + the untouched custom step
        Assert.Contains(stepsAfter, s => s.GetProperty("id").GetString() == "custom-prep-pn-clear");

        var generatedAfter = stepsAfter.Single(s => s.GetProperty("id").GetString() != "custom-prep-pn-clear");
        Assert.False(HasPartNumberField(generatedAfter)); // no stale P/N left visible
        Assert.Equal(serialIdBefore, generatedAfter.GetProperty("captureFields").EnumerateArray().Single(f => f.GetProperty("key").GetString() == "serialNo").GetProperty("id").GetString());
    }

    [Fact]
    public async Task PartNumber_removal_is_run_safety_gated_a_blocked_step_keeps_its_stale_PartNumber_and_is_reported_blocked()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedDependencyLessFeatureAsync(new[] { "serialNo" });
        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 1);
        await SyncAsync(client, fixture.ConfigId);
        var generatedStepId = Assert.Single(await GetStepsAsync(fixture.ConfigId)).GetProperty("id").GetString()!;

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var innerStepsJson = JsonSerializer.Serialize(new[] { new { id = generatedStepId } }, JsonOpts);
            db.AssetWorkflowRuns.Add(new AssetWorkflowRunEntity
            {
                Id = Guid.NewGuid().ToString("N"),
                WorkflowConfigId = fixture.ConfigId,
                AssetId = Guid.NewGuid().ToString("N"),
                Status = "InProgress",
                IsLocked = false,
                WorkflowSnapshotJson = JsonSerializer.Serialize(new { StepsJson = innerStepsJson }, JsonOpts),
            });
            await db.SaveChangesAsync();
        }

        await SetFeaturePartNumberAsync(fixture.FeatureId, null); // cleared while a run still references this step
        var result = await SyncAsync(client, fixture.ConfigId);

        Assert.NotEmpty(result.Blocked);
        var stepAfter = Assert.Single(await GetStepsAsync(fixture.ConfigId));
        Assert.True(HasPartNumberField(stepAfter)); // NOT removed — run-safety kept it, exactly as any other blocked removal
    }

    [Fact]
    public async Task PartNumber_restored_on_Product_master_reappears_with_the_same_deterministic_id_as_before()
    {
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedDependencyLessFeatureAsync(new[] { "serialNo" });
        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 1);
        await SyncAsync(client, fixture.ConfigId);
        var pnIdOriginal = PartNumberField(Assert.Single(await GetStepsAsync(fixture.ConfigId))).GetProperty("id").GetString();

        // Cleared, then synced away.
        await SetFeaturePartNumberAsync(fixture.FeatureId, null);
        await SyncAsync(client, fixture.ConfigId);
        Assert.False(HasPartNumberField(Assert.Single(await GetStepsAsync(fixture.ConfigId))));

        // Restored to the SAME value.
        await SetFeaturePartNumberAsync(fixture.FeatureId, "JB-100");
        var result = await SyncAsync(client, fixture.ConfigId);

        Assert.Single(result.Updated);
        var restored = PartNumberField(Assert.Single(await GetStepsAsync(fixture.ConfigId)));
        Assert.Equal("JB-100", restored.GetProperty("value").GetString());
        // Deterministic: restoring produces the exact same id as originally generated, since
        // PartNumberFieldId depends only on featureId/unitIndex, never on the value itself.
        Assert.Equal(pnIdOriginal, restored.GetProperty("id").GetString());
    }

    [Fact]
    public async Task Regenerate_client_semantics_omit_PartNumber_when_no_Feature_PN_is_configured()
    {
        // Mirrors buildAutoSteps' client-side fallback rule: partNumber = libFeat?.alternativePartNumber
        // || libFeat?.manufacturerPartNumber || ""; the field is only ever added when that resolves
        // non-empty. Verified here via the equivalent server-side path (ResolvePartNumber / Sync),
        // which shares the exact same precedence and "omit when unset" rule.
        var client = await CreateAuthenticatedClientAsync(_factory);
        var fixture = await SeedDependencyLessFeatureAsync(new[] { "serialNo" });
        await SetFeaturePartNumberAsync(fixture.FeatureId, null);
        await SetQuantityAsync(fixture.ConfigId, fixture.FeatureId, 1);

        await SyncAsync(client, fixture.ConfigId);

        var step = Assert.Single(await GetStepsAsync(fixture.ConfigId));
        Assert.False(HasPartNumberField(step));
        Assert.Contains(step.GetProperty("captureFields").EnumerateArray(), f => f.GetProperty("key").GetString() == "serialNo");
    }
}
