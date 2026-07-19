using System.Text.Json;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/project-assets")]
[Authorize]
public class ProjectAssetsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly NotificationFeedService _feed;
    private readonly SseHub _sse;
    private readonly ProjectLifecycleService _projectLifecycle;
    private static readonly JsonSerializerOptions _json = new() { PropertyNameCaseInsensitive = true };

    public ProjectAssetsController(AppDbContext db, NotificationFeedService feed, SseHub sse, ProjectLifecycleService projectLifecycle)
    {
        _db   = db;
        _feed = feed;
        _sse  = sse;
        _projectLifecycle = projectLifecycle;
    }

    // GET api/project-assets/my-project-ids
    [HttpGet("my-project-ids")]
    public async Task<ActionResult<IEnumerable<string>>> MyProjectIds()
    {
        var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrWhiteSpace(userId)) return Ok(Array.Empty<string>());

        var projectIds = await _db.ProjectAssets
            .Where(a => a.AssignedUserId == userId)
            .Select(a => a.ProjectId)
            .Distinct()
            .ToListAsync();
        return Ok(projectIds);
    }

    // GET api/project-assets/active-summary
    // Returns per-project asset counts (active = NotStarted + InProgress)
    [HttpGet("active-summary")]
    public async Task<ActionResult<IEnumerable<ProjectAssetSummaryDto>>> ActiveSummary()
    {
        var counts = await _db.ProjectAssets
            .GroupBy(a => a.ProjectId)
            .Select(g => new ProjectAssetSummaryDto(
                g.Key,
                g.Count(a => a.Status == "NotStarted"),
                g.Count(a => a.Status == "InProgress"),
                g.Count(a => a.Status == "Complete" || a.Status == "Completed" || a.Status == "Closed"),
                g.Count()))
            .ToListAsync();
        return Ok(counts);
    }

    // GET api/project-assets/open  - all assets not yet Complete, joined with parent project info
    [HttpGet("open")]
    public async Task<ActionResult<IEnumerable<OpenAssetDto>>> GetOpen()
    {
        var userId = User.FindFirst("sub")?.Value
            ?? User.FindFirst("nameid")?.Value
            ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var role = User.FindFirst("role")?.Value
            ?? User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value
            ?? string.Empty;

        var canViewAllOpenAssets =
            string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(role, "Project Manager", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(role, "Supervisor", StringComparison.OrdinalIgnoreCase);

        // Active assets = not complete, not cancelled (includes Issue, Pending, OnHold, InProgress, NotStarted)
        var assetsQuery = _db.ProjectAssets
            .Where(a => a.Status != "Complete" && a.Status != "Completed" && a.Status != "Closed" && a.Status != "Cancelled");

        if (!canViewAllOpenAssets)
        {
            if (string.IsNullOrWhiteSpace(userId))
                return Ok(Array.Empty<OpenAssetDto>());

            assetsQuery = assetsQuery.Where(a => a.AssignedUserId == userId);
        }

        var assets = await assetsQuery
            .OrderBy(a => a.ProjectId).ThenBy(a => a.AssetTag)
            .ToListAsync();

        var assetIds = assets.Select(a => a.Id).Distinct().ToList();
        var latestRunByAsset = await GetLatestRunsByAssetAsync(assetIds);
        var assignedWorkflowAssetIds = await _db.AssetWorkflowAssignments
            .Where(a => assetIds.Contains(a.AssetId) && a.Active)
            .Select(a => a.AssetId)
            .Distinct()
            .ToListAsync();
        var assignedWorkflowAssetIdSet = new HashSet<string>(assignedWorkflowAssetIds);

        var projectIds = assets.Select(a => a.ProjectId).Distinct().ToList();
        var projects = await _db.Projects
            .Where(p => projectIds.Contains(p.Id))
            .Select(p => new { p.Id, p.JobNumber, p.Office, p.OfficeId })
            .ToDictionaryAsync(p => p.Id);

        var result = assets.Select(a =>
        {
            projects.TryGetValue(a.ProjectId, out var proj);
            latestRunByAsset.TryGetValue(a.Id, out var latestRun);
            var counts = latestRun is null
                ? (RequiredItems: 0, CompletedItems: 0, MissingItems: 0)
                : CountWorkflowEvidence(latestRun.WorkflowSnapshotJson, latestRun.StepResultsJson);
            var summary = BuildWorkflowSummary(a, latestRun, assignedWorkflowAssetIdSet.Contains(a.Id));
            return new OpenAssetDto(
                a.Id, a.ProjectId,
                proj?.JobNumber ?? "",
                proj?.Office ?? "",
                proj?.OfficeId,
                a.AssetTag, a.AssetName, a.AssetModel, a.Manufacturer,
                summary.HasWorkflow,
                a.Status,
                latestRun?.Status,
                counts.CompletedItems,
                counts.RequiredItems,
                counts.MissingItems,
                summary.EvidenceStatus,
                a.AssignedUserId, a.Location
            );
        });

        return Ok(result);
    }

    // GET api/project-assets/dashboard-workspace?userId={id}
    [HttpGet("dashboard-workspace")]
    public async Task<ActionResult<DashboardWorkspaceDto>> GetDashboardWorkspace([FromQuery] string? userId = null, [FromQuery] bool light = false)
    {
        var currentUserId = User.FindFirst("sub")?.Value
            ?? User.FindFirst("nameid")?.Value
            ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var role = User.FindFirst("role")?.Value
            ?? User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value
            ?? string.Empty;

        if (string.IsNullOrWhiteSpace(currentUserId))
            return Ok(EmptyDashboardWorkspace());

        var canViewOtherUsers =
            string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(role, "Project Manager", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(role, "Supervisor", StringComparison.OrdinalIgnoreCase);

        var effectiveUserId = !string.IsNullOrWhiteSpace(userId) && canViewOtherUsers
            ? userId!
            : currentUserId;

        var assets = await _db.ProjectAssets
            .IgnoreQueryFilters()
            .Where(a => a.AssignedUserId == effectiveUserId)
            .OrderByDescending(a => a.UpdatedAt)
            .ToListAsync();

        if (assets.Count == 0)
            return Ok(EmptyDashboardWorkspace());

        var assetIds = assets.Select(a => a.Id).Distinct().ToList();
        var projectIds = assets.Select(a => a.ProjectId).Distinct().ToList();

        var latestRunByAsset = await GetLatestRunsByAssetAsync(assetIds);

        var assignmentByAsset = await GetLatestAssignmentsByAssetAsync(assetIds);

        var workflowConfigIds = latestRunByAsset.Values
            .Select(r => r.WorkflowConfigId)
            .Concat(assignmentByAsset.Values.Select(a => a.WorkflowConfigId))
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct()
            .ToList();

        var workflowConfigTypesById = await _db.WorkflowConfigs
            .Where(c => workflowConfigIds.Contains(c.Id))
            .Select(c => new { c.Id, c.WorkflowTypeId, c.ConfigType })
            .ToDictionaryAsync(
                c => c.Id,
                c => c.WorkflowTypeId ?? c.ConfigType ?? string.Empty);

        var projects = await _db.Projects
            .IgnoreQueryFilters()
            .Where(p => projectIds.Contains(p.Id))
            .Select(p => new { p.Id, p.JobNumber, p.WorkflowMode, p.Status })
            .ToDictionaryAsync(p => p.Id);

        var importAssetIds = await _db.InspectionImports
            .Where(i => i.AssetId != null && assetIds.Contains(i.AssetId))
            .Select(i => i.AssetId!)
            .Distinct()
            .ToListAsync();
        var importAssetIdSet = new HashSet<string>(importAssetIds);

        var currentInstalls = new List<DashboardWorkspaceAssetDto>();
        var currentInspections = new List<DashboardWorkspaceAssetDto>();
        var installHistory = new List<DashboardWorkspaceAssetDto>();
        var inspectionHistory = new List<DashboardWorkspaceAssetDto>();

        foreach (var asset in assets)
        {
            latestRunByAsset.TryGetValue(asset.Id, out var latestRun);
            assignmentByAsset.TryGetValue(asset.Id, out var latestAssignment);
            projects.TryGetValue(asset.ProjectId, out var project);

            var workflowSummary = BuildWorkflowSummary(asset, latestRun, latestAssignment?.Active == true, light);

            var runWorkflowType = latestRun is not null && workflowConfigTypesById.TryGetValue(latestRun.WorkflowConfigId, out var latestRunWorkflowType)
                ? latestRunWorkflowType
                : string.Empty;
            var assignmentWorkflowType = latestAssignment is not null && workflowConfigTypesById.TryGetValue(latestAssignment.WorkflowConfigId, out var latestAssignmentWorkflowType)
                ? latestAssignmentWorkflowType
                : latestAssignment?.WorkflowTypeId ?? string.Empty;

            var isInspection = IsInspectionWorkspaceAsset(
                project?.WorkflowMode,
                assignmentWorkflowType,
                runWorkflowType,
                importAssetIdSet.Contains(asset.Id));

            var latestActivityAt = new[]
            {
                asset.UpdatedAt,
                asset.DeletedAtUtc,
                latestRun?.UpdatedAt,
                latestRun?.CompletedAt,
                latestAssignment?.AssignedAt
            }
            .Where(d => d.HasValue)
            .Select(d => d!.Value)
            .DefaultIfEmpty(asset.CreatedAt)
            .Max();

            var item = new DashboardWorkspaceAssetDto(
                asset.Id,
                asset.ProjectId,
                project?.JobNumber ?? string.Empty,
                asset.AssetTag,
                asset.AssetName,
                asset.AssetModel,
                asset.Location,
                asset.Status,
                latestRun?.Status,
                BuildHistoryStatus(asset, project?.Status, latestRun),
                workflowSummary.CompletedItems,
                workflowSummary.RequiredItems,
                workflowSummary.MissingItems,
                workflowSummary.EvidenceStatus,
                asset.AssignedUserId,
                project?.WorkflowMode ?? string.Empty,
                asset.IsDeleted,
                asset.DeletedAtUtc,
                asset.DeleteReason,
                latestActivityAt,
                latestRun?.CompletedAt,
                workflowSummary.HasOpenIssues,
                workflowSummary.SignatureStatus
            );

            var isCurrent = IsCurrentWorkspaceAsset(asset, latestRun);
            if (isInspection)
            {
                if (isCurrent) currentInspections.Add(item);
                else inspectionHistory.Add(item);
            }
            else
            {
                if (isCurrent) currentInstalls.Add(item);
                else installHistory.Add(item);
            }
        }

        return Ok(new DashboardWorkspaceDto(
            OrderCurrentWorkspaceItems(currentInstalls),
            OrderCurrentWorkspaceItems(currentInspections),
            OrderHistoryWorkspaceItems(installHistory),
            OrderHistoryWorkspaceItems(inspectionHistory)
        ));
    }

    // GET api/project-assets/workload-summary
    [HttpGet("workload-summary")]
    public async Task<ActionResult<IEnumerable<WorkloadSummaryDto>>> WorkloadSummary()
    {
        // Active assets = not complete, not cancelled (includes Issue, Pending, OnHold, InProgress, NotStarted)
        var assets = await _db.ProjectAssets
            .Where(a => a.AssignedUserId != null && a.AssignedUserId != ""
                     && a.Status != "Complete" && a.Status != "Completed" && a.Status != "Closed" && a.Status != "Cancelled")
            .ToListAsync();

        var userIds   = assets.Select(a => a.AssignedUserId!).Distinct().ToList();
        var projectIds = assets.Select(a => a.ProjectId).Distinct().ToList();
        var assetIds   = assets.Select(a => a.Id).Distinct().ToList();

        var users = await _db.Users
            .Where(u => userIds.Contains(u.Id))
            .Select(u => new { u.Id, u.FullName })
            .ToDictionaryAsync(u => u.Id, u => u.FullName);

        var projects = await _db.Projects
            .Where(p => projectIds.Contains(p.Id))
            .Select(p => new { p.Id, p.JobNumber })
            .ToDictionaryAsync(p => p.Id, p => p.JobNumber);

        // Get latest in-progress run per asset for start time
        var latestRunByAsset = await GetLatestRunsByAssetAsync(assetIds, onlyUnlocked: true);

        var opts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };

        var summary = assets
            .GroupBy(a => a.AssignedUserId!)
            .Select(g =>
            {
                var userId = g.Key;
                var name   = users.TryGetValue(userId, out var n) ? n : "Unknown";
                var inProgressAssets = g.Where(a => a.Status == "InProgress").ToList();

                // Distinct job numbers
                var jobNumbers = g
                    .Select(a => projects.TryGetValue(a.ProjectId, out var j) ? j : null)
                    .Where(j => j != null)
                    .Distinct()
                    .ToList()!;

                // Any unresolved issues across assets
                bool hasIssues = inProgressAssets.Any(a =>
                {
                    if (string.IsNullOrEmpty(a.IssuesJson) || a.IssuesJson == "[]") return false;
                    try
                    {
                        var issues = JsonSerializer.Deserialize<List<JsonElement>>(a.IssuesJson, opts) ?? [];
                        return issues.Any(i =>
                        {
                            i.TryGetProperty("resolved", out var r);
                            return r.ValueKind != JsonValueKind.True;
                        });
                    }
                    catch { return false; }
                });

                // Step progress from in-progress workflow runs
                int completedSteps = 0, totalSteps = 0;
                foreach (var asset in inProgressAssets)
                {
                    if (!latestRunByAsset.TryGetValue(asset.Id, out var run)) continue;
                    try
                    {
                        var results = JsonSerializer.Deserialize<JsonElement[]>(run.StepResultsJson ?? "[]", opts);
                        completedSteps += results?.Length ?? 0;
                    }
                    catch { }
                    try
                    {
                        using var doc = JsonDocument.Parse(run.WorkflowSnapshotJson ?? "{}");
                        if (doc.RootElement.TryGetProperty("steps", out var steps))
                            totalSteps += steps.GetArrayLength();
                    }
                    catch { }
                }

                // Earliest start time for in-progress assets
                DateTime? startedAt = inProgressAssets
                    .Select(a => latestRunByAsset.TryGetValue(a.Id, out var r) ? r.StartedAt : (DateTime?)null)
                    .Where(d => d != null)
                    .OrderBy(d => d)
                    .FirstOrDefault();

                return new WorkloadSummaryDto(
                    userId, name,
                    g.Count(a => a.Status == "NotStarted"),
                    inProgressAssets.Count(a => latestRunByAsset.TryGetValue(a.Id, out var run) && run.Status == "InProgress"),
                    inProgressAssets.Count(a => latestRunByAsset.TryGetValue(a.Id, out var run) && run.Status == "Paused"),
                    g.Count(),
                    jobNumbers!,
                    hasIssues,
                    completedSteps,
                    totalSteps,
                    startedAt?.ToString("o"));
            })
            .OrderByDescending(w => w.TotalAssigned)
            .ToList();

        return Ok(summary);
    }

    // GET api/project-assets/technician-workload-summary
    // Returns workload breakdown for all technicians using the same logic as dashboard-workspace
    [HttpGet("technician-workload-summary")]
    public async Task<ActionResult<IEnumerable<TechnicianWorkloadSummaryDto>>> GetTechnicianWorkloadSummary()
    {
        // Active assets = not complete, not cancelled (includes Issue, Pending, OnHold, InProgress, NotStarted)
        var assets = await _db.ProjectAssets
            .Where(a => a.AssignedUserId != null && a.AssignedUserId != ""
                     && a.Status != "Complete" && a.Status != "Completed" && a.Status != "Closed" && a.Status != "Cancelled")
            .ToListAsync();

        if (assets.Count == 0) return Ok(Array.Empty<TechnicianWorkloadSummaryDto>());

        var userIds = assets.Select(a => a.AssignedUserId!).Distinct().ToList();
        var assetIds = assets.Select(a => a.Id).Distinct().ToList();
        var projectIds = assets.Select(a => a.ProjectId).Distinct().ToList();

        // Get user names
        var users = await _db.Users
            .Where(u => userIds.Contains(u.Id))
            .Select(u => new { u.Id, u.FullName })
            .ToDictionaryAsync(u => u.Id, u => u.FullName);

        // Get project info
        var projects = await _db.Projects
            .Where(p => projectIds.Contains(p.Id))
            .Select(p => new { p.Id, p.JobNumber })
            .ToDictionaryAsync(p => p.Id, p => p.JobNumber);

        // Get latest workflow run per asset (all runs, including completed/locked)
        var runs = await _db.AssetWorkflowRuns
            .Where(r => assetIds.Contains(r.AssetId))
            .OrderByDescending(r => r.StartedAt)
            .ThenByDescending(r => r.UpdatedAt)
            .ToListAsync();

        var latestRunByAsset = runs
            .GroupBy(r => r.AssetId)
            .ToDictionary(g => g.Key, g => g.First());

        var opts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };

        // Group by user and calculate counts using same logic as dashboard-workspace
        var summary = assets
            .GroupBy(a => a.AssignedUserId!)
            .Select(g =>
            {
                var userId = g.Key;
                var fullName = users.TryGetValue(userId, out var n) ? n : "Unknown";
                var userAssets = g.ToList();

                // Count using same logic as frontend's isPausedAsset/isInProgressAsset/isNotStartedAsset
                int paused = 0, inProgress = 0, notStarted = 0;
                var jobNumbers = new HashSet<string>();
                bool hasIssues = false;
                int completedSteps = 0, totalSteps = 0;
                DateTime? startedAt = null;

                foreach (var asset in userAssets)
                {
                    latestRunByAsset.TryGetValue(asset.Id, out var run);
                    var runStatus = (run?.Status ?? "").Trim().ToLowerInvariant().Replace(" ", "");
                    var assetStatus = (asset.Status ?? "").Trim().ToLowerInvariant().Replace(" ", "");

                    // Get job number
                    if (projects.TryGetValue(asset.ProjectId, out var jn))
                        jobNumbers.Add(jn);

                    // Check for issues
                    if (!string.IsNullOrEmpty(asset.IssuesJson) && asset.IssuesJson != "[]")
                    {
                        try
                        {
                            var issues = JsonSerializer.Deserialize<List<JsonElement>>(asset.IssuesJson, opts) ?? [];
                            if (issues.Any(i =>
                            {
                                i.TryGetProperty("resolved", out var r);
                                return r.ValueKind != JsonValueKind.True;
                            }))
                                hasIssues = true;
                        }
                        catch { }
                    }

                    // Same counting logic as dashboard-workspace IsCurrentWorkspaceAsset
                    // Priority: Paused -> In Progress -> Issue -> Pending -> Not Started
                    if (runStatus == "paused")
                    {
                        paused++;
                    }
                    else if (runStatus == "inprogress" || assetStatus == "inprogress")
                    {
                        inProgress++;
                    }
                    else if (assetStatus == "issue")
                    {
                        // Issue assets are active and need attention
                        inProgress++;
                    }
                    else if (assetStatus == "pending")
                    {
                        // Pending assets are waiting to be started (queued)
                        notStarted++;
                    }
                    else if (assetStatus == "notstarted")
                    {
                        notStarted++;
                    }

                    // Step progress from the latest run (any status - includes completed/locked runs)
                    if (run != null)
                    {
                        try
                        {
                            var results = JsonSerializer.Deserialize<JsonElement[]>(run.StepResultsJson ?? "[]", opts);
                            completedSteps += results?.Length ?? 0;
                        }
                        catch { }
                        try
                        {
                            using var doc = JsonDocument.Parse(run.WorkflowSnapshotJson ?? "{}");
                            if (doc.RootElement.TryGetProperty("steps", out var steps))
                                totalSteps += steps.GetArrayLength();
                        }
                        catch { }

                        // Track earliest start time
                        if (startedAt == null || run.StartedAt < startedAt)
                            startedAt = run.StartedAt;
                    }
                }

                return new TechnicianWorkloadSummaryDto(
                    userId,
                    fullName,
                    paused,
                    inProgress,
                    notStarted,
                    userAssets.Count,
                    jobNumbers.ToList(),
                    hasIssues,
                    completedSteps,
                    totalSteps,
                    startedAt?.ToString("o")
                );
            })
            .OrderByDescending(w => w.TotalAssigned)
            .ToList();

        return Ok(summary);
    }

    // GET api/project-assets/by-project/{projectId}
    [HttpGet("by-project/{projectId}")]
    public async Task<ActionResult<IEnumerable<ProjectAssetDto>>> GetByProject(string projectId, [FromQuery] bool includeDeleted = false)
    {
        var assetsQuery = includeDeleted ? _db.ProjectAssets.IgnoreQueryFilters() : _db.ProjectAssets;
        var assets = await assetsQuery
            .Where(a => a.ProjectId == projectId)
            .OrderByDescending(a => a.CreatedAt)
            .ToListAsync();

        return Ok(await MapAssetsToDtosAsync(assets));
    }

    // GET api/project-assets/by-product/{productId}
    [HttpGet("by-product/{productId}")]
    public async Task<ActionResult<IEnumerable<ProjectAssetDto>>> GetByProduct(string productId, [FromQuery] bool includeDeleted = false)
    {
        var assetsQuery = includeDeleted ? _db.ProjectAssets.IgnoreQueryFilters() : _db.ProjectAssets;
        var assets = await assetsQuery
            .Where(a => a.ProductId == productId)
            .OrderByDescending(a => a.CreatedAt)
            .ToListAsync();

        return Ok(await MapAssetsToDtosAsync(assets));
    }

    // GET api/project-assets/{id}
    [HttpGet("{id}")]
    public async Task<ActionResult<ProjectAssetDto>> GetById(string id, [FromQuery] bool includeDeleted = false)
    {
        var assets = includeDeleted ? _db.ProjectAssets.IgnoreQueryFilters() : _db.ProjectAssets;
        var asset = await assets.FirstOrDefaultAsync(a => a.Id == id);
        if (asset is null) return NotFound();
        return Ok(await ToDtoAsync(asset));
    }

    // POST api/project-assets
    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<ProjectAssetDto>> Create([FromBody] UpsertProjectAssetRequest request)
    {
        var asset = new ProjectAssetEntity
        {
            ProjectId          = request.ProjectId ?? string.Empty,
            ProductId          = request.ProductId ?? string.Empty,
            ProductConfigId    = string.IsNullOrWhiteSpace(request.ProductConfigId) ? null : request.ProductConfigId,
            WorkflowTemplateId = string.IsNullOrWhiteSpace(request.WorkflowTemplateId) ? null : request.WorkflowTemplateId,
            AssetTag           = request.AssetTag?.Trim() ?? string.Empty,
            AssetName          = string.IsNullOrWhiteSpace(request.AssetName) ? null : request.AssetName.Trim(),
            SerialNumber       = string.IsNullOrWhiteSpace(request.SerialNumber) ? null : request.SerialNumber.Trim(),
            AssetModel         = string.IsNullOrWhiteSpace(request.AssetModel) ? null : request.AssetModel.Trim(),
            Manufacturer       = string.IsNullOrWhiteSpace(request.Manufacturer) ? null : request.Manufacturer.Trim(),
            Location           = string.IsNullOrWhiteSpace(request.Location) ? null : request.Location.Trim(),
            AssignedUserId     = string.IsNullOrWhiteSpace(request.AssignedUserId) ? null : request.AssignedUserId,
            Status             = string.IsNullOrWhiteSpace(request.Status) ? "NotStarted" : request.Status,
            Notes              = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
            FeatureValuesJson  = string.IsNullOrWhiteSpace(request.FeatureValuesJson) ? "{}" : request.FeatureValuesJson,
            IssuesJson         = string.IsNullOrWhiteSpace(request.IssuesJson) ? "[]" : request.IssuesJson,
        };
        _db.ProjectAssets.Add(asset);
        await _db.SaveChangesAsync();
        await NotifyAssetAssignmentChangeAsync(asset, null, asset.AssignedUserId, "asset-created");
        var currentUserId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "";
        await _sse.BroadcastExceptAsync(currentUserId, "assets:updated",
            new { productId = asset.ProductId, projectId = asset.ProjectId });
        return CreatedAtAction(nameof(GetById), new { id = asset.Id }, await ToDtoAsync(asset));
    }

    // POST api/project-assets/bulk
    [HttpPost("bulk")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<IEnumerable<ProjectAssetDto>>> BulkCreate([FromBody] BulkCreateProjectAssetsRequest request)
    {
        var created = new List<ProjectAssetEntity>();
        foreach (var item in request.Assets)
        {
            var asset = new ProjectAssetEntity
            {
                ProjectId          = request.ProjectId,
                ProductId          = request.ProductId,
                ProductConfigId    = string.IsNullOrWhiteSpace(item.ProductConfigId) ? null : item.ProductConfigId,
                WorkflowTemplateId = string.IsNullOrWhiteSpace(item.WorkflowTemplateId) ? null : item.WorkflowTemplateId,
                AssetTag           = item.AssetTag?.Trim() ?? string.Empty,
                AssetName          = string.IsNullOrWhiteSpace(item.AssetName) ? null : item.AssetName.Trim(),
                SerialNumber       = string.IsNullOrWhiteSpace(item.SerialNumber) ? null : item.SerialNumber.Trim(),
                AssetModel         = string.IsNullOrWhiteSpace(item.AssetModel) ? null : item.AssetModel.Trim(),
                Manufacturer       = string.IsNullOrWhiteSpace(item.Manufacturer) ? null : item.Manufacturer.Trim(),
                Location           = string.IsNullOrWhiteSpace(item.Location) ? null : item.Location.Trim(),
                AssignedUserId     = string.IsNullOrWhiteSpace(item.AssignedUserId) ? null : item.AssignedUserId,
                Status             = "NotStarted",
                Notes              = string.IsNullOrWhiteSpace(item.Notes) ? null : item.Notes.Trim(),
            };
            created.Add(asset);
            _db.ProjectAssets.Add(asset);
        }
        await _db.SaveChangesAsync();
        foreach (var asset in created.Where(a => !string.IsNullOrWhiteSpace(a.AssignedUserId)))
        {
            await NotifyAssetAssignmentChangeAsync(asset, null, asset.AssignedUserId, "asset-created");
        }
        var bulkUserId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "";
        if (created.Count > 0)
        {
            await _sse.BroadcastExceptAsync(bulkUserId, "assets:updated",
                new { productId = request.ProductId, projectId = request.ProjectId });
        }
        return Ok(await MapAssetsToDtosAsync(created));
    }

    // PUT api/project-assets/{id}
    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<ProjectAssetDto>> Update(string id, [FromBody] UpsertProjectAssetRequest request)
    {
        var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == id);
        if (asset is null) return NotFound();
        var previousAssignedUserId = asset.AssignedUserId;

        if (!string.IsNullOrWhiteSpace(request.AssetTag))   asset.AssetTag        = request.AssetTag.Trim();
        if (request.AssetName is not null)                  asset.AssetName        = string.IsNullOrWhiteSpace(request.AssetName) ? null : request.AssetName.Trim();
        if (request.SerialNumber is not null)               asset.SerialNumber     = string.IsNullOrWhiteSpace(request.SerialNumber) ? null : request.SerialNumber.Trim();
        if (request.AssetModel is not null)                 asset.AssetModel       = string.IsNullOrWhiteSpace(request.AssetModel) ? null : request.AssetModel.Trim();
        if (request.Manufacturer is not null)               asset.Manufacturer     = string.IsNullOrWhiteSpace(request.Manufacturer) ? null : request.Manufacturer.Trim();
        if (request.Location is not null)                   asset.Location         = string.IsNullOrWhiteSpace(request.Location) ? null : request.Location.Trim();
        if (request.AssignedUserId is not null)             asset.AssignedUserId   = string.IsNullOrWhiteSpace(request.AssignedUserId) ? null : request.AssignedUserId;
        if (!string.IsNullOrWhiteSpace(request.Status))    asset.Status            = request.Status;
        if (request.Notes is not null)                      asset.Notes            = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        if (request.ProductConfigId is not null)            asset.ProductConfigId  = string.IsNullOrWhiteSpace(request.ProductConfigId) ? null : request.ProductConfigId;
        if (request.WorkflowTemplateId is not null)         asset.WorkflowTemplateId = string.IsNullOrWhiteSpace(request.WorkflowTemplateId) ? null : request.WorkflowTemplateId;
        if (request.WorkOrderId is not null)                asset.WorkOrderId      = string.IsNullOrWhiteSpace(request.WorkOrderId) ? null : request.WorkOrderId;
        if (request.FeatureValuesJson is not null)          asset.FeatureValuesJson = string.IsNullOrWhiteSpace(request.FeatureValuesJson) ? "{}" : request.FeatureValuesJson;
        if (request.IssuesJson is not null)                 asset.IssuesJson       = string.IsNullOrWhiteSpace(request.IssuesJson) ? "[]" : request.IssuesJson;
        if (request.ConfigLabel is not null)                asset.ConfigLabel      = string.IsNullOrWhiteSpace(request.ConfigLabel) ? null : request.ConfigLabel.Trim();
        asset.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        if (!string.Equals(previousAssignedUserId, asset.AssignedUserId, StringComparison.OrdinalIgnoreCase))
        {
            await NotifyAssetAssignmentChangeAsync(asset, previousAssignedUserId, asset.AssignedUserId, "asset-assignment-updated");
        }
        var putUserId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "";
        await _sse.BroadcastExceptAsync(putUserId, "assets:updated",
            new { productId = asset.ProductId, projectId = asset.ProjectId });
        return Ok(await ToDtoAsync(asset));
    }

    // PATCH api/project-assets/{id}/issues - update issuesJson only; open to all authenticated users (Engineers, Installers, etc.)
    [HttpPatch("{id}/issues")]
    public async Task<ActionResult<ProjectAssetDto>> PatchIssues(string id, [FromBody] PatchIssuesRequest request)
    {
        var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == id);
        if (asset is null) return NotFound();

        asset.IssuesJson = string.IsNullOrWhiteSpace(request.IssuesJson) ? "[]" : request.IssuesJson;
        asset.UpdatedAt = DateTime.UtcNow;
        var allRuns = await _db.AssetWorkflowRuns.Where(r => r.AssetId == asset.Id).ToListAsync();
        var anyRunOpenIssue = allRuns.Any(r => HasOpenIssues(r.IssuesJson));
        var anyAssetOpenIssue = HasOpenIssues(asset.IssuesJson);
        var anyLockedRun = allRuns.Any(r => r.IsLocked);
        if (anyRunOpenIssue || anyAssetOpenIssue)
        {
            asset.Status = "Issue";
        }
        else if (anyLockedRun)
        {
            var latestLockedRun = allRuns
                .Where(r => r.IsLocked)
                .OrderByDescending(r => r.CompletedAt ?? r.UpdatedAt)
                .FirstOrDefault();
            asset.Status = latestLockedRun?.SignatureStatus switch
            {
                "Signed" or "WaivedCustomer" => "Closed",
                "PendingCustomer" or "Declined" => "Complete",
                "PendingInstaller" => "Pending",
                _ => "Complete",
            };
        }
        await _db.SaveChangesAsync();
        var actorUserId = User.FindFirst("sub")?.Value
            ?? User.FindFirst("nameid")?.Value
            ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var actorName = User.Identity?.Name
            ?? User.FindFirst("email")?.Value
            ?? User.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value
            ?? "Unknown user";
        await _projectLifecycle.SyncFromAssetsAsync(asset.ProjectId, actorUserId, actorName);
        var patchUserId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "";
        await _sse.BroadcastExceptAsync(patchUserId, "assets:updated",
            new { productId = asset.ProductId, projectId = asset.ProjectId });
        return Ok(await ToDtoAsync(asset));
    }

    // PATCH api/project-assets/{id}/assignment - update AssignedUserId ONLY.
    // Open to all authenticated users (like {id}/issues) so an Installer can claim an
    // unassigned asset or take over one assigned to someone else. This is deliberately
    // narrow: it can change nothing but the assignee, so the broad Admin/PM-only PUT
    // stays locked down.
    //
    // AssignedUserId is the single source of truth for work assignment across the whole
    // product - the Assets installer column AND the Dashboard "My Jobs Today" query
    // (which filters `.Where(a => a.AssignedUserId == effectiveUserId)`). Without this
    // endpoint an installer's takeover could never persist, so the job never appeared in
    // the new owner's dashboard and stayed in the previous owner's.
    [HttpPatch("{id}/assignment")]
    public async Task<ActionResult<ProjectAssetDto>> PatchAssignment(string id, [FromBody] PatchAssignmentRequest request)
    {
        var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == id);
        if (asset is null) return NotFound();

        var callerId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
            ?? User.FindFirst("sub")?.Value
            ?? User.FindFirst("nameid")?.Value;
        if (string.IsNullOrWhiteSpace(callerId)) return Forbid();

        var isAdminOrPm = User.IsInRole("Admin") || User.IsInRole("Project Manager");
        var target = string.IsNullOrWhiteSpace(request.AssignedUserId) ? null : request.AssignedUserId;

        // SECURITY: a non-Admin/PM may only assign the asset to THEMSELVES. This is what
        // makes an open endpoint safe - an installer can claim work, but cannot push work
        // onto a colleague or unassign someone else. Admin/PM keep full freedom.
        if (!isAdminOrPm && !string.Equals(target, callerId, StringComparison.OrdinalIgnoreCase))
            return Forbid();

        var previousAssignedUserId = asset.AssignedUserId;
        asset.AssignedUserId = target;
        asset.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        // Reuse the existing notification + SSE broadcast so PMs/admins still see
        // assignment changes exactly as they do from the PUT path today.
        if (!string.Equals(previousAssignedUserId, asset.AssignedUserId, StringComparison.OrdinalIgnoreCase))
        {
            await NotifyAssetAssignmentChangeAsync(asset, previousAssignedUserId, asset.AssignedUserId, "asset-assignment-updated");
        }
        await _sse.BroadcastExceptAsync(callerId, "assets:updated",
            new { productId = asset.ProductId, projectId = asset.ProjectId });

        return Ok(await ToDtoAsync(asset));
    }

    // DELETE api/project-assets/{id}
    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Delete(string id)
    {
        var asset = await _db.ProjectAssets
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(a => a.Id == id);
        if (asset is null) return NotFound();
        if (asset.IsDeleted) return NoContent();

        asset.IsDeleted = true;
        asset.DeletedAtUtc = DateTime.UtcNow;
        asset.DeletedByUserId = User.FindFirst("sub")?.Value ?? User.FindFirst("nameid")?.Value;
        await _db.SaveChangesAsync();
        var actorUserId = User.FindFirst("sub")?.Value
            ?? User.FindFirst("nameid")?.Value
            ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var actorName = User.Identity?.Name
            ?? User.FindFirst("email")?.Value
            ?? User.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value
            ?? "Unknown user";
        var project = await _db.Projects.AsNoTracking().FirstOrDefaultAsync(p => p.Id == asset.ProjectId);
        var deletedAt = asset.DeletedAtUtc ?? DateTime.UtcNow;
        var message = $"{asset.AssetTag} on job {project?.JobNumber ?? "unknown"} was deleted at {deletedAt:g} UTC.";
        await _feed.NotifyRolesAsync(
            "asset-deleted",
            "warning",
            "Asset deleted",
            message,
            ["Admin", "Project Manager"],
            asset.ProjectId,
            asset.Id,
            null,
            "project-asset",
            asset.Id,
            actorUserId,
            actorName);
        if (!string.IsNullOrWhiteSpace(asset.AssignedUserId))
        {
            await _feed.NotifyUsersAsync(
                "asset-deleted",
                "warning",
                "Asset deleted",
                message,
                [asset.AssignedUserId],
                asset.ProjectId,
                asset.Id,
                null,
                "project-asset",
                asset.Id,
                actorUserId,
                actorName);
        }
        await _projectLifecycle.SyncFromAssetsAsync(asset.ProjectId, actorUserId, actorName);
        var delUserId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "";
        await _sse.BroadcastExceptAsync(delUserId, "assets:updated",
            new { productId = asset.ProductId, projectId = asset.ProjectId });
        return NoContent();
    }

    [HttpPost("{id}/restore")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Restore(string id)
    {
        var asset = await _db.ProjectAssets
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(a => a.Id == id);
        if (asset is null) return NotFound();

        asset.IsDeleted = false;
        asset.DeletedAtUtc = null;
        asset.DeletedByUserId = null;
        asset.DeleteReason = null;
        await _db.SaveChangesAsync();
        var restoreActorUserId = User.FindFirst("sub")?.Value
            ?? User.FindFirst("nameid")?.Value
            ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var restoreActorName = User.Identity?.Name
            ?? User.FindFirst("email")?.Value
            ?? User.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value
            ?? "Unknown user";
        await _projectLifecycle.SyncFromAssetsAsync(asset.ProjectId, restoreActorUserId, restoreActorName);
        return NoContent();
    }

    [HttpDelete("{id}/purge")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Purge(string id)
    {
        var asset = await _db.ProjectAssets
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(a => a.Id == id);
        if (asset is null) return NotFound();

        _db.AssetWorkflowAssignments.RemoveRange(_db.AssetWorkflowAssignments.Where(a => a.AssetId == id));
        _db.AssetWorkflowRuns.RemoveRange(_db.AssetWorkflowRuns.Where(r => r.AssetId == id));
        _db.AssetDocumentLinks.RemoveRange(_db.AssetDocumentLinks.Where(l => l.AssetId == id));
        var docIds = await _db.AssetDocuments
            .Where(d => d.AssetId == id)
            .Select(d => d.Id)
            .ToListAsync();
        if (docIds.Count > 0)
        {
            _db.AssetDocumentRevisions.RemoveRange(_db.AssetDocumentRevisions.Where(r => docIds.Contains(r.DocumentId)));
        }
        _db.AssetDocuments.RemoveRange(_db.AssetDocuments.Where(d => d.AssetId == id));

        _db.ProjectAssets.Remove(asset);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private async Task<List<ProjectAssetDto>> MapAssetsToDtosAsync(IEnumerable<ProjectAssetEntity> assets)
    {
        var assetList = assets.ToList();
        var summaries = await BuildWorkflowSummariesAsync(assetList);
        return assetList.Select(asset => ToDto(asset, summaries.GetValueOrDefault(asset.Id))).ToList();
    }

    private async Task<ProjectAssetDto> ToDtoAsync(ProjectAssetEntity asset)
    {
        var summaries = await BuildWorkflowSummariesAsync([asset]);
        return ToDto(asset, summaries.GetValueOrDefault(asset.Id));
    }

    private async Task NotifyAssetAssignmentChangeAsync(
        ProjectAssetEntity asset,
        string? previousAssignedUserId,
        string? nextAssignedUserId,
        string eventType)
    {
        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == asset.ProjectId);
        var actorName = User.Identity?.Name ?? User.FindFirst("email")?.Value;
        var actorUserId = User.FindFirst("sub")?.Value ?? User.FindFirst("nameid")?.Value
            ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var actorRole = User.FindFirst("role")?.Value ?? User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
        var nextUser = !string.IsNullOrWhiteSpace(nextAssignedUserId)
            ? await _db.Users.FirstOrDefaultAsync(u => u.Id == nextAssignedUserId)
            : null;
        var previousUser = !string.IsNullOrWhiteSpace(previousAssignedUserId)
            ? await _db.Users.FirstOrDefaultAsync(u => u.Id == previousAssignedUserId)
            : null;

        var managerDriven = string.Equals(actorRole, "Admin", StringComparison.OrdinalIgnoreCase)
            || string.Equals(actorRole, "Project Manager", StringComparison.OrdinalIgnoreCase);
        var isSelfAssign = !string.IsNullOrWhiteSpace(nextAssignedUserId)
            && string.Equals(actorUserId, nextAssignedUserId, StringComparison.OrdinalIgnoreCase);
        var isTakeover = isSelfAssign && !string.IsNullOrWhiteSpace(previousAssignedUserId)
            && !string.Equals(previousAssignedUserId, nextAssignedUserId, StringComparison.OrdinalIgnoreCase);

        var roleEventType = eventType;
        var roleTitle = $"Asset assignment updated: {asset.AssetTag}";
        var roleMessage = $"Asset {asset.AssetTag} on job {project?.JobNumber ?? "unknown"} is now assigned to {(nextUser?.FullName ?? nextAssignedUserId ?? "no installer")}.";

        if (managerDriven && nextUser is not null)
        {
            roleEventType = "manager-assigned";
            roleTitle = $"Asset assigned by PM/Admin: {asset.AssetTag}";
            roleMessage = $"{actorName ?? "PM/Admin"} assigned asset {asset.AssetTag} on job {project?.JobNumber ?? "unknown"} to {nextUser.FullName}.";
            if (!string.IsNullOrWhiteSpace(previousUser?.FullName))
            {
                roleMessage += $" Previous assignee: {previousUser.FullName}.";
            }
        }
        else if (isTakeover && nextUser is not null)
        {
            roleEventType = "asset-takeover";
            roleTitle = $"Asset taken over: {asset.AssetTag}";
            roleMessage = $"{nextUser.FullName} took over asset {asset.AssetTag} on job {project?.JobNumber ?? "unknown"}";
            if (!string.IsNullOrWhiteSpace(previousUser?.FullName))
            {
                roleMessage += $" from {previousUser.FullName}";
            }
            roleMessage += ".";
        }
        else if (isSelfAssign && nextUser is not null)
        {
            roleEventType = "asset-self-assigned";
            roleTitle = $"Asset self-assigned: {asset.AssetTag}";
            roleMessage = $"{nextUser.FullName} self-assigned asset {asset.AssetTag} on job {project?.JobNumber ?? "unknown"}.";
        }

        await _feed.NotifyRolesAsync(
            roleEventType,
            "info",
            roleTitle,
            roleMessage,
            ["Admin", "Project Manager"],
            asset.ProjectId,
            asset.Id,
            null,
            "project-asset",
            asset.Id,
            actorUserId,
            actorName
        );

        if (!string.IsNullOrWhiteSpace(nextAssignedUserId))
        {
            await _feed.NotifyUsersAsync(
                "asset-assigned",
                "info",
                $"Asset assigned: {asset.AssetTag}",
                $"You were assigned asset {asset.AssetTag} on job {project?.JobNumber ?? "unknown"}.",
                [nextAssignedUserId],
                asset.ProjectId,
                asset.Id,
                null,
                "project-asset",
                asset.Id,
                null,
                actorName
            );
        }

        if (!string.IsNullOrWhiteSpace(previousAssignedUserId) &&
            !string.Equals(previousAssignedUserId, nextAssignedUserId, StringComparison.OrdinalIgnoreCase))
        {
            await _feed.NotifyUsersAsync(
                "asset-unassigned",
                "warning",
                $"Asset reassigned: {asset.AssetTag}",
                $"Asset {asset.AssetTag} on job {project?.JobNumber ?? "unknown"} is no longer assigned to you.",
                [previousAssignedUserId],
                asset.ProjectId,
                asset.Id,
                null,
                "project-asset",
                asset.Id,
                null,
                actorName
            );
        }
    }

    private async Task<Dictionary<string, ProjectAssetWorkflowSummaryDto>> BuildWorkflowSummariesAsync(IEnumerable<ProjectAssetEntity> assets)
    {
        var assetList = assets.ToList();
        if (assetList.Count == 0) return new();

        var assetIds = assetList.Select(a => a.Id).Distinct().ToList();
        var latestRunByAsset = await GetLatestRunsByAssetAsync(assetIds);
        var assignedWorkflowAssetIds = await _db.AssetWorkflowAssignments
            .Where(a => assetIds.Contains(a.AssetId) && a.Active)
            .Select(a => a.AssetId)
            .Distinct()
            .AsNoTracking()
            .ToListAsync();
        var assignedWorkflowAssetIdSet = new HashSet<string>(assignedWorkflowAssetIds);

        var summaries = new Dictionary<string, ProjectAssetWorkflowSummaryDto>(assetIds.Count);
        foreach (var asset in assetList)
        {
            latestRunByAsset.TryGetValue(asset.Id, out var latestRun);
            summaries[asset.Id] = BuildWorkflowSummary(asset, latestRun, assignedWorkflowAssetIdSet.Contains(asset.Id));
        }

        return summaries;
    }

    private async Task<Dictionary<string, AssetWorkflowRunEntity>> GetLatestRunsByAssetAsync(IEnumerable<string> assetIds, bool onlyUnlocked = false)
    {
        var ids = assetIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct()
            .ToList();
        if (ids.Count == 0) return new();

        var runKeysQuery = _db.AssetWorkflowRuns
            .Where(r => ids.Contains(r.AssetId));
        if (onlyUnlocked)
        {
            runKeysQuery = runKeysQuery.Where(r => !r.IsLocked);
        }

        var latestRunIds = (await runKeysQuery
            .Select(r => new LatestRunKey(r.Id, r.AssetId, r.StartedAt, r.UpdatedAt))
            .AsNoTracking()
            .ToListAsync())
            .GroupBy(r => r.AssetId)
            .Select(g => g
                .OrderByDescending(r => r.StartedAt)
                .ThenByDescending(r => r.UpdatedAt)
                .Select(r => r.Id)
                .First())
            .ToList();

        if (latestRunIds.Count == 0) return new();

        return await _db.AssetWorkflowRuns
            .Where(r => latestRunIds.Contains(r.Id))
            .AsNoTracking()
            .ToDictionaryAsync(r => r.AssetId);
    }

    private async Task<Dictionary<string, AssetWorkflowAssignmentEntity>> GetLatestAssignmentsByAssetAsync(IEnumerable<string> assetIds)
    {
        var ids = assetIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct()
            .ToList();
        if (ids.Count == 0) return new();

        var latestAssignmentIds = (await _db.AssetWorkflowAssignments
            .Where(a => ids.Contains(a.AssetId))
            .Select(a => new LatestAssignmentKey(a.Id, a.AssetId, a.Active, a.AssignedAt))
            .AsNoTracking()
            .ToListAsync())
            .GroupBy(a => a.AssetId)
            .Select(g => g
                .OrderByDescending(a => a.Active)
                .ThenByDescending(a => a.AssignedAt)
                .Select(a => a.Id)
                .First())
            .ToList();

        if (latestAssignmentIds.Count == 0) return new();

        return await _db.AssetWorkflowAssignments
            .Where(a => latestAssignmentIds.Contains(a.Id))
            .AsNoTracking()
            .ToDictionaryAsync(a => a.AssetId);
    }

    private sealed record LatestRunKey(string Id, string AssetId, DateTime StartedAt, DateTime UpdatedAt);
    private sealed record LatestAssignmentKey(string Id, string AssetId, bool Active, DateTime AssignedAt);
    private static DashboardWorkspaceDto EmptyDashboardWorkspace() =>
        new([], [], [], []);

    private static bool IsCurrentWorkspaceAsset(ProjectAssetEntity asset, AssetWorkflowRunEntity? latestRun)
    {
        if (asset.IsDeleted) return false;

        var assetStatus = (asset.Status ?? string.Empty).Trim().ToLowerInvariant().Replace(" ", string.Empty);
        var runStatus = (latestRun?.Status ?? string.Empty).Trim().ToLowerInvariant().Replace(" ", string.Empty);

        // Terminal asset states are checked FIRST. Previously the pending-installer
        // branch below returned true before this ran, so an asset cancelled while a
        // locked run awaited signature stayed in the technician's My Jobs forever.
        if (assetStatus is "complete" or "completed" or "closed" or "cancelled") return false;

        if (latestRun?.IsLocked == true && string.Equals(latestRun.SignatureStatus, "PendingInstaller", StringComparison.OrdinalIgnoreCase))
            return true;

        // Active assets that need work are "current" (includes Issue, Pending)
        if (runStatus is "paused" or "inprogress") return true;
        return assetStatus is "notstarted" or "inprogress" or "onhold" or "issue" or "pending";
    }

    private static string BuildHistoryStatus(ProjectAssetEntity asset, string? projectStatus, AssetWorkflowRunEntity? latestRun)
    {
        if (asset.IsDeleted) return "Deleted";

        var assetStatus = (asset.Status ?? string.Empty).Trim();
        var normalizedAssetStatus = assetStatus.ToLowerInvariant().Replace(" ", string.Empty);
        var normalizedProjectStatus = (projectStatus ?? string.Empty).Trim().ToLowerInvariant().Replace(" ", string.Empty);

        if (normalizedAssetStatus == "closed") return "Closed";
        if (normalizedAssetStatus is "complete" or "completed") return "Field Work Complete";
        if (normalizedAssetStatus == "cancelled" || normalizedProjectStatus == "cancelled") return "Cancelled";
        if (string.Equals(latestRun?.SignatureStatus, "PendingInstaller", StringComparison.OrdinalIgnoreCase)) return "Awaiting Installer Sign-off";
        if (latestRun?.CompletedAt is not null || latestRun?.IsLocked == true) return "Finished";
        if (normalizedProjectStatus == "completed") return "Closed";
        if (normalizedAssetStatus == "onhold") return "On Hold";
        return string.IsNullOrWhiteSpace(assetStatus) ? "Closed" : assetStatus;
    }

    private static bool IsInspectionWorkspaceAsset(
        string? projectWorkflowMode,
        string? assignmentWorkflowType,
        string? runWorkflowType,
        bool hasInspectionImport)
    {
        if (string.Equals(projectWorkflowMode, "INSPECTION_ONLY", StringComparison.OrdinalIgnoreCase))
            return true;

        if (IsInspectionWorkflowType(assignmentWorkflowType) || IsInspectionWorkflowType(runWorkflowType))
            return true;

        return hasInspectionImport;
    }

    private static bool IsInspectionWorkflowType(string? workflowType)
    {
        var normalized = (workflowType ?? string.Empty).Trim().ToLowerInvariant();
        return normalized == "wftype-inspection" || normalized == "inspection";
    }

    private static List<DashboardWorkspaceAssetDto> OrderCurrentWorkspaceItems(IEnumerable<DashboardWorkspaceAssetDto> items) =>
        items
            .OrderByDescending(i => NormalizeCurrentPriority(i.Status, i.RunStatus))
            .ThenByDescending(i => i.LatestActivityAt ?? DateTime.MinValue)
            .ThenBy(i => i.JobNumber)
            .ThenBy(i => i.AssetTag)
            .ToList();

    private static List<DashboardWorkspaceAssetDto> OrderHistoryWorkspaceItems(IEnumerable<DashboardWorkspaceAssetDto> items) =>
        items
            .OrderByDescending(i => i.CompletedAt ?? i.LatestActivityAt ?? i.DeletedAtUtc ?? DateTime.MinValue)
            .ThenBy(i => i.JobNumber)
            .ThenBy(i => i.AssetTag)
            .ToList();

    private static int NormalizeCurrentPriority(string status, string? runStatus)
    {
        var normalizedRun = (runStatus ?? string.Empty).Trim().ToLowerInvariant().Replace(" ", string.Empty);
        var normalizedStatus = (status ?? string.Empty).Trim().ToLowerInvariant().Replace(" ", string.Empty);
        if (normalizedRun == "inprogress" || normalizedStatus == "inprogress") return 3;
        if (normalizedRun == "paused") return 2;
        if (normalizedStatus == "notstarted") return 1;
        if (normalizedStatus == "onhold") return 0;
        return -1;
    }

    private static ProjectAssetWorkflowSummaryDto BuildWorkflowSummary(ProjectAssetEntity asset, AssetWorkflowRunEntity? latestRun, bool hasAssignedWorkflow = false, bool lightweight = false)
    {
        var hasWorkflow = hasAssignedWorkflow
            || !string.IsNullOrWhiteSpace(asset.ProductConfigId)
            || !string.IsNullOrWhiteSpace(asset.WorkflowTemplateId)
            || latestRun is not null;

        if (latestRun is null)
        {
            return new ProjectAssetWorkflowSummaryDto(
                hasWorkflow,
                hasWorkflow ? "Pending" : "None",
                0,
                0,
                0,
                null,
                null,
                false,
                null,
                HasOpenIssues(asset.IssuesJson),
                null,
                null
            );
        }

        var hasOpenIssues = HasOpenIssues(latestRun.IssuesJson) || HasOpenIssues(asset.IssuesJson);

        if (lightweight)
        {
            var lightweightEvidenceStatus = "Pending";
            if (string.Equals(latestRun.Status, "Paused", StringComparison.OrdinalIgnoreCase))
            {
                lightweightEvidenceStatus = "Paused";
            }
            else if (!latestRun.IsLocked || string.Equals(latestRun.Status, "InProgress", StringComparison.OrdinalIgnoreCase))
            {
                lightweightEvidenceStatus = "Running";
            }
            else
            {
                lightweightEvidenceStatus = "Complete";
            }

            return new ProjectAssetWorkflowSummaryDto(
                true,
                lightweightEvidenceStatus,
                0,
                0,
                0,
                latestRun.Id,
                latestRun.Status,
                latestRun.IsLocked,
                latestRun.SignatureStatus,
                hasOpenIssues,
                latestRun.StartedAt,
                latestRun.CompletedAt
            );
        }

        var counts = CountWorkflowEvidence(latestRun.WorkflowSnapshotJson, latestRun.StepResultsJson);
        var allStepsCompleted = HasCompletedAllWorkflowSteps(latestRun.WorkflowSnapshotJson, latestRun.StepResultsJson, latestRun.IsLocked);
        var evidenceStatus = "Pending";
        if (string.Equals(latestRun.Status, "Paused", StringComparison.OrdinalIgnoreCase))
        {
            evidenceStatus = "Paused";
        }
        else if (counts.MissingItems > 0 && allStepsCompleted)
        {
            evidenceStatus = "MissingData";
        }
        else if (!latestRun.IsLocked || string.Equals(latestRun.Status, "InProgress", StringComparison.OrdinalIgnoreCase))
        {
            evidenceStatus = "Running";
        }
        else
        {
            evidenceStatus = "Complete";
        }

        return new ProjectAssetWorkflowSummaryDto(
            true,
            evidenceStatus,
            counts.RequiredItems,
            counts.CompletedItems,
            counts.MissingItems,
            latestRun.Id,
            latestRun.Status,
            latestRun.IsLocked,
            latestRun.SignatureStatus,
            hasOpenIssues,
            latestRun.StartedAt,
            latestRun.CompletedAt
        );
    }

    private static bool HasOpenIssues(string? issuesJson)
    {
        if (string.IsNullOrWhiteSpace(issuesJson) || issuesJson == "[]") return false;
        try
        {
            var issues = JsonSerializer.Deserialize<List<JsonElement>>(issuesJson, _json) ?? [];
            return issues.Any(issue =>
                !issue.TryGetProperty("resolved", out var resolvedEl) ||
                resolvedEl.ValueKind != JsonValueKind.True);
        }
        catch
        {
            return false;
        }
    }

    private static (int RequiredItems, int CompletedItems, int MissingItems) CountWorkflowEvidence(string? workflowSnapshotJson, string? stepResultsJson)
    {
        var stepsById = ParseWorkflowSteps(workflowSnapshotJson)
            .Where(step => !string.IsNullOrWhiteSpace(step.Id))
            .ToDictionary(step => step.Id, step => step);

        if (stepsById.Count == 0 || string.IsNullOrWhiteSpace(stepResultsJson))
            return (0, 0, 0);

        try
        {
            var results = JsonSerializer.Deserialize<List<WorkflowStepResultSummary>>(stepResultsJson, _json) ?? [];
            var visitedStepIds = GetVisitedStepIds(results);
            var resultStepIds = results
                .Where(r => !string.Equals(r.StepId, "__nav__", StringComparison.OrdinalIgnoreCase))
                .Select(r => r.StepId)
                .Where(stepId => !string.IsNullOrWhiteSpace(stepId))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            int requiredItems = 0;
            int completedItems = 0;

            foreach (var result in results.Where(r => !string.Equals(r.StepId, "__nav__", StringComparison.OrdinalIgnoreCase)))
            {
                if (string.IsNullOrWhiteSpace(result.StepId) || !stepsById.TryGetValue(result.StepId, out var step))
                    continue;

                var values = result.Values ?? new Dictionary<string, string>();

                // Imported step results use generic keys (value/unit/pass/label/notes), not workflow input IDs.
                // Counting their required fields as missing is incorrect - skip them entirely.
                var inputDefs = step.Inputs ?? [];
                if (inputDefs.Count > 0 && values.Count > 0)
                {
                    var importOnlyKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "value", "unit", "pass", "label", "notes" };
                    bool allKeysImportOnly = values.Keys.All(k => importOnlyKeys.Contains(k));
                    bool noInputIdMatched = !inputDefs.Any(inp => values.ContainsKey(inp.Id));
                    if (allKeysImportOnly && noInputIdMatched)
                        continue;
                }

                foreach (var input in inputDefs)
                {
                    var raw = values.GetValueOrDefault(input.Id);
                    if (string.Equals(input.Type, "photo", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(input.Type, "video", StringComparison.OrdinalIgnoreCase))
                    {
                        requiredItems++;
                        if (GetMediaCaptureCount(raw) > 0) completedItems++;
                        continue;
                    }

                    if (input.Required && HasInputValue(input, raw))
                    {
                        requiredItems++;
                        completedItems++;
                    }
                    else if (input.Required)
                    {
                        requiredItems++;
                    }
                }

                foreach (var field in step.CaptureFields ?? [])
                {
                    if (!field.Required) continue;
                    requiredItems++;
                    if (!string.IsNullOrWhiteSpace(values.GetValueOrDefault(field.Id)))
                        completedItems++;
                }
            }

            foreach (var stepId in visitedStepIds)
            {
                if (string.IsNullOrWhiteSpace(stepId) || resultStepIds.Contains(stepId) || !stepsById.TryGetValue(stepId, out var step))
                    continue;

                requiredItems += (step.Inputs ?? []).Count(input =>
                    string.Equals(input.Type, "photo", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(input.Type, "video", StringComparison.OrdinalIgnoreCase) ||
                    input.Required);
                requiredItems += (step.CaptureFields ?? []).Count(field => field.Required);
            }

            return (requiredItems, completedItems, Math.Max(requiredItems - completedItems, 0));
        }
        catch
        {
            return (0, 0, 0);
        }
    }

    private static bool HasCompletedAllWorkflowSteps(string? workflowSnapshotJson, string? stepResultsJson, bool isLocked)
    {
        var stepsById = ParseWorkflowSteps(workflowSnapshotJson)
            .Where(step => !string.IsNullOrWhiteSpace(step.Id))
            .Select(step => step.Id)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        if (stepsById.Count == 0 || string.IsNullOrWhiteSpace(stepResultsJson))
            return false;

        try
        {
            var results = JsonSerializer.Deserialize<List<WorkflowStepResultSummary>>(stepResultsJson, _json) ?? [];
            var hasLockedNavigationTrail = isLocked && GetVisitedStepIds(results).Count > 0;
            if (hasLockedNavigationTrail)
                return true;

            var completedStepIds = results
                .Where(result => !string.Equals(result.StepId, "__nav__", StringComparison.OrdinalIgnoreCase))
                .Select(result => result.StepId)
                .Where(stepId => !string.IsNullOrWhiteSpace(stepId))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            return completedStepIds.Count >= stepsById.Count && stepsById.All(completedStepIds.Contains);
        }
        catch
        {
            return false;
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

            if (result.Values.TryGetValue("currentStepId", out var currentStepId) &&
                !string.IsNullOrWhiteSpace(currentStepId))
            {
                visited.Add(currentStepId);
            }

            if (!result.Values.TryGetValue("historyJson", out var historyJson) || string.IsNullOrWhiteSpace(historyJson))
                continue;

            try
            {
                var history = JsonSerializer.Deserialize<List<string>>(historyJson, _json) ?? [];
                foreach (var stepId in history.Where(stepId => !string.IsNullOrWhiteSpace(stepId)))
                {
                    visited.Add(stepId);
                }
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
            {
                return JsonSerializer.Deserialize<List<WorkflowStepSummary>>(stepsDoc.RootElement.GetRawText(), _json) ?? [];
            }

            if (stepsDoc.RootElement.ValueKind == JsonValueKind.Object
                && stepsDoc.RootElement.TryGetProperty("steps", out var stepsEl)
                && stepsEl.ValueKind == JsonValueKind.Array)
            {
                return JsonSerializer.Deserialize<List<WorkflowStepSummary>>(stepsEl.GetRawText(), _json) ?? [];
            }
        }
        catch { }

        return [];
    }

    private static bool HasInputValue(WorkflowInputSummary input, string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return false;

        if (string.Equals(input.Type, "component", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                var parsed = JsonSerializer.Deserialize<Dictionary<string, string>>(raw, _json) ?? new();
                return parsed.Values.Any(value => !string.IsNullOrWhiteSpace(value));
            }
            catch
            {
                return false;
            }
        }

        return !string.IsNullOrWhiteSpace(raw);
    }

    private static int GetMediaCaptureCount(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return 0;
        if (raw.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase)
            || raw.StartsWith("data:video/", StringComparison.OrdinalIgnoreCase))
        {
            return 1;
        }

        try
        {
            var parsed = JsonSerializer.Deserialize<List<string>>(raw, _json) ?? [];
            return parsed.Count(value => !string.IsNullOrWhiteSpace(value));
        }
        catch
        {
            return 0;
        }
    }

    private static ProjectAssetDto ToDto(ProjectAssetEntity a, ProjectAssetWorkflowSummaryDto? workflowSummary) =>
        new(a.Id, a.ProjectId, a.ProductId, a.ProductConfigId, a.WorkflowTemplateId,
            a.AssetTag, a.AssetName, a.SerialNumber, a.AssetModel, a.Manufacturer,
            a.Location, a.AssignedUserId, a.Status, a.WorkOrderId, a.Notes,
            a.FeatureValuesJson, a.IssuesJson, a.ConfigLabel, a.InstalledAt, a.InstalledBy,
            a.AsBuiltJson, a.CreatedAt, a.UpdatedAt, workflowSummary,
            a.IsDeleted, a.DeletedAtUtc, a.DeletedByUserId, a.DeleteReason);

    private sealed class WorkflowStepSummary
    {
        [System.Text.Json.Serialization.JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;
        [System.Text.Json.Serialization.JsonPropertyName("inputs")]
        public List<WorkflowInputSummary>? Inputs { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("captureFields")]
        public List<WorkflowCaptureFieldSummary>? CaptureFields { get; set; }
    }

    private sealed class WorkflowInputSummary
    {
        [System.Text.Json.Serialization.JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;
        [System.Text.Json.Serialization.JsonPropertyName("type")]
        public string Type { get; set; } = string.Empty;
        [System.Text.Json.Serialization.JsonPropertyName("required")]
        public bool Required { get; set; }
    }

    private sealed class WorkflowCaptureFieldSummary
    {
        [System.Text.Json.Serialization.JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;
        [System.Text.Json.Serialization.JsonPropertyName("required")]
        public bool Required { get; set; }
    }

    private sealed class WorkflowStepResultSummary
    {
        [System.Text.Json.Serialization.JsonPropertyName("stepId")]
        public string StepId { get; set; } = string.Empty;
        [System.Text.Json.Serialization.JsonPropertyName("values")]
        public Dictionary<string, string>? Values { get; set; }
    }
}
