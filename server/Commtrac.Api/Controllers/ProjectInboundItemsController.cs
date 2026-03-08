using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/project-inbound-items")]
[Authorize]
public class ProjectInboundItemsController : ControllerBase
{
    private readonly AppDbContext _db;

    public ProjectInboundItemsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<List<ProjectInboundItemDto>>> List([FromQuery] string projectId)
    {
        if (string.IsNullOrWhiteSpace(projectId))
            return BadRequest("projectId is required");

        var items = await _db.ProjectInboundItems
            .Where(i => i.ProjectId == projectId)
            .OrderByDescending(i => i.CreatedAt)
            .ToListAsync();

        return Ok(items.Select(ToDto).ToList());
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager,Engineer")]
    public async Task<ActionResult<ProjectInboundItemDto>> Create(
        [FromBody] UpsertProjectInboundItemRequest request,
        [FromQuery] string projectId)
    {
        if (string.IsNullOrWhiteSpace(projectId))
            return BadRequest("projectId is required");

        var entity = new ProjectInboundItemEntity
        {
            ProjectId       = projectId,
            Description     = request.Description,
            Quantity        = request.Quantity,
            Unit            = request.Unit,
            Condition       = request.Condition,
            ReferenceNumber = request.ReferenceNumber,
            ReceivedDate    = request.ReceivedDate,
            ReceivedBy      = request.ReceivedBy,
            Notes           = request.Notes,
            ItemType        = request.ItemType,
            CreatedAt       = DateTime.UtcNow
        };

        _db.ProjectInboundItems.Add(entity);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(List), new { projectId }, ToDto(entity));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,Project Manager,Engineer")]
    public async Task<ActionResult<ProjectInboundItemDto>> Update(string id,
        [FromBody] UpsertProjectInboundItemRequest request)
    {
        var entity = await _db.ProjectInboundItems.FirstOrDefaultAsync(i => i.Id == id);
        if (entity is null) return NotFound();

        entity.Description     = request.Description;
        entity.Quantity        = request.Quantity;
        entity.Unit            = request.Unit;
        entity.Condition       = request.Condition;
        entity.ReferenceNumber = request.ReferenceNumber;
        entity.ReceivedDate    = request.ReceivedDate;
        entity.ReceivedBy      = request.ReceivedBy;
        entity.Notes           = request.Notes;
        entity.ItemType        = request.ItemType;

        await _db.SaveChangesAsync();
        return Ok(ToDto(entity));
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin,Project Manager,Engineer")]
    public async Task<IActionResult> Delete(string id)
    {
        var entity = await _db.ProjectInboundItems.FirstOrDefaultAsync(i => i.Id == id);
        if (entity is null) return NotFound();

        _db.ProjectInboundItems.Remove(entity);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static ProjectInboundItemDto ToDto(ProjectInboundItemEntity e) => new(
        e.Id,
        e.ProjectId,
        e.Description,
        e.Quantity,
        e.Unit,
        e.Condition,
        e.ReferenceNumber,
        e.ReceivedDate,
        e.ReceivedBy,
        e.Notes,
        e.ItemType,
        e.CreatedAt
    );
}
