using System;
using System.Collections.Generic;
using System.IO;
using Commtrac.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Commtrac.Api.Tests;

/// <summary>
/// Boots the real API against a throwaway Postgres database, so tests can catch the
/// failures that only exist on Postgres: dates and flags live in text/integer columns
/// behind <see cref="DateTime"/>/<see cref="bool"/> properties (see
/// AppDbContext.ApplySqliteShapedPostgresConversions), and Npgsql is strict where SQLite
/// is forgiving. <see cref="PostgresSchemaParityTests"/> compares the schema; this covers
/// what the schema cannot show — how a query is actually translated and executed.
///
/// Opt-in via COMMTRAC_POSTGRES_TEST=1, matching the other Postgres tests. Point
/// COMMTRAC_POSTGRES_CONNECTION at a disposable database: the constructor drops it.
/// </summary>
public sealed class PostgresApiTestFactory : WebApplicationFactory<Program>
{
    public static string ConnectionString =>
        Environment.GetEnvironmentVariable("COMMTRAC_POSTGRES_CONNECTION")
        ?? "Host=localhost;Port=5432;Database=commtrac;Username=commtrac;Password=commtrac_dev";

    public static bool Enabled =>
        string.Equals(Environment.GetEnvironmentVariable("COMMTRAC_POSTGRES_TEST"), "1", StringComparison.Ordinal);

    private static readonly string ApiContentRoot =
        Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "Commtrac.Api"));

    public PostgresApiTestFactory()
    {
        Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Development");

        // Start empty so host startup runs migrations, the Ensure* schema patches and admin
        // seeding the same way a fresh cloud deployment does.
        using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(ConnectionString)
            .Options);
        db.Database.EnsureDeleted();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseContentRoot(ApiContentRoot);
        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Database:Provider"] = "Postgres",
                ["Database:RunMigrationsOnStartup"] = "true",
                ["ConnectionStrings:DefaultConnection"] = ConnectionString,
                ["DatabaseBackups:Enabled"] = "false",
            });
        });
        builder.ConfigureServices(services =>
        {
            TestDbRegistration.UseTestDatabase(services, options =>
                options.UseNpgsql(ConnectionString));
        });
    }
}
