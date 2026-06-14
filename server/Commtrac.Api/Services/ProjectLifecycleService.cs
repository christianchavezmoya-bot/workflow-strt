using System.Globalization;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Services;

public sealed class ProjectLifecycleService
{
    private readonly AppDbContext _db;
    private readonly NotificationFeedService _feed;

    public ProjectLifecycleService(AppDbContext db, NotificationFeedService feed)
    {
        _db = db;
        _feed = feed;
    }

    public async Task<ProjectEntity?> SyncFromAssetsAsync(string projectId, string? actorUserId, string? actorName, bool notifyStatusChange = true)
    {
        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == projectId);
        if (project is null || project.IsDeleted)
        {
            return null;
        }

        if (string.Equals(project.Status, "Closed", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(project.Status, "Cancelled", StringComparison.OrdinalIgnoreCase))
        {
            return project;
        }

        var assets = await _db.ProjectAssets
            .Where(a => a.ProjectId == projectId && !a.IsDeleted)
            .ToListAsync();

        var hasAssets = assets.Count > 0;
        var allComplete = hasAssets && assets.All(a =>
            string.Equals(a.Status, "Complete", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(a.Status, "Completed", StringComparison.OrdinalIgnoreCase));

        if (allComplete)
        {
            if (!string.Equals(project.Status, "Completed", StringComparison.OrdinalIgnoreCase))
            {
                var now = DateTime.UtcNow;
                project.Status = "Completed";
                project.CompletedAtUtc ??= now;
                if (string.IsNullOrWhiteSpace(project.CompletedBy))
                {
                    project.CompletedBy = actorName;
                }

                await _db.SaveChangesAsync();
                if (notifyStatusChange)
                {
                    await NotifyProjectStatusAsync(project, "project-completed", "success", "Project completed", actorUserId, actorName, now);
                }
            }

            return project;
        }

        if (string.Equals(project.Status, "Completed", StringComparison.OrdinalIgnoreCase))
        {
            project.Status = "In Progress";
            project.CompletedAtUtc = null;
            project.CompletedBy = null;
            await _db.SaveChangesAsync();
        }

        return project;
    }

    public async Task<(bool Success, string? Error, ProjectEntity? Project)> CloseProjectAsync(
        string projectId,
        string? actorUserId,
        string? actorName)
    {
        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == projectId);
        if (project is null || project.IsDeleted)
        {
            return (false, "Project not found.", null);
        }

        var assets = await _db.ProjectAssets
            .Where(a => a.ProjectId == projectId && !a.IsDeleted)
            .ToListAsync();

        var totalAssets = assets.Count;
        var completedAssets = assets.Count(a =>
            string.Equals(a.Status, "Complete", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(a.Status, "Completed", StringComparison.OrdinalIgnoreCase));

        if (totalAssets == 0 || completedAssets != totalAssets)
        {
            return (false, $"Project cannot be closed until all installation assets are complete ({completedAssets}/{totalAssets}).", project);
        }

        var now = DateTime.UtcNow;
        project.Status = "Closed";
        project.CompletedAtUtc ??= now;
        if (string.IsNullOrWhiteSpace(project.CompletedBy))
        {
            project.CompletedBy = actorName;
        }
        project.ClosedAtUtc = now;
        project.ClosedBy = actorName;

        await _db.SaveChangesAsync();
        await NotifyProjectStatusAsync(project, "project-closed", "info", "Project closed", actorUserId, actorName, now);
        return (true, null, project);
    }

    private Task NotifyProjectStatusAsync(
        ProjectEntity project,
        string eventType,
        string severity,
        string title,
        string? actorUserId,
        string? actorName,
        DateTime timestampUtc)
    {
        var when = timestampUtc.ToString("g", CultureInfo.InvariantCulture);
        var message = eventType switch
        {
            "project-completed" => $"{project.JobNumber} reached 100% completion and moved to Completed at {when} UTC.",
            "project-closed" => $"{project.JobNumber} was manually closed at {when} UTC by {actorName ?? "an authorized user"}.",
            _ => $"{project.JobNumber} status changed at {when} UTC.",
        };

        return _feed.NotifyRolesAsync(
            eventType,
            severity,
            title,
            message,
            ["Admin", "Project Manager"],
            project.Id,
            null,
            null,
            "project",
            project.Id,
            actorUserId,
            actorName);
    }
}
