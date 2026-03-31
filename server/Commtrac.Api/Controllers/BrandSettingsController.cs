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
    private const string AppNameKey = "app-name";
    private readonly AppDbContext _db;
    public BrandSettingsController(AppDbContext db) => _db = db;

    // GET api/brand-settings — public so unauthenticated pages (invite/reset) can read the app name
    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> Get()
    {
        var settings = await _db.BrandSettings
            .Where(s => s.Key == LogoKey || s.Key == AppNameKey)
            .ToDictionaryAsync(s => s.Key, s => s.Value);

        settings.TryGetValue(LogoKey, out var logo);
        settings.TryGetValue(AppNameKey, out var appName);
        return Ok(new BrandSettingDto(logo, appName));
    }

    // PUT api/brand-settings
    [HttpPut]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Set([FromBody] UpdateBrandSettingRequest req)
    {
        if (req.LogoBase64 is not null)
        {
            var logo = await _db.BrandSettings.FirstOrDefaultAsync(s => s.Key == LogoKey);
            if (logo is null)
            {
                _db.BrandSettings.Add(new BrandSettingEntity { Key = LogoKey, Value = req.LogoBase64 });
            }
            else
            {
                logo.Value = req.LogoBase64;
                logo.UpdatedAt = DateTime.UtcNow;
            }
        }

        if (req.AppName is not null)
        {
            var appName = await _db.BrandSettings.FirstOrDefaultAsync(s => s.Key == AppNameKey);
            if (appName is null)
            {
                _db.BrandSettings.Add(new BrandSettingEntity { Key = AppNameKey, Value = req.AppName });
            }
            else
            {
                appName.Value = req.AppName;
                appName.UpdatedAt = DateTime.UtcNow;
            }
        }

        await _db.SaveChangesAsync();
        var settings = await _db.BrandSettings
            .Where(s => s.Key == LogoKey || s.Key == AppNameKey)
            .ToDictionaryAsync(s => s.Key, s => s.Value);

        settings.TryGetValue(LogoKey, out var logoResult);
        settings.TryGetValue(AppNameKey, out var appNameResult);
        return Ok(new BrandSettingDto(logoResult, appNameResult));
    }

    // DELETE api/brand-settings (removes logo only)
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
