using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/offices")]
[Authorize]
public class OfficesController : ControllerBase
{
    private readonly AppDbContext _db;

    public OfficesController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    [AllowAnonymous]
    public async Task<ActionResult<IEnumerable<OfficeDto>>> GetAll()
    {
        var offices = await _db.Offices.OrderBy(o => o.Country).ThenBy(o => o.City).ToListAsync();
        return Ok(offices.Select(ToDto));
    }

    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<OfficeDto>> Create([FromBody] CreateOfficeRequest request)
    {
        var office = new OfficeEntity
        {
            Country = request.Country,
            State = request.State,
            City = request.City,
            Lat = request.Lat,
            Lng = request.Lng
        };

        _db.Offices.Add(office);
        await _db.SaveChangesAsync();
        return StatusCode(201, ToDto(office));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<OfficeDto>> Update(string id, [FromBody] UpdateOfficeRequest request)
    {
        var office = await _db.Offices.FirstOrDefaultAsync(o => o.Id == id);
        if (office is null)
        {
            return NotFound();
        }

        if (!string.IsNullOrWhiteSpace(request.Country)) office.Country = request.Country;
        if (!string.IsNullOrWhiteSpace(request.State)) office.State = request.State;
        if (!string.IsNullOrWhiteSpace(request.City)) office.City = request.City;
        if (request.Lat.HasValue) office.Lat = request.Lat.Value;
        if (request.Lng.HasValue) office.Lng = request.Lng.Value;

        await _db.SaveChangesAsync();
        return Ok(ToDto(office));
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(string id)
    {
        var office = await _db.Offices.FirstOrDefaultAsync(o => o.Id == id);
        if (office is null)
        {
            return NotFound();
        }

        _db.Offices.Remove(office);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static OfficeDto ToDto(OfficeEntity office)
        => new(office.Id, office.Country, office.State, office.City, office.Lat, office.Lng);
}
