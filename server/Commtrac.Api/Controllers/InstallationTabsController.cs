using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Commtrac.Api.Data;
using Commtrac.Api.Models;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/installation-tabs")]
public class InstallationTabsController : ControllerBase
{
    private readonly AppDbContext _db;

    public InstallationTabsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<List<InstallationTabDto>>> GetAll()
    {
        var items = await _db.InstallationTabs
            .OrderBy(tab => tab.Position)
            .ToListAsync();

        return Ok(items.Select(tab => new InstallationTabDto(
            tab.Id,
            tab.Label,
            tab.Type,
            tab.Position
        )).ToList());
    }

    [HttpPut("bulk")]
    public async Task<ActionResult<List<InstallationTabDto>>> UpsertBulk([FromBody] List<InstallationTabDto> tabs)
    {
        if (tabs == null)
        {
            return BadRequest("Tabs payload is required.");
        }

        var existing = await _db.InstallationTabs.ToListAsync();
        var incomingIds = new HashSet<string>(tabs.Select(tab => tab.Id));

        foreach (var toRemove in existing.Where(tab => !incomingIds.Contains(tab.Id)))
        {
            _db.InstallationTabs.Remove(toRemove);
        }

        for (var index = 0; index < tabs.Count; index++)
        {
            var tab = tabs[index];
            var entity = existing.FirstOrDefault(item => item.Id == tab.Id);
            if (entity == null)
            {
                entity = new InstallationTabEntity { Id = tab.Id };
                _db.InstallationTabs.Add(entity);
            }

            entity.Label = tab.Label ?? string.Empty;
            entity.Type = tab.Type ?? string.Empty;
            entity.Position = tab.Position >= 0 ? tab.Position : index;
        }

        await _db.SaveChangesAsync();

        var updated = await _db.InstallationTabs
            .OrderBy(tab => tab.Position)
            .ToListAsync();

        return Ok(updated.Select(tab => new InstallationTabDto(
            tab.Id,
            tab.Label,
            tab.Type,
            tab.Position
        )).ToList());
    }
}
