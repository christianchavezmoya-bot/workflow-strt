using System.Text.Json;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/workflow-templates")]
[Authorize]
public class WorkflowTemplatesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    public WorkflowTemplatesController(AppDbContext db, IWebHostEnvironment env)
    {
        _db = db;
        _env = env;
    }

    // GET api/workflow-templates/by-product/{productId}
    // Returns all workflow templates for a product.
    [HttpGet("by-product/{productId}")]
    public async Task<ActionResult<IEnumerable<WorkflowTemplateDto>>> GetByProduct(string productId)
    {
        var templates = await _db.WorkflowTemplates
            .Where(w => w.ProductId == productId)
            .OrderByDescending(w => w.UpdatedAt)
            .ToListAsync();

        return Ok(templates.Select(ToDto));
    }

    // GET api/workflow-templates/{id}
    [HttpGet("{id}")]
    public async Task<ActionResult<WorkflowTemplateDto>> GetById(string id)
    {
        var template = await _db.WorkflowTemplates.FirstOrDefaultAsync(w => w.Id == id);
        if (template is null) return NotFound();
        return Ok(ToDto(template));
    }

    // POST api/workflow-templates
    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<WorkflowTemplateDto>> Create([FromBody] UpsertWorkflowTemplateRequest request)
    {
        var template = new WorkflowTemplateEntity
        {
            Name = request.Name.Trim(),
            ProductId = request.ProductId,
            StepsJson = string.IsNullOrWhiteSpace(request.StepsJson) ? "[]" : request.StepsJson,
            MediaJson = string.IsNullOrWhiteSpace(request.MediaJson) ? "[]" : request.MediaJson ?? "[]",
        };
        _db.WorkflowTemplates.Add(template);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetByProduct), new { productId = template.ProductId }, ToDto(template));
    }

    // PUT api/workflow-templates/{id}
    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<WorkflowTemplateDto>> Update(string id, [FromBody] UpsertWorkflowTemplateRequest request)
    {
        var template = await _db.WorkflowTemplates.FirstOrDefaultAsync(w => w.Id == id);
        if (template is null) return NotFound();

        if (!string.IsNullOrWhiteSpace(request.Name)) template.Name = request.Name.Trim();
        if (!string.IsNullOrWhiteSpace(request.StepsJson)) template.StepsJson = request.StepsJson;
        if (request.MediaJson is not null) template.MediaJson = request.MediaJson;
        template.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(ToDto(template));
    }

    // DELETE api/workflow-templates/{id}
    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(string id)
    {
        var template = await _db.WorkflowTemplates.FirstOrDefaultAsync(w => w.Id == id);
        if (template is null) return NotFound();
        _db.WorkflowTemplates.Remove(template);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // POST api/workflow-templates/{id}/media  — upload a file, append to MediaJson
    [HttpPost("{id}/media")]
    [Authorize(Roles = "Admin,Project Manager")]
    [RequestSizeLimit(50_000_000)]
    public async Task<ActionResult<WorkflowTemplateDto>> UploadMedia(string id, [FromForm] UploadWorkflowMediaRequest request)
    {
        var template = await _db.WorkflowTemplates.FirstOrDefaultAsync(w => w.Id == id);
        if (template is null) return NotFound();
        if (request.File is null || request.File.Length == 0) return BadRequest("No file provided.");

        var storageRoot = Path.Combine(_env.ContentRootPath, "Storage", "WorkflowMedia", id);
        Directory.CreateDirectory(storageRoot);

        var mediaId = Guid.NewGuid().ToString();
        var extension = Path.GetExtension(request.File.FileName);
        var storedName = $"{mediaId}{extension}";
        var storedPath = Path.Combine(storageRoot, storedName);

        await using (var stream = System.IO.File.Create(storedPath))
        {
            await request.File.CopyToAsync(stream);
        }

        var mime = request.File.ContentType ?? "application/octet-stream";
        var mediaType = mime.StartsWith("video/") ? "video" : "image";
        var fileUrl = $"{Request.Scheme}://{Request.Host}/api/workflow-templates/{id}/media/{mediaId}/file";

        var mediaItem = new
        {
            id = mediaId,
            type = mediaType,
            name = request.File.FileName,
            size = request.File.Length,
            mime,
            url = fileUrl,
            createdAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
        };

        var existing = new List<object>();
        try { existing = JsonSerializer.Deserialize<List<object>>(template.MediaJson, JsonOpts) ?? new(); } catch { }
        existing.Add(mediaItem);
        template.MediaJson = JsonSerializer.Serialize(existing, JsonOpts);
        template.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(ToDto(template));
    }

    // GET api/workflow-templates/{id}/media/{mediaId}/file  — serve the file
    [HttpGet("{id}/media/{mediaId}/file")]
    public IActionResult GetMediaFile(string id, string mediaId)
    {
        var storageRoot = Path.Combine(_env.ContentRootPath, "Storage", "WorkflowMedia", id);
        var files = Directory.Exists(storageRoot)
            ? Directory.GetFiles(storageRoot, $"{mediaId}.*")
            : Array.Empty<string>();

        if (files.Length == 0) return NotFound();
        var filePath = files[0];
        var ext = Path.GetExtension(filePath).TrimStart('.').ToLowerInvariant();
        var contentType = ext switch
        {
            "jpg" or "jpeg" => "image/jpeg",
            "png" => "image/png",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "mp4" => "video/mp4",
            "mov" => "video/quicktime",
            "webm" => "video/webm",
            _ => "application/octet-stream"
        };
        return PhysicalFile(filePath, contentType);
    }

    // DELETE api/workflow-templates/{id}/media/{mediaId}  — remove a media item
    [HttpDelete("{id}/media/{mediaId}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<WorkflowTemplateDto>> DeleteMedia(string id, string mediaId)
    {
        var template = await _db.WorkflowTemplates.FirstOrDefaultAsync(w => w.Id == id);
        if (template is null) return NotFound();

        // Remove from MediaJson
        try
        {
            var items = JsonSerializer.Deserialize<List<JsonElement>>(template.MediaJson, JsonOpts) ?? new();
            items.RemoveAll(el => el.TryGetProperty("id", out var idProp) && idProp.GetString() == mediaId);
            template.MediaJson = JsonSerializer.Serialize(items, JsonOpts);
        }
        catch { }

        // Delete the physical file
        var storageRoot = Path.Combine(_env.ContentRootPath, "Storage", "WorkflowMedia", id);
        if (Directory.Exists(storageRoot))
        {
            foreach (var f in Directory.GetFiles(storageRoot, $"{mediaId}.*"))
                System.IO.File.Delete(f);
        }

        template.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(ToDto(template));
    }

    private static WorkflowTemplateDto ToDto(WorkflowTemplateEntity t) =>
        new(t.Id, t.Name, t.ProductId, t.StepsJson, t.MediaJson, t.CreatedAt, t.UpdatedAt);
}

public class UploadWorkflowMediaRequest
{
    [Microsoft.AspNetCore.Mvc.FromForm(Name = "file")]
    public Microsoft.AspNetCore.Http.IFormFile? File { get; set; }
}
