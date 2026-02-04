using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/field-values")]
[Authorize]
public class FieldValuesController : ControllerBase
{
    private readonly AppDbContext _db;

    public FieldValuesController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<FieldValueDto>>> GetByEntity([FromQuery] string table, [FromQuery] string entityId)
    {
        if (string.IsNullOrWhiteSpace(table) || string.IsNullOrWhiteSpace(entityId))
        {
            return BadRequest("table and entityId are required.");
        }

        var values = await _db.FieldValues
            .Where(v => v.TableName == table && v.EntityId == entityId)
            .ToListAsync();
        return Ok(values.Select(ToDto));
    }

    [HttpGet("table/{table}")]
    public async Task<ActionResult<IEnumerable<FieldValueDto>>> GetByTable(string table)
    {
        if (string.IsNullOrWhiteSpace(table))
        {
            return BadRequest("table is required.");
        }

        var values = await _db.FieldValues
            .Where(v => v.TableName == table)
            .ToListAsync();
        return Ok(values.Select(ToDto));
    }

    [HttpPost("bulk")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<IEnumerable<FieldValueDto>>> Upsert([FromBody] List<FieldValueDto> values)
    {
        if (values == null || values.Count == 0)
        {
            return Ok(Array.Empty<FieldValueDto>());
        }

        var ids = values.Where(v => !string.IsNullOrWhiteSpace(v.Id)).Select(v => v.Id).ToList();
        var existing = await _db.FieldValues
            .Where(v => ids.Contains(v.Id))
            .ToListAsync();
        var existingById = existing.ToDictionary(v => v.Id, v => v);

        var missingKeyQueries = values
            .Where(v => string.IsNullOrWhiteSpace(v.Id))
            .Select(v => new { v.FieldDefinitionId, v.TableName, v.EntityId })
            .Distinct()
            .ToList();

        var existingByKey = new Dictionary<(string FieldDefinitionId, string TableName, string EntityId), FieldValueEntity>();
        if (missingKeyQueries.Count > 0)
        {
            var fieldIds = missingKeyQueries.Select(v => v.FieldDefinitionId).ToList();
            var tableNames = missingKeyQueries.Select(v => v.TableName).ToList();
            var entityIds = missingKeyQueries.Select(v => v.EntityId).ToList();
            var existingByKeys = await _db.FieldValues
                .Where(v => fieldIds.Contains(v.FieldDefinitionId) && tableNames.Contains(v.TableName) && entityIds.Contains(v.EntityId))
                .ToListAsync();
            foreach (var item in existingByKeys)
            {
                existingByKey[(item.FieldDefinitionId, item.TableName, item.EntityId)] = item;
            }
        }

        foreach (var value in values)
        {
            if (!string.IsNullOrWhiteSpace(value.Id) && existingById.TryGetValue(value.Id, out var entity))
            {
                entity.FieldDefinitionId = value.FieldDefinitionId;
                entity.TableName = value.TableName;
                entity.EntityId = value.EntityId;
                entity.Value = value.Value;
                entity.UpdatedAt = value.UpdatedAt;
            }
            else if (existingByKey.TryGetValue((value.FieldDefinitionId, value.TableName, value.EntityId), out var existingByComposite))
            {
                existingByComposite.Value = value.Value;
                existingByComposite.UpdatedAt = value.UpdatedAt;
            }
            else
            {
                _db.FieldValues.Add(new FieldValueEntity
                {
                    Id = string.IsNullOrWhiteSpace(value.Id) ? Guid.NewGuid().ToString() : value.Id,
                    FieldDefinitionId = value.FieldDefinitionId,
                    TableName = value.TableName,
                    EntityId = value.EntityId,
                    Value = value.Value,
                    UpdatedAt = value.UpdatedAt
                });
            }
        }

        await _db.SaveChangesAsync();
        return Ok(values);
    }

    private static FieldValueDto ToDto(FieldValueEntity entity)
        => new(
            entity.Id,
            entity.FieldDefinitionId,
            entity.TableName,
            entity.EntityId,
            entity.Value,
            entity.UpdatedAt
        );
}
