using System.Security.Claims;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Services;

public interface IUserContextService
{
    string? UserId { get; }
    string? Role { get; }
    bool IsAdmin { get; }
}

public interface IViewOnlyContextService
{
    bool IsViewOnly();
}

public interface IAccessScopeService
{
    Task<HashSet<string>> GetVisibleProjectIdsAsync(ClaimsPrincipal principal, bool includeDeleted = false);
    Task<HashSet<string>> GetOwnedPmProjectIdsAsync(ClaimsPrincipal principal, bool includeDeleted = false);
    Task<HashSet<string>> GetParticipantProjectIdsAsync(ClaimsPrincipal principal, bool includeDeleted = false);
    Task<HashSet<string>> GetScopedProjectIdsAsync(ClaimsPrincipal principal, string? scope, bool includeDeleted = false);
    Task<bool> CanViewProjectAsync(ClaimsPrincipal principal, string projectId, bool includeDeleted = false);
    Task<bool> CanParticipateInProjectAsync(ClaimsPrincipal principal, string projectId, bool includeDeleted = false);
}

public interface IProjectAuthorizationService
{
    Task<bool> CanEditProjectAsync(ClaimsPrincipal principal, ProjectEntity project);
    Task<bool> CanEditProjectAsync(ClaimsPrincipal principal, string projectId, bool includeDeleted = false);
}

public interface IInstallationAuthorizationService
{
    Task<bool> CanEditInstallationAsync(ClaimsPrincipal principal, InstallationEntity installation);
    Task<bool> CanEditInstallationExecutionAsync(ClaimsPrincipal principal, InstallationEntity installation);
}

public interface IWorkflowRunAuthorizationService
{
    Task<bool> CanStartWorkflowRunAsync(ClaimsPrincipal principal, ProjectAssetEntity asset);
    Task<bool> CanMutateWorkflowRunAsync(ClaimsPrincipal principal, ProjectAssetEntity asset, AssetWorkflowRunEntity? run);
    Task<bool> CanAdministerWorkflowRunAsync(ClaimsPrincipal principal, ProjectAssetEntity asset);
}

public sealed record DocumentOwnershipResolution(
    string? ProjectId,
    string? AssetId
);

public interface IDocumentAuthorizationService
{
    Task<DocumentOwnershipResolution> ResolveOwnershipAsync(string? projectId, string? assetId, string? linkedTo);
    Task<bool> CanViewDocumentAsync(ClaimsPrincipal principal, DocumentEntity document);
    Task<bool> CanEditDocumentAsync(ClaimsPrincipal principal, DocumentEntity document);
}

public sealed class UserContextService : IUserContextService
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public UserContextService(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public string? UserId =>
        _httpContextAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? _httpContextAccessor.HttpContext?.User.FindFirst("sub")?.Value
        ?? _httpContextAccessor.HttpContext?.User.FindFirst("nameid")?.Value;

    public string? Role =>
        _httpContextAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.Role)
        ?? _httpContextAccessor.HttpContext?.User.FindFirst("role")?.Value;

    public bool IsAdmin => string.Equals(Role, "Admin", StringComparison.OrdinalIgnoreCase);
}

public sealed class ViewOnlyContextService : IViewOnlyContextService
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public ViewOnlyContextService(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public bool IsViewOnly()
    {
        var context = _httpContextAccessor.HttpContext;
        if (context is null) return false;

        if (!context.Request.Headers.TryGetValue("X-View-Only", out var values))
        {
            return false;
        }

        var raw = values.ToString().Trim();
        return raw.Equals("true", StringComparison.OrdinalIgnoreCase)
            || raw.Equals("1", StringComparison.OrdinalIgnoreCase)
            || raw.Equals("yes", StringComparison.OrdinalIgnoreCase);
    }
}

public sealed class AccessScopeService : IAccessScopeService
{
    private readonly AppDbContext _db;

    public AccessScopeService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<HashSet<string>> GetVisibleProjectIdsAsync(ClaimsPrincipal principal, bool includeDeleted = false)
    {
        var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? principal.FindFirst("sub")?.Value
            ?? principal.FindFirst("nameid")?.Value;
        var role = principal.FindFirstValue(ClaimTypes.Role) ?? principal.FindFirst("role")?.Value;

        if (string.IsNullOrWhiteSpace(userId))
        {
            return new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        }

        if (string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase))
        {
            var allIds = await ProjectsQuery(includeDeleted).Select(p => p.Id).ToListAsync();
            return new HashSet<string>(allIds, StringComparer.OrdinalIgnoreCase);
        }

        var participantIds = await GetParticipantProjectIdsInternalAsync(userId, includeDeleted);
        if (string.Equals(role, "Project Manager", StringComparison.OrdinalIgnoreCase))
        {
            var ownedIds = await ProjectsQuery(includeDeleted)
                .Where(p => p.AssignedPmUserId == userId)
                .Select(p => p.Id)
                .ToListAsync();

            participantIds.UnionWith(ownedIds);
        }

        return participantIds;
    }

    public async Task<HashSet<string>> GetOwnedPmProjectIdsAsync(ClaimsPrincipal principal, bool includeDeleted = false)
    {
        var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? principal.FindFirst("sub")?.Value
            ?? principal.FindFirst("nameid")?.Value;
        var role = principal.FindFirstValue(ClaimTypes.Role) ?? principal.FindFirst("role")?.Value;

        if (string.IsNullOrWhiteSpace(userId))
        {
            return new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        }

        if (string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase))
        {
            var allIds = await ProjectsQuery(includeDeleted).Select(p => p.Id).ToListAsync();
            return new HashSet<string>(allIds, StringComparer.OrdinalIgnoreCase);
        }

        if (!string.Equals(role, "Project Manager", StringComparison.OrdinalIgnoreCase))
        {
            return new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        }

        var ownedIds = await ProjectsQuery(includeDeleted)
            .Where(p => p.AssignedPmUserId == userId)
            .Select(p => p.Id)
            .ToListAsync();
        return new HashSet<string>(ownedIds, StringComparer.OrdinalIgnoreCase);
    }

    public async Task<HashSet<string>> GetParticipantProjectIdsAsync(ClaimsPrincipal principal, bool includeDeleted = false)
    {
        var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? principal.FindFirst("sub")?.Value
            ?? principal.FindFirst("nameid")?.Value;
        var role = principal.FindFirstValue(ClaimTypes.Role) ?? principal.FindFirst("role")?.Value;

        if (string.IsNullOrWhiteSpace(userId))
        {
            return new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        }

        if (string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase))
        {
            var allIds = await ProjectsQuery(includeDeleted).Select(p => p.Id).ToListAsync();
            return new HashSet<string>(allIds, StringComparer.OrdinalIgnoreCase);
        }

        return await GetParticipantProjectIdsInternalAsync(userId, includeDeleted);
    }

    public async Task<HashSet<string>> GetScopedProjectIdsAsync(ClaimsPrincipal principal, string? scope, bool includeDeleted = false)
    {
        return NormalizeScope(scope) switch
        {
            "pm-owned" => await GetOwnedPmProjectIdsAsync(principal, includeDeleted),
            "participant" => await GetParticipantProjectIdsAsync(principal, includeDeleted),
            _ => await GetVisibleProjectIdsAsync(principal, includeDeleted),
        };
    }

    public async Task<bool> CanViewProjectAsync(ClaimsPrincipal principal, string projectId, bool includeDeleted = false)
    {
        var visibleIds = await GetVisibleProjectIdsAsync(principal, includeDeleted);
        return visibleIds.Contains(projectId);
    }

    public async Task<bool> CanParticipateInProjectAsync(ClaimsPrincipal principal, string projectId, bool includeDeleted = false)
    {
        var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? principal.FindFirst("sub")?.Value
            ?? principal.FindFirst("nameid")?.Value;
        var role = principal.FindFirstValue(ClaimTypes.Role) ?? principal.FindFirst("role")?.Value;

        if (string.IsNullOrWhiteSpace(userId))
        {
            return false;
        }

        if (string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (string.Equals(role, "Project Manager", StringComparison.OrdinalIgnoreCase))
        {
            var ownsProject = await ProjectsQuery(includeDeleted)
                .AnyAsync(p => p.Id == projectId && p.AssignedPmUserId == userId);
            if (ownsProject) return true;
        }

        var participantIds = await GetParticipantProjectIdsInternalAsync(userId, includeDeleted);
        return participantIds.Contains(projectId);
    }

    private IQueryable<ProjectEntity> ProjectsQuery(bool includeDeleted) =>
        includeDeleted ? _db.Projects.IgnoreQueryFilters() : _db.Projects;

    private IQueryable<ProjectAssetEntity> ProjectAssetsQuery(bool includeDeleted) =>
        includeDeleted ? _db.ProjectAssets.IgnoreQueryFilters() : _db.ProjectAssets;

    private IQueryable<InstallationEntity> InstallationsQuery(bool includeDeleted) =>
        includeDeleted ? _db.Installations.IgnoreQueryFilters() : _db.Installations;

    private async Task<HashSet<string>> GetParticipantProjectIdsInternalAsync(string userId, bool includeDeleted)
    {
        var assetProjectIds = await ProjectAssetsQuery(includeDeleted)
            .Where(a => a.AssignedUserId == userId)
            .Select(a => a.ProjectId)
            .Distinct()
            .ToListAsync();

        var installationProjectIds = (await InstallationsQuery(includeDeleted)
                .Select(i => new { i.ProjectId, i.AssignedUsers })
                .ToListAsync())
            .Where(i => i.AssignedUsers.Contains(userId, StringComparer.OrdinalIgnoreCase))
            .Select(i => i.ProjectId)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var workflowProjectIds = await (
            from run in _db.AssetWorkflowRuns
            join asset in ProjectAssetsQuery(includeDeleted) on run.AssetId equals asset.Id
            where run.TechnicianUserId == userId
            select asset.ProjectId
        ).Distinct().ToListAsync();

        return new HashSet<string>(
            assetProjectIds
                .Concat(installationProjectIds)
                .Concat(workflowProjectIds),
            StringComparer.OrdinalIgnoreCase);
    }

    private static string NormalizeScope(string? scope) =>
        (scope ?? string.Empty).Trim().ToLowerInvariant();
}

public sealed class ProjectAuthorizationService : IProjectAuthorizationService
{
    private readonly AppDbContext _db;
    private readonly IViewOnlyContextService _viewOnly;

    public ProjectAuthorizationService(AppDbContext db, IViewOnlyContextService viewOnly)
    {
        _db = db;
        _viewOnly = viewOnly;
    }

    public Task<bool> CanEditProjectAsync(ClaimsPrincipal principal, ProjectEntity project)
    {
        if (_viewOnly.IsViewOnly())
        {
            return Task.FromResult(false);
        }

        var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? principal.FindFirst("sub")?.Value
            ?? principal.FindFirst("nameid")?.Value;
        var role = principal.FindFirstValue(ClaimTypes.Role) ?? principal.FindFirst("role")?.Value;

        if (string.IsNullOrWhiteSpace(userId))
        {
            return Task.FromResult(false);
        }

        if (string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase))
        {
            return Task.FromResult(true);
        }

        return Task.FromResult(
            string.Equals(role, "Project Manager", StringComparison.OrdinalIgnoreCase)
            && string.Equals(project.AssignedPmUserId, userId, StringComparison.OrdinalIgnoreCase));
    }

    public async Task<bool> CanEditProjectAsync(ClaimsPrincipal principal, string projectId, bool includeDeleted = false)
    {
        var projects = includeDeleted ? _db.Projects.IgnoreQueryFilters() : _db.Projects;
        var project = await projects.FirstOrDefaultAsync(p => p.Id == projectId);
        return project is not null && await CanEditProjectAsync(principal, project);
    }
}

public sealed class InstallationAuthorizationService : IInstallationAuthorizationService
{
    private readonly IProjectAuthorizationService _projectAuthorization;
    private readonly IUserContextService _userContext;
    private readonly IViewOnlyContextService _viewOnly;

    public InstallationAuthorizationService(
        IProjectAuthorizationService projectAuthorization,
        IUserContextService userContext,
        IViewOnlyContextService viewOnly)
    {
        _projectAuthorization = projectAuthorization;
        _userContext = userContext;
        _viewOnly = viewOnly;
    }

    public async Task<bool> CanEditInstallationAsync(ClaimsPrincipal principal, InstallationEntity installation)
    {
        if (_viewOnly.IsViewOnly())
        {
            return false;
        }

        return await _projectAuthorization.CanEditProjectAsync(principal, installation.ProjectId);
    }

    public async Task<bool> CanEditInstallationExecutionAsync(ClaimsPrincipal principal, InstallationEntity installation)
    {
        if (_viewOnly.IsViewOnly())
        {
            return false;
        }

        if (await _projectAuthorization.CanEditProjectAsync(principal, installation.ProjectId))
        {
            return true;
        }

        if (string.IsNullOrWhiteSpace(_userContext.UserId))
        {
            return false;
        }

        return installation.AssignedUsers?.Contains(_userContext.UserId, StringComparer.OrdinalIgnoreCase) == true;
    }
}

public sealed class WorkflowRunAuthorizationService : IWorkflowRunAuthorizationService
{
    private readonly IProjectAuthorizationService _projectAuthorization;
    private readonly IUserContextService _userContext;
    private readonly IViewOnlyContextService _viewOnly;

    public WorkflowRunAuthorizationService(
        IProjectAuthorizationService projectAuthorization,
        IUserContextService userContext,
        IViewOnlyContextService viewOnly)
    {
        _projectAuthorization = projectAuthorization;
        _userContext = userContext;
        _viewOnly = viewOnly;
    }

    public async Task<bool> CanStartWorkflowRunAsync(ClaimsPrincipal principal, ProjectAssetEntity asset)
    {
        if (_viewOnly.IsViewOnly())
        {
            return false;
        }

        if (await _projectAuthorization.CanEditProjectAsync(principal, asset.ProjectId))
        {
            return true;
        }

        return IsAssignedToAsset(asset, null);
    }

    public async Task<bool> CanMutateWorkflowRunAsync(ClaimsPrincipal principal, ProjectAssetEntity asset, AssetWorkflowRunEntity? run)
    {
        if (_viewOnly.IsViewOnly())
        {
            return false;
        }

        if (await _projectAuthorization.CanEditProjectAsync(principal, asset.ProjectId))
        {
            return true;
        }

        return IsAssignedToAsset(asset, run);
    }

    public async Task<bool> CanAdministerWorkflowRunAsync(ClaimsPrincipal principal, ProjectAssetEntity asset)
    {
        if (_viewOnly.IsViewOnly())
        {
            return false;
        }

        return await _projectAuthorization.CanEditProjectAsync(principal, asset.ProjectId);
    }

    private bool IsAssignedToAsset(ProjectAssetEntity asset, AssetWorkflowRunEntity? run)
    {
        var userId = _userContext.UserId;
        if (string.IsNullOrWhiteSpace(userId))
        {
            return false;
        }

        if (string.Equals(asset.AssignedUserId, userId, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return run is not null && string.Equals(run.TechnicianUserId, userId, StringComparison.OrdinalIgnoreCase);
    }
}

public sealed class DocumentAuthorizationService : IDocumentAuthorizationService
{
    private readonly AppDbContext _db;
    private readonly IAccessScopeService _accessScope;
    private readonly IProjectAuthorizationService _projectAuthorization;
    private readonly IViewOnlyContextService _viewOnly;

    public DocumentAuthorizationService(
        AppDbContext db,
        IAccessScopeService accessScope,
        IProjectAuthorizationService projectAuthorization,
        IViewOnlyContextService viewOnly)
    {
        _db = db;
        _accessScope = accessScope;
        _projectAuthorization = projectAuthorization;
        _viewOnly = viewOnly;
    }

    public async Task<DocumentOwnershipResolution> ResolveOwnershipAsync(string? projectId, string? assetId, string? linkedTo)
    {
        if (!string.IsNullOrWhiteSpace(assetId))
        {
            var asset = await _db.ProjectAssets.IgnoreQueryFilters().FirstOrDefaultAsync(a => a.Id == assetId);
            if (asset is not null)
            {
                return new DocumentOwnershipResolution(asset.ProjectId, asset.Id);
            }
        }

        if (!string.IsNullOrWhiteSpace(projectId))
        {
            var projectExists = await _db.Projects.IgnoreQueryFilters().AnyAsync(p => p.Id == projectId);
            if (projectExists)
            {
                return new DocumentOwnershipResolution(projectId, null);
            }
        }

        if (string.IsNullOrWhiteSpace(linkedTo))
        {
            return new DocumentOwnershipResolution(null, null);
        }

        var linkedAsset = await _db.ProjectAssets.IgnoreQueryFilters().FirstOrDefaultAsync(a => a.Id == linkedTo);
        if (linkedAsset is not null)
        {
            return new DocumentOwnershipResolution(linkedAsset.ProjectId, linkedAsset.Id);
        }

        var linkedProject = await _db.Projects.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.Id == linkedTo);
        if (linkedProject is not null)
        {
            return new DocumentOwnershipResolution(linkedProject.Id, null);
        }

        var linkedInstallation = await _db.Installations.IgnoreQueryFilters().FirstOrDefaultAsync(i => i.Id == linkedTo);
        if (linkedInstallation is not null)
        {
            return new DocumentOwnershipResolution(linkedInstallation.ProjectId, null);
        }

        var linkedIssueProjectId = await (
            from issue in _db.Issues
            join installation in _db.Installations.IgnoreQueryFilters() on issue.InstallationId equals installation.Id
            where issue.Id == linkedTo
            select installation.ProjectId
        ).FirstOrDefaultAsync();

        return string.IsNullOrWhiteSpace(linkedIssueProjectId)
            ? new DocumentOwnershipResolution(null, null)
            : new DocumentOwnershipResolution(linkedIssueProjectId, null);
    }

    public async Task<bool> CanViewDocumentAsync(ClaimsPrincipal principal, DocumentEntity document)
    {
        if (IsAdmin(principal))
        {
            return true;
        }

        if (document.IsLegacyUnclassified)
        {
            return false;
        }

        var scope = NormalizeDocumentScope(document);
        if (string.Equals(scope, "Global", StringComparison.OrdinalIgnoreCase))
        {
            return principal.Identity?.IsAuthenticated == true;
        }

        if (!string.IsNullOrWhiteSpace(document.ProjectId))
        {
            return await _accessScope.CanViewProjectAsync(principal, document.ProjectId);
        }

        var userId = GetUserId(principal);
        return !string.IsNullOrWhiteSpace(userId)
            && string.Equals(document.CreatedByUserId, userId, StringComparison.OrdinalIgnoreCase);
    }

    public async Task<bool> CanEditDocumentAsync(ClaimsPrincipal principal, DocumentEntity document)
    {
        if (_viewOnly.IsViewOnly())
        {
            return false;
        }

        if (IsAdmin(principal))
        {
            return true;
        }

        if (document.IsLegacyUnclassified)
        {
            return false;
        }

        var scope = NormalizeDocumentScope(document);
        if (string.Equals(scope, "Global", StringComparison.OrdinalIgnoreCase))
        {
            var role = principal.FindFirstValue(ClaimTypes.Role) ?? principal.FindFirst("role")?.Value;
            return string.Equals(role, "Project Manager", StringComparison.OrdinalIgnoreCase);
        }

        if (!string.IsNullOrWhiteSpace(document.ProjectId))
        {
            return await _projectAuthorization.CanEditProjectAsync(principal, document.ProjectId);
        }

        var userId = GetUserId(principal);
        return !string.IsNullOrWhiteSpace(userId)
            && string.Equals(document.CreatedByUserId, userId, StringComparison.OrdinalIgnoreCase);
    }

    private static string NormalizeDocumentScope(DocumentEntity document)
    {
        if (document.IsLegacyUnclassified)
        {
            return "Legacy";
        }

        if (!string.IsNullOrWhiteSpace(document.AssetId))
        {
            return "Asset";
        }

        if (!string.IsNullOrWhiteSpace(document.ProjectId))
        {
            return "Project";
        }

        return string.IsNullOrWhiteSpace(document.VisibilityScope)
            ? "Global"
            : document.VisibilityScope;
    }

    private static bool IsAdmin(ClaimsPrincipal principal) =>
        string.Equals(principal.FindFirstValue(ClaimTypes.Role) ?? principal.FindFirst("role")?.Value, "Admin", StringComparison.OrdinalIgnoreCase);

    private static string? GetUserId(ClaimsPrincipal principal) =>
        principal.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? principal.FindFirst("sub")?.Value
        ?? principal.FindFirst("nameid")?.Value;
}
