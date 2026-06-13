using System.Security.Claims;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/mobile-upload")]
public class MobileUploadController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;

    public MobileUploadController(AppDbContext db, IWebHostEnvironment env)
    {
        _db = db;
        _env = env;
    }

    private static readonly JsonSerializerOptions _json = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private sealed class MissingMediaTokenPayload
    {
        public string RunId { get; set; } = string.Empty;
        public string AssetId { get; set; } = string.Empty;
        public string AssetTag { get; set; } = string.Empty;
        public string WorkflowName { get; set; } = string.Empty;
    }

    private sealed class MissingMediaUploadItem
    {
        public string StepId { get; set; } = string.Empty;
        public string InputId { get; set; } = string.Empty;
    }

    private sealed class WorkflowMediaStep
    {
        public string StepId { get; set; } = string.Empty;
        public int StepOrder { get; set; }
        public string StepTitle { get; set; } = string.Empty;
        public string? StepDescription { get; set; }
        public string InputId { get; set; } = string.Empty;
        public string InputLabel { get; set; } = string.Empty;
        public string InputType { get; set; } = "photo";
        public int Captured { get; set; }
    }

    [HttpPost("token")]
    [Authorize]
    public async Task<IActionResult> CreateToken([FromBody] CreateTokenRequest request)
    {
        await ExpireStaleTokensAsync();

        var token = Guid.NewGuid().ToString("N")[..16];
        var entry = new MobileUploadTokenEntity
        {
            Token = token,
            Type = request.Type ?? "tips",
            LinkedTo = request.LinkedTo ?? string.Empty,
            CustomValuesJson = request.CustomValuesJson,
            Status = "pending",
            CreatedByUserId = User.FindFirstValue(ClaimTypes.NameIdentifier),
            CreatedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(10),
        };

        _db.MobileUploadTokens.Add(entry);
        await _db.SaveChangesAsync();

        return Ok(new { token, expiresAt = entry.ExpiresAtUtc });
    }

    [HttpPost("missing-media-token")]
    [Authorize]
    public async Task<IActionResult> CreateMissingMediaToken([FromBody] CreateMissingMediaTokenRequest request)
    {
        await ExpireStaleTokensAsync();

        var run = await _db.AssetWorkflowRuns.AsNoTracking().FirstOrDefaultAsync(r => r.Id == request.RunId);
        if (run is null) return NotFound(new { error = "Run not found." });

        var asset = await _db.ProjectAssets.AsNoTracking().FirstOrDefaultAsync(a => a.Id == run.AssetId);
        if (asset is null) return NotFound(new { error = "Asset not found." });

        var workflowName = ResolveWorkflowName(run.WorkflowSnapshotJson, request.WorkflowName);
        var token = Guid.NewGuid().ToString("N")[..16];
        var payload = new MissingMediaTokenPayload
        {
            RunId = run.Id,
            AssetId = asset.Id,
            AssetTag = asset.AssetTag ?? asset.AssetName ?? asset.Id,
            WorkflowName = workflowName,
        };

        var entry = new MobileUploadTokenEntity
        {
            Token = token,
            Type = "missing-media",
            LinkedTo = asset.AssetTag ?? asset.AssetName ?? asset.Id,
            CustomValuesJson = JsonSerializer.Serialize(payload, _json),
            Status = "pending",
            CreatedByUserId = User.FindFirstValue(ClaimTypes.NameIdentifier),
            CreatedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(10),
        };

        _db.MobileUploadTokens.Add(entry);
        await _db.SaveChangesAsync();

        return Ok(new { token, expiresAt = entry.ExpiresAtUtc });
    }

    [HttpGet("token/{token}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetTokenStatus(string token)
    {
        var entry = await _db.MobileUploadTokens.AsNoTracking().FirstOrDefaultAsync(t => t.Token == token);
        if (entry is null)
            return NotFound(new { status = "not_found" });

        if (IsPendingAndExpired(entry))
        {
            await MarkExpiredAsync(entry.Token);
            return Ok(new { status = "expired" });
        }

        return Ok(new { status = entry.Status, documentId = entry.DocumentId });
    }

    [HttpPost("{token}/upload")]
    [AllowAnonymous]
    [RequestSizeLimit(100_000_000)]
    public async Task<IActionResult> UploadFile(string token, [FromForm] IFormFile? file)
    {
        var entry = await _db.MobileUploadTokens.FirstOrDefaultAsync(t => t.Token == token);
        if (entry is null)
            return NotFound(new { error = "Token not found or expired." });

        if (IsPendingAndExpired(entry))
        {
            await MarkExpiredAsync(entry.Token);
            return BadRequest(new { error = "Token has expired." });
        }

        if (string.Equals(entry.Status, "complete", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { error = "File already uploaded for this token." });

        if (file == null || file.Length == 0)
            return BadRequest(new { error = "No file provided." });

        var storageRoot = Path.Combine(_env.ContentRootPath, "Storage", "Documents");
        Directory.CreateDirectory(storageRoot);

        var extension = Path.GetExtension(file.FileName);
        var storedName = $"{Guid.NewGuid()}{extension}";
        var storedPath = Path.Combine(storageRoot, storedName);

        await using (var stream = System.IO.File.Create(storedPath))
        {
            await file.CopyToAsync(stream);
        }

        var doc = new DocumentEntity
        {
            Name = file.FileName,
            Type = entry.Type,
            LinkedTo = entry.LinkedTo,
            UploadedAt = DateTime.UtcNow.ToString("s"),
            FilePath = Path.Combine("Storage", "Documents", storedName),
            ContentType = file.ContentType,
            FileSize = file.Length,
            CreatedBy = "mobile-upload",
            Notes = null,
            CustomValuesJson = entry.CustomValuesJson
        };

        _db.Documents.Add(doc);
        entry.Status = "complete";
        entry.DocumentId = doc.Id;
        entry.ConsumedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        return Ok(new { documentId = doc.Id });
    }

    [HttpPost("{token}/missing-media")]
    [AllowAnonymous]
    [RequestSizeLimit(200_000_000)]
    public async Task<IActionResult> UploadMissingMedia(string token, [FromForm] string? itemsJson, [FromForm] List<IFormFile>? files)
    {
        var entry = await _db.MobileUploadTokens.FirstOrDefaultAsync(t => t.Token == token);
        if (entry is null)
            return NotFound(new { error = "Token not found or expired." });

        if (!string.Equals(entry.Type, "missing-media", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { error = "Token is not valid for missing media upload." });

        if (IsPendingAndExpired(entry))
        {
            await MarkExpiredAsync(entry.Token);
            return BadRequest(new { error = "Token has expired." });
        }

        if (string.Equals(entry.Status, "complete", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { error = "Missing media already uploaded for this token." });

        if (string.IsNullOrWhiteSpace(itemsJson))
            return BadRequest(new { error = "No missing media metadata provided." });

        var items = JsonSerializer.Deserialize<List<MissingMediaUploadItem>>(itemsJson, _json) ?? [];
        if (items.Count == 0)
            return BadRequest(new { error = "No missing media items provided." });

        if (files is null || files.Count != items.Count)
            return BadRequest(new { error = "Uploaded files do not match the requested missing media items." });

        var payload = JsonSerializer.Deserialize<MissingMediaTokenPayload>(entry.CustomValuesJson ?? "{}", _json);
        if (payload is null || string.IsNullOrWhiteSpace(payload.RunId))
            return BadRequest(new { error = "Missing media token payload is invalid." });

        var run = await _db.AssetWorkflowRuns.FirstOrDefaultAsync(r => r.Id == payload.RunId);
        if (run is null)
            return NotFound(new { error = "Workflow run not found." });

        var stepResults = ParseStepResults(run.StepResultsJson);
        foreach (var pair in items.Select((item, index) => new { item, file = files[index] }))
        {
            if (pair.file is null || pair.file.Length == 0)
                continue;

            using var memory = new MemoryStream();
            await pair.file.CopyToAsync(memory);
            var base64 = Convert.ToBase64String(memory.ToArray());
            var contentType = string.IsNullOrWhiteSpace(pair.file.ContentType) ? "application/octet-stream" : pair.file.ContentType;
            var dataUrl = $"data:{contentType};base64,{base64}";

            var result = stepResults.FirstOrDefault(r => r.StepId == pair.item.StepId);
            if (result is null)
            {
                result = new WorkflowStepResultSummary
                {
                    StepId = pair.item.StepId,
                    Values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase),
                    CompletedAt = DateTime.UtcNow.ToString("O"),
                };
                stepResults.Add(result);
            }

            result.Values ??= new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            var existing = ParseCaptureValues(result.Values.GetValueOrDefault(pair.item.InputId));
            existing.Add(dataUrl);
            result.Values[pair.item.InputId] = JsonSerializer.Serialize(existing, _json);
            result.CompletedAt ??= DateTime.UtcNow.ToString("O");
        }

        run.StepResultsJson = JsonSerializer.Serialize(stepResults, _json);
        run.UpdatedAt = DateTime.UtcNow;
        entry.Status = "complete";
        entry.ConsumedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        return Ok(new { status = "complete", runId = run.Id });
    }

    [HttpGet("{token}/info")]
    [AllowAnonymous]
    public async Task<IActionResult> GetTokenInfo(string token)
    {
        var entry = await _db.MobileUploadTokens.AsNoTracking().FirstOrDefaultAsync(t => t.Token == token);
        if (entry is null)
            return NotFound(new { error = "Token not found or expired." });

        if (IsPendingAndExpired(entry))
        {
            await MarkExpiredAsync(entry.Token);
            return Ok(new { error = "expired" });
        }

        if (string.Equals(entry.Type, "missing-media", StringComparison.OrdinalIgnoreCase))
        {
            var payload = JsonSerializer.Deserialize<MissingMediaTokenPayload>(entry.CustomValuesJson ?? "{}", _json) ?? new MissingMediaTokenPayload();
            var run = await _db.AssetWorkflowRuns.AsNoTracking().FirstOrDefaultAsync(r => r.Id == payload.RunId);
            if (run is null)
            {
                return Ok(new
                {
                    type = entry.Type,
                    linkedTo = entry.LinkedTo,
                    expiresAt = entry.ExpiresAtUtc,
                    status = entry.Status,
                    createdBy = entry.CreatedByUserId,
                    consumedAt = entry.ConsumedAtUtc,
                    error = "run_not_found",
                });
            }

            var allMediaSteps = DeriveWorkflowMediaSteps(run.WorkflowSnapshotJson, run.StepResultsJson);
            return Ok(new
            {
                type = entry.Type,
                linkedTo = entry.LinkedTo,
                expiresAt = entry.ExpiresAtUtc,
                status = entry.Status,
                createdBy = entry.CreatedByUserId,
                consumedAt = entry.ConsumedAtUtc,
                runId = payload.RunId,
                assetId = payload.AssetId,
                assetTag = payload.AssetTag,
                workflowName = payload.WorkflowName,
                allMediaSteps,
                missingSteps = allMediaSteps.Where(step => step.Captured == 0).ToList(),
            });
        }

        return Ok(new
        {
            type = entry.Type,
            linkedTo = entry.LinkedTo,
            expiresAt = entry.ExpiresAtUtc,
            status = entry.Status,
            createdBy = entry.CreatedByUserId,
            consumedAt = entry.ConsumedAtUtc
        });
    }

    private static string ResolveWorkflowName(string? workflowSnapshotJson, string? fallback)
    {
        try
        {
            using var doc = JsonDocument.Parse(workflowSnapshotJson ?? "{}");
            if (doc.RootElement.TryGetProperty("name", out var nameProp))
            {
                var value = nameProp.GetString();
                if (!string.IsNullOrWhiteSpace(value))
                    return value!;
            }
        }
        catch
        {
            // ignore
        }
        return string.IsNullOrWhiteSpace(fallback) ? "Workflow" : fallback.Trim();
    }

    private static List<WorkflowStepResultSummary> ParseStepResults(string? stepResultsJson)
    {
        try
        {
            return JsonSerializer.Deserialize<List<WorkflowStepResultSummary>>(stepResultsJson ?? "[]", _json) ?? [];
        }
        catch
        {
            return [];
        }
    }

    private static List<string> ParseCaptureValues(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return [];

        try
        {
            var parsed = JsonSerializer.Deserialize<List<string>>(raw, _json);
            return parsed?.Where(item => !string.IsNullOrWhiteSpace(item)).ToList() ?? [];
        }
        catch
        {
            return raw.StartsWith("data:", StringComparison.OrdinalIgnoreCase)
                ? [raw]
                : [];
        }
    }

    private static List<WorkflowMediaStep> DeriveWorkflowMediaSteps(string? workflowSnapshotJson, string? stepResultsJson)
    {
        var snapshotSteps = ParseSnapshotSteps(workflowSnapshotJson);
        var resultValues = ParseStepValues(stepResultsJson);
        var allSteps = new List<WorkflowMediaStep>();
        var stepIndex = 0;

        foreach (var step in snapshotSteps)
        {
            stepIndex++;
            foreach (var input in step.Inputs.Where(inp =>
                         string.Equals(inp.Type, "photo", StringComparison.OrdinalIgnoreCase) ||
                         string.Equals(inp.Type, "video", StringComparison.OrdinalIgnoreCase)))
            {
                var captured = ParseCaptureValues(
                    resultValues.TryGetValue(step.Id, out var values)
                        ? values.GetValueOrDefault(input.Id)
                        : null
                ).Count;

                allSteps.Add(new WorkflowMediaStep
                {
                    StepId = step.Id,
                    StepOrder = step.Order ?? stepIndex,
                    StepTitle = string.IsNullOrWhiteSpace(step.Title) ? step.Id : step.Title!,
                    StepDescription = step.Description,
                    InputId = input.Id,
                    InputLabel = string.IsNullOrWhiteSpace(input.Label)
                        ? (string.Equals(input.Type, "video", StringComparison.OrdinalIgnoreCase) ? "Video" : "Photo")
                        : input.Label!,
                    InputType = string.Equals(input.Type, "video", StringComparison.OrdinalIgnoreCase) ? "video" : "photo",
                    Captured = captured,
                });
            }
        }

        return allSteps;
    }

    private static Dictionary<string, Dictionary<string, string>> ParseStepValues(string? stepResultsJson)
    {
        try
        {
            var parsed = JsonSerializer.Deserialize<List<WorkflowStepResultSummary>>(stepResultsJson ?? "[]", _json) ?? [];
            return parsed
                .Where(item => !string.Equals(item.StepId, "__nav__", StringComparison.OrdinalIgnoreCase))
                .Where(item => !string.IsNullOrWhiteSpace(item.StepId))
                .ToDictionary(
                    item => item.StepId!,
                    item => item.Values ?? new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase),
                    StringComparer.OrdinalIgnoreCase
                );
        }
        catch
        {
            return new Dictionary<string, Dictionary<string, string>>(StringComparer.OrdinalIgnoreCase);
        }
    }

    private static List<WorkflowSnapshotStepSummary> ParseSnapshotSteps(string? workflowSnapshotJson)
    {
        if (string.IsNullOrWhiteSpace(workflowSnapshotJson))
            return [];

        try
        {
            using var doc = JsonDocument.Parse(workflowSnapshotJson);
            if (!doc.RootElement.TryGetProperty("stepsJson", out var stepsJsonProp))
                return [];

            var stepsJson = stepsJsonProp.GetString();
            if (string.IsNullOrWhiteSpace(stepsJson))
                return [];

            using var stepsDoc = JsonDocument.Parse(stepsJson);
            JsonElement stepsElement;
            if (stepsDoc.RootElement.ValueKind == JsonValueKind.Array)
            {
                stepsElement = stepsDoc.RootElement;
            }
            else if (stepsDoc.RootElement.TryGetProperty("steps", out var nestedSteps) && nestedSteps.ValueKind == JsonValueKind.Array)
            {
                stepsElement = nestedSteps;
            }
            else
            {
                return [];
            }

            return JsonSerializer.Deserialize<List<WorkflowSnapshotStepSummary>>(stepsElement.GetRawText(), _json) ?? [];
        }
        catch
        {
            return [];
        }
    }

    private async Task ExpireStaleTokensAsync()
    {
        var stale = await _db.MobileUploadTokens
            .Where(t => t.Status == "pending" && t.ExpiresAtUtc < DateTime.UtcNow)
            .ToListAsync();

        if (stale.Count == 0) return;

        foreach (var token in stale)
        {
            token.Status = "expired";
        }

        await _db.SaveChangesAsync();
    }

    private async Task MarkExpiredAsync(string token)
    {
        var entry = await _db.MobileUploadTokens.FirstOrDefaultAsync(t => t.Token == token);
        if (entry is null || !string.Equals(entry.Status, "pending", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        entry.Status = "expired";
        await _db.SaveChangesAsync();
    }

    private static bool IsPendingAndExpired(MobileUploadTokenEntity entry)
    {
        return string.Equals(entry.Status, "pending", StringComparison.OrdinalIgnoreCase)
               && entry.ExpiresAtUtc < DateTime.UtcNow;
    }
}

public record CreateTokenRequest(string? Type, string? LinkedTo, string? CustomValuesJson);
public record CreateMissingMediaTokenRequest(string RunId, string? WorkflowName);

public sealed class WorkflowStepResultSummary
{
    public string? StepId { get; set; }
    public Dictionary<string, string>? Values { get; set; }
    public string? CompletedAt { get; set; }
    public int? IterationIndex { get; set; }
}

public sealed class WorkflowSnapshotStepSummary
{
    public string Id { get; set; } = string.Empty;
    public int? Order { get; set; }
    public string? Title { get; set; }
    public string? Description { get; set; }
    public List<WorkflowSnapshotInputSummary> Inputs { get; set; } = [];
}

public sealed class WorkflowSnapshotInputSummary
{
    public string Id { get; set; } = string.Empty;
    public string? Label { get; set; }
    public string? Type { get; set; }
}
