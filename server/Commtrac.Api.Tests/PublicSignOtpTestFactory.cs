using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Commtrac.Api.Tests;

/// <summary>
/// Boots the API outside Development (to exercise the disclosure-blocked OTP path) with a
/// fake handler standing in for the real Resend HTTP call, so tests control delivery
/// outcome (success / provider failure / no transport configured at all) without any
/// network access. Also captures every formatted log message so tests can assert no
/// secret ever appears in them.
/// </summary>
internal sealed class PublicSignOtpTestFactory : WebApplicationFactory<Program>
{
    private readonly string _environmentName;
    private readonly Func<HttpRequestMessage, HttpResponseMessage>? _resendResponder;
    private readonly bool _configureResendKey;

    private readonly string _dbPath =
        Path.Combine(Path.GetTempPath(), $"commtrac-otp-test-{Guid.NewGuid():N}.db");

    private static readonly string ApiContentRoot =
        Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "Commtrac.Api"));

    /// <summary>Every formatted log message emitted during this factory's lifetime.</summary>
    public ConcurrentQueue<string> CapturedLogs { get; } = new();

    /// <param name="environmentName">"Staging" (non-Development, real disclosure rules apply) or "Development".</param>
    /// <param name="resendResponder">
    /// Fake response for the outgoing Resend HTTP call. Null means "no Resend key
    /// configured at all" (exercises the simulated-mode path), independent of whether a
    /// responder is supplied — see <paramref name="configureResendKey"/>.
    /// </param>
    /// <param name="configureResendKey">
    /// Whether to configure a (fake) Resend API key. False reproduces "no transport
    /// configured" regardless of the responder.
    /// </param>
    public PublicSignOtpTestFactory(
        string environmentName = "Staging",
        Func<HttpRequestMessage, HttpResponseMessage>? resendResponder = null,
        bool configureResendKey = true)
    {
        _environmentName = environmentName;
        _resendResponder = resendResponder;
        _configureResendKey = configureResendKey;
        Environment.SetEnvironmentVariable("Jwt__Key", "test-otp-hotfix-jwt-key-32-bytes-min!!");
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(_environmentName);
        builder.UseContentRoot(ApiContentRoot);
        builder.ConfigureAppConfiguration((_, config) =>
        {
            var settings = new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = $"Data Source={_dbPath}",
                ["DatabaseBackups:Enabled"] = "false",
                ["Database:Provider"] = "Sqlite",
                ["Database:RunMigrationsOnStartup"] = "true",
                ["SeedProfile"] = "",
                ["SeedAdmin:Password"] = "Admin123!",
                ["Cors:AllowedOrigins:0"] = "https://staging.strata-ngo.com",
            };
            if (_configureResendKey)
            {
                settings["Email:ResendApiKey"] = "test-fake-resend-key-not-real";
            }
            config.AddInMemoryCollection(settings);
        });

        builder.ConfigureServices(services =>
        {
            TestDbRegistration.UseTestDatabase(services, options =>
                options.UseSqlite($"Data Source={_dbPath}"));

            if (_resendResponder is not null)
            {
                services.AddHttpClient(nameof(ResendEmailService))
                    .ConfigurePrimaryHttpMessageHandler(() => new FakeHandler(_resendResponder));
            }

            services.AddLogging(logging => logging.AddProvider(new CapturingLoggerProvider(CapturedLogs)));
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

    private sealed class FakeHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _responder;
        public FakeHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) => _responder = responder;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            => Task.FromResult(_responder(request));
    }

    private sealed class CapturingLoggerProvider : ILoggerProvider
    {
        private readonly ConcurrentQueue<string> _sink;
        public CapturingLoggerProvider(ConcurrentQueue<string> sink) => _sink = sink;
        public ILogger CreateLogger(string categoryName) => new CapturingLogger(categoryName, _sink);
        public void Dispose() { }

        private sealed class CapturingLogger : ILogger
        {
            private readonly string _category;
            private readonly ConcurrentQueue<string> _sink;
            public CapturingLogger(string category, ConcurrentQueue<string> sink) { _category = category; _sink = sink; }

            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
            public bool IsEnabled(LogLevel logLevel) => true;

            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            {
                _sink.Enqueue($"[{_category}] {formatter(state, exception)}");
            }
        }
    }
}
