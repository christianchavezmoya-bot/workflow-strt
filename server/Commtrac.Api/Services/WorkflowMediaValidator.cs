using Microsoft.AspNetCore.Http;

namespace Commtrac.Api.Services;

/// <summary>
/// Server-side allowlist + signature validation for Workflow Builder reference media
/// (Content library uploads). Never trusts the client-supplied file extension or
/// Content-Type alone — classification is derived from the file's actual binary
/// signature, and extension/Content-Type are only accepted when consistent with it.
///
/// Phase 1 scope: type/size/signature validation only. Duration and codec parsing
/// (H.264/AAC) are intentionally out of scope — <see cref="IsValidMp4"/> only checks
/// for a structurally-present "ftyp" box, and is written as its own method so a later
/// phase can extend it (e.g. parse the "mvhd" atom for duration) without touching
/// callers.
/// </summary>
public enum WorkflowMediaKind
{
    Image,
    Video,
}

public sealed class WorkflowMediaValidationResult
{
    public bool IsValid { get; }
    public WorkflowMediaKind? Kind { get; }
    public string? Extension { get; }
    public string? Mime { get; }
    public string? Error { get; }

    private WorkflowMediaValidationResult(bool isValid, WorkflowMediaKind? kind, string? extension, string? mime, string? error)
    {
        IsValid = isValid;
        Kind = kind;
        Extension = extension;
        Mime = mime;
        Error = error;
    }

    public static WorkflowMediaValidationResult Success(WorkflowMediaKind kind, string extension, string mime)
        => new(true, kind, extension, mime, null);

    public static WorkflowMediaValidationResult Fail(string error)
        => new(false, null, null, null, error);
}

public static class WorkflowMediaValidator
{
    /// <summary>Overall HTTP request ceiling (multipart overhead + the largest allowed file).
    /// Applied at the pipeline level via [RequestSizeLimit] — this constant is the single
    /// source of truth so the attribute and this validator can never drift apart.</summary>
    public const long MaxRequestBytes = 30_000_000;

    /// <summary>Hard source-file limit for video uploads (Phase 1 policy).</summary>
    public const long MaxVideoBytes = 25_000_000;

    // No separate image byte-limit is enforced beyond MaxRequestBytes (the existing
    // client-side 1920px/0.85 compression already keeps real photos well under this).
    // Flagged in the Phase 1 report rather than inventing a new, unrequested image policy.

    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4",
    };

    public static async Task<WorkflowMediaValidationResult> ValidateAsync(IFormFile? file, CancellationToken cancellationToken = default)
    {
        if (file is null || file.Length <= 0)
            return WorkflowMediaValidationResult.Fail("A file is required.");

        if (file.Length > MaxRequestBytes)
            return WorkflowMediaValidationResult.Fail("File is too large.");

        var extension = Path.GetExtension(file.FileName);
        if (string.IsNullOrWhiteSpace(extension) || !AllowedExtensions.Contains(extension))
            return WorkflowMediaValidationResult.Fail("Unsupported file type. Allowed: JPEG, PNG, GIF, WebP images or MP4 video.");

        var header = new byte[16];
        int headerLength;
        await using (var stream = file.OpenReadStream())
        {
            headerLength = await ReadHeaderAsync(stream, header, cancellationToken);
        }

        var kind = DetectKind(header, headerLength, out var detectedExtension, out var detectedMime);
        if (kind is null)
            return WorkflowMediaValidationResult.Fail("File content does not match a supported image or video format.");

        if (!ExtensionMatchesDetected(extension, detectedExtension!))
            return WorkflowMediaValidationResult.Fail("File extension does not match the file's actual content.");

        if (!IsContentTypeConsistent(file.ContentType, kind.Value))
            return WorkflowMediaValidationResult.Fail("File content does not match the declared content type.");

        if (kind == WorkflowMediaKind.Video && file.Length > MaxVideoBytes)
            return WorkflowMediaValidationResult.Fail("Video exceeds the 25 MB limit. Trim or compress it and try again.");

        return WorkflowMediaValidationResult.Success(kind.Value, extension, detectedMime!);
    }

    /// <summary>Canonical extension -> MIME map used both when storing a validated upload
    /// and when serving a previously-stored file. An extension not in this map is never
    /// served (previously ServeMedia defaulted anything unrecognized to "video/mp4").</summary>
    public static bool TryGetMimeForExtension(string? extension, out string mime)
    {
        switch ((extension ?? string.Empty).ToLowerInvariant())
        {
            case ".jpg":
            case ".jpeg":
                mime = "image/jpeg";
                return true;
            case ".png":
                mime = "image/png";
                return true;
            case ".gif":
                mime = "image/gif";
                return true;
            case ".webp":
                mime = "image/webp";
                return true;
            case ".mp4":
                mime = "video/mp4";
                return true;
            default:
                mime = string.Empty;
                return false;
        }
    }

    private static async Task<int> ReadHeaderAsync(Stream stream, byte[] buffer, CancellationToken cancellationToken)
    {
        var total = 0;
        while (total < buffer.Length)
        {
            var read = await stream.ReadAsync(buffer.AsMemory(total, buffer.Length - total), cancellationToken);
            if (read == 0) break;
            total += read;
        }
        return total;
    }

    private static WorkflowMediaKind? DetectKind(byte[] h, int len, out string? extension, out string? mime)
    {
        // JPEG: FF D8 FF
        if (len >= 3 && h[0] == 0xFF && h[1] == 0xD8 && h[2] == 0xFF)
        {
            extension = ".jpg"; mime = "image/jpeg";
            return WorkflowMediaKind.Image;
        }

        // PNG: 89 50 4E 47 0D 0A 1A 0A
        if (len >= 8 && h[0] == 0x89 && h[1] == 0x50 && h[2] == 0x4E && h[3] == 0x47
            && h[4] == 0x0D && h[5] == 0x0A && h[6] == 0x1A && h[7] == 0x0A)
        {
            extension = ".png"; mime = "image/png";
            return WorkflowMediaKind.Image;
        }

        // GIF: "GIF87a" or "GIF89a"
        if (len >= 6 && h[0] == 0x47 && h[1] == 0x49 && h[2] == 0x46 && h[3] == 0x38
            && (h[4] == 0x37 || h[4] == 0x39) && h[5] == 0x61)
        {
            extension = ".gif"; mime = "image/gif";
            return WorkflowMediaKind.Image;
        }

        // WebP: "RIFF"...."WEBP"
        if (len >= 12 && h[0] == 0x52 && h[1] == 0x49 && h[2] == 0x46 && h[3] == 0x46
            && h[8] == 0x57 && h[9] == 0x45 && h[10] == 0x42 && h[11] == 0x50)
        {
            extension = ".webp"; mime = "image/webp";
            return WorkflowMediaKind.Image;
        }

        // MP4 / ISO-BMFF: 4-byte box size, then "ftyp" at offset 4.
        // Phase 1 minimum per the approved plan: structural ftyp presence only.
        if (IsValidMp4(h, len))
        {
            extension = ".mp4"; mime = "video/mp4";
            return WorkflowMediaKind.Video;
        }

        extension = null; mime = null;
        return null;
    }

    /// <summary>Minimum viable MP4 container check: a "ftyp" box at the standard
    /// leading offset. Intentionally does not parse duration/codec — see class docs.</summary>
    private static bool IsValidMp4(byte[] h, int len)
        => len >= 8 && h[4] == (byte)'f' && h[5] == (byte)'t' && h[6] == (byte)'y' && h[7] == (byte)'p';

    private static bool ExtensionMatchesDetected(string uploadedExtension, string detectedExtension)
    {
        var normalized = uploadedExtension.Equals(".jpeg", StringComparison.OrdinalIgnoreCase) ? ".jpg" : uploadedExtension;
        return normalized.Equals(detectedExtension, StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsContentTypeConsistent(string? contentType, WorkflowMediaKind kind)
    {
        if (string.IsNullOrWhiteSpace(contentType)) return true; // absent/generic — extension+signature are authoritative

        var normalized = contentType.Trim().ToLowerInvariant();
        var claimsImage = normalized.StartsWith("image/");
        var claimsVideo = normalized.StartsWith("video/");
        if (!claimsImage && !claimsVideo) return true; // e.g. application/octet-stream — not a spoof signal by itself

        return kind switch
        {
            WorkflowMediaKind.Image => claimsImage,
            WorkflowMediaKind.Video => claimsVideo,
            _ => true,
        };
    }
}
