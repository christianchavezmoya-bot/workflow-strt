using System.Text.Json;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/role-configs")]
[Authorize]
public class RoleConfigsController : ControllerBase
{
    private readonly AppDbContext _db;

    public RoleConfigsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult> Get()
    {
        var config = await _db.RoleConfigs.FirstOrDefaultAsync();
        if (config == null || string.IsNullOrWhiteSpace(config.ConfigJson) || config.ConfigJson == "{}")
            return Ok(new { roles = new Dictionary<string, object>() });

        // Return the roles dict verbatim — the raw JSON preserves every field the frontend
        // wrote (viewScope, editScope, etc.) without any lossy C# model round-trip.
        using var doc = JsonDocument.Parse(config.ConfigJson);
        return Ok(new { roles = doc.RootElement });
    }

    [HttpPut]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult> Update([FromBody] JsonElement body)
    {
        var config = await _db.RoleConfigs.FirstOrDefaultAsync();
        if (config == null)
        {
            config = new RoleConfigEntity { Id = 1 };
            _db.RoleConfigs.Add(config);
        }

        // Store only the roles dictionary so the GET envelope reconstruction is simple.
        // Unknown fields (viewScope, editScope, future additions) are preserved verbatim.
        config.ConfigJson = body.TryGetProperty("roles", out var roles)
            ? roles.GetRawText()
            : body.GetRawText();

        await _db.SaveChangesAsync();

        // Echo the full request body back so the frontend service can update its cache.
        return Ok(body);
    }
}
