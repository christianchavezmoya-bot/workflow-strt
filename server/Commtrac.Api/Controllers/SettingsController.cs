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

    [HttpGet("quickbase")]
    [Authorize]
    public async Task<ActionResult<QuickbaseSettingsDto>> GetQuickbase()
    {
        var s = await _db.QuickbaseSettings.FirstOrDefaultAsync(x => x.Id == 1);
        if (s is null) return Ok(new QuickbaseSettingsDto(false, "", "", "", "", new(), new(), "", 0, 0, 0));
        return Ok(new QuickbaseSettingsDto(
            s.Enabled, s.RealmHostname, s.UserToken,
            s.ProjectsTableId, s.InstallationsTableId,
            JsonSerializer.Deserialize<Dictionary<string, int>>(s.ProjectsFieldMapJson ?? "{}") ?? new(),
            JsonSerializer.Deserialize<Dictionary<string, int>>(s.InstallationsFieldMapJson ?? "{}") ?? new(),
            s.GoodsMovementsTableId ?? "", s.GoodsMovementsJobFid, s.GoodsMovementsOrderRefFid, s.GoodsMovementsDirectionFid
        ));
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
        settings.GoodsMovementsTableId = request.GoodsMovementsTableId ?? "";
        settings.GoodsMovementsJobFid = request.GoodsMovementsJobFid;
        settings.GoodsMovementsOrderRefFid = request.GoodsMovementsOrderRefFid;
        settings.GoodsMovementsDirectionFid = request.GoodsMovementsDirectionFid;

        await _db.SaveChangesAsync();
        return Ok(request);
    }

    [HttpGet("notifications")]
    public async Task<ActionResult<NotificationSettingsDto>> GetNotifications()
    {
        return Ok(await _notificationSettings.GetAsync());
    }

    [HttpGet("public")]
    [AllowAnonymous]
    public async Task<ActionResult<PublicAppSettingsDto>> GetPublicSettings()
    {
        var frontendBaseUrl = await _notificationSettings.GetFrontendBaseUrlAsync();
        return Ok(new PublicAppSettingsDto(frontendBaseUrl));
    }

    [HttpPost("notifications")]
    public async Task<ActionResult<NotificationSettingsDto>> SaveNotifications([FromBody] NotificationSettingsDto request)
    {
        return Ok(await _notificationSettings.SaveAsync(request));
    }
}
