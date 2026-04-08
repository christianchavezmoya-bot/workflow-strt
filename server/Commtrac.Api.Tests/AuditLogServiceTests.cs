using System.Security.Claims;
using System.Threading.Tasks;
using Commtrac.Api.Data;
using Commtrac.Api.Services;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Commtrac.Api.Tests;

public class AuditLogServiceTests
{
    private static AppDbContext CreateDb() =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(System.Guid.NewGuid().ToString())
            .Options);

    [Fact]
    public async Task LogAsync_WritesCorrectUserId()
    {
        using var db = CreateDb();
        var svc = new AuditLogService(db);
        var principal = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, "u-123"),
            new Claim(ClaimTypes.Email, "test@example.com"),
        }));

        await svc.LogAsync(principal, null, "login_success", "ok");

        var log = await db.AuditLogs.FirstAsync();
        Assert.Equal("u-123", log.UserId);
        Assert.Equal("login_success", log.Action);
    }

    [Fact]
    public async Task LogSystemAsync_UsesSystemUserId()
    {
        using var db = CreateDb();
        var svc = new AuditLogService(db);

        await svc.LogSystemAsync("db_migrated", "v42");

        var log = await db.AuditLogs.FirstAsync();
        Assert.Equal("system", log.UserId);
        Assert.Equal("db_migrated", log.Action);
    }
}
