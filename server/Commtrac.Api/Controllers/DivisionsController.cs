using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/divisions")]
[Authorize]
public class DivisionsController : ControllerBase
{
    private readonly AppDbContext _db;

    public DivisionsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<DivisionDto>>> GetAll()
    {
        var divisions = await _db.Divisions.OrderBy(d => d.SortOrder).ThenBy(d => d.Name).ToListAsync();
        return Ok(divisions.Select(ToDto));
    }

    [HttpGet("all")]
    public async Task<ActionResult<IEnumerable<DivisionDto>>> GetAllIncludingInactive()
    {
        var divisions = await _db.Divisions.OrderBy(d => d.SortOrder).ThenBy(d => d.Name).ToListAsync();
        return Ok(divisions.Select(ToDto));
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<DivisionDto>> Create([FromBody] CreateDivisionRequest request)
    {
        var division = new DivisionEntity
        {
            Name = request.Name.Trim(),
            Description = request.Description,
            SortOrder = request.SortOrder
        };
        _db.Divisions.Add(division);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetAll), new { id = division.Id }, ToDto(division));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<DivisionDto>> Update(string id, [FromBody] UpdateDivisionRequest request)
    {
        var division = await _db.Divisions.FirstOrDefaultAsync(d => d.Id == id);
        if (division is null) return NotFound();

        if (!string.IsNullOrWhiteSpace(request.Name)) division.Name = request.Name.Trim();
        if (request.Description is not null) division.Description = request.Description;
        if (request.SortOrder.HasValue) division.SortOrder = request.SortOrder.Value;
        if (request.IsActive.HasValue) division.IsActive = request.IsActive.Value;

        await _db.SaveChangesAsync();
        return Ok(ToDto(division));
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(string id)
    {
        var division = await _db.Divisions.FirstOrDefaultAsync(d => d.Id == id);
        if (division is null) return NotFound();

        _db.Divisions.Remove(division);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static DivisionDto ToDto(DivisionEntity d) =>
        new(d.Id, d.Name, d.Description, d.SortOrder, d.IsActive);
}
