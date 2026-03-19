using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/work-instructions")]
[Authorize]
public class WorkInstructionsController : ControllerBase
{
    private readonly AppDbContext _db;

    public WorkInstructionsController(AppDbContext db)
    {
        _db = db;
    }

    // GET api/work-instructions/by-product/{productId}
    [HttpGet("by-product/{productId}")]
    public async Task<ActionResult<IEnumerable<WorkInstructionDto>>> GetByProduct(string productId)
    {
        var items = await _db.WorkInstructions
            .Where(w => w.ProductId == productId)
            .OrderByDescending(w => w.UpdatedAt)
            .ToListAsync();

        return Ok(items.Select(ToDto));
    }

    // GET api/work-instructions/{id}
    [HttpGet("{id}")]
    public async Task<ActionResult<WorkInstructionDto>> GetById(string id)
    {
        var item = await _db.WorkInstructions.FirstOrDefaultAsync(w => w.Id == id);
        if (item is null) return NotFound();
        return Ok(ToDto(item));
    }

    // POST api/work-instructions?productId={productId}
    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<WorkInstructionDto>> Create(
        [FromQuery] string productId,
        [FromBody] UpsertWorkInstructionRequest request)
    {
        if (string.IsNullOrWhiteSpace(productId))
            return BadRequest("productId query parameter is required.");

        var item = new WorkInstructionEntity
        {
            ProductId = productId,
            Title = request.Title.Trim(),
            Summary = string.IsNullOrWhiteSpace(request.Summary) ? null : request.Summary.Trim(),
            StepsJson = string.IsNullOrWhiteSpace(request.StepsJson) ? "[]" : request.StepsJson,
            Status = string.IsNullOrWhiteSpace(request.Status) ? "Draft" : request.Status,
            FeatureValuesJson = string.IsNullOrWhiteSpace(request.FeatureValuesJson) ? "{}" : request.FeatureValuesJson,
        };

        _db.WorkInstructions.Add(item);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = item.Id }, ToDto(item));
    }

    // PUT api/work-instructions/{id}
    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<WorkInstructionDto>> Update(string id, [FromBody] UpsertWorkInstructionRequest request)
    {
        var item = await _db.WorkInstructions.FirstOrDefaultAsync(w => w.Id == id);
        if (item is null) return NotFound();

        if (!string.IsNullOrWhiteSpace(request.Title)) item.Title = request.Title.Trim();
        item.Summary = string.IsNullOrWhiteSpace(request.Summary) ? null : request.Summary.Trim();
        if (!string.IsNullOrWhiteSpace(request.StepsJson)) item.StepsJson = request.StepsJson;
        if (!string.IsNullOrWhiteSpace(request.Status)) item.Status = request.Status;
        if (request.FeatureValuesJson is not null) item.FeatureValuesJson = request.FeatureValuesJson;
        item.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(ToDto(item));
    }

    // DELETE api/work-instructions/{id}
    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(string id)
    {
        var item = await _db.WorkInstructions.FirstOrDefaultAsync(w => w.Id == id);
        if (item is null) return NotFound();
        _db.WorkInstructions.Remove(item);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static WorkInstructionDto ToDto(WorkInstructionEntity w) =>
        new(w.Id, w.ProductId, w.Title, w.Summary, w.StepsJson, w.Status, w.FeatureValuesJson, w.CreatedAt, w.UpdatedAt);
}
