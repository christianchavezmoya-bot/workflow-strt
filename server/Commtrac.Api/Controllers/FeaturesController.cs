using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/features")]
[Authorize]
public class FeaturesController : ControllerBase
{
    private readonly AppDbContext _db;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public FeaturesController(AppDbContext db) => _db = db;

    // ── Global library ────────────────────────────────────────────────────────

    [HttpGet]
    public async Task<ActionResult<IEnumerable<FeatureDto>>> GetAll()
    {
        var features = await _db.Features.OrderBy(f => f.Name).ToListAsync();
        var featureIds = features.Select(f => f.Id).ToList();
        var links = await _db.ProductFeatures
            .Where(pf => featureIds.Contains(pf.FeatureId))
            .Join(_db.Products, pf => pf.ProductId, p => p.Id, (pf, p) => new { pf.FeatureId, p.Id, p.Name })
            .ToListAsync();
        var productsByFeature = links.GroupBy(l => l.FeatureId)
            .ToDictionary(g => g.Key, g => g.Select(l => l.Name).ToList());
        var productIdsByFeature = links.GroupBy(l => l.FeatureId)
            .ToDictionary(g => g.Key, g => g.Select(l => l.Id).ToList());
        return Ok(features.Select(f => ToDto(f,
            productsByFeature.TryGetValue(f.Id, out var prods) ? prods : null,
            productIdsByFeature.TryGetValue(f.Id, out var prodIds) ? prodIds : null)));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<FeatureDto>> GetById(string id)
    {
        var f = await _db.Features.FirstOrDefaultAsync(x => x.Id == id);
        if (f is null) return NotFound();
        var linkedProductIds = await _db.ProductFeatures
            .Where(pf => pf.FeatureId == id)
            .Select(pf => pf.ProductId)
            .ToListAsync();
        return Ok(ToDto(f, null, linkedProductIds));
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<FeatureDto>> Create([FromBody] CreateFeatureRequest request)
    {
        var feature = new FeatureEntity
        {
            Name = request.Name.Trim(),
            Description = request.Description,
            ValueType = string.IsNullOrWhiteSpace(request.ValueType) ? "text" : request.ValueType,
            OptionsJson = JsonSerializer.Serialize(request.Options ?? new List<string>(), JsonOptions),
            SubPropertiesJson = JsonSerializer.Serialize(request.SubProperties ?? new List<FeatureSubPropertyDto>(), JsonOptions),
            IsInventory = request.IsInventory,
            CaptureFieldsJson = JsonSerializer.Serialize(request.CaptureFields ?? new List<string>(), JsonOptions),
            Brand = string.IsNullOrWhiteSpace(request.Brand) ? null : request.Brand.Trim(),
            Supplier = string.IsNullOrWhiteSpace(request.Supplier) ? null : request.Supplier.Trim(),
            AlternativePartNumber = string.IsNullOrWhiteSpace(request.AlternativePartNumber) ? null : request.AlternativePartNumber.Trim(),
            ManufacturerPartNumber = string.IsNullOrWhiteSpace(request.ManufacturerPartNumber) ? null : request.ManufacturerPartNumber.Trim(),
            UnitPrice = request.UnitPrice,
            ProductLink = string.IsNullOrWhiteSpace(request.ProductLink) ? null : request.ProductLink.Trim(),
        };
        _db.Features.Add(feature);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = feature.Id }, ToDto(feature));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<FeatureDto>> Update(string id, [FromBody] UpdateFeatureRequest request)
    {
        var feature = await _db.Features.FirstOrDefaultAsync(f => f.Id == id);
        if (feature is null) return NotFound();

        if (!string.IsNullOrWhiteSpace(request.Name)) feature.Name = request.Name.Trim();
        if (request.Description is not null) feature.Description = request.Description;
        if (!string.IsNullOrWhiteSpace(request.ValueType)) feature.ValueType = request.ValueType;
        if (request.Options is not null) feature.OptionsJson = JsonSerializer.Serialize(request.Options, JsonOptions);
        if (request.SubProperties is not null) feature.SubPropertiesJson = JsonSerializer.Serialize(request.SubProperties, JsonOptions);
        if (request.IsInventory.HasValue) feature.IsInventory = request.IsInventory.Value;
        if (request.CaptureFields is not null) feature.CaptureFieldsJson = JsonSerializer.Serialize(request.CaptureFields, JsonOptions);
        if (request.Brand is not null) feature.Brand = string.IsNullOrWhiteSpace(request.Brand) ? null : request.Brand.Trim();
        if (request.Supplier is not null) feature.Supplier = string.IsNullOrWhiteSpace(request.Supplier) ? null : request.Supplier.Trim();
        if (request.AlternativePartNumber is not null) feature.AlternativePartNumber = string.IsNullOrWhiteSpace(request.AlternativePartNumber) ? null : request.AlternativePartNumber.Trim();
        if (request.ManufacturerPartNumber is not null) feature.ManufacturerPartNumber = string.IsNullOrWhiteSpace(request.ManufacturerPartNumber) ? null : request.ManufacturerPartNumber.Trim();
        if (request.UnitPrice.HasValue) feature.UnitPrice = request.UnitPrice;
        if (request.ProductLink is not null) feature.ProductLink = string.IsNullOrWhiteSpace(request.ProductLink) ? null : request.ProductLink.Trim();

        await _db.SaveChangesAsync();
        return Ok(ToDto(feature));
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(string id)
    {
        var feature = await _db.Features.FirstOrDefaultAsync(f => f.Id == id);
        if (feature is null) return NotFound();

        // Remove all product links first
        var links = await _db.ProductFeatures.Where(pf => pf.FeatureId == id).ToListAsync();
        _db.ProductFeatures.RemoveRange(links);

        _db.Features.Remove(feature);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ── Per-product feature links ─────────────────────────────────────────────

    [HttpGet("by-product/{productId}")]
    public async Task<ActionResult<IEnumerable<FeatureDto>>> GetByProduct(string productId)
    {
        var links = await _db.ProductFeatures
            .Where(pf => pf.ProductId == productId)
            .OrderBy(pf => pf.SortOrder)
            .ToListAsync();

        var featureIds = links.Select(l => l.FeatureId).ToList();
        var features = await _db.Features
            .Where(f => featureIds.Contains(f.Id))
            .ToListAsync();

        // Return in link sort order
        var featureMap = features.ToDictionary(f => f.Id);
        var ordered = links
            .Where(l => featureMap.ContainsKey(l.FeatureId))
            .Select(l => ToDto(featureMap[l.FeatureId]));

        return Ok(ordered);
    }

    [HttpPost("by-product/{productId}/link/{featureId}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> LinkToProduct(string productId, string featureId)
    {
        var exists = await _db.ProductFeatures
            .AnyAsync(pf => pf.ProductId == productId && pf.FeatureId == featureId);
        if (exists) return Ok();

        var maxOrder = await _db.ProductFeatures
            .Where(pf => pf.ProductId == productId)
            .Select(pf => (int?)pf.SortOrder)
            .MaxAsync() ?? -1;

        _db.ProductFeatures.Add(new ProductFeatureEntity
        {
            ProductId = productId,
            FeatureId = featureId,
            SortOrder = maxOrder + 1
        });
        await _db.SaveChangesAsync();
        return Ok();
    }

    [HttpDelete("by-product/{productId}/unlink/{featureId}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> UnlinkFromProduct(string productId, string featureId)
    {
        var link = await _db.ProductFeatures
            .FirstOrDefaultAsync(pf => pf.ProductId == productId && pf.FeatureId == featureId);
        if (link is null) return NoContent();

        _db.ProductFeatures.Remove(link);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static FeatureDto ToDto(FeatureEntity f, List<string>? linkedProducts = null, List<string>? linkedProductIds = null)
    {
        var options = string.IsNullOrWhiteSpace(f.OptionsJson) || f.OptionsJson == "[]"
            ? null
            : JsonSerializer.Deserialize<List<string>>(f.OptionsJson, JsonOptions);

        var subProps = string.IsNullOrWhiteSpace(f.SubPropertiesJson) || f.SubPropertiesJson == "[]"
            ? null
            : JsonSerializer.Deserialize<List<FeatureSubPropertyDto>>(f.SubPropertiesJson, JsonOptions);

        var captureFields = string.IsNullOrWhiteSpace(f.CaptureFieldsJson) || f.CaptureFieldsJson == "[]"
            ? null
            : JsonSerializer.Deserialize<List<string>>(f.CaptureFieldsJson, JsonOptions);

        return new(f.Id, f.Name, f.Description, f.ValueType, options, subProps, f.IsInventory, captureFields,
            f.Brand, f.Supplier, f.AlternativePartNumber, f.UnitPrice, f.ProductLink, f.ManufacturerPartNumber,
            linkedProducts, linkedProductIds);
    }
}
