using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Commtrac.Api.Utils;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
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
// Exempt from the global fallback policy by design: external signers have no account.
// Every endpoint here validates the one-time signing token instead.
[AllowAnonymous]
public class PublicSignController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly NotificationFeedService _feed;
    private readonly SseHub _sse;
    private readonly ProjectLifecycleService _projectLifecycle;
    private readonly ResendEmailService _emailService;
    private readonly IHostEnvironment _environment;
    private readonly ILogger<PublicSignController> _logger;

    public PublicSignController(
        AppDbContext db,
        NotificationFeedService feed,
        SseHub sse,
        ProjectLifecycleService projectLifecycle,
        ResendEmailService emailService,
        IHostEnvironment environment,
        ILogger<PublicSignController> logger)
    {
        _db = db;
        _feed = feed;
        _sse = sse;
        _projectLifecycle = projectLifecycle;
        _emailService = emailService;
        _environment = environment;
        _logger = logger;
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

        string? assignedTechnicianName = null;
        if (!string.IsNullOrWhiteSpace(asset?.AssignedUserId))
        {
            assignedTechnicianName = await _db.Users
                .AsNoTracking()
                .Where(u => u.Id == asset!.AssignedUserId)
                .Select(u => u.FullName)
                .FirstOrDefaultAsync();
        }

        string? siteName = null;
        if (!string.IsNullOrWhiteSpace(project?.SiteId))
        {
            siteName = await _db.Sites
                .AsNoTracking()
                .Where(s => s.Id == project!.SiteId)
                .Select(s => s.Name)
                .FirstOrDefaultAsync();
        }

        string? customerLogo = null;
        if (!string.IsNullOrWhiteSpace(project?.CustomerId))
        {
            customerLogo = await _db.Customers
                .AsNoTracking()
                .Where(c => c.Id == project!.CustomerId)
                .Select(c => c.Logo)
                .FirstOrDefaultAsync();
        }

        var businessLogo = await _db.BrandSettings.AsNoTracking()
            .Where(s => s.Key == "logo")
            .Select(s => s.Value)
            .FirstOrDefaultAsync();
        var companyName = await _db.BrandSettings.AsNoTracking()
            .Where(s => s.Key == "app-name")
            .Select(s => s.Value)
            .FirstOrDefaultAsync();

        string? productFeaturesJson = null;
        if (!string.IsNullOrWhiteSpace(asset?.ProductId))
        {
            var featureRows = await (
                from pf in _db.ProductFeatures.AsNoTracking()
                join f in _db.Features.AsNoTracking() on pf.FeatureId equals f.Id
                where pf.ProductId == asset!.ProductId
                orderby pf.SortOrder
                select new
                {
                    f.Id,
                    f.Name,
                    f.Description,
                    f.ValueType,
                    f.OptionsJson,
                    f.SubPropertiesJson,
                    f.IsInventory,
                    f.CaptureFieldsJson,
                    f.Brand,
                    f.Supplier,
                    f.AlternativePartNumber,
                    f.ManufacturerPartNumber,
                    f.UnitPrice,
                    f.ProductLink,
                }
            ).ToListAsync();

            if (featureRows.Count > 0)
            {
                productFeaturesJson = JsonSerializer.Serialize(featureRows.Select(f => new
                {
                    id = f.Id,
                    name = f.Name,
                    description = f.Description,
                    valueType = f.ValueType,
                    options = ParseJsonStringArray(f.OptionsJson),
                    subProperties = ParseJsonElement(f.SubPropertiesJson),
                    isInventory = f.IsInventory,
                    captureFields = ParseJsonStringArray(f.CaptureFieldsJson),
                    brand = f.Brand,
                    supplier = f.Supplier,
                    alternativePartNumber = f.AlternativePartNumber,
                    manufacturerPartNumber = f.ManufacturerPartNumber,
                    unitPrice = f.UnitPrice,
                    productLink = f.ProductLink,
                }));
            }
        }

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
            token.SignerRole,
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
            resolvedTimeZone,
            project?.Office,
            project?.Region,
            officeCountry,
            officeState,
            run.StartedAt,
            run.TimeTrackingJson ?? "[]",
            run.ProductiveSeconds,
            run.DowntimeSeconds,
            run.DowntimeEvents,
            run.RunNumber,
            asset?.AssetModel,
            asset?.Manufacturer,
            siteName,
            assignedTechnicianName,
            businessLogo,
            customerLogo,
            companyName,
            productFeaturesJson,
            OtpRequired: !string.IsNullOrWhiteSpace(token.OtpHash)
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

        // OTP gate (if OTP was issued) — this is the actual security boundary; the frontend's
        // /verify-otp pre-check below exists only to drive UI sequencing, never to replace this.
        if (!TryValidateOtp(token, req.OtpCode, out var otpError))
            return BadRequest(new { message = otpError });

        var now = DateTime.UtcNow;
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
        var ua = Request.Headers["User-Agent"].ToString();
        var signerRole = string.Equals(token.SignerRole, "Installer", StringComparison.OrdinalIgnoreCase)
            ? "Installer"
            : "Customer";

        if (signerRole == "Installer" && run.SignatureStatus != "PendingInstaller")
            return BadRequest(new { message = "Run is not awaiting installer sign-off." });
        if (signerRole == "Customer" && run.SignatureStatus != "PendingCustomer")
            return BadRequest(new { message = "Installer must sign before customer." });

        var evt = new SignatureEventEntity
        {
            RunId         = run.Id,
            SignerRole    = signerRole,
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

        if (signerRole == "Installer")
        {
            run.SignatureStatus = "PendingCustomer";
            run.InstallerSignedAt = now;
        }
        else
        {
            run.SignatureStatus = req.ReasonCode == "Declined" ? "Declined" : "Signed";
            run.CustomerSignedAt = now;
        }
        run.UpdatedAt        = now;

        if (asset is not null)
        {
            asset.Status = signerRole == "Installer"
                ? "Complete"
                : (req.ReasonCode == "Declined" ? "Complete" : "Closed");
            asset.UpdatedAt = now;
        }

        token.UsedAtUtc = now;

        await _db.SaveChangesAsync();

        if (asset is not null)
        {
            var actorName = req.SignerName;
            await _projectLifecycle.SyncFromAssetsAsync(asset.ProjectId, actorUserId: null, actorName);

            if (signerRole == "Installer")
            {
                await NotifyAssetEventAsync(
                    asset,
                    "asset-completed",
                    "success",
                    "Asset completed",
                    $"{asset.AssetTag} field work was completed on job {{job}} and is now waiting for customer sign-off.",
                    run.Id,
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

    /// <summary>
    /// True delivery only. "simulated" means no Resend key/SMTP host is configured — the
    /// OTP was never actually sent anywhere, so it must not count as success outside
    /// Development, where a working transport is not expected to be present.
    /// </summary>
    private static bool IsGenuineDelivery(ResendEmailService.EmailSendResult result) =>
        result.Success && !string.Equals(result.Mode, "simulated", StringComparison.Ordinal);

    // POST /api/public/sign/{tokenId}/request-otp  — sends OTP to token's recipient email
    [HttpPost("{tokenId}/request-otp")]
    public async Task<IActionResult> RequestOtp(string tokenId, CancellationToken cancellationToken)
    {
        var (token, err) = await ResolveToken(tokenId);
        if (token is null) return BadRequest(new { message = err });

        // RandomNumberGenerator, not Random.Shared: this code is a genuine second factor,
        // not a UI nonce — it must not be predictable.
        var otp = RandomNumberGenerator.GetInt32(100_000, 1_000_000).ToString();
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(otp)));
        var expiresAtUtc = DateTime.UtcNow.AddMinutes(15);

        if (_environment.IsDevelopment())
        {
            // Dev convenience only: a working email transport is not expected locally, so
            // delivery is not required and the code is handed back directly. Never reachable
            // outside Development — see the non-Development branch below, which requires a
            // confirmed send before ever persisting/returning success.
            token.OtpHash = hash;
            token.OtpExpiresAtUtc = expiresAtUtc;
            await _db.SaveChangesAsync();
            return Ok(new { message = "OTP sent", devOtp = otp });
        }

        var subject = $"{AppBranding.AppName} sign-off verification code";
        var body =
            $"Your one-time verification code is: {otp}\n\n" +
            "This code expires in 15 minutes. If you did not request this, you can ignore this email.\n\n" +
            $"— {AppBranding.AppName}";

        // Send BEFORE persisting: on failure, any previously-issued still-valid OTP for this
        // token is left intact instead of being clobbered by one that was never delivered.
        var result = await _emailService.SendNotificationWithResultAsync(
            token.RecipientEmail, subject, body, cancellationToken);

        if (!IsGenuineDelivery(result))
        {
            // Deliberately generic — no recipient, no failure detail, no token state change.
            _logger.LogWarning(
                "OTP dispatch did not complete for token {TokenId} (mode={Mode}, success={Success})",
                token.Id, result.Mode, result.Success);
            return StatusCode(StatusCodes.Status502BadGateway,
                new { message = "Unable to send verification code. Please try again shortly." });
        }

        token.OtpHash = hash;
        token.OtpExpiresAtUtc = expiresAtUtc;
        await _db.SaveChangesAsync();

        return Ok(new { message = "OTP sent" });
    }

    /// <summary>
    /// Checks a submitted OTP code against the token's stored hash/expiry — the exact same
    /// check <see cref="Submit"/> performs before persisting a signature. If no OTP was ever
    /// issued for this token (<c>OtpHash</c> null), OTP is not required and this returns true.
    /// </summary>
    private static bool TryValidateOtp(SignatureTokenEntity token, string? otpCode, out string? error)
    {
        if (string.IsNullOrWhiteSpace(token.OtpHash))
        {
            error = null;
            return true;
        }

        if (string.IsNullOrWhiteSpace(otpCode))
        {
            error = "OTP code is required for this link.";
            return false;
        }
        if (token.OtpExpiresAtUtc.HasValue && token.OtpExpiresAtUtc.Value < DateTime.UtcNow)
        {
            error = "OTP has expired. Request a new one.";
            return false;
        }

        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(otpCode.Trim())));
        if (!string.Equals(hash, token.OtpHash, StringComparison.OrdinalIgnoreCase))
        {
            error = "Incorrect OTP code.";
            return false;
        }

        error = null;
        return true;
    }

    /// <summary>
    /// Pre-check only — lets the frontend confirm a code is correct before revealing the
    /// acknowledgement/submit step, without persisting anything or consuming the token. The
    /// real, authoritative OTP enforcement happens again inside <see cref="Submit"/>
    /// regardless of whether this endpoint was ever called; a client skipping straight to
    /// Submit gains nothing, since that gate is independent and re-validates from scratch.
    /// Rate-limited identically to Submit (same token/IP dimensions) since a successful call
    /// here is exactly as informative to an attacker as a successful Submit would be.
    /// </summary>
    // POST /api/public/sign/{tokenId}/verify-otp
    [HttpPost("{tokenId}/verify-otp")]
    public async Task<IActionResult> VerifyOtp(string tokenId, [FromBody] PublicVerifyOtpRequest req)
    {
        var (token, err) = await ResolveToken(tokenId);
        if (token is null) return BadRequest(new { message = err });

        if (!TryValidateOtp(token, req.OtpCode, out var otpError))
            return BadRequest(new { message = otpError });

        return Ok(new { verified = true });
    }

    private static string[] ParseJsonStringArray(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return Array.Empty<string>();
        try
        {
            return JsonSerializer.Deserialize<string[]>(json) ?? Array.Empty<string>();
        }
        catch
        {
            return Array.Empty<string>();
        }
    }

    private static JsonElement ParseJsonElement(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return JsonSerializer.Deserialize<JsonElement>("[]");
        try
        {
            return JsonSerializer.Deserialize<JsonElement>(json);
        }
        catch
        {
            return JsonSerializer.Deserialize<JsonElement>("[]");
        }
    }
}
