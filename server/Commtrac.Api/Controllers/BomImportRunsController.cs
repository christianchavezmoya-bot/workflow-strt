/**
 * BomImportRunsController.cs
 * REST API for the BOM-to-Project module.
 * All routes are under /api/bom-import-runs.
 * Feature-gated: returns 503 when ENABLE_BOM_PROJECT_MODULE != "true".
 */
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using System.Text.Json;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/bom-import-runs")]
[Authorize]
public class BomImportRunsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    public BomImportRunsController(AppDbContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
    }

    private bool ModuleEnabled =>
        _config["ENABLE_BOM_PROJECT_MODULE"]?.ToLower() == "true" ||
        Environment.GetEnvironmentVariable("ENABLE_BOM_PROJECT_MODULE")?.ToLower() == "true";

    private IActionResult ModuleDisabled() =>
        StatusCode(503, new { error = "BOM module is disabled. Set ENABLE_BOM_PROJECT_MODULE=true to activate." });

    // ── CRUD: Import Runs ──────────────────────────────────────────────────────

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] bool includeDeleted = false)
    {
        if (!ModuleEnabled) return ModuleDisabled();
        var query = includeDeleted ? _db.BomImportRuns.IgnoreQueryFilters() : _db.BomImportRuns;
        var runs = await query
            .OrderByDescending(r => r.UploadedAt)
            .Select(r => MapToDto(r))
            .ToListAsync();
        return Ok(runs);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> Get(string id, [FromQuery] bool includeDeleted = false)
    {
        if (!ModuleEnabled) return ModuleDisabled();
        var query = includeDeleted ? _db.BomImportRuns.IgnoreQueryFilters() : _db.BomImportRuns;
        var run = await query.FirstOrDefaultAsync(r => r.Id == id);
        if (run == null) return NotFound();
        return Ok(MapToDto(run));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateBomRunRequest req)
    {
        if (!ModuleEnabled) return ModuleDisabled();
        var user = HttpContext.User.Identity?.Name ?? "unknown";
        var run = new BomImportRunEntity
        {
            FileName = req.FileName,
            FileSizeBytes = req.FileSizeBytes,
            UploadedBy = user,
            Status = "parsing",
            SheetNamesJson = JsonSerializer.Serialize(req.SheetNames, JsonOpts),
            SelectedSheetsJson = JsonSerializer.Serialize(req.SelectedSheets, JsonOpts),
            Notes = req.Notes,
        };
        _db.BomImportRuns.Add(run);
        await _db.SaveChangesAsync();
        return Ok(MapToDto(run));
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] UpdateBomRunRequest req)
    {
        if (!ModuleEnabled) return ModuleDisabled();
        var run = await _db.BomImportRuns.FindAsync(id);
        if (run == null) return NotFound();

        if (req.Status != null) run.Status = req.Status;
        if (req.StatusMessage != null) run.StatusMessage = req.StatusMessage;
        if (req.TotalRawRows.HasValue) run.TotalRawRows = req.TotalRawRows.Value;
        if (req.NormalizedRows.HasValue) run.NormalizedRows = req.NormalizedRows.Value;
        if (req.ClassifiedRows.HasValue) run.ClassifiedRows = req.ClassifiedRows.Value;
        if (req.ValidationErrors.HasValue) run.ValidationErrors = req.ValidationErrors.Value;
        if (req.ValidationWarnings.HasValue) run.ValidationWarnings = req.ValidationWarnings.Value;
        if (req.PublishedProjectId != null) run.PublishedProjectId = req.PublishedProjectId;
        run.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(MapToDto(run));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        if (!ModuleEnabled) return ModuleDisabled();
        var run = await _db.BomImportRuns.IgnoreQueryFilters().FirstOrDefaultAsync(r => r.Id == id);
        if (run == null) return NotFound();
        if (run.IsDeleted) return NoContent();
        run.IsDeleted = true;
        run.DeletedAtUtc = DateTime.UtcNow;
        run.DeletedByUserId = HttpContext.User.Identity?.Name;
        run.Status = "archived";
        run.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{id}/restore")]
    public async Task<IActionResult> Restore(string id)
    {
        if (!ModuleEnabled) return ModuleDisabled();
        var run = await _db.BomImportRuns.IgnoreQueryFilters().FirstOrDefaultAsync(r => r.Id == id);
        if (run == null) return NotFound();

        run.IsDeleted = false;
        run.DeletedAtUtc = null;
        run.DeletedByUserId = null;
        run.DeleteReason = null;
        if (run.Status == "archived")
        {
            run.Status = string.IsNullOrWhiteSpace(run.PublishedProjectId) ? "ready" : "published";
        }
        run.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id}/purge")]
    public async Task<IActionResult> Purge(string id)
    {
        if (!ModuleEnabled) return ModuleDisabled();
        var run = await _db.BomImportRuns.IgnoreQueryFilters().FirstOrDefaultAsync(r => r.Id == id);
        if (run == null) return NotFound();
        _db.BomImportRuns.Remove(run);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ── Draft persistence ──────────────────────────────────────────────────────

    [HttpPost("{id}/draft")]
    public async Task<IActionResult> SaveDraft(string id, [FromBody] JsonElement draft)
    {
        if (!ModuleEnabled) return ModuleDisabled();
        var run = await _db.BomImportRuns.FindAsync(id);
        if (run == null) return NotFound();
        run.DraftProjectJson = JsonSerializer.Serialize(draft, JsonOpts);
        run.Status = "ready";
        run.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(draft);
    }

    [HttpGet("{id}/draft")]
    public async Task<IActionResult> GetDraft(string id)
    {
        if (!ModuleEnabled) return ModuleDisabled();
        var run = await _db.BomImportRuns.FindAsync(id);
        if (run == null || string.IsNullOrWhiteSpace(run.DraftProjectJson)) return NotFound();
        return Content(run.DraftProjectJson, "application/json");
    }

    // ── Validation ─────────────────────────────────────────────────────────────

    [HttpPost("{id}/validation")]
    public async Task<IActionResult> SaveValidation(string id, [FromBody] JsonElement validationResult)
    {
        if (!ModuleEnabled) return ModuleDisabled();
        var run = await _db.BomImportRuns.FindAsync(id);
        if (run == null) return NotFound();
        run.ValidationResultJson = JsonSerializer.Serialize(validationResult, JsonOpts);

        // Parse error / warning counts
        if (validationResult.TryGetProperty("errors", out var errs) && errs.ValueKind == JsonValueKind.Array)
            run.ValidationErrors = errs.GetArrayLength();
        if (validationResult.TryGetProperty("warnings", out var warns) && warns.ValueKind == JsonValueKind.Array)
            run.ValidationWarnings = warns.GetArrayLength();

        run.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ── Publish ────────────────────────────────────────────────────────────────

    [HttpPost("{id}/publish")]
    public async Task<IActionResult> Publish(string id, [FromBody] PublishBomRequest req)
    {
        if (!ModuleEnabled) return ModuleDisabled();
        var run = await _db.BomImportRuns.FindAsync(id);
        if (run == null) return NotFound();

        if (req.Mode == "publish" && run.ValidationErrors > 0)
        {
            return UnprocessableEntity(new { error = "Cannot publish: unresolved validation errors." });
        }

        if (req.Mode == "publish")
        {
            run.Status = "published";
            run.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
        }

        return Ok(new
        {
            publishedProjectId = run.PublishedProjectId,
            summary = $"Mode: {req.Mode}. Run: {id}",
            warnings = new string[] { }
        });
    }

    // ── Mapping Profiles ───────────────────────────────────────────────────────

    [HttpGet("/api/bom-mapping-profiles")]
    public async Task<IActionResult> ListProfiles()
    {
        if (!ModuleEnabled) return ModuleDisabled();
        var profiles = await _db.BomMappingProfiles.OrderByDescending(p => p.UpdatedAt).ToListAsync();
        return Ok(profiles.Select(p => new
        {
            id = p.Id,
            name = p.Name,
            mappings = JsonSerializer.Deserialize<object>(p.MappingsJson, JsonOpts),
            createdAt = p.CreatedAt,
            updatedAt = p.UpdatedAt,
        }));
    }

    [HttpPost("/api/bom-mapping-profiles")]
    public async Task<IActionResult> CreateProfile([FromBody] SaveProfileRequest req)
    {
        if (!ModuleEnabled) return ModuleDisabled();
        var profile = new BomMappingProfileEntity
        {
            Name = req.Name,
            MappingsJson = JsonSerializer.Serialize(req.Mappings, JsonOpts),
            CreatedBy = HttpContext.User.Identity?.Name,
        };
        _db.BomMappingProfiles.Add(profile);
        await _db.SaveChangesAsync();
        return Ok(new { id = profile.Id, name = profile.Name, createdAt = profile.CreatedAt, updatedAt = profile.UpdatedAt });
    }

    [HttpDelete("/api/bom-mapping-profiles/{id}")]
    public async Task<IActionResult> DeleteProfile(string id)
    {
        if (!ModuleEnabled) return ModuleDisabled();
        var p = await _db.BomMappingProfiles.FindAsync(id);
        if (p == null) return NotFound();
        _db.BomMappingProfiles.Remove(p);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ── Rule Profiles ──────────────────────────────────────────────────────────

    [HttpGet("/api/bom-rule-profiles")]
    public async Task<IActionResult> ListRuleProfiles()
    {
        if (!ModuleEnabled) return ModuleDisabled();
        var profiles = await _db.BomRuleProfiles.OrderByDescending(p => p.UpdatedAt).ToListAsync();
        return Ok(profiles.Select(p => new
        {
            id = p.Id,
            name = p.Name,
            rules = JsonSerializer.Deserialize<object>(p.RulesJson, JsonOpts),
            createdAt = p.CreatedAt,
            updatedAt = p.UpdatedAt,
        }));
    }

    [HttpPost("/api/bom-rule-profiles")]
    public async Task<IActionResult> CreateRuleProfile([FromBody] SaveRuleProfileRequest req)
    {
        if (!ModuleEnabled) return ModuleDisabled();
        var profile = new BomRuleProfileEntity
        {
            Name = req.Name,
            RulesJson = JsonSerializer.Serialize(req.Rules, JsonOpts),
            CreatedBy = HttpContext.User.Identity?.Name,
        };
        _db.BomRuleProfiles.Add(profile);
        await _db.SaveChangesAsync();
        return Ok(new { id = profile.Id, name = profile.Name, createdAt = profile.CreatedAt, updatedAt = profile.UpdatedAt });
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private static object MapToDto(BomImportRunEntity r) => new
    {
        id = r.Id,
        fileName = r.FileName,
        fileSizeBytes = r.FileSizeBytes,
        uploadedAt = r.UploadedAt,
        uploadedBy = r.UploadedBy,
        status = r.Status,
        statusMessage = r.StatusMessage,
        sheetNames = r.SheetNamesJson != null ? JsonSerializer.Deserialize<List<string>>(r.SheetNamesJson, JsonOpts) : new List<string>(),
        selectedSheets = r.SelectedSheetsJson != null ? JsonSerializer.Deserialize<List<string>>(r.SelectedSheetsJson, JsonOpts) : new List<string>(),
        mappingProfileId = r.MappingProfileId,
        ruleProfileId = r.RuleProfileId,
        totalRawRows = r.TotalRawRows,
        normalizedRows = r.NormalizedRows,
        classifiedRows = r.ClassifiedRows,
        validationErrors = r.ValidationErrors,
        validationWarnings = r.ValidationWarnings,
        publishedProjectId = r.PublishedProjectId,
        notes = r.Notes,
        isDeleted = r.IsDeleted,
        deletedAtUtc = r.DeletedAtUtc,
        deletedByUserId = r.DeletedByUserId,
        deleteReason = r.DeleteReason,
    };
}

// ── Request models ─────────────────────────────────────────────────────────────

public record CreateBomRunRequest(
    string FileName,
    long FileSizeBytes,
    List<string> SheetNames,
    List<string> SelectedSheets,
    string? Notes
);

public record UpdateBomRunRequest(
    string? Status,
    string? StatusMessage,
    int? TotalRawRows,
    int? NormalizedRows,
    int? ClassifiedRows,
    int? ValidationErrors,
    int? ValidationWarnings,
    string? PublishedProjectId
);

public record PublishBomRequest(string Mode);

public record SaveProfileRequest(string Name, object Mappings);

public record SaveRuleProfileRequest(string Name, object Rules);
