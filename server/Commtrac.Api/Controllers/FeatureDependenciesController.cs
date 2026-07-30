using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/feature-dependencies")]
[Authorize]
public class FeatureDependenciesController : ControllerBase
{
    private readonly AppDbContext _db;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public FeatureDependenciesController(AppDbContext db) => _db = db;

    /// <summary>
    /// GET /api/feature-dependencies?featureId=xxx
    /// GET /api/feature-dependencies?productId=xxx  (batch: all deps for features linked to a product)
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<FeatureDependencyDto>>> Get(
        [FromQuery] string? featureId,
        [FromQuery] string? productId)
    {
        if (!string.IsNullOrWhiteSpace(productId))
        {
            var featureIds = await _db.ProductFeatures
                .AsNoTracking()
                .Where(pf => pf.ProductId == productId)
                .Select(pf => pf.FeatureId)
                .ToListAsync();

            if (featureIds.Count == 0) return Ok(Array.Empty<FeatureDependencyDto>());

            var productDeps = await _db.FeatureDependencies
                .AsNoTracking()
                .Where(d => featureIds.Contains(d.FeatureId))
                .OrderBy(d => d.FeatureId)
                .ThenBy(d => d.SortOrder)
                .ToListAsync();

            return Ok(productDeps.Select(ToDto));
        }

        if (string.IsNullOrWhiteSpace(featureId)) return BadRequest("featureId or productId is required");

        var deps = await _db.FeatureDependencies
            .AsNoTracking()
            .Where(d => d.FeatureId == featureId)
            .OrderBy(d => d.SortOrder)
            .ToListAsync();

        return Ok(deps.Select(ToDto));
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<FeatureDependencyDto>> Create([FromBody] CreateFeatureDependencyRequest req)
    {
        var dep = new FeatureDependencyEntity
        {
            FeatureId = req.FeatureId,
            Name = req.Name,
            IsInventory = req.IsInventory,
            CaptureFieldsJson = JsonSerializer.Serialize(req.CaptureFields ?? new List<string>(), JsonOptions),
            DefaultQty = req.DefaultQty,
            Unit = req.Unit,
            UnitPrice = req.UnitPrice,
            SortOrder = req.SortOrder
        };

        _db.FeatureDependencies.Add(dep);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(Get), new { featureId = dep.FeatureId }, ToDto(dep));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<FeatureDependencyDto>> Update(string id, [FromBody] UpdateFeatureDependencyRequest req)
    {
        var dep = await _db.FeatureDependencies.FirstOrDefaultAsync(d => d.Id == id);
        if (dep is null) return NotFound();

        if (req.Name is not null) dep.Name = req.Name;
        if (req.IsInventory is not null) dep.IsInventory = req.IsInventory.Value;
        if (req.CaptureFields is not null) dep.CaptureFieldsJson = JsonSerializer.Serialize(req.CaptureFields, JsonOptions);
        if (req.DefaultQty is not null) dep.DefaultQty = req.DefaultQty.Value;
        if (req.Unit is not null) dep.Unit = string.IsNullOrWhiteSpace(req.Unit) ? null : req.Unit;
        if (req.UnitPrice is not null) dep.UnitPrice = req.UnitPrice.Value;
        if (req.SortOrder is not null) dep.SortOrder = req.SortOrder.Value;

        await _db.SaveChangesAsync();
        return Ok(ToDto(dep));
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Delete(string id)
    {
        var dep = await _db.FeatureDependencies.FirstOrDefaultAsync(d => d.Id == id);
        if (dep is null) return NotFound();

        _db.FeatureDependencies.Remove(dep);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static FeatureDependencyDto ToDto(FeatureDependencyEntity d)
    {
        var captureFields = string.IsNullOrWhiteSpace(d.CaptureFieldsJson) || d.CaptureFieldsJson == "[]"
            ? new List<string>()
            : JsonSerializer.Deserialize<List<string>>(d.CaptureFieldsJson, JsonOptions) ?? new List<string>();

        return new FeatureDependencyDto(
            d.Id, d.FeatureId, d.Name, d.IsInventory,
            captureFields, d.DefaultQty, d.Unit, d.UnitPrice, d.SortOrder
        );
    }
}
