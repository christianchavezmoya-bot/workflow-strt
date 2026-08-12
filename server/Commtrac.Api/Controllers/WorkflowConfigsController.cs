using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services.Storage;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/workflow-configs")]
[Authorize]
public class WorkflowConfigsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IFileStorageService _files;
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    public WorkflowConfigsController(AppDbContext db, IFileStorageService files)
    {
        _db = db;
        _files = files;
    }

    private string WorkflowMediaDirectory(string workflowId)
        => _files.BuildRelativePath("Storage", "WorkflowMedia", workflowId);

    private static WorkflowConfigDto ToDto(WorkflowConfigEntity e) => new(
        e.Id, e.ProductId, e.Name, e.DisplayName, e.ConfigType, e.WorkflowTypeId, e.Status, e.Version,
        e.TemplateSourceId, e.StepsJson, e.MediaJson, e.FeatureSelectionsJson,
        e.Notes, e.CreatedBy, e.CreatedAt, e.UpdatedAt
    );

    // GET api/workflow-configs/by-product/{productId}?status=Published
    [HttpGet("by-product/{productId}")]
    public async Task<IActionResult> ListByProduct(string productId, [FromQuery] string? status = null)
    {
        var q = _db.WorkflowConfigs.Where(c => c.ProductId == productId);
        if (!string.IsNullOrWhiteSpace(status))
            q = q.Where(c => c.Status == status);
        var list = await q.OrderByDescending(c => c.UpdatedAt).ToListAsync();
        return Ok(list.Select(ToDto));
    }

    // GET api/workflow-configs/{id}
    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        var c = await _db.WorkflowConfigs.FirstOrDefaultAsync(x => x.Id == id);
        if (c is null) return NotFound();
        return Ok(ToDto(c));
    }

    // POST api/workflow-configs
    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Create([FromBody] UpsertWorkflowConfigRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name))    return BadRequest(new { message = "Name is required." });
        if (string.IsNullOrWhiteSpace(req.ProductId)) return BadRequest(new { message = "ProductId is required." });

        var createdBy = User.Identity?.Name ?? User.FindFirst("email")?.Value;
        var entity = new WorkflowConfigEntity
        {
            Id                    = Guid.NewGuid().ToString(),
            ProductId             = req.ProductId!,
            Name                  = req.Name!,
            DisplayName           = req.DisplayName,
            ConfigType            = req.ConfigType,
            WorkflowTypeId        = string.IsNullOrWhiteSpace(req.WorkflowTypeId) ? null : req.WorkflowTypeId,
            Status                = "Draft",
            Version               = 1,
            StepsJson             = req.StepsJson ?? "[]",
            MediaJson             = req.MediaJson ?? "[]",
            FeatureSelectionsJson = req.FeatureSelectionsJson ?? "[]",
            Notes                 = req.Notes,
            CreatedBy             = createdBy,
            CreatedAt             = DateTime.UtcNow,
            UpdatedAt             = DateTime.UtcNow,
        };
        _db.WorkflowConfigs.Add(entity);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = entity.Id }, ToDto(entity));
    }

    // PUT api/workflow-configs/{id}  — only editable when Draft
    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Update(string id, [FromBody] UpsertWorkflowConfigRequest req)
    {
        var entity = await _db.WorkflowConfigs.FirstOrDefaultAsync(x => x.Id == id);
        if (entity is null) return NotFound();
        if (entity.Status != "Draft")
            return BadRequest(new { message = "Only Draft configurations can be edited. Clone this config to create a new version." });

        if (req.Name is not null)                  entity.Name                  = req.Name;
        if (req.DisplayName is not null)           entity.DisplayName           = req.DisplayName;
        if (req.ConfigType is not null)            entity.ConfigType            = req.ConfigType;
        if (req.WorkflowTypeId is not null)        entity.WorkflowTypeId        = string.IsNullOrWhiteSpace(req.WorkflowTypeId) ? null : req.WorkflowTypeId;
        if (req.Notes is not null)                 entity.Notes                 = req.Notes;
        if (req.StepsJson is not null)             entity.StepsJson             = req.StepsJson;
        if (req.MediaJson is not null)             entity.MediaJson             = req.MediaJson;
        if (req.FeatureSelectionsJson is not null) entity.FeatureSelectionsJson = req.FeatureSelectionsJson;
        entity.UpdatedAt             = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(ToDto(entity));
    }

    // POST api/workflow-configs/{id}/publish
    [HttpPost("{id}/publish")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Publish(string id)
    {
        var entity = await _db.WorkflowConfigs.FirstOrDefaultAsync(x => x.Id == id);
        if (entity is null) return NotFound();
        if (entity.Status == "Archived")
            return BadRequest(new { message = "Archived configurations cannot be published." });

        // ── Inject BOM steps from WorkflowConfigFeatures ──────────────────────
        var configFeatures = await _db.WorkflowConfigFeatures
            .Where(f => f.WorkflowConfigId == id)
            .OrderBy(f => f.SortOrder)
            .ToListAsync();

        if (configFeatures.Count > 0)
        {
            // Load the current steps array
            var steps = JsonSerializer.Deserialize<List<JsonElement>>(entity.StepsJson, JsonOpts) ?? new();

            // Determine highest existing order value
            int maxOrder = 0;
            foreach (var s in steps)
                if (s.TryGetProperty("order", out var ordProp) && ordProp.TryGetInt32(out var ord))
                    if (ord > maxOrder) maxOrder = ord;

            // Remove any previously-injected BOM steps (safe re-publish guard)
            steps = steps.Where(s =>
                !(s.TryGetProperty("bomSource", out _))).ToList();

            int nextOrder = maxOrder + 1;

            foreach (var cf in configFeatures)
            {
                var inclusions = string.IsNullOrWhiteSpace(cf.InclusionsJson) || cf.InclusionsJson == "{}"
                    ? new Dictionary<string, bool>()
                    : JsonSerializer.Deserialize<Dictionary<string, bool>>(cf.InclusionsJson, JsonOpts) ?? new();

                if (!inclusions.Any(kv => kv.Value)) continue; // nothing included

                // Load the feature and its included dependencies
                var feature = await _db.Features.FirstOrDefaultAsync(f => f.Id == cf.FeatureId);
                if (feature is null) continue;

                var depIds = inclusions.Where(kv => kv.Value).Select(kv => kv.Key).ToList();
                var deps = await _db.FeatureDependencies
                    .Where(d => d.FeatureId == cf.FeatureId && depIds.Contains(d.Id))
                    .OrderBy(d => d.SortOrder)
                    .ToListAsync();

                foreach (var dep in deps)
                {
                    var captureFields = string.IsNullOrWhiteSpace(dep.CaptureFieldsJson) || dep.CaptureFieldsJson == "[]"
                        ? new List<string>()
                        : JsonSerializer.Deserialize<List<string>>(dep.CaptureFieldsJson, JsonOpts) ?? new();

                    object stepObj;
                    if (dep.IsInventory)
                    {
                        var cfList = captureFields.Select(key => new
                        {
                            id = Guid.NewGuid().ToString(),
                            key,
                            label = key switch {
                                "serialNo"   => "Serial Number",
                                "firmware"   => "Firmware Version",
                                "ipAddress"  => "IP Address",
                                "macAddress" => "MAC Address",
                                "model"      => "Model",
                                "location"   => "Location",
                                _            => key
                            },
                            type = "text",
                            required = true,
                            featureId = cf.FeatureId
                        }).ToList();

                        stepObj = new
                        {
                            id = Guid.NewGuid().ToString(),
                            order = nextOrder++,
                            title = $"Install {dep.Name} ({feature.Name})",
                            description = $"Capture details for each {dep.Name}. Quantity: {cf.Quantity}.",
                            overrideInReport = false,
                            overrideReportText = "",
                            includeDescriptionInReport = true,
                            mediaIds = Array.Empty<string>(),
                            decisionsEnabled = false,
                            decisions = Array.Empty<object>(),
                            inputs = Array.Empty<object>(),
                            nextStepId = (string?)null,
                            captureFields = cfList,
                            stepType = "installation",
                            repeatFeatureId = cf.FeatureId,
                            bomSource = new { dependencyId = dep.Id, featureId = cf.FeatureId, isInventory = true }
                        };
                    }
                    else
                    {
                        stepObj = new
                        {
                            id = Guid.NewGuid().ToString(),
                            order = nextOrder++,
                            title = $"Confirm {dep.Name} ({feature.Name})",
                            description = $"Confirm quantity of {dep.Name} used. Expected: {dep.DefaultQty}{(dep.Unit != null ? " " + dep.Unit : "")}.",
                            overrideInReport = false,
                            overrideReportText = "",
                            includeDescriptionInReport = true,
                            mediaIds = Array.Empty<string>(),
                            decisionsEnabled = false,
                            decisions = Array.Empty<object>(),
                            inputs = new[]
                            {
                                new
                                {
                                    id = Guid.NewGuid().ToString(),
                                    type = "number",
                                    label = $"Actual qty ({(dep.Unit ?? "units")})",
                                    required = true,
                                    featureId = cf.FeatureId
                                }
                            },
                            nextStepId = (string?)null,
                            captureFields = Array.Empty<object>(),
                            stepType = "data-collection",
                            bomSource = new { dependencyId = dep.Id, featureId = cf.FeatureId, isInventory = false }
                        };
                    }

                    steps.Add(JsonSerializer.SerializeToElement(stepObj, JsonOpts));
                }
            }

            entity.StepsJson = JsonSerializer.Serialize(steps, JsonOpts);
        }

        entity.Status    = "Published";
        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(ToDto(entity));
    }

    // POST api/workflow-configs/{id}/clone  — creates a new Draft version
    [HttpPost("{id}/clone")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Clone(string id)
    {
        var source = await _db.WorkflowConfigs.FirstOrDefaultAsync(x => x.Id == id);
        if (source is null) return NotFound();

        var createdBy = User.Identity?.Name ?? User.FindFirst("email")?.Value;
        var clone = new WorkflowConfigEntity
        {
            Id                    = Guid.NewGuid().ToString(),
            ProductId             = source.ProductId,
            Name                  = source.Name,
            DisplayName           = source.DisplayName,
            ConfigType            = source.ConfigType,
            WorkflowTypeId        = source.WorkflowTypeId,
            Status                = "Draft",
            Version               = source.Version + 1,
            TemplateSourceId      = source.Id,
            StepsJson             = source.StepsJson,
            MediaJson             = source.MediaJson,
            FeatureSelectionsJson = source.FeatureSelectionsJson,
            Notes                 = source.Notes,
            CreatedBy             = createdBy,
            CreatedAt             = DateTime.UtcNow,
            UpdatedAt             = DateTime.UtcNow,
        };
        _db.WorkflowConfigs.Add(clone);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = clone.Id }, ToDto(clone));
    }

    // POST api/workflow-configs/{id}/archive
    [HttpPost("{id}/archive")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Archive(string id)
    {
        var entity = await _db.WorkflowConfigs.FirstOrDefaultAsync(x => x.Id == id);
        if (entity is null) return NotFound();
        entity.Status    = "Archived";
        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(ToDto(entity));
    }

    // DELETE api/workflow-configs/{id}  — only if no runs reference it
    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Delete(string id)
    {
        var entity = await _db.WorkflowConfigs.FirstOrDefaultAsync(x => x.Id == id);
        if (entity is null) return NotFound();

        var hasRuns = await _db.AssetWorkflowRuns.AnyAsync(r => r.WorkflowConfigId == id);
        if (hasRuns)
            return BadRequest(new { message = "Cannot delete a configuration that has workflow runs. Archive it instead." });

        _db.WorkflowConfigs.Remove(entity);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // POST api/workflow-configs/{id}/media  — upload media file
    [HttpPost("{id}/media")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> UploadMedia(string id, IFormFile file)
    {
        var entity = await _db.WorkflowConfigs.FirstOrDefaultAsync(x => x.Id == id);
        if (entity is null) return NotFound();

        var ext      = Path.GetExtension(file.FileName);
        var mediaId  = Guid.NewGuid().ToString();
        var fileName = $"{mediaId}{ext}";
        var relativePath = _files.BuildRelativePath("Storage", "WorkflowMedia", id, fileName);

        await _files.SaveAsync(relativePath, file.OpenReadStream());

        var mediaUrl = $"/api/workflow-configs/{id}/media/{mediaId}/file";
        var isImage  = file.ContentType.StartsWith("image/");

        // Append to MediaJson array
        var mediaList = System.Text.Json.JsonSerializer.Deserialize<List<System.Text.Json.JsonElement>>(
            entity.MediaJson, new System.Text.Json.JsonSerializerOptions()) ?? new();
        var newItem = System.Text.Json.JsonSerializer.SerializeToElement(new
        {
            id = mediaId, type = isImage ? "image" : "video",
            name = file.FileName, size = file.Length,
            mime = file.ContentType, url = mediaUrl,
            createdAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        });
        mediaList.Add(newItem);
        entity.MediaJson = System.Text.Json.JsonSerializer.Serialize(mediaList);
        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(ToDto(entity));
    }

    // GET api/workflow-configs/{id}/media/{mediaId}/file
    [HttpGet("{id}/media/{mediaId}/file")]
    [AllowAnonymous]
    public IActionResult ServeMedia(string id, string mediaId)
    {
        var mediaDir = WorkflowMediaDirectory(id);
        var files    = _files.ListFileNames(mediaDir, mediaId);
        if (files.Count == 0) return NotFound();
        var storedName = files[0];
        var relativePath = _files.BuildRelativePath(mediaDir, storedName);
        var ext      = Path.GetExtension(storedName).TrimStart('.');
        var mime     = ext is "jpg" or "jpeg" ? "image/jpeg" : ext == "png" ? "image/png" : ext == "gif" ? "image/gif" : "video/mp4";
        return File(_files.OpenRead(relativePath), mime);
    }

    // DELETE api/workflow-configs/{id}/media/{mediaId}
    [HttpDelete("{id}/media/{mediaId}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> DeleteMedia(string id, string mediaId)
    {
        var entity = await _db.WorkflowConfigs.FirstOrDefaultAsync(x => x.Id == id);
        if (entity is null) return NotFound();

        var mediaDir = WorkflowMediaDirectory(id);
        foreach (var storedName in _files.ListFileNames(mediaDir, mediaId))
        {
            _files.Delete(_files.BuildRelativePath(mediaDir, storedName));
        }

        var mediaList = System.Text.Json.JsonSerializer.Deserialize<List<System.Text.Json.JsonElement>>(
            entity.MediaJson, new System.Text.Json.JsonSerializerOptions()) ?? new();
        mediaList.RemoveAll(m =>
            m.TryGetProperty("id", out var prop) && prop.GetString() == mediaId);
        entity.MediaJson = System.Text.Json.JsonSerializer.Serialize(mediaList);
        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(ToDto(entity));
    }
}
