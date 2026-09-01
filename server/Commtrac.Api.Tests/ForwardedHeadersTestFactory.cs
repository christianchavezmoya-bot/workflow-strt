using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Commtrac.Api.Tests;

/// <summary>
/// Boots the API outside Development so the real UseForwardedHeaders pipeline runs
/// (it is skipped in Development), and lets a test set the connection's peer address
/// so both the trusted-proxy and untrusted-spoof paths can be exercised.
/// </summary>
internal sealed class ForwardedHeadersTestFactory : WebApplicationFactory<Program>
{
    /// <summary>Test-only header naming the simulated TCP peer (stands in for the ALB ENI).</summary>
    public const string PeerHeader = "X-Test-Peer-Ip";

    private readonly string _dbPath =
        Path.Combine(Path.GetTempPath(), $"commtrac-fwdhdr-test-{Guid.NewGuid():N}.db");

    private static readonly string ApiContentRoot =
        Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "Commtrac.Api"));

    public ForwardedHeadersTestFactory()
    {
        Environment.SetEnvironmentVariable("Jwt__Key", "test-fwdhdr-jwt-key-32-bytes-minimum!!");
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
                // Mirror real staging: StrataNgo profile. Both seed passwords are
                // required outside Development (DbInitializer.ResolveSeedPassword).
                ["SeedProfile"] = "StrataNgo",
                ["SeedAdmin:Email"] = "admin@StrataNgo.local",
                ["SeedAdmin:Password"] = "Admin123!",
                ["SeedProjectManager:Password"] = "Pm123!Test",
                ["Cors:AllowedOrigins:0"] = "https://staging.strata-ngo.com",
            });
        });

        // Runs before everything in Program.cs (including UseForwardedHeaders), so the
        // forwarded-headers middleware sees the peer address this sets — exactly as it
        // would see a real ALB ENI address in front of it.
        builder.ConfigureServices(services =>
        {
            // Program.cs reads Database:Provider while building the host, before the
            // configuration above is appended — so the registration itself must be
            // replaced. See TestDbRegistration.
            TestDbRegistration.UseTestDatabase(services, options =>
                options.UseSqlite($"Data Source={_dbPath}"));

            services.AddSingleton<IStartupFilter, PeerAddressStartupFilter>();
        });
    }

    private sealed class PeerAddressStartupFilter : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            app.Use(async (context, nextMiddleware) =>
            {
                if (context.Request.Headers.TryGetValue(PeerHeader, out var peer)
                    && IPAddress.TryParse(peer.ToString(), out var parsed))
                {
                    context.Connection.RemoteIpAddress = parsed;
                }

                await nextMiddleware();
            });

            next(app);
        };
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (!disposing) return;
        try { if (File.Exists(_dbPath)) File.Delete(_dbPath); } catch { /* best effort */ }
    }
}
