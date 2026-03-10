using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/projects/{projectId}/quickbase/goods-movements")]
[Authorize]
public class QuickbaseGoodsMovementsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IHttpClientFactory _httpClientFactory;

    public QuickbaseGoodsMovementsController(AppDbContext db, IHttpClientFactory httpClientFactory)
    {
        _db = db;
        _httpClientFactory = httpClientFactory;
    }

    [HttpGet]
    public async Task<ActionResult<QbGoodsMovementsResult>> Get(string projectId)
    {
        // Resolve project job number
        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == projectId);
        if (project is null) return NotFound(new { message = "Project not found." });

        var jobNumber = project.JobNumber;
        if (string.IsNullOrWhiteSpace(jobNumber))
            return BadRequest(new { message = "Project has no job number." });

        // Load QB settings
        var settings = await _db.QuickbaseSettings.FirstOrDefaultAsync(s => s.Id == 1);
        if (settings is null || !settings.Enabled)
            return BadRequest(new { message = "Quickbase integration is not enabled." });
        if (string.IsNullOrWhiteSpace(settings.GoodsMovementsTableId))
            return BadRequest(new { message = "Goods Movements table ID is not configured." });
        if (settings.GoodsMovementsJobFid == 0)
            return BadRequest(new { message = "Goods Movements job number field ID is not configured." });

        // Build the QB records query
        var whereClause = $"{{{settings.GoodsMovementsJobFid}.CT.'{jobNumber}'}}";
        var body = JsonSerializer.Serialize(new
        {
            from = settings.GoodsMovementsTableId,
            where = whereClause,
            sortBy = new[] { new { fieldId = settings.GoodsMovementsJobFid, order = "ASC" } },
            options = new { top = 500 }
        });

        var client = _httpClientFactory.CreateClient();
        client.DefaultRequestHeaders.Add("QB-Realm-Hostname", settings.RealmHostname);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("QB-USER-TOKEN", settings.UserToken);
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        HttpResponseMessage response;
        try
        {
            response = await client.PostAsync(
                "https://api.quickbase.com/v1/records/query",
                new StringContent(body, Encoding.UTF8, "application/json"));
        }
        catch (Exception ex)
        {
            return StatusCode(502, new { message = $"Failed to reach Quickbase API: {ex.Message}" });
        }

        if (!response.IsSuccessStatusCode)
        {
            var errBody = await response.Content.ReadAsStringAsync();
            return StatusCode((int)response.StatusCode, new { message = $"Quickbase error: {errBody}" });
        }

        var json = await response.Content.ReadAsStringAsync();
        var despatched = new List<GoodsMovementDto>();
        var received   = new List<GoodsMovementDto>();

        try
        {
            var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("data", out var dataArr) ||
                !doc.RootElement.TryGetProperty("fields", out var fieldsArr))
                return Ok(new QbGoodsMovementsResult(despatched, received));

            // Build FID → field name map
            var fidToName = new Dictionary<int, string>();
            foreach (var f in fieldsArr.EnumerateArray())
            {
                if (f.TryGetProperty("id", out var id) && f.TryGetProperty("label", out var label))
                    fidToName[id.GetInt32()] = label.GetString() ?? "";
            }

            foreach (var row in dataArr.EnumerateArray())
            {
                var vals = new Dictionary<string, string>();
                foreach (var prop in row.EnumerateObject())
                {
                    if (int.TryParse(prop.Name, out var fid) && fidToName.TryGetValue(fid, out var fieldName))
                    {
                        var v = prop.Value.TryGetProperty("value", out var vProp) ? vProp.ToString() : "";
                        vals[fieldName] = v ?? "";
                    }
                }

                // Determine direction from configured FID, else fall back to field name search
                var direction = "";
                if (settings.GoodsMovementsDirectionFid > 0 &&
                    fidToName.TryGetValue(settings.GoodsMovementsDirectionFid, out var dirFieldName) &&
                    vals.TryGetValue(dirFieldName, out var dirVal))
                {
                    direction = dirVal;
                }
                else
                {
                    // Fallback: look for a field whose name contains "incoming" or "outgoing"
                    foreach (var kv in vals)
                    {
                        if (kv.Key.Contains("incoming", StringComparison.OrdinalIgnoreCase) ||
                            kv.Key.Contains("outgoing", StringComparison.OrdinalIgnoreCase))
                        {
                            direction = kv.Value;
                            break;
                        }
                    }
                }

                var dto = new GoodsMovementDto(
                    Direction:      direction,
                    MovementRef:    GetVal(vals, "Movement_Reference_#", "Movement Reference"),
                    Date:           GetVal(vals, "Date"),
                    ToFrom:         GetVal(vals, "To/From"),
                    ConsignmentRef: GetVal(vals, "Consignment Note/Delivery Reference", "Consignment Note"),
                    JobNumber:      GetVal(vals, "Purchased for Job Number", "Job Number"),
                    OrderRef:       GetVal(vals, "Order Reference Number", "Order Reference"),
                    Goods:          CombineGoods(
                                        GetVal(vals, "Non-inventory Goods"),
                                        GetVal(vals, "Inventory Goods"),
                                        GetVal(vals, "Inventory items")),
                    HandledBy:      GetVal(vals, "Received or Despatched by", "Handled by"),
                    NavPoNumber:    GetVal(vals, "Navision PO Number", "PO Number")
                );

                if (direction.Contains("Despatched", StringComparison.OrdinalIgnoreCase) ||
                    direction.Contains("Outgoing", StringComparison.OrdinalIgnoreCase))
                    despatched.Add(dto);
                else
                    received.Add(dto);
            }
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = $"Failed to parse Quickbase response: {ex.Message}" });
        }

        return Ok(new QbGoodsMovementsResult(despatched, received));
    }

    private static string GetVal(Dictionary<string, string> vals, params string[] keys)
    {
        foreach (var key in keys)
            if (vals.TryGetValue(key, out var v) && !string.IsNullOrWhiteSpace(v)) return v;
        return "";
    }

    private static string CombineGoods(params string[] parts) =>
        string.Join("; ", parts.Where(p => !string.IsNullOrWhiteSpace(p)));
}

public record QbGoodsMovementsResult(
    List<GoodsMovementDto> Despatched,
    List<GoodsMovementDto> Received
);
