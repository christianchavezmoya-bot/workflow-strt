using System.Net;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using Commtrac.Api.Controllers;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// Cross-language contract for the "Export Workflow Context" completeness fix. The Builder button
/// assembles the export in TypeScript (workflowContextExportAssembly.ts) while
/// GET /workflow-configs/{id}/authoring-context builds it here; both must report the SAME
/// identities, labels and — critically — the same generated step/field ids the generators assign.
/// </summary>
public class WorkflowContextIdContractTests
{
    /// <summary>Reference vectors: computed by the real .NET runtime with the algorithm in
    /// WorkflowConfigsController.DeterministicId. The identical table is asserted on the TypeScript
    /// side in src/utils/deterministicId.test.ts.</summary>
    private static readonly (string Seed, string Id)[] Vectors =
    {
        ("step:feature:feat-1:unit:1:installation", "7efc169e-cde5-1271-4404-e49d6e411d73"),
        ("step:feature:feat-1:unit:2:data-collection", "2b3f2c12-3356-462b-84bb-574ff3f678c3"),
        ("field:feat-1:unit:1:dep:dep-a:key:serialNo", "318cdfd3-43c8-e922-a956-b14058f77a6d"),
        ("field:feat-1:unit:3:dep:dep-a:key:firmware", "4c1bd9c3-3cdb-0e19-f862-38e27e9d03b5"),
        ("field:feat-1:unit:1:dep:dep-b:key:qty", "4e5245f5-8ae2-9c9f-c3aa-584cd6f0b8b0"),
        ("field:feat-1:unit:1:partNumber", "9348b70c-cac9-7675-ac61-c43821262058"),
        ("field:0f8fad5b-d9cb-469f-a165-70867728950e:unit:1:dep:7c9e6679-7425-40de-944b-e07fc1f90ae7:key:macAddress", "754a0ade-3753-f4c7-2326-0a1de1491cdc"),
        ("step:feature:0f8fad5b-d9cb-469f-a165-70867728950e:unit:12:installation", "cb3cae96-6deb-017d-7b0e-c19a8b4e3af2"),
    };

    private static object? Call(string method, params object[] args) =>
        typeof(WorkflowConfigsController)
            .GetMethod(method, BindingFlags.NonPublic | BindingFlags.Static)!
            .Invoke(null, args);

    [Fact]
    public void DeterministicId_matches_the_reference_vectors_shared_with_the_TypeScript_twin()
    {
        foreach (var (seed, id) in Vectors)
            Assert.Equal(id, (string)Call("DeterministicId", seed)!);
    }

    [Fact]
    public void Generated_step_and_field_ids_compose_the_documented_seeds()
    {
        Assert.Equal("7efc169e-cde5-1271-4404-e49d6e411d73", (string)Call("GeneratedStepId", "feature:feat-1:unit:1:installation")!);
        Assert.Equal("318cdfd3-43c8-e922-a956-b14058f77a6d", (string)Call("GeneratedFieldId", "feat-1", 1, "dep-a", "serialNo")!);
        Assert.Equal("4e5245f5-8ae2-9c9f-c3aa-584cd6f0b8b0", (string)Call("GeneratedFieldId", "feat-1", 1, "dep-b", "qty")!);
        Assert.Equal("9348b70c-cac9-7675-ac61-c43821262058", (string)Call("PartNumberFieldId", "feat-1", 1)!);
    }

    [Theory]
    [InlineData("serialNo", "Serial Number")]
    [InlineData("firmware", "Firmware Version")]
    [InlineData("ipAddress", "IP Address")]
    [InlineData("macAddress", "MAC Address")]
    [InlineData("model", "Model")]
    [InlineData("location", "Location")]
    [InlineData("certificate", "certificate")] // unknown key -> label is the key itself
    [InlineData("MAC Address", "MAC Address")]  // keys that are already human names pass through
    public void CaptureFieldLabel_matches_the_TypeScript_twin(string key, string label) =>
        Assert.Equal(label, (string)Call("CaptureFieldLabel", key)!);
}

[Collection(ApiTestCollection.Name)]
public class WorkflowAuthoringContextParityTests : IClassFixture<ApiTestFactory>
{
    private const string ProductId = "prod-parity";
    private const string ConfigId = "cfg-parity";
    private const string ConfigName = "Fibre Node Install";
    private readonly ApiTestFactory _factory;

    public WorkflowAuthoringContextParityTests(ApiTestFactory factory) => _factory = factory;

    /// <summary>Seeds a realistic catalogue with FIXED ids (so the golden file is stable): an
    /// inventory Feature with two dependencies (one serialised, one quantity) and dropdown options,
    /// a dependency-less Feature using the Feature-level capture-field fallback, a non-inventory
    /// Feature, and a Feature whose quantity dependency is switched OFF.</summary>
    private async Task SeedAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        if (db.Products.Any(p => p.Id == ProductId)) return;

        string Json(params string[] v) => JsonSerializer.Serialize(v);

        db.Products.Add(new ProductEntity { Id = ProductId, Name = "Fibre Node" });
        db.Features.AddRange(
            new FeatureEntity
            {
                Id = "feat-1", Name = "Interface Module", Description = "Line interface card", ValueType = "select", IsInventory = true,
                OptionsJson = Json("Type A", "Type B", "Type C"),
                SubPropertiesJson = "[{\"id\":\"sp-1\",\"name\":\"Slot\",\"valueType\":\"number\"}]",
                AlternativePartNumber = "IM-100", ManufacturerPartNumber = "MFR-9", ProductLink = "https://example.test/im-100",
                Brand = "Strata", Supplier = "Strata Supply Co", UnitPrice = 120m,
            },
            new FeatureEntity { Id = "feat-junction", Name = "Junction Box", ValueType = "text", IsInventory = true, CaptureFieldsJson = Json("serialNo", "location", "certificate"), AlternativePartNumber = "HA-363" },
            new FeatureEntity { Id = "feat-cable", Name = "Fibre Cable", ValueType = "text", IsInventory = false, CaptureFieldsJson = Json("length") },
            new FeatureEntity { Id = "feat-excl", Name = "Switch Kit", ValueType = "text", IsInventory = true });
        db.FeatureDependencies.AddRange(
            new FeatureDependencyEntity { Id = "dep-b", FeatureId = "feat-1", Name = "Patch lead", IsInventory = false, DefaultQty = 2, Unit = "m", UnitPrice = 4.5m, SortOrder = 2 },
            new FeatureDependencyEntity { Id = "dep-a", FeatureId = "feat-1", Name = "Interface module", IsInventory = true, CaptureFieldsJson = Json("serialNo", "firmware", "macAddress"), DefaultQty = 1, SortOrder = 1 },
            new FeatureDependencyEntity { Id = "dep-x", FeatureId = "feat-excl", Name = "Switch", IsInventory = true, CaptureFieldsJson = Json("serialNo"), SortOrder = 1 },
            new FeatureDependencyEntity { Id = "dep-y", FeatureId = "feat-excl", Name = "Power cord", IsInventory = false, DefaultQty = 1, Unit = "ea", SortOrder = 2 });
        db.ProductFeatures.AddRange(
            new ProductFeatureEntity { Id = "pf-1", ProductId = ProductId, FeatureId = "feat-1", SortOrder = 1 },
            new ProductFeatureEntity { Id = "pf-2", ProductId = ProductId, FeatureId = "feat-junction", SortOrder = 2 },
            new ProductFeatureEntity { Id = "pf-3", ProductId = ProductId, FeatureId = "feat-cable", SortOrder = 3 },
            new ProductFeatureEntity { Id = "pf-4", ProductId = ProductId, FeatureId = "feat-excl", SortOrder = 4 });

        var now = DateTime.UtcNow;
        db.WorkflowConfigs.Add(new WorkflowConfigEntity
        {
            Id = ConfigId, ProductId = ProductId, Name = ConfigName, Status = "Draft", Version = 1,
            StepsJson = "[]", MediaJson = "[]", FeatureSelectionsJson = "[]", CreatedAt = now, UpdatedAt = now,
        });
        db.WorkflowConfigFeatures.AddRange(
            new WorkflowConfigFeatureEntity { Id = "wcf-1", WorkflowConfigId = ConfigId, FeatureId = "feat-1", Quantity = 2, InclusionsJson = "{\"dep-a\":true,\"dep-b\":true}", SortOrder = 1 },
            new WorkflowConfigFeatureEntity { Id = "wcf-2", WorkflowConfigId = ConfigId, FeatureId = "feat-junction", Quantity = 1, InclusionsJson = "{}", SortOrder = 2 },
            new WorkflowConfigFeatureEntity { Id = "wcf-3", WorkflowConfigId = ConfigId, FeatureId = "feat-cable", Quantity = 1, InclusionsJson = "{}", SortOrder = 3 },
            new WorkflowConfigFeatureEntity { Id = "wcf-4", WorkflowConfigId = ConfigId, FeatureId = "feat-excl", Quantity = 1, InclusionsJson = "{\"dep-x\":true,\"dep-y\":false}", SortOrder = 4 });
        await db.SaveChangesAsync();
    }

    private static string GoldenPath()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "Commtrac.Api.Tests.csproj"))) dir = dir.Parent;
        Assert.NotNull(dir);
        return Path.Combine(dir!.FullName, "Fixtures", "workflow-context-parity.json");
    }

    private async Task<JsonNode> GetJsonAsync(HttpClient client, string url)
    {
        var resp = await client.GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        return JsonNode.Parse(await resp.Content.ReadAsStringAsync())!;
    }

    [Fact]
    public async Task Backend_endpoints_match_the_golden_fixture_the_TypeScript_export_is_also_tested_against()
    {
        await SeedAsync();
        var client = await WorkflowRunTestHelpers.CreateAuthenticatedClientAsync(_factory);

        var productContext = await GetJsonAsync(client, $"/api/products/{ProductId}/workflow-context");
        var authoringContext = await GetJsonAsync(client, $"/api/workflow-configs/{ConfigId}/authoring-context");

        var golden = new JsonObject
        {
            ["_comment"] = "GENERATED by WorkflowAuthoringContextParityTests from the real backend endpoints. "
                + "Consumed by src/features/workInstructions/workflowContextExportParity.test.ts, which must reproduce "
                + "authoringContext from productContext + selections + inclusionsByFeature. Regenerate with "
                + "UPDATE_CONTEXT_GOLDEN=1 dotnet test --filter WorkflowAuthoringContextParityTests.",
            ["selections"] = new JsonArray(
                Sel("feat-1", 2), Sel("feat-junction", 1), Sel("feat-cable", 1), Sel("feat-excl", 1)),
            ["inclusionsByFeature"] = new JsonObject
            {
                ["feat-1"] = new JsonObject { ["dep-a"] = true, ["dep-b"] = true },
                ["feat-junction"] = new JsonObject(),
                ["feat-cable"] = new JsonObject(),
                ["feat-excl"] = new JsonObject { ["dep-x"] = true, ["dep-y"] = false },
            },
            ["productContext"] = productContext,
            ["authoringContext"] = authoringContext,
        };

        var path = GoldenPath();
        var pretty = new JsonSerializerOptions { WriteIndented = true };
        if (Environment.GetEnvironmentVariable("UPDATE_CONTEXT_GOLDEN") == "1")
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            await File.WriteAllTextAsync(path, golden.ToJsonString(pretty) + "\n");
        }

        Assert.True(File.Exists(path), $"Golden fixture missing: {path}. Run with UPDATE_CONTEXT_GOLDEN=1 to create it.");
        var expected = JsonNode.Parse(await File.ReadAllTextAsync(path))!;
        Assert.True(JsonNode.DeepEquals(expected, golden),
            "Backend export no longer matches Fixtures/workflow-context-parity.json. If the change is intentional, regenerate it "
            + "(UPDATE_CONTEXT_GOLDEN=1) — and the TypeScript assembler test will then tell you if the client export must change too.");
    }

    [Fact]
    public async Task Authoring_context_is_additive_legacy_summary_fields_are_unchanged()
    {
        await SeedAsync();
        var client = await WorkflowRunTestHelpers.CreateAuthenticatedClientAsync(_factory);
        var dto = JsonSerializer.Deserialize<WorkflowAuthoringContextDto>(
            (await GetJsonAsync(client, $"/api/workflow-configs/{ConfigId}/authoring-context")).ToJsonString(),
            new JsonSerializerOptions(JsonSerializerDefaults.Web))!;

        Assert.Equal(1, dto.SchemaVersion);
        var f1 = dto.Features.Single(f => f.FeatureId == "feat-1");
        // legacy summary members: same shape and meaning as before the completeness fix
        Assert.Equal(new[] { "serialNo", "firmware", "macAddress" }, f1.CaptureFields);
        Assert.Equal(new[] { "dep-a", "dep-b" }, f1.DependencyIds);
        // completeness members: dependency + capture-field identity with names, and .NET-verified ids
        var depA = Assert.Single(f1.Dependencies!, d => d.DependencyId == "dep-a");
        Assert.Equal("Interface module", depA.Name);
        Assert.Equal("installation", depA.GeneratedStepType);
        var serial = depA.CaptureFields.Single(c => c.Key == "serialNo");
        Assert.Equal("Serial Number", serial.Label);
        Assert.Equal("318cdfd3-43c8-e922-a956-b14058f77a6d", serial.GeneratedFieldIds.Single(g => g.UnitIndex == 1).FieldId);
        Assert.Equal("7efc169e-cde5-1271-4404-e49d6e411d73", f1.GeneratedSteps!.First(s => s.UnitIndex == 1 && s.StepType == "installation").StepId);
    }

    private static JsonObject Sel(string id, int count) => new() { ["featureId"] = id, ["activeCount"] = count };
}
