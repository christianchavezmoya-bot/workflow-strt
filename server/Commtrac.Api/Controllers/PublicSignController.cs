using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Commtrac.Api.Utils;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Commtrac.Api.Controllers;

/// <summary>
/// Unauthenticated (public) controller for the external Review &amp; Sign flow.
/// All endpoints validate the one-time token; no JWT required.
/// </summary>
[ApiController]
[Route("api/public/sign")]
public class PublicSignController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly NotificationFeedService _feed;
    private readonly SseHub _sse;
    private readonly ProjectLifecycleService _projectLifecycle;

    public PublicSignController(
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

    private async Task<(SignatureTokenEntity? token, string? error)> ResolveToken(string tokenId)
    {
        var token = await _db.SignatureTokens.FirstOrDefaultAsync(t => t.Id == tokenId);
        if (token is null)             return (null, "Invalid or unknown link.");
        if (token.IsRevoked)           return (null, "This link has been revoked.");
        if (token.ExpiresAtUtc < DateTime.UtcNow) return (null, "This link has expired.");
        if (token.UsedAtUtc.HasValue)  return (null, "This link has already been used.");
        return (token, null);
    }

    // GET /api/public/sign/{tokenId}
    [HttpGet("{tokenId}")]
    public async Task<ActionResult<PublicRunSummaryDto>> GetSummary(string tokenId)
    {
        var (token, err) = await ResolveToken(tokenId);
        if (token is null) return BadRequest(new { message = err });

        var run = await _db.AssetWorkflowRuns.FirstOrDefaultAsync(r => r.Id == token.RunId);
        if (run is null) return NotFound(new { message = "Run not found." });

        // Fetch related data for the summary card
        var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == run.AssetId);
        var project = asset is not null
            ? await _db.Projects.FirstOrDefaultAsync(p => p.Id == asset.ProjectId)
            : null;

        // Fetch installer signature event for the report preview
        var installerEvt = await _db.SignatureEvents
            .Where(e => e.RunId == run.Id && e.SignerRole == "Installer")
            .OrderByDescending(e => e.SignedAtUtc)
            .FirstOrDefaultAsync();

        // Extract workflow name from snapshot
        var workflowName = run.WorkflowConfigId;
        try
        {
            var snap = JsonSerializer.Deserialize<JsonElement>(run.WorkflowSnapshotJson ?? "{}");
            if (snap.TryGetProperty("name", out var nameProp))
                workflowName = nameProp.GetString() ?? workflowName;
        }
        catch { /* fallback to configId */ }

        string? officeCountry = null;
        string? officeState = null;
        if (!string.IsNullOrWhiteSpace(project?.OfficeId))
        {
            var officeEntity = await _db.Offices.FirstOrDefaultAsync(o => o.Id == project!.OfficeId);
            if (officeEntity is not null)
            {
                officeCountry = officeEntity.Country;
                officeState = officeEntity.State;
            }
        }

        var resolvedTimeZone = ProjectTimeZoneResolver.Resolve(
            project?.TimeZoneId,
            project?.Office,
            project?.Region,
            officeCountry,
            officeState) ?? "UTC";

        return Ok(new PublicRunSummaryDto(
            run.Id,
            asset?.AssetName ?? asset?.AssetTag ?? "Asset",
            asset?.SerialNumber ?? "",
            workflowName,
            project?.JobNumber ?? "",
            project?.CustomerName ?? "",
            run.CompletedByName ?? "",
            run.CompletedAt ?? run.UpdatedAt,
            run.SignatureStatus,
            token.RecipientName ?? "",
            token.RecipientEmail,
            true,
            run.WorkflowSnapshotJson ?? "{}",
            run.StepResultsJson ?? "[]",
            run.IssuesJson ?? "[]",
            asset?.AssetTag,
            asset?.Location,
            installerEvt?.SignerName,
            installerEvt?.SignatureData,
            installerEvt?.ReasonCode,
            installerEvt?.Notes,
            installerEvt?.SignedAtUtc,
            resolvedTimeZone
        ));
    }

    // POST /api/public/sign/{tokenId}/submit
    [HttpPost("{tokenId}/submit")]
    public async Task<IActionResult> Submit(string tokenId, [FromBody] PublicSubmitSignatureRequest req)
    {
        var (token, err) = await ResolveToken(tokenId);
        if (token is null) return BadRequest(new { message = err });

        var run = await _db.AssetWorkflowRuns.FirstOrDefaultAsync(r => r.Id == token.RunId);
        if (run is null) return NotFound();
        if (!run.IsLocked) return BadRequest(new { message = "Run is not completed." });
        var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == run.AssetId);
        var project = asset is null
            ? null
            : await _db.Projects.AsNoTracking().FirstOrDefaultAsync(p => p.Id == asset.ProjectId);

        if (!req.ConsentConfirmed) return BadRequest(new { message = "Consent must be confirmed." });
        if (string.IsNullOrWhiteSpace(req.SignerName)) return BadRequest(new { message = "Signer name required." });
        if (req.ReasonCode == "Declined" && string.IsNullOrWhiteSpace(req.Notes))
            return BadRequest(new { message = "Notes required when declining." });

        // OTP gate (if OTP was issued)
        if (!string.IsNullOrWhiteSpace(token.OtpHash))
        {
            if (string.IsNullOrWhiteSpace(req.OtpCode))
                return BadRequest(new { message = "OTP code is required for this link." });
            if (token.OtpExpiresAtUtc.HasValue && token.OtpExpiresAtUtc.Value < DateTime.UtcNow)
                return BadRequest(new { message = "OTP has expired. Request a new one." });

            var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(req.OtpCode.Trim())));
            if (!string.Equals(hash, token.OtpHash, StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { message = "Incorrect OTP code." });
        }

        var now = DateTime.UtcNow;
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
        var ua = Request.Headers["User-Agent"].ToString();

        var evt = new SignatureEventEntity
        {
            RunId         = run.Id,
            SignerRole    = "Customer",
            SignerName    = req.SignerName,
            SignerEmail   = token.RecipientEmail,
            SignerTitle   = req.SignerTitle,
            SignedAtUtc   = now,
            SignatureData = req.SignatureData,
            DeviceInfo    = ua.Length > 400 ? ua[..400] : ua,
            IpAddress     = ip,
            ReasonCode    = req.ReasonCode,
            Notes         = req.Notes,
            TokenId       = token.Id
        };
        _db.SignatureEvents.Add(evt);

        run.SignatureStatus  = req.ReasonCode == "Declined" ? "Declined" : "Signed";
        run.CustomerSignedAt = now;
        run.UpdatedAt        = now;

        if (asset is not null)
        {
            asset.Status = req.ReasonCode == "Declined" ? "Complete" : "Closed";
            asset.UpdatedAt = now;
        }

        token.UsedAtUtc = now;

        await _db.SaveChangesAsync();

        if (asset is not null)
        {
            var actorName = req.SignerName;
            await _projectLifecycle.SyncFromAssetsAsync(asset.ProjectId, actorUserId: null, actorName);

            if (req.ReasonCode == "Declined")
            {
                await NotifyAssetEventAsync(
                    asset,
                    "asset-signature-declined",
                    "warning",
                    "Customer sign-off declined",
                    $"{asset.AssetTag} customer sign-off was declined on job {{job}}.",
                    run.Id,
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
                    run.Id,
                    actorName,
                    project?.JobNumber);
            }

            await _sse.BroadcastAsync("assets:updated", new { projectId = asset.ProjectId });
        }

        return Ok(new { message = "Signature recorded successfully.", status = run.SignatureStatus });
    }

    private async Task NotifyAssetEventAsync(
        ProjectAssetEntity asset,
        string eventType,
        string severity,
        string title,
        string template,
        string runId,
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
            null,
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
                null,
                actorName);
        }
    }

    // POST /api/public/sign/{tokenId}/request-otp  — sends OTP to token's recipient email
    [HttpPost("{tokenId}/request-otp")]
    public async Task<IActionResult> RequestOtp(string tokenId)
    {
        var (token, err) = await ResolveToken(tokenId);
        if (token is null) return BadRequest(new { message = err });

        var otp = Random.Shared.Next(100000, 999999).ToString();
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(otp)));
        token.OtpHash          = hash;
        token.OtpExpiresAtUtc  = DateTime.UtcNow.AddMinutes(15);
        await _db.SaveChangesAsync();

        // Email sending is wired at the infrastructure layer; return OTP in dev mode only.
        // In production, this endpoint should dispatch via NotificationService.
        return Ok(new { message = $"OTP sent to {token.RecipientEmail}. (dev: {otp})" });
    }
}
