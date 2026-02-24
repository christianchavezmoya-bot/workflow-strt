using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/products")]
[Authorize]
public class ProductsController : ControllerBase
{
    private readonly AppDbContext _db;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public ProductsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ProductDto>>> GetAll()
    {
        var products = await _db.Products.OrderBy(p => p.Name).ToListAsync();
        return Ok(products.Select(ToDto));
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<ProductDto>> Create([FromBody] CreateProductRequest request)
    {
        var product = new ProductEntity
        {
            Name = request.Name,
            Description = request.Description,
            FeaturesJson = JsonSerializer.Serialize(request.Features ?? new List<ProductFeatureDefinitionDto>(), JsonOptions)
        };

        _db.Products.Add(product);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetAll), new { id = product.Id }, ToDto(product));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<ProductDto>> Update(string id, [FromBody] UpdateProductRequest request)
    {
        var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == id);
        if (product is null)
        {
            return NotFound();
        }

        if (!string.IsNullOrWhiteSpace(request.Name)) product.Name = request.Name;
        if (request.Description is not null) product.Description = request.Description;
        if (request.Features is not null)
        {
            product.FeaturesJson = JsonSerializer.Serialize(request.Features, JsonOptions);
        }

        await _db.SaveChangesAsync();
        return Ok(ToDto(product));
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(string id)
    {
        var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == id);
        if (product is null)
        {
            return NotFound();
        }

        _db.Products.Remove(product);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static ProductDto ToDto(ProductEntity product)
    {
        var features = string.IsNullOrWhiteSpace(product.FeaturesJson)
            ? new List<ProductFeatureDefinitionDto>()
            : JsonSerializer.Deserialize<List<ProductFeatureDefinitionDto>>(product.FeaturesJson, JsonOptions) ?? new List<ProductFeatureDefinitionDto>();
        return new(product.Id, product.Name, product.Description, features);
    }
}
