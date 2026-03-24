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

    [HttpGet("{id}/impact")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> GetImpact(string id)
    {
        var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == id);
        if (product is null) return NotFound();

        // Features linked to this product + which other products each feature is also linked to
        var featureLinks = await _db.ProductFeatures.Where(pf => pf.ProductId == id).ToListAsync();
        var featureIds = featureLinks.Select(pf => pf.FeatureId).ToList();
        var featureEntities = await _db.Features.Where(f => featureIds.Contains(f.Id)).ToListAsync();

        // For alsoUsedIn: all links for these features except the current product
        var otherLinks = await _db.ProductFeatures
            .Where(pf => featureIds.Contains(pf.FeatureId) && pf.ProductId != id)
            .ToListAsync();
        var otherProductIds = otherLinks.Select(l => l.ProductId).Distinct().ToList();
        var otherProducts = await _db.Products.Where(p => otherProductIds.Contains(p.Id)).ToDictionaryAsync(p => p.Id, p => p.Name);

        var featureItems = featureEntities.Select(f =>
        {
            var alsoIn = otherLinks
                .Where(l => l.FeatureId == f.Id)
                .Select(l => otherProducts.TryGetValue(l.ProductId, out var n) ? n : null)
                .Where(n => n != null)
                .ToList();
            return new { id = f.Id, name = f.Name, valueType = f.ValueType, alsoUsedIn = alsoIn };
        }).ToList();

        // Projects that contain this product in their ProductIds array
        var allProjects = await _db.Projects.ToListAsync();
        var projectItems = allProjects
            .Where(p => p.ProductIds != null && p.ProductIds.Contains(id))
            .Select(p => new { id = p.Id, name = p.CustomerName, jobNumber = string.IsNullOrWhiteSpace(p.JobNumber) ? (string?)null : p.JobNumber })
            .ToList();

        // Assets linked to this product — join with projects for project name
        var assetEntities = await _db.ProjectAssets.Where(a => a.ProductId == id).ToListAsync();
        var assetProjectIds = assetEntities.Select(a => a.ProjectId).Distinct().ToList();
        var assetProjects = await _db.Projects
            .Where(p => assetProjectIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => p.CustomerName);
        var assetItems = assetEntities.Select(a => new
        {
            id = a.Id,
            assetName = string.IsNullOrWhiteSpace(a.AssetName) ? a.AssetTag : a.AssetName,
            projectName = assetProjects.TryGetValue(a.ProjectId, out var pn) ? pn : null
        }).ToList();

        // Workflows linked to this product
        var workflowEntities = await _db.WorkflowConfigs.Where(w => w.ProductId == id).ToListAsync();
        // Try to get workflow type name via WorkflowTypes table (ConfigType stores type id or name)
        var configTypes = workflowEntities.Select(w => w.ConfigType).Where(ct => ct != null).Distinct().ToList();
        var workflowTypeMap = await _db.WorkflowTypes
            .Where(wt => configTypes.Contains(wt.Id) || configTypes.Contains(wt.Name))
            .ToDictionaryAsync(wt => wt.Id, wt => wt.Name);
        var workflowItems = workflowEntities.Select(w =>
        {
            string? typeName = null;
            if (w.ConfigType != null)
            {
                if (workflowTypeMap.TryGetValue(w.ConfigType, out var tn)) typeName = tn;
                else typeName = w.ConfigType; // fall back to raw value if it's already a name
            }
            return new { id = w.Id, name = w.Name, workflowType = typeName };
        }).ToList();

        return Ok(new {
            productName = product.Name,
            features = featureItems,
            projects = projectItems,
            assets = assetItems,
            workflows = workflowItems
        });
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(string id, [FromBody] DeleteProductRequest? request)
    {
        var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == id);
        if (product is null) return NotFound();

        var deleteFeatureIds = request?.DeleteFeatureIds ?? new List<string>();
        var deleteAssetIds = request?.DeleteAssetIds ?? new List<string>();
        var deleteWorkflowIds = request?.DeleteWorkflowIds ?? new List<string>();

        // 1. Remove all ProductFeature links for this product
        var featureLinks = await _db.ProductFeatures.Where(pf => pf.ProductId == id).ToListAsync();
        _db.ProductFeatures.RemoveRange(featureLinks);
        await _db.SaveChangesAsync(); // flush so step 2 can check remaining links

        // 2. Delete features whose IDs are in deleteFeatureIds, but only if they have no other product links
        if (deleteFeatureIds.Count > 0)
        {
            var remainingLinks = await _db.ProductFeatures
                .Where(pf => deleteFeatureIds.Contains(pf.FeatureId))
                .Select(pf => pf.FeatureId)
                .ToListAsync();
            var remainingLinksSet = remainingLinks.ToHashSet();
            var featuresToDelete = await _db.Features
                .Where(f => deleteFeatureIds.Contains(f.Id) && !remainingLinksSet.Contains(f.Id))
                .ToListAsync();
            _db.Features.RemoveRange(featuresToDelete);
        }

        // 3. Assets: delete those in deleteAssetIds; nullify ProductId on the rest
        var allLinkedAssets = await _db.ProjectAssets.Where(a => a.ProductId == id).ToListAsync();
        var assetsToDelete = allLinkedAssets.Where(a => deleteAssetIds.Contains(a.Id)).ToList();
        var assetsToKeep = allLinkedAssets.Where(a => !deleteAssetIds.Contains(a.Id)).ToList();
        _db.ProjectAssets.RemoveRange(assetsToDelete);
        foreach (var asset in assetsToKeep) asset.ProductId = string.Empty;

        // 4. Workflows: delete those in deleteWorkflowIds; nullify ProductId on the rest
        var allLinkedWorkflows = await _db.WorkflowConfigs.Where(w => w.ProductId == id).ToListAsync();
        var workflowsToDelete = allLinkedWorkflows.Where(w => deleteWorkflowIds.Contains(w.Id)).ToList();
        var workflowsToKeep = allLinkedWorkflows.Where(w => !deleteWorkflowIds.Contains(w.Id)).ToList();
        _db.WorkflowConfigs.RemoveRange(workflowsToDelete);
        foreach (var wf in workflowsToKeep) wf.ProductId = string.Empty;

        // 5. Remove productId from all Project.ProductIds arrays
        var allProjects = await _db.Projects.ToListAsync();
        foreach (var project in allProjects)
        {
            if (project.ProductIds != null && project.ProductIds.Contains(id))
            {
                project.ProductIds = project.ProductIds.Where(pid => pid != id).ToList();
            }
        }

        // 6. Delete the product itself
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
