using System.Security.Claims;
using Commtrac.Api.Data;
using Commtrac.Api.Models;

namespace Commtrac.Api.Services;

public class AuditLogService
{
    private readonly AppDbContext _db;

    public AuditLogService(AppDbContext db)
    {
        _db = db;
    }

    public async Task LogAsync(ClaimsPrincipal? user, HttpContext? httpContext, string action, string? details = null)
    {
        var userId = user?.FindFirst("sub")?.Value
            ?? user?.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? "system";
        var userEmail = user?.FindFirst(ClaimTypes.Email)?.Value
            ?? user?.Identity?.Name
            ?? "system";
        var ipAddress = httpContext?.Connection?.RemoteIpAddress?.ToString();

        _db.AuditLogs.Add(new AuditLogEntity
        {
            UserId = userId,
            UserEmail = userEmail,
            Action = action,
            Details = details,
            IpAddress = ipAddress,
            Timestamp = DateTime.UtcNow
        });

        await _db.SaveChangesAsync();
    }

    public async Task LogSystemAsync(string action, string? details = null)
    {
        _db.AuditLogs.Add(new AuditLogEntity
        {
            UserId = "system",
            UserEmail = "system",
            Action = action,
            Details = details,
            Timestamp = DateTime.UtcNow
        });

        await _db.SaveChangesAsync();
    }
}
