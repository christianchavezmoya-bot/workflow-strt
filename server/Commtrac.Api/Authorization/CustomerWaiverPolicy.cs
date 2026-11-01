using System.Security.Claims;
using System.Text.Json;
using Commtrac.Api.Data;
using Commtrac.Api.Models;

namespace Commtrac.Api.Authorization;

/// <summary>
/// Who may close a run with the customer signature waived (run.SignatureStatus = "WaivedCustomer").
///
/// A waiver is a customer-facing sign-off decision, so it is limited to:
///   - Admin and Project Manager (the roles that already manage sign-off: e-sign links and paper
///     completion are [Authorize(Roles = "Admin,Project Manager")]), or
///   - a member of that project's team, or the user named as its project manager. Both are set
///     only through Admin/PM-restricted endpoints (POST/PUT api/projects) or admin-only backup
///     recovery, so a user cannot grant them to themselves.
///
/// Deliberately NOT sufficient on their own, because a non-privileged user can set them:
///   - the asset's AssignedUserId (PATCH api/project-assets/{id}/assignment lets any user take
///     an asset over by assigning it to themselves; POST api/asset-workflow-assignments
///     auto-assigns an unassigned asset to the caller);
///   - the run's TechnicianUserId (taken from the client in POST api/asset-workflow-runs).
///
/// A waiver also requires a live asset and project: a missing or soft-deleted asset or project,
/// or a run whose asset belongs to another project, is refused for every role (no override).
/// </summary>
public static class CustomerWaiverPolicy
{
    public const string WaivedAction = "customer_signature_waived";
    public const string DeniedAction = "customer_signature_waive_denied";

    public static string? ActorId(ClaimsPrincipal user) =>
        user.FindFirst("sub")?.Value
        ?? user.FindFirst("nameid")?.Value
        ?? user.FindFirst(ClaimTypes.NameIdentifier)?.Value;

    private static string ActorEmail(ClaimsPrincipal user) =>
        user.FindFirst("email")?.Value ?? user.FindFirst(ClaimTypes.Email)?.Value ?? "unknown";

    public static bool IsPrivileged(ClaimsPrincipal user) => user.IsInRole("Admin") || user.IsInRole("Project Manager");

    /// <summary>True when the asset and project exist, are not deleted and belong together.</summary>
    public static bool HasLiveRelationship(ProjectAssetEntity? asset, ProjectEntity? project) =>
        asset is not null && project is not null && !asset.IsDeleted && !project.IsDeleted && asset.ProjectId == project.Id;

    public static bool IsAllowed(ClaimsPrincipal user, ProjectAssetEntity? asset, ProjectEntity? project)
    {
        if (!HasLiveRelationship(asset, project)) return false;
        if (IsPrivileged(user)) return true;

        var id = ActorId(user);
        if (string.IsNullOrWhiteSpace(id)) return false;
        return string.Equals(project!.ProjectManager, id, StringComparison.Ordinal) || TeamMemberIds(project).Contains(id);
    }

    private static HashSet<string> TeamMemberIds(ProjectEntity project)
    {
        try
        {
            return JsonSerializer.Deserialize<List<string>>(project.TeamMemberIdsJson ?? "[]")?
                .Where(x => !string.IsNullOrWhiteSpace(x)).ToHashSet() ?? new HashSet<string>();
        }
        catch (JsonException)
        {
            return new HashSet<string>();
        }
    }

    /// <summary>Adds (does not save) an audit row: actor, timestamp (UTC, set by the entity), what and why.</summary>
    public static void Audit(AppDbContext db, ClaimsPrincipal user, string action, AssetWorkflowRunEntity? run,
        ProjectAssetEntity? asset, ProjectEntity? project, string via, string? reason, string? ipAddress)
    {
        var details = $"via={via}; run={run?.Id ?? "-"}; asset={asset?.AssetTag ?? asset?.Id ?? "-"}; " +
                      $"project={project?.JobNumber ?? project?.Id ?? "-"}; " +
                      $"reason={(string.IsNullOrWhiteSpace(reason) ? "(none given)" : reason.Trim())}";
        db.AuditLogs.Add(new AuditLogEntity
        {
            UserId = Truncate(ActorId(user) ?? "unknown", 80),
            UserEmail = Truncate(ActorEmail(user), 200),
            Action = action,
            Details = Truncate(details, 500),
            IpAddress = ipAddress is null ? null : Truncate(ipAddress, 80),
        });
    }

    private static string Truncate(string value, int max) => value.Length <= max ? value : value[..max];
}
