using System.Security.Claims;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

/// <summary>
/// Receives fault reports from the web and phone apps (user-raised or captured from a crash)
/// and exposes them to admins for triage. See docs/BUG_TRIAGE.md.
/// </summary>
[ApiController]
[Route("api/fault-reports")]
[Authorize]
public class FaultReportsController : ControllerBase
{
    // Diagnostics bundles are small but a crash loop could submit many; cap what we store.
    private const int MaxDiagnosticsChars = 400_000;
    private const int MaxStackChars = 20_000;
    private const int MaxBreadcrumbChars = 20_000;
    private const int MaxActionChars = 4_000;

    private static readonly string[] AllowedKinds = ["user-report", "crash", "unhandled-rejection"];
    private static readonly string[] AllowedSeverities = ["S0", "S1", "S2", "S3", "S4"];
    private static readonly string[] AllowedStatuses = ["New", "Investigating", "Fixed", "WontFix", "Duplicate"];

    private readonly AppDbContext _db;
    private readonly NotificationFeedService _feed;
    private readonly SseHub _sse;
    private readonly ILogger<FaultReportsController> _logger;

    public FaultReportsController(
        AppDbContext db,
        NotificationFeedService feed,
        SseHub sse,
        ILogger<FaultReportsController> logger)
    {
        _db = db;
        _feed = feed;
        _sse = sse;
        _logger = logger;
    }

    /// <summary>
    /// Submit a fault. Any signed-in user may report, since anyone can hit a bug.
    /// Returns the reference code so the app can show it to the user.
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<FaultReportDto>> Submit([FromBody] SubmitFaultReportRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Title))
        {
            return BadRequest(new { error = "title required" });
        }

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var userEmail = User.FindFirstValue(ClaimTypes.Email);
        var userRole = User.FindFirstValue("role");

        // Reuse the code the client already showed the user, when it looks like ours.
        var reference = NormalizeReference(request.ClientReferenceCode) ?? GenerateReference();

        var now = DateTime.UtcNow;

        var entity = new FaultReportEntity
        {
            ReferenceCode = reference,
            Kind = Pick(request.Kind, AllowedKinds, "user-report"),
            Severity = Pick(request.Severity, AllowedSeverities, "S2"),
            Status = "New",
            Title = Truncate(request.Title.Trim(), 200)!,
            Description = request.Description,
            Platform = string.IsNullOrWhiteSpace(request.Platform) ? "web" : Truncate(request.Platform.Trim(), 20)!,
            AppVersion = Truncate(request.AppVersion, 40),
            UserAgent = Truncate(request.UserAgent, 500),
            RoutePath = Truncate(request.RoutePath, 300),
            UserId = userId,
            UserEmail = userEmail,
            UserRole = userRole,
            ErrorName = Truncate(request.ErrorName, 200),
            ErrorMessage = Truncate(request.ErrorMessage, 2000),
            ErrorStack = Truncate(request.ErrorStack, MaxStackChars),
            TraceId = Truncate(request.TraceId, 100),
            BreadcrumbsJson = Truncate(request.BreadcrumbsJson, MaxBreadcrumbChars),
            DiagnosticsJson = Truncate(request.DiagnosticsJson, MaxDiagnosticsChars),
            WasOffline = request.WasOffline ?? false,
            OccurredAtUtc = request.OccurredAtUtc ?? DateTime.UtcNow,
            CreatedAtUtc = now,
        };

        _db.FaultReports.Add(entity);
        await _db.SaveChangesAsync();

        await _feed.NotifyRolesAsync(
            eventType: "fault-report-created",
            severity: ToNotificationSeverity(entity.Severity),
            title: $"Fault report {entity.ReferenceCode}",
            message: BuildNotificationMessage(entity),
            recipientRoles: ["Admin"],
            entityType: "fault-report",
            entityId: entity.Id,
            triggeredByUserId: userId,
            triggeredByName: PickTriggeredByName(userEmail, userRole, entity.Platform));

        await BroadcastUpdatedAsync(entity, entity.CreatedAtUtc);

        // Also emit to the server log so it lands wherever cloud logs are shipped.
        _logger.LogWarning(
            "Fault report {Reference} ({Kind}/{Severity}) from {Platform} v{AppVersion} at {Route}: {Title}",
            entity.ReferenceCode, entity.Kind, entity.Severity, entity.Platform,
            entity.AppVersion ?? "?", entity.RoutePath ?? "?", entity.Title);

        return CreatedAtAction(nameof(GetById), new { id = entity.Id }, ToDto(entity, entity.CreatedAtUtc));
    }

    /// <summary>List reports for triage, newest first.</summary>
    [HttpGet]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<List<FaultReportDto>>> List(
        [FromQuery] string? status,
        [FromQuery] string? severity,
        [FromQuery] string? platform,
        [FromQuery] int take = 100)
    {
        var query = _db.FaultReports.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(status) && !string.Equals(status, "all", StringComparison.OrdinalIgnoreCase))
        {
            if (string.Equals(status, "unresolved", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(r => r.Status == "New" || r.Status == "Investigating");
            }
            else
            {
                query = query.Where(r => r.Status == status);
            }
        }

        if (!string.IsNullOrWhiteSpace(severity))
        {
            query = query.Where(r => r.Severity == severity);
        }

        if (!string.IsNullOrWhiteSpace(platform))
        {
            query = query.Where(r => r.Platform == platform);
        }

        var rows = await query
            .Select(r => new
            {
                Report = r,
                LastUpdatedAtUtc = _db.FaultReportUpdates
                    .Where(u => u.FaultReportId == r.Id)
                    .Max(u => (DateTime?)u.CreatedAtUtc) ?? r.CreatedAtUtc,
            })
            .OrderByDescending(r => r.LastUpdatedAtUtc)
            .ThenByDescending(r => r.Report.CreatedAtUtc)
            .Take(Math.Clamp(take, 1, 500))
            .ToListAsync();

        return Ok(rows.Select(row => ToDto(row.Report, row.LastUpdatedAtUtc)).ToList());
    }

    /// <summary>Counts for the admin dashboard card.</summary>
    [HttpGet("summary")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<FaultReportSummaryDto>> Summary()
    {
        var since = DateTime.UtcNow.AddDays(-7);
        var rows = await _db.FaultReports
            .AsNoTracking()
            .Select(r => new { r.Status, r.CreatedAtUtc })
            .ToListAsync();

        return Ok(new FaultReportSummaryDto(
            Total: rows.Count,
            New: rows.Count(r => r.Status == "New"),
            Investigating: rows.Count(r => r.Status == "Investigating"),
            Unresolved: rows.Count(r => r.Status == "New" || r.Status == "Investigating"),
            LastSevenDays: rows.Count(r => r.CreatedAtUtc >= since)));
    }

    /// <summary>Full report including stack, breadcrumbs, diagnostics and the update history.</summary>
    [HttpGet("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<FaultReportDetailDto>> GetById(string id)
    {
        var entity = await _db.FaultReports.AsNoTracking().FirstOrDefaultAsync(r => r.Id == id);
        if (entity is null) return NotFound();

        return Ok(await BuildDetailAsync(entity));
    }

    /// <summary>Look up by the code the user quotes over the phone.</summary>
    [HttpGet("by-reference/{reference}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<FaultReportDetailDto>> GetByReference(string reference)
    {
        var normalized = NormalizeReference(reference);
        if (normalized is null) return NotFound();

        var entity = await _db.FaultReports.AsNoTracking()
            .FirstOrDefaultAsync(r => r.ReferenceCode == normalized);
        if (entity is null) return NotFound();

        return Ok(await BuildDetailAsync(entity));
    }

    /// <summary>
    /// Record a corrective action against a report. Appending rather than editing keeps the
    /// history an audit trail, and moves the report's own status on so the list stays accurate.
    /// </summary>
    [HttpPost("{id}/updates")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<FaultReportUpdateDto>> AddUpdate(
        string id,
        [FromBody] AddFaultReportUpdateRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Action))
        {
            return BadRequest(new { error = "action required" });
        }

        var report = await _db.FaultReports.FirstOrDefaultAsync(r => r.Id == id);
        if (report is null) return NotFound();

        var status = Pick(request.Status, AllowedStatuses, report.Status);

        var update = new FaultReportUpdateEntity
        {
            FaultReportId = report.Id,
            Action = Truncate(request.Action.Trim(), MaxActionChars)!,
            Status = status,
            AuthorUserId = User.FindFirstValue(ClaimTypes.NameIdentifier),
            AuthorName = User.FindFirstValue("name") ?? User.FindFirstValue(ClaimTypes.Email),
            SystemGenerated = false,
            CreatedAtUtc = DateTime.UtcNow,
        };

        _db.FaultReportUpdates.Add(update);
        ApplyStatus(report, status);

        await _db.SaveChangesAsync();
        await BroadcastUpdatedAsync(report, update.CreatedAtUtc);
        return Ok(ToUpdateDto(update));
    }

    /// <summary>Triage: change status/severity or add notes.</summary>
    [HttpPatch("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<FaultReportDto>> Update(string id, [FromBody] UpdateFaultReportRequest request)
    {
        var entity = await _db.FaultReports.FirstOrDefaultAsync(r => r.Id == id);
        if (entity is null) return NotFound();
        var changed = false;
        DateTime? lastUpdatedAtUtc = null;

        if (!string.IsNullOrWhiteSpace(request.Status))
        {
            if (!AllowedStatuses.Contains(request.Status))
            {
                return BadRequest(new { error = $"status must be one of {string.Join(", ", AllowedStatuses)}" });
            }

            // Record the transition so the history explains how the report reached its status,
            // rather than the status silently changing with no trace of who or when.
            if (entity.Status != request.Status)
            {
                _db.FaultReportUpdates.Add(new FaultReportUpdateEntity
                {
                    FaultReportId = entity.Id,
                    Action = $"Status changed from {entity.Status} to {request.Status}.",
                    Status = request.Status,
                    AuthorUserId = User.FindFirstValue(ClaimTypes.NameIdentifier),
                    AuthorName = User.FindFirstValue("name") ?? User.FindFirstValue(ClaimTypes.Email),
                    SystemGenerated = true,
                    CreatedAtUtc = DateTime.UtcNow,
                });
                lastUpdatedAtUtc = DateTime.UtcNow;
                changed = true;
            }

            ApplyStatus(entity, request.Status);
        }

        if (!string.IsNullOrWhiteSpace(request.Severity))
        {
            if (!AllowedSeverities.Contains(request.Severity))
            {
                return BadRequest(new { error = $"severity must be one of {string.Join(", ", AllowedSeverities)}" });
            }

            if (entity.Severity != request.Severity)
            {
                changed = true;
            }
            entity.Severity = request.Severity;
        }

        if (request.Notes is not null)
        {
            if (!string.Equals(entity.Notes ?? "", request.Notes ?? "", StringComparison.Ordinal))
            {
                changed = true;
            }
            entity.Notes = request.Notes;
        }

        if (!changed)
        {
            return Ok(ToDto(entity, await GetLastUpdatedAtUtcAsync(entity.Id, entity.CreatedAtUtc)));
        }

        await _db.SaveChangesAsync();
        var resolvedLastUpdatedAtUtc = lastUpdatedAtUtc ?? await GetLastUpdatedAtUtcAsync(entity.Id, entity.CreatedAtUtc);
        await BroadcastUpdatedAsync(entity, resolvedLastUpdatedAtUtc);
        return Ok(ToDto(entity, resolvedLastUpdatedAtUtc));
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(string id)
    {
        var entity = await _db.FaultReports.FirstOrDefaultAsync(r => r.Id == id);
        if (entity is null) return NotFound();

        var updates = await _db.FaultReportUpdates.Where(u => u.FaultReportId == id).ToListAsync();
        _db.FaultReportUpdates.RemoveRange(updates);
        _db.FaultReports.Remove(entity);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private async Task<FaultReportDetailDto> BuildDetailAsync(FaultReportEntity entity)
    {
        var updates = await _db.FaultReportUpdates
            .AsNoTracking()
            .Where(u => u.FaultReportId == entity.Id)
            .OrderBy(u => u.CreatedAtUtc)
            .ToListAsync();

        var lastUpdatedAtUtc = updates.LastOrDefault()?.CreatedAtUtc ?? entity.CreatedAtUtc;

        return new FaultReportDetailDto(
            ToDto(entity, lastUpdatedAtUtc),
            entity.ErrorStack,
            entity.BreadcrumbsJson,
            entity.DiagnosticsJson,
            updates.Select(ToUpdateDto).ToList());
    }

    private static void ApplyStatus(FaultReportEntity entity, string status)
    {
        entity.Status = status;
        var resolved = status is "Fixed" or "WontFix" or "Duplicate";
        entity.ResolvedAtUtc = resolved ? (entity.ResolvedAtUtc ?? DateTime.UtcNow) : null;
    }

    private static FaultReportUpdateDto ToUpdateDto(FaultReportUpdateEntity u) => new(
        u.Id, u.Action, u.Status, u.AuthorName, u.SystemGenerated, u.CreatedAtUtc);

    private static FaultReportDto ToDto(FaultReportEntity e, DateTime lastUpdatedAtUtc) => new(
        e.Id, e.ReferenceCode, e.Kind, e.Severity, e.Status, e.Title, e.Description,
        e.Platform, e.AppVersion, e.UserAgent, e.RoutePath, e.UserId, e.UserEmail, e.UserRole,
        e.ErrorName, e.ErrorMessage, e.TraceId, e.WasOffline, e.OccurredAtUtc, e.CreatedAtUtc, lastUpdatedAtUtc,
        e.Notes, e.ResolvedAtUtc);

    private async Task<DateTime> GetLastUpdatedAtUtcAsync(string faultReportId, DateTime fallbackUtc)
    {
        var latestUpdateAtUtc = await _db.FaultReportUpdates
            .AsNoTracking()
            .Where(u => u.FaultReportId == faultReportId)
            .MaxAsync(u => (DateTime?)u.CreatedAtUtc);

        return latestUpdateAtUtc ?? fallbackUtc;
    }

    private async Task BroadcastUpdatedAsync(FaultReportEntity entity, DateTime lastUpdatedAtUtc)
    {
        await _sse.BroadcastAsync("fault-reports:updated", new
        {
            id = entity.Id,
            referenceCode = entity.ReferenceCode,
            status = entity.Status,
            severity = entity.Severity,
            createdAtUtc = entity.CreatedAtUtc,
            lastUpdatedAtUtc,
        });
    }

    private static string ToNotificationSeverity(string severity) => severity switch
    {
        "S0" or "S1" => "error",
        "S2" => "warning",
        _ => "info",
    };

    private static string BuildNotificationMessage(FaultReportEntity entity)
    {
        var summary = Truncate(entity.Title, 120) ?? "Untitled fault report";
        var route = string.IsNullOrWhiteSpace(entity.RoutePath) ? null : entity.RoutePath;
        var reporter = string.IsNullOrWhiteSpace(entity.UserEmail) ? entity.Platform : entity.UserEmail;
        return route is null
            ? $"{reporter} reported: {summary}"
            : $"{reporter} reported at {route}: {summary}";
    }

    private static string PickTriggeredByName(string? userEmail, string? userRole, string platform)
    {
        if (!string.IsNullOrWhiteSpace(userEmail)) return userEmail;
        if (!string.IsNullOrWhiteSpace(userRole)) return userRole;
        return platform;
    }

    private static string Pick(string? value, string[] allowed, string fallback) =>
        !string.IsNullOrWhiteSpace(value) && allowed.Contains(value) ? value : fallback;

    private static string? Truncate(string? value, int max)
    {
        if (string.IsNullOrEmpty(value)) return value;
        return value.Length <= max ? value : value[..max];
    }

    /// <summary>
    /// Codes look like FR-7QK2M4. No vowels, so nothing spells a word, and no 0/O/1/I/L,
    /// which get confused when written down. Must match the client's alphabet in
    /// src/services/faultReporting/referenceCode.ts.
    /// </summary>
    private const string ReferenceAlphabet = "23456789BCDFGHJKMNPQRSTVWXZ";

    private static string GenerateReference()
    {
        var chars = new char[6];
        var bytes = System.Security.Cryptography.RandomNumberGenerator.GetBytes(6);
        for (var i = 0; i < chars.Length; i++)
        {
            chars[i] = ReferenceAlphabet[bytes[i] % ReferenceAlphabet.Length];
        }

        return $"FR-{new string(chars)}";
    }

    private static string? NormalizeReference(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var trimmed = raw.Trim().ToUpperInvariant();
        if (!trimmed.StartsWith("FR-", StringComparison.Ordinal)) return null;
        var body = trimmed[3..];
        if (body.Length is < 4 or > 12) return null;
        return body.All(ReferenceAlphabet.Contains) ? trimmed : null;
    }
}
