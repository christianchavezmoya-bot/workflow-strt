using System.IO.Compression;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using UglyToad.PdfPig;

namespace Commtrac.Api.Services;

public interface IDocumentContentSearchService
{
    Task<IReadOnlyList<DocumentTextSegment>> ExtractSegmentsAsync(
        string fullPath,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<DocumentContentHit>> FindMatchesAsync(
        string fullPath,
        IReadOnlyList<string> terms,
        int maxHits = 8,
        CancellationToken cancellationToken = default);
}

public record DocumentTextSegment(
    string Context,
    string Text
);

public record DocumentContentHit(
    string Context,
    string Snippet
);

internal record TextSegment(
    string Context,
    string Text
);

public class DocumentContentSearchService : IDocumentContentSearchService
{
    public async Task<IReadOnlyList<DocumentTextSegment>> ExtractSegmentsAsync(
        string fullPath,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(fullPath) || !File.Exists(fullPath))
        {
            return Array.Empty<DocumentTextSegment>();
        }

        try
        {
            var segments = await ExtractRawSegmentsAsync(fullPath, cancellationToken);
            return segments
                .Where(s => !string.IsNullOrWhiteSpace(s.Text))
                .Select(s => new DocumentTextSegment(s.Context, Normalize(s.Text)))
                .Where(s => !string.IsNullOrWhiteSpace(s.Text))
                .ToList();
        }
        catch
        {
            return Array.Empty<DocumentTextSegment>();
        }
    }

    public async Task<IReadOnlyList<DocumentContentHit>> FindMatchesAsync(
        string fullPath,
        IReadOnlyList<string> terms,
        int maxHits = 8,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(fullPath) || !File.Exists(fullPath) || terms.Count == 0)
        {
            return Array.Empty<DocumentContentHit>();
        }

        var extracted = await ExtractSegmentsAsync(fullPath, cancellationToken);
        var segments = extracted.Select(s => new TextSegment(s.Context, s.Text)).ToList();

        if (segments.Count == 0) return Array.Empty<DocumentContentHit>();

        var hits = new List<DocumentContentHit>(Math.Min(maxHits, 16));
        foreach (var segment in segments)
        {
            if (hits.Count >= maxHits) break;
            var segmentHits = FindHitsInSegment(segment, terms, maxHits - hits.Count);
            hits.AddRange(segmentHits);
        }

        return hits;
    }

    private static async Task<List<TextSegment>> ExtractRawSegmentsAsync(string fullPath, CancellationToken ct)
    {
        var ext = Path.GetExtension(fullPath).ToLowerInvariant();
        return ext switch
        {
            ".txt" or ".csv" or ".md" or ".xml" or ".log" =>
                new List<TextSegment> { new("Text", await File.ReadAllTextAsync(fullPath, ct)) },
            ".json" => await ExtractJsonSegmentsAsync(fullPath, ct),
            ".docx" => ExtractDocxSegments(fullPath),
            ".xlsx" => ExtractXlsxSegments(fullPath),
            ".pdf" => ExtractPdfSegments(fullPath),
            _ => new List<TextSegment>()
        };
    }

    private static async Task<List<TextSegment>> ExtractJsonSegmentsAsync(string fullPath, CancellationToken ct)
    {
        var raw = await File.ReadAllTextAsync(fullPath, ct);
        using var doc = JsonDocument.Parse(raw);

        var segments = new List<TextSegment>();
        ExtractJsonValue(doc.RootElement, "$", segments);
        if (segments.Count == 0)
        {
            segments.Add(new TextSegment("JSON", raw));
        }
        return segments;
    }

    private static void ExtractJsonValue(JsonElement element, string path, List<TextSegment> segments)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                foreach (var prop in element.EnumerateObject())
                {
                    ExtractJsonValue(prop.Value, $"{path}.{prop.Name}", segments);
                }
                break;
            case JsonValueKind.Array:
                var idx = 0;
                foreach (var item in element.EnumerateArray())
                {
                    ExtractJsonValue(item, $"{path}[{idx}]", segments);
                    idx++;
                }
                break;
            case JsonValueKind.String:
                var str = element.GetString();
                if (!string.IsNullOrWhiteSpace(str))
                {
                    segments.Add(new TextSegment(path, str));
                }
                break;
            case JsonValueKind.Number:
            case JsonValueKind.True:
            case JsonValueKind.False:
                segments.Add(new TextSegment(path, element.ToString()));
                break;
        }
    }

    private static List<TextSegment> ExtractDocxSegments(string fullPath)
    {
        using var file = File.OpenRead(fullPath);
        using var zip = new ZipArchive(file, ZipArchiveMode.Read);
        var entry = zip.GetEntry("word/document.xml");
        if (entry is null) return new List<TextSegment>();

        using var stream = entry.Open();
        var xdoc = XDocument.Load(stream);

        var paragraphs = xdoc
            .Descendants()
            .Where(x => x.Name.LocalName == "p")
            .Select((p, i) => new TextSegment(
                Context: $"Paragraph {i + 1}",
                Text: string.Join(" ", p.Descendants().Where(t => t.Name.LocalName == "t").Select(t => t.Value))
            ))
            .Where(s => !string.IsNullOrWhiteSpace(s.Text))
            .ToList();

        return paragraphs;
    }

    private static List<TextSegment> ExtractXlsxSegments(string fullPath)
    {
        using var file = File.OpenRead(fullPath);
        using var zip = new ZipArchive(file, ZipArchiveMode.Read);

        var sharedStrings = ReadSharedStrings(zip);
        var segments = new List<TextSegment>();

        var sheetEntries = zip.Entries
            .Where(e => e.FullName.StartsWith("xl/worksheets/sheet", StringComparison.OrdinalIgnoreCase)
                        && e.FullName.EndsWith(".xml", StringComparison.OrdinalIgnoreCase))
            .OrderBy(e => e.FullName)
            .ToList();

        foreach (var sheet in sheetEntries)
        {
            using var stream = sheet.Open();
            var xdoc = XDocument.Load(stream);
            var rows = xdoc.Descendants().Where(x => x.Name.LocalName == "row");

            foreach (var row in rows)
            {
                var rowIndex = row.Attribute("r")?.Value ?? "?";
                var values = new List<string>();

                foreach (var cell in row.Elements().Where(x => x.Name.LocalName == "c"))
                {
                    var type = cell.Attribute("t")?.Value;
                    string? value = null;

                    if (type == "s")
                    {
                        var idxText = cell.Descendants().FirstOrDefault(x => x.Name.LocalName == "v")?.Value;
                        if (int.TryParse(idxText, out var sharedIdx) && sharedIdx >= 0 && sharedIdx < sharedStrings.Count)
                        {
                            value = sharedStrings[sharedIdx];
                        }
                    }
                    else if (type == "inlineStr")
                    {
                        value = string.Join(" ", cell.Descendants().Where(x => x.Name.LocalName == "t").Select(x => x.Value));
                    }
                    else
                    {
                        value = cell.Descendants().FirstOrDefault(x => x.Name.LocalName == "v")?.Value;
                    }

                    if (!string.IsNullOrWhiteSpace(value))
                    {
                        values.Add(value);
                    }
                }

                if (values.Count > 0)
                {
                    segments.Add(new TextSegment(
                        Context: $"{Path.GetFileNameWithoutExtension(sheet.FullName)} row {rowIndex}",
                        Text: string.Join(" | ", values)
                    ));
                }
            }
        }

        return segments;
    }

    private static List<string> ReadSharedStrings(ZipArchive zip)
    {
        var entry = zip.GetEntry("xl/sharedStrings.xml");
        if (entry is null) return new List<string>();

        using var stream = entry.Open();
        var xdoc = XDocument.Load(stream);
        return xdoc
            .Descendants()
            .Where(x => x.Name.LocalName == "si")
            .Select(si => string.Join(" ", si.Descendants().Where(t => t.Name.LocalName == "t").Select(t => t.Value)))
            .ToList();
    }

    private static List<TextSegment> ExtractPdfSegments(string fullPath)
    {
        var segments = new List<TextSegment>();
        using var doc = PdfDocument.Open(fullPath);

        foreach (var page in doc.GetPages())
        {
            if (!string.IsNullOrWhiteSpace(page.Text))
            {
                segments.Add(new TextSegment($"Page {page.Number}", page.Text));
            }
        }

        return segments;
    }

    private static IReadOnlyList<DocumentContentHit> FindHitsInSegment(TextSegment segment, IReadOnlyList<string> terms, int maxHits)
    {
        if (maxHits <= 0) return Array.Empty<DocumentContentHit>();
        var normalized = Normalize(segment.Text);
        if (string.IsNullOrWhiteSpace(normalized)) return Array.Empty<DocumentContentHit>();

        var lower = normalized.ToLowerInvariant();
        if (!terms.All(t => lower.Contains(t))) return Array.Empty<DocumentContentHit>();

        var anchors = new List<int>();
        foreach (var term in terms)
        {
            var start = 0;
            while (start < lower.Length)
            {
                var idx = lower.IndexOf(term, start, StringComparison.Ordinal);
                if (idx < 0) break;
                if (!anchors.Any(a => Math.Abs(a - idx) < 24))
                {
                    anchors.Add(idx);
                }
                start = idx + Math.Max(1, term.Length);
                if (anchors.Count >= maxHits) break;
            }
            if (anchors.Count >= maxHits) break;
        }

        if (anchors.Count == 0)
        {
            return new[] { new DocumentContentHit(segment.Context, BuildSnippet(normalized, lower.IndexOf(terms[0], StringComparison.Ordinal))) };
        }

        return anchors
            .OrderBy(i => i)
            .Take(maxHits)
            .Select(idx => new DocumentContentHit(segment.Context, BuildSnippet(normalized, idx)))
            .ToList();
    }

    private static string BuildSnippet(string text, int anchorIndex)
    {
        if (anchorIndex < 0)
        {
            return text.Length <= 180 ? text : $"{text[..177]}...";
        }

        const int radius = 78;
        var start = Math.Max(0, anchorIndex - radius);
        var length = Math.Min(180, text.Length - start);
        var snippet = text.Substring(start, length).Trim();

        if (start > 0) snippet = $"...{snippet}";
        if (start + length < text.Length) snippet = $"{snippet}...";
        return snippet;
    }

    private static string Normalize(string text)
        => Regex.Replace(text ?? string.Empty, "\\s+", " ").Trim();
}
