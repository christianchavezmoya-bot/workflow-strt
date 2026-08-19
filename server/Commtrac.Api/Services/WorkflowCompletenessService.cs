using System.Text.Json;
using System.Text.Json.Serialization;

namespace Commtrac.Api.Services;

/// <summary>
/// Validates workflow step results against the frozen snapshot (photos, videos, required inputs).
/// Mirrors client <c>workflowCompleteness.ts</c>.
/// </summary>
public sealed class WorkflowCompletenessService
{
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private static readonly HashSet<string> ImportOnlyKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "value", "unit", "pass", "label", "notes",
    };

    public IReadOnlyList<string> GetMissingRequiredMediaLabels(string? workflowSnapshotJson, string? stepResultsJson)
    {
        var missing = new List<string>();
        var stepsById = ParseWorkflowSteps(workflowSnapshotJson)
            .Where(step => !string.IsNullOrWhiteSpace(step.Id))
            .ToDictionary(step => step.Id, step => step, StringComparer.OrdinalIgnoreCase);

        if (stepsById.Count == 0 || string.IsNullOrWhiteSpace(stepResultsJson))
            return missing;

        try
        {
            var results = JsonSerializer.Deserialize<List<WorkflowStepResultSummary>>(stepResultsJson, Json) ?? [];
            var visitedStepIds = GetVisitedStepIds(results);
            var resultStepIds = results
                .Where(r => !string.Equals(r.StepId, "__nav__", StringComparison.OrdinalIgnoreCase))
                .Select(r => r.StepId)
                .Where(stepId => !string.IsNullOrWhiteSpace(stepId))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            foreach (var result in results.Where(r => !string.Equals(r.StepId, "__nav__", StringComparison.OrdinalIgnoreCase)))
            {
                if (string.IsNullOrWhiteSpace(result.StepId) || !stepsById.TryGetValue(result.StepId, out var step))
                    continue;

                var values = result.Values ?? new Dictionary<string, string>();
                if (IsImportedStepResult(values, step.Inputs))
                    continue;

                foreach (var input in step.Inputs ?? [])
                {
                    if (!IsRequiredMediaInput(input)) continue;

                    var raw = values.GetValueOrDefault(input.Id);
                    if (GetMediaCaptureCount(raw) <= 0)
                    {
                        missing.Add(input.Label ?? input.Id);
                    }
                }
            }

            foreach (var stepId in visitedStepIds)
            {
                if (string.IsNullOrWhiteSpace(stepId) || resultStepIds.Contains(stepId) || !stepsById.TryGetValue(stepId, out var step))
                    continue;

                foreach (var input in step.Inputs ?? [])
                {
                    if (!IsRequiredMediaInput(input)) continue;
                    missing.Add(input.Label ?? input.Id);
                }
            }
        }
        catch
        {
            // Treat parse failures as no missing labels — other validators will catch bad payloads.
        }

        return missing;
    }

    /// <summary>
    /// Media the author marked Required. A snapshot written before the flag was honored has
    /// no "required" property at all; those are treated as required so an older run's
    /// evidence rules are never silently relaxed.
    /// </summary>
    private static bool IsRequiredMediaInput(WorkflowInputSummary input)
    {
        var isMedia = string.Equals(input.Type, "photo", StringComparison.OrdinalIgnoreCase)
            || string.Equals(input.Type, "video", StringComparison.OrdinalIgnoreCase);
        return isMedia && (input.Required ?? true);
    }

    private static bool IsImportedStepResult(Dictionary<string, string> values, List<WorkflowInputSummary>? inputDefs)
    {
        if (inputDefs is null || inputDefs.Count == 0 || values.Count == 0)
            return false;
        var allImportKeys = values.Keys.All(k => ImportOnlyKeys.Contains(k));
        var noInputMatched = !inputDefs.Any(inp => values.ContainsKey(inp.Id));
        return allImportKeys && noInputMatched;
    }

    private static int GetMediaCaptureCount(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return 0;
        if (raw.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase)
            || raw.StartsWith("data:video/", StringComparison.OrdinalIgnoreCase)
            || raw.Contains("/storage/", StringComparison.OrdinalIgnoreCase)
            || raw.Contains(".jpg", StringComparison.OrdinalIgnoreCase)
            || raw.Contains(".png", StringComparison.OrdinalIgnoreCase))
        {
            return 1;
        }

        try
        {
            var parsed = JsonSerializer.Deserialize<List<string>>(raw, Json) ?? [];
            return parsed.Count(value => !string.IsNullOrWhiteSpace(value));
        }
        catch
        {
            return 0;
        }
    }

    private static HashSet<string> GetVisitedStepIds(List<WorkflowStepResultSummary> results)
    {
        var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var result in results)
        {
            if (string.IsNullOrWhiteSpace(result.StepId)) continue;
            if (!string.Equals(result.StepId, "__nav__", StringComparison.OrdinalIgnoreCase))
            {
                visited.Add(result.StepId);
                continue;
            }

            if (result.Values is null) continue;
            if (result.Values.TryGetValue("currentStepId", out var currentStepId) && !string.IsNullOrWhiteSpace(currentStepId))
                visited.Add(currentStepId);

            if (!result.Values.TryGetValue("historyJson", out var historyJson) || string.IsNullOrWhiteSpace(historyJson))
                continue;

            try
            {
                var history = JsonSerializer.Deserialize<List<string>>(historyJson, Json) ?? [];
                foreach (var stepId in history.Where(stepId => !string.IsNullOrWhiteSpace(stepId)))
                    visited.Add(stepId);
            }
            catch
            {
                // Ignore malformed navigation history.
            }
        }

        return visited;
    }

    private static List<WorkflowStepSummary> ParseWorkflowSteps(string? workflowSnapshotJson)
    {
        if (string.IsNullOrWhiteSpace(workflowSnapshotJson)) return [];

        try
        {
            using var snapshotDoc = JsonDocument.Parse(workflowSnapshotJson);
            if (!snapshotDoc.RootElement.TryGetProperty("stepsJson", out var stepsJsonEl))
                return [];

            var stepsRaw = stepsJsonEl.GetString();
            if (string.IsNullOrWhiteSpace(stepsRaw)) return [];

            using var stepsDoc = JsonDocument.Parse(stepsRaw);
            if (stepsDoc.RootElement.ValueKind == JsonValueKind.Array)
                return JsonSerializer.Deserialize<List<WorkflowStepSummary>>(stepsDoc.RootElement.GetRawText(), Json) ?? [];

            if (stepsDoc.RootElement.ValueKind == JsonValueKind.Object
                && stepsDoc.RootElement.TryGetProperty("steps", out var stepsEl)
                && stepsEl.ValueKind == JsonValueKind.Array)
            {
                return JsonSerializer.Deserialize<List<WorkflowStepSummary>>(stepsEl.GetRawText(), Json) ?? [];
            }
        }
        catch { }

        return [];
    }

    private sealed class WorkflowStepSummary
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;
        [JsonPropertyName("inputs")]
        public List<WorkflowInputSummary>? Inputs { get; set; }
    }

    private sealed class WorkflowInputSummary
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;
        [JsonPropertyName("type")]
        public string Type { get; set; } = string.Empty;
        [JsonPropertyName("label")]
        public string? Label { get; set; }
        /// <summary>Null when the snapshot predates the flag being enforced — see IsRequiredMediaInput.</summary>
        [JsonPropertyName("required")]
        public bool? Required { get; set; }
    }

    private sealed class WorkflowStepResultSummary
    {
        [JsonPropertyName("stepId")]
        public string StepId { get; set; } = string.Empty;
        [JsonPropertyName("values")]
        public Dictionary<string, string>? Values { get; set; }
    }
}
