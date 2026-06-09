using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/asset-workflow-assignments")]
[Authorize]
public class AssetWorkflowAssignmentsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly NotificationFeedService _feed;
    private readonly ILogger<AssetWorkflowAssignmentsController> _logger;
    public AssetWorkflowAssignmentsController(AppDbContext db, NotificationFeedService feed, ILogger<AssetWorkflowAssignmentsController> logger)
    {
        _db = db;
        _feed = feed;
        _logger = logger;
    }

    // GET api/asset-workflow-assignments/by-asset/{assetId}
    [HttpGet("by-asset/{assetId}")]
    public async Task<IActionResult> ListByAsset(string assetId)
    {
        try
        {
            var assignments = await _db.AssetWorkflowAssignments
                .Where(a => a.AssetId == assetId && a.Active)
                .OrderBy(a => a.AssignedAt)
                .ToListAsync();

            // Enrich with names via lookup
            var configIds = assignments.Select(a => a.WorkflowConfigId).Distinct().ToList();
            var typeIds = assignments.Select(a => a.WorkflowTypeId).Distinct().ToList();

            var configs = await _db.WorkflowConfigs
                .Where(c => configIds.Contains(c.Id))
                .Select(c => new { c.Id, c.Name })
                .ToDictionaryAsync(c => c.Id, c => c.Name);

            var types = await _db.WorkflowTypes
                .Where(t => typeIds.Contains(t.Id))
                .Select(t => new { t.Id, t.Name })
                .ToDictionaryAsync(t => t.Id, t => t.Name);

            // Hide stale assignments that reference deleted workflow configs.
            // This avoids repeated 404s when the UI tries to load a missing config.
            var dtos = assignments
                .Where(a => configs.ContainsKey(a.WorkflowConfigId))
                .Select(a => new AssetWorkflowAssignmentDto(
                    a.Id, a.AssetId, a.WorkflowConfigId, a.WorkflowTypeId,
                    types.GetValueOrDefault(a.WorkflowTypeId, a.WorkflowTypeId),
                    configs[a.WorkflowConfigId],
                    a.Active, a.AssignedBy, a.AssignedAt
                ));
            return Ok(dtos);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to list workflow assignments for asset {AssetId}", assetId);
            return Ok(Array.Empty<AssetWorkflowAssignmentDto>());
        }
    }

    // POST api/asset-workflow-assignments
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateAssignmentRequest req)
    {
        var config = await _db.WorkflowConfigs.FirstOrDefaultAsync(c => c.Id == req.WorkflowConfigId);
        if (config is null) return BadRequest(new { message = "WorkflowConfig not found." });
        if (config.Status != "Published")
            return BadRequest(new { message = "Only Published configurations can be assigned." });

        var currentUserId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var currentUserRole = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value ?? "";
        var isManager = currentUserRole == "Admin" || currentUserRole == "Project Manager";
        
        var assignedBy = User.Identity?.Name ?? User.FindFirst("email")?.Value;
        var entity = new AssetWorkflowAssignmentEntity
        {
            Id               = Guid.NewGuid().ToString(),
            AssetId          = req.AssetId,
            WorkflowConfigId = req.WorkflowConfigId,
            WorkflowTypeId   = req.WorkflowTypeId,
            Active           = true,
            AssignedBy       = assignedBy,
            AssignedAt       = DateTime.UtcNow,
        };
        _db.AssetWorkflowAssignments.Add(entity);
        
        // Get asset and project info
        var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == req.AssetId);
        var project = asset is null ? null : await _db.Projects.FirstOrDefaultAsync(p => p.Id == asset.ProjectId);
        
        // For non-managers, auto-assign the asset to themselves if not already assigned
        if (!isManager && asset is not null && string.IsNullOrWhiteSpace(asset.AssignedUserId))
        {
            asset.AssignedUserId = currentUserId;
            _logger.LogInformation("Self-assignment: Asset {AssetId} auto-assigned to user {UserId}", asset.Id, currentUserId);
        }
        
        await _db.SaveChangesAsync();

        var typeName   = (await _db.WorkflowTypes.FirstOrDefaultAsync(t => t.Id == req.WorkflowTypeId))?.Name ?? req.WorkflowTypeId;
        var configName = config.Name;

        // Notify Admins and PMs about the workflow assignment
        await _feed.NotifyRolesAsync(
            "workflow-assigned",
            "info",
            $"Workflow assigned to {asset?.AssetTag ?? req.AssetId}",
            $"{typeName} / {configName} was assigned to asset {asset?.AssetTag ?? req.AssetId} on job {project?.JobNumber ?? "unknown"}.",
            ["Admin", "Project Manager"],
            asset?.ProjectId,
            asset?.Id,
            null,
            "asset-workflow-assignment",
            entity.Id,
            null,
            assignedBy
        );

        // Notify the assigned user (if different from the assigner, or if self-assigned)
        if (!string.IsNullOrWhiteSpace(asset?.AssignedUserId))
        {
            await _feed.NotifyUsersAsync(
                "workflow-assigned-to-installer",
                "info",
                $"New workflow assigned: {typeName}",
                $"{typeName} / {configName} was assigned to asset {asset.AssetTag} on job {project?.JobNumber ?? "unknown"}.",
                [asset.AssignedUserId],
                asset.ProjectId,
                asset.Id,
                null,
                "asset-workflow-assignment",
                entity.Id,
                null,
                assignedBy
            );
        }
        
        // If this was a self-assignment by a non-manager, also notify the project's PM
        if (!isManager && project is not null && !string.IsNullOrWhiteSpace(project.ProjectManager))
        {
            var pmUser = await _db.Users.FirstOrDefaultAsync(u => u.FullName == project.ProjectManager);
            if (pmUser is not null)
            {
                var selfAssignerName = User.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value ?? "A technician";
                await _feed.NotifyUsersAsync(
                    "workflow-self-assigned",
                    "info",
                    $"{selfAssignerName} self-assigned a workflow",
                    $"{selfAssignerName} assigned {typeName} / {configName} to asset {asset?.AssetTag ?? req.AssetId} on job {project.JobNumber}.",
                    [pmUser.Id],
                    project.Id,
                    asset?.Id,
                    null,
                    "asset-workflow-assignment",
                    entity.Id,
                    null,
                    currentUserId
                );
            }
        }

        return Ok(new AssetWorkflowAssignmentDto(
            entity.Id, entity.AssetId, entity.WorkflowConfigId, entity.WorkflowTypeId,
            typeName, configName, entity.Active, entity.AssignedBy, entity.AssignedAt));
    }

    // DELETE api/asset-workflow-assignments/{id}
    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Delete(string id)
    {
        var entity = await _db.AssetWorkflowAssignments.FirstOrDefaultAsync(a => a.Id == id);
        if (entity is null) return NotFound();
        entity.Active = false;
        await _db.SaveChangesAsync();

        var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == entity.AssetId);
        var project = asset is null ? null : await _db.Projects.FirstOrDefaultAsync(p => p.Id == asset.ProjectId);
        await _feed.NotifyRolesAsync(
            "workflow-unassigned",
            "warning",
            $"Workflow assignment removed from {asset?.AssetTag ?? entity.AssetId}",
            $"A workflow assignment was removed from asset {asset?.AssetTag ?? entity.AssetId} on job {project?.JobNumber ?? "unknown"}.",
            ["Admin", "Project Manager"],
            asset?.ProjectId,
            asset?.Id,
            null,
            "asset-workflow-assignment",
            entity.Id,
            null,
            User.Identity?.Name ?? User.FindFirst("email")?.Value
        );
        return NoContent();
    }
}
