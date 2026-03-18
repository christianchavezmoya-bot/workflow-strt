using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/products")]
[Authorize]
public class ProductsController : ControllerBase
{
    private readonly AppDbContext _db;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public ProductsController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ProductDto>>> GetAll()
    {
        var products = await _db.Products.OrderBy(p => p.Name).ToListAsync();

        // Load all product-feature links in one query for efficiency
        var allLinks = await _db.ProductFeatures
            .OrderBy(pf => pf.SortOrder)
            .ToListAsync();

        var allFeatureIds = allLinks.Select(l => l.FeatureId).Distinct().ToList();
        var allFeatures = await _db.Features
            .Where(f => allFeatureIds.Contains(f.Id))
            .ToListAsync();
        var featureMap = allFeatures.ToDictionary(f => f.Id);

        var linksByProduct = allLinks
            .GroupBy(l => l.ProductId)
            .ToDictionary(g => g.Key, g => g.ToList());

        // Load divisions so we can embed the name in the DTO
        var divisionIds = products.Select(p => p.DivisionId).Where(id => id != null).Distinct().ToList();
        var divisionMap = await _db.Divisions
            .Where(d => divisionIds.Contains(d.Id))
            .ToDictionaryAsync(d => d.Id, d => d.Name);

        return Ok(products.Select(p => ToDto(p, linksByProduct, featureMap, divisionMap)));
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<ProductDto>> Create([FromBody] CreateProductRequest request)
    {
        var product = new ProductEntity
        {
            Name = request.Name,
            Description = request.Description,
            FeaturesJson = JsonSerializer.Serialize(request.Features ?? new List<ProductFeatureDefinitionDto>(), JsonOptions),
            DivisionId = request.DivisionId
        };

        _db.Products.Add(product);
        await _db.SaveChangesAsync();

        // Sync features to global library
        if (request.Features is { Count: > 0 })
            await SyncFeaturesToLibrary(product.Id, request.Features);

        return CreatedAtAction(nameof(GetAll), new { id = product.Id }, ToDto(product, null, null));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<ProductDto>> Update(string id, [FromBody] UpdateProductRequest request)
    {
        var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == id);
        if (product is null) return NotFound();

        if (!string.IsNullOrWhiteSpace(request.Name)) product.Name = request.Name;
        if (request.Description is not null) product.Description = request.Description;
        if (request.Features is not null)
        {
            product.FeaturesJson = JsonSerializer.Serialize(request.Features, JsonOptions);
            await SyncFeaturesToLibrary(product.Id, request.Features);
        }
        if (request.DivisionId is not null)
            product.DivisionId = string.IsNullOrWhiteSpace(request.DivisionId) ? null : request.DivisionId;

        await _db.SaveChangesAsync();
        return Ok(ToDto(product, null, null));
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(string id)
    {
        var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == id);
        if (product is null) return NotFound();

        _db.Products.Remove(product);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Syncs a product's inline feature definitions to the global Features table
    /// and rebuilds the ProductFeatures join rows. Preserves original feature IDs.
    /// </summary>
    private async Task SyncFeaturesToLibrary(string productId, List<ProductFeatureDefinitionDto> features)
    {
        // Upsert each feature into the global library
        var existingIds = (await _db.Features.Select(f => f.Id).ToListAsync()).ToHashSet();
        foreach (var f in features.Where(f => !string.IsNullOrWhiteSpace(f.Id) && !string.IsNullOrWhiteSpace(f.Name)))
        {
            if (existingIds.Contains(f.Id))
            {
                // Update name/options/subprops in case they changed
                var entity = await _db.Features.FindAsync(f.Id);
                if (entity is not null)
                {
                    entity.Name = f.Name;
                    entity.ValueType = f.ValueType;
                    entity.OptionsJson = JsonSerializer.Serialize(f.Options ?? new List<string>(), JsonOptions);
                    entity.SubPropertiesJson = JsonSerializer.Serialize(f.SubProperties ?? new List<FeatureSubPropertyDto>(), JsonOptions);
                }
            }
            else
            {
                _db.Features.Add(new FeatureEntity
                {
                    Id = f.Id,
                    Name = f.Name,
                    ValueType = f.ValueType,
                    OptionsJson = JsonSerializer.Serialize(f.Options ?? new List<string>(), JsonOptions),
                    SubPropertiesJson = JsonSerializer.Serialize(f.SubProperties ?? new List<FeatureSubPropertyDto>(), JsonOptions)
                });
                existingIds.Add(f.Id);
            }
        }

        // Rebuild product↔feature links
        var oldLinks = await _db.ProductFeatures.Where(pf => pf.ProductId == productId).ToListAsync();
        _db.ProductFeatures.RemoveRange(oldLinks);

        int order = 0;
        foreach (var f in features.Where(f => !string.IsNullOrWhiteSpace(f.Id)))
        {
            _db.ProductFeatures.Add(new ProductFeatureEntity
            {
                ProductId = productId,
                FeatureId = f.Id,
                SortOrder = order++
            });
        }

        await _db.SaveChangesAsync();
    }

    private static ProductDto ToDto(
        ProductEntity product,
        Dictionary<string, List<ProductFeatureEntity>>? linksByProduct,
        Dictionary<string, FeatureEntity>? featureMap,
        Dictionary<string, string>? divisionMap = null)
    {
        List<ProductFeatureDefinitionDto> features;

        if (linksByProduct is not null && featureMap is not null
            && linksByProduct.TryGetValue(product.Id, out var links) && links.Count > 0)
        {
            // Populate from global join table (preferred)
            features = links
                .Where(l => featureMap.ContainsKey(l.FeatureId))
                .Select(l => FeatureEntityToDefinitionDto(featureMap[l.FeatureId]))
                .ToList();
        }
        else
        {
            // Fall back to embedded FeaturesJson (backward compat / single-product responses)
            features = string.IsNullOrWhiteSpace(product.FeaturesJson) || product.FeaturesJson == "[]"
                ? new List<ProductFeatureDefinitionDto>()
                : JsonSerializer.Deserialize<List<ProductFeatureDefinitionDto>>(product.FeaturesJson, JsonOptions)
                  ?? new List<ProductFeatureDefinitionDto>();
        }

        var divisionName = product.DivisionId != null && divisionMap != null
            && divisionMap.TryGetValue(product.DivisionId, out var dn) ? dn : null;

        return new(product.Id, product.Name, product.Description, features, product.DivisionId, divisionName);
    }

    private static ProductFeatureDefinitionDto FeatureEntityToDefinitionDto(FeatureEntity f)
    {
        var options = string.IsNullOrWhiteSpace(f.OptionsJson) || f.OptionsJson == "[]"
            ? new List<string>()
            : JsonSerializer.Deserialize<List<string>>(f.OptionsJson, JsonOptions) ?? new List<string>();

        var subProps = string.IsNullOrWhiteSpace(f.SubPropertiesJson) || f.SubPropertiesJson == "[]"
            ? null
            : JsonSerializer.Deserialize<List<FeatureSubPropertyDto>>(f.SubPropertiesJson, JsonOptions);

        return new(f.Id, f.Name, f.ValueType, options, 0, subProps);
    }
}
