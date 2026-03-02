using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Commtrac.Api.Data;
using Commtrac.Api.Models;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/brand-settings")]
[Authorize]
public class BrandSettingsController : ControllerBase
{
    private const string LogoKey = "logo";
    private readonly AppDbContext _db;
    public BrandSettingsController(AppDbContext db) => _db = db;

    // GET api/brand-settings
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var setting = await _db.BrandSettings.FirstOrDefaultAsync(s => s.Key == LogoKey);
        return Ok(new BrandSettingDto(setting?.Value));
    }

    // PUT api/brand-settings
    [HttpPut]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Set([FromBody] UpdateBrandSettingRequest req)
    {
        var setting = await _db.BrandSettings.FirstOrDefaultAsync(s => s.Key == LogoKey);
        if (setting is null)
        {
            setting = new BrandSettingEntity { Key = LogoKey, Value = req.LogoBase64 ?? string.Empty };
            _db.BrandSettings.Add(setting);
        }
        else
        {
            setting.Value     = req.LogoBase64 ?? string.Empty;
            setting.UpdatedAt = DateTime.UtcNow;
        }
        await _db.SaveChangesAsync();
        return Ok(new BrandSettingDto(setting.Value));
    }

    // DELETE api/brand-settings
    [HttpDelete]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Remove()
    {
        var setting = await _db.BrandSettings.FirstOrDefaultAsync(s => s.Key == LogoKey);
        if (setting is not null)
        {
            _db.BrandSettings.Remove(setting);
            await _db.SaveChangesAsync();
        }
        return NoContent();
    }
}
