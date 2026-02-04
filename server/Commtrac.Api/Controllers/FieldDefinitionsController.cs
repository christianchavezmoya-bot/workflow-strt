using System.Text.Json;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/field-definitions")]
[Authorize]
public class FieldDefinitionsController : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly AppDbContext _db;

    public FieldDefinitionsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<FieldDefinitionDto>>> GetAll()
    {
        var fields = await _db.FieldDefinitions
            .OrderBy(f => f.SortOrder)
            .ThenBy(f => f.Name)
            .ToListAsync();
        return Ok(fields.Select(ToDto));
    }

    [HttpPost("seed")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<IEnumerable<FieldDefinitionDto>>> SeedDefaults()
    {
        var existing = await _db.FieldDefinitions.ToListAsync();
        var existingIds = new HashSet<string>(existing.Select(e => e.Id));
        var defaults = DefaultFields().ToList();

        var missing = defaults.Where(field => !existingIds.Contains(field.Id)).ToList();
        if (missing.Count > 0)
        {
            _db.FieldDefinitions.AddRange(missing);
            await _db.SaveChangesAsync();
        }

        var all = await _db.FieldDefinitions
            .OrderBy(f => f.SortOrder)
            .ThenBy(f => f.Name)
            .ToListAsync();
        return Ok(all.Select(ToDto));
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<FieldDefinitionDto>> Create([FromBody] FieldDefinitionDto request)
    {
        var entity = new FieldDefinitionEntity
        {
            Id = string.IsNullOrWhiteSpace(request.Id) ? Guid.NewGuid().ToString() : request.Id,
            Name = request.Name,
            FieldType = request.FieldType,
            LinkToFieldId = string.IsNullOrWhiteSpace(request.LinkToFieldId) ? null : request.LinkToFieldId,
            ActionType = string.IsNullOrWhiteSpace(request.ActionType) ? null : request.ActionType,
            TablesJson = JsonSerializer.Serialize(request.Tables ?? new List<string>(), JsonOptions),
            SortOrder = request.SortOrder,
            IsActive = request.IsActive
        };
        _db.FieldDefinitions.Add(entity);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetAll), new { id = entity.Id }, ToDto(entity));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<FieldDefinitionDto>> Update(string id, [FromBody] FieldDefinitionDto request)
    {
        var entity = await _db.FieldDefinitions.FirstOrDefaultAsync(f => f.Id == id);
        if (entity is null)
        {
            return NotFound();
        }

        entity.Name = request.Name;
        entity.FieldType = request.FieldType;
        entity.LinkToFieldId = string.IsNullOrWhiteSpace(request.LinkToFieldId) ? null : request.LinkToFieldId;
        entity.ActionType = string.IsNullOrWhiteSpace(request.ActionType) ? null : request.ActionType;
        entity.TablesJson = JsonSerializer.Serialize(request.Tables ?? new List<string>(), JsonOptions);
        entity.SortOrder = request.SortOrder;
        entity.IsActive = request.IsActive;
        await _db.SaveChangesAsync();
        return Ok(ToDto(entity));
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Delete(string id)
    {
        var entity = await _db.FieldDefinitions.FirstOrDefaultAsync(f => f.Id == id);
        if (entity is null)
        {
            return NotFound();
        }

        _db.FieldDefinitions.Remove(entity);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static FieldDefinitionDto ToDto(FieldDefinitionEntity entity)
        => new(
            entity.Id,
            entity.Name,
            entity.FieldType,
            entity.LinkToFieldId,
            entity.ActionType,
            string.IsNullOrWhiteSpace(entity.TablesJson)
                ? new List<string>()
                : JsonSerializer.Deserialize<List<string>>(entity.TablesJson, JsonOptions) ?? new List<string>(),
            entity.SortOrder,
            entity.IsActive
        );

    private static IEnumerable<FieldDefinitionEntity> DefaultFields()
        => new[]
        {
            new FieldDefinitionEntity { Id = "field-job-number", Name = "Job Number", FieldType = "primary key", TablesJson = JsonSerializer.Serialize(new[] { "projects", "installations" }, JsonOptions), SortOrder = 1, IsActive = true },
            new FieldDefinitionEntity { Id = "field-project-type", Name = "Project Type", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "projects" }, JsonOptions), SortOrder = 2, IsActive = true },
            new FieldDefinitionEntity { Id = "field-customer", Name = "Customer", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "projects", "customers" }, JsonOptions), SortOrder = 3, IsActive = true },
            new FieldDefinitionEntity { Id = "field-products", Name = "Products", FieldType = "multi-select", TablesJson = JsonSerializer.Serialize(new[] { "projects", "products" }, JsonOptions), SortOrder = 4, IsActive = true },
            new FieldDefinitionEntity { Id = "field-status", Name = "Status", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "projects", "installations", "inspections", "issues" }, JsonOptions), SortOrder = 5, IsActive = true },
            new FieldDefinitionEntity { Id = "field-office", Name = "Office", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "projects", "customers", "users" }, JsonOptions), SortOrder = 6, IsActive = true },
            new FieldDefinitionEntity { Id = "field-site-name", Name = "Site Name", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "installations" }, JsonOptions), SortOrder = 7, IsActive = true },
            new FieldDefinitionEntity { Id = "field-start-date", Name = "Start Date", FieldType = "date", TablesJson = JsonSerializer.Serialize(new[] { "installations", "issues" }, JsonOptions), SortOrder = 8, IsActive = true },
            new FieldDefinitionEntity { Id = "field-finish-date", Name = "Finish Date", FieldType = "date", TablesJson = JsonSerializer.Serialize(new[] { "issues" }, JsonOptions), SortOrder = 9, IsActive = true },
            new FieldDefinitionEntity { Id = "field-progress", Name = "Progress", FieldType = "percentage", TablesJson = JsonSerializer.Serialize(new[] { "installations" }, JsonOptions), SortOrder = 10, IsActive = true },
            new FieldDefinitionEntity { Id = "field-installer", Name = "Installer", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "installations", "inspections" }, JsonOptions), SortOrder = 11, IsActive = true },
            new FieldDefinitionEntity { Id = "field-inspector", Name = "Inspector", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "inspections" }, JsonOptions), SortOrder = 12, IsActive = true },
            new FieldDefinitionEntity { Id = "field-photos", Name = "Photos", FieldType = "number", TablesJson = JsonSerializer.Serialize(new[] { "inspections" }, JsonOptions), SortOrder = 13, IsActive = true },
            new FieldDefinitionEntity { Id = "field-issue", Name = "Issue", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "issues" }, JsonOptions), SortOrder = 14, IsActive = true },
            new FieldDefinitionEntity { Id = "field-priority", Name = "Priority", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "issues" }, JsonOptions), SortOrder = 15, IsActive = true },
            new FieldDefinitionEntity { Id = "field-owner", Name = "Owner", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "issues" }, JsonOptions), SortOrder = 16, IsActive = true },
            new FieldDefinitionEntity { Id = "field-machine-type", Name = "Machine Type", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "installations", "assets" }, JsonOptions), SortOrder = 17, IsActive = true },
            new FieldDefinitionEntity { Id = "field-pm1", Name = "PM-1 S/N", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "installations" }, JsonOptions), SortOrder = 18, IsActive = true },
            new FieldDefinitionEntity { Id = "field-pm2", Name = "PM-2 S/N", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "installations" }, JsonOptions), SortOrder = 19, IsActive = true },
            new FieldDefinitionEntity { Id = "field-pm3", Name = "PM-3 S/N", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "installations" }, JsonOptions), SortOrder = 20, IsActive = true },
            new FieldDefinitionEntity { Id = "field-pm4", Name = "PM-4 S/N", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "installations" }, JsonOptions), SortOrder = 21, IsActive = true },
            new FieldDefinitionEntity { Id = "field-asset-id", Name = "Asset ID#", FieldType = "primary key", TablesJson = JsonSerializer.Serialize(new[] { "assets" }, JsonOptions), SortOrder = 22, IsActive = true },
            new FieldDefinitionEntity { Id = "field-machine-id", Name = "Machine ID", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "assets" }, JsonOptions), SortOrder = 23, IsActive = true },
            new FieldDefinitionEntity { Id = "field-serial-number", Name = "Serial Number", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "assets" }, JsonOptions), SortOrder = 24, IsActive = true },
            new FieldDefinitionEntity { Id = "field-pm-count", Name = "PM Count", FieldType = "number", TablesJson = JsonSerializer.Serialize(new[] { "assets" }, JsonOptions), SortOrder = 25, IsActive = true },
            new FieldDefinitionEntity { Id = "field-comments", Name = "Comments", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "assets" }, JsonOptions), SortOrder = 26, IsActive = true },
            new FieldDefinitionEntity { Id = "field-document", Name = "Document", FieldType = "file", TablesJson = JsonSerializer.Serialize(new[] { "documents" }, JsonOptions), SortOrder = 27, IsActive = true },
            new FieldDefinitionEntity { Id = "field-document-type", Name = "Document Type", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "documents" }, JsonOptions), SortOrder = 28, IsActive = true },
            new FieldDefinitionEntity { Id = "field-linked-to", Name = "Linked To", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "documents" }, JsonOptions), SortOrder = 29, IsActive = true },
            new FieldDefinitionEntity { Id = "field-uploaded-at", Name = "Uploaded At", FieldType = "date", TablesJson = JsonSerializer.Serialize(new[] { "documents" }, JsonOptions), SortOrder = 30, IsActive = true },
            new FieldDefinitionEntity { Id = "field-user-name", Name = "User Name", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "users" }, JsonOptions), SortOrder = 31, IsActive = true },
            new FieldDefinitionEntity { Id = "field-email", Name = "Email", FieldType = "email", TablesJson = JsonSerializer.Serialize(new[] { "users" }, JsonOptions), SortOrder = 32, IsActive = true },
            new FieldDefinitionEntity { Id = "field-role", Name = "Role", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "users" }, JsonOptions), SortOrder = 33, IsActive = true },
            new FieldDefinitionEntity { Id = "field-active", Name = "Active", FieldType = "checkbox", TablesJson = JsonSerializer.Serialize(new[] { "users" }, JsonOptions), SortOrder = 34, IsActive = true }
        };
}
