using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/project-contacts")]
[Authorize]
public class ProjectContactsController : ControllerBase
{
    private readonly AppDbContext _db;

    public ProjectContactsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<List<ProjectContactDto>>> List([FromQuery] string projectId)
    {
        if (string.IsNullOrWhiteSpace(projectId))
            return BadRequest("projectId is required");

        var items = await _db.ProjectContacts
            .Where(c => c.ProjectId == projectId)
            .OrderBy(c => c.CreatedAt)
            .ToListAsync();

        return Ok(items.Select(ToDto).ToList());
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<ProjectContactDto>> Create([FromBody] UpsertProjectContactRequest request,
        [FromQuery] string projectId)
    {
        if (string.IsNullOrWhiteSpace(projectId))
            return BadRequest("projectId is required");

        var entity = new ProjectContactEntity
        {
            ProjectId           = projectId,
            Name                = request.Name,
            Title               = request.Title,
            Email               = request.Email,
            Phone               = request.Phone,
            PreferredSignMethod = request.PreferredSignMethod,
            IsPrimarySigner     = request.IsPrimarySigner,
            CcReports           = request.CcReports,
            Address             = request.Address,
            CreatedAt           = DateTime.UtcNow
        };

        _db.ProjectContacts.Add(entity);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(List), new { projectId }, ToDto(entity));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<ProjectContactDto>> Update(string id,
        [FromBody] UpsertProjectContactRequest request)
    {
        var entity = await _db.ProjectContacts.FirstOrDefaultAsync(c => c.Id == id);
        if (entity is null) return NotFound();

        entity.Name                = request.Name;
        entity.Title               = request.Title;
        entity.Email               = request.Email;
        entity.Phone               = request.Phone;
        entity.PreferredSignMethod = request.PreferredSignMethod;
        entity.IsPrimarySigner     = request.IsPrimarySigner;
        entity.CcReports           = request.CcReports;
        entity.Address             = request.Address;

        await _db.SaveChangesAsync();
        return Ok(ToDto(entity));
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Delete(string id)
    {
        var entity = await _db.ProjectContacts.FirstOrDefaultAsync(c => c.Id == id);
        if (entity is null) return NotFound();

        _db.ProjectContacts.Remove(entity);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static ProjectContactDto ToDto(ProjectContactEntity e) => new(
        e.Id,
        e.ProjectId,
        e.Name,
        e.Title,
        e.Email,
        e.Phone,
        e.PreferredSignMethod,
        e.IsPrimarySigner,
        e.CcReports,
        e.Address,
        e.CreatedAt
    );
}
