using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Commtrac.Api.Tests;

// WF-6A: GET /products/{id}/workflow-context — Product master data only, for an external agent to
// construct a valid WorkflowExportDto.FeatureSelections for this product.
[Collection(ApiTestCollection.Name)]
public class ProductWorkflowContextTests : IClassFixture<ApiTestFactory>
{
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);
    private readonly ApiTestFactory _factory;

    public ProductWorkflowContextTests(ApiTestFactory factory) => _factory = factory;

    [Fact]
    public async Task Context_contains_valid_product_feature_and_dependency_metadata()
    {
        var client = await CreateAuthenticatedClientAsync();
        var productId = await SeedProductWithFeatureAsync();

        var resp = await client.GetAsync($"/api/products/{productId}/workflow-context");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var dto = JsonSerializer.Deserialize<ProductWorkflowContextDto>(await resp.Content.ReadAsStringAsync(), JsonOpts)!;

        Assert.Equal(1, dto.SchemaVersion);
        Assert.Equal(productId, dto.Product.Id);
        Assert.Equal("Test Product", dto.Product.Name);

        var feature = Assert.Single(dto.Features);
        Assert.Equal("Junction Box", feature.Name);
        Assert.True(feature.IsInventory);
        Assert.True(feature.Selectable);

        var dep = Assert.Single(feature.Dependencies);
        Assert.Equal("Camera Unit", dep.Name);
        Assert.Equal(feature.FeatureId, dep.FeatureId);
        Assert.True(dep.IsInventory);
        Assert.Contains("serialNo", dep.CaptureFields);
    }

    [Fact]
    public async Task Context_contains_no_secrets_customer_project_or_run_data()
    {
        var client = await CreateAuthenticatedClientAsync();
        var productId = await SeedProductWithFeatureAsync();

        var resp = await client.GetAsync($"/api/products/{productId}/workflow-context");
        var body = await resp.Content.ReadAsStringAsync();

        // Structural check: only schemaVersion/product/features exist at the top level — no
        // WorkflowConfig-specific selection state (quantity/inclusions), no run/customer data.
        using var doc = JsonDocument.Parse(body);
        var topLevelProps = doc.RootElement.EnumerateObject().Select(p => p.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        Assert.Equal(new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "schemaVersion", "product", "features" }, topLevelProps);

        var forbidden = new[]
        {
            "password", "token", "secret", "apikey", "credential",
            "customerid", "projectid", "runid", "assetid", "stepresultsjson", "signature",
        };
        var lowered = body.ToLowerInvariant();
        foreach (var term in forbidden)
            Assert.DoesNotContain(term, lowered);
    }

    [Fact]
    public async Task Context_does_not_contain_any_WorkflowConfig_specific_selection_state()
    {
        var client = await CreateAuthenticatedClientAsync();
        var (productId, featureId) = await SeedProductWithFeatureReturningIdsAsync();

        // Seed an actual WorkflowConfig + WorkflowConfigFeature with a specific quantity, to prove
        // the context export never leaks config-specific selection state even when it exists.
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var now = DateTime.UtcNow;
            var configId = Guid.NewGuid().ToString("N");
            db.WorkflowConfigs.Add(new WorkflowConfigEntity
            {
                Id = configId, ProductId = productId, Name = "Cfg", Status = "Draft", Version = 1,
                StepsJson = "[]", MediaJson = "[]", FeatureSelectionsJson = "[]", CreatedAt = now, UpdatedAt = now,
            });
            db.WorkflowConfigFeatures.Add(new WorkflowConfigFeatureEntity
            {
                Id = Guid.NewGuid().ToString("N"), WorkflowConfigId = configId, FeatureId = featureId,
                Quantity = 7, InclusionsJson = "{}",
            });
            await db.SaveChangesAsync();
        }

        var resp = await client.GetAsync($"/api/products/{productId}/workflow-context");
        var body = await resp.Content.ReadAsStringAsync();
        var lowered = body.ToLowerInvariant();

        Assert.DoesNotContain("quantity", lowered);
        Assert.DoesNotContain("inclusions", lowered);
        Assert.DoesNotContain("workflowconfigid", lowered);
        Assert.DoesNotContain("\"7\"", body); // the seeded quantity never leaks
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

    private async Task<string> SeedProductWithFeatureAsync()
    {
        var (productId, _) = await SeedProductWithFeatureReturningIdsAsync();
        return productId;
    }

    private async Task<(string productId, string featureId)> SeedProductWithFeatureReturningIdsAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var productId = Guid.NewGuid().ToString("N");
        db.Products.Add(new ProductEntity { Id = productId, Name = "Test Product" });

        var featureId = Guid.NewGuid().ToString("N");
        db.Features.Add(new FeatureEntity
        {
            Id = featureId, Name = "Junction Box", ValueType = "component", IsInventory = true,
            SubPropertiesJson = "[]",
        });

        db.ProductFeatures.Add(new ProductFeatureEntity { Id = Guid.NewGuid().ToString("N"), ProductId = productId, FeatureId = featureId, SortOrder = 0 });

        db.FeatureDependencies.Add(new FeatureDependencyEntity
        {
            Id = Guid.NewGuid().ToString("N"), FeatureId = featureId, Name = "Camera Unit",
            IsInventory = true, CaptureFieldsJson = "[\"serialNo\"]",
        });

        await db.SaveChangesAsync();
        return (productId, featureId);
    }
}
