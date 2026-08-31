using System;
using System.Collections.Generic;
using System.IO;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Commtrac.Api.Tests;

/// <summary>Boots the API outside Development for legacy SSE auth rejection tests.</summary>
internal sealed class ProductionSseTestFactory : WebApplicationFactory<Program>
{
    private readonly string _dbPath =
        Path.Combine(Path.GetTempPath(), $"commtrac-staging-sse-test-{Guid.NewGuid():N}.db");

    private static readonly string ApiContentRoot =
        Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "Commtrac.Api"));

    public ProductionSseTestFactory()
    {
        Environment.SetEnvironmentVariable("Jwt__Key", "test-staging-jwt-key-32-bytes-min!!!");
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Staging");
        builder.UseContentRoot(ApiContentRoot);
        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = $"Data Source={_dbPath}",
                ["DatabaseBackups:Enabled"] = "false",
                ["Database:Provider"] = "Sqlite",
                ["Database:RunMigrationsOnStartup"] = "true",
                ["SeedProfile"] = "",
                ["SeedAdmin:Password"] = "Admin123!",
            });
        });
        builder.ConfigureServices(services =>
        {
            TestDbRegistration.UseTestDatabase(services, options =>
                options.UseSqlite($"Data Source={_dbPath}"));
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (!disposing) return;
        foreach (var f in new[] { _dbPath, _dbPath + "-shm", _dbPath + "-wal" })
        {
            try { if (File.Exists(f)) File.Delete(f); } catch { /* best effort */ }
        }
    }
}
