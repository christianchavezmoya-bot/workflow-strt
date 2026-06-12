using System.Collections.Concurrent;
using System.Text.Json;
using System.Threading.Channels;

namespace Commtrac.Api.Services;

public sealed class SseMessage
{
    public string Event { get; init; } = "message";
    public string Data  { get; init; } = "{}";
}

public sealed class SseConnection
{
    public string Id     { get; } = Guid.NewGuid().ToString();
    public string UserId { get; init; } = "";

    // Unbounded, multi-writer (heartbeat + broadcast), single reader (stream loop)
    public Channel<SseMessage> Channel { get; } = System.Threading.Channels.Channel.CreateUnbounded<SseMessage>(
        new UnboundedChannelOptions { SingleReader = true, SingleWriter = false }
    );
}

/// <summary>
/// Singleton that tracks all active SSE connections and fans out push events.
/// Thread-safe — safe to call from any controller.
/// </summary>
public sealed class SseHub
{
    private static readonly JsonSerializerOptions _json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    // Key = SseConnection.Id (GUID), not userId, so multi-tab users work correctly
    private readonly ConcurrentDictionary<string, SseConnection> _connections = new();

    public int ConnectionCount => _connections.Count;

    public SseConnection Connect(string userId)
    {
        var conn = new SseConnection { UserId = userId };
        _connections[conn.Id] = conn;
        return conn;
    }

    public void Disconnect(SseConnection conn)
    {
        _connections.TryRemove(conn.Id, out _);
        conn.Channel.Writer.TryComplete();
    }

    /// <summary>Broadcast to every connected client except the one who triggered the change.</summary>
    public async Task BroadcastExceptAsync(
        string    excludeUserId,
        string    eventType,
        object    payload,
        CancellationToken ct = default)
    {
        var json = JsonSerializer.Serialize(payload, _json);
        var msg  = new SseMessage { Event = eventType, Data = json };

        var targets = _connections.Values
            .Where(c => c.UserId != excludeUserId)
            .ToList();

        foreach (var target in targets)
        {
            try { await target.Channel.Writer.WriteAsync(msg, ct); }
            catch { /* connection already closed — ignore */ }
        }
    }

    /// <summary>Broadcast to every connected client (including the sender).</summary>
    public async Task BroadcastAsync(
        string    eventType,
        object    payload,
        CancellationToken ct = default)
    {
        var json = JsonSerializer.Serialize(payload, _json);
        var msg  = new SseMessage { Event = eventType, Data = json };

        foreach (var conn in _connections.Values.ToList())
        {
            try { await conn.Channel.Writer.WriteAsync(msg, ct); }
            catch { /* connection already closed — ignore */ }
        }
    }
}
