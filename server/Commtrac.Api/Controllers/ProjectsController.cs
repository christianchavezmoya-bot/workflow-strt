using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/projects")]
[Authorize]
public class ProjectsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AuditLogService _audit;
    private readonly IAccessScopeService _accessScope;
    private readonly IProjectAuthorizationService _projectAuthorization;
    private readonly IUserContextService _userContext;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public ProjectsController(
        AppDbContext db,
        AuditLogService audit,
        IAccessScopeService accessScope,
        IProjectAuthorizationService projectAuthorization,
        IUserContextService userContext)
    {
        _db = db;
        _audit = audit;
        _accessScope = accessScope;
        _projectAuthorization = projectAuthorization;
        _userContext = userContext;
    }

    [HttpGet]
    public async Task<ActionResult<ProjectListResponse>> GetAll(
        [FromQuery] string? scope,
        [FromQuery] string? ownershipScope,
        [FromQuery] string? projectNumber,
        [FromQuery] string? country,
        [FromQuery] string? office,
        [FromQuery] string? status,
        [FromQuery] string? type,
        [FromQuery] string? search,
        [FromQuery] string? sortBy,
        [FromQuery] string? sortDir,
        [FromQuery] int? page,
        [FromQuery] int? pageSize,
        [FromQuery] bool includeDeleted = false
    )
    {
        var query = includeDeleted
            ? _db.Projects.IgnoreQueryFilters().AsQueryable()
            : _db.Projects.AsQueryable();
        var normalizedScope = (scope ?? string.Empty).Trim().ToLowerInvariant();
        var browseScope = normalizedScope == "browse";
        if (!browseScope)
        {
            var scopedProjectIds = await _accessScope.GetScopedProjectIdsAsync(User, normalizedScope, includeDeleted);
            query = query.Where(p => scopedProjectIds.Contains(p.Id));
        }

        var mineOnly = string.Equals(ownershipScope, "mine", StringComparison.OrdinalIgnoreCase);
        if (mineOnly && string.Equals(_userContext.Role, "Project Manager", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(p => p.AssignedPmUserId == _userContext.UserId);
        }

        if (!string.IsNullOrWhiteSpace(projectNumber))
        {
            query = query.Where(p => p.JobNumber.Contains(projectNumber));
        }

        if (!string.IsNullOrWhiteSpace(country) && country != "All")
        {
            static List<string> Aliases(string input)
            {
                var c = input.Trim();
                var low = c.ToLowerInvariant();
                if (new[] { "usa", "us", "u.s.", "united states", "united states of america" }.Contains(low))
                {
                    return new List<string> { c, "USA", "US", "U.S.", "United States", "United States of America" };
                }
                if (new[] { "uk", "u.k.", "united kingdom", "great britain", "britain" }.Contains(low))
                {
                    return new List<string> { c, "UK", "U.K.", "United Kingdom", "Great Britain", "Britain" };
                }
                if (new[] { "uae", "u.a.e.", "united arab emirates" }.Contains(low))
                {
                    return new List<string> { c, "UAE", "U.A.E.", "United Arab Emirates" };
                }
                return new List<string> { c };
            }

            // Projects with OfficeId use FK-based filtering; legacy rows fall back to Office string matching.
            var countryAliases = Aliases(country);
            var officeIdsInCountry = await _db.Offices
                .Where(o => countryAliases.Contains(o.Country))
                .Select(o => o.Id)
                .ToListAsync();
            var citiesInCountry = await _db.Offices
                .Where(o => countryAliases.Contains(o.Country))
                .Where(o => o.City != null && o.City != "")
                .Select(o => o.City!)
                .ToListAsync();

            query = query.Where(p =>
                (p.OfficeId != null && officeIdsInCountry.Contains(p.OfficeId)) ||
                (p.OfficeId == null && (countryAliases.Contains(p.Office) || citiesInCountry.Contains(p.Office))));
        }
        else if (!string.IsNullOrWhiteSpace(office) && office != "All")
        {
            query = query.Where(p => p.Office == office);
        }

        if (!string.IsNullOrWhiteSpace(status) && status != "All")
        {
            query = query.Where(p => p.Status == status);
        }

        if (!string.IsNullOrWhiteSpace(type) && type != "All")
        {
            query = query.Where(p => p.ProjectType == type);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            query = query.Where(p =>
                p.JobNumber.Contains(search) ||
                p.CustomerName.Contains(search) ||
                p.Description.Contains(search)
            );
        }

        query = (sortBy, sortDir?.ToLower()) switch
        {
            ("jobNumber", "desc") => query.OrderByDescending(p => p.JobNumber),
            ("jobNumber", _) => query.OrderBy(p => p.JobNumber),
            ("customerName", "desc") => query.OrderByDescending(p => p.CustomerName),
            ("customerName", _) => query.OrderBy(p => p.CustomerName),
            ("startDate", "desc") => query.OrderByDescending(p => p.StartDate),
            ("startDate", _) => query.OrderBy(p => p.StartDate),
            ("status", "desc") => query.OrderByDescending(p => p.Status),
            ("status", _) => query.OrderBy(p => p.Status),
            _ => query.OrderByDescending(p => p.StartDate)
        };

        var total = await query.CountAsync();
        if (page.HasValue && pageSize.HasValue && pageSize.Value > 0)
        {
            query = query.Skip((page.Value - 1) * pageSize.Value).Take(pageSize.Value);
        }

        var items = await query.ToListAsync();
        var projectIds = items.Select(p => p.Id).ToList();

        var siteIds = items.Select(p => p.SiteId).Where(id => !string.IsNullOrWhiteSpace(id)).Distinct().ToList();
        var sitesById = await _db.Sites
            .Where(s => siteIds.Contains(s.Id))
            .Select(s => new { s.Id, s.Name })
            .ToDictionaryAsync(s => s.Id, s => s.Name);

        // Count assets per (project, product) so the badge matches the installation page
        // which shows assets for the first product only.
        var assetCountsByProjectProduct = await _db.ProjectAssets
            .Where(a => projectIds.Contains(a.ProjectId))
            .GroupBy(a => new { a.ProjectId, a.ProductId })
            .Select(g => new { g.Key.ProjectId, g.Key.ProductId, Count = g.Count() })
            .ToListAsync();

        return Ok(new ProjectListResponse(items.Select(p =>
        {
            var siteName = p.SiteId != null && sitesById.TryGetValue(p.SiteId, out var name) ? name : null;
            var firstProduct = p.ProductIds?.FirstOrDefault();
            var assetCount = assetCountsByProjectProduct
                .Where(x => x.ProjectId == p.Id && (firstProduct == null || x.ProductId == firstProduct))
                .Sum(x => x.Count);
            return ToDto(p, siteName, assetCount);
        }).ToList(), total));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<ProjectDto>> GetById(string id, [FromQuery] bool includeDeleted = false, [FromQuery] string? scope = null)
    {
        var browseScope = string.Equals(scope, "browse", StringComparison.OrdinalIgnoreCase);
        if (!browseScope && !await _accessScope.CanViewProjectAsync(User, id, includeDeleted))
        {
            return NotFound();
        }

        var projects = includeDeleted ? _db.Projects.IgnoreQueryFilters() : _db.Projects;
        var project = await projects.FirstOrDefaultAsync(p => p.Id == id);
        if (project is null)
        {
            return NotFound();
        }

        string? siteName = null;
        if (!string.IsNullOrWhiteSpace(project.SiteId))
        {
            siteName = await _db.Sites
                .Where(s => s.Id == project.SiteId)
                .Select(s => s.Name)
                .FirstOrDefaultAsync();
        }

        return Ok(ToDto(project, siteName));
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<ProjectDto>> Create([FromBody] ProjectDto request)
    {
        var currentUser = await GetCurrentUserAsync();
        var workflowMode = NormalizeWorkflowMode(request.WorkflowMode, request.IsInstallationProject);
        var assignedPmUserId = await ResolveAssignedPmUserIdAsync(request.ProjectManager, request.AssignedPmUserId);
        if (!_userContext.IsAdmin)
        {
            assignedPmUserId = _userContext.UserId ?? currentUser?.Id;
        }
        else if (string.IsNullOrWhiteSpace(assignedPmUserId) && currentUser is not null && string.Equals(currentUser.Role, "Project Manager", StringComparison.OrdinalIgnoreCase))
        {
            assignedPmUserId = currentUser.Id;
        }

        var projectManagerName = await ResolveProjectManagerNameAsync(request.ProjectManager, assignedPmUserId, currentUser);
        var project = new ProjectEntity
        {
            Id = string.IsNullOrWhiteSpace(request.Id) ? Guid.NewGuid().ToString() : request.Id,
            CustomerName = request.CustomerName,
            CustomerId = request.CustomerId,
            SiteId = request.SiteId,
            JobNumber = request.JobNumber,
            PurchaseOrderNumber = request.PurchaseOrderNumber ?? string.Empty,
            Description = request.Description,
            StartDate = request.StartDate,
            FinishDate = request.FinishDate,
            Office = request.Office,
            OfficeId = request.OfficeId,
            Region = request.Region,
            ProjectType = request.ProjectType,
            Status = request.Status,
            ApprovalDecision = request.ApprovalDecision,
            WorkflowMode = workflowMode,
            IsInstallationProject = UsesInstallationWorkflow(workflowMode),
            InstallationMode = request.InstallationMode,
            ProjectManager = projectManagerName,
            AssignedPmUserId = assignedPmUserId,
            ContractValue = request.ContractValue,
            ProbabilityStage = request.ProbabilityStage,
            ProductIds = request.ProductIds ?? new List<string>(),
            ProductFeatureValuesJson = JsonSerializer.Serialize(request.ProductFeatureValues ?? new Dictionary<string, string>(), JsonOptions)
        };

        _db.Projects.Add(project);
        await _db.SaveChangesAsync();
        string? siteName = null;
        if (!string.IsNullOrWhiteSpace(project.SiteId))
        {
            siteName = await _db.Sites
                .Where(s => s.Id == project.SiteId)
                .Select(s => s.Name)
                .FirstOrDefaultAsync();
        }

        return CreatedAtAction(nameof(GetById), new { id = project.Id }, ToDto(project, siteName));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<ProjectDto>> Update(string id, [FromBody] ProjectDto request)
    {
        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == id);
        if (project is null)
        {
            return NotFound();
        }
        if (!await _projectAuthorization.CanEditProjectAsync(User, project))
        {
            return Forbid();
        }

        var currentUser = await GetCurrentUserAsync();
        var workflowMode = NormalizeWorkflowMode(request.WorkflowMode, request.IsInstallationProject);
        var assignedPmUserId = _userContext.IsAdmin
            ? await ResolveAssignedPmUserIdAsync(request.ProjectManager, request.AssignedPmUserId)
            : project.AssignedPmUserId ?? _userContext.UserId;
        if (!_userContext.IsAdmin)
        {
            assignedPmUserId = _userContext.UserId;
        }
        var projectManagerName = await ResolveProjectManagerNameAsync(request.ProjectManager, assignedPmUserId, currentUser);

        project.CustomerName = request.CustomerName;
        project.CustomerId = request.CustomerId;
        project.SiteId = request.SiteId;
        project.JobNumber = request.JobNumber;
        project.PurchaseOrderNumber = request.PurchaseOrderNumber ?? string.Empty;
        project.Description = request.Description;
        project.StartDate = request.StartDate;
        project.FinishDate = request.FinishDate;
        project.Office = request.Office;
        project.OfficeId = request.OfficeId;
        project.Region = request.Region;
        project.ProjectType = request.ProjectType;
        project.Status = request.Status;
        project.ApprovalDecision = request.ApprovalDecision;
        project.WorkflowMode = workflowMode;
        project.IsInstallationProject = UsesInstallationWorkflow(workflowMode);
        project.InstallationMode = request.InstallationMode;
        project.ProjectManager = projectManagerName;
        project.AssignedPmUserId = assignedPmUserId;
        project.ContractValue = request.ContractValue;
        project.ProbabilityStage = request.ProbabilityStage;
        project.ProductIds = request.ProductIds ?? new List<string>();
        project.ProductFeatureValuesJson = JsonSerializer.Serialize(request.ProductFeatureValues ?? new Dictionary<string, string>(), JsonOptions);

        await _db.SaveChangesAsync();
        string? siteName = null;
        if (!string.IsNullOrWhiteSpace(project.SiteId))
        {
            siteName = await _db.Sites
                .Where(s => s.Id == project.SiteId)
                .Select(s => s.Name)
                .FirstOrDefaultAsync();
        }

        return Ok(ToDto(project, siteName));
    }

    [HttpPatch("{id}/status")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<ProjectDto>> UpdateStatus(string id, [FromBody] UpdateProjectStatusRequest request)
    {
        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == id);
        if (project is null)
        {
            return NotFound();
        }
        if (!await _projectAuthorization.CanEditProjectAsync(User, project))
        {
            return Forbid();
        }

        project.Status = request.Status;
        project.ApprovalDecision = request.ApprovalDecision;
        await _db.SaveChangesAsync();

        string? siteName = null;
        if (!string.IsNullOrWhiteSpace(project.SiteId))
        {
            siteName = await _db.Sites
                .Where(s => s.Id == project.SiteId)
                .Select(s => s.Name)
                .FirstOrDefaultAsync();
        }

        return Ok(ToDto(project, siteName));
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Delete(string id)
    {
        var project = await _db.Projects
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(p => p.Id == id);
        if (project is null)
        {
            return NotFound();
        }
        if (!await _projectAuthorization.CanEditProjectAsync(User, project))
        {
            return Forbid();
        }
        if (project.IsDeleted)
        {
            return NoContent();
        }

        var deletedByUserId = User.FindFirst("sub")?.Value ?? User.FindFirst("nameid")?.Value;
        var deletedAt = DateTime.UtcNow;

        project.IsDeleted = true;
        project.DeletedAtUtc = deletedAt;
        project.DeletedByUserId = deletedByUserId;

        var installations = await _db.Installations
            .IgnoreQueryFilters()
            .Where(i => i.ProjectId == id && !i.IsDeleted)
            .ToListAsync();
        foreach (var installation in installations)
        {
            installation.IsDeleted = true;
            installation.DeletedAtUtc = deletedAt;
            installation.DeletedByUserId = deletedByUserId;
        }

        var assets = await _db.ProjectAssets
            .IgnoreQueryFilters()
            .Where(a => a.ProjectId == id && !a.IsDeleted)
            .ToListAsync();
        foreach (var asset in assets)
        {
            asset.IsDeleted = true;
            asset.DeletedAtUtc = deletedAt;
            asset.DeletedByUserId = deletedByUserId;
        }

        await _db.SaveChangesAsync();
        await _audit.LogAsync(User, HttpContext, "project_archived", $"{project.JobNumber} ({project.Id})");
        return NoContent();
    }

    [HttpPost("{id}/restore")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Restore(string id)
    {
        var project = await _db.Projects
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(p => p.Id == id);
        if (project is null)
        {
            return NotFound();
        }
        if (!await _projectAuthorization.CanEditProjectAsync(User, project))
        {
            return Forbid();
        }

        project.IsDeleted = false;
        project.DeletedAtUtc = null;
        project.DeletedByUserId = null;
        project.DeleteReason = null;

        var installations = await _db.Installations
            .IgnoreQueryFilters()
            .Where(i => i.ProjectId == id && i.IsDeleted)
            .ToListAsync();
        foreach (var installation in installations)
        {
            installation.IsDeleted = false;
            installation.DeletedAtUtc = null;
            installation.DeletedByUserId = null;
            installation.DeleteReason = null;
        }

        var assets = await _db.ProjectAssets
            .IgnoreQueryFilters()
            .Where(a => a.ProjectId == id && a.IsDeleted)
            .ToListAsync();
        foreach (var asset in assets)
        {
            asset.IsDeleted = false;
            asset.DeletedAtUtc = null;
            asset.DeletedByUserId = null;
            asset.DeleteReason = null;
        }

        await _db.SaveChangesAsync();
        await _audit.LogAsync(User, HttpContext, "project_restored", $"{project.JobNumber} ({project.Id})");
        return NoContent();
    }

    [HttpDelete("{id}/purge")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Purge(string id)
    {
        var project = await _db.Projects
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(p => p.Id == id);
        if (project is null)
        {
            return NotFound();
        }

        var installations = await _db.Installations
            .IgnoreQueryFilters()
            .Where(i => i.ProjectId == id)
            .ToListAsync();
        var installationIds = installations.Select(i => i.Id).ToList();
        if (installationIds.Count > 0)
        {
            _db.Issues.RemoveRange(_db.Issues.Where(i => installationIds.Contains(i.InstallationId)));
            var inspectionIds = await _db.Inspections
                .Where(i => installationIds.Contains(i.InstallationId))
                .Select(i => i.Id)
                .ToListAsync();
            if (inspectionIds.Count > 0)
            {
                _db.InspectionPhotos.RemoveRange(_db.InspectionPhotos.Where(p => inspectionIds.Contains(p.InspectionId)));
            }
            _db.Inspections.RemoveRange(_db.Inspections.Where(i => installationIds.Contains(i.InstallationId)));
        }
        _db.Installations.RemoveRange(installations);

        var assetIds = await _db.ProjectAssets
            .IgnoreQueryFilters()
            .Where(a => a.ProjectId == id)
            .Select(a => a.Id)
            .ToListAsync();
        if (assetIds.Count > 0)
        {
            _db.AssetWorkflowAssignments.RemoveRange(_db.AssetWorkflowAssignments.Where(a => assetIds.Contains(a.AssetId)));
            _db.AssetWorkflowRuns.RemoveRange(_db.AssetWorkflowRuns.Where(r => assetIds.Contains(r.AssetId)));
            _db.AssetDocumentLinks.RemoveRange(_db.AssetDocumentLinks.Where(l => assetIds.Contains(l.AssetId)));
            var docIds = await _db.AssetDocuments
                .Where(d => assetIds.Contains(d.AssetId))
                .Select(d => d.Id)
                .ToListAsync();
            if (docIds.Count > 0)
            {
                _db.AssetDocumentRevisions.RemoveRange(_db.AssetDocumentRevisions.Where(r => docIds.Contains(r.DocumentId)));
            }
            _db.AssetDocuments.RemoveRange(_db.AssetDocuments.Where(d => assetIds.Contains(d.AssetId)));
            var assets = await _db.ProjectAssets.IgnoreQueryFilters().Where(a => a.ProjectId == id).ToListAsync();
            _db.ProjectAssets.RemoveRange(assets);
        }

        _db.ProjectContacts.RemoveRange(_db.ProjectContacts.Where(c => c.ProjectId == id));
        _db.ProjectDeliveryProfiles.RemoveRange(_db.ProjectDeliveryProfiles.Where(d => d.ProjectId == id));
        _db.ProjectInboundItems.RemoveRange(_db.ProjectInboundItems.Where(i => i.ProjectId == id));

        _db.Projects.Remove(project);
        await _db.SaveChangesAsync();
        await _audit.LogAsync(User, HttpContext, "project_purged", $"{project.JobNumber} ({project.Id})");
        return NoContent();
    }

    /// <summary>
    /// Copies all assets (and their workflow assignments) from <paramref name="sourceId"/>
    /// into <paramref name="targetId"/>. Runs are NOT cloned — each asset starts fresh.
    /// </summary>
    [HttpPost("{targetId}/clone-assets-from/{sourceId}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<CloneAssetsResult>> CloneAssetsFrom(string targetId, string sourceId)
    {
        var targetProject = await _db.Projects.FirstOrDefaultAsync(p => p.Id == targetId);
        if (targetProject is null)
            return NotFound("Target project not found.");
        if (!await _projectAuthorization.CanEditProjectAsync(User, targetProject))
            return Forbid();
        if (!await _accessScope.CanViewProjectAsync(User, sourceId))
            return NotFound("Source project not found.");

        var sourceAssets = await _db.ProjectAssets
            .Where(a => a.ProjectId == sourceId)
            .ToListAsync();

        var oldToNew = new Dictionary<string, string>(sourceAssets.Count);

        foreach (var src in sourceAssets)
        {
            var newId = Guid.NewGuid().ToString();
            oldToNew[src.Id] = newId;
            _db.ProjectAssets.Add(new ProjectAssetEntity
            {
                Id                = newId,
                ProjectId         = targetId,
                ProductId         = src.ProductId,
                ProductConfigId   = src.ProductConfigId,
                WorkflowTemplateId = src.WorkflowTemplateId,
                AssetTag          = src.AssetTag,
                AssetName         = src.AssetName,
                SerialNumber      = src.SerialNumber,
                AssetModel        = src.AssetModel,
                Manufacturer      = src.Manufacturer,
                Location          = src.Location,
                Notes             = src.Notes,
                ConfigLabel       = src.ConfigLabel,
                FeatureValuesJson = src.FeatureValuesJson,
                Status            = "NotStarted",
                IssuesJson        = "[]",
            });
        }
        await _db.SaveChangesAsync();

        var sourceAssignments = await _db.AssetWorkflowAssignments
            .Where(a => oldToNew.Keys.Contains(a.AssetId))
            .ToListAsync();

        foreach (var asgn in sourceAssignments)
        {
            if (!oldToNew.TryGetValue(asgn.AssetId, out var newAssetId)) continue;
            _db.AssetWorkflowAssignments.Add(new AssetWorkflowAssignmentEntity
            {
                Id               = Guid.NewGuid().ToString(),
                AssetId          = newAssetId,
                WorkflowTypeId   = asgn.WorkflowTypeId,
                WorkflowConfigId = asgn.WorkflowConfigId,
                Active           = true,
            });
        }
        await _db.SaveChangesAsync();

        return Ok(new CloneAssetsResult(sourceAssets.Count, sourceAssignments.Count));
    }

    private static ProjectDto ToDto(ProjectEntity project, string? siteName, int assetCount = 0)
        => new(
            project.Id,
            project.CustomerName,
            project.CustomerId,
            project.SiteId,
            siteName,
            project.JobNumber,
            project.PurchaseOrderNumber,
            project.Description,
            project.StartDate,
            project.FinishDate,
            project.Office,
            project.Region,
            project.ProjectType,
            project.Status,
            project.ApprovalDecision,
            NormalizeWorkflowMode(project.WorkflowMode, project.IsInstallationProject),
            project.IsInstallationProject,
            project.InstallationMode,
            project.ProjectManager,
            project.AssignedPmUserId,
            project.ContractValue,
            project.ProbabilityStage,
            project.ProductIds,
            string.IsNullOrWhiteSpace(project.ProductFeatureValuesJson)
                ? new Dictionary<string, string>()
                : JsonSerializer.Deserialize<Dictionary<string, string>>(project.ProductFeatureValuesJson, JsonOptions) ?? new Dictionary<string, string>(),
            project.OfficeId,
            assetCount
        );

    private static string NormalizeWorkflowMode(string? workflowMode, bool isInstallationProject)
    {
        var normalized = (workflowMode ?? string.Empty).Trim().ToUpperInvariant();
        return normalized switch
        {
            ProjectEntity.WorkflowModeInstallationOnly => ProjectEntity.WorkflowModeInstallationOnly,
            ProjectEntity.WorkflowModeInspectionOnly => ProjectEntity.WorkflowModeInspectionOnly,
            ProjectEntity.WorkflowModeMixed => ProjectEntity.WorkflowModeMixed,
            _ => isInstallationProject
                ? ProjectEntity.WorkflowModeInstallationOnly
                : ProjectEntity.WorkflowModeInspectionOnly
        };
    }

    private static bool UsesInstallationWorkflow(string workflowMode) =>
        string.Equals(workflowMode, ProjectEntity.WorkflowModeInstallationOnly, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(workflowMode, ProjectEntity.WorkflowModeMixed, StringComparison.OrdinalIgnoreCase);

    private async Task<UserEntity?> GetCurrentUserAsync()
    {
        var userId = _userContext.UserId
            ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
            ?? User.FindFirst("sub")?.Value
            ?? User.FindFirst("nameid")?.Value;
        if (!string.IsNullOrWhiteSpace(userId))
        {
            var byId = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
            if (byId is not null)
            {
                return byId;
            }
        }

        var email = User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value;
        if (!string.IsNullOrWhiteSpace(email))
        {
            var normalizedEmail = email.Trim().ToLowerInvariant();
            var byEmail = await _db.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == normalizedEmail);
            if (byEmail is not null)
            {
                return byEmail;
            }
        }

        var fullName = User.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value;
        if (!string.IsNullOrWhiteSpace(fullName))
        {
            var normalizedName = fullName.Trim().ToLowerInvariant();
            return await _db.Users.FirstOrDefaultAsync(u => u.FullName.ToLower() == normalizedName);
        }

        return null;
    }

    private async Task<string?> ResolveAssignedPmUserIdAsync(string? projectManager, string? requestedAssignedPmUserId)
    {
        if (!string.IsNullOrWhiteSpace(requestedAssignedPmUserId))
        {
            var exists = await _db.Users.AnyAsync(u => u.Id == requestedAssignedPmUserId);
            if (exists)
            {
                return requestedAssignedPmUserId;
            }
        }

        var normalizedManager = NormalizeIdentity(projectManager);
        if (string.IsNullOrWhiteSpace(normalizedManager))
        {
            return null;
        }

        var pmMatches = await _db.Users
            .Where(u => u.Role == "Project Manager")
            .Where(u => u.FullName.ToLower() == normalizedManager || u.Email.ToLower() == normalizedManager)
            .Select(u => u.Id)
            .ToListAsync();
        if (pmMatches.Count == 1)
        {
            return pmMatches[0];
        }

        var anyMatches = await _db.Users
            .Where(u => u.FullName.ToLower() == normalizedManager || u.Email.ToLower() == normalizedManager)
            .Select(u => u.Id)
            .ToListAsync();
        return anyMatches.Count == 1 ? anyMatches[0] : null;
    }

    private async Task<string?> ResolveProjectManagerNameAsync(string? requestedName, string? assignedPmUserId, UserEntity? currentUser)
    {
        if (!string.IsNullOrWhiteSpace(assignedPmUserId))
        {
            var ownerName = await _db.Users
                .Where(u => u.Id == assignedPmUserId)
                .Select(u => u.FullName)
                .FirstOrDefaultAsync();
            if (!string.IsNullOrWhiteSpace(ownerName))
            {
                return ownerName;
            }
        }

        if (!string.IsNullOrWhiteSpace(requestedName))
        {
            return requestedName.Trim();
        }

        if (!_userContext.IsAdmin && currentUser is not null)
        {
            return currentUser.FullName;
        }

        return null;
    }

    private static string NormalizeIdentity(string? value) =>
        (value ?? string.Empty).Trim().ToLowerInvariant();
}

public record ProjectListResponse(List<ProjectDto> Items, int Total);
