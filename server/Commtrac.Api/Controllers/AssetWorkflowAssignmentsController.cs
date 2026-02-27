using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Commtrac.Api.Data;
using Commtrac.Api.Models;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/asset-workflow-assignments")]
[Authorize]
public class AssetWorkflowAssignmentsController : ControllerBase
{
    private readonly AppDbContext _db;
    public AssetWorkflowAssignmentsController(AppDbContext db) => _db = db;

    // GET api/asset-workflow-assignments/by-asset/{assetId}
    [HttpGet("by-asset/{assetId}")]
    public async Task<IActionResult> ListByAsset(string assetId)
    {
        var assignments = await _db.AssetWorkflowAssignments
            .Where(a => a.AssetId == assetId && a.Active)
            .OrderBy(a => a.AssignedAt)
            .ToListAsync();

        // Enrich with names via lookup
        var configIds = assignments.Select(a => a.WorkflowConfigId).Distinct().ToList();
        var typeIds   = assignments.Select(a => a.WorkflowTypeId).Distinct().ToList();

        var configs = await _db.WorkflowConfigs
            .Where(c => configIds.Contains(c.Id))
            .Select(c => new { c.Id, c.Name })
            .ToDictionaryAsync(c => c.Id, c => c.Name);

        var types = await _db.WorkflowTypes
            .Where(t => typeIds.Contains(t.Id))
            .Select(t => new { t.Id, t.Name })
            .ToDictionaryAsync(t => t.Id, t => t.Name);

        var dtos = assignments.Select(a => new AssetWorkflowAssignmentDto(
            a.Id, a.AssetId, a.WorkflowConfigId, a.WorkflowTypeId,
            types.GetValueOrDefault(a.WorkflowTypeId, a.WorkflowTypeId),
            configs.GetValueOrDefault(a.WorkflowConfigId, a.WorkflowConfigId),
            a.Active, a.AssignedBy, a.AssignedAt
        ));
        return Ok(dtos);
    }

    // POST api/asset-workflow-assignments
    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Create([FromBody] CreateAssignmentRequest req)
    {
        var config = await _db.WorkflowConfigs.FirstOrDefaultAsync(c => c.Id == req.WorkflowConfigId);
        if (config is null) return BadRequest(new { message = "WorkflowConfig not found." });
        if (config.Status != "Published")
            return BadRequest(new { message = "Only Published configurations can be assigned." });

        var assignedBy = User.Identity?.Name ?? User.FindFirst("email")?.Value;
        var entity = new AssetWorkflowAssignmentEntity
        {
            Id               = Guid.NewGuid().ToString(),
            AssetId          = req.AssetId,
            WorkflowConfigId = req.WorkflowConfigId,
            WorkflowTypeId   = req.WorkflowTypeId,
            Active           = true,
            AssignedBy       = assignedBy,
            AssignedAt       = DateTime.UtcNow,
        };
        _db.AssetWorkflowAssignments.Add(entity);
        await _db.SaveChangesAsync();

        var typeName   = (await _db.WorkflowTypes.FirstOrDefaultAsync(t => t.Id == req.WorkflowTypeId))?.Name ?? req.WorkflowTypeId;
        var configName = config.Name;
        return Ok(new AssetWorkflowAssignmentDto(
            entity.Id, entity.AssetId, entity.WorkflowConfigId, entity.WorkflowTypeId,
            typeName, configName, entity.Active, entity.AssignedBy, entity.AssignedAt));
    }

    // DELETE api/asset-workflow-assignments/{id}
    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Delete(string id)
    {
        var entity = await _db.AssetWorkflowAssignments.FirstOrDefaultAsync(a => a.Id == id);
        if (entity is null) return NotFound();
        entity.Active = false;
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
