using System.Text.Json;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/settings")]
[Authorize(Roles = "Admin")]
public class SettingsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly NotificationSettingsService _notificationSettings;

    public SettingsController(AppDbContext db, NotificationSettingsService notificationSettings)
    {
        _db = db;
        _notificationSettings = notificationSettings;
    }

    [HttpPost("quickbase")]
    public async Task<ActionResult<QuickbaseSettingsDto>> SaveQuickbase([FromBody] QuickbaseSettingsDto request)
    {
        var settings = await _db.QuickbaseSettings.FirstOrDefaultAsync(s => s.Id == 1);
        if (settings is null)
        {
            settings = new QuickbaseSettingsEntity { Id = 1 };
            _db.QuickbaseSettings.Add(settings);
        }

        settings.Enabled = request.Enabled;
        settings.RealmHostname = request.RealmHostname;
        settings.UserToken = request.UserToken;
        settings.ProjectsTableId = request.ProjectsTableId;
        settings.InstallationsTableId = request.InstallationsTableId;
        settings.ProjectsFieldMapJson = JsonSerializer.Serialize(request.ProjectsFieldMap ?? new Dictionary<string, int>());
        settings.InstallationsFieldMapJson = JsonSerializer.Serialize(request.InstallationsFieldMap ?? new Dictionary<string, int>());

        await _db.SaveChangesAsync();
        return Ok(request);
    }

    [HttpGet("notifications")]
    public async Task<ActionResult<NotificationSettingsDto>> GetNotifications()
    {
        return Ok(await _notificationSettings.GetAsync());
    }

    [HttpPost("notifications")]
    public async Task<ActionResult<NotificationSettingsDto>> SaveNotifications([FromBody] NotificationSettingsDto request)
    {
        return Ok(await _notificationSettings.SaveAsync(request));
    }
}
