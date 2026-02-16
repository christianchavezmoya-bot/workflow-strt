using System.Text.Json;
using System.Text.RegularExpressions;
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
    private static readonly Regex GuidPattern = new(@"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private readonly AppDbContext _db;

    public FieldDefinitionsController(AppDbContext db)
    {
        _db = db;
    }

    /// <summary>Converts a field name to a readable slug ID, e.g. "Job Number" → "field-job-number".</summary>
    private static string ToSlug(string name)
    {
        var slug = name.Trim().ToLowerInvariant();
        slug = Regex.Replace(slug, @"[^a-z0-9\s-]", ""); // strip special chars
        slug = Regex.Replace(slug, @"[\s-]+", "-");        // collapse whitespace/hyphens
        slug = slug.Trim('-');
        return $"field-{slug}";
    }

    /// <summary>Returns true if the given ID looks like an auto-generated GUID.</summary>
    private static bool IsGuid(string id) => GuidPattern.IsMatch(id);

    [HttpGet]
    public async Task<ActionResult<IEnumerable<FieldDefinitionDto>>> GetAll()
    {
        var fields = await _db.FieldDefinitions
            .OrderBy(f => f.SortOrder)
            .ThenBy(f => f.Name)
            .ToListAsync();
        return Ok(fields.Select(ToDto));
    }

    [HttpGet("tables")]
    public ActionResult<IEnumerable<string>> GetAvailableTables()
    {
        var tables = new List<string>
        {
            "projects",
            "products",
            "installations",
            "inspections",
            "issues",
            "customers",
            "sites",
            "users",
            "assets",
            "documents",
            "offices",
            "globaloffices",
            "roles",
            "admintabs",
            "installationtabs",
            "tableconfigs",
            "roleconfigs"
        };
        return Ok(tables.OrderBy(t => t));
    }

    [HttpPost("seed")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<IEnumerable<FieldDefinitionDto>>> SeedDefaults()
    {
        var existing = await _db.FieldDefinitions.ToListAsync();
        var existingIds = new HashSet<string>(existing.Select(e => e.Id));
        var defaults = DefaultFields().ToList();

        // Add missing fields
        var missing = defaults.Where(field => !existingIds.Contains(field.Id)).ToList();
        if (missing.Count > 0)
        {
            _db.FieldDefinitions.AddRange(missing);
        }

        // Update names of existing fields if they've changed
        foreach (var defaultField in defaults.Where(d => existingIds.Contains(d.Id)))
        {
            var existingField = existing.First(e => e.Id == defaultField.Id);
            if (existingField.Name != defaultField.Name)
            {
                existingField.Name = defaultField.Name;
            }
        }

        if (missing.Count > 0 || _db.ChangeTracker.HasChanges())
        {
            await _db.SaveChangesAsync();
        }

        // Auto-migrate any GUID-based IDs to readable slugs
        await MigrateGuidIdsInternal();

        var all = await _db.FieldDefinitions
            .OrderBy(f => f.SortOrder)
            .ThenBy(f => f.Name)
            .ToListAsync();
        return Ok(all.Select(ToDto));
    }

    [HttpPost("actions/migrate-ids")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<object>> MigrateGuidIds()
    {
        var migrated = await MigrateGuidIdsInternal();
        if (migrated == 0)
        {
            return Ok(new { migrated = 0, message = "No GUID-based field IDs found. All IDs are already readable." });
        }
        return Ok(new { migrated, message = $"Migrated {migrated} field ID(s) from GUIDs to readable slugs." });
    }

    /// <summary>Converts all GUID-based field IDs to readable slugs. Returns the number of fields migrated.</summary>
    private async Task<int> MigrateGuidIdsInternal()
    {
        // Detach tracked entities so raw SQL changes are picked up on next query
        _db.ChangeTracker.Clear();

        var fields = await _db.FieldDefinitions.ToListAsync();
        var guidFields = fields.Where(f => IsGuid(f.Id)).ToList();

        if (guidFields.Count == 0) return 0;

        // Build old ID → new slug mapping
        var existingIds = new HashSet<string>(fields.Select(f => f.Id));
        var idMap = new Dictionary<string, string>();

        foreach (var field in guidFields)
        {
            var baseSlug = ToSlug(field.Name);
            var slug = baseSlug;
            var suffix = 2;
            while (existingIds.Contains(slug) || idMap.ContainsValue(slug))
            {
                slug = $"{baseSlug}-{suffix}";
                suffix++;
            }
            idMap[field.Id] = slug;
        }

        // Since SQLite doesn't support cascade updates on PKs, we use raw SQL within a transaction
        using var transaction = await _db.Database.BeginTransactionAsync();
        try
        {
            foreach (var (oldId, newId) in idMap)
            {
                // Update FieldValues that reference this field
                await _db.Database.ExecuteSqlRawAsync(
                    "UPDATE FieldValues SET FieldDefinitionId = {0} WHERE FieldDefinitionId = {1}",
                    newId, oldId);

                // Update LinkToFieldId references in other field definitions
                await _db.Database.ExecuteSqlRawAsync(
                    "UPDATE FieldDefinitions SET LinkToFieldId = {0} WHERE LinkToFieldId = {1}",
                    newId, oldId);

                // Update the field definition ID itself
                await _db.Database.ExecuteSqlRawAsync(
                    "UPDATE FieldDefinitions SET Id = {0} WHERE Id = {1}",
                    newId, oldId);
            }

            // Update AdminTabs FieldIdsJson — replace GUID references inside JSON arrays
            _db.ChangeTracker.Clear();
            var adminTabs = await _db.AdminTabs.ToListAsync();
            foreach (var tab in adminTabs)
            {
                if (string.IsNullOrWhiteSpace(tab.FieldIdsJson)) continue;
                var fieldIds = JsonSerializer.Deserialize<List<string>>(tab.FieldIdsJson, JsonOptions) ?? new List<string>();
                var changed = false;
                for (var i = 0; i < fieldIds.Count; i++)
                {
                    if (idMap.TryGetValue(fieldIds[i], out var newFieldId))
                    {
                        fieldIds[i] = newFieldId;
                        changed = true;
                    }
                }
                if (changed)
                {
                    tab.FieldIdsJson = JsonSerializer.Serialize(fieldIds, JsonOptions);
                }
            }

            await _db.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }

        // Clear tracker so subsequent queries see fresh data
        _db.ChangeTracker.Clear();
        return idMap.Count;
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<FieldDefinitionDto>> Create([FromBody] FieldDefinitionDto request)
    {
        // Generate a readable slug ID from the field name unless a non-GUID ID was explicitly provided
        var id = request.Id;
        if (string.IsNullOrWhiteSpace(id) || IsGuid(id))
        {
            id = await GenerateUniqueSlug(request.Name);
        }

        var entity = new FieldDefinitionEntity
        {
            Id = id,
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

    /// <summary>Generates a unique slug, appending a numeric suffix if the base slug already exists.</summary>
    private async Task<string> GenerateUniqueSlug(string name)
    {
        var baseSlug = ToSlug(name);
        var slug = baseSlug;
        var suffix = 2;
        while (await _db.FieldDefinitions.AnyAsync(f => f.Id == slug))
        {
            slug = $"{baseSlug}-{suffix}";
            suffix++;
        }
        return slug;
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
            new FieldDefinitionEntity { Id = "field-office", Name = "Global Offices", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "projects", "customers", "users" }, JsonOptions), SortOrder = 6, IsActive = true },
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
            new FieldDefinitionEntity { Id = "field-active", Name = "Active", FieldType = "checkbox", TablesJson = JsonSerializer.Serialize(new[] { "users" }, JsonOptions), SortOrder = 34, IsActive = true },
            new FieldDefinitionEntity { Id = "field-site-address", Name = "Address", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "sites" }, JsonOptions), SortOrder = 35, IsActive = true },
            new FieldDefinitionEntity { Id = "field-site-city", Name = "City", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "sites" }, JsonOptions), SortOrder = 36, IsActive = true },
            new FieldDefinitionEntity { Id = "field-site-state", Name = "State", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "sites" }, JsonOptions), SortOrder = 37, IsActive = true },
            new FieldDefinitionEntity { Id = "field-site-country", Name = "Country", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "sites" }, JsonOptions), SortOrder = 38, IsActive = true },
            new FieldDefinitionEntity { Id = "field-site-zipcode", Name = "Zip Code", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "sites" }, JsonOptions), SortOrder = 39, IsActive = true },
            new FieldDefinitionEntity { Id = "field-site-contact-name", Name = "Contact Name", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "sites" }, JsonOptions), SortOrder = 40, IsActive = true },
            new FieldDefinitionEntity { Id = "field-site-contact-phone", Name = "Contact Phone", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "sites" }, JsonOptions), SortOrder = 41, IsActive = true },
            new FieldDefinitionEntity { Id = "field-site-contact-email", Name = "Contact Email", FieldType = "email", TablesJson = JsonSerializer.Serialize(new[] { "sites" }, JsonOptions), SortOrder = 42, IsActive = true },
            new FieldDefinitionEntity { Id = "field-site-notes", Name = "Notes", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "sites" }, JsonOptions), SortOrder = 43, IsActive = true },
            new FieldDefinitionEntity { Id = "field-customer-id", Name = "Customer ID", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "customers" }, JsonOptions), SortOrder = 44, IsActive = true },
            new FieldDefinitionEntity { Id = "field-customer-industry", Name = "Industry", FieldType = "text", TablesJson = JsonSerializer.Serialize(new[] { "customers" }, JsonOptions), SortOrder = 45, IsActive = true },
            // Primary key targets for reference/lookup fields (enables linking to Customers/Sites in the UI).
            new FieldDefinitionEntity { Id = "field-customer-key", Name = "Customer Key", FieldType = "primary key", TablesJson = JsonSerializer.Serialize(new[] { "customers" }, JsonOptions), SortOrder = 46, IsActive = true },
            new FieldDefinitionEntity { Id = "field-site-key", Name = "Site Key", FieldType = "primary key", TablesJson = JsonSerializer.Serialize(new[] { "sites" }, JsonOptions), SortOrder = 47, IsActive = true }
        };
}
