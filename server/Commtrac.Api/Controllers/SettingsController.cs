using System.Text.Json;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/settings")]
[Authorize(Roles = "Admin")]
public class SettingsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly NotificationSettingsService _notificationSettings;
    private readonly SqliteBackupService _backupService;
    private readonly RecoveryService _recovery;
    private readonly ResendEmailService _emailService;
    private readonly bool _sqliteBackupsEnabled;

    public SettingsController(
        AppDbContext db,
        NotificationSettingsService notificationSettings,
        SqliteBackupService backupService,
        RecoveryService recovery,
        ResendEmailService emailService,
        IConfiguration configuration)
    {
        _db = db;
        _notificationSettings = notificationSettings;
        _backupService = backupService;
        _recovery = recovery;
        _emailService = emailService;
        _sqliteBackupsEnabled = !string.Equals(
            configuration["Database:Provider"], "Postgres", StringComparison.OrdinalIgnoreCase);
    }

    private ActionResult? SqliteBackupsUnavailable()
        => _sqliteBackupsEnabled
            ? null
            : StatusCode(StatusCodes.Status501NotImplemented, new
            {
                message = "SQLite file backups are not available when Database:Provider=Postgres. Use RDS snapshots instead."
            });

    [HttpGet("quickbase")]
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

    [HttpGet("runtime-frontend-base")]
    [AllowAnonymous]
    public ActionResult<object> GetRuntimeFrontendBase([FromQuery] string? frontendPort = null)
    {
        var scheme = Request.Scheme;
        var port = string.IsNullOrWhiteSpace(frontendPort)
            ? "5173"
            : frontendPort.Trim();

        var requestHostIp = GetRequestHostPrivateIpv4();
        var detectedIp = !string.IsNullOrWhiteSpace(requestHostIp)
            ? requestHostIp
            : DetectLanIpv4Address();

        if (string.IsNullOrWhiteSpace(detectedIp))
        {
            return Ok(new
            {
                frontendBaseUrl = "",
                detectedIp = "",
            });
        }

        return Ok(new
        {
            frontendBaseUrl = $"{scheme}://{detectedIp}:{port}",
            detectedIp,
        });
    }

    [HttpPost("notifications")]
    public async Task<ActionResult<NotificationSettingsDto>> SaveNotifications([FromBody] NotificationSettingsDto request)
    {
        return Ok(await _notificationSettings.SaveAsync(request));
    }

    [HttpPost("notifications/test-email")]
    public async Task<ActionResult<TestEmailResponse>> SendTestEmail([FromBody] TestEmailRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.ToEmail) || !request.ToEmail.Contains('@'))
        {
            return BadRequest(new TestEmailResponse(false, "skipped", "A valid recipient email address is required."));
        }

        var result = await _emailService.SendTestEmailWithResultAsync(request.ToEmail.Trim(), cancellationToken);
        return Ok(new TestEmailResponse(result.Success, result.Mode, result.Message ?? ""));
    }

    private string GetRequestHostPrivateIpv4()
    {
        var host = Request.Host.Host?.Trim();
        if (string.IsNullOrWhiteSpace(host))
            return "";

        if (!IPAddress.TryParse(host, out var address))
            return "";

        return IsPrivateIpv4Address(address)
            ? address.ToString()
            : "";
    }
    private static string DetectLanIpv4Address()
    {
        try
        {
            var interfaces = NetworkInterface.GetAllNetworkInterfaces()
                .Where(nic =>
                    nic.OperationalStatus == OperationalStatus.Up &&
                    nic.NetworkInterfaceType != NetworkInterfaceType.Loopback &&
                    nic.NetworkInterfaceType != NetworkInterfaceType.Tunnel);

            foreach (var nic in interfaces)
            {
                var candidate = nic.GetIPProperties().UnicastAddresses
                    .Select(addr => addr.Address)
                    .FirstOrDefault(IsPrivateIpv4Address);

                if (candidate is not null)
                    return candidate.ToString();
            }
        }
        catch
        {
            // Fall through to empty result.
        }

        return "";
    }

    private static bool IsPrivateIpv4Address(IPAddress address)
    {
        if (address.AddressFamily != AddressFamily.InterNetwork)
            return false;

        var bytes = address.GetAddressBytes();
        return bytes[0] == 10
            || (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31)
            || (bytes[0] == 192 && bytes[1] == 168);
    }

    [HttpGet("backups")]
    public async Task<ActionResult<IEnumerable<object>>> ListBackups()
    {
        if (SqliteBackupsUnavailable() is { } unavailable) return unavailable;

        var backups = await _backupService.ListBackupsAsync();
        return Ok(backups.Select(b => new
        {
            b.FileName,
            b.FullPath,
            b.SizeBytes,
            b.CreatedAtUtc
        }));
    }

    [HttpPost("backups/create")]
    public async Task<ActionResult<object>> CreateBackup()
    {
        if (SqliteBackupsUnavailable() is { } unavailable) return unavailable;

        var backup = await _backupService.CreateBackupAsync("manual");
        return Ok(new
        {
            backup.FileName,
            backup.FullPath,
            backup.SizeBytes,
            backup.CreatedAtUtc
        });
    }

    [HttpPost("backups/restore")]
    public async Task<ActionResult<RestoreBackupResponse>> RestoreBackup([FromBody] RestoreBackupRequest request, CancellationToken cancellationToken)
    {
        if (SqliteBackupsUnavailable() is { } unavailable) return unavailable;

        var result = await _backupService.RestoreBackupAsync(request.FileName, cancellationToken);
        return Ok(new RestoreBackupResponse(
            request.FileName,
            result.SafeguardBackup.FileName,
            result.RestoredAtUtc
        ));
    }

    [HttpGet("backups/catalog")]
    public async Task<ActionResult<IEnumerable<BackupCatalogItemDto>>> ListBackupCatalog(
        [FromQuery] string fileName,
        [FromQuery] string entityType,
        [FromQuery] string? search,
        CancellationToken cancellationToken)
    {
        if (SqliteBackupsUnavailable() is { } unavailable) return unavailable;

        return Ok(await _recovery.ListBackupCatalogAsync(fileName, entityType, search, cancellationToken));
    }

    [HttpPost("backups/restore-item")]
    public async Task<ActionResult<SelectiveRestoreResultDto>> RestoreItemFromBackup([FromBody] RestoreBackupItemRequest request, CancellationToken cancellationToken)
    {
        if (SqliteBackupsUnavailable() is { } unavailable) return unavailable;

        return Ok(await _recovery.RestoreItemFromBackupAsync(request.FileName, request.EntityType, request.EntityId, cancellationToken));
    }

    [HttpGet("recycle-bin")]
    public async Task<ActionResult<IEnumerable<RecycleBinItemDto>>> GetRecycleBin(
        [FromQuery] string? entityType,
        [FromQuery] string? search,
        CancellationToken cancellationToken)
    {
        return Ok(await _recovery.ListRecycleBinAsync(search, entityType, cancellationToken));
    }
}
