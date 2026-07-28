using System.IO.Compression;
using System.Security.Claims;
using System.Text.Json;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/asset-report-shares")]
public class AssetReportSharesController : ControllerBase
{
    private const int MaxAttachmentCount = 100;
    private const int MaxAttachmentBytes = 8 * 1024 * 1024;
    private const int MaxTotalBytes = 48 * 1024 * 1024;
    private const int MaxDirectEmailAttachmentBytes = 4 * 1024 * 1024;

    private readonly IWebHostEnvironment _env;
    private readonly IEmailSender _email;
    private readonly ILogger<AssetReportSharesController> _logger;

    public AssetReportSharesController(
        IWebHostEnvironment env,
        IEmailSender email,
        ILogger<AssetReportSharesController> logger)
    {
        _env = env;
        _email = email;
        _logger = logger;
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Project Manager")]
    public async Task<ActionResult<CreateAssetReportShareResponse>> Create([FromBody] CreateAssetReportShareRequest request)
    {
        if (request.Attachments is null || request.Attachments.Count == 0)
            return BadRequest(new { message = "At least one report attachment is required." });

        if (request.Attachments.Count > MaxAttachmentCount)
            return BadRequest(new { message = $"Too many attachments (max {MaxAttachmentCount})." });

        var recipients = (request.Recipients ?? [])
            .Where(r => !string.IsNullOrWhiteSpace(r.Email))
            .Select(r => new AssetReportShareRecipientRequest(r.Email.Trim(), r.Name?.Trim()))
            .DistinctBy(r => r.Email.ToLowerInvariant())
            .ToList();

        if (request.SendEmail && recipients.Count == 0)
            return BadRequest(new { message = "At least one recipient email is required when sending email." });

        var decodedFiles = new List<(string FileName, byte[] Content)>();
        var totalBytes = 0L;
        foreach (var attachment in request.Attachments)
        {
            if (string.IsNullOrWhiteSpace(attachment.FileName))
                return BadRequest(new { message = "Each attachment requires a file name." });

            byte[] bytes;
            try
            {
                bytes = Convert.FromBase64String(attachment.ContentBase64 ?? "");
            }
            catch
            {
                return BadRequest(new { message = $"Invalid base64 content for {attachment.FileName}." });
            }

            if (bytes.Length == 0)
                return BadRequest(new { message = $"Empty attachment: {attachment.FileName}." });

            if (bytes.Length > MaxAttachmentBytes)
                return BadRequest(new { message = $"Attachment too large: {attachment.FileName}." });

            totalBytes += bytes.Length;
            if (totalBytes > MaxTotalBytes)
                return BadRequest(new { message = "Total attachment size exceeds the allowed limit." });

            decodedFiles.Add((SanitizeFileName(attachment.FileName), bytes));
        }

        var shareId = Guid.NewGuid().ToString("N");
        var expiresHours = Math.Clamp(request.ExpiresInHours <= 0 ? 168 : request.ExpiresInHours, 1, 720);
        var expiresAtUtc = DateTime.UtcNow.AddHours(expiresHours);
        var shareDir = GetShareDirectory(shareId);
        Directory.CreateDirectory(shareDir);

        var manifest = new AssetReportShareManifest
        {
            ShareId = shareId,
            ProjectId = request.ProjectId,
            JobLabel = request.JobLabel,
            CreatedByUserId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "unknown",
            CreatedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = expiresAtUtc,
            FileNames = decodedFiles.Select(f => f.FileName).ToList(),
        };

        foreach (var file in decodedFiles)
        {
            var fullPath = Path.Combine(shareDir, file.FileName);
            await System.IO.File.WriteAllBytesAsync(fullPath, file.Content);
        }

        await System.IO.File.WriteAllTextAsync(
            Path.Combine(shareDir, "manifest.json"),
            JsonSerializer.Serialize(manifest, JsonOptions));

        var shareUrl = BuildShareUrl(shareId);
        var emailResults = new List<AssetReportShareEmailResultDto>();

        if (request.SendEmail)
        {
            var subject = BuildEmailSubject(request.JobLabel, decodedFiles.Count);
            var attachDirectly = decodedFiles.Count == 1 && decodedFiles[0].Content.Length <= MaxDirectEmailAttachmentBytes;
            var emailAttachments = attachDirectly
                ? decodedFiles.Select(f => new EmailAttachment(f.FileName, f.Content)).ToList()
                : [];

            foreach (var recipient in recipients)
            {
                var greeting = string.IsNullOrWhiteSpace(recipient.Name) ? "Hello" : $"Hello {recipient.Name}";
                var body = BuildEmailBody(
                    greeting,
                    request.Message,
                    shareUrl,
                    expiresAtUtc,
                    decodedFiles.Count,
                    attachDirectly);

                var result = await _email.SendAssetReportShareAsync(
                    recipient.Email,
                    recipient.Name,
                    subject,
                    body,
                    emailAttachments);

                emailResults.Add(new AssetReportShareEmailResultDto(
                    recipient.Email,
                    result.Success,
                    result.Message));

                if (!result.Success)
                {
                    _logger.LogWarning(
                        "Asset report share email failed for {Email} share {ShareId}: {Detail}",
                        recipient.Email,
                        shareId,
                        result.Message);
                }
            }
        }

        return Ok(new CreateAssetReportShareResponse(
            shareId,
            shareUrl,
            expiresAtUtc,
            emailResults));
    }

    [HttpGet("{shareId}/download")]
    [AllowAnonymous]
    public async Task<IActionResult> Download(string shareId)
    {
        var manifest = await TryReadManifestAsync(shareId);
        if (manifest is null) return NotFound(new { message = "Share link not found or expired." });
        if (manifest.ExpiresAtUtc <= DateTime.UtcNow)
        {
            TryDeleteShareDirectory(shareId);
            return NotFound(new { message = "Share link has expired." });
        }

        var shareDir = GetShareDirectory(shareId);
        var zipFileName = BuildZipFileName(manifest.JobLabel, manifest.ShareId);
        await using var zipStream = new MemoryStream();
        using (var archive = new ZipArchive(zipStream, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var fileName in manifest.FileNames)
            {
                var fullPath = Path.Combine(shareDir, fileName);
                if (!System.IO.File.Exists(fullPath)) continue;
                var entry = archive.CreateEntry(fileName, CompressionLevel.Fastest);
                await using var entryStream = entry.Open();
                await using var fileStream = System.IO.File.OpenRead(fullPath);
                await fileStream.CopyToAsync(entryStream);
            }
        }

        zipStream.Position = 0;
        return File(zipStream.ToArray(), "application/zip", zipFileName);
    }

    private string BuildShareUrl(string shareId)
    {
        var apiBase = $"{Request.Scheme}://{Request.Host}".TrimEnd('/');
        return $"{apiBase}/api/asset-report-shares/{shareId}/download";
    }

    private async Task<AssetReportShareManifest?> TryReadManifestAsync(string shareId)
    {
        if (string.IsNullOrWhiteSpace(shareId) || shareId.Any(c => !char.IsLetterOrDigit(c)))
            return null;

        var manifestPath = Path.Combine(GetShareDirectory(shareId), "manifest.json");
        if (!System.IO.File.Exists(manifestPath)) return null;

        try
        {
            var json = await System.IO.File.ReadAllTextAsync(manifestPath);
            return JsonSerializer.Deserialize<AssetReportShareManifest>(json, JsonOptions);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to read asset report share manifest for {ShareId}", shareId);
            return null;
        }
    }

    private string GetShareDirectory(string shareId)
        => Path.Combine(_env.ContentRootPath, "Storage", "AssetReportShares", shareId);

    private void TryDeleteShareDirectory(string shareId)
    {
        try
        {
            var dir = GetShareDirectory(shareId);
            if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to delete expired asset report share {ShareId}", shareId);
        }
    }

    private static string SanitizeFileName(string fileName)
    {
        var trimmed = Path.GetFileName(fileName.Trim());
        if (string.IsNullOrWhiteSpace(trimmed)) trimmed = "report.pdf";
        if (!trimmed.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
            trimmed += ".pdf";
        foreach (var invalid in Path.GetInvalidFileNameChars())
            trimmed = trimmed.Replace(invalid, '_');
        return trimmed;
    }

    private static string BuildZipFileName(string? jobLabel, string shareId)
    {
        var safeJob = string.IsNullOrWhiteSpace(jobLabel)
            ? "workflow-reports"
            : string.Concat(jobLabel.Trim().Select(ch => Path.GetInvalidFileNameChars().Contains(ch) ? '_' : ch));
        return $"{safeJob}-{shareId[..8]}.zip";
    }

    private static string BuildEmailSubject(string? jobLabel, int count)
    {
        var label = string.IsNullOrWhiteSpace(jobLabel) ? "Asset reports" : $"Asset reports — {jobLabel.Trim()}";
        return count == 1 ? label : $"{label} ({count} PDFs)";
    }

    private static string BuildEmailBody(
        string greeting,
        string? message,
        string shareUrl,
        DateTime expiresAtUtc,
        int count,
        bool attachedDirectly)
    {
        var custom = string.IsNullOrWhiteSpace(message) ? "" : $"\n{message.Trim()}\n";
        var deliveryLine = attachedDirectly
            ? "The installation report PDF is attached to this email."
            : count == 1
                ? "Use the secure link below to download the installation report PDF:"
                : $"Use the secure link below to download all {count} installation report PDFs as a ZIP archive:";
        var linkBlock = attachedDirectly ? "" : $"\n{shareUrl}\n";
        var expires = expiresAtUtc.ToString("dddd, MMMM d yyyy 'at' h:mm tt 'UTC'");
        return
            $"{greeting},\n" +
            custom +
            "\n" +
            $"{deliveryLine}" +
            linkBlock +
            "\n" +
            $"This link expires on {expires}.\n\n" +
            $"— {AppBranding.AppName}";
    }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private sealed class AssetReportShareManifest
    {
        public string ShareId { get; set; } = "";
        public string? ProjectId { get; set; }
        public string? JobLabel { get; set; }
        public string CreatedByUserId { get; set; } = "";
        public DateTime CreatedAtUtc { get; set; }
        public DateTime ExpiresAtUtc { get; set; }
        public List<string> FileNames { get; set; } = [];
    }
}
