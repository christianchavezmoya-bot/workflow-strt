using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Commtrac.Api.Services;

public sealed class NotificationFeedService
{
    private readonly AppDbContext _db;
    private readonly PushNotificationDeliveryService _push;
    private readonly ILogger<NotificationFeedService> _logger;
    private static readonly HashSet<string> SuppressedRoles = new(StringComparer.OrdinalIgnoreCase)
    {
        "Viewer",
        "Client",
        "Customer",
    };

    public NotificationFeedService(AppDbContext db, PushNotificationDeliveryService push, ILogger<NotificationFeedService> logger)
    {
        _db = db;
        _push = push;
        _logger = logger;
    }

    public async Task<List<NotificationInboxDto>> ListForUserAsync(string userId, string role, bool includeRead, int take)
    {
        if (IsSuppressedRole(role))
        {
            return [];
        }

        var normalizedTake = Math.Clamp(take, 1, 200);
        var query = _db.NotificationInbox
            .AsNoTracking()
            .Where(n =>
                n.RecipientUserId == userId ||
                (n.RecipientRole != null && n.RecipientRole == role));

        if (!includeRead)
        {
            query = query.Where(n => n.ReadAtUtc == null);
        }

        return await query
            .OrderByDescending(n => n.CreatedAtUtc)
            .Take(normalizedTake)
            .Select(ToDtoExpression())
            .ToListAsync();
    }

    public async Task<int> MarkAsReadAsync(string userId, string role, IReadOnlyCollection<string>? notificationIds)
    {
        if (IsSuppressedRole(role))
        {
            return 0;
        }

        var query = _db.NotificationInbox.Where(n =>
            (n.RecipientUserId == userId || (n.RecipientRole != null && n.RecipientRole == role)) &&
            n.ReadAtUtc == null);

        if (notificationIds is { Count: > 0 })
        {
            query = query.Where(n => notificationIds.Contains(n.Id));
        }

        var now = DateTime.UtcNow;
        var items = await query.ToListAsync();
        foreach (var item in items)
        {
            item.ReadAtUtc = now;
            item.ReadByUserId = userId;
        }

        if (items.Count > 0)
        {
            await _db.SaveChangesAsync();
        }

        return items.Count;
    }

    public async Task CreateAsync(CreateNotificationRequest request)
    {
        var requestedRecipientUserIds = request.RecipientUserIds?
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList() ?? [];

        var recipientRoles = request.RecipientRoles?
            .Where(role => !string.IsNullOrWhiteSpace(role))
            .Select(role => role.Trim())
            .Where(role => !IsSuppressedRole(role))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList() ?? [];

        var recipientUserIds = requestedRecipientUserIds.Count == 0
            ? []
            : await _db.Users
                .AsNoTracking()
                .Where(u => requestedRecipientUserIds.Contains(u.Id) && !SuppressedRoles.Contains(u.Role))
                .Select(u => u.Id)
                .Distinct()
                .ToListAsync();

        foreach (var userId in recipientUserIds)
        {
            _db.NotificationInbox.Add(BuildEntity(request, recipientUserId: userId.Trim(), recipientRole: null));
        }

        foreach (var role in recipientRoles)
        {
            _db.NotificationInbox.Add(BuildEntity(request, recipientUserId: null, recipientRole: role.Trim()));
        }

        if (recipientUserIds.Count == 0 && recipientRoles.Count == 0)
        {
            return;
        }

        await _db.SaveChangesAsync();

        if (recipientUserIds.Count > 0)
        {
            try
            {
                await _push.SendToUsersAsync(recipientUserIds, request.Title.Trim(), request.Message.Trim());
            }
            catch (Exception ex)
            {
                _logger.LogWarning(
                    ex,
                    "Push delivery failed for notification event {EventType}; inbox records were saved successfully.",
                    request.EventType);
            }
        }
    }

    private static bool IsSuppressedRole(string? role)
    {
        return !string.IsNullOrWhiteSpace(role) && SuppressedRoles.Contains(role.Trim());
    }

    public Task NotifyRolesAsync(
        string eventType,
        string severity,
        string title,
        string message,
        IEnumerable<string> recipientRoles,
        string? projectId = null,
        string? assetId = null,
        string? runId = null,
        string? entityType = null,
        string? entityId = null,
        string? triggeredByUserId = null,
        string? triggeredByName = null)
    {
        return CreateAsync(new CreateNotificationRequest(
            eventType,
            severity,
            title,
            message,
            null,
            recipientRoles.ToList(),
            projectId,
            assetId,
            runId,
            entityType,
            entityId,
            triggeredByUserId,
            triggeredByName
        ));
    }

    public Task NotifyUsersAsync(
        string eventType,
        string severity,
        string title,
        string message,
        IEnumerable<string> recipientUserIds,
        string? projectId = null,
        string? assetId = null,
        string? runId = null,
        string? entityType = null,
        string? entityId = null,
        string? triggeredByUserId = null,
        string? triggeredByName = null)
    {
        return CreateAsync(new CreateNotificationRequest(
            eventType,
            severity,
            title,
            message,
            recipientUserIds.ToList(),
            null,
            projectId,
            assetId,
            runId,
            entityType,
            entityId,
            triggeredByUserId,
            triggeredByName
        ));
    }

    private static System.Linq.Expressions.Expression<Func<NotificationInboxEntity, NotificationInboxDto>> ToDtoExpression()
    {
        return n => new NotificationInboxDto(
            n.Id,
            n.EventType,
            n.Severity,
            n.Title,
            n.Message,
            n.ProjectId,
            n.AssetId,
            n.RunId,
            n.EntityType,
            n.EntityId,
            n.TriggeredByUserId,
            n.TriggeredByName,
            n.CreatedAtUtc,
            n.ReadAtUtc,
            n.ReadAtUtc != null
        );
    }

    private static NotificationInboxEntity BuildEntity(
        CreateNotificationRequest request,
        string? recipientUserId,
        string? recipientRole)
    {
        return new NotificationInboxEntity
        {
            Id = Guid.NewGuid().ToString(),
            RecipientUserId = recipientUserId,
            RecipientRole = recipientRole,
            EventType = request.EventType,
            Severity = string.IsNullOrWhiteSpace(request.Severity) ? "info" : request.Severity.Trim(),
            Title = request.Title.Trim(),
            Message = request.Message.Trim(),
            ProjectId = request.ProjectId,
            AssetId = request.AssetId,
            RunId = request.RunId,
            EntityType = request.EntityType,
            EntityId = request.EntityId,
            TriggeredByUserId = request.TriggeredByUserId,
            TriggeredByName = request.TriggeredByName,
            CreatedAtUtc = DateTime.UtcNow,
        };
    }
}
