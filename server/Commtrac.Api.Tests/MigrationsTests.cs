using System;
using System.IO;
using System.Linq;
using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// Migration-chain integrity: applying every EF migration to a brand-new SQLite
/// database must succeed and leave nothing pending. This catches a broken or
/// missing migration without booting the full app (which currently can't seed a
/// fresh DB — see AuthLoginTests for that finding).
/// </summary>
public class MigrationsTests : IDisposable
{
    private readonly string _dbPath =
        Path.Combine(Path.GetTempPath(), $"commtrac-mig-{Guid.NewGuid():N}.db");

    private AppDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite($"Data Source={_dbPath}")
            .Options);

    [Fact]
    public void All_migrations_apply_cleanly_to_a_fresh_database()
    {
        using var db = CreateContext();

        db.Database.Migrate();

        Assert.NotEmpty(db.Database.GetAppliedMigrations());
        Assert.Empty(db.Database.GetPendingMigrations());
    }

    public void Dispose()
    {
        foreach (var f in new[] { _dbPath, _dbPath + "-shm", _dbPath + "-wal" })
        {
            try { if (File.Exists(f)) File.Delete(f); } catch { /* best effort */ }
        }
        GC.SuppressFinalize(this);
    }
}
