using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/workflow-config-features")]
[Authorize]
public class WorkflowConfigFeaturesController : ControllerBase
{
    private readonly AppDbContext _db;

    public WorkflowConfigFeaturesController(AppDbContext db) => _db = db;

    /// <summary>GET /api/workflow-config-features?workflowConfigId=xxx</summary>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<WorkflowConfigFeatureDto>>> GetByConfig([FromQuery] string workflowConfigId)
    {
        if (string.IsNullOrWhiteSpace(workflowConfigId)) return BadRequest("workflowConfigId is required");

        var items = await _db.WorkflowConfigFeatures
            .Where(f => f.WorkflowConfigId == workflowConfigId)
            .OrderBy(f => f.SortOrder)
            .ToListAsync();

        return Ok(items.Select(ToDto));
    }

    /// <summary>POST — create or replace a feature entry for a config.</summary>
    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<WorkflowConfigFeatureDto>> Upsert([FromBody] UpsertWorkflowConfigFeatureRequest req)
    {
        // Guard: config must be Draft
        var config = await _db.WorkflowConfigs.FirstOrDefaultAsync(c => c.Id == req.WorkflowConfigId);
        if (config is null) return NotFound(new { message = "WorkflowConfig not found." });
        if (config.Status != "Draft")
            return BadRequest(new { message = "Feature selections can only be edited on Draft configurations." });

        // Check if a row already exists for this config+feature pair
        var existing = await _db.WorkflowConfigFeatures
            .FirstOrDefaultAsync(f => f.WorkflowConfigId == req.WorkflowConfigId && f.FeatureId == req.FeatureId);

        if (existing is not null)
        {
            existing.Quantity = req.Quantity;
            existing.InclusionsJson = req.InclusionsJson ?? "{}";
            existing.SortOrder = req.SortOrder;
        }
        else
        {
            existing = new WorkflowConfigFeatureEntity
            {
                WorkflowConfigId = req.WorkflowConfigId,
                FeatureId = req.FeatureId,
                Quantity = req.Quantity,
                InclusionsJson = req.InclusionsJson ?? "{}",
                SortOrder = req.SortOrder
            };
            _db.WorkflowConfigFeatures.Add(existing);
        }

        await _db.SaveChangesAsync();
        return Ok(ToDto(existing));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<WorkflowConfigFeatureDto>> Update(string id, [FromBody] UpsertWorkflowConfigFeatureRequest req)
    {
        var item = await _db.WorkflowConfigFeatures.FirstOrDefaultAsync(f => f.Id == id);
        if (item is null) return NotFound();

        var config = await _db.WorkflowConfigs.FirstOrDefaultAsync(c => c.Id == item.WorkflowConfigId);
        if (config?.Status != "Draft")
            return BadRequest(new { message = "Feature selections can only be edited on Draft configurations." });

        item.Quantity = req.Quantity;
        item.InclusionsJson = req.InclusionsJson ?? "{}";
        item.SortOrder = req.SortOrder;
        await _db.SaveChangesAsync();
        return Ok(ToDto(item));
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Delete(string id)
    {
        var item = await _db.WorkflowConfigFeatures.FirstOrDefaultAsync(f => f.Id == id);
        if (item is null) return NotFound();

        var config = await _db.WorkflowConfigs.FirstOrDefaultAsync(c => c.Id == item.WorkflowConfigId);
        if (config?.Status != "Draft")
            return BadRequest(new { message = "Feature selections can only be edited on Draft configurations." });

        _db.WorkflowConfigFeatures.Remove(item);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static WorkflowConfigFeatureDto ToDto(WorkflowConfigFeatureEntity e) =>
        new(e.Id, e.WorkflowConfigId, e.FeatureId, e.Quantity, e.InclusionsJson, e.SortOrder);
}
