using System.IO.Compression;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Claims;
using System.Text.Json;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Commtrac.Api.Services.Storage;
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

    private readonly IFileStorageService _files;
    private readonly IEmailSender _email;
    private readonly NotificationSettingsService _notificationSettings;
    private readonly ILogger<AssetReportSharesController> _logger;

    public AssetReportSharesController(
        IFileStorageService files,
        IEmailSender email,
        NotificationSettingsService notificationSettings,
        ILogger<AssetReportSharesController> logger)
    {
        _files = files;
        _email = email;
        _notificationSettings = notificationSettings;
        _logger = logger;
    }

    private static string ShareDirectoryRelative(string shareId)
        => $"Storage/AssetReportShares/{shareId}";

    private static string ShareFileRelative(string shareId, string fileName)
        => $"Storage/AssetReportShares/{shareId}/{fileName}";

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
        var shareDir = ShareDirectoryRelative(shareId);
        _files.EnsureDirectory(shareDir);

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
            await _files.WriteBytesAsync(ShareFileRelative(shareId, file.FileName), file.Content);
        }

        await _files.WriteTextAsync(
            ShareFileRelative(shareId, "manifest.json"),
            JsonSerializer.Serialize(manifest, JsonOptions));

        var viewerUrl = await BuildViewerUrlAsync(shareId);
        var downloadUrl = BuildDownloadUrl(shareId);
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
                    viewerUrl,
                    downloadUrl,
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
            viewerUrl,
            downloadUrl,
            expiresAtUtc,
            emailResults));
    }

    [HttpGet("{shareId}")]
    [AllowAnonymous]
    public async Task<ActionResult<AssetReportShareManifestDto>> GetManifest(string shareId)
    {
        var manifest = await TryReadManifestAsync(shareId);
        if (manifest is null) return NotFound(new { message = "Share link not found or expired." });
        if (manifest.ExpiresAtUtc <= DateTime.UtcNow)
        {
            TryDeleteShareDirectory(shareId);
            return NotFound(new { message = "Share link has expired." });
        }

        return Ok(new AssetReportShareManifestDto(
            manifest.ShareId,
            manifest.JobLabel,
            manifest.ExpiresAtUtc,
            manifest.FileNames.Select(f => new AssetReportShareFileDto(f, FileLabelFromName(f))).ToList(),
            BuildDownloadUrl(shareId)));
    }

    [HttpGet("{shareId}/files/{fileName}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetFile(string shareId, string fileName)
    {
        var manifest = await TryReadManifestAsync(shareId);
        if (manifest is null) return NotFound(new { message = "Share link not found or expired." });
        if (manifest.ExpiresAtUtc <= DateTime.UtcNow)
        {
            TryDeleteShareDirectory(shareId);
            return NotFound(new { message = "Share link has expired." });
        }

        var safeName = SanitizeFileName(fileName);
        if (!manifest.FileNames.Any(f => string.Equals(f, safeName, StringComparison.OrdinalIgnoreCase)))
            return NotFound(new { message = "Report file not found in this share." });

        var relativePath = ShareFileRelative(shareId, safeName);
        if (!_files.Exists(relativePath)) return NotFound(new { message = "Report file not found." });

        var bytes = await _files.ReadBytesAsync(relativePath);
        Response.Headers.ContentDisposition = $"inline; filename=\"{safeName}\"";
        return File(bytes, "application/pdf");
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

        var shareDir = ShareDirectoryRelative(shareId);
        var zipFileName = BuildZipFileName(manifest.JobLabel, manifest.ShareId);
        await using var zipStream = new MemoryStream();
        using (var archive = new ZipArchive(zipStream, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var fileName in manifest.FileNames)
            {
                var relativePath = ShareFileRelative(shareId, fileName);
                if (!_files.Exists(relativePath)) continue;
                var entry = archive.CreateEntry(fileName, CompressionLevel.Fastest);
                await using var entryStream = entry.Open();
                await using var fileStream = _files.OpenRead(relativePath);
                await fileStream.CopyToAsync(entryStream);
            }
        }

        zipStream.Position = 0;
        return File(zipStream.ToArray(), "application/zip", zipFileName);
    }

    private async Task<string> BuildViewerUrlAsync(string shareId)
    {
        var frontendBase = await ResolveFrontendBaseUrlAsync();
        return $"{frontendBase}/share/reports/{shareId}";
    }

    private string BuildDownloadUrl(string shareId)
    {
        var apiBase = $"{Request.Scheme}://{Request.Host}".TrimEnd('/');
        return $"{apiBase}/api/asset-report-shares/{shareId}/download";
    }

    private async Task<string> ResolveFrontendBaseUrlAsync()
    {
        var baseUrl = (await _notificationSettings.GetFrontendBaseUrlAsync()).TrimEnd('/');
        var requestHostBaseUrl = GetRequestHostFrontendBaseUrl(Request.Scheme);
        var detectedLanBaseUrl = DetectLanFrontendBaseUrl(Request.Scheme);
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            baseUrl = !string.IsNullOrWhiteSpace(requestHostBaseUrl)
                ? requestHostBaseUrl
                : detectedLanBaseUrl;
        }
        else if (ShouldPreferRequestHostBaseUrl(baseUrl, requestHostBaseUrl))
        {
            baseUrl = requestHostBaseUrl;
        }

        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            baseUrl = "http://localhost:5173";
        }

        return baseUrl.TrimEnd('/');
    }

    private async Task<AssetReportShareManifest?> TryReadManifestAsync(string shareId)
    {
        if (string.IsNullOrWhiteSpace(shareId) || shareId.Any(c => !char.IsLetterOrDigit(c)))
            return null;

        var manifestPath = ShareFileRelative(shareId, "manifest.json");
        if (!_files.Exists(manifestPath)) return null;

        try
        {
            var json = await _files.ReadTextAsync(manifestPath);
            return JsonSerializer.Deserialize<AssetReportShareManifest>(json, JsonOptions);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to read asset report share manifest for {ShareId}", shareId);
            return null;
        }
    }

    private void TryDeleteShareDirectory(string shareId)
    {
        try
        {
            _files.DeleteDirectory(ShareDirectoryRelative(shareId));
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

    private static string FileLabelFromName(string fileName)
    {
        var stem = Path.GetFileNameWithoutExtension(fileName);
        const string prefix = "installation-record_";
        if (stem.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            var rest = stem[prefix.Length..];
            var runIdx = rest.LastIndexOf("_run", StringComparison.OrdinalIgnoreCase);
            if (runIdx > 0) return rest[..runIdx];
            return rest;
        }
        return stem;
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
        string viewerUrl,
        string downloadUrl,
        DateTime expiresAtUtc,
        int count,
        bool attachedDirectly)
    {
        var custom = string.IsNullOrWhiteSpace(message) ? "" : $"\n{message.Trim()}\n";
        var deliveryLine = count == 1
            ? "Open the link below to preview the installation report PDF in your browser."
            : $"Open the link below to preview all {count} installation report PDFs in your browser.";
        var attachmentLine = attachedDirectly
            ? "The report PDF is also attached to this email.\n"
            : "";
        var expires = expiresAtUtc.ToString("dddd, MMMM d yyyy 'at' h:mm tt 'UTC'");
        return
            $"{greeting},\n" +
            custom +
            "\n" +
            $"{deliveryLine}\n" +
            attachmentLine +
            $"\nPreview reports:\n{viewerUrl}\n" +
            $"\nDownload ZIP archive:\n{downloadUrl}\n" +
            "\n" +
            $"These links expire on {expires}.\n\n" +
            $"— {AppBranding.AppName}";
    }

    private string GetRequestHostFrontendBaseUrl(string requestScheme)
    {
        var requestHostIp = GetRequestHostPrivateIpv4();
        if (string.IsNullOrWhiteSpace(requestHostIp)) return "";
        var scheme = string.IsNullOrWhiteSpace(requestScheme) ? "http" : requestScheme;
        return $"{scheme}://{requestHostIp}:5173";
    }

    private string GetRequestHostPrivateIpv4()
    {
        var host = Request.Host.Host?.Trim();
        if (string.IsNullOrWhiteSpace(host)) return "";
        if (!IPAddress.TryParse(host, out var address)) return "";
        return IsPrivateIpv4Address(address) ? address.ToString() : "";
    }

    private static bool ShouldPreferRequestHostBaseUrl(string configuredBaseUrl, string requestHostBaseUrl)
    {
        if (string.IsNullOrWhiteSpace(requestHostBaseUrl)) return false;
        if (!Uri.TryCreate(configuredBaseUrl, UriKind.Absolute, out var configuredUri) ||
            !Uri.TryCreate(requestHostBaseUrl, UriKind.Absolute, out var requestHostUri))
        {
            return false;
        }

        return IsPrivateIpv4Host(configuredUri.Host) &&
               !string.Equals(configuredUri.Host, requestHostUri.Host, StringComparison.OrdinalIgnoreCase);
    }

    private static string DetectLanFrontendBaseUrl(string requestScheme)
    {
        var detectedIp = DetectLanIpv4Address();
        if (string.IsNullOrWhiteSpace(detectedIp)) return "";
        var scheme = string.IsNullOrWhiteSpace(requestScheme) ? "http" : requestScheme;
        return $"{scheme}://{detectedIp}:5173";
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
                if (candidate is not null) return candidate.ToString();
            }
        }
        catch { /* fall through */ }

        return "";
    }

    private static bool IsPrivateIpv4Address(IPAddress address)
    {
        if (address.AddressFamily != AddressFamily.InterNetwork) return false;
        var bytes = address.GetAddressBytes();
        return bytes[0] == 10 ||
               (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) ||
               (bytes[0] == 192 && bytes[1] == 168);
    }

    private static bool IsPrivateIpv4Host(string host)
    {
        if (!IPAddress.TryParse(host, out var address)) return false;
        return IsPrivateIpv4Address(address);
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
