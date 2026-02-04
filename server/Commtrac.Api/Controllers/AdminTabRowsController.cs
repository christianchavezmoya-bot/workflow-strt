using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Commtrac.Api.Data;
using Commtrac.Api.Models;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/admin-tab-rows")]
public class AdminTabRowsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly JsonSerializerOptions _jsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public AdminTabRowsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<List<AdminTabRowDto>>> GetAll([FromQuery] string tabId)
    {
        if (string.IsNullOrWhiteSpace(tabId))
        {
            return BadRequest("tabId is required.");
        }

        var items = await _db.AdminTabRows
            .Where(row => row.TabId == tabId)
            .OrderBy(row => row.Position)
            .ToListAsync();

        return Ok(items.Select(MapToDto).ToList());
    }

    [HttpPut("bulk")]
    public async Task<ActionResult<List<AdminTabRowDto>>> UpsertBulk([FromBody] List<AdminTabRowDto> rows)
    {
        if (rows == null)
        {
            return BadRequest("Rows payload is required.");
        }

        var tabIds = rows.Select(row => row.TabId).Distinct().ToList();
        var existing = await _db.AdminTabRows
            .Where(row => tabIds.Contains(row.TabId))
            .ToListAsync();

        var incomingIds = new HashSet<string>(rows.Select(row => row.Id));

        foreach (var toRemove in existing.Where(row => !incomingIds.Contains(row.Id)))
        {
            _db.AdminTabRows.Remove(toRemove);
        }

        for (var index = 0; index < rows.Count; index++)
        {
            var row = rows[index];
            var entity = existing.FirstOrDefault(item => item.Id == row.Id);
            if (entity == null)
            {
                entity = new AdminTabRowEntity { Id = row.Id };
                _db.AdminTabRows.Add(entity);
            }

            entity.TabId = row.TabId ?? string.Empty;
            entity.Position = row.Position;
            entity.DataJson = JsonSerializer.Serialize(row.Data ?? new Dictionary<string, string>(), _jsonOptions);
        }

        await _db.SaveChangesAsync();

        var updated = await _db.AdminTabRows
            .Where(row => tabIds.Contains(row.TabId))
            .OrderBy(row => row.Position)
            .ToListAsync();

        return Ok(updated.Select(MapToDto).ToList());
    }

    private AdminTabRowDto MapToDto(AdminTabRowEntity entity)
    {
        var data = DeserializeData(entity.DataJson);
        return new AdminTabRowDto(
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
