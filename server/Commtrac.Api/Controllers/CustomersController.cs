using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/customers")]
[Authorize]
public class CustomersController : ControllerBase
{
    private readonly AppDbContext _db;

    public CustomersController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<CustomerDto>>> GetAll()
    {
        var customers = await _db.Customers.OrderBy(c => c.Name).ToListAsync();
        return Ok(customers.Select(ToDto));
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<CustomerDto>> Create([FromBody] CreateCustomerRequest request)
    {
        var customer = new CustomerEntity
        {
            Name = request.Name,
            CustomerId = request.CustomerId,
            Office = request.Office,
            Logo = request.Logo,
            LogoShape = request.LogoShape ?? "round",
            PhotoScale = request.PhotoScale ?? 100,
            LogoSize = request.LogoSize ?? 70
        };

        _db.Customers.Add(customer);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetAll), new { id = customer.Id }, ToDto(customer));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<CustomerDto>> Update(string id, [FromBody] UpdateCustomerRequest request)
    {
        var customer = await _db.Customers.FirstOrDefaultAsync(c => c.Id == id);
        if (customer is null)
        {
            return NotFound();
        }

        if (!string.IsNullOrWhiteSpace(request.Name)) customer.Name = request.Name;
        if (!string.IsNullOrWhiteSpace(request.CustomerId)) customer.CustomerId = request.CustomerId;
        if (!string.IsNullOrWhiteSpace(request.Office)) customer.Office = request.Office;
        if (request.Logo != null) customer.Logo = request.Logo;
        if (!string.IsNullOrWhiteSpace(request.LogoShape)) customer.LogoShape = request.LogoShape;
        if (request.PhotoScale.HasValue) customer.PhotoScale = request.PhotoScale.Value;
        if (request.LogoSize.HasValue) customer.LogoSize = request.LogoSize.Value;

        await _db.SaveChangesAsync();
        return Ok(ToDto(customer));
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(string id)
    {
        var customer = await _db.Customers.FirstOrDefaultAsync(c => c.Id == id);
        if (customer is null)
        {
            return NotFound();
        }

        _db.Customers.Remove(customer);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static CustomerDto ToDto(CustomerEntity customer)
        => new(customer.Id, customer.Name, customer.CustomerId, customer.Office, customer.Logo, customer.LogoShape, customer.PhotoScale, customer.LogoSize);
}
