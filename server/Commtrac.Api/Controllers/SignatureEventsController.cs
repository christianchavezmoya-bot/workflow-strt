using Commtrac.Api.Data;
using Commtrac.Api.Models;
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

    public SignatureEventsController(AppDbContext db) => _db = db;

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

        var role = req.SignerRole?.Trim() ?? "";
        if (role != "Installer" && role != "Customer")
            return BadRequest(new { message = "SignerRole must be 'Installer' or 'Customer'." });

        // Role order gate
        if (role == "Customer" && run.SignatureStatus != "PendingCustomer")
            return UnprocessableEntity(new { message = "Installer must sign before customer." });
        if (role == "Installer" && run.SignatureStatus != "PendingInstaller")
            return UnprocessableEntity(new { message = "Run is not awaiting installer signature." });

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
        }
        else // Customer
        {
            run.SignatureStatus  = req.ReasonCode == "Declined" ? "Declined" : "Signed";
            run.CustomerSignedAt = now;
        }

        run.UpdatedAt = now;
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(List), new { runId }, ToDto(entity));
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
        e.DeviceInfo,
        e.IpAddress,
        e.ReasonCode,
        e.Notes,
        e.TokenId
    );
}
