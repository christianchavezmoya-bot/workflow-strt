using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/project-delivery-profiles")]
[Authorize]
public class ProjectDeliveryProfilesController : ControllerBase
{
    private readonly AppDbContext _db;

    public ProjectDeliveryProfilesController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<List<ProjectDeliveryProfileDto>>> List([FromQuery] string projectId)
    {
        if (string.IsNullOrWhiteSpace(projectId))
            return BadRequest("projectId is required");

        var items = await _db.ProjectDeliveryProfiles
            .Where(p => p.ProjectId == projectId)
            .OrderByDescending(p => p.IsDefault)
            .ThenBy(p => p.CreatedAt)
            .ToListAsync();

        return Ok(items.Select(ToDto).ToList());
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<ProjectDeliveryProfileDto>> Create(
        [FromBody] UpsertProjectDeliveryProfileRequest request,
        [FromQuery] string projectId)
    {
        if (string.IsNullOrWhiteSpace(projectId))
            return BadRequest("projectId is required");

        // If new profile is default, clear existing default
        if (request.IsDefault)
        {
            var existing = await _db.ProjectDeliveryProfiles
                .Where(p => p.ProjectId == projectId && p.IsDefault)
                .ToListAsync();
            existing.ForEach(p => p.IsDefault = false);
        }

        var entity = new ProjectDeliveryProfileEntity
        {
            ProjectId    = projectId,
            Label        = request.Label,
            ContactName  = request.ContactName,
            ContactPhone = request.ContactPhone,
            ContactEmail = request.ContactEmail,
            AddressLine1 = request.AddressLine1,
            AddressLine2 = request.AddressLine2,
            City         = request.City,
            State        = request.State,
            PostCode     = request.PostCode,
            Country      = request.Country,
            DeliveryNotes = request.DeliveryNotes,
            AccessHours  = request.AccessHours,
            IsDefault    = request.IsDefault,
            CreatedAt    = DateTime.UtcNow
        };

        _db.ProjectDeliveryProfiles.Add(entity);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(List), new { projectId }, ToDto(entity));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<ProjectDeliveryProfileDto>> Update(string id,
        [FromBody] UpsertProjectDeliveryProfileRequest request)
    {
        var entity = await _db.ProjectDeliveryProfiles.FirstOrDefaultAsync(p => p.Id == id);
        if (entity is null) return NotFound();

        // If setting this one as default, clear others
        if (request.IsDefault && !entity.IsDefault)
        {
            var others = await _db.ProjectDeliveryProfiles
                .Where(p => p.ProjectId == entity.ProjectId && p.Id != id && p.IsDefault)
                .ToListAsync();
            others.ForEach(p => p.IsDefault = false);
        }

        entity.Label        = request.Label;
        entity.ContactName  = request.ContactName;
        entity.ContactPhone = request.ContactPhone;
        entity.ContactEmail = request.ContactEmail;
        entity.AddressLine1 = request.AddressLine1;
        entity.AddressLine2 = request.AddressLine2;
        entity.City         = request.City;
        entity.State        = request.State;
        entity.PostCode     = request.PostCode;
        entity.Country      = request.Country;
        entity.DeliveryNotes = request.DeliveryNotes;
        entity.AccessHours  = request.AccessHours;
        entity.IsDefault    = request.IsDefault;

        await _db.SaveChangesAsync();
        return Ok(ToDto(entity));
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Delete(string id)
    {
        var entity = await _db.ProjectDeliveryProfiles.FirstOrDefaultAsync(p => p.Id == id);
        if (entity is null) return NotFound();

        _db.ProjectDeliveryProfiles.Remove(entity);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static ProjectDeliveryProfileDto ToDto(ProjectDeliveryProfileEntity e) => new(
        e.Id,
        e.ProjectId,
        e.Label,
        e.ContactName,
        e.ContactPhone,
        e.ContactEmail,
        e.AddressLine1,
        e.AddressLine2,
        e.City,
        e.State,
        e.PostCode,
        e.Country,
        e.DeliveryNotes,
        e.AccessHours,
        e.IsDefault,
        e.CreatedAt
    );
}
