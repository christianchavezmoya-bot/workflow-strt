using System.Text.Json;
using System.Text.Json.Nodes;
using Commtrac.Api.Schemas;

namespace Commtrac.Api.Services;

public interface IInspectionImportAdapterService
{
    /// <summary>
    /// Transforms raw JSON from the given source into canonical inspection format.
    /// Returns the original JSON unchanged when the source is already canonical.
    /// </summary>
    string Adapt(string rawJson, string source);
}

public sealed class InspectionImportAdapterService : IInspectionImportAdapterService
{
    private static readonly JsonSerializerOptions _write = new() { WriteIndented = false };

    // Sources that are already in canonical format — passthrough only.
    private static readonly HashSet<string> _passthroughSources = new(StringComparer.OrdinalIgnoreCase)
    {
        "manual", "disk", "onedrive", "email", "commtrac-native", "api",
    };

    // Top-level field aliases used by the generic-kv adapter.
    private static readonly HashSet<string> _dateAliases = new(StringComparer.OrdinalIgnoreCase)
        { "date", "inspection_date", "inspectiondate", "inspectedat", "inspected_at", "test_date", "testdate" };

    private static readonly HashSet<string> _technicianAliases = new(StringComparer.OrdinalIgnoreCase)
        { "technician", "technician_name", "technicianname", "inspector", "operator", "performed_by", "performedby" };

    private static readonly HashSet<string> _assetAliases = new(StringComparer.OrdinalIgnoreCase)
        { "asset", "asset_tag", "assettag", "asset_id", "assetid", "equipment_id", "equipmentid", "tag" };

    private static readonly HashSet<string> _notesAliases = new(StringComparer.OrdinalIgnoreCase)
        { "notes", "summary", "comments", "remarks", "description", "overall_notes" };

    public string Adapt(string rawJson, string source)
    {
        if (string.IsNullOrWhiteSpace(rawJson))
            return rawJson;

        if (_passthroughSources.Contains(source))
            return rawJson;

        return source.ToLowerInvariant() switch
        {
            "generic-kv" => AdaptGenericKeyValue(rawJson),
            _ => rawJson, // unknown source — pass through unchanged
        };
    }

    /// <summary>
    /// Adapts a flat key-value JSON object into canonical inspection format.
    /// Reserved keys (date, technician, asset, notes aliases) map to top-level fields.
    /// All other keys become entries in results[].
    /// If the JSON is already in canonical format (has inspectionDate + results array), passes through unchanged.
    /// </summary>
    private static string AdaptGenericKeyValue(string rawJson)
    {
        JsonNode? root;
        try { root = JsonNode.Parse(rawJson); }
        catch { return rawJson; }

        if (root is not JsonObject obj)
            return rawJson;

        // Already canonical — has inspectionDate and results is a proper array, not a string
        if (obj.ContainsKey("inspectionDate") && obj["results"] is JsonArray)
            return rawJson;

        var canonical = new CanonicalInspection();
        var results = new List<CanonicalCheckResult>();

        foreach (var (key, node) in obj)
        {
            var strVal = node?.ToString() ?? string.Empty;

            if (_dateAliases.Contains(key))
            {
                canonical.InspectionDate = strVal;
            }
            else if (_technicianAliases.Contains(key))
            {
                canonical.TechnicianName = strVal;
            }
            else if (_assetAliases.Contains(key))
            {
                canonical.AssetTag = strVal;
            }
            else if (_notesAliases.Contains(key))
            {
                canonical.Notes = strVal;
            }
            else
            {
                // Normalise key: replace spaces/hyphens/underscores with hyphens, lowercase
                var checkId = key.Trim().ToLowerInvariant().Replace(' ', '-').Replace('_', '-');
                var label = ToTitleCase(key);

                bool? pass = null;
                if (string.Equals(strVal, "PASS", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(strVal, "true", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(strVal, "ok", StringComparison.OrdinalIgnoreCase))
                {
                    pass = true;
                }
                else if (string.Equals(strVal, "FAIL", StringComparison.OrdinalIgnoreCase) ||
                         string.Equals(strVal, "false", StringComparison.OrdinalIgnoreCase) ||
                         string.Equals(strVal, "NG", StringComparison.OrdinalIgnoreCase))
                {
                    pass = false;
                }

                results.Add(new CanonicalCheckResult
                {
                    CheckId = checkId,
                    Label = label,
                    Value = strVal,
                    Pass = pass,
                });
            }
        }

        canonical.Results = results;
        return JsonSerializer.Serialize(canonical, _write);
    }

    private static string ToTitleCase(string key)
    {
        var words = key.Replace('_', ' ').Replace('-', ' ').Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return string.Join(' ', words.Select(w => char.ToUpperInvariant(w[0]) + w[1..]));
    }
}
