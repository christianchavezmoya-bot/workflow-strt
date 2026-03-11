using Commtrac.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Net.Http.Headers;
using System.Text.Json;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/quickbase")]
[Authorize]
public class QuickbaseDiscoveryController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IHttpClientFactory _httpClientFactory;

    public QuickbaseDiscoveryController(AppDbContext db, IHttpClientFactory httpClientFactory)
    {
        _db = db;
        _httpClientFactory = httpClientFactory;
    }

    // POST /api/quickbase/test
    // Accepts credentials directly so it can be tested before saving to backend.
    [HttpPost("test")]
    public async Task<ActionResult<QbTestResult>> TestConnection([FromBody] QbTestRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.RealmHostname) || string.IsNullOrWhiteSpace(req.UserToken))
            return Ok(new QbTestResult(false, "Realm hostname and user token are required."));

        if (string.IsNullOrWhiteSpace(req.TableId))
            return Ok(new QbTestResult(false, "Enter the Goods Movements table ID to test the connection."));

        var client = _httpClientFactory.CreateClient();
        client.DefaultRequestHeaders.Add("QB-Realm-Hostname", req.RealmHostname.Trim());
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("QB-USER-TOKEN", req.UserToken.Trim());
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        // Use the fields endpoint — lightest call that verifies realm + token + table access together
        HttpResponseMessage response;
        try
        {
            response = await client.GetAsync(
                $"https://api.quickbase.com/v1/fields?tableId={Uri.EscapeDataString(req.TableId.Trim())}");
        }
        catch (Exception ex)
        {
            return Ok(new QbTestResult(false, $"Network error: {ex.Message}"));
        }

        if (response.IsSuccessStatusCode)
            return Ok(new QbTestResult(true, "Connected — table accessible."));

        var hint = (int)response.StatusCode switch
        {
            401 => "Invalid user token.",
            403 => "Access denied — check token permissions.",
            404 => "Table not found — check the table ID.",
            _   => $"QB returned HTTP {(int)response.StatusCode}."
        };
        return Ok(new QbTestResult(false, hint));
    }

    // POST /api/quickbase/fields
    // Accepts credentials directly (form values before saving) OR falls back to stored settings.
    [HttpPost("fields")]
    public async Task<ActionResult<List<QbFieldInfo>>> GetFields([FromBody] QbTestRequest req)
    {
        var tableId = req.TableId?.Trim();
        if (string.IsNullOrWhiteSpace(tableId))
            return BadRequest(new { message = "tableId is required." });

        // Resolve realm + token: use request body if provided, otherwise fall back to stored settings
        var realm = req.RealmHostname?.Trim();
        var token = req.UserToken?.Trim();
        if (string.IsNullOrWhiteSpace(realm) || string.IsNullOrWhiteSpace(token))
        {
            var stored = await _db.QuickbaseSettings.FirstOrDefaultAsync(s => s.Id == 1);
            if (stored is null || !stored.Enabled)
                return BadRequest(new { message = "Quickbase integration is not enabled." });
            realm = stored.RealmHostname;
            token = stored.UserToken;
        }

        var client = _httpClientFactory.CreateClient();
        client.DefaultRequestHeaders.Add("QB-Realm-Hostname", realm);
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("QB-USER-TOKEN", token);
        client.DefaultRequestHeaders.Accept.Add(
            new MediaTypeWithQualityHeaderValue("application/json"));

        HttpResponseMessage response;
        try
        {
            response = await client.GetAsync(
                $"https://api.quickbase.com/v1/fields?tableId={Uri.EscapeDataString(tableId)}");
        }
        catch (Exception ex)
        {
            return StatusCode(502, new { message = $"Failed to reach Quickbase API: {ex.Message}" });
        }

        if (!response.IsSuccessStatusCode)
        {
            var err = await response.Content.ReadAsStringAsync();
            return StatusCode((int)response.StatusCode, new { message = $"Quickbase error: {err}" });
        }

        var json = await response.Content.ReadAsStringAsync();
        var fields = new List<QbFieldInfo>();

        try
        {
            var doc = JsonDocument.Parse(json);
            foreach (var f in doc.RootElement.EnumerateArray())
            {
                var id = f.TryGetProperty("id", out var idProp) ? idProp.GetInt32() : 0;
                var label = f.TryGetProperty("label", out var lProp) ? lProp.GetString() ?? "" : "";
                var type = f.TryGetProperty("fieldType", out var tProp) ? tProp.GetString() ?? "" : "";
                fields.Add(new QbFieldInfo(id, label, type));
            }
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = $"Failed to parse QB response: {ex.Message}" });
        }

        return Ok(fields.OrderBy(f => f.Id).ToList());
    }
}

public record QbFieldInfo(int Id, string Label, string FieldType);
public record QbTestRequest(string RealmHostname, string UserToken, string? TableId);
public record QbTestResult(bool Success, string Message);
