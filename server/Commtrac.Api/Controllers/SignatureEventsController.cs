using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/signature-events")]
[Authorize]
public class SignatureEventsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly NotificationFeedService _feed;
    private readonly SseHub _sse;
    private readonly ProjectLifecycleService _projectLifecycle;

    public SignatureEventsController(
        AppDbContext db,
        NotificationFeedService feed,
        SseHub sse,
        ProjectLifecycleService projectLifecycle)
    {
        _db = db;
        _feed = feed;
        _sse = sse;
        _projectLifecycle = projectLifecycle;
    }

    // GET /api/signature-events?runId=xxx
    [HttpGet]
    public async Task<ActionResult<List<SignatureEventDto>>> List([FromQuery] string runId)
    {
        if (string.IsNullOrWhiteSpace(runId)) return BadRequest("runId required");
        var events = await _db.SignatureEvents
            .Where(e => e.RunId == runId)
            .OrderBy(e => e.SignedAtUtc)
            .ToListAsync();
        return Ok(events.Select(ToDto).ToList());
    }

    // POST /api/signature-events?runId=xxx
    [HttpPost]
    public async Task<ActionResult<SignatureEventDto>> Submit(
        [FromQuery] string runId,
        [FromBody] SubmitSignatureRequest req)
    {
        if (string.IsNullOrWhiteSpace(runId)) return BadRequest("runId required");
        if (!req.ConsentConfirmed) return BadRequest(new { message = "Consent must be confirmed before signing." });
        if (string.IsNullOrWhiteSpace(req.SignerName)) return BadRequest(new { message = "Signer name is required." });

        var run = await _db.AssetWorkflowRuns.FirstOrDefaultAsync(r => r.Id == runId);
        if (run is null) return NotFound();
        if (!run.IsLocked) return BadRequest(new { message = "Run must be completed before signing." });
        var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == run.AssetId);
        var project = asset is null ? null : await _db.Projects.AsNoTracking().FirstOrDefaultAsync(p => p.Id == asset.ProjectId);

        var role = req.SignerRole?.Trim() ?? "";
        if (role != "Installer" && role != "Customer")
            return BadRequest(new { message = "SignerRole must be 'Installer' or 'Customer'." });

        // Idempotent replay — phone may retry after a timeout once the event landed.
        var existingForRole = await _db.SignatureEvents
            .AsNoTracking()
            .Where(e => e.RunId == runId && e.SignerRole == role)
            .OrderByDescending(e => e.SignedAtUtc)
            .FirstOrDefaultAsync();
        if (existingForRole is not null)
            return Ok(ToDto(existingForRole));

        if (role == "Customer" && run.SignatureStatus != "PendingCustomer")
        {
            if (run.CustomerSignedAt.HasValue || run.SignatureStatus is "Signed" or "Declined")
            {
                var existingCustomer = await _db.SignatureEvents
                    .AsNoTracking()
                    .Where(e => e.RunId == runId && e.SignerRole == "Customer")
                    .OrderByDescending(e => e.SignedAtUtc)
                    .FirstOrDefaultAsync();
                if (existingCustomer is not null)
                    return Ok(ToDto(existingCustomer));
            }
            return UnprocessableEntity(new { message = "Installer must sign before customer." });
        }
        if (role == "Installer" && run.SignatureStatus != "PendingInstaller")
        {
            if (run.InstallerSignedAt.HasValue)
            {
                var existingInstaller = await _db.SignatureEvents
                    .AsNoTracking()
                    .Where(e => e.RunId == runId && e.SignerRole == "Installer")
                    .OrderByDescending(e => e.SignedAtUtc)
                    .FirstOrDefaultAsync();
                if (existingInstaller is not null)
                    return Ok(ToDto(existingInstaller));
            }
            return UnprocessableEntity(new { message = "Run is not awaiting installer signature." });
        }

        // Declined requires notes
        if (req.ReasonCode == "Declined" && string.IsNullOrWhiteSpace(req.Notes))
            return BadRequest(new { message = "Notes are required when declining." });

        var now = DateTime.UtcNow;
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
        var ua = Request.Headers["User-Agent"].ToString();

        var entity = new SignatureEventEntity
        {
            RunId         = runId,
            SignerRole    = role,
            SignerName    = req.SignerName,
            SignerEmail   = req.SignerEmail,
            SignerTitle   = req.SignerTitle,
            SignedAtUtc   = now,
            SignatureData = req.SignatureData,
            DeviceInfo    = ua.Length > 400 ? ua[..400] : ua,
            IpAddress     = ip,
            ReasonCode    = req.ReasonCode,
            Notes         = req.Notes
        };
        _db.SignatureEvents.Add(entity);

        // Advance signature status
        if (role == "Installer")
        {
            run.SignatureStatus   = "PendingCustomer";
            run.InstallerSignedAt = now;
            if (asset is not null)
            {
                asset.Status = "Complete";
                asset.UpdatedAt = now;
            }
        }
        else // Customer
        {
            run.SignatureStatus  = req.ReasonCode == "Declined" ? "Declined" : "Signed";
            run.CustomerSignedAt = now;
            if (asset is not null)
            {
                asset.Status = req.ReasonCode == "Declined" ? "Complete" : "Closed";
                asset.UpdatedAt = now;
            }
        }

        run.UpdatedAt = now;
        await _db.SaveChangesAsync();

        if (asset is not null)
        {
            var actorUserId = User.FindFirst("sub")?.Value
                ?? User.FindFirst("nameid")?.Value
                ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            var actorName = User.Identity?.Name
                ?? User.FindFirst("email")?.Value
                ?? User.FindFirst(System.Security.Claims.ClaimTypes.Name)?.Value
                ?? req.SignerName
                ?? "Unknown user";

            await _projectLifecycle.SyncFromAssetsAsync(asset.ProjectId, actorUserId, actorName);

            if (role == "Installer")
            {
                await NotifyAssetEventAsync(
                    asset,
                    "asset-completed",
                    "success",
                    "Asset completed",
                    $"{asset.AssetTag} field work was completed on job {{job}} and is now waiting for customer sign-off.",
                    runId,
                    actorUserId,
                    actorName,
                    project?.JobNumber);
            }
            else if (req.ReasonCode == "Declined")
            {
                await NotifyAssetEventAsync(
                    asset,
                    "asset-signature-declined",
                    "warning",
                    "Customer sign-off declined",
                    $"{asset.AssetTag} customer sign-off was declined on job {{job}}.",
                    runId,
                    actorUserId,
                    actorName,
                    project?.JobNumber);
            }
            else
            {
                await NotifyAssetEventAsync(
                    asset,
                    "asset-closed",
                    "info",
                    "Asset closed",
                    $"{asset.AssetTag} was customer-signed and closed on job {{job}}.",
                    runId,
                    actorUserId,
                    actorName,
                    project?.JobNumber);
            }

            await _sse.BroadcastAsync("assets:updated", new { projectId = asset.ProjectId });
        }

        return CreatedAtAction(nameof(List), new { runId }, ToDto(entity));
    }

    private async Task NotifyAssetEventAsync(
        ProjectAssetEntity asset,
        string eventType,
        string severity,
        string title,
        string template,
        string runId,
        string? actorUserId,
        string actorName,
        string? jobNumber)
    {
        var message = template.Replace("{job}", jobNumber ?? "unknown", StringComparison.Ordinal);

        await _feed.NotifyRolesAsync(
            eventType,
            severity,
            title,
            message,
            ["Admin", "Project Manager"],
            asset.ProjectId,
            asset.Id,
            runId,
            "project-asset",
            asset.Id,
            actorUserId,
            actorName);

        if (!string.IsNullOrWhiteSpace(asset.AssignedUserId))
        {
            await _feed.NotifyUsersAsync(
                eventType,
                severity,
                title,
                message,
                [asset.AssignedUserId],
                asset.ProjectId,
                asset.Id,
                runId,
                "project-asset",
                asset.Id,
                actorUserId,
                actorName);
        }
    }

    private static SignatureEventDto ToDto(SignatureEventEntity e) => new(
        e.Id,
        e.RunId,
        e.SignerRole,
        e.SignerName,
        e.SignerEmail,
        e.SignerTitle,
        e.SignedAtUtc,
        !string.IsNullOrEmpty(e.SignatureData),
        e.SignatureData,
        e.DeviceInfo,
        e.IpAddress,
        e.ReasonCode,
        e.Notes,
        e.TokenId
    );
}
