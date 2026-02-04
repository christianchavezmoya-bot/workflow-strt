using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/projects")]
[Authorize]
public class ProjectsController : ControllerBase
{
    private readonly AppDbContext _db;

    public ProjectsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<ProjectListResponse>> GetAll(
        [FromQuery] string? office,
        [FromQuery] string? status,
        [FromQuery] string? type,
        [FromQuery] string? search,
        [FromQuery] string? sortBy,
        [FromQuery] string? sortDir,
        [FromQuery] int? page,
        [FromQuery] int? pageSize
    )
    {
        var query = _db.Projects.AsQueryable();

        if (!string.IsNullOrWhiteSpace(office) && office != "All")
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
        return Ok(new ProjectListResponse(items.Select(ToDto).ToList(), total));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<ProjectDto>> GetById(string id)
    {
        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == id);
        if (project is null)
        {
            return NotFound();
        }

        return Ok(ToDto(project));
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<ProjectDto>> Create([FromBody] ProjectDto request)
    {
        var project = new ProjectEntity
        {
            Id = string.IsNullOrWhiteSpace(request.Id) ? Guid.NewGuid().ToString() : request.Id,
            CustomerName = request.CustomerName,
            CustomerId = request.CustomerId,
            JobNumber = request.JobNumber,
            Description = request.Description,
            StartDate = request.StartDate,
            FinishDate = request.FinishDate,
            Office = request.Office,
            Region = request.Region,
            ProjectType = request.ProjectType,
            Status = request.Status,
            ApprovalDecision = request.ApprovalDecision,
            IsInstallationProject = request.IsInstallationProject,
            InstallationMode = request.InstallationMode,
            ProjectManager = request.ProjectManager,
            ContractValue = request.ContractValue,
            ProbabilityStage = request.ProbabilityStage,
            ProductIds = request.ProductIds ?? new List<string>()
        };

        _db.Projects.Add(project);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = project.Id }, ToDto(project));
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

        project.CustomerName = request.CustomerName;
        project.CustomerId = request.CustomerId;
        project.JobNumber = request.JobNumber;
        project.Description = request.Description;
        project.StartDate = request.StartDate;
        project.FinishDate = request.FinishDate;
        project.Office = request.Office;
        project.Region = request.Region;
        project.ProjectType = request.ProjectType;
        project.Status = request.Status;
        project.ApprovalDecision = request.ApprovalDecision;
        project.IsInstallationProject = request.IsInstallationProject;
        project.InstallationMode = request.InstallationMode;
        project.ProjectManager = request.ProjectManager;
        project.ContractValue = request.ContractValue;
        project.ProbabilityStage = request.ProbabilityStage;
        project.ProductIds = request.ProductIds ?? new List<string>();

        await _db.SaveChangesAsync();
        return Ok(ToDto(project));
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

        project.Status = request.Status;
        project.ApprovalDecision = request.ApprovalDecision;
        await _db.SaveChangesAsync();
        return Ok(ToDto(project));
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Delete(string id)
    {
        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == id);
        if (project is null)
        {
            return NotFound();
        }

        _db.Projects.Remove(project);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static ProjectDto ToDto(ProjectEntity project)
        => new(
            project.Id,
            project.CustomerName,
            project.CustomerId,
            project.JobNumber,
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
            project.ProductIds
        );
}

public record ProjectListResponse(List<ProjectDto> Items, int Total);
