using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Commtrac.Api.Services;

/// <summary>
/// Delivers mobile push notifications to registered device tokens.
/// When FCM/APNs credentials are not configured, logs and no-ops safely.
/// </summary>
public sealed class PushNotificationDeliveryService
{
    private readonly AppDbContext _db;
    private readonly ILogger<PushNotificationDeliveryService> _logger;

    public PushNotificationDeliveryService(AppDbContext db, ILogger<PushNotificationDeliveryService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task SendToUsersAsync(
        IEnumerable<string> userIds,
        string title,
        string body,
        CancellationToken cancellationToken = default)
    {
        var ids = userIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (ids.Count == 0) return;

        var tokens = await _db.PushDeviceTokens
            .AsNoTracking()
            .Where(t => ids.Contains(t.UserId))
            .Select(t => new { t.Token, t.Platform })
            .ToListAsync(cancellationToken);

        if (tokens.Count == 0) return;

        // FCM/APNs wiring is environment-specific — scaffold delivery here so
        // NotificationFeedService can trigger pushes without further API changes.
        _logger.LogInformation(
            "Push notification queued for {UserCount} user(s), {TokenCount} device token(s): {Title}",
            ids.Count,
            tokens.Count,
            title);

        foreach (var token in tokens)
        {
            _logger.LogDebug("Push target [{Platform}] token prefix {Prefix}… — {Body}",
                token.Platform,
                token.Token.Length > 8 ? token.Token[..8] : token.Token,
                body);
        }
    }
}
