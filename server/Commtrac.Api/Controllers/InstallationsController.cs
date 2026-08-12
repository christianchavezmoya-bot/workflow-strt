using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

/// <summary>
/// Legacy Installation entity recycle-bin endpoints. CRUD/list paths were removed —
/// project assets supersede the old installation module. Restore/purge remain for
/// Recovery Center rows that still reference InstallationEntity.
/// </summary>
[ApiController]
[Route("api/installations")]
[Authorize]
public class InstallationsController : ControllerBase
{
    private readonly AppDbContext _db;

    public InstallationsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpPost("{id}/restore")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Restore(string id)
    {
        var installation = await _db.Installations
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(i => i.Id == id);
        if (installation is null)
        {
            return NotFound();
        }

        installation.IsDeleted = false;
        installation.DeletedAtUtc = null;
        installation.DeletedByUserId = null;
        installation.DeleteReason = null;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id}/purge")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Purge(string id)
    {
        var installation = await _db.Installations
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(i => i.Id == id);
        if (installation is null)
        {
            return NotFound();
        }

        _db.Issues.RemoveRange(_db.Issues.Where(i => i.InstallationId == id));
        var inspectionIds = await _db.Inspections
            .Where(i => i.InstallationId == id)
            .Select(i => i.Id)
            .ToListAsync();
        if (inspectionIds.Count > 0)
        {
            _db.InspectionPhotos.RemoveRange(_db.InspectionPhotos.Where(p => inspectionIds.Contains(p.InspectionId)));
        }
        _db.Inspections.RemoveRange(_db.Inspections.Where(i => i.InstallationId == id));

        _db.Installations.Remove(installation);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
