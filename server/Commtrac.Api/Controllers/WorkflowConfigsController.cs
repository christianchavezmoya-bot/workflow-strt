using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Commtrac.Api.Data;
using Commtrac.Api.Models;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/workflow-configs")]
[Authorize]
public class WorkflowConfigsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;

    public WorkflowConfigsController(AppDbContext db, IWebHostEnvironment env)
    {
        _db = db;
        _env = env;
    }

    private static WorkflowConfigDto ToDto(WorkflowConfigEntity e) => new(
        e.Id, e.ProductId, e.Name, e.DisplayName, e.ConfigType, e.Status, e.Version,
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
    [Authorize(Roles = "Admin")]
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

        var mediaDir = Path.Combine(_env.ContentRootPath, "Storage", "WorkflowMedia", id);
        Directory.CreateDirectory(mediaDir);
        var ext      = Path.GetExtension(file.FileName);
        var mediaId  = Guid.NewGuid().ToString();
        var fileName = $"{mediaId}{ext}";
        var filePath = Path.Combine(mediaDir, fileName);

        await using (var stream = System.IO.File.Create(filePath))
            await file.CopyToAsync(stream);

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
        var mediaDir = Path.Combine(_env.ContentRootPath, "Storage", "WorkflowMedia", id);
        var files    = Directory.Exists(mediaDir) ? Directory.GetFiles(mediaDir, $"{mediaId}.*") : Array.Empty<string>();
        if (files.Length == 0) return NotFound();
        var ext      = Path.GetExtension(files[0]).TrimStart('.');
        var mime     = ext is "jpg" or "jpeg" ? "image/jpeg" : ext == "png" ? "image/png" : ext == "gif" ? "image/gif" : "video/mp4";
        return PhysicalFile(files[0], mime);
    }

    // DELETE api/workflow-configs/{id}/media/{mediaId}
    [HttpDelete("{id}/media/{mediaId}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> DeleteMedia(string id, string mediaId)
    {
        var entity = await _db.WorkflowConfigs.FirstOrDefaultAsync(x => x.Id == id);
        if (entity is null) return NotFound();

        var mediaDir = Path.Combine(_env.ContentRootPath, "Storage", "WorkflowMedia", id);
        var files    = Directory.Exists(mediaDir) ? Directory.GetFiles(mediaDir, $"{mediaId}.*") : Array.Empty<string>();
        foreach (var f in files) System.IO.File.Delete(f);

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
