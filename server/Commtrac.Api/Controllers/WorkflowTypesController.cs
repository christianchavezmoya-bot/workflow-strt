using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Commtrac.Api.Data;
using Commtrac.Api.Models;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/workflow-types")]
[Authorize]
public class WorkflowTypesController : ControllerBase
{
    private readonly AppDbContext _db;
    public WorkflowTypesController(AppDbContext db) => _db = db;

    private static WorkflowTypeDto ToDto(WorkflowTypeEntity e) =>
        new(e.Id, e.Name, e.Icon, e.SortOrder, e.IsActive);

    // GET api/workflow-types
    [HttpGet]
    public async Task<IActionResult> List()
    {
        var types = await _db.WorkflowTypes
            .Where(t => t.IsActive)
            .OrderBy(t => t.SortOrder)
            .ToListAsync();
        return Ok(types.Select(ToDto));
    }

    // GET api/workflow-types/all  (includes inactive, for admin management)
    [HttpGet("all")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> ListAll()
    {
        var types = await _db.WorkflowTypes.OrderBy(t => t.SortOrder).ToListAsync();
        return Ok(types.Select(ToDto));
    }

    // POST api/workflow-types
    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Create([FromBody] UpsertWorkflowTypeRequest req)
    {
        var entity = new WorkflowTypeEntity
        {
            Id        = Guid.NewGuid().ToString(),
            Name      = req.Name,
            Icon      = req.Icon,
            SortOrder = req.SortOrder,
            IsActive  = true,
        };
        _db.WorkflowTypes.Add(entity);
        await _db.SaveChangesAsync();
        return Ok(ToDto(entity));
    }

    // PUT api/workflow-types/{id}
    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Update(string id, [FromBody] UpsertWorkflowTypeRequest req)
    {
        var entity = await _db.WorkflowTypes.FirstOrDefaultAsync(t => t.Id == id);
        if (entity is null) return NotFound();
        entity.Name      = req.Name;
        entity.Icon      = req.Icon;
        entity.SortOrder = req.SortOrder;
        await _db.SaveChangesAsync();
        return Ok(ToDto(entity));
    }

    // DELETE api/workflow-types/{id}  — soft delete
    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(string id)
    {
        var entity = await _db.WorkflowTypes.FirstOrDefaultAsync(t => t.Id == id);
        if (entity is null) return NotFound();
        // Prevent deleting seeded types
        if (id.StartsWith("wftype-"))
            return BadRequest(new { message = "Default workflow types cannot be deleted. You can add custom types." });

        var usedByProject = await _db.Projects.AnyAsync(p => p.WorkflowTypeId == id);
        var usedByConfig = await _db.WorkflowConfigs.AnyAsync(c => c.WorkflowTypeId == id);
        var usedByAssignment = await _db.AssetWorkflowAssignments.AnyAsync(a => a.WorkflowTypeId == id && a.Active);
        if (usedByProject || usedByConfig || usedByAssignment)
        {
            return Conflict(new
            {
                message = "This workflow type is in use by a project, workflow configuration, or asset assignment and cannot be deleted.",
                usedByProject,
                usedByConfig,
                usedByAssignment,
            });
        }

        entity.IsActive = false;
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
