using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Text.Json;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/projects")]
[Authorize]
public class ProjectsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly NotificationFeedService _feed;
    private readonly ProjectLifecycleService _projectLifecycle;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public ProjectsController(AppDbContext db, NotificationFeedService feed, ProjectLifecycleService projectLifecycle)
    {
        _db = db;
        _feed = feed;
        _projectLifecycle = projectLifecycle;
    }

    [HttpGet]
    public async Task<ActionResult<ProjectListResponse>> GetAll(
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
        foreach (var item in items)
        {
            await _projectLifecycle.SyncFromAssetsAsync(item.Id, null, null, notifyStatusChange: false);
        }
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
    public async Task<ActionResult<ProjectDto>> GetById(string id, [FromQuery] bool includeDeleted = false)
    {
        var projects = includeDeleted ? _db.Projects.IgnoreQueryFilters() : _db.Projects;
        var project = await projects.FirstOrDefaultAsync(p => p.Id == id);
        if (project is null)
        {
            return NotFound();
        }
        await _projectLifecycle.SyncFromAssetsAsync(project.Id, null, null, notifyStatusChange: false);

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
        var resolvedMode = ResolveWorkflowMode(request.WorkflowMode, request.IsInstallationProject);
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
            IsInstallationProject = resolvedMode is "INSTALLATION_ONLY" or "MIXED",
            InstallationMode = request.InstallationMode,
            WorkflowMode = resolvedMode,
            ProjectManager = request.ProjectManager,
            ContractValue = request.ContractValue,
            ProbabilityStage = request.ProbabilityStage,
            MinimumCompletionPercent = Math.Clamp(request.MinimumCompletionPercent <= 0 ? 100 : request.MinimumCompletionPercent, 1, 100),
            ProductIds = request.ProductIds ?? new List<string>(),
            ProductFeatureValuesJson = JsonSerializer.Serialize(request.ProductFeatureValues ?? new Dictionary<string, string>(), JsonOptions),
            TeamMemberIdsJson = JsonSerializer.Serialize(request.TeamMemberIds ?? new List<string>(), JsonOptions)
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

        var resolvedMode = ResolveWorkflowMode(request.WorkflowMode, request.IsInstallationProject);
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
        project.IsInstallationProject = resolvedMode is "INSTALLATION_ONLY" or "MIXED";
        project.InstallationMode = request.InstallationMode;
        project.WorkflowMode = resolvedMode;
        project.ProjectManager = request.ProjectManager;
        project.ContractValue = request.ContractValue;
        project.ProbabilityStage = request.ProbabilityStage;
        project.MinimumCompletionPercent = Math.Clamp(request.MinimumCompletionPercent <= 0 ? 100 : request.MinimumCompletionPercent, 1, 100);
        project.ProductIds = request.ProductIds ?? new List<string>();
        project.ProductFeatureValuesJson = JsonSerializer.Serialize(request.ProductFeatureValues ?? new Dictionary<string, string>(), JsonOptions);
        project.TeamMemberIdsJson = JsonSerializer.Serialize(request.TeamMemberIds ?? new List<string>(), JsonOptions);

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

        var actorUserId = User.FindFirst("sub")?.Value
            ?? User.FindFirst("nameid")?.Value
            ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var actorName = ResolveActorName();

        if (string.Equals(request.Status, "Closed", StringComparison.OrdinalIgnoreCase))
        {
            var closeResult = await _projectLifecycle.CloseProjectAsync(id, actorUserId, actorName);
            if (!closeResult.Success)
            {
                return BadRequest(new { message = closeResult.Error ?? "Project could not be closed." });
            }

            string? closedSiteName = null;
            if (!string.IsNullOrWhiteSpace(closeResult.Project?.SiteId))
            {
                closedSiteName = await _db.Sites
                    .Where(s => s.Id == closeResult.Project.SiteId)
                    .Select(s => s.Name)
                    .FirstOrDefaultAsync();
            }

            return Ok(ToDto(closeResult.Project!, closedSiteName));
        }

        project.Status = request.Status;
        project.ApprovalDecision = request.ApprovalDecision;
        if (string.Equals(request.Status, "Completed", StringComparison.OrdinalIgnoreCase))
        {
            project.CompletedAtUtc ??= DateTime.UtcNow;
            project.CompletedBy ??= actorName;
        }

        if (!string.Equals(request.Status, "Closed", StringComparison.OrdinalIgnoreCase))
        {
            project.ClosedAtUtc = null;
            project.ClosedBy = null;
        }
        await _db.SaveChangesAsync();

        if (string.Equals(request.Status, "Completed", StringComparison.OrdinalIgnoreCase))
        {
            var when = project.CompletedAtUtc ?? DateTime.UtcNow;
            await _feed.NotifyRolesAsync(
                "project-completed",
                "success",
                "Project completed",
                $"{project.JobNumber} reached 100% completion and moved to Completed at {when:g} UTC.",
                ["Admin", "Project Manager"],
                project.Id,
                null,
                null,
                "project",
                project.Id,
                actorUserId,
                actorName);
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
        if (!await _db.Projects.AnyAsync(p => p.Id == targetId))
            return NotFound("Target project not found.");
        if (!await _db.Projects.AnyAsync(p => p.Id == sourceId))
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
    {
        var effectiveMode = project.WorkflowMode ?? (project.IsInstallationProject ? "INSTALLATION_ONLY" : "INSPECTION_ONLY");
        return new(
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
            project.IsInstallationProject,
            project.InstallationMode,
            project.ProjectManager,
            project.ContractValue,
            project.ProbabilityStage,
            project.MinimumCompletionPercent,
            project.CompletedAtUtc,
            project.CompletedBy,
            project.ClosedAtUtc,
            project.ClosedBy,
            project.ProductIds,
            string.IsNullOrWhiteSpace(project.ProductFeatureValuesJson)
                ? new Dictionary<string, string>()
                : JsonSerializer.Deserialize<Dictionary<string, string>>(project.ProductFeatureValuesJson, JsonOptions) ?? new Dictionary<string, string>(),
            project.OfficeId,
            assetCount,
            effectiveMode,
            string.IsNullOrWhiteSpace(project.TeamMemberIdsJson)
                ? new List<string>()
                : JsonSerializer.Deserialize<List<string>>(project.TeamMemberIdsJson, JsonOptions) ?? new List<string>(),
            project.IsDeleted,
            project.DeletedAtUtc,
            project.DeletedByUserId,
            project.DeleteReason
        );
    }

    /// <summary>
    /// If the client sends an explicit WorkflowMode use it;
    /// otherwise derive from the legacy IsInstallationProject flag.
    /// </summary>
    private static string ResolveWorkflowMode(string? requested, bool legacyFlag)
    {
        if (!string.IsNullOrWhiteSpace(requested) &&
            requested is "INSTALLATION_ONLY" or "INSPECTION_ONLY" or "MIXED")
        {
            return requested;
        }
        return legacyFlag ? "INSTALLATION_ONLY" : "INSPECTION_ONLY";
    }

    private string ResolveActorName()
    {
        return User.Identity?.Name
            ?? User.FindFirst("email")?.Value
            ?? User.FindFirst(ClaimTypes.Name)?.Value
            ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? "Unknown user";
    }

}

public record ProjectListResponse(List<ProjectDto> Items, int Total);
