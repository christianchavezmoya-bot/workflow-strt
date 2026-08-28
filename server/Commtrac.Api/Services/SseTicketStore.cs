using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace Commtrac.Api.Services;

public sealed class SseTicketStoreOptions
{
    public const int DefaultTicketLifetimeSeconds = 300;
    public const int DefaultMaxTicketsPerUserPerMinute = 12;

    public int TicketLifetimeSeconds { get; set; } = DefaultTicketLifetimeSeconds;
    public int MaxTicketsPerUserPerMinute { get; set; } = DefaultMaxTicketsPerUserPerMinute;
}

public enum SseTicketIssueStatus
{
    Success,
    RateLimited,
}

public readonly record struct SseTicketIssueResult(
    SseTicketIssueStatus Status,
    string? Ticket,
    int ExpiresInSeconds,
    int RetryAfterSeconds);

public sealed class SseTicketStore
{
    private sealed record TicketEntry(string UserId, string? SessionId, DateTime ExpiresUtc);

    private readonly SseTicketStoreOptions _options;
    private readonly ConcurrentDictionary<string, TicketEntry> _tickets = new();
    private readonly ConcurrentDictionary<string, List<DateTime>> _issueTimestamps = new();
    private readonly ConcurrentDictionary<string, object> _rateLimitLocks = new();

    public SseTicketStore(SseTicketStoreOptions? options = null)
    {
        _options = options ?? new SseTicketStoreOptions();
    }

    public SseTicketIssueResult TryIssue(string userId, string? sessionId)
    {
        CleanupExpired();
        if (string.IsNullOrWhiteSpace(userId))
        {
            return new SseTicketIssueResult(SseTicketIssueStatus.RateLimited, null, 0, 0);
        }

        if (!TryConsumeRateLimit(userId, out var retryAfterSeconds))
        {
            return new SseTicketIssueResult(
                SseTicketIssueStatus.RateLimited,
                null,
                0,
                retryAfterSeconds);
        }

        var ticket = GenerateOpaqueTicket();
        var expiresAt = DateTime.UtcNow.AddSeconds(_options.TicketLifetimeSeconds);
        _tickets[ticket] = new TicketEntry(userId, sessionId, expiresAt);

        return new SseTicketIssueResult(
            SseTicketIssueStatus.Success,
            ticket,
            _options.TicketLifetimeSeconds,
            0);
    }

    /// <summary>
    /// Validates and consumes a ticket (single-use). Returns false when missing or expired.
    /// </summary>
    public bool TryConsume(string ticket, out string userId, out string? sessionId)
    {
        CleanupExpired();
        userId = "";
        sessionId = null;

        if (string.IsNullOrWhiteSpace(ticket)) return false;
        if (!_tickets.TryRemove(ticket, out var entry)) return false;
        if (entry.ExpiresUtc <= DateTime.UtcNow) return false;

        userId = entry.UserId;
        sessionId = entry.SessionId;
        return true;
    }

    private bool TryConsumeRateLimit(string userId, out int retryAfterSeconds)
    {
        var lockObj = _rateLimitLocks.GetOrAdd(userId, _ => new object());
        lock (lockObj)
        {
            var list = _issueTimestamps.GetOrAdd(userId, _ => []);
            var cutoff = DateTime.UtcNow.AddMinutes(-1);
            list.RemoveAll(t => t < cutoff);

            if (list.Count >= _options.MaxTicketsPerUserPerMinute)
            {
                retryAfterSeconds = list.Count > 0
                    ? Math.Max(1, (int)Math.Ceiling((list[0].AddMinutes(1) - DateTime.UtcNow).TotalSeconds))
                    : 60;
                return false;
            }

            list.Add(DateTime.UtcNow);
            retryAfterSeconds = 0;
            return true;
        }
    }

    private void CleanupExpired()
    {
        var now = DateTime.UtcNow;
        foreach (var kvp in _tickets)
        {
            if (kvp.Value.ExpiresUtc <= now)
            {
                _tickets.TryRemove(kvp.Key, out _);
            }
        }
    }

    private static string GenerateOpaqueTicket()
    {
        Span<byte> bytes = stackalloc byte[32];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }
}
