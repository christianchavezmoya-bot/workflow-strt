using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Claims;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/signature-tokens")]
[Authorize]
public class SignatureTokensController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IEmailSender _email;
    private readonly NotificationSettingsService _notificationSettings;

    public SignatureTokensController(AppDbContext db, IEmailSender email, NotificationSettingsService notificationSettings)
    {
        _db = db;
        _email = email;
        _notificationSettings = notificationSettings;
    }

    // GET /api/signature-tokens?runId=xxx
    [HttpGet]
    public async Task<ActionResult<List<SignatureTokenDto>>> List([FromQuery] string runId)
    {
        if (string.IsNullOrWhiteSpace(runId)) return BadRequest("runId required");
        var tokens = await _db.SignatureTokens
            .Where(t => t.RunId == runId)
            .OrderByDescending(t => t.CreatedAtUtc)
            .ToListAsync();
        return Ok(tokens.Select(ToDto).ToList());
    }

    // POST /api/signature-tokens
    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<SignatureTokenDto>> Create([FromBody] CreateSignatureTokenRequest req)
    {
        var run = await _db.AssetWorkflowRuns.FirstOrDefaultAsync(r => r.Id == req.RunId);
        if (run is null) return NotFound(new { message = "Run not found." });
        if (!run.IsLocked) return BadRequest(new { message = "Run must be completed before requesting customer signature." });
        if (run.SignatureStatus == "Signed" || run.SignatureStatus == "Declined" || run.SignatureStatus == "WaivedCustomer")
            return BadRequest(new { message = "Run is already finalized and cannot request customer signature." });
        if (run.SignatureStatus != "PendingCustomer")
            return BadRequest(new { message = "Customer signature can only be requested after installer sign-off." });
        if (string.IsNullOrWhiteSpace(req.RecipientEmail))
            return BadRequest(new { message = "Recipient email is required." });

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "unknown";
        var expiresHours = Math.Clamp(req.ExpiresInHours <= 0 ? 72 : req.ExpiresInHours, 1, 720);
        var now = DateTime.UtcNow;
        var normalizedEmail = req.RecipientEmail.Trim();
        var recipientName = req.RecipientName?.Trim();
        var asset = await _db.ProjectAssets.FirstOrDefaultAsync(a => a.Id == run.AssetId);
        var assetLabel = asset?.AssetTag ?? asset?.AssetName ?? asset?.SerialNumber ?? "Asset";
        var detectedLanBaseUrl = DetectLanFrontendBaseUrl(Request.Scheme);
        var baseUrl = (await _notificationSettings.GetFrontendBaseUrlAsync()).TrimEnd('/');
        if (string.IsNullOrWhiteSpace(baseUrl) || ShouldPreferDetectedLanBaseUrl(baseUrl, detectedLanBaseUrl))
        {
            baseUrl = detectedLanBaseUrl;
        }
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            baseUrl = "http://localhost:5173";
        }

        var token = new SignatureTokenEntity
        {
            RunId            = req.RunId,
            ContactId        = req.ContactId,
            RecipientEmail   = normalizedEmail,
            RecipientName    = recipientName,
            CreatedByUserId  = userId,
            CreatedAtUtc     = now,
            ExpiresAtUtc     = now.AddHours(expiresHours),
            IsRevoked        = false
        };

        // Auto-send the sign link to the recipient if an email address was provided
        if (!string.IsNullOrWhiteSpace(token.RecipientEmail))
        {
            _db.SignatureTokens.Add(token);
            await _db.SaveChangesAsync();

            var signLink = $"{baseUrl}/sign/{token.Id}";
            try
            {
                await _email.SendSignatureLinkAsync(
                    token.RecipientEmail,
                    token.RecipientName ?? "",
                    signLink,
                    assetLabel,
                    token.ExpiresAtUtc,
                    req.CustomMessage);
            }
            catch (Exception ex)
            {
                _db.SignatureTokens.Remove(token);
                await _db.SaveChangesAsync();
                return StatusCode(StatusCodes.Status502BadGateway, new
                {
                    message = $"Signature link could not be emailed for asset {assetLabel}. Check email settings and try again.",
                    detail = ex.Message
                });
            }
        }
        else
        {
            _db.SignatureTokens.Add(token);
            await _db.SaveChangesAsync();
        }

        return CreatedAtAction(nameof(List), new { runId = req.RunId }, ToDto(token));
    }

    // DELETE /api/signature-tokens/{id}  — revoke
    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<IActionResult> Revoke(string id)
    {
        var token = await _db.SignatureTokens.FirstOrDefaultAsync(t => t.Id == id);
        if (token is null) return NotFound();
        token.IsRevoked = true;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static SignatureTokenDto ToDto(SignatureTokenEntity t) => new(
        t.Id,
        t.RunId,
        t.ContactId,
        t.RecipientEmail,
        t.RecipientName,
        t.CreatedAtUtc,
        t.ExpiresAtUtc,
        t.UsedAtUtc,
        t.IsRevoked,
        t.ExpiresAtUtc < DateTime.UtcNow,
        true
    );

    private static string DetectLanFrontendBaseUrl(string requestScheme)
    {
        var detectedIp = DetectLanIpv4Address();
        if (string.IsNullOrWhiteSpace(detectedIp))
        {
            return "";
        }

        var scheme = string.IsNullOrWhiteSpace(requestScheme) ? "http" : requestScheme;
        return $"{scheme}://{detectedIp}:5173";
    }

    private static bool ShouldPreferDetectedLanBaseUrl(string configuredBaseUrl, string detectedLanBaseUrl)
    {
        if (string.IsNullOrWhiteSpace(detectedLanBaseUrl))
        {
            return false;
        }

        if (!Uri.TryCreate(configuredBaseUrl, UriKind.Absolute, out var configuredUri) ||
            !Uri.TryCreate(detectedLanBaseUrl, UriKind.Absolute, out var detectedUri))
        {
            return false;
        }

        return IsPrivateIpv4Host(configuredUri.Host) &&
               !string.Equals(configuredUri.Host, detectedUri.Host, StringComparison.OrdinalIgnoreCase);
    }

    private static string DetectLanIpv4Address()
    {
        try
        {
            var interfaces = NetworkInterface.GetAllNetworkInterfaces()
                .Where(nic =>
                    nic.OperationalStatus == OperationalStatus.Up &&
                    nic.NetworkInterfaceType != NetworkInterfaceType.Loopback &&
                    nic.NetworkInterfaceType != NetworkInterfaceType.Tunnel);

            foreach (var nic in interfaces)
            {
                var candidate = nic.GetIPProperties().UnicastAddresses
                    .Select(addr => addr.Address)
                    .FirstOrDefault(IsPrivateIpv4Address);

                if (candidate is not null)
                {
                    return candidate.ToString();
                }
            }
        }
        catch
        {
            // Fall back to an empty result.
        }

        return "";
    }

    private static bool IsPrivateIpv4Address(IPAddress address)
    {
        if (address.AddressFamily != AddressFamily.InterNetwork)
        {
            return false;
        }

        var bytes = address.GetAddressBytes();
        return bytes[0] == 10
            || (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31)
            || (bytes[0] == 192 && bytes[1] == 168);
    }

    private static bool IsPrivateIpv4Host(string host)
    {
        return IPAddress.TryParse(host, out var address) && IsPrivateIpv4Address(address);
    }
}
