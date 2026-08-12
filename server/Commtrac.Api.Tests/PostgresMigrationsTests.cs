using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// Optional Postgres parity test — runs only when COMMTRAC_POSTGRES_TEST=1.
/// Use a throwaway database (not production). Start Postgres: docker compose up -d postgres
/// </summary>
public class PostgresMigrationsTests
{
    [Fact]
    public void All_migrations_apply_cleanly_to_a_fresh_postgres_database()
    {
        if (!string.Equals(Environment.GetEnvironmentVariable("COMMTRAC_POSTGRES_TEST"), "1", StringComparison.Ordinal))
        {
            return;
        }

        var connectionString = Environment.GetEnvironmentVariable("COMMTRAC_POSTGRES_CONNECTION")
            ?? "Host=localhost;Port=5432;Database=commtrac;Username=commtrac;Password=commtrac_dev";

        using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(connectionString)
            .Options);

        db.Database.EnsureDeleted();
        db.Database.Migrate();
        PostgresSchemaEnsurer.EnsureSchema(db);

        Assert.NotEmpty(db.Database.GetAppliedMigrations());
        Assert.Empty(db.Database.GetPendingMigrations());
    }
}
