using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/issues")]
[Authorize]
public class IssuesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly NotificationService _notifications;

    public IssuesController(AppDbContext db, NotificationService notifications)
    {
        _db = db;
        _notifications = notifications;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<IssueDto>>> GetAll()
    {
        var issues = await _db.Issues.OrderByDescending(i => i.Id).ToListAsync();
        return Ok(issues.Select(ToDto));
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<IssueDto>> Create([FromBody] IssueDto request)
    {
        var issue = new IssueEntity
        {
            Id = string.IsNullOrWhiteSpace(request.Id) ? Guid.NewGuid().ToString() : request.Id,
            InstallationId = request.InstallationId,
            Title = request.Title,
            Status = request.Status,
            Priority = request.Priority,
            Owner = request.Owner,
            Description = request.Description
        };

        _db.Issues.Add(issue);
        await _db.SaveChangesAsync();
        await _notifications.NotifyIssueAssignedAsync(issue);
        return CreatedAtAction(nameof(GetAll), new { id = issue.Id }, ToDto(issue));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<IssueDto>> Update(string id, [FromBody] IssueDto request)
    {
        var issue = await _db.Issues.FirstOrDefaultAsync(i => i.Id == id);
        if (issue is null)
        {
            return NotFound();
        }

        issue.InstallationId = request.InstallationId;
        issue.Title = request.Title;
        issue.Status = request.Status;
        issue.Priority = request.Priority;
        issue.Owner = request.Owner;
        issue.Description = request.Description;

        await _db.SaveChangesAsync();
        return Ok(ToDto(issue));
    }

    private static IssueDto ToDto(IssueEntity issue)
        => new(
            issue.Id,
            issue.InstallationId,
            issue.Title,
            issue.Status,
            issue.Priority,
            issue.Owner,
            issue.Description
        );
}
