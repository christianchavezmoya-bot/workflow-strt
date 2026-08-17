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
            LastUpdatedAtUtc = now,
            LastUpdatedByUserId = userId,
        };

        _db.FaultReports.Add(entity);
        _db.FaultReportHistory.Add(new FaultReportHistoryEntity
        {
            FaultReportId = entity.Id,
            EventType = "Created",
            NewStatus = entity.Status,
            NewSeverity = entity.Severity,
            NewNotes = entity.Notes,
            Summary = "Report created",
            ActorUserId = userId,
            ActorUserEmail = userEmail,
            ActorUserRole = userRole,
            CreatedAtUtc = now,
        });
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

        await _sse.BroadcastAsync("fault-reports:updated", new
        {
            id = entity.Id,
            referenceCode = entity.ReferenceCode,
            status = entity.Status,
            severity = entity.Severity,
            createdAtUtc = entity.CreatedAtUtc,
        });

        // Also emit to the server log so it lands wherever cloud logs are shipped.
        _logger.LogWarning(
            "Fault report {Reference} ({Kind}/{Severity}) from {Platform} v{AppVersion} at {Route}: {Title}",
            entity.ReferenceCode, entity.Kind, entity.Severity, entity.Platform,
            entity.AppVersion ?? "?", entity.RoutePath ?? "?", entity.Title);

        return CreatedAtAction(nameof(GetById), new { id = entity.Id }, ToDto(entity));
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
            .OrderByDescending(r => r.LastUpdatedAtUtc)
            .ThenByDescending(r => r.CreatedAtUtc)
            .Take(Math.Clamp(take, 1, 500))
            .ToListAsync();

        return Ok(rows.Select(ToDto).ToList());
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

    /// <summary>Full report including stack, breadcrumbs and diagnostics.</summary>
    [HttpGet("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<FaultReportDetailDto>> GetById(string id)
    {
        var entity = await _db.FaultReports.AsNoTracking().FirstOrDefaultAsync(r => r.Id == id);
        if (entity is null) return NotFound();

        return Ok(await ToDetailDtoAsync(entity));
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

        return Ok(await ToDetailDtoAsync(entity));
    }

    /// <summary>Triage: change status/severity or add notes.</summary>
    [HttpPatch("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<FaultReportDto>> Update(string id, [FromBody] UpdateFaultReportRequest request)
    {
        var entity = await _db.FaultReports.FirstOrDefaultAsync(r => r.Id == id);
        if (entity is null) return NotFound();
        var actorUserId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var actorUserEmail = User.FindFirstValue(ClaimTypes.Email);
        var actorUserRole = User.FindFirstValue("role");
        var nextStatus = entity.Status;
        var nextSeverity = entity.Severity;
        var nextNotes = entity.Notes;

        if (!string.IsNullOrWhiteSpace(request.Status))
        {
            if (!AllowedStatuses.Contains(request.Status))
            {
                return BadRequest(new { error = $"status must be one of {string.Join(", ", AllowedStatuses)}" });
            }

            nextStatus = request.Status;
        }

        if (!string.IsNullOrWhiteSpace(request.Severity))
        {
            if (!AllowedSeverities.Contains(request.Severity))
            {
                return BadRequest(new { error = $"severity must be one of {string.Join(", ", AllowedSeverities)}" });
            }

            nextSeverity = request.Severity;
        }

        if (request.Notes is not null)
        {
            nextNotes = request.Notes;
        }

        var previousStatus = entity.Status;
        var previousSeverity = entity.Severity;
        var previousNotes = entity.Notes;
        var changed =
            !string.Equals(previousStatus, nextStatus, StringComparison.Ordinal) ||
            !string.Equals(previousSeverity, nextSeverity, StringComparison.Ordinal) ||
            !string.Equals(previousNotes ?? "", nextNotes ?? "", StringComparison.Ordinal);

        if (!changed)
        {
            return Ok(ToDto(entity));
        }

        var now = DateTime.UtcNow;
        var wasResolved = previousStatus is "Fixed" or "WontFix" or "Duplicate";
        entity.Status = nextStatus;
        entity.Severity = nextSeverity;
        entity.Notes = nextNotes;
        var resolved = entity.Status is "Fixed" or "WontFix" or "Duplicate";
        entity.ResolvedAtUtc = resolved ? (wasResolved ? entity.ResolvedAtUtc ?? now : now) : null;
        entity.ResolvedByUserId = resolved ? (wasResolved ? entity.ResolvedByUserId ?? actorUserId : actorUserId) : null;
        entity.LastUpdatedAtUtc = now;
        entity.LastUpdatedByUserId = actorUserId;

        _db.FaultReportHistory.Add(new FaultReportHistoryEntity
        {
            FaultReportId = entity.Id,
            EventType = "Updated",
            PreviousStatus = previousStatus,
            NewStatus = entity.Status,
            PreviousSeverity = previousSeverity,
            NewSeverity = entity.Severity,
            PreviousNotes = previousNotes,
            NewNotes = entity.Notes,
            Summary = BuildHistorySummary(previousStatus, entity.Status, previousSeverity, entity.Severity, previousNotes, entity.Notes),
            ActorUserId = actorUserId,
            ActorUserEmail = actorUserEmail,
            ActorUserRole = actorUserRole,
            CreatedAtUtc = now,
        });

        await _db.SaveChangesAsync();
        await _sse.BroadcastAsync("fault-reports:updated", new
        {
            id = entity.Id,
            referenceCode = entity.ReferenceCode,
            status = entity.Status,
            severity = entity.Severity,
            createdAtUtc = entity.CreatedAtUtc,
            lastUpdatedAtUtc = entity.LastUpdatedAtUtc,
        });
        return Ok(ToDto(entity));
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(string id)
    {
        var entity = await _db.FaultReports.FirstOrDefaultAsync(r => r.Id == id);
        if (entity is null) return NotFound();

        _db.FaultReports.Remove(entity);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static FaultReportDto ToDto(FaultReportEntity e) => new(
        e.Id, e.ReferenceCode, e.Kind, e.Severity, e.Status, e.Title, e.Description,
        e.Platform, e.AppVersion, e.UserAgent, e.RoutePath, e.UserId, e.UserEmail, e.UserRole,
        e.ErrorName, e.ErrorMessage, e.TraceId, e.WasOffline, e.OccurredAtUtc, e.CreatedAtUtc, e.LastUpdatedAtUtc,
        e.Notes, e.ResolvedAtUtc);

    private async Task<FaultReportDetailDto> ToDetailDtoAsync(FaultReportEntity entity)
    {
        var history = await _db.FaultReportHistory.AsNoTracking()
            .Where(row => row.FaultReportId == entity.Id)
            .OrderByDescending(row => row.CreatedAtUtc)
            .ToListAsync();

        return new FaultReportDetailDto(
            ToDto(entity),
            history.Select(ToDto).ToList(),
            entity.ErrorStack,
            entity.BreadcrumbsJson,
            entity.DiagnosticsJson);
    }

    private static FaultReportHistoryDto ToDto(FaultReportHistoryEntity row) => new(
        row.Id,
        row.EventType,
        row.PreviousStatus,
        row.NewStatus,
        row.PreviousSeverity,
        row.NewSeverity,
        row.PreviousNotes,
        row.NewNotes,
        row.Summary,
        row.ActorUserId,
        row.ActorUserEmail,
        row.ActorUserRole,
        row.CreatedAtUtc);

    private static string Pick(string? value, string[] allowed, string fallback) =>
        !string.IsNullOrWhiteSpace(value) && allowed.Contains(value) ? value : fallback;

    private static string? Truncate(string? value, int max)
    {
        if (string.IsNullOrEmpty(value)) return value;
        return value.Length <= max ? value : value[..max];
    }

    private static string BuildHistorySummary(
        string previousStatus,
        string newStatus,
        string previousSeverity,
        string newSeverity,
        string? previousNotes,
        string? newNotes)
    {
        var changes = new List<string>();

        if (!string.Equals(previousStatus, newStatus, StringComparison.Ordinal))
        {
            changes.Add($"status {previousStatus} -> {newStatus}");
        }

        if (!string.Equals(previousSeverity, newSeverity, StringComparison.Ordinal))
        {
            changes.Add($"severity {previousSeverity} -> {newSeverity}");
        }

        if (!string.Equals(previousNotes ?? "", newNotes ?? "", StringComparison.Ordinal))
        {
            changes.Add(string.IsNullOrWhiteSpace(newNotes) ? "notes cleared" : "notes updated");
        }

        return changes.Count == 0 ? "Report updated" : string.Join("; ", changes);
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
