using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Commtrac.Api.Services;

public sealed class NotificationService
{
    private readonly AppDbContext _db;
    private readonly IEmailSender _emailSender;
    private readonly ISmsSender _smsSender;
    private readonly NotificationSettingsService _notificationSettings;
    private readonly IConfiguration _config;
    private readonly ILogger<NotificationService> _logger;

    public NotificationService(
        AppDbContext db,
        IEmailSender emailSender,
        ISmsSender smsSender,
        NotificationSettingsService notificationSettings,
        IConfiguration config,
        ILogger<NotificationService> logger)
    {
        _db = db;
        _emailSender = emailSender;
        _smsSender = smsSender;
        _notificationSettings = notificationSettings;
        _config = config;
        _logger = logger;
    }

    public async Task NotifyInstallationCompletedAsync(InstallationEntity installation)
    {
        var adminEmail = _config["SeedAdmin:Email"] ?? "admin@commtrac.local";
        var subject = $"Installation completed: {installation.InstallationNumber}";
        var body = $"Installation {installation.InstallationNumber} is now 100% complete.";
        await _emailSender.SendNotificationAsync(adminEmail, subject, body);
    }

    public async Task NotifyWorkflowCompletedAsync(
        AssetWorkflowRunEntity run,
        ProjectAssetEntity asset,
        string completedByName,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var project = await _db.Projects.AsNoTracking().FirstOrDefaultAsync(p => p.Id == asset.ProjectId, cancellationToken);
            var jobLabel = project?.JobNumber ?? "unknown";
            var frontendBase = (await _notificationSettings.GetFrontendBaseUrlAsync()).TrimEnd('/');
            var reportLink = string.IsNullOrWhiteSpace(frontendBase)
                ? null
                : $"{frontendBase}/projects/{asset.ProjectId}/installations";

            var recipients = await _db.Users.AsNoTracking()
                .Where(u => u.IsActive && (u.Role == "Admin" || u.Role == "Project Manager"))
                .Select(u => u.Email)
                .Where(email => !string.IsNullOrWhiteSpace(email))
                .Distinct()
                .ToListAsync(cancellationToken);

            if (recipients.Count == 0)
            {
                _logger.LogInformation(
                    "Workflow completion email skipped — no Admin/PM recipients for asset {AssetTag}",
                    asset.AssetTag);
                return;
            }

            foreach (var email in recipients)
            {
                await _emailSender.SendWorkflowCompletionNotificationAsync(
                    email,
                    asset.AssetTag,
                    jobLabel,
                    completedByName,
                    reportLink,
                    cancellationToken);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Workflow completion email failed for run {RunId}", run.Id);
        }
    }

    public async Task NotifyInspectionAssignedAsync(InspectionEntity inspection)
    {
        var recipient = await ResolveRecipientAsync(inspection.Inspector);
        if (recipient is null)
        {
            _logger.LogInformation("No email found for inspector {Inspector}", inspection.Inspector);
            return;
        }

        var subject = $"New inspection assigned: {inspection.Name}";
        var body = $"You have been assigned inspection {inspection.Name}.";
        var resolved = recipient.Value;
        if (resolved.Kind == "sms")
        {
            await _smsSender.SendAsync(resolved.Value, body);
            return;
        }
        await _emailSender.SendNotificationAsync(resolved.Value, subject, body);
    }

    public async Task NotifyIssueAssignedAsync(IssueEntity issue)
    {
        var recipient = await ResolveRecipientAsync(issue.Owner);
        if (recipient is null)
        {
            _logger.LogInformation("No email found for issue owner {Owner}", issue.Owner);
            return;
        }

        var subject = $"New issue assigned: {issue.Title}";
        var body = $"You have been assigned issue {issue.Title}.";
        var resolved = recipient.Value;
        if (resolved.Kind == "sms")
        {
            await _smsSender.SendAsync(resolved.Value, body);
            return;
        }
        await _emailSender.SendNotificationAsync(resolved.Value, subject, body);
    }

    private async Task<(string Kind, string Value)?> ResolveRecipientAsync(string nameOrEmail)
    {
        if (string.IsNullOrWhiteSpace(nameOrEmail))
        {
            return null;
        }

        if (nameOrEmail.Contains('@'))
        {
            return ("email", nameOrEmail);
        }

        var trimmed = nameOrEmail.Trim();
        if (trimmed.Length >= 8 && trimmed.Any(char.IsDigit) && trimmed.All(ch => char.IsDigit(ch) || ch == '+' || ch == ' ' || ch == '-'))
        {
            return ("sms", trimmed);
        }

        var user = await _db.Users.FirstOrDefaultAsync(u => u.FullName.ToLower() == nameOrEmail.ToLower());
        return string.IsNullOrWhiteSpace(user?.Email) ? null : ("email", user.Email);
    }
}
