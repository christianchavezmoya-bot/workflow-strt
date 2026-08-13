using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace Commtrac.Api.Services;

public sealed class NotificationService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

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
            var recipients = await ResolveWorkflowCompletionRecipientsAsync(project, cancellationToken);

            if (recipients.Count == 0)
            {
                _logger.LogInformation(
                    "Workflow completion email skipped: no configured recipients for asset {AssetTag}",
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

    private async Task<List<string>> ResolveWorkflowCompletionRecipientsAsync(
        ProjectEntity? project,
        CancellationToken cancellationToken)
    {
        if (project is null)
        {
            return [];
        }

        var recipients = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var pmNameOrEmail = project.ProjectManager?.Trim();
        if (!string.IsNullOrWhiteSpace(pmNameOrEmail))
        {
            if (pmNameOrEmail.Contains('@'))
            {
                recipients.Add(pmNameOrEmail);
            }
            else
            {
                var pmEmail = await _db.Users.AsNoTracking()
                    .Where(u => u.IsActive && u.FullName == pmNameOrEmail)
                    .Select(u => u.Email)
                    .FirstOrDefaultAsync(cancellationToken);

                if (!string.IsNullOrWhiteSpace(pmEmail))
                {
                    recipients.Add(pmEmail);
                }
            }
        }

        var schedule = ParseScheduledReport(project.ScheduledReportJson);
        if (schedule?.AssetClosedNotificationEnabled == true)
        {
            foreach (var email in schedule.RecipientEmails ?? [])
            {
                if (!string.IsNullOrWhiteSpace(email))
                {
                    recipients.Add(email.Trim());
                }
            }
        }

        return recipients.ToList();
    }

    private static ProjectScheduledReportDto? ParseScheduledReport(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<ProjectScheduledReportDto>(json, JsonOptions);
        }
        catch
        {
            return null;
        }
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
