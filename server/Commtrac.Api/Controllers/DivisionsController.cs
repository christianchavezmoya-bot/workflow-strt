using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/divisions")]
[Authorize]
public class DivisionsController : ControllerBase
{
    private readonly AppDbContext _db;

    public DivisionsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<DivisionDto>>> GetAll()
    {
        var divisions = await _db.Divisions.OrderBy(d => d.SortOrder).ThenBy(d => d.Name).ToListAsync();
        return Ok(divisions.Select(ToDto));
    }

    [HttpGet("all")]
    public async Task<ActionResult<IEnumerable<DivisionDto>>> GetAllIncludingInactive()
    {
        var divisions = await _db.Divisions.OrderBy(d => d.SortOrder).ThenBy(d => d.Name).ToListAsync();
        return Ok(divisions.Select(ToDto));
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<DivisionDto>> Create([FromBody] CreateDivisionRequest request)
    {
        var division = new DivisionEntity
        {
            Name = request.Name.Trim(),
            Description = request.Description,
            SortOrder = request.SortOrder
        };
        _db.Divisions.Add(division);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetAll), new { id = division.Id }, ToDto(division));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<DivisionDto>> Update(string id, [FromBody] UpdateDivisionRequest request)
    {
        var division = await _db.Divisions.FirstOrDefaultAsync(d => d.Id == id);
        if (division is null) return NotFound();

        if (!string.IsNullOrWhiteSpace(request.Name)) division.Name = request.Name.Trim();
        if (request.Description is not null) division.Description = request.Description;
        if (request.SortOrder.HasValue) division.SortOrder = request.SortOrder.Value;
        if (request.IsActive.HasValue) division.IsActive = request.IsActive.Value;

        await _db.SaveChangesAsync();
        return Ok(ToDto(division));
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(string id)
    {
        var division = await _db.Divisions.FirstOrDefaultAsync(d => d.Id == id);
        if (division is null) return NotFound();

        var productIds = await _db.Products
            .Where(p => p.DivisionId == id)
            .Select(p => p.Id)
            .ToListAsync();

        foreach (var productId in productIds)
            await DeleteProductCascade(productId);

        _db.Divisions.Remove(division);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>
    /// Deletes a product and all its owned data.
    /// Features exclusive to this product are deleted; shared features only lose the product link.
    /// ProjectAssets, WorkflowConfigs, and their children are fully deleted.
    /// Project.ProductIds[] is updated to remove the reference.
    /// Does NOT call SaveChangesAsync — caller is responsible.
    /// </summary>
    private async Task DeleteProductCascade(string productId)
    {
        // 1. Unlink all ProductFeature rows for this product
        var featureLinks = await _db.ProductFeatures.Where(pf => pf.ProductId == productId).ToListAsync();
        var featureIds = featureLinks.Select(pf => pf.FeatureId).ToList();
        _db.ProductFeatures.RemoveRange(featureLinks);

        // 2. Delete features that are now exclusively orphaned (no other product links)
        if (featureIds.Count > 0)
        {
            var stillLinkedFeatureIds = await _db.ProductFeatures
                .Where(pf => featureIds.Contains(pf.FeatureId))
                .Select(pf => pf.FeatureId)
                .Distinct()
                .ToListAsync();
            var exclusiveFeatureIds = featureIds.Except(stillLinkedFeatureIds).ToHashSet();
            if (exclusiveFeatureIds.Count > 0)
            {
                _db.Features.RemoveRange(_db.Features.Where(f => exclusiveFeatureIds.Contains(f.Id)));
                _db.FeatureDependencies.RemoveRange(_db.FeatureDependencies.Where(fd => exclusiveFeatureIds.Contains(fd.FeatureId)));
            }
        }

        // 3. Delete all project assets for this product and their children
        var assetIds = await _db.ProjectAssets
            .Where(a => a.ProductId == productId)
            .Select(a => a.Id)
            .ToListAsync();
        if (assetIds.Count > 0)
        {
            _db.AssetWorkflowAssignments.RemoveRange(_db.AssetWorkflowAssignments.Where(a => assetIds.Contains(a.AssetId)));
            _db.AssetWorkflowRuns.RemoveRange(_db.AssetWorkflowRuns.Where(r => assetIds.Contains(r.AssetId)));
            _db.AssetDocumentLinks.RemoveRange(_db.AssetDocumentLinks.Where(l => assetIds.Contains(l.AssetId)));
            var docIds = await _db.AssetDocuments
                .Where(d => assetIds.Contains(d.AssetId))
                .Select(d => d.Id)
                .ToListAsync();
            if (docIds.Count > 0)
                _db.AssetDocumentRevisions.RemoveRange(_db.AssetDocumentRevisions.Where(r => docIds.Contains(r.DocumentId)));
            _db.AssetDocuments.RemoveRange(_db.AssetDocuments.Where(d => assetIds.Contains(d.AssetId)));
            _db.ProjectAssets.RemoveRange(_db.ProjectAssets.Where(a => a.ProductId == productId));
        }

        // 4. Delete all workflow configs for this product
        _db.WorkflowConfigs.RemoveRange(_db.WorkflowConfigs.Where(w => w.ProductId == productId));

        // 5. Remove productId from Project.ProductIds[] arrays
        var projects = await _db.Projects
            .Where(p => p.ProductIds.Contains(productId))
            .ToListAsync();
        foreach (var project in projects)
            project.ProductIds = project.ProductIds.Where(pid => pid != productId).ToList();

        // 6. Delete the product itself
        _db.Products.RemoveRange(_db.Products.Where(p => p.Id == productId));
    }

    private static DivisionDto ToDto(DivisionEntity d) =>
        new(d.Id, d.Name, d.Description, d.SortOrder, d.IsActive);
}
