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

// WF-6 B/C: the reusable workflow JSON export (GET {id}/export) and import
// (POST {id}/import/validate, POST {id}/import) — the WF-1 schema.
[Collection(ApiTestCollection.Name)]
public class WorkflowExportImportTests : IClassFixture<ApiTestFactory>
{
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);
    private readonly ApiTestFactory _factory;

    public WorkflowExportImportTests(ApiTestFactory factory) => _factory = factory;

    [Fact]
    public async Task Export_does_not_duplicate_Product_master_definitions()
    {
        var client = await CreateAuthenticatedClientAsync();
        var (productId, featureId, depId) = await SeedProductFeatureDepAsync();
        var configId = await SeedConfigWithFeatureAsync(productId, featureId, depId, quantity: 1);

        var resp = await client.GetAsync($"/api/workflow-configs/{configId}/export");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadAsStringAsync();

        using var doc = JsonDocument.Parse(body);
        var fs = Assert.Single(doc.RootElement.GetProperty("featureSelections").EnumerateArray());
        var props = fs.EnumerateObject().Select(p => p.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        // References + selection state ONLY — no Feature/FeatureDependency master fields
        // (name, description, valueType, captureFields, etc.) duplicated in here.
        Assert.Equal(new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "featureId", "quantity", "inclusions" }, props);
        Assert.DoesNotContain("captureFields", body);
        Assert.DoesNotContain("\"name\":\"Camera Unit\"", body);
    }

    [Fact]
    public async Task Export_then_import_into_a_new_config_preserves_feature_quantities_and_inclusions()
    {
        var client = await CreateAuthenticatedClientAsync();
        var (productId, featureId, depId) = await SeedProductFeatureDepAsync();
        var sourceConfigId = await SeedConfigWithFeatureAsync(productId, featureId, depId, quantity: 3);

        var exportDoc = await ExportAsync(client, sourceConfigId);

        var targetConfigId = await SeedEmptyConfigAsync(productId);
        var importResp = await client.PostAsJsonAsync($"/api/workflow-configs/{targetConfigId}/import", exportDoc);
        Assert.Equal(HttpStatusCode.OK, importResp.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var cf = await db.WorkflowConfigFeatures.SingleAsync(f => f.WorkflowConfigId == targetConfigId);
        Assert.Equal(featureId, cf.FeatureId);
        Assert.Equal(3, cf.Quantity);
        var inclusions = JsonSerializer.Deserialize<Dictionary<string, bool>>(cf.InclusionsJson, JsonOpts)!;
        Assert.True(inclusions[depId]);
    }

    [Fact]
    public async Task Custom_steps_survive_the_round_trip_unchanged()
    {
        var client = await CreateAuthenticatedClientAsync();
        var (productId, featureId, depId) = await SeedProductFeatureDepAsync();
        var sourceConfigId = await SeedConfigWithFeatureAsync(productId, featureId, depId, quantity: 1);
        await AddCustomStepAsync(sourceConfigId, "custom-1", "Preparation & Permits");

        var exportDoc = await ExportAsync(client, sourceConfigId);
        var targetConfigId = await SeedEmptyConfigAsync(productId);
        await client.PostAsJsonAsync($"/api/workflow-configs/{targetConfigId}/import", exportDoc);

        var stepsAfter = await GetStepsJsonAsync(targetConfigId);
        var custom = stepsAfter.Single(s => s.GetProperty("id").GetString() == "custom-1");
        Assert.Equal("Preparation & Permits", custom.GetProperty("title").GetString());
    }

    [Fact]
    public async Task Generated_steps_are_regenerated_from_Product_master_not_copied_from_the_import_file()
    {
        var client = await CreateAuthenticatedClientAsync();
        var (productId, featureId, depId) = await SeedProductFeatureDepAsync();
        var sourceConfigId = await SeedConfigWithFeatureAsync(productId, featureId, depId, quantity: 1);
        var exportDoc = await ExportAsync(client, sourceConfigId);

        // Tamper with the export's own generated-step content — a real import must never trust
        // this; it must regenerate everything from Product master + featureSelections instead.
        var tampered = JsonDocument.Parse(JsonSerializer.Serialize(exportDoc, JsonOpts)).RootElement;
        var tamperedJson = tampered.GetRawText().Replace("\"stepType\":\"installation\"", "\"stepType\":\"installation\",\"title\":\"TAMPERED\"");

        var targetConfigId = await SeedEmptyConfigAsync(productId);
        using var content = new StringContent(tamperedJson, System.Text.Encoding.UTF8, "application/json");
        var importResp = await client.PostAsync($"/api/workflow-configs/{targetConfigId}/import", content);
        Assert.Equal(HttpStatusCode.OK, importResp.StatusCode);

        var stepsAfter = await GetStepsJsonAsync(targetConfigId);
        Assert.DoesNotContain(stepsAfter, s => s.TryGetProperty("title", out var t) && t.GetString() == "TAMPERED");
    }

    [Fact]
    public async Task Generated_ids_and_generatorKeys_match_deterministic_WF3_identities()
    {
        var client = await CreateAuthenticatedClientAsync();
        var (productId, featureId, depId) = await SeedProductFeatureDepAsync();
        var sourceConfigId = await SeedConfigWithFeatureAsync(productId, featureId, depId, quantity: 1);
        var exportDoc = await ExportAsync(client, sourceConfigId);

        var targetConfigId = await SeedEmptyConfigAsync(productId);
        await client.PostAsJsonAsync($"/api/workflow-configs/{targetConfigId}/import", exportDoc);

        // Independently reconstruct via a real sync on a THIRD config with the same feature
        // setup — the ids must match exactly, proving import used the same generator.
        var comparisonConfigId = await SeedConfigWithFeatureAsync(productId, featureId, depId, quantity: 1);
        var syncResp = await client.PostAsync($"/api/workflow-configs/{comparisonConfigId}/sync-feature-steps", null);
        syncResp.EnsureSuccessStatusCode();

        var importedSteps = await GetStepsJsonAsync(targetConfigId);
        var syncedSteps = await GetStepsJsonAsync(comparisonConfigId);
        var importedGenerated = importedSteps.Single(s => s.TryGetProperty("stepOrigin", out var o) && o.GetString() == "feature-generated");
        var syncedGenerated = syncedSteps.Single(s => s.TryGetProperty("stepOrigin", out var o) && o.GetString() == "feature-generated");

        Assert.Equal(syncedGenerated.GetProperty("id").GetString(), importedGenerated.GetProperty("id").GetString());
        Assert.Equal(syncedGenerated.GetProperty("generatorKey").GetString(), importedGenerated.GetProperty("generatorKey").GetString());
    }

    [Fact]
    public async Task Unknown_feature_id_is_rejected()
    {
        var client = await CreateAuthenticatedClientAsync();
        var (productId, _, _) = await SeedProductFeatureDepAsync();
        var targetConfigId = await SeedEmptyConfigAsync(productId);

        var request = new
        {
            schemaVersion = 1, productId, name = "x",
            featureSelections = new[] { new { featureId = "does-not-exist", quantity = 1, inclusions = new Dictionary<string, bool>() } },
            steps = Array.Empty<object>(),
        };

        var validateResp = await client.PostAsJsonAsync($"/api/workflow-configs/{targetConfigId}/import/validate", request);
        var validation = JsonSerializer.Deserialize<WorkflowImportValidationDto>(await validateResp.Content.ReadAsStringAsync(), JsonOpts)!;
        Assert.False(validation.Valid);
        Assert.Contains("does-not-exist", validation.UnknownFeatureIds);

        var importResp = await client.PostAsJsonAsync($"/api/workflow-configs/{targetConfigId}/import", request);
        Assert.Equal(HttpStatusCode.BadRequest, importResp.StatusCode);

        var cfCount = await CountConfigFeaturesAsync(targetConfigId);
        Assert.Equal(0, cfCount); // nothing written
    }

    [Fact]
    public async Task Unknown_dependency_id_is_rejected()
    {
        var client = await CreateAuthenticatedClientAsync();
        var (productId, featureId, _) = await SeedProductFeatureDepAsync();
        var targetConfigId = await SeedEmptyConfigAsync(productId);

        var request = new
        {
            schemaVersion = 1, productId, name = "x",
            featureSelections = new[] { new { featureId, quantity = 1, inclusions = new Dictionary<string, bool> { ["does-not-exist"] = true } } },
            steps = Array.Empty<object>(),
        };

        var validateResp = await client.PostAsJsonAsync($"/api/workflow-configs/{targetConfigId}/import/validate", request);
        var validation = JsonSerializer.Deserialize<WorkflowImportValidationDto>(await validateResp.Content.ReadAsStringAsync(), JsonOpts)!;
        Assert.False(validation.Valid);
        Assert.Contains("does-not-exist", validation.UnknownDependencyIds);

        var importResp = await client.PostAsJsonAsync($"/api/workflow-configs/{targetConfigId}/import", request);
        Assert.Equal(HttpStatusCode.BadRequest, importResp.StatusCode);
    }

    [Fact]
    public async Task Product_mismatch_is_rejected()
    {
        var client = await CreateAuthenticatedClientAsync();
        var (productId, featureId, depId) = await SeedProductFeatureDepAsync();
        var sourceConfigId = await SeedConfigWithFeatureAsync(productId, featureId, depId, quantity: 1);
        var exportDoc = await ExportAsync(client, sourceConfigId);

        var (otherProductId, _, _) = await SeedProductFeatureDepAsync();
        var targetConfigId = await SeedEmptyConfigAsync(otherProductId); // different product

        var validateResp = await client.PostAsJsonAsync($"/api/workflow-configs/{targetConfigId}/import/validate", exportDoc);
        var validation = JsonSerializer.Deserialize<WorkflowImportValidationDto>(await validateResp.Content.ReadAsStringAsync(), JsonOpts)!;
        Assert.False(validation.Valid);
        Assert.False(validation.ProductMatches);

        var importResp = await client.PostAsJsonAsync($"/api/workflow-configs/{targetConfigId}/import", exportDoc);
        Assert.Equal(HttpStatusCode.BadRequest, importResp.StatusCode);
    }

    [Fact]
    public async Task Malformed_or_unsupported_schemaVersion_is_rejected()
    {
        var client = await CreateAuthenticatedClientAsync();
        var (productId, featureId, _) = await SeedProductFeatureDepAsync();
        var targetConfigId = await SeedEmptyConfigAsync(productId);

        var request = new
        {
            schemaVersion = 999, productId, name = "x",
            featureSelections = new[] { new { featureId, quantity = 1, inclusions = new Dictionary<string, bool>() } },
            steps = Array.Empty<object>(),
        };

        var validateResp = await client.PostAsJsonAsync($"/api/workflow-configs/{targetConfigId}/import/validate", request);
        var validation = JsonSerializer.Deserialize<WorkflowImportValidationDto>(await validateResp.Content.ReadAsStringAsync(), JsonOpts)!;
        Assert.False(validation.Valid);
        Assert.False(validation.SchemaVersionSupported);

        var importResp = await client.PostAsJsonAsync($"/api/workflow-configs/{targetConfigId}/import", request);
        Assert.Equal(HttpStatusCode.BadRequest, importResp.StatusCode);
    }

    [Fact]
    public async Task Duplicate_featureId_in_featureSelections_is_rejected()
    {
        var client = await CreateAuthenticatedClientAsync();
        var (productId, featureId, depId) = await SeedProductFeatureDepAsync();
        var targetConfigId = await SeedEmptyConfigAsync(productId);

        var request = new
        {
            schemaVersion = 1, productId, name = "x",
            featureSelections = new[]
            {
                new { featureId, quantity = 1, inclusions = new Dictionary<string, bool> { [depId] = true } },
                new { featureId, quantity = 3, inclusions = new Dictionary<string, bool>() }, // same featureId again
            },
            steps = Array.Empty<object>(),
        };

        var validateResp = await client.PostAsJsonAsync($"/api/workflow-configs/{targetConfigId}/import/validate", request);
        var validation = JsonSerializer.Deserialize<WorkflowImportValidationDto>(await validateResp.Content.ReadAsStringAsync(), JsonOpts)!;
        Assert.False(validation.Valid);
        Assert.Contains(featureId, validation.DuplicateFeatureIds);

        var importResp = await client.PostAsJsonAsync($"/api/workflow-configs/{targetConfigId}/import", request);
        Assert.Equal(HttpStatusCode.BadRequest, importResp.StatusCode);
        Assert.Equal(0, await CountConfigFeaturesAsync(targetConfigId)); // nothing written
    }

    // WF-6 correction #1: import must be atomic — a failure partway through must roll back to the
    // exact pre-import state, not leave the WorkflowConfigFeature replacement persisted while the
    // rest of the operation never completed.
    [Fact]
    public async Task Import_failure_after_feature_selection_replacement_rolls_back_completely()
    {
        var client = await CreateAuthenticatedClientAsync();
        var (productId, featureId, depId) = await SeedProductFeatureDepAsync();
        var targetConfigId = await SeedEmptyConfigAsync(productId);

        // Corrupt the target's StepsJson so the deserialize that runs AFTER the
        // WorkflowConfigFeature replacement (but still inside the same transaction, before
        // reconciliation/commit) throws — a realistic failure point to prove atomicity against.
        const string corruptStepsJson = "{not valid json";
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var entity = await db.WorkflowConfigs.FirstAsync(c => c.Id == targetConfigId);
            entity.StepsJson = corruptStepsJson;
            await db.SaveChangesAsync();
        }

        var request = new
        {
            schemaVersion = 1, productId, name = "Should Not Apply",
            featureSelections = new[] { new { featureId, quantity = 1, inclusions = new Dictionary<string, bool> { [depId] = true } } },
            steps = Array.Empty<object>(),
        };

        var importResp = await client.PostAsJsonAsync($"/api/workflow-configs/{targetConfigId}/import", request);
        Assert.True(((int)importResp.StatusCode) >= 500, $"expected a server error, got {importResp.StatusCode}");

        // Nothing persisted: no WorkflowConfigFeature rows, config fields exactly as they were.
        Assert.Equal(0, await CountConfigFeaturesAsync(targetConfigId));

        using var verifyScope = _factory.Services.CreateScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
        var configAfter = await verifyDb.WorkflowConfigs.AsNoTracking().FirstAsync(c => c.Id == targetConfigId);
        Assert.Equal(corruptStepsJson, configAfter.StepsJson);
        Assert.Equal("[]", configAfter.FeatureSelectionsJson);
        Assert.Equal("Target Draft", configAfter.Name); // seeded name, not "Should Not Apply"
    }

    // WF-6 correction #2: import is all-or-nothing on run safety — unlike an ordinary Sync
    // Feature Steps call (whose partial-application behavior is unchanged), an import that would
    // require removing a run-referenced generated step must be rejected in full, leaving feature
    // selections, custom steps, and generated steps exactly as they were.
    [Fact]
    public async Task Import_is_rejected_when_it_would_remove_a_run_referenced_step_and_nothing_changes()
    {
        var client = await CreateAuthenticatedClientAsync();
        var (productId, featureId, depId) = await SeedProductFeatureDepAsync();
        var configId = await SeedConfigWithFeatureAsync(productId, featureId, depId, quantity: 2);
        var syncResp = await client.PostAsync($"/api/workflow-configs/{configId}/sync-feature-steps", null);
        syncResp.EnsureSuccessStatusCode();

        var stepsBefore = await GetStepsJsonAsync(configId);
        var unit2Step = stepsBefore.Single(s => s.TryGetProperty("stepUnitIndex", out var u) && u.GetInt32() == 2);
        var unit2StepId = unit2Step.GetProperty("id").GetString()!;
        var runId = await SeedBlockingRunAsync(configId, unit2StepId);

        // This import wants quantity 1 — would remove unit 2's step, which the run references.
        var request = new
        {
            schemaVersion = 1, productId, name = "Should Not Apply",
            featureSelections = new[] { new { featureId, quantity = 1, inclusions = new Dictionary<string, bool> { [depId] = true } } },
            steps = Array.Empty<object>(),
        };

        var importResp = await client.PostAsJsonAsync($"/api/workflow-configs/{configId}/import", request);
        Assert.Equal(HttpStatusCode.Conflict, importResp.StatusCode);

        var blocked = JsonSerializer.Deserialize<WorkflowImportBlockedDto>(await importResp.Content.ReadAsStringAsync(), JsonOpts)!;
        var blockedItem = Assert.Single(blocked.BlockedSteps, s => s.StepId == unit2StepId);
        Assert.Contains(blockedItem.BlockingRuns!, r => r.RunId == runId);

        // Feature selections unchanged (still quantity 2).
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var cf = await db.WorkflowConfigFeatures.AsNoTracking().SingleAsync(f => f.WorkflowConfigId == configId);
        Assert.Equal(2, cf.Quantity);

        // Generated steps unchanged — exact same set of ids as before the import attempt.
        var stepsAfter = await GetStepsJsonAsync(configId);
        Assert.Equal(
            stepsBefore.Select(s => s.GetProperty("id").GetString()).OrderBy(x => x),
            stepsAfter.Select(s => s.GetProperty("id").GetString()).OrderBy(x => x));

        // Config name unchanged — the whole import was rejected, not partially applied.
        var configAfter = await db.WorkflowConfigs.AsNoTracking().FirstAsync(c => c.Id == configId);
        Assert.NotEqual("Should Not Apply", configAfter.Name);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private async Task<string> SeedBlockingRunAsync(string configId, string stepId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var config = await db.WorkflowConfigs.FirstAsync(c => c.Id == configId);
        var runId = Guid.NewGuid().ToString("N");
        var assetId = Guid.NewGuid().ToString("N");
        var snapshotStepsJson = JsonSerializer.Serialize(new[] { new { id = stepId } });
        var snapshotJson = JsonSerializer.Serialize(new { id = configId, name = config.Name, stepsJson = snapshotStepsJson });
        db.AssetWorkflowRuns.Add(new AssetWorkflowRunEntity
        {
            Id = runId,
            AssetId = assetId,
            WorkflowConfigId = configId,
            WorkflowVersion = config.Version,
            WorkflowSnapshotJson = snapshotJson,
            Status = "InProgress",
            IsLocked = false,
            StepResultsJson = "[]",
        });
        await db.SaveChangesAsync();
        return runId;
    }

    private async Task<JsonElement> ExportAsync(HttpClient client, string configId)
    {
        var resp = await client.GetAsync($"/api/workflow-configs/{configId}/export");
        resp.EnsureSuccessStatusCode();
        return JsonDocument.Parse(await resp.Content.ReadAsStringAsync()).RootElement.Clone();
    }

    private async Task<List<JsonElement>> GetStepsJsonAsync(string configId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var entity = await db.WorkflowConfigs.FirstAsync(c => c.Id == configId);
        return JsonSerializer.Deserialize<List<JsonElement>>(entity.StepsJson, JsonOpts) ?? new();
    }

    private async Task<int> CountConfigFeaturesAsync(string configId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.WorkflowConfigFeatures.CountAsync(f => f.WorkflowConfigId == configId);
    }

    private async Task AddCustomStepAsync(string configId, string stepId, string title)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var entity = await db.WorkflowConfigs.FirstAsync(c => c.Id == configId);
        var customStep = new
        {
            id = stepId, order = 0, title, description = "", overrideInReport = false, overrideReportText = "",
            includeDescriptionInReport = true, mediaIds = Array.Empty<string>(), decisionsEnabled = false,
            decisions = Array.Empty<object>(), inputs = Array.Empty<object>(), nextStepId = (string?)null,
            captureFields = Array.Empty<object>(), stepType = "preparation",
        };
        entity.StepsJson = JsonSerializer.Serialize(new[] { customStep }, JsonOpts);
        await db.SaveChangesAsync();
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

    private Task<HttpClient> CreateAuthenticatedClientAsync() => CreateAuthenticatedClientAsync(_factory);

    private async Task<(string productId, string featureId, string depId)> SeedProductFeatureDepAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var productId = Guid.NewGuid().ToString("N");
        db.Products.Add(new ProductEntity { Id = productId, Name = "Test Product" });

        var featureId = Guid.NewGuid().ToString("N");
        db.Features.Add(new FeatureEntity { Id = featureId, Name = "Test Camera", ValueType = "component", IsInventory = true });
        db.ProductFeatures.Add(new ProductFeatureEntity { Id = Guid.NewGuid().ToString("N"), ProductId = productId, FeatureId = featureId, SortOrder = 0 });

        var depId = Guid.NewGuid().ToString("N");
        db.FeatureDependencies.Add(new FeatureDependencyEntity
        {
            Id = depId, FeatureId = featureId, Name = "Camera Unit", IsInventory = true, CaptureFieldsJson = "[\"serialNo\"]",
        });

        await db.SaveChangesAsync();
        return (productId, featureId, depId);
    }

    private async Task<string> SeedEmptyConfigAsync(string productId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var now = DateTime.UtcNow;
        var configId = Guid.NewGuid().ToString("N");
        db.WorkflowConfigs.Add(new WorkflowConfigEntity
        {
            Id = configId, ProductId = productId, Name = "Target Draft", Status = "Draft", Version = 1,
            StepsJson = "[]", MediaJson = "[]", FeatureSelectionsJson = "[]", CreatedAt = now, UpdatedAt = now,
        });
        await db.SaveChangesAsync();
        return configId;
    }

    private async Task<string> SeedConfigWithFeatureAsync(string productId, string featureId, string depId, int quantity)
    {
        var configId = await SeedEmptyConfigAsync(productId);
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.WorkflowConfigFeatures.Add(new WorkflowConfigFeatureEntity
        {
            Id = Guid.NewGuid().ToString("N"), WorkflowConfigId = configId, FeatureId = featureId,
            Quantity = quantity, InclusionsJson = $"{{\"{depId}\":true}}",
        });
        await db.SaveChangesAsync();
        return configId;
    }
}
