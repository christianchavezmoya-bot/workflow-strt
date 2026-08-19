using Commtrac.Api.Models;

namespace Commtrac.Api.Services;

/// <summary>
/// Shared rules for project workflow type selection, legacy WorkflowMode derivation,
/// and resolving a config's effective workflow type id.
/// </summary>
public static class WorkflowTypeRules
{
    public static bool IsInspectionType(WorkflowTypeEntity? type)
    {
        if (type is null) return false;
        return type.Name.Contains("inspection", StringComparison.OrdinalIgnoreCase)
            || type.Id.Contains("inspection", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Derives legacy WorkflowMode from a single catalog workflow type.
    /// Inspection → INSPECTION_ONLY; all other types → INSTALLATION_ONLY (install-style UI).
    /// </summary>
    public static string DeriveWorkflowMode(WorkflowTypeEntity type) =>
        IsInspectionType(type) ? "INSPECTION_ONLY" : "INSTALLATION_ONLY";

    public static bool IsInstallationProjectMode(string workflowMode) =>
        workflowMode is "INSTALLATION_ONLY" or "MIXED";

    /// <summary>Backfill WorkflowTypeId from legacy WorkflowMode (not for MIXED).</summary>
    public static string? DefaultTypeIdForLegacyMode(string? workflowMode) =>
        workflowMode switch
        {
            "INSPECTION_ONLY" => "wftype-inspection",
            "MIXED" => null,
            _ => "wftype-installation",
        };

    public static string? ResolveConfigWorkflowTypeId(
        WorkflowConfigEntity config,
        IEnumerable<WorkflowTypeEntity> types)
    {
        if (!string.IsNullOrWhiteSpace(config.WorkflowTypeId))
            return config.WorkflowTypeId;

        var configType = config.ConfigType?.Trim();
        if (string.IsNullOrEmpty(configType)) return null;

        return types.FirstOrDefault(t =>
                string.Equals(t.Name.Trim(), configType, StringComparison.OrdinalIgnoreCase))
            ?.Id;
    }

    public static bool AssignmentAllowedForProject(
        string? projectWorkflowTypeId,
        string? projectWorkflowMode,
        string effectiveConfigTypeId)
    {
        if (string.IsNullOrWhiteSpace(projectWorkflowTypeId))
        {
            // Legacy MIXED — keep existing behaviour until PM picks a single type.
            return string.Equals(projectWorkflowMode, "MIXED", StringComparison.OrdinalIgnoreCase);
        }

        return string.Equals(projectWorkflowTypeId, effectiveConfigTypeId, StringComparison.Ordinal);
    }
}
