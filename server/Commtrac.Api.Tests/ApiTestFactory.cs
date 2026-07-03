using System;
using System.IO;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Commtrac.Api.Tests;

/// <summary>
/// Boots the real API in-memory against an isolated throwaway SQLite database.
/// Startup runs the actual migrations + DbInitializer Ensure*/Fix* patches and
/// seeds the admin from appsettings, so tests exercise the whole stack.
/// </summary>
public class ApiTestFactory : WebApplicationFactory<Program>
{
    private readonly string _dbPath =
        Path.Combine(Path.GetTempPath(), $"commtrac-test-{Guid.NewGuid():N}.db");

    // Absolute path to the API project source dir so appsettings.json (and thus
    // SeedAdmin) loads regardless of where the test binaries live.
    private static readonly string ApiContentRoot =
        Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "Commtrac.Api"));

    public ApiTestFactory()
    {
        // Set BEFORE the host builder runs (Program.cs reads these at build time).
        Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Development");
        Environment.SetEnvironmentVariable(
            "ConnectionStrings__DefaultConnection", $"Data Source={_dbPath}");
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseContentRoot(ApiContentRoot);
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
