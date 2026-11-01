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
///   - a user connected to that specific work: the asset's assigned user, the run's technician,
///     the project's manager, or a project team member. This keeps the field flow working
///     (the installer who completes a run is offered "Close without customer signature").
/// Anyone else — e.g. an Installer on an unrelated project — is refused.
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

    public static bool IsAllowed(ClaimsPrincipal user, ProjectAssetEntity? asset, ProjectEntity? project, AssetWorkflowRunEntity? run)
    {
        if (user.IsInRole("Admin") || user.IsInRole("Project Manager")) return true;

        var id = ActorId(user);
        if (string.IsNullOrWhiteSpace(id)) return false;
        if (asset is not null && asset.AssignedUserId == id) return true;
        if (run is not null && run.TechnicianUserId == id) return true;
        if (project is null) return false;
        if (project.ProjectManager == id) return true;
        return TeamMemberIds(project).Contains(id);
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
