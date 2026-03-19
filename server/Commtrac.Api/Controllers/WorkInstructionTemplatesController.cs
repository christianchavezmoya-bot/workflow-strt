using System.Security.Claims;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/wi-templates")]
[Authorize]
public class WorkInstructionTemplatesController : ControllerBase
{
    private readonly AppDbContext _db;
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    public WorkInstructionTemplatesController(AppDbContext db)
    {
        _db = db;
    }

    // GET api/wi-templates/by-product/{productId}
    [HttpGet("by-product/{productId}")]
    public async Task<ActionResult<IEnumerable<WorkInstructionTemplateDto>>> GetByProduct(string productId)
    {
        var items = await _db.WorkInstructionTemplates
            .Where(w => w.ProductId == productId)
            .OrderBy(w => w.Name)
            .ToListAsync();

        return Ok(items.Select(ToDto));
    }

    // GET api/wi-templates/{id}
    [HttpGet("{id}")]
    public async Task<ActionResult<WorkInstructionTemplateDto>> GetById(string id)
    {
        var item = await _db.WorkInstructionTemplates.FirstOrDefaultAsync(w => w.Id == id);
        if (item is null) return NotFound();
        return Ok(ToDto(item));
    }

    // POST api/wi-templates
    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<WorkInstructionTemplateDto>> Create([FromBody] UpsertWITemplateRequest request)
    {
        var item = new WorkInstructionTemplateEntity
        {
            Name = request.Name.Trim(),
            ProductId = request.ProductId,
            Status = string.IsNullOrWhiteSpace(request.Status) ? "Draft" : request.Status,
            FeatureSelectionsJson = SerializeSelections(request.FeatureSelections),
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
            WorkflowTemplateId = string.IsNullOrWhiteSpace(request.WorkflowTemplateId) ? null : request.WorkflowTemplateId,
            ConfigType = string.IsNullOrWhiteSpace(request.ConfigType) ? null : request.ConfigType.Trim(),
            CreatedBy = User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue(ClaimTypes.Email) ?? "Unknown",
        };
        _db.WorkInstructionTemplates.Add(item);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = item.Id }, ToDto(item));
    }

    // PUT api/wi-templates/{id}
    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<WorkInstructionTemplateDto>> Update(string id, [FromBody] UpsertWITemplateRequest request)
    {
        var item = await _db.WorkInstructionTemplates.FirstOrDefaultAsync(w => w.Id == id);
        if (item is null) return NotFound();

        if (!string.IsNullOrWhiteSpace(request.Name)) item.Name = request.Name.Trim();
        if (!string.IsNullOrWhiteSpace(request.Status)) item.Status = request.Status;
        if (request.FeatureSelections is not null) item.FeatureSelectionsJson = SerializeSelections(request.FeatureSelections);
        item.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        if (request.WorkflowTemplateId is not null)
            item.WorkflowTemplateId = string.IsNullOrWhiteSpace(request.WorkflowTemplateId) ? null : request.WorkflowTemplateId;
        if (request.ConfigType is not null)
            item.ConfigType = string.IsNullOrWhiteSpace(request.ConfigType) ? null : request.ConfigType.Trim();
        item.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(ToDto(item));
    }

    // DELETE api/wi-templates/{id}
    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(string id)
    {
        var item = await _db.WorkInstructionTemplates.FirstOrDefaultAsync(w => w.Id == id);
        if (item is null) return NotFound();
        _db.WorkInstructionTemplates.Remove(item);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static string SerializeSelections(List<FeatureSelectionDto>? selections) =>
        selections is null ? "[]" : JsonSerializer.Serialize(selections, JsonOpts);

    private static WorkInstructionTemplateDto ToDto(WorkInstructionTemplateEntity w)
    {
        List<FeatureSelectionDto> selections = new();
        try
        {
            if (!string.IsNullOrWhiteSpace(w.FeatureSelectionsJson))
                selections = JsonSerializer.Deserialize<List<FeatureSelectionDto>>(w.FeatureSelectionsJson, JsonOpts) ?? new();
        }
        catch { }

        return new(w.Id, w.Name, w.ProductId, w.Status, selections, w.Notes, w.WorkflowTemplateId, w.ConfigType, w.CreatedBy, w.CreatedAt, w.UpdatedAt);
    }
}
