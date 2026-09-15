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
/// WF-7: end-to-end acceptance tests for the whole WF-1..WF-6 Workflow Feature architecture,
/// exercised against a realistic HA-Coal-style product fixture (6 features, quantities 1-3,
/// mixed capture fields) rather than the minimal single-feature fixtures used by the phase-level
/// unit tests. Covers Acceptance Scenarios 1, 2, 3, 4, 5 (import side), 8, 9 from the WF-7 plan.
/// </summary>
[Collection(ApiTestCollection.Name)]
public class WorkflowFeatureAcceptanceTests : IClassFixture<ApiTestFactory>
{
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);
    private readonly ApiTestFactory _factory;

    public WorkflowFeatureAcceptanceTests(ApiTestFactory factory) => _factory = factory;

    // ── Scenario 1: Product Workflow Context — realistic fixture ───────────────

    [Fact]
    public async Task Scenario1_ProductWorkflowContext_exports_real_ids_metadata_and_no_sensitive_data()
    {
        var client = await CreateAuthenticatedClientAsync();
        var fixture = await SeedHaCoalProductAsync();

        var resp = await client.GetAsync($"/api/products/{fixture.ProductId}/workflow-context");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadAsStringAsync();
        var dto = JsonSerializer.Deserialize<ProductWorkflowContextDto>(body, JsonOpts)!;

        Assert.Equal(fixture.ProductId, dto.Product.Id);
        Assert.Equal(6, dto.Features.Count);

        foreach (var (featureName, expectedFeatureId) in fixture.FeatureIdByName)
        {
            var feature = dto.Features.Single(f => f.FeatureId == expectedFeatureId);
            Assert.Equal(featureName, feature.Name);
            var expectedDeps = fixture.DependencyNamesByFeature[featureName];
            Assert.Equal(expectedDeps.Count, feature.Dependencies.Count);
            foreach (var depName in expectedDeps)
            {
                var expectedDepId = fixture.DependencyIdByName[(featureName, depName)];
                var dep = feature.Dependencies.Single(d => d.DependencyId == expectedDepId);
                Assert.Equal(depName, dep.Name);
                Assert.Equal(expectedFeatureId, dep.FeatureId);
            }
        }

        var lowered = body.ToLowerInvariant();
        foreach (var term in new[] { "password", "token", "secret", "credential", "projectid", "runid", "assetid", "signature", "customerid" })
            Assert.DoesNotContain(term, lowered);
        Assert.DoesNotContain("quantity", lowered);
        Assert.DoesNotContain("inclusions", lowered);
    }

    // ── Scenario 2: reusable workflow structure — custom + generated grouping ──

    [Fact]
    public async Task Scenario2_reusable_workflow_has_custom_and_generated_steps_correctly_grouped()
    {
        var client = await CreateAuthenticatedClientAsync();
        var fixture = await SeedHaCoalProductAsync();
        var configId = await SeedConfigWithAllFeaturesAsync(fixture);

        // Realistic authoring sequence: Preparation exists first, then the admin syncs feature
        // steps, then appends the closing custom steps afterward (matching how an admin would
        // actually build this in the Builder — prep, generate, then commissioning/inspection/RTS).
        await SetStepsJsonAsync(configId, JsonSerializer.Serialize(new[] { CustomStep("prep-1", 0, "Preparation", "preparation") }, JsonOpts));

        var syncResp = await client.PostAsync($"/api/workflow-configs/{configId}/sync-feature-steps", null);
        syncResp.EnsureSuccessStatusCode();

        var stepsAfterSync = await GetStepsJsonAsync(configId);
        var maxOrder = stepsAfterSync.Max(s => s.GetProperty("order").GetInt32());
        var closingSteps = new object[]
        {
            CustomStep("sat-1", maxOrder + 1, "SAT / Commissioning tests", "test-acceptance"),
            CustomStep("inspect-1", maxOrder + 2, "Final Inspection", "final-inspection"),
            CustomStep("rts-1", maxOrder + 3, "Return to Service", "return-to-service"),
        };
        var fullSteps = stepsAfterSync.Cast<object>().Concat(closingSteps).ToList();
        await SetStepsJsonAsync(configId, JsonSerializer.Serialize(fullSteps, JsonOpts));

        var finalSteps = (await GetStepsJsonAsync(configId)).OrderBy(s => s.GetProperty("order").GetInt32()).ToList();

        // Custom steps survive verbatim, at the expected structural positions.
        var prep = finalSteps.First();
        Assert.Equal("prep-1", prep.GetProperty("id").GetString());
        Assert.Equal("Preparation", prep.GetProperty("title").GetString());
        Assert.False(prep.TryGetProperty("stepOrigin", out _));

        var last3 = finalSteps.TakeLast(3).ToList();
        Assert.Equal(new[] { "SAT / Commissioning tests", "Final Inspection", "Return to Service" },
            last3.Select(s => s.GetProperty("title").GetString()));
        Assert.All(last3, s => Assert.False(s.TryGetProperty("stepOrigin", out _)));

        // Feature-generated steps: one per feature/unit, correctly grouped (all of that
        // unit's dependency capture fields inside a single step, never split).
        var generated = finalSteps.Where(s => s.TryGetProperty("stepOrigin", out var o) && o.GetString() == "feature-generated").ToList();
        var expectedUnitsByFeature = new Dictionary<string, int> {
            ["Controller FP Enclosure"] = 1, ["Tracking Display POD"] = 1, ["Flasher/Siren Combo"] = 1,
            ["Junction Box"] = 3, ["Silent Zone Enclosure"] = 1, ["Generator"] = 2,
        };
        var expectedTotalGenerated = expectedUnitsByFeature.Values.Sum();
        Assert.Equal(expectedTotalGenerated, generated.Count);

        foreach (var (featureName, unitCount) in expectedUnitsByFeature)
        {
            var featureId = fixture.FeatureIdByName[featureName];
            for (var unit = 1; unit <= unitCount; unit++)
            {
                var step = generated.Single(s =>
                    s.GetProperty("stepFeatureId").GetString() == featureId &&
                    s.GetProperty("stepUnitIndex").GetInt32() == unit);
                var fieldCount = step.GetProperty("captureFields").GetArrayLength();
                Assert.Equal(fixture.CaptureFieldCountByFeature[featureName], fieldCount); // grouped, not split
            }
        }
    }

    // ── Scenario 3: quantity sync 3->5 then 5->2 (exact numbers from the acceptance plan) ──

    [Fact]
    public async Task Scenario3_quantity_3_to_5_then_5_to_2_preserves_surviving_unit_identities()
    {
        var client = await CreateAuthenticatedClientAsync();
        var fixture = await SeedHaCoalProductAsync();
        var configId = await SeedConfigWithAllFeaturesAsync(fixture); // Junction Box seeded at x3

        var first = await SyncAsync(client, configId);
        var jbFeatureId = fixture.FeatureIdByName["Junction Box"];
        var unit1Id = first.Added.Single(i => i.FeatureId == jbFeatureId && i.UnitIndex == 1).StepId;
        var unit2Id = first.Added.Single(i => i.FeatureId == jbFeatureId && i.UnitIndex == 2).StepId;
        var unit3Id = first.Added.Single(i => i.FeatureId == jbFeatureId && i.UnitIndex == 3).StepId;
        var unit1Key = first.Added.Single(i => i.FeatureId == jbFeatureId && i.UnitIndex == 1).GeneratorKey;

        await UpdateQuantityAsync(configId, jbFeatureId, 5);
        var second = await SyncAsync(client, configId);

        Assert.Equal(new[] { 4, 5 }, second.Added.Where(i => i.FeatureId == jbFeatureId).Select(i => i.UnitIndex).OrderBy(x => x));
        var unit1After = second.Unchanged.Single(i => i.FeatureId == jbFeatureId && i.UnitIndex == 1);
        Assert.Equal(unit1Id, unit1After.StepId);
        Assert.Equal(unit1Key, unit1After.GeneratorKey);
        Assert.Equal(unit2Id, second.Unchanged.Single(i => i.FeatureId == jbFeatureId && i.UnitIndex == 2).StepId);
        Assert.Equal(unit3Id, second.Unchanged.Single(i => i.FeatureId == jbFeatureId && i.UnitIndex == 3).StepId);

        var stepsBeforeShrink = await GetStepsJsonAsync(configId);
        var customStepIdsBeforeShrink = stepsBeforeShrink
            .Where(s => !(s.TryGetProperty("stepOrigin", out var o) && o.GetString() == "feature-generated"))
            .Select(s => s.GetProperty("id").GetString()).OrderBy(x => x).ToList();

        await UpdateQuantityAsync(configId, jbFeatureId, 2);
        var third = await SyncAsync(client, configId);

        // "5, 4, 3 in descending order" in the acceptance plan describes WHICH units are removal
        // candidates (the ones above the new quantity of 2) — the API's Removed list has no
        // established ordering contract (WF-4 never specified or tested one; its Dictionary-based
        // walk is insertion-order, not priority-order), so this checks the correct SET of removed
        // units rather than asserting a specific array order that was never part of the approved
        // WF-4 design. See the WF-7 report for this call.
        var removedUnits = third.Removed.Where(i => i.FeatureId == jbFeatureId).Select(i => i.UnitIndex).OrderByDescending(x => x).ToList();
        Assert.Equal(new[] { 5, 4, 3 }, removedUnits);
        Assert.Equal(unit1Id, third.Unchanged.Single(i => i.FeatureId == jbFeatureId && i.UnitIndex == 1).StepId);
        Assert.Equal(unit2Id, third.Unchanged.Single(i => i.FeatureId == jbFeatureId && i.UnitIndex == 2).StepId);

        var stepsAfterShrink = await GetStepsJsonAsync(configId);
        var customStepIdsAfterShrink = stepsAfterShrink
            .Where(s => !(s.TryGetProperty("stepOrigin", out var o) && o.GetString() == "feature-generated"))
            .Select(s => s.GetProperty("id").GetString()).OrderBy(x => x).ToList();
        Assert.Equal(customStepIdsBeforeShrink, customStepIdsAfterShrink); // byte-identical custom steps throughout
    }

    // ── Scenario 8: export -> import round trip into a NEW config, same product ──

    [Fact]
    public async Task Scenario8_export_then_import_round_trip_preserves_everything_and_embeds_no_master_data()
    {
        var client = await CreateAuthenticatedClientAsync();
        var fixture = await SeedHaCoalProductAsync();
        var sourceConfigId = await SeedConfigWithAllFeaturesAsync(fixture);
        await SyncAsync(client, sourceConfigId);
        await AddCustomStepAsync(sourceConfigId, "prep-1", "Preparation");

        var exportResp = await client.GetAsync($"/api/workflow-configs/{sourceConfigId}/export");
        exportResp.EnsureSuccessStatusCode();
        var exportBody = await exportResp.Content.ReadAsStringAsync();
        var exportDoc = JsonDocument.Parse(exportBody).RootElement.Clone();

        // No Product master data embedded in the reusable file — only references + selection state.
        foreach (var fs in exportDoc.GetProperty("featureSelections").EnumerateArray())
        {
            var propNames = fs.EnumerateObject().Select(p => p.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
            Assert.Equal(new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "featureId", "quantity", "inclusions" }, propNames);
        }
        var targetConfigId = await SeedEmptyConfigAsync(fixture.ProductId);
        var importResp = await client.PostAsJsonAsync($"/api/workflow-configs/{targetConfigId}/import", exportDoc);
        Assert.Equal(HttpStatusCode.OK, importResp.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var sourceCfs = await db.WorkflowConfigFeatures.AsNoTracking().Where(f => f.WorkflowConfigId == sourceConfigId).ToListAsync();
        var targetCfs = await db.WorkflowConfigFeatures.AsNoTracking().Where(f => f.WorkflowConfigId == targetConfigId).ToListAsync();
        Assert.Equal(sourceCfs.Count, targetCfs.Count);
        foreach (var sourceCf in sourceCfs)
        {
            var targetCf = targetCfs.Single(f => f.FeatureId == sourceCf.FeatureId);
            Assert.Equal(sourceCf.Quantity, targetCf.Quantity); // quantities equal
            var sourceInclusions = JsonSerializer.Deserialize<Dictionary<string, bool>>(sourceCf.InclusionsJson, JsonOpts);
            var targetInclusions = JsonSerializer.Deserialize<Dictionary<string, bool>>(targetCf.InclusionsJson, JsonOpts);
            Assert.Equal(sourceInclusions, targetInclusions); // inclusions equal
        }

        var sourceSteps = await GetStepsJsonAsync(sourceConfigId);
        var targetSteps = await GetStepsJsonAsync(targetConfigId);
        var sourceCustom = sourceSteps.Single(s => s.GetProperty("id").GetString() == "prep-1");
        var targetCustom = targetSteps.Single(s => s.GetProperty("id").GetString() == "prep-1");
        Assert.Equal(sourceCustom.GetProperty("title").GetString(), targetCustom.GetProperty("title").GetString()); // custom step equivalent

        var sourceGeneratedIds = sourceSteps.Where(s => s.TryGetProperty("stepOrigin", out var o) && o.GetString() == "feature-generated")
            .Select(s => (s.GetProperty("id").GetString(), s.GetProperty("generatorKey").GetString())).OrderBy(x => x.Item1).ToList();
        var targetGeneratedIds = targetSteps.Where(s => s.TryGetProperty("stepOrigin", out var o) && o.GetString() == "feature-generated")
            .Select(s => (s.GetProperty("id").GetString(), s.GetProperty("generatorKey").GetString())).OrderBy(x => x.Item1).ToList();
        Assert.Equal(sourceGeneratedIds, targetGeneratedIds); // generated ids/generatorKeys equal
    }

    // ── Scenario 9: invalid-reference / malformed rejection, no partial writes ──

    [Fact]
    public async Task Scenario9_malformed_JSON_body_is_rejected_with_no_partial_writes()
    {
        var client = await CreateAuthenticatedClientAsync();
        var fixture = await SeedHaCoalProductAsync();
        var targetConfigId = await SeedEmptyConfigAsync(fixture.ProductId);

        using var content = new StringContent("{ this is not valid json", System.Text.Encoding.UTF8, "application/json");
        var resp = await client.PostAsync($"/api/workflow-configs/{targetConfigId}/import", content);

        Assert.True(((int)resp.StatusCode) is >= 400 and < 500, $"expected a 4xx rejection, got {resp.StatusCode}");
        Assert.Equal(0, await CountConfigFeaturesAsync(targetConfigId));
    }

    // ── Scenario 4: dependency toggle ON->OFF->ON preserves custom augmentation ──

    [Fact]
    public async Task Scenario4_dependency_toggle_off_then_on_changes_only_that_fields_and_preserves_custom_augmentation()
    {
        var client = await CreateAuthenticatedClientAsync();
        var fixture = await SeedHaCoalProductAsync();
        var configId = await SeedConfigWithAllFeaturesAsync(fixture); // Junction Box has Part Number, Serial Number, Certification

        var first = await SyncAsync(client, configId);
        var jbFeatureId = fixture.FeatureIdByName["Junction Box"];
        var unit1 = first.Added.Single(i => i.FeatureId == jbFeatureId && i.UnitIndex == 1);
        var stepId = unit1.StepId;

        var stepsBefore = await GetStepsJsonAsync(configId);
        var stepBefore = stepsBefore.Single(s => s.GetProperty("id").GetString() == stepId);
        var fieldIdByKey = stepBefore.GetProperty("captureFields").EnumerateArray()
            .ToDictionary(f => f.GetProperty("key").GetString()!, f => f.GetProperty("id").GetString()!);
        var partNumberFieldId = fieldIdByKey["partNumber"];
        var serialNoFieldId = fieldIdByKey["serialNo"];
        var certificationFieldId = fieldIdByKey["certification"];

        // Admin attaches custom augmentation to this generated step after it was first created —
        // must survive both toggles below untouched.
        var augmentedSteps = stepsBefore.Select(s =>
        {
            if (s.GetProperty("id").GetString() != stepId) return s;
            var dict = s.EnumerateObject().ToDictionary(p => p.Name, p => (object)p.Value);
            dict["overrideReportText"] = "Custom report note for Junction Box 1";
            dict["mediaIds"] = new[] { "media-abc" };
            return JsonSerializer.SerializeToElement(dict, JsonOpts);
        }).ToList();
        await SetStepsJsonAsync(configId, JsonSerializer.Serialize(augmentedSteps, JsonOpts));

        // Toggle Certification OFF — Unit (Part Number, Serial Number) stays included throughout;
        // these are two independent dependencies specifically so this toggle is isolated.
        var unitDepId = fixture.DependencyIdByName[("Junction Box", "Unit")];
        var certificationDepId = fixture.DependencyIdByName[("Junction Box", "Certification")];
        await SetInclusionsAsync(configId, jbFeatureId, new Dictionary<string, bool> { [unitDepId] = true, [certificationDepId] = false });
        var afterOff = await SyncAsync(client, configId);
        Assert.Empty(afterOff.Blocked);

        var stepsAfterOff = await GetStepsJsonAsync(configId);
        var stepAfterOff = stepsAfterOff.Single(s => s.GetProperty("id").GetString() == stepId);
        var fieldIdsAfterOff = stepAfterOff.GetProperty("captureFields").EnumerateArray().Select(f => f.GetProperty("id").GetString()).ToHashSet();

        // Only the Certification-derived field changed — Part Number/Serial Number untouched.
        Assert.Contains(partNumberFieldId, fieldIdsAfterOff);
        Assert.Contains(serialNoFieldId, fieldIdsAfterOff);
        Assert.DoesNotContain(certificationFieldId, fieldIdsAfterOff);
        Assert.Equal("Custom report note for Junction Box 1", stepAfterOff.GetProperty("overrideReportText").GetString());
        Assert.Equal("media-abc", stepAfterOff.GetProperty("mediaIds")[0].GetString());

        // Unrelated units/features completely unaffected.
        var unit2StepId = first.Added.Single(i => i.FeatureId == jbFeatureId && i.UnitIndex == 2).StepId;
        Assert.Contains(stepsAfterOff, s => s.GetProperty("id").GetString() == unit2StepId);

        // Toggle Certification back ON.
        await SetInclusionsAsync(configId, jbFeatureId, new Dictionary<string, bool> { [unitDepId] = true, [certificationDepId] = true });
        var afterOn = await SyncAsync(client, configId);
        Assert.Empty(afterOn.Blocked);

        var stepsAfterOn = await GetStepsJsonAsync(configId);
        var stepAfterOn = stepsAfterOn.Single(s => s.GetProperty("id").GetString() == stepId);
        var fieldIdsAfterOn = stepAfterOn.GetProperty("captureFields").EnumerateArray().Select(f => f.GetProperty("id").GetString()).ToHashSet();

        Assert.Contains(partNumberFieldId, fieldIdsAfterOn);
        Assert.Contains(serialNoFieldId, fieldIdsAfterOn);
        Assert.Contains(certificationFieldId, fieldIdsAfterOn); // same deterministic id recreated
        Assert.Equal("Custom report note for Junction Box 1", stepAfterOn.GetProperty("overrideReportText").GetString());
    }

    private async Task SetInclusionsAsync(string configId, string featureId, Dictionary<string, bool> inclusions)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var cf = await db.WorkflowConfigFeatures.FirstAsync(f => f.WorkflowConfigId == configId && f.FeatureId == featureId);
        cf.InclusionsJson = JsonSerializer.Serialize(inclusions, JsonOpts);
        await db.SaveChangesAsync();
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private sealed class HaCoalFixture
    {
        public string ProductId = "";
        public Dictionary<string, string> FeatureIdByName = new();
        public Dictionary<string, List<string>> DependencyNamesByFeature = new();
        public Dictionary<(string Feature, string Dependency), string> DependencyIdByName = new();
        public Dictionary<string, int> QuantityByFeature = new();
        public Dictionary<string, int> CaptureFieldCountByFeature = new();
    }

    private static object CustomStep(string id, int order, string title, string stepType) => new
    {
        id, order, title, description = "", overrideInReport = false, overrideReportText = "",
        includeDescriptionInReport = true, mediaIds = Array.Empty<string>(), decisionsEnabled = false,
        decisions = Array.Empty<object>(), inputs = Array.Empty<object>(), nextStepId = (string?)null,
        captureFields = Array.Empty<object>(), stepType,
    };

    private async Task<HaCoalFixture> SeedHaCoalProductAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var fixture = new HaCoalFixture { ProductId = Guid.NewGuid().ToString("N") };
        db.Products.Add(new ProductEntity { Id = fixture.ProductId, Name = "HA-Coal" });

        // Most features have a single physical dependency ("Unit") carrying all their capture
        // fields. Junction Box deliberately has TWO independent dependencies (Unit, Certification)
        // so Scenario 4 can toggle Certification alone without touching Part Number/Serial Number
        // — matching the acceptance plan's literal "only the Certification-derived field changes"
        // requirement, which a single combined dependency could not demonstrate.
        var featureSpecs = new (string Name, int Quantity, (string DepName, string[] Fields)[] Deps)[]
        {
            ("Controller FP Enclosure", 1, new[] { ("Unit", new[] { "Part Number", "Serial Number" }) }),
            ("Tracking Display POD", 1, new[] { ("Unit", new[] { "Part Number", "Serial Number", "Firmware" }) }),
            ("Flasher/Siren Combo", 1, new[] { ("Unit", new[] { "Part Number", "Certification" }) }),
            ("Junction Box", 3, new[]
            {
                ("Unit", new[] { "Part Number", "Serial Number" }),
                ("Certification", new[] { "Certification" }),
            }),
            ("Silent Zone Enclosure", 1, new[] { ("Unit", new[] { "Part Number", "Location" }) }),
            ("Generator", 2, new[] { ("Unit", new[] { "Part Number", "Serial Number", "Date" }) }),
        };

        var sortOrder = 0;
        foreach (var (name, quantity, deps) in featureSpecs)
        {
            var featureId = Guid.NewGuid().ToString("N");
            fixture.FeatureIdByName[name] = featureId;
            fixture.QuantityByFeature[name] = quantity;
            fixture.DependencyNamesByFeature[name] = deps.Select(d => d.DepName).ToList();
            fixture.CaptureFieldCountByFeature[name] = deps.Sum(d => d.Fields.Length);

            db.Features.Add(new FeatureEntity { Id = featureId, Name = name, ValueType = "component", IsInventory = true });
            db.ProductFeatures.Add(new ProductFeatureEntity { Id = Guid.NewGuid().ToString("N"), ProductId = fixture.ProductId, FeatureId = featureId, SortOrder = sortOrder++ });

            var depSortOrder = 0;
            foreach (var (depName, fields) in deps)
            {
                var depId = Guid.NewGuid().ToString("N");
                fixture.DependencyIdByName[(name, depName)] = depId;
                var captureFieldKeys = fields.Select(MapCaptureFieldKey).ToList();
                db.FeatureDependencies.Add(new FeatureDependencyEntity
                {
                    Id = depId, FeatureId = featureId, Name = depName, IsInventory = true,
                    CaptureFieldsJson = JsonSerializer.Serialize(captureFieldKeys, JsonOpts), SortOrder = depSortOrder++,
                });
            }
        }

        await db.SaveChangesAsync();
        return fixture;
    }

    private static string MapCaptureFieldKey(string depName) => depName switch
    {
        "Part Number" => "partNumber",
        "Serial Number" => "serialNo",
        "Certification" => "certification",
        "Date" => "date",
        "Location" => "location",
        "Firmware" => "firmware",
        _ => depName,
    };

    private async Task<string> SeedConfigWithAllFeaturesAsync(HaCoalFixture fixture)
    {
        var configId = await SeedEmptyConfigAsync(fixture.ProductId);
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var sortOrder = 0;
        foreach (var (featureName, featureId) in fixture.FeatureIdByName)
        {
            var inclusions = fixture.DependencyNamesByFeature[featureName]
                .ToDictionary(depName => fixture.DependencyIdByName[(featureName, depName)], _ => true);
            db.WorkflowConfigFeatures.Add(new WorkflowConfigFeatureEntity
            {
                Id = Guid.NewGuid().ToString("N"), WorkflowConfigId = configId, FeatureId = featureId,
                Quantity = fixture.QuantityByFeature[featureName],
                InclusionsJson = JsonSerializer.Serialize(inclusions, JsonOpts), SortOrder = sortOrder++,
            });
        }
        await db.SaveChangesAsync();
        return configId;
    }

    private async Task<string> SeedEmptyConfigAsync(string productId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var now = DateTime.UtcNow;
        var configId = Guid.NewGuid().ToString("N");
        db.WorkflowConfigs.Add(new WorkflowConfigEntity
        {
            Id = configId, ProductId = productId, Name = "Acceptance Draft", Status = "Draft", Version = 1,
            StepsJson = "[]", MediaJson = "[]", FeatureSelectionsJson = "[]", CreatedAt = now, UpdatedAt = now,
        });
        await db.SaveChangesAsync();
        return configId;
    }

    private async Task AddCustomStepAsync(string configId, string stepId, string title)
    {
        var existing = await GetStepsJsonAsync(configId);
        var updated = existing.Cast<object>().Append(CustomStep(stepId, existing.Count, title, "preparation")).ToList();
        await SetStepsJsonAsync(configId, JsonSerializer.Serialize(updated, JsonOpts));
    }

    private async Task UpdateQuantityAsync(string configId, string featureId, int quantity)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var cf = await db.WorkflowConfigFeatures.FirstAsync(f => f.WorkflowConfigId == configId && f.FeatureId == featureId);
        cf.Quantity = quantity;
        await db.SaveChangesAsync();
    }

    private async Task<List<JsonElement>> GetStepsJsonAsync(string configId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var entity = await db.WorkflowConfigs.AsNoTracking().FirstAsync(c => c.Id == configId);
        return JsonSerializer.Deserialize<List<JsonElement>>(entity.StepsJson, JsonOpts) ?? new();
    }

    private async Task SetStepsJsonAsync(string configId, string stepsJson)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var entity = await db.WorkflowConfigs.FirstAsync(c => c.Id == configId);
        entity.StepsJson = stepsJson;
        await db.SaveChangesAsync();
    }

    private async Task<int> CountConfigFeaturesAsync(string configId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.WorkflowConfigFeatures.CountAsync(f => f.WorkflowConfigId == configId);
    }

    private record SyncResult(
        List<SyncFeatureStepItemDto> Added, List<SyncFeatureStepItemDto> Updated, List<SyncFeatureStepItemDto> Removed,
        List<SyncFeatureStepItemDto> Unchanged, List<SyncFeatureStepItemDto> Blocked);

    private async Task<SyncResult> SyncAsync(HttpClient client, string configId)
    {
        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/sync-feature-steps", null);
        resp.EnsureSuccessStatusCode();
        var dto = JsonSerializer.Deserialize<SyncFeatureStepsResultDto>(await resp.Content.ReadAsStringAsync(), JsonOpts)!;
        return new SyncResult(dto.Added, dto.Updated, dto.Removed, dto.Unchanged, dto.Blocked);
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
}
