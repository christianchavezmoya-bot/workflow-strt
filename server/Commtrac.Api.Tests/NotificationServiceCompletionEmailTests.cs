using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// Guards the fix for the PM/admin still receiving "Workflow completed" emails while the
/// AssetClosedNotificationEnabled toggle was off. ResolveWorkflowCompletionRecipientsAsync
/// previously added the PM before checking the toggle — only the *additional* schedule
/// recipients were gated. These tests exercise the real public entry point
/// (NotifyWorkflowCompletedAsync) with a fake IEmailSender to assert on actual recipient
/// behavior, not just JSON (de)serialization of the setting.
/// </summary>
public class NotificationServiceCompletionEmailTests
{
    private sealed class FakeEmailSender : IEmailSender
    {
        public List<string> SentTo { get; } = new();

        public Task SendTestEmailAsync(string toEmail, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task SendInviteAsync(string toEmail, string inviteLink, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task SendPasswordResetAsync(string toEmail, string resetLink, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task SendNotificationAsync(string toEmail, string subject, string body, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task SendSignatureLinkAsync(string toEmail, string recipientName, string signLink, string assetName, DateTime expiresAtUtc, string? customMessage = null, CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task SendWorkflowCompletionNotificationAsync(
            string toEmail, string assetTag, string jobLabel, string completedByName,
            string? reportOrSignLink = null, CancellationToken cancellationToken = default)
        {
            SentTo.Add(toEmail);
            return Task.CompletedTask;
        }

        public Task<AssetReportEmailDeliveryResult> SendAssetReportShareAsync(
            string toEmail, string? recipientName, string subject, string body,
            IReadOnlyList<EmailAttachment> attachments, CancellationToken cancellationToken = default)
            => Task.FromResult(new AssetReportEmailDeliveryResult(true, "test", null));
    }

    private sealed class NoopSmsSender : ISmsSender
    {
        public Task SendAsync(string toNumber, string message) => Task.CompletedTask;
    }

    private static AppDbContext OpenInMemoryDb()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite("Data Source=:memory:")
            .Options;
        var db = new AppDbContext(options);
        db.Database.OpenConnection();
        db.Database.EnsureCreated();
        return db;
    }

    private static (NotificationService service, FakeEmailSender sender, AppDbContext db) BuildService()
    {
        var db = OpenInMemoryDb();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>()).Build();
        var settings = new NotificationSettingsService(db, config);
        var sender = new FakeEmailSender();
        var service = new NotificationService(
            db, sender, new NoopSmsSender(), settings, config, NullLogger<NotificationService>.Instance);
        return (service, sender, db);
    }

    private static ProjectEntity SeedProject(AppDbContext db, string? pmEmail, string? scheduledReportJson)
    {
        var project = new ProjectEntity
        {
            Id = Guid.NewGuid().ToString(),
            JobNumber = "J-1",
            ProjectManager = pmEmail,
            ScheduledReportJson = scheduledReportJson,
        };
        db.Projects.Add(project);
        db.SaveChanges();
        return project;
    }

    private static (AssetWorkflowRunEntity run, ProjectAssetEntity asset) SeedRunAndAsset(AppDbContext db, string projectId)
    {
        var asset = new ProjectAssetEntity
        {
            Id = Guid.NewGuid().ToString(),
            ProjectId = projectId,
            AssetTag = "AC-001",
        };
        db.ProjectAssets.Add(asset);
        var run = new AssetWorkflowRunEntity
        {
            Id = Guid.NewGuid().ToString(),
            AssetId = asset.Id,
        };
        db.AssetWorkflowRuns.Add(run);
        db.SaveChanges();
        return (run, asset);
    }

    [Fact]
    public async Task PM_is_not_emailed_when_the_completion_toggle_is_off()
    {
        var (service, sender, db) = BuildService();
        var scheduleJson = """{"enabled":false,"frequency":"daily","daysOfWeek":[],"sendTimeLocal":null,"recipientEmails":[],"assetClosedNotificationEnabled":false}""";
        var project = SeedProject(db, "pm@example.com", scheduleJson);
        var (run, asset) = SeedRunAndAsset(db, project.Id);

        await service.NotifyWorkflowCompletedAsync(run, asset, "Field Tech");

        Assert.Empty(sender.SentTo);
    }

    [Fact]
    public async Task PM_is_emailed_when_the_completion_toggle_is_on()
    {
        var (service, sender, db) = BuildService();
        var scheduleJson = """{"enabled":false,"frequency":"daily","daysOfWeek":[],"sendTimeLocal":null,"recipientEmails":[],"assetClosedNotificationEnabled":true}""";
        var project = SeedProject(db, "pm@example.com", scheduleJson);
        var (run, asset) = SeedRunAndAsset(db, project.Id);

        await service.NotifyWorkflowCompletedAsync(run, asset, "Field Tech");

        Assert.Contains("pm@example.com", sender.SentTo);
    }

    [Fact]
    public async Task Additional_recipients_are_also_suppressed_when_the_completion_toggle_is_off()
    {
        var (service, sender, db) = BuildService();
        var scheduleJson = """{"enabled":true,"frequency":"daily","daysOfWeek":[],"sendTimeLocal":null,"recipientEmails":["extra@example.com"],"assetClosedNotificationEnabled":false}""";
        var project = SeedProject(db, "pm@example.com", scheduleJson);
        var (run, asset) = SeedRunAndAsset(db, project.Id);

        await service.NotifyWorkflowCompletedAsync(run, asset, "Field Tech");

        Assert.Empty(sender.SentTo);
    }

    [Fact]
    public async Task Additional_recipients_are_included_alongside_the_PM_when_the_toggle_is_on()
    {
        var (service, sender, db) = BuildService();
        var scheduleJson = """{"enabled":false,"frequency":"daily","daysOfWeek":[],"sendTimeLocal":null,"recipientEmails":["extra@example.com"],"assetClosedNotificationEnabled":true}""";
        var project = SeedProject(db, "pm@example.com", scheduleJson);
        var (run, asset) = SeedRunAndAsset(db, project.Id);

        await service.NotifyWorkflowCompletedAsync(run, asset, "Field Tech");

        Assert.Contains("pm@example.com", sender.SentTo);
        Assert.Contains("extra@example.com", sender.SentTo);
    }

    [Fact]
    public async Task No_scheduled_report_configured_at_all_means_no_completion_email()
    {
        // Legacy/never-configured projects have a null ScheduledReportJson — the toggle
        // defaults to false (per ProjectScheduledReportDto), so no email should send.
        var (service, sender, db) = BuildService();
        var project = SeedProject(db, "pm@example.com", scheduledReportJson: null);
        var (run, asset) = SeedRunAndAsset(db, project.Id);

        await service.NotifyWorkflowCompletedAsync(run, asset, "Field Tech");

        Assert.Empty(sender.SentTo);
    }
}
