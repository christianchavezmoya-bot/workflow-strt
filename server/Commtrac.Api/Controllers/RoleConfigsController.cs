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
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public RoleConfigsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<RoleConfigDto>> Get()
    {
        var config = await _db.RoleConfigs.FirstOrDefaultAsync();
        if (config == null)
        {
            return Ok(new RoleConfigDto(new Dictionary<string, RolePermissions>()));
        }

        var roles = JsonSerializer.Deserialize<Dictionary<string, RolePermissions>>(config.ConfigJson, JsonOptions)
            ?? new Dictionary<string, RolePermissions>();

        return Ok(new RoleConfigDto(roles));
    }

    [HttpPut]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<RoleConfigDto>> Update([FromBody] RoleConfigDto dto)
    {
        var config = await _db.RoleConfigs.FirstOrDefaultAsync();
        if (config == null)
        {
            config = new RoleConfigEntity { Id = 1 };
            _db.RoleConfigs.Add(config);
        }

        config.ConfigJson = JsonSerializer.Serialize(dto.Roles, JsonOptions);
        await _db.SaveChangesAsync();

        return Ok(dto);
    }
}
