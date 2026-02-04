using System.Text.Json;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/custom-fields")]
[Authorize]
public class CustomFieldsController : ControllerBase
{
    private readonly AppDbContext _db;

    public CustomFieldsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<CustomFieldDefinitionDto>>> GetAll(
        [FromQuery] string? scope,
        [FromQuery] string? product
    )
    {
        var query = _db.CustomFieldDefinitions.AsQueryable();
        if (!string.IsNullOrWhiteSpace(scope))
        {
            query = query.Where(f => f.Scope == scope);
        }
        if (!string.IsNullOrWhiteSpace(product))
        {
            query = query.Where(f => f.Product == product || f.Product == null);
        }

        var fields = await query.OrderBy(f => f.SortOrder).ToListAsync();
        return Ok(fields.Select(ToDto));
    }

    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<CustomFieldDefinitionDto>> Create([FromBody] CustomFieldDefinitionDto request)
    {
        var entity = new CustomFieldDefinitionEntity
        {
            Id = string.IsNullOrWhiteSpace(request.Id) ? Guid.NewGuid().ToString() : request.Id,
            Name = request.Name,
            FieldType = request.FieldType,
            Scope = request.Scope,
            Product = request.Product,
            SortOrder = request.SortOrder,
            OptionsJson = JsonSerializer.Serialize(request.Options ?? new List<string>()),
            IsActive = request.IsActive
        };

        _db.CustomFieldDefinitions.Add(entity);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetAll), new { id = entity.Id }, ToDto(entity));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<CustomFieldDefinitionDto>> Update(string id, [FromBody] CustomFieldDefinitionDto request)
    {
        var entity = await _db.CustomFieldDefinitions.FirstOrDefaultAsync(f => f.Id == id);
        if (entity is null)
        {
            return NotFound();
        }

        entity.Name = request.Name;
        entity.FieldType = request.FieldType;
        entity.Scope = request.Scope;
        entity.Product = request.Product;
        entity.SortOrder = request.SortOrder;
        entity.OptionsJson = JsonSerializer.Serialize(request.Options ?? new List<string>());
        entity.IsActive = request.IsActive;

        await _db.SaveChangesAsync();
        return Ok(ToDto(entity));
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(string id)
    {
        var entity = await _db.CustomFieldDefinitions.FirstOrDefaultAsync(f => f.Id == id);
        if (entity is null)
        {
            return NotFound();
        }

        _db.CustomFieldDefinitions.Remove(entity);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static CustomFieldDefinitionDto ToDto(CustomFieldDefinitionEntity entity)
        => new(
            entity.Id,
            entity.Name,
            entity.FieldType,
            entity.Scope,
            entity.Product,
            entity.SortOrder,
            string.IsNullOrWhiteSpace(entity.OptionsJson)
                ? new List<string>()
                : JsonSerializer.Deserialize<List<string>>(entity.OptionsJson) ?? new List<string>(),
            entity.IsActive
        );
}
