using System.Text.Json;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/table-configs")]
public class TableConfigsController : ControllerBase
{
    private readonly AppDbContext _db;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public TableConfigsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<List<GlobalTableConfigDto>>> GetAll()
    {
        var configs = await _db.TableConfigs.ToListAsync();
        return configs.Select(MapToDto).ToList();
    }

    [HttpGet("{tableName}")]
    public async Task<ActionResult<GlobalTableConfigDto>> Get(string tableName)
    {
        var config = await _db.TableConfigs.FirstOrDefaultAsync(c => c.TableName == tableName);
        if (config == null)
        {
            return Ok(new GlobalTableConfigDto(
                tableName,
                new List<string>(),
                new List<string>(),
                new Dictionary<string, string>(),
                new Dictionary<string, BaseFieldMetaDto>()
            ));
        }
        return MapToDto(config);
    }

    [HttpPut("{tableName}")]
    public async Task<ActionResult<GlobalTableConfigDto>> Update(string tableName, [FromBody] GlobalTableConfigDto dto)
    {
        var config = await _db.TableConfigs.FirstOrDefaultAsync(c => c.TableName == tableName);
        if (config == null)
        {
            config = new TableConfigEntity { TableName = tableName };
            _db.TableConfigs.Add(config);
        }

        config.OrderJson = JsonSerializer.Serialize(dto.Order, JsonOptions);
        config.HiddenJson = JsonSerializer.Serialize(dto.Hidden, JsonOptions);
        config.BaseFieldNamesJson = JsonSerializer.Serialize(dto.BaseFieldNames, JsonOptions);
        config.BaseFieldMetaJson = JsonSerializer.Serialize(dto.BaseFieldMeta, JsonOptions);

        await _db.SaveChangesAsync();
        return MapToDto(config);
    }

    private static GlobalTableConfigDto MapToDto(TableConfigEntity entity)
    {
        return new GlobalTableConfigDto(
            entity.TableName,
            JsonSerializer.Deserialize<List<string>>(entity.OrderJson, JsonOptions) ?? new List<string>(),
            JsonSerializer.Deserialize<List<string>>(entity.HiddenJson, JsonOptions) ?? new List<string>(),
            JsonSerializer.Deserialize<Dictionary<string, string>>(entity.BaseFieldNamesJson, JsonOptions) ?? new Dictionary<string, string>(),
            JsonSerializer.Deserialize<Dictionary<string, BaseFieldMetaDto>>(entity.BaseFieldMetaJson, JsonOptions) ?? new Dictionary<string, BaseFieldMetaDto>()
        );
    }
}
