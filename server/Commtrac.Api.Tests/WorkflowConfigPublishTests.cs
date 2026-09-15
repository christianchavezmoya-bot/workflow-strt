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

[Collection(ApiTestCollection.Name)]
public class WorkflowConfigPublishTests : IClassFixture<ApiTestFactory>
{
    private readonly ApiTestFactory _factory;

    public WorkflowConfigPublishTests(ApiTestFactory factory) => _factory = factory;

    [Fact]
    public async Task Publish_without_workflow_type_returns_400()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigWithoutTypeAsync();

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/publish", null);

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        var body = await resp.Content.ReadAsStringAsync();
        Assert.Contains("workflow type", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Publish_with_workflow_type_succeeds()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigWithTypeAsync("wftype-installation");

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/publish", null);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }

    // WF-1: WorkflowConfigFeature.quantity is the canonical quantity authority for generated
    // steps; FeatureSelection.activeCount (persisted on WorkflowConfig.FeatureSelectionsJson) is a
    // legacy compatibility mirror only and must never be read by Publish()'s step generation. This
    // seeds a deliberately mismatched activeCount to prove generation ignores it: quantity=5 must
    // produce exactly 5 generated unit steps, never 999.
    [Fact]
    public async Task Publish_generated_step_count_uses_WorkflowConfigFeature_not_FeatureSelection_activeCount()
    {
        var client = await CreateAuthenticatedClientAsync();
        const int canonicalQuantity = 5;
        var (configId, featureId, _) = await SeedFeatureConfigAsync(
            quantity: canonicalQuantity,
            deps: new[] { new DepSpec("Camera Unit", IsInventory: true, CaptureFields: new[] { "serialNo" }) },
            featureSelectionsJson: featureId => $"[{{\"featureId\":\"{featureId}\",\"included\":true,\"activeCount\":999}}]");

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/publish", null);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var generatedSteps = await GetGeneratedStepsAsync(resp);
        var installationSteps = generatedSteps.Where(s => GetString(s, "stepType") == "installation").ToList();
        Assert.Equal(canonicalQuantity, installationSteps.Count);
    }

    // WF-3: republishing with no feature/dependency/quantity changes must produce byte-identical
    // generated step ids, generatorKeys, and order — the prerequisite for any future diff-based
    // sync (WF-4).
    [Fact]
    public async Task Publish_unchanged_produces_identical_generated_ids_and_order()
    {
        var client = await CreateAuthenticatedClientAsync();
        var (configId, _, _) = await SeedFeatureConfigAsync(
            quantity: 3,
            deps: new[]
            {
                new DepSpec("Camera Unit", IsInventory: true, CaptureFields: new[] { "serialNo", "firmware" }),
                new DepSpec("Mounting Bracket", IsInventory: false, CaptureFields: Array.Empty<string>()),
            });

        var first = await GetGeneratedStepsAsync(await client.PostAsync($"/api/workflow-configs/{configId}/publish", null));
        var second = await GetGeneratedStepsAsync(await client.PostAsync($"/api/workflow-configs/{configId}/publish", null));

        var firstSignature = first.Select(StepSignature).ToList();
        var secondSignature = second.Select(StepSignature).ToList();
        Assert.Equal(firstSignature, secondSignature);
    }

    // WF-3: quantity 2 must produce two distinct unit identities (unit 1 / unit 2), each with its
    // own generatorKey/id — proving generation unrolls per physical unit rather than collapsing to
    // a single repeated step definition.
    [Fact]
    public async Task Publish_quantity_two_produces_distinct_unit_identities()
    {
        var client = await CreateAuthenticatedClientAsync();
        var (configId, _, _) = await SeedFeatureConfigAsync(
            quantity: 2,
            deps: new[] { new DepSpec("Camera Unit", IsInventory: true, CaptureFields: new[] { "serialNo" }) });

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/publish", null);
        var generatedSteps = await GetGeneratedStepsAsync(resp);
        var installationSteps = generatedSteps.Where(s => GetString(s, "stepType") == "installation").ToList();

        Assert.Equal(2, installationSteps.Count);
        var unitIndexes = installationSteps.Select(s => GetInt(s, "stepUnitIndex")).OrderBy(i => i).ToList();
        Assert.Equal(new[] { 1, 2 }, unitIndexes);

        var ids = installationSteps.Select(s => GetString(s, "id")).ToHashSet();
        var generatorKeys = installationSteps.Select(s => GetString(s, "generatorKey")).ToHashSet();
        Assert.Equal(2, ids.Count);
        Assert.Equal(2, generatorKeys.Count);
        Assert.Contains(generatorKeys, k => k!.EndsWith(":unit:1:installation"));
        Assert.Contains(generatorKeys, k => k!.EndsWith(":unit:2:installation"));
    }

    // WF-3: a unit with multiple included dependencies of the same stepType must produce ONE
    // grouped step (not one step per dependency), with each dependency's capture fields present
    // inside that single step.
    [Fact]
    public async Task Publish_groups_multiple_dependencies_into_single_unit_step()
    {
        var client = await CreateAuthenticatedClientAsync();
        var (configId, _, depIdByName) = await SeedFeatureConfigAsync(
            quantity: 1,
            deps: new[]
            {
                new DepSpec("Camera Body", IsInventory: true, CaptureFields: new[] { "serialNo" }),
                new DepSpec("PoE Injector", IsInventory: true, CaptureFields: new[] { "serialNo" }),
            });

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/publish", null);
        var generatedSteps = await GetGeneratedStepsAsync(resp);
        var installationSteps = generatedSteps.Where(s => GetString(s, "stepType") == "installation").ToList();

        // Not split per dependency: exactly one step for this unit, even with 2 included deps.
        Assert.Single(installationSteps);

        var captureFieldIds = installationSteps[0].GetProperty("captureFields")
            .EnumerateArray()
            .Select(f => f.GetProperty("id").GetString())
            .ToList();

        var expectedCameraFieldId = ComputeExpectedFieldId(
            (await GetFeatureIdAsync(configId)), 1, depIdByName["Camera Body"], "serialNo");
        var expectedInjectorFieldId = ComputeExpectedFieldId(
            (await GetFeatureIdAsync(configId)), 1, depIdByName["PoE Injector"], "serialNo");

        Assert.Contains(expectedCameraFieldId, captureFieldIds);
        Assert.Contains(expectedInjectorFieldId, captureFieldIds);
    }

    // WF-3: deterministic ids must not collide across features, units, dependencies, or field
    // keys — every id in a generated StepsJson (steps + their capture fields/inputs) must be
    // unique even when multiple features/units/deps share overlapping names.
    [Fact]
    public async Task Publish_generated_ids_do_not_collide_across_features_units_dependencies_fields()
    {
        var client = await CreateAuthenticatedClientAsync();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var now = DateTime.UtcNow;

        var configId = Guid.NewGuid().ToString("N");
        db.WorkflowConfigs.Add(new WorkflowConfigEntity
        {
            Id = configId,
            ProductId = "prod-test",
            Name = "Collision Draft",
            Status = "Draft",
            WorkflowTypeId = "wftype-installation",
            Version = 1,
            StepsJson = "[]",
            MediaJson = "[]",
            FeatureSelectionsJson = "[]",
            CreatedAt = now,
            UpdatedAt = now,
        });

        // Two features, each with quantity 2, each with one inventory dep sharing the same name
        // and capture-field key — the maximally collision-prone shape this test targets.
        foreach (var featureIndex in new[] { 1, 2 })
        {
            var featureId = $"feat-{featureIndex}-{Guid.NewGuid():N}";
            db.Features.Add(new FeatureEntity { Id = featureId, Name = $"Feature {featureIndex}", ValueType = "component" });

            var depId = $"dep-{featureIndex}-{Guid.NewGuid():N}";
            db.FeatureDependencies.Add(new FeatureDependencyEntity
            {
                Id = depId,
                FeatureId = featureId,
                Name = "Camera Unit",
                IsInventory = true,
                CaptureFieldsJson = "[\"serialNo\"]",
            });

            db.WorkflowConfigFeatures.Add(new WorkflowConfigFeatureEntity
            {
                Id = Guid.NewGuid().ToString("N"),
                WorkflowConfigId = configId,
                FeatureId = featureId,
                Quantity = 2,
                InclusionsJson = $"{{\"{depId}\":true}}",
            });
        }

        await db.SaveChangesAsync();

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/publish", null);
        var generatedSteps = await GetGeneratedStepsAsync(resp);

        var allIds = new List<string>();
        foreach (var step in generatedSteps)
        {
            allIds.Add(GetString(step, "id")!);
            foreach (var f in step.GetProperty("captureFields").EnumerateArray())
                allIds.Add(f.GetProperty("id").GetString()!);
            foreach (var i in step.GetProperty("inputs").EnumerateArray())
                allIds.Add(i.GetProperty("id").GetString()!);
        }

        Assert.Equal(allIds.Count, allIds.Distinct().Count());
        // 2 features × 2 units × (1 installation step + 1 capture field each) = 4 steps + 4 fields.
        Assert.Equal(8, allIds.Count);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private record DepSpec(string Name, bool IsInventory, string[] CaptureFields);

    private static string ComputeExpectedFieldId(string featureId, int unitIndex, string dependencyId, string fieldKey)
    {
        var seed = $"field:{featureId}:unit:{unitIndex}:dep:{dependencyId}:key:{fieldKey}";
        var hash = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(seed));
        return new Guid(hash[..16]).ToString();
    }

    private async Task<string> GetFeatureIdAsync(string configId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var cf = await db.WorkflowConfigFeatures.FirstAsync(f => f.WorkflowConfigId == configId);
        return cf.FeatureId;
    }

    private static string StepSignature(JsonElement step) =>
        $"{GetString(step, "id")}:{GetString(step, "generatorKey")}:{GetInt(step, "order")}";

    private static string? GetString(JsonElement el, string prop) =>
        el.TryGetProperty(prop, out var v) ? v.GetString() : null;

    private static int GetInt(JsonElement el, string prop) =>
        el.TryGetProperty(prop, out var v) ? v.GetInt32() : -1;

    private static async Task<List<JsonElement>> GetGeneratedStepsAsync(HttpResponseMessage resp)
    {
        resp.EnsureSuccessStatusCode();
        var body = await resp.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(body);
        var stepsJson = doc.RootElement.GetProperty("stepsJson").GetString() ?? "[]";
        using var stepsDoc = JsonDocument.Parse(stepsJson);
        return stepsDoc.RootElement.EnumerateArray()
            .Where(s => s.TryGetProperty("stepOrigin", out var o) && o.GetString() == "feature-generated")
            .Select(s => s.Clone())
            .ToList();
    }

    private async Task<(string configId, string featureId, Dictionary<string, string> depIdByName)> SeedFeatureConfigAsync(
        int quantity, DepSpec[] deps, Func<string, string>? featureSelectionsJson = null)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var now = DateTime.UtcNow;

        var featureId = Guid.NewGuid().ToString("N");
        db.Features.Add(new FeatureEntity { Id = featureId, Name = "Test Camera", ValueType = "component" });

        var depIdByName = new Dictionary<string, string>();
        var sortOrder = 0;
        foreach (var spec in deps)
        {
            var depId = Guid.NewGuid().ToString("N");
            depIdByName[spec.Name] = depId;
            db.FeatureDependencies.Add(new FeatureDependencyEntity
            {
                Id = depId,
                FeatureId = featureId,
                Name = spec.Name,
                IsInventory = spec.IsInventory,
                CaptureFieldsJson = JsonSerializer.Serialize(spec.CaptureFields),
                SortOrder = sortOrder++,
            });
        }

        var inclusionsJson = "{" + string.Join(",", depIdByName.Values.Select(id => $"\"{id}\":true")) + "}";

        var configId = Guid.NewGuid().ToString("N");
        db.WorkflowConfigs.Add(new WorkflowConfigEntity
        {
            Id = configId,
            ProductId = "prod-test",
            Name = "Feature Config Draft",
            Status = "Draft",
            WorkflowTypeId = "wftype-installation",
            Version = 1,
            StepsJson = "[]",
            MediaJson = "[]",
            FeatureSelectionsJson = featureSelectionsJson?.Invoke(featureId) ?? "[]",
            CreatedAt = now,
            UpdatedAt = now,
        });

        db.WorkflowConfigFeatures.Add(new WorkflowConfigFeatureEntity
        {
            Id = Guid.NewGuid().ToString("N"),
            WorkflowConfigId = configId,
            FeatureId = featureId,
            Quantity = quantity,
            InclusionsJson = inclusionsJson,
        });

        await db.SaveChangesAsync();
        return (configId, featureId, depIdByName);
    }

    private static async Task<HttpClient> CreateAuthenticatedClientAsync(ApiTestFactory factory)
    {
        var client = factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "admin.dev@stratango.local",
            password = "Admin123!",
        });
        login.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await login.Content.ReadAsStringAsync());
        var token = doc.RootElement.GetProperty("token").GetString()!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    private Task<HttpClient> CreateAuthenticatedClientAsync() => CreateAuthenticatedClientAsync(_factory);

    private async Task<string> SeedDraftConfigWithoutTypeAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var id = Guid.NewGuid().ToString("N");
        var now = DateTime.UtcNow;
        db.WorkflowConfigs.Add(new WorkflowConfigEntity
        {
            Id = id,
            ProductId = "prod-test",
            Name = "Untyped Draft",
            Status = "Draft",
            Version = 1,
            StepsJson = "[]",
            MediaJson = "[]",
            FeatureSelectionsJson = "[]",
            CreatedAt = now,
            UpdatedAt = now,
        });
        await db.SaveChangesAsync();
        return id;
    }

    private async Task<string> SeedDraftConfigWithTypeAsync(string workflowTypeId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var id = Guid.NewGuid().ToString("N");
        var now = DateTime.UtcNow;
        db.WorkflowConfigs.Add(new WorkflowConfigEntity
        {
            Id = id,
            ProductId = "prod-test",
            Name = "Typed Draft",
            Status = "Draft",
            WorkflowTypeId = workflowTypeId,
            Version = 1,
            StepsJson = "[]",
            MediaJson = "[]",
            FeatureSelectionsJson = "[]",
            CreatedAt = now,
            UpdatedAt = now,
        });
        await db.SaveChangesAsync();
        return id;
    }
}
