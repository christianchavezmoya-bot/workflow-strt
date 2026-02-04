using System.Text.Json;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/installations")]
[Authorize]
public class InstallationsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly NotificationService _notifications;

    public InstallationsController(AppDbContext db, NotificationService notifications)
    {
        _db = db;
        _notifications = notifications;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<InstallationDto>>> GetAll([FromQuery] string? projectId)
    {
        var query = _db.Installations.AsQueryable();
        if (!string.IsNullOrWhiteSpace(projectId))
        {
            query = query.Where(i => i.ProjectId == projectId);
        }

        var installations = await query.OrderBy(i => i.ScheduledStart).ToListAsync();
        return Ok(installations.Select(ToDto));
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<InstallationDto>> Create([FromBody] InstallationDto request)
    {
        var installation = new InstallationEntity
        {
            Id = string.IsNullOrWhiteSpace(request.Id) ? Guid.NewGuid().ToString() : request.Id,
            ProjectId = request.ProjectId,
            InstallationNumber = request.InstallationNumber,
            InstallationId = request.InstallationId,
            InstallationName = request.InstallationName,
            SiteLocation = request.SiteLocation,
            SiteContactName = request.SiteContactName,
            SiteContactPhone = request.SiteContactPhone,
            SiteContactEmail = request.SiteContactEmail,
            ScheduledStart = request.ScheduledStart,
            ScheduledEnd = request.ScheduledEnd,
            ActualStart = request.ActualStart,
            ActualFinish = request.ActualFinish,
            Status = request.Status,
            AssignedTeam = request.AssignedTeam,
            AssignedUsers = request.AssignedUsers ?? new List<string>(),
            Office = request.Office,
            InstallerNotes = request.InstallerNotes,
            CustomerSignOffDate = request.CustomerSignOffDate,
            CustomerSignOffContact = request.CustomerSignOffContact,
            MachineType = request.MachineType,
            Pm1Serial = request.Pm1Serial,
            Pm2Serial = request.Pm2Serial,
            Pm3Serial = request.Pm3Serial,
            Pm4Serial = request.Pm4Serial,
            CustomFieldsJson = JsonSerializer.Serialize(request.CustomFields ?? new Dictionary<string, string>())
        };

        _db.Installations.Add(installation);
        await _db.SaveChangesAsync();
        if (string.Equals(installation.Status, "Completed", StringComparison.OrdinalIgnoreCase))
        {
            await _notifications.NotifyInstallationCompletedAsync(installation);
        }
        return CreatedAtAction(nameof(GetAll), new { id = installation.Id }, ToDto(installation));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<InstallationDto>> Update(string id, [FromBody] InstallationDto request)
    {
        var installation = await _db.Installations.FirstOrDefaultAsync(i => i.Id == id);
        if (installation is null)
        {
            return NotFound();
        }

        var previousStatus = installation.Status;
        installation.ProjectId = request.ProjectId;
        installation.InstallationNumber = request.InstallationNumber;
        installation.InstallationId = request.InstallationId;
        installation.InstallationName = request.InstallationName;
        installation.SiteLocation = request.SiteLocation;
        installation.SiteContactName = request.SiteContactName;
        installation.SiteContactPhone = request.SiteContactPhone;
        installation.SiteContactEmail = request.SiteContactEmail;
        installation.ScheduledStart = request.ScheduledStart;
        installation.ScheduledEnd = request.ScheduledEnd;
        installation.ActualStart = request.ActualStart;
        installation.ActualFinish = request.ActualFinish;
        installation.Status = request.Status;
        installation.AssignedTeam = request.AssignedTeam;
        installation.AssignedUsers = request.AssignedUsers ?? new List<string>();
        installation.Office = request.Office;
        installation.InstallerNotes = request.InstallerNotes;
        installation.CustomerSignOffDate = request.CustomerSignOffDate;
        installation.CustomerSignOffContact = request.CustomerSignOffContact;
        installation.MachineType = request.MachineType;
        installation.Pm1Serial = request.Pm1Serial;
        installation.Pm2Serial = request.Pm2Serial;
        installation.Pm3Serial = request.Pm3Serial;
        installation.Pm4Serial = request.Pm4Serial;
        installation.CustomFieldsJson = JsonSerializer.Serialize(request.CustomFields ?? new Dictionary<string, string>());

        await _db.SaveChangesAsync();
        if (!string.Equals(previousStatus, installation.Status, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(installation.Status, "Completed", StringComparison.OrdinalIgnoreCase))
        {
            await _notifications.NotifyInstallationCompletedAsync(installation);
        }
        return Ok(ToDto(installation));
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Delete(string id)
    {
        var installation = await _db.Installations.FirstOrDefaultAsync(i => i.Id == id);
        if (installation is null)
        {
            return NotFound();
        }

        _db.Installations.Remove(installation);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static InstallationDto ToDto(InstallationEntity installation)
        => new(
            installation.Id,
            installation.ProjectId,
            installation.InstallationNumber,
            installation.InstallationId,
            installation.InstallationName,
            installation.SiteLocation,
            installation.SiteContactName,
            installation.SiteContactPhone,
            installation.SiteContactEmail,
            installation.ScheduledStart,
            installation.ScheduledEnd,
            installation.ActualStart,
            installation.ActualFinish,
            installation.Status,
            installation.AssignedTeam,
            installation.AssignedUsers,
            installation.Office,
            installation.InstallerNotes,
            installation.CustomerSignOffDate,
            installation.CustomerSignOffContact,
            installation.MachineType,
            installation.Pm1Serial,
            installation.Pm2Serial,
            installation.Pm3Serial,
            installation.Pm4Serial,
            string.IsNullOrWhiteSpace(installation.CustomFieldsJson)
                ? new Dictionary<string, string>()
                : JsonSerializer.Deserialize<Dictionary<string, string>>(installation.CustomFieldsJson) ?? new Dictionary<string, string>()
        );
}
