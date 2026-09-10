namespace Commtrac.Api.Services.Storage;

/// <summary>A single resolved, concrete byte range — both bounds inclusive.</summary>
public readonly record struct ResolvedRange(long Start, long End);

/// <summary>
/// Parses a single-range RFC 7233 "Range" header value (e.g. "bytes=0-1023",
/// "bytes=1024-", "bytes=-500") against a known total resource length.
///
/// Multi-range values ("bytes=0-10,20-30") and anything malformed are treated as
/// "no range" — the caller should serve the full 200 response. RFC 7233 §3.1
/// explicitly permits a server to ignore a Range header it does not want to
/// honor rather than reject the request, so this is spec-safe, not a shortcut.
/// </summary>
public static class HttpRangeHeader
{
    private const string Prefix = "bytes=";

    /// <summary>
    /// Returns true with a resolved, in-bounds range when the header names exactly one
    /// satisfiable range. Returns false otherwise — check <paramref name="unsatisfiable"/>
    /// to distinguish "no/unparseable Range header, serve full content" (false) from
    /// "a single range was given but it's out of bounds for this resource" (true).
    /// </summary>
    public static bool TryParse(string? rangeHeaderValue, long totalLength, out ResolvedRange range, out bool unsatisfiable)
    {
        range = default;
        unsatisfiable = false;

        if (string.IsNullOrWhiteSpace(rangeHeaderValue)) return false;
        if (!rangeHeaderValue.StartsWith(Prefix, StringComparison.OrdinalIgnoreCase)) return false;

        var spec = rangeHeaderValue[Prefix.Length..].Trim();
        if (spec.Length == 0 || spec.Contains(',')) return false; // empty or multi-range — serve full content

        var dash = spec.IndexOf('-');
        if (dash < 0) return false;

        var startPart = spec[..dash];
        var endPart = spec[(dash + 1)..];

        long start, end;
        if (startPart.Length == 0)
        {
            // Suffix range: "bytes=-N" — last N bytes of the resource.
            if (!long.TryParse(endPart, out var suffixLength) || suffixLength <= 0) return false;
            if (totalLength <= 0) { unsatisfiable = true; return false; }
            start = Math.Max(0, totalLength - suffixLength);
            end = totalLength - 1;
        }
        else
        {
            if (!long.TryParse(startPart, out start) || start < 0) return false;

            if (endPart.Length == 0)
            {
                // Open-ended range: "bytes=N-" — from N to the end.
                end = totalLength - 1;
            }
            else if (!long.TryParse(endPart, out end))
            {
                return false;
            }
        }

        if (totalLength <= 0 || start >= totalLength || start > end)
        {
            unsatisfiable = true;
            return false;
        }

        end = Math.Min(end, totalLength - 1);
        range = new ResolvedRange(start, end);
        return true;
    }
}
