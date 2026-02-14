using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/sites")]
[Authorize]
public class SitesController : ControllerBase
{
    private readonly AppDbContext _db;

    public SitesController(AppDbContext db)
    {
        _db = db;
    }

    // GET /api/sites?customerId={id}
    [HttpGet]
    public async Task<ActionResult<IEnumerable<SiteDto>>> GetAll([FromQuery] string? customerId)
    {
        var query = _db.Sites.AsQueryable();

        if (!string.IsNullOrWhiteSpace(customerId))
        {
            query = query.Where(s => s.CustomerId == customerId);
        }

        var sites = await query.OrderBy(s => s.Name).ToListAsync();
        return Ok(sites.Select(ToDto));
    }

    // GET /api/sites/{id}
    [HttpGet("{id}")]
    public async Task<ActionResult<SiteDto>> GetById(string id)
    {
        var site = await _db.Sites.FirstOrDefaultAsync(s => s.Id == id);
        if (site is null)
        {
            return NotFound();
        }
        return Ok(ToDto(site));
    }

    // POST /api/sites
    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<SiteDto>> Create([FromBody] CreateSiteRequest request)
    {
        var customerId = request.CustomerId?.Trim() ?? string.Empty;
        if (!string.IsNullOrEmpty(customerId))
        {
            // Verify customer exists (allow creating "unassigned" sites with empty CustomerId).
            var customerExists = await _db.Customers.AnyAsync(c => c.Id == customerId);
            if (!customerExists)
            {
                return BadRequest("Customer not found");
            }
        }

        var site = new SiteEntity
        {
            CustomerId = customerId,
            Name = request.Name,
            Address = request.Address,
            City = request.City,
            State = request.State,
            Country = request.Country,
            ZipCode = request.ZipCode,
            ContactName = request.ContactName,
            ContactPhone = request.ContactPhone,
            ContactEmail = request.ContactEmail,
            Notes = request.Notes
        };

        _db.Sites.Add(site);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = site.Id }, ToDto(site));
    }

    // PUT /api/sites/{id}
    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<SiteDto>> Update(string id, [FromBody] UpdateSiteRequest request)
    {
        var site = await _db.Sites.FirstOrDefaultAsync(s => s.Id == id);
        if (site is null)
        {
            return NotFound();
        }

        if (request.CustomerId != null)
        {
            var nextCustomerId = request.CustomerId.Trim();
            if (!string.IsNullOrEmpty(nextCustomerId))
            {
                var customerExists = await _db.Customers.AnyAsync(c => c.Id == nextCustomerId);
                if (!customerExists)
                {
                    return BadRequest("Customer not found");
                }
            }
            site.CustomerId = nextCustomerId;
        }
        if (!string.IsNullOrWhiteSpace(request.Name)) site.Name = request.Name;
        if (request.Address != null) site.Address = request.Address;
        if (request.City != null) site.City = request.City;
        if (request.State != null) site.State = request.State;
        if (request.Country != null) site.Country = request.Country;
        if (request.ZipCode != null) site.ZipCode = request.ZipCode;
        if (request.ContactName != null) site.ContactName = request.ContactName;
        if (request.ContactPhone != null) site.ContactPhone = request.ContactPhone;
        if (request.ContactEmail != null) site.ContactEmail = request.ContactEmail;
        if (request.Notes != null) site.Notes = request.Notes;

        await _db.SaveChangesAsync();
        return Ok(ToDto(site));
    }

    // DELETE /api/sites/{id}
    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(string id)
    {
        var site = await _db.Sites.FirstOrDefaultAsync(s => s.Id == id);
        if (site is null)
        {
            return NotFound();
        }

        _db.Sites.Remove(site);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static SiteDto ToDto(SiteEntity site)
        => new(
            site.Id,
            site.CustomerId,
            site.Name,
            site.Address,
            site.City,
            site.State,
            site.Country,
            site.ZipCode,
            site.ContactName,
            site.ContactPhone,
            site.ContactEmail,
            site.Notes,
            site.CreatedAt
        );
}
