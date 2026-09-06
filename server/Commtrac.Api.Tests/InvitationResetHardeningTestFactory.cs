using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Commtrac.Api.Tests;

/// <summary>
/// Boots the API outside Development (mirrors <see cref="ForwardedHeadersTestFactory"/>) so
/// AuthController/UsersController's ResolveFrontendBaseUrl runs its non-Development branch —
/// the one hardened to never fall back to Origin/Referer/Host. Also swaps in a capturing
/// IEmailSender so tests can read the invite/reset link a real request would only ever see
/// via email, without ever persisting or logging the raw bearer token themselves.
/// </summary>
internal sealed class InvitationResetHardeningTestFactory : WebApplicationFactory<Program>
{
    private readonly string _dbPath =
        Path.Combine(Path.GetTempPath(), $"commtrac-hardening-test-{Guid.NewGuid():N}.db");

    private static readonly string ApiContentRoot =
        Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "Commtrac.Api"));

    private readonly string? _frontendBaseUrl;

    public CapturingEmailSender EmailSender { get; } = new();

    /// <param name="frontendBaseUrl">
    /// Value to configure for Email:FrontendBaseUrl. Pass null to simulate missing
    /// production configuration (exercises the fail-safe throw).
    /// </param>
    public InvitationResetHardeningTestFactory(string? frontendBaseUrl = "https://www.strata-ngo.com")
    {
        _frontendBaseUrl = frontendBaseUrl;
        Environment.SetEnvironmentVariable("Jwt__Key", "test-hardening-jwt-key-32-bytes-minimum!!");
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Staging");
        builder.UseContentRoot(ApiContentRoot);
        builder.ConfigureAppConfiguration((_, config) =>
        {
            var overrides = new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = $"Data Source={_dbPath}",
                ["DatabaseBackups:Enabled"] = "false",
                ["Database:Provider"] = "Sqlite",
                ["Database:RunMigrationsOnStartup"] = "true",
                ["SeedAdmin:Email"] = "admin@hardening-test.local",
                ["SeedAdmin:Password"] = "Admin123!Test",
                // appsettings.Staging.json sets SeedProfile=StrataNgo, whose seeder also
                // requires this to be configured outside Development.
                ["SeedProjectManager:Password"] = "Pm123!Test",
                ["Cors:AllowedOrigins:0"] = "https://www.strata-ngo.com",
            };

            if (_frontendBaseUrl is not null)
            {
                overrides["Email:FrontendBaseUrl"] = _frontendBaseUrl;
            }
            else
            {
                // Explicitly blank out whatever appsettings.Staging.json might configure —
                // simulates production configuration genuinely being absent.
                overrides["Email:FrontendBaseUrl"] = "";
            }

            config.AddInMemoryCollection(overrides);
        });
        builder.ConfigureServices(services =>
        {
            // Program.cs reads Database:Provider while building the host, before the
            // configuration above is appended — so the registration itself must be
            // replaced, matching TestDbRegistration's use elsewhere.
            TestDbRegistration.UseTestDatabase(services, options =>
                options.UseSqlite($"Data Source={_dbPath}"));

            services.AddSingleton<IEmailSender>(EmailSender);
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

/// <summary>Records invite/reset links exactly as a real IEmailSender would deliver them, for test assertions only.</summary>
internal sealed class CapturingEmailSender : IEmailSender
{
    public List<(string ToEmail, string Link)> InviteLinks { get; } = new();
    public List<(string ToEmail, string Link)> ResetLinks { get; } = new();

    public Task SendTestEmailAsync(string toEmail, CancellationToken cancellationToken = default) => Task.CompletedTask;

    public Task SendInviteAsync(string toEmail, string inviteLink, CancellationToken cancellationToken = default)
    {
        InviteLinks.Add((toEmail, inviteLink));
        return Task.CompletedTask;
    }

    public Task SendPasswordResetAsync(string toEmail, string resetLink, CancellationToken cancellationToken = default)
    {
        ResetLinks.Add((toEmail, resetLink));
        return Task.CompletedTask;
    }

    public Task SendNotificationAsync(string toEmail, string subject, string body, CancellationToken cancellationToken = default) => Task.CompletedTask;

    public Task SendSignatureLinkAsync(
        string toEmail, string recipientName, string signLink, string assetName, DateTime expiresAtUtc,
        string? customMessage = null, CancellationToken cancellationToken = default) => Task.CompletedTask;

    public Task SendWorkflowCompletionNotificationAsync(
        string toEmail, string assetTag, string jobLabel, string completedByName,
        string? reportOrSignLink = null, CancellationToken cancellationToken = default) => Task.CompletedTask;

    public Task<AssetReportEmailDeliveryResult> SendAssetReportShareAsync(
        string toEmail, string? recipientName, string subject, string body,
        IReadOnlyList<EmailAttachment> attachments, CancellationToken cancellationToken = default)
        => Task.FromResult(new AssetReportEmailDeliveryResult(true, "test", null));
}
