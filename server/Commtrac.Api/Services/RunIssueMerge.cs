using System.Text.Json;
using System.Text.Json.Nodes;

namespace Commtrac.Api.Services;

/// <summary>A requested change to a recorded issue that the caller is not allowed to make.</summary>
public sealed record RunIssueRefusal(string IssueId, string Reason);

public sealed record RunIssueMergeResult(
    string Json,
    IReadOnlyList<string> PreservedOmittedIds,
    IReadOnlyList<string> DeletedIds,
    IReadOnlyList<RunIssueRefusal> Refusals,
    int OpenBlockingCount,
    bool ClientUnreadable);

/// <summary>
/// Combines the issue list a client sends for a run (save progress, complete, sync bundle, patch
/// issues) with the list already recorded on the server, instead of letting the client's list
/// replace it:
///
///   - Omission is not deletion. A recorded issue the client didn't send (e.g. one a PM added while
///     the phone was offline) is kept. Deleting needs an explicit id in <c>deletedIssueIds</c>.
///   - An unresolved blocking issue can only be deleted, or downgraded to non-blocking, by Admin /
///     Project Manager or by the user the server recorded as its creator (<c>createdByUserId</c>,
///     stamped from the caller's token when the issue first reaches the server and never taken
///     from a client). Anyone may resolve it.
///   - Same id on both sides: the client's content wins (phone-wins field sync), but a resolution
///     recorded on the server is never undone, and comments / media are combined, not replaced.
///   - Issues the client adds are kept as sent, with createdByUserId set to the caller.
/// </summary>
public static class RunIssueMerge
{
    public const string CreatedByUserIdKey = "createdByUserId";

    private static readonly string[] ResolutionKeys =
        { "resolved", "resolvedNote", "resolutionNote", "resolvedAt", "resolvedBy", "resolvedByName", "resolutionMedia" };

    public static RunIssueMergeResult Merge(
        string? serverJson, string? clientJson, IEnumerable<string>? deletedIssueIds, string? actorUserId, bool callerManagesBlocking)
    {
        var client = ParseArray(clientJson);
        if (client is null)
        {
            return new RunIssueMergeResult(serverJson ?? "[]", Array.Empty<string>(), Array.Empty<string>(), Array.Empty<RunIssueRefusal>(),
                CountOpenBlocking(serverJson), ClientUnreadable: true);
        }

        // A server list that can't be read can't be preserved either; keep the previous behaviour
        // (the client's list) rather than block every save of the run.
        var server = ParseArray(serverJson) ?? new JsonArray();
        var deleted = new HashSet<string>(deletedIssueIds ?? Array.Empty<string>(), StringComparer.Ordinal);
        var serverById = new Dictionary<string, JsonObject>(StringComparer.Ordinal);
        foreach (var node in server)
        {
            if (node is JsonObject o && IdOf(o) is { } id && !serverById.ContainsKey(id)) serverById[id] = o;
        }

        bool MayRemoveOrDowngrade(JsonObject recorded) =>
            callerManagesBlocking
            || (!string.IsNullOrWhiteSpace(actorUserId) && Str(recorded, CreatedByUserIdKey) == actorUserId);

        var result = new JsonArray();
        var refusals = new List<RunIssueRefusal>();
        var seen = new HashSet<string>(StringComparer.Ordinal);

        foreach (var node in client)
        {
            if (node is not JsonObject incoming)
            {
                result.Add(node?.DeepClone());
                continue;
            }
            var id = IdOf(incoming);
            if (id is not null && serverById.TryGetValue(id, out var recorded))
            {
                if (!seen.Add(id)) continue; // duplicate id in the payload: first one wins
                var merged = MergeSameIssue(recorded, incoming);
                if (IsOpenBlocking(recorded) && !IsBlocking(merged) && !IsResolved(merged) && !MayRemoveOrDowngrade(recorded))
                {
                    refusals.Add(new RunIssueRefusal(id, "An unresolved blocking issue can't be downgraded to non-blocking; resolve it instead."));
                }
                result.Add(merged);
            }
            else
            {
                if (id is not null && !seen.Add(id)) continue;
                var added = (JsonObject)incoming.DeepClone();
                added.Remove(CreatedByUserIdKey);
                if (!string.IsNullOrWhiteSpace(actorUserId)) added[CreatedByUserIdKey] = actorUserId;
                result.Add(added);
            }
        }

        var preserved = new List<string>();
        var removed = new List<string>();
        foreach (var node in server)
        {
            if (node is not JsonObject recorded)
            {
                result.Add(node?.DeepClone());
                continue;
            }
            var id = IdOf(recorded);
            if (id is null)
            {
                result.Add(recorded.DeepClone()); // can't be referenced, so never dropped
                continue;
            }
            if (seen.Contains(id)) continue;
            if (deleted.Contains(id))
            {
                if (IsOpenBlocking(recorded) && !MayRemoveOrDowngrade(recorded))
                {
                    refusals.Add(new RunIssueRefusal(id, "An unresolved blocking issue can't be deleted; resolve it instead."));
                    result.Add(recorded.DeepClone());
                }
                else
                {
                    removed.Add(id);
                }
                continue;
            }
            preserved.Add(id);
            result.Add(recorded.DeepClone());
        }

        var json = result.ToJsonString();
        return new RunIssueMergeResult(json, preserved, removed, refusals, CountOpenBlocking(json), ClientUnreadable: false);
    }

    /// <summary>Unresolved blocking issues (isBlocking && !resolved), as CompleteRun's gate counts them.</summary>
    public static int CountOpenBlocking(string? json) =>
        ParseArray(json)?.OfType<JsonObject>().Count(IsOpenBlocking) ?? 0;

    private static JsonObject MergeSameIssue(JsonObject recorded, JsonObject incoming)
    {
        var merged = (JsonObject)incoming.DeepClone();

        // Provenance is the server's, never the client's.
        merged.Remove(CreatedByUserIdKey);
        if (recorded[CreatedByUserIdKey] is { } creator) merged[CreatedByUserIdKey] = creator.DeepClone();

        // A resolution recorded on the server (e.g. by a PM while the phone was offline) is kept.
        if (IsResolved(recorded) && !IsResolved(merged))
        {
            foreach (var key in ResolutionKeys)
            {
                merged.Remove(key);
                if (recorded[key] is { } value) merged[key] = value.DeepClone();
            }
        }

        UnionArray(merged, recorded, "comments", byId: true);
        UnionArray(merged, recorded, "reportMedia", byId: false);
        UnionArray(merged, recorded, "resolutionMedia", byId: false);
        return merged;
    }

    /// <summary>recorded items first, then the incoming ones not already present (by id, else by value).</summary>
    private static void UnionArray(JsonObject merged, JsonObject recorded, string key, bool byId)
    {
        if (recorded[key] is not JsonArray recordedItems || recordedItems.Count == 0) return;
        var incomingItems = merged[key] as JsonArray ?? new JsonArray();
        var combined = new JsonArray();
        var keys = new HashSet<string>(StringComparer.Ordinal);
        string KeyOf(JsonNode? n) =>
            byId && n is JsonObject o && IdOf(o) is { } id ? "id:" + id : "v:" + (n?.ToJsonString() ?? "null");
        foreach (var item in recordedItems)
        {
            if (keys.Add(KeyOf(item))) combined.Add(item?.DeepClone());
        }
        foreach (var item in incomingItems)
        {
            if (keys.Add(KeyOf(item))) combined.Add(item?.DeepClone());
        }
        merged[key] = combined;
    }

    private static JsonArray? ParseArray(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new JsonArray();
        try
        {
            return JsonNode.Parse(json) as JsonArray;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string? IdOf(JsonObject o) => Str(o, "id") is { Length: > 0 } id ? id : null;

    private static string? Str(JsonObject o, string key) =>
        o[key] is JsonValue v && v.TryGetValue<string>(out var s) ? s : null;

    private static bool Flag(JsonObject o, string key) =>
        o[key] is JsonValue v && v.TryGetValue<bool>(out var b) && b;

    private static bool IsBlocking(JsonObject o) => Flag(o, "isBlocking");
    private static bool IsResolved(JsonObject o) => Flag(o, "resolved");
    private static bool IsOpenBlocking(JsonObject o) => IsBlocking(o) && !IsResolved(o);
}
