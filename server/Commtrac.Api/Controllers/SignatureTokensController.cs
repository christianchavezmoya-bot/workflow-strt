using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/signature-tokens")]
[Authorize]
public class SignatureTokensController : ControllerBase
{
    private readonly AppDbContext _db;

    public SignatureTokensController(AppDbContext db) => _db = db;

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

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "unknown";
        var expiresHours = Math.Clamp(req.ExpiresInHours <= 0 ? 72 : req.ExpiresInHours, 1, 720);
        var now = DateTime.UtcNow;

        var token = new SignatureTokenEntity
        {
            RunId            = req.RunId,
            ContactId        = req.ContactId,
            RecipientEmail   = req.RecipientEmail,
            RecipientName    = req.RecipientName,
            CreatedByUserId  = userId,
            CreatedAtUtc     = now,
            ExpiresAtUtc     = now.AddHours(expiresHours),
            IsRevoked        = false
        };

        _db.SignatureTokens.Add(token);
        await _db.SaveChangesAsync();

        // Advance run status to PendingCustomer if installer has already signed
        if (run.SignatureStatus == "PendingCustomer")
        {
            // already correct
        }
        else if (run.SignatureStatus == "Signed" || run.SignatureStatus == "Declined")
        {
            return BadRequest(new { message = "Run is already fully signed or declined." });
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
        t.ExpiresAtUtc < DateTime.UtcNow
    );
}
