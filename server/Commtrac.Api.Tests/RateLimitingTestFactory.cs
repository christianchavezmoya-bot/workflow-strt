using System;
using System.Collections.Concurrent;
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
using Microsoft.Extensions.Logging;

namespace Commtrac.Api.Tests;

/// <summary>
/// Boots the API with the real Phase 2 rate-limit thresholds (permit limits unchanged from
/// production). Windows default to <see cref="DefaultWindow"/>, far longer than any test runs,
/// so "limited after N requests" assertions can't be undone by time passing; a window-expiry
/// test opts into <see cref="ShortWindow"/> instead of waiting a real 5-15 minutes. Also lets a test set the resolved client IP directly (via a header, applied before
/// routing) and fakes the outbound Resend HTTP call so email-suppression-after-limit tests
/// can assert on delivery-attempt counts without any network access.
/// </summary>
internal sealed class RateLimitingTestFactory : WebApplicationFactory<Program>
{
    /// <summary>Test-only header setting the connection's resolved client IP directly.</summary>
    public const string ClientIpHeader = "X-Test-Client-Ip";

    /// <summary>Default for every window. The limiters are sliding windows that hand permits back
    /// segment by segment, so with a window of a couple of seconds a slow CI runner could finish
    /// the N permitted requests after the earliest permits had already returned, and the
    /// "should be limited" request then got through (seen in CI as 404 instead of 429).
    /// Ten minutes can't elapse inside a test.</summary>
    public static readonly TimeSpan DefaultWindow = TimeSpan.FromMinutes(10);

    /// <summary>Opt-in short window for tests that must observe a window expiring.</summary>
    public static readonly TimeSpan ShortWindow = TimeSpan.FromSeconds(5);

    private readonly TimeSpan _window;

    private readonly Func<HttpRequestMessage, HttpResponseMessage>? _resendResponder;
    public int ResendCallCount;

    /// <summary>Captures every formatted log message emitted by the app, so tests can assert
    /// on exactly what the rate limiter logs on rejection (and, more importantly, what it
    /// does not log).</summary>
    public readonly CapturingLoggerProvider LoggerProvider = new();

    private readonly string _dbPath =
        Path.Combine(Path.GetTempPath(), $"commtrac-ratelimit-test-{Guid.NewGuid():N}.db");

    private static readonly string ApiContentRoot =
        Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "Commtrac.Api"));

    public RateLimitingTestFactory(
        Func<HttpRequestMessage, HttpResponseMessage>? resendResponder = null, TimeSpan? window = null)
    {
        _resendResponder = resendResponder;
        _window = window ?? DefaultWindow;
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

            // Test registry: same permit limits as production, one window for every limiter.
            services.RemoveAll<SecurityRateLimiterRegistry>();
            services.AddSingleton(new SecurityRateLimiterRegistry(
                credentialIpWindow: _window,
                emailDispatchIpWindow: _window,
                forgotPasswordEmailWindow: _window,
                requestOtpTokenWindow: _window,
                resetPasswordIpWindow: _window,
                submitTokenWindow: _window,
                submitIpWindow: _window));

            if (_resendResponder is not null)
            {
                services.AddHttpClient(nameof(ResendEmailService))
                    .ConfigurePrimaryHttpMessageHandler(() => new CountingFakeHandler(this, _resendResponder));
            }

            services.AddSingleton<IStartupFilter, ClientIpStartupFilter>();
            services.AddLogging(logging => logging.AddProvider(LoggerProvider));
        });
    }

    public sealed class CapturingLoggerProvider : ILoggerProvider
    {
        private readonly ConcurrentQueue<string> _messages = new();
        public IReadOnlyCollection<string> Messages => _messages;

        public ILogger CreateLogger(string categoryName) => new CapturingLogger(_messages);

        public void Dispose() { }

        private sealed class CapturingLogger : ILogger
        {
            private readonly ConcurrentQueue<string> _messages;
            public CapturingLogger(ConcurrentQueue<string> messages) => _messages = messages;

            public IDisposable BeginScope<TState>(TState state) where TState : notnull => NullScope.Instance;
            public bool IsEnabled(LogLevel logLevel) => true;

            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            {
                _messages.Enqueue(formatter(state, exception));
            }

            private sealed class NullScope : IDisposable
            {
                public static readonly NullScope Instance = new();
                public void Dispose() { }
            }
        }
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
