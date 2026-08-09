using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Commtrac.Api.Data;
using Commtrac.Api.Models;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/installation-tab-rows")]
[Authorize]
public class InstallationTabRowsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly JsonSerializerOptions _jsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public InstallationTabRowsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<List<InstallationTabRowDto>>> GetAll([FromQuery] string tabId)
    {
        if (string.IsNullOrWhiteSpace(tabId))
        {
            return BadRequest("tabId is required.");
        }

        var items = await _db.InstallationTabRows
            .Where(row => row.TabId == tabId)
            .OrderBy(row => row.Position)
            .ToListAsync();

        return Ok(items.Select(MapToDto).ToList());
    }

    [HttpPut("bulk")]
    public async Task<ActionResult<List<InstallationTabRowDto>>> UpsertBulk([FromBody] List<InstallationTabRowDto> rows)
    {
        if (rows == null)
        {
            return BadRequest("Rows payload is required.");
        }

        var tabIds = rows.Select(row => row.TabId).Distinct().ToList();
        var existing = await _db.InstallationTabRows
            .Where(row => tabIds.Contains(row.TabId))
            .ToListAsync();

        var incomingIds = new HashSet<string>(rows.Select(row => row.Id));

        foreach (var toRemove in existing.Where(row => !incomingIds.Contains(row.Id)))
        {
            _db.InstallationTabRows.Remove(toRemove);
        }

        for (var index = 0; index < rows.Count; index++)
        {
            var row = rows[index];
            var entity = existing.FirstOrDefault(item => item.Id == row.Id);
            if (entity == null)
            {
                entity = new InstallationTabRowEntity { Id = row.Id };
                _db.InstallationTabRows.Add(entity);
            }

            entity.TabId = row.TabId ?? string.Empty;
            entity.Position = row.Position;
            entity.DataJson = JsonSerializer.Serialize(row.Data ?? new Dictionary<string, string>(), _jsonOptions);
        }

        await _db.SaveChangesAsync();

        var updated = await _db.InstallationTabRows
            .Where(row => tabIds.Contains(row.TabId))
            .OrderBy(row => row.Position)
            .ToListAsync();

        return Ok(updated.Select(MapToDto).ToList());
    }

    private InstallationTabRowDto MapToDto(InstallationTabRowEntity entity)
    {
        var data = DeserializeData(entity.DataJson);
        return new InstallationTabRowDto(
            entity.Id,
            entity.TabId,
            data,
            entity.Position
        );
    }

    private Dictionary<string, string> DeserializeData(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new Dictionary<string, string>();
        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, string>>(json, _jsonOptions)
                   ?? new Dictionary<string, string>();
        }
        catch
        {
            return new Dictionary<string, string>();
        }
    }
}
