using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/dispatch-orders")]
[Authorize]
public class DispatchOrdersController : ControllerBase
{
    private readonly AppDbContext _db;

    public DispatchOrdersController(AppDbContext db) => _db = db;

    // GET /api/dispatch-orders?projectId=&status=
    [HttpGet]
    public async Task<ActionResult<List<DispatchOrderDto>>> List(
        [FromQuery] string? projectId,
        [FromQuery] string? status)
    {
        var q = _db.DispatchOrders.AsQueryable();
        if (!string.IsNullOrWhiteSpace(projectId)) q = q.Where(o => o.ProjectId == projectId);
        if (!string.IsNullOrWhiteSpace(status) && status != "All") q = q.Where(o => o.Status == status);

        var orders = await q.OrderByDescending(o => o.CreatedAt).ToListAsync();
        var orderIds = orders.Select(o => o.Id).ToList();

        var lines = await _db.DispatchLines.Where(l => orderIds.Contains(l.OrderId)).ToListAsync();
        var events = await _db.DeliveryEvents.Where(e => orderIds.Contains(e.OrderId)).ToListAsync();

        var profiles = orders
            .Where(o => !string.IsNullOrWhiteSpace(o.DeliveryProfileId))
            .Select(o => o.DeliveryProfileId!)
            .Distinct().ToList();
        var profileNames = await _db.ProjectDeliveryProfiles
            .Where(p => profiles.Contains(p.Id))
            .Select(p => new { p.Id, p.Label })
            .ToDictionaryAsync(p => p.Id, p => p.Label);

        return Ok(orders.Select(o => ToDto(o, lines, events, profileNames)).ToList());
    }

    // GET /api/dispatch-orders/{id}
    [HttpGet("{id}")]
    public async Task<ActionResult<DispatchOrderDto>> GetById(string id)
    {
        var order = await _db.DispatchOrders.FirstOrDefaultAsync(o => o.Id == id);
        if (order is null) return NotFound();

        var lines = await _db.DispatchLines.Where(l => l.OrderId == id).ToListAsync();
        var events = await _db.DeliveryEvents.Where(e => e.OrderId == id).OrderBy(e => e.OccurredAtUtc).ToListAsync();
        string? label = null;
        if (!string.IsNullOrWhiteSpace(order.DeliveryProfileId))
            label = await _db.ProjectDeliveryProfiles
                .Where(p => p.Id == order.DeliveryProfileId).Select(p => p.Label).FirstOrDefaultAsync();

        return Ok(ToDto(order, lines, events, label is null ? null : new Dictionary<string, string> { [order.DeliveryProfileId!] = label }));
    }

    // POST /api/dispatch-orders
    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager,Engineer")]
    public async Task<ActionResult<DispatchOrderDto>> Create([FromBody] UpsertDispatchOrderRequest req)
    {
        var now = DateTime.UtcNow;
        var order = new DispatchOrderEntity
        {
            ProjectId         = req.ProjectId,
            DeliveryProfileId = req.DeliveryProfileId,
            RequestedByName   = req.RequestedByName,
            NeededByDate      = req.NeededByDate,
            Priority          = req.Priority,
            Status            = req.Status,
            Carrier           = req.Carrier,
            TrackingNumber    = req.TrackingNumber,
            TrackingUrl       = req.TrackingUrl,
            InternalNotes     = req.InternalNotes,
            CreatedAt         = now,
            UpdatedAt         = now
        };
        _db.DispatchOrders.Add(order);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = order.Id },
            ToDto(order, new(), new(), null));
    }

    // PUT /api/dispatch-orders/{id}
    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,Project Manager,Engineer")]
    public async Task<ActionResult<DispatchOrderDto>> Update(string id, [FromBody] UpsertDispatchOrderRequest req)
    {
        var order = await _db.DispatchOrders.FirstOrDefaultAsync(o => o.Id == id);
        if (order is null) return NotFound();

        order.DeliveryProfileId = req.DeliveryProfileId;
        order.RequestedByName   = req.RequestedByName;
        order.NeededByDate      = req.NeededByDate;
        order.Priority          = req.Priority;
        order.Status            = req.Status;
        order.Carrier           = req.Carrier;
        order.TrackingNumber    = req.TrackingNumber;
        order.TrackingUrl       = req.TrackingUrl;
        order.InternalNotes     = req.InternalNotes;
        order.UpdatedAt         = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var lines  = await _db.DispatchLines.Where(l => l.OrderId == id).ToListAsync();
        var events = await _db.DeliveryEvents.Where(e => e.OrderId == id).OrderBy(e => e.OccurredAtUtc).ToListAsync();
        return Ok(ToDto(order, lines, events, null));
    }

    // DELETE /api/dispatch-orders/{id}
    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Delete(string id)
    {
        var order = await _db.DispatchOrders.FirstOrDefaultAsync(o => o.Id == id);
        if (order is null) return NotFound();
        _db.DispatchOrders.Remove(order);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // POST /api/dispatch-orders/{id}/lines
    [HttpPost("{id}/lines")]
    [Authorize(Roles = "Admin,Project Manager,Engineer")]
    public async Task<ActionResult<DispatchLineDto>> AddLine(string id, [FromBody] UpsertDispatchLineRequest req)
    {
        if (!await _db.DispatchOrders.AnyAsync(o => o.Id == id)) return NotFound();
        var line = new DispatchLineEntity
        {
            OrderId           = id,
            Description       = req.Description,
            PartNumber        = req.PartNumber,
            QuantityRequested = req.QuantityRequested,
            QuantityShipped   = req.QuantityShipped,
            Unit              = req.Unit,
            UnitCost          = req.UnitCost,
            IsBillable        = req.IsBillable,
            TaxCode           = req.TaxCode,
            Notes             = req.Notes
        };
        _db.DispatchLines.Add(line);
        await _db.SaveChangesAsync();
        return Ok(LineToDto(line));
    }

    // PUT /api/dispatch-orders/{id}/lines/{lineId}
    [HttpPut("{id}/lines/{lineId}")]
    [Authorize(Roles = "Admin,Project Manager,Engineer")]
    public async Task<ActionResult<DispatchLineDto>> UpdateLine(string id, string lineId,
        [FromBody] UpsertDispatchLineRequest req)
    {
        var line = await _db.DispatchLines.FirstOrDefaultAsync(l => l.Id == lineId && l.OrderId == id);
        if (line is null) return NotFound();
        line.Description       = req.Description;
        line.PartNumber        = req.PartNumber;
        line.QuantityRequested = req.QuantityRequested;
        line.QuantityShipped   = req.QuantityShipped;
        line.Unit              = req.Unit;
        line.UnitCost          = req.UnitCost;
        line.IsBillable        = req.IsBillable;
        line.TaxCode           = req.TaxCode;
        line.Notes             = req.Notes;
        await _db.SaveChangesAsync();
        return Ok(LineToDto(line));
    }

    // DELETE /api/dispatch-orders/{id}/lines/{lineId}
    [HttpDelete("{id}/lines/{lineId}")]
    [Authorize(Roles = "Admin,Project Manager,Engineer")]
    public async Task<IActionResult> DeleteLine(string id, string lineId)
    {
        var line = await _db.DispatchLines.FirstOrDefaultAsync(l => l.Id == lineId && l.OrderId == id);
        if (line is null) return NotFound();
        _db.DispatchLines.Remove(line);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // POST /api/dispatch-orders/{id}/events
    [HttpPost("{id}/events")]
    [Authorize(Roles = "Admin,Project Manager,Engineer")]
    public async Task<ActionResult<DeliveryEventDto>> AddEvent(string id, [FromBody] AddDeliveryEventRequest req)
    {
        if (!await _db.DispatchOrders.AnyAsync(o => o.Id == id)) return NotFound();
        var evt = new DeliveryEventEntity
        {
            OrderId       = id,
            EventType     = req.EventType,
            OccurredAtUtc = req.OccurredAtUtc ?? DateTime.UtcNow,
            Location      = req.Location,
            Notes         = req.Notes,
            RecordedBy    = req.RecordedBy
        };
        _db.DeliveryEvents.Add(evt);

        // Auto-advance order status if event moves it forward
        var order = await _db.DispatchOrders.FirstOrDefaultAsync(o => o.Id == id);
        if (order is not null)
        {
            order.Status = req.EventType switch
            {
                "Packed"     => "Packed",
                "Shipped"    => "Shipped",
                "InTransit"  => "Shipped",
                "Delivered"  => "Delivered",
                "Cancelled"  => "Cancelled",
                _            => order.Status
            };
            order.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();
        return Ok(EventToDto(evt));
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private static DispatchOrderDto ToDto(
        DispatchOrderEntity o,
        List<DispatchLineEntity> lines,
        List<DeliveryEventEntity> events,
        Dictionary<string, string>? profileNames)
    {
        var label = (o.DeliveryProfileId is not null && profileNames is not null &&
                     profileNames.TryGetValue(o.DeliveryProfileId, out var l)) ? l : null;
        return new(
            o.Id, o.ProjectId, o.DeliveryProfileId, label,
            o.RequestedByName, o.NeededByDate, o.Priority, o.Status,
            o.Carrier, o.TrackingNumber, o.TrackingUrl, o.InternalNotes,
            o.CreatedAt, o.UpdatedAt,
            lines.Where(l => l.OrderId == o.Id).Select(LineToDto).ToList(),
            events.Where(e => e.OrderId == o.Id).Select(EventToDto).ToList()
        );
    }

    private static DispatchLineDto LineToDto(DispatchLineEntity l) => new(
        l.Id, l.OrderId, l.Description, l.PartNumber,
        l.QuantityRequested, l.QuantityShipped, l.Unit, l.UnitCost,
        l.IsBillable, l.TaxCode, l.Notes);

    private static DeliveryEventDto EventToDto(DeliveryEventEntity e) => new(
        e.Id, e.OrderId, e.EventType, e.OccurredAtUtc, e.Location, e.Notes, e.RecordedBy);
}
