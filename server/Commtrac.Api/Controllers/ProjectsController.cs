using Commtrac.Api.Data;
using Commtrac.Api.Models;
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
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public ProjectsController(AppDbContext db)
    {
        _db = db;
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
        [FromQuery] int? pageSize
    )
    {
        var query = _db.Projects.AsQueryable();

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

            // Projects store Office as the office "city". Active office selection in the UI is country-based.
            // Include legacy rows where Office was already stored as a country.
            var countryAliases = Aliases(country);
            var citiesInCountry = await _db.Offices
                .Where(o => countryAliases.Contains(o.Country))
                .Where(o => o.City != null && o.City != "")
                .Select(o => o.City!)
                .ToListAsync();

            query = query.Where(p => countryAliases.Contains(p.Office) || citiesInCountry.Contains(p.Office));
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
        var siteIds = items.Select(p => p.SiteId).Where(id => !string.IsNullOrWhiteSpace(id)).Distinct().ToList();
        var sitesById = await _db.Sites
            .Where(s => siteIds.Contains(s.Id))
            .Select(s => new { s.Id, s.Name })
            .ToDictionaryAsync(s => s.Id, s => s.Name);

        return Ok(new ProjectListResponse(items.Select(p =>
        {
            var siteName = p.SiteId != null && sitesById.TryGetValue(p.SiteId, out var name) ? name : null;
            return ToDto(p, siteName);
        }).ToList(), total));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<ProjectDto>> GetById(string id)
    {
        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == id);
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
            Region = request.Region,
            ProjectType = request.ProjectType,
            Status = request.Status,
            ApprovalDecision = request.ApprovalDecision,
            IsInstallationProject = request.IsInstallationProject,
            InstallationMode = request.InstallationMode,
            ProjectManager = request.ProjectManager,
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

        project.CustomerName = request.CustomerName;
        project.CustomerId = request.CustomerId;
        project.SiteId = request.SiteId;
        project.JobNumber = request.JobNumber;
        project.PurchaseOrderNumber = request.PurchaseOrderNumber ?? string.Empty;
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
        var project = await _db.Projects.FirstOrDefaultAsync(p => p.Id == id);
        if (project is null)
        {
            return NotFound();
        }

        _db.Projects.Remove(project);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static ProjectDto ToDto(ProjectEntity project, string? siteName)
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
            project.IsInstallationProject,
            project.InstallationMode,
            project.ProjectManager,
            project.ContractValue,
            project.ProbabilityStage,
            project.ProductIds,
            string.IsNullOrWhiteSpace(project.ProductFeatureValuesJson)
                ? new Dictionary<string, string>()
                : JsonSerializer.Deserialize<Dictionary<string, string>>(project.ProductFeatureValuesJson, JsonOptions) ?? new Dictionary<string, string>()
        );
}

public record ProjectListResponse(List<ProjectDto> Items, int Total);
