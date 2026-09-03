using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Commtrac.Api.Data;
using Commtrac.Api.RateLimiting;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Commtrac.Api.Tests;

/// <summary>
/// Boots the API with the real Phase 2 rate-limit thresholds (permit limits unchanged from
/// production) but short windows, so window-expiry tests don't require a real 5-15 minute
/// wait. Also lets a test set the resolved client IP directly (via a header, applied before
/// routing) and fakes the outbound Resend HTTP call so email-suppression-after-limit tests
/// can assert on delivery-attempt counts without any network access.
/// </summary>
internal sealed class RateLimitingTestFactory : WebApplicationFactory<Program>
{
    /// <summary>Test-only header setting the connection's resolved client IP directly.</summary>
    public const string ClientIpHeader = "X-Test-Client-Ip";

    /// <summary>All rate-limit windows are shortened to this for every test using this factory.</summary>
    public static readonly TimeSpan TestWindow = TimeSpan.FromSeconds(2);

    private readonly Func<HttpRequestMessage, HttpResponseMessage>? _resendResponder;
    public int ResendCallCount;

    private readonly string _dbPath =
        Path.Combine(Path.GetTempPath(), $"commtrac-ratelimit-test-{Guid.NewGuid():N}.db");

    private static readonly string ApiContentRoot =
        Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "Commtrac.Api"));

    public RateLimitingTestFactory(Func<HttpRequestMessage, HttpResponseMessage>? resendResponder = null)
    {
        _resendResponder = resendResponder;
        // Staging (not Development): RequestOtp's Development branch never calls the email
        // service at all (it hands the OTP back directly for local convenience), which would
        // make the email-dispatch-suppression tests this factory exists for meaningless.
        Environment.SetEnvironmentVariable("Jwt__Key", "test-ratelimit-jwt-key-32-bytes-minimum!!");
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
                ["SeedAdmin:Password"] = "Admin123!",
                ["SeedProjectManager:Password"] = "Pm123!",
                ["Email:ResendApiKey"] = _resendResponder is not null ? "test-fake-resend-key" : null,
            });
        });

        builder.ConfigureServices(services =>
        {
            TestDbRegistration.UseTestDatabase(services, options =>
                options.UseSqlite($"Data Source={_dbPath}"));

            // Short-window registry: same permit limits as production, fast-expiring windows.
            services.RemoveAll<SecurityRateLimiterRegistry>();
            services.AddSingleton(new SecurityRateLimiterRegistry(
                credentialIpWindow: TestWindow,
                emailDispatchIpWindow: TestWindow,
                forgotPasswordEmailWindow: TestWindow,
                requestOtpTokenWindow: TestWindow,
                resetPasswordIpWindow: TestWindow,
                submitTokenWindow: TestWindow,
                submitIpWindow: TestWindow));

            if (_resendResponder is not null)
            {
                services.AddHttpClient(nameof(ResendEmailService))
                    .ConfigurePrimaryHttpMessageHandler(() => new CountingFakeHandler(this, _resendResponder));
            }

            services.AddSingleton<IStartupFilter, ClientIpStartupFilter>();
        });
    }

    private sealed class ClientIpStartupFilter : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            app.Use(async (context, nextMiddleware) =>
            {
                if (context.Request.Headers.TryGetValue(ClientIpHeader, out var value)
                    && IPAddress.TryParse(value.ToString(), out var parsed))
                {
                    context.Connection.RemoteIpAddress = parsed;
                }

                await nextMiddleware();
            });

            next(app);
        };
    }

    private sealed class CountingFakeHandler : HttpMessageHandler
    {
        private readonly RateLimitingTestFactory _owner;
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _responder;

        public CountingFakeHandler(RateLimitingTestFactory owner, Func<HttpRequestMessage, HttpResponseMessage> responder)
        {
            _owner = owner;
            _responder = responder;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Interlocked.Increment(ref _owner.ResendCallCount);
            return Task.FromResult(_responder(request));
        }
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
