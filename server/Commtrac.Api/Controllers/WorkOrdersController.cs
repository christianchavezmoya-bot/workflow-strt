using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/work-orders")]
[Authorize]
public class WorkOrdersController : ControllerBase
{
    private readonly AppDbContext _db;

    public WorkOrdersController(AppDbContext db)
    {
        _db = db;
    }

    // GET api/work-orders/by-product/{productId}
    [HttpGet("by-product/{productId}")]
    public async Task<ActionResult<IEnumerable<WorkOrderDto>>> GetByProduct(string productId)
    {
        var orders = await _db.WorkOrders
            .Where(w => w.ProductId == productId)
            .OrderByDescending(w => w.CreatedAt)
            .ToListAsync();

        return Ok(orders.Select(ToDto));
    }

    // GET api/work-orders/{id}
    [HttpGet("{id}")]
    public async Task<ActionResult<WorkOrderDto>> GetById(string id)
    {
        var order = await _db.WorkOrders.FirstOrDefaultAsync(w => w.Id == id);
        if (order is null) return NotFound();
        return Ok(ToDto(order));
    }

    // POST api/work-orders — any authenticated user can create (technicians run work orders)
    [HttpPost]
    public async Task<ActionResult<WorkOrderDto>> Create([FromBody] UpsertWorkOrderRequest request)
    {
        var order = new WorkOrderEntity
        {
            WorkflowTemplateId = request.WorkflowTemplateId ?? string.Empty,
            ProductId = request.ProductId ?? string.Empty,
            JobReference = request.JobReference?.Trim() ?? string.Empty,
            Status = string.IsNullOrWhiteSpace(request.Status) ? "InProgress" : request.Status,
            StepsDataJson = string.IsNullOrWhiteSpace(request.StepsDataJson) ? "[]" : request.StepsDataJson,
            ProjectAssetId = string.IsNullOrWhiteSpace(request.ProjectAssetId) ? null : request.ProjectAssetId,
        };
        _db.WorkOrders.Add(order);
        await _db.SaveChangesAsync();

        // If linked to a project asset, mark it InProgress and store the work order id
        if (!string.IsNullOrWhiteSpace(order.ProjectAssetId))
        {
            var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == order.ProjectAssetId);
            if (asset is not null)
            {
                asset.WorkOrderId = order.Id;
                asset.Status = "InProgress";
                asset.UpdatedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();
            }
        }

        return CreatedAtAction(nameof(GetById), new { id = order.Id }, ToDto(order));
    }

    // PUT api/work-orders/{id} — any authenticated user can update (technicians complete work orders)
    [HttpPut("{id}")]
    public async Task<ActionResult<WorkOrderDto>> Update(string id, [FromBody] UpsertWorkOrderRequest request)
    {
        var order = await _db.WorkOrders.FirstOrDefaultAsync(w => w.Id == id);
        if (order is null) return NotFound();

        if (!string.IsNullOrWhiteSpace(request.Status)) order.Status = request.Status;
        if (request.StepsDataJson is not null) order.StepsDataJson = request.StepsDataJson;
        if (!string.IsNullOrWhiteSpace(request.JobReference)) order.JobReference = request.JobReference.Trim();
        order.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        // If work order is Complete and linked to an asset, update the asset status
        if (order.Status == "Complete" && !string.IsNullOrWhiteSpace(order.ProjectAssetId))
        {
            var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == order.ProjectAssetId);
            if (asset is not null)
            {
                asset.Status = "Complete";
                asset.UpdatedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();
            }
        }

        return Ok(ToDto(order));
    }

    // DELETE api/work-orders/{id}
    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(string id)
    {
        var order = await _db.WorkOrders.FirstOrDefaultAsync(w => w.Id == id);
        if (order is null) return NotFound();
        _db.WorkOrders.Remove(order);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static WorkOrderDto ToDto(WorkOrderEntity w) =>
        new(w.Id, w.WorkflowTemplateId, w.ProductId, w.JobReference, w.Status,
            w.StepsDataJson, w.ProjectAssetId, w.CreatedAt, w.UpdatedAt);
}
