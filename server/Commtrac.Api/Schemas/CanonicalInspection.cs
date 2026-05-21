using System.Text.Json.Serialization;

namespace Commtrac.Api.Schemas;

/// <summary>
/// Canonical form for an inspection result imported into Commtrac.
/// All external adapters must produce this structure before the import is stored.
/// InspectionDate is the only required field; all others are optional.
/// </summary>
public sealed class CanonicalInspection
{
    /// <summary>ISO 8601 date or datetime e.g. "2026-05-20" or "2026-05-20T14:30:00Z". Required.</summary>
    [JsonPropertyName("inspectionDate")]
    public string InspectionDate { get; set; } = string.Empty;

    /// <summary>Full name of the technician or inspector who performed the inspection.</summary>
    [JsonPropertyName("technicianName")]
    public string? TechnicianName { get; set; }

    /// <summary>Asset tag or identifier — used for cross-validation when assigning to an asset.</summary>
    [JsonPropertyName("assetTag")]
    public string? AssetTag { get; set; }

    /// <summary>Overall inspection notes or summary.</summary>
    [JsonPropertyName("notes")]
    public string? Notes { get; set; }

    /// <summary>Individual check/measurement results. Maps to workflow step results.</summary>
    [JsonPropertyName("results")]
    public List<CanonicalCheckResult> Results { get; set; } = new();
}

/// <summary>
/// One inspection check or measurement result.
/// CheckId should match the corresponding workflow step ID when wiring to a run.
/// </summary>
public sealed class CanonicalCheckResult
{
    /// <summary>Identifier for this check. Matches the workflow step ID when wiring to a run. Required.</summary>
    [JsonPropertyName("checkId")]
    public string CheckId { get; set; } = string.Empty;

    /// <summary>Human-readable label e.g. "Insulation Resistance Test".</summary>
    [JsonPropertyName("label")]
    public string? Label { get; set; }

    /// <summary>Measured or observed value as a string e.g. "500", "PASS", "23.4".</summary>
    [JsonPropertyName("value")]
    public string? Value { get; set; }

    /// <summary>Unit of measurement e.g. "MOhm", "V", "A", "°C".</summary>
    [JsonPropertyName("unit")]
    public string? Unit { get; set; }

    /// <summary>True = passed, False = failed, null = not applicable / informational.</summary>
    [JsonPropertyName("pass")]
    public bool? Pass { get; set; }

    /// <summary>Per-check notes or observations.</summary>
    [JsonPropertyName("notes")]
    public string? Notes { get; set; }
}
