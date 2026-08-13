using System.Text;
using System.Text.Json;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Utils;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Services;

public sealed class ProjectScheduledReportWorker : BackgroundService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ProjectScheduledReportWorker> _logger;

    public ProjectScheduledReportWorker(
        IServiceScopeFactory scopeFactory,
        ILogger<ProjectScheduledReportWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(5));
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Scheduled project report worker cycle failed");
            }

            if (!await timer.WaitForNextTickAsync(stoppingToken))
            {
                break;
            }
        }
    }

    private async Task ProcessAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var email = scope.ServiceProvider.GetRequiredService<IEmailSender>();
        var settings = scope.ServiceProvider.GetRequiredService<NotificationSettingsService>();

        var projects = await db.Projects
            .Where(p => !p.IsDeleted && p.ScheduledReportJson != null && p.ScheduledReportJson != "")
            .ToListAsync(cancellationToken);

        if (projects.Count == 0) return;

        var frontendBase = (await settings.GetFrontendBaseUrlAsync()).TrimEnd('/');
        var nowUtc = DateTime.UtcNow;

        foreach (var project in projects)
        {
            var schedule = ParseSchedule(project.ScheduledReportJson);
            if (schedule is null || !schedule.Enabled) continue;

            var recipients = (schedule.RecipientEmails ?? [])
                .Where(emailAddress => !string.IsNullOrWhiteSpace(emailAddress))
                .Select(emailAddress => emailAddress.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            if (recipients.Count == 0) continue;

            var timeZone = ResolveTimeZone(project);
            var localNow = TimeZoneInfo.ConvertTimeFromUtc(nowUtc, timeZone);
            if (!ShouldSendToday(schedule, localNow, project.FinishDate)) continue;
            if (!IsPastSendTime(schedule.SendTimeLocal, localNow)) continue;
            if (WasAlreadySent(schedule.LastSentAtUtc, localNow, timeZone)) continue;

            var assets = await db.ProjectAssets
                .Where(a => a.ProjectId == project.Id && !a.IsDeleted)
                .ToListAsync(cancellationToken);
            var assetIds = assets.Select(a => a.Id).ToList();

            var latestRuns = assetIds.Count == 0
                ? new List<AssetWorkflowRunEntity>()
                : await db.AssetWorkflowRuns
                    .Where(r => assetIds.Contains(r.AssetId))
                    .GroupBy(r => r.AssetId)
                    .Select(g => g.OrderByDescending(r => r.RunNumber).ThenByDescending(r => r.UpdatedAt).First())
                    .ToListAsync(cancellationToken);

            var subject = $"Scheduled Project Report - {project.JobNumber}";
            var projectLink = string.IsNullOrWhiteSpace(frontendBase) ? null : $"{frontendBase}/projects/{project.Id}";
            var body = BuildEmailBody(project, assets, latestRuns, localNow, timeZone, projectLink);

            foreach (var recipient in recipients)
            {
                await email.SendNotificationAsync(recipient, subject, body, cancellationToken);
            }

            var updatedSchedule = schedule with { LastSentAtUtc = nowUtc };
            project.ScheduledReportJson = JsonSerializer.Serialize(updatedSchedule, JsonOptions);
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private static ProjectScheduledReportDto? ParseSchedule(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            return JsonSerializer.Deserialize<ProjectScheduledReportDto>(json, JsonOptions);
        }
        catch
        {
            return null;
        }
    }

    private static TimeZoneInfo ResolveTimeZone(ProjectEntity project)
    {
        var timeZoneId = ProjectTimeZoneResolver.Resolve(project.TimeZoneId, project.Office, project.Region);
        if (!string.IsNullOrWhiteSpace(timeZoneId))
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(timeZoneId);
            }
            catch
            {
                // Fall back to UTC below.
            }
        }
        return TimeZoneInfo.Utc;
    }

    private static bool ShouldSendToday(ProjectScheduledReportDto schedule, DateTime localNow, string? finishDate)
    {
        if (!string.IsNullOrWhiteSpace(finishDate)
            && DateOnly.TryParse(finishDate, out var endDate)
            && DateOnly.FromDateTime(localNow) > endDate)
        {
            return false;
        }

        var frequency = (schedule.Frequency ?? "daily").Trim().ToLowerInvariant();
        if (frequency != "weekly") return true;

        var today = localNow.DayOfWeek switch
        {
            DayOfWeek.Monday => "M",
            DayOfWeek.Tuesday => "T",
            DayOfWeek.Wednesday => "W",
            DayOfWeek.Thursday => "TH",
            DayOfWeek.Friday => "F",
            DayOfWeek.Saturday => "S",
            DayOfWeek.Sunday => "SU",
            _ => "",
        };

        return (schedule.DaysOfWeek ?? []).Any(day => string.Equals(day?.Trim(), today, StringComparison.OrdinalIgnoreCase));
    }

    private static bool IsPastSendTime(string? sendTimeLocal, DateTime localNow)
    {
        if (!TimeOnly.TryParse(sendTimeLocal, out var configuredTime))
        {
            configuredTime = new TimeOnly(8, 0);
        }
        return TimeOnly.FromDateTime(localNow) >= configuredTime;
    }

    private static bool WasAlreadySent(DateTime? lastSentAtUtc, DateTime localNow, TimeZoneInfo timeZone)
    {
        if (lastSentAtUtc is null) return false;
        var localLastSent = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(lastSentAtUtc.Value, DateTimeKind.Utc), timeZone);
        return localLastSent.Date == localNow.Date;
    }

    private static string BuildEmailBody(
        ProjectEntity project,
        IReadOnlyList<ProjectAssetEntity> assets,
        IReadOnlyList<AssetWorkflowRunEntity> latestRuns,
        DateTime localNow,
        TimeZoneInfo timeZone,
        string? projectLink)
    {
        var totalAssets = assets.Count;
        var completeAssets = assets.Count(a => string.Equals(a.Status, "Complete", StringComparison.OrdinalIgnoreCase));
        var inProgressAssets = assets.Count(a => string.Equals(a.Status, "InProgress", StringComparison.OrdinalIgnoreCase));
        var pendingSignatures = latestRuns.Count(r => r.IsLocked && r.SignatureStatus == "PendingCustomer");
        var waivedSignatures = latestRuns.Count(r => r.SignatureStatus == "WaivedCustomer");
        var openIssues = latestRuns.Sum(CountOpenIssues);
        var productiveHours = latestRuns.Sum(r => r.ProductiveSeconds) / 3600d;
        var completionPercent = totalAssets == 0 ? 0 : Math.Round((double)completeAssets / totalAssets * 100d);

        var sb = new StringBuilder();
        sb.Append("<div style=\"font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1b1f24;\">");
        sb.Append($"<h2 style=\"margin:0 0 12px;\">Scheduled Project Report - {System.Net.WebUtility.HtmlEncode(project.JobNumber)}</h2>");
        sb.Append($"<p style=\"margin:0 0 12px;\">Generated {System.Net.WebUtility.HtmlEncode(localNow.ToString("dd MMM yyyy, h:mm tt"))} ({System.Net.WebUtility.HtmlEncode(timeZone.StandardName)}).</p>");
        sb.Append("<table style=\"border-collapse:collapse;width:100%;max-width:760px;\">");
        AppendRow("Customer", project.CustomerName, sb);
        AppendRow("Project manager", project.ProjectManager ?? "-", sb);
        AppendRow("Start date", project.StartDate, sb);
        AppendRow("Finish date", project.FinishDate, sb);
        AppendRow("Status", project.Status, sb);
        AppendRow("Assets complete", $"{completeAssets}/{totalAssets} ({completionPercent:0}%)", sb);
        AppendRow("Assets in progress", inProgressAssets.ToString(), sb);
        AppendRow("Pending customer signatures", pendingSignatures.ToString(), sb);
        AppendRow("Customer signatures waived", waivedSignatures.ToString(), sb);
        AppendRow("Open issues", openIssues.ToString(), sb);
        AppendRow("Tracked productive hours", productiveHours.ToString("0.0"), sb);
        sb.Append("</table>");
        if (!string.IsNullOrWhiteSpace(projectLink))
        {
            sb.Append($"<p style=\"margin:16px 0 0;\">Open project: <a href=\"{projectLink}\">{projectLink}</a></p>");
        }
        sb.Append("</div>");
        return sb.ToString();
    }

    private static void AppendRow(string label, string value, StringBuilder sb)
    {
        sb.Append("<tr>");
        sb.Append($"<td style=\"padding:8px 10px;border:1px solid #d7dde5;background:#f4f7fa;font-weight:600;width:240px;\">{System.Net.WebUtility.HtmlEncode(label)}</td>");
        sb.Append($"<td style=\"padding:8px 10px;border:1px solid #d7dde5;\">{System.Net.WebUtility.HtmlEncode(value)}</td>");
        sb.Append("</tr>");
    }

    private static int CountOpenIssues(AssetWorkflowRunEntity run)
    {
        try
        {
            var issues = JsonSerializer.Deserialize<List<RunIssueDto>>(run.IssuesJson ?? "[]", JsonOptions) ?? [];
            return issues.Count(issue => !issue.Resolved);
        }
        catch
        {
            return 0;
        }
    }

    private sealed record RunIssueDto(bool Resolved);
}
