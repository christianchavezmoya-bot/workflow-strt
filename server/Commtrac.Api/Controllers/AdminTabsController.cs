using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Commtrac.Api.Data;
using Commtrac.Api.Models;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/admin-tabs")]
[Authorize]
public class AdminTabsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly JsonSerializerOptions _jsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public AdminTabsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<List<AdminTabDto>>> GetAll()
    {
        var items = await _db.AdminTabs
            .OrderBy(tab => tab.Position)
            .ToListAsync();

        var result = items.Select(MapToDto).ToList();
        return Ok(result);
    }

    [HttpPut("bulk")]
    public async Task<ActionResult<List<AdminTabDto>>> UpsertBulk([FromBody] List<AdminTabDto> tabs)
    {
        if (tabs == null)
        {
            return BadRequest("Tabs payload is required.");
        }

        var existing = await _db.AdminTabs.ToListAsync();
        var incomingIds = new HashSet<string>(tabs.Select(tab => tab.Id));

        foreach (var toRemove in existing.Where(tab => !incomingIds.Contains(tab.Id)))
        {
            _db.AdminTabs.Remove(toRemove);
        }

        for (var index = 0; index < tabs.Count; index++)
        {
            var tab = tabs[index];
            var entity = existing.FirstOrDefault(item => item.Id == tab.Id);
            if (entity == null)
            {
                entity = new AdminTabEntity { Id = tab.Id };
                _db.AdminTabs.Add(entity);
            }

            entity.Label = tab.Label ?? string.Empty;
            entity.Type = tab.Type ?? string.Empty;
            entity.PrimaryActionLabel = tab.PrimaryActionLabel;
            entity.Position = tab.Position >= 0 ? tab.Position : index;
            entity.ColumnsJson = JsonSerializer.Serialize(tab.Columns ?? new List<string>(), _jsonOptions);
            entity.FieldIdsJson = JsonSerializer.Serialize(tab.FieldIds ?? new List<string>(), _jsonOptions);
            entity.ConfigJson = JsonSerializer.Serialize(tab.Config ?? new TableConfigDto(new List<string>(), new List<string>()), _jsonOptions);
        }

        await _db.SaveChangesAsync();

        var updated = await _db.AdminTabs
            .OrderBy(tab => tab.Position)
            .ToListAsync();

        return Ok(updated.Select(MapToDto).ToList());
    }

    private AdminTabDto MapToDto(AdminTabEntity entity)
    {
        var columns = DeserializeList(entity.ColumnsJson);
        var fieldIds = DeserializeList(entity.FieldIdsJson);
        var config = DeserializeConfig(entity.ConfigJson);

        return new AdminTabDto(
            entity.Id,
            entity.Label,
            entity.Type,
            entity.Position,
            columns,
            fieldIds,
            config,
            entity.PrimaryActionLabel
        );
    }

    private List<string> DeserializeList(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new List<string>();
        try
        {
            return JsonSerializer.Deserialize<List<string>>(json, _jsonOptions) ?? new List<string>();
        }
        catch
        {
            return new List<string>();
        }
    }

    private TableConfigDto DeserializeConfig(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return new TableConfigDto(new List<string>(), new List<string>());
        }

        try
        {
            var config = JsonSerializer.Deserialize<TableConfigDto>(json, _jsonOptions);
            return config ?? new TableConfigDto(new List<string>(), new List<string>());
        }
        catch
        {
            return new TableConfigDto(new List<string>(), new List<string>());
        }
    }
}
