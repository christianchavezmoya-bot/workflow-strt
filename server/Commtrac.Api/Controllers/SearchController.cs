using System.Text.RegularExpressions;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Controllers;

[ApiController]
[Route("api/search")]
[Authorize]
public class SearchController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IDocumentSearchIndexMonitor _indexMonitor;
    private readonly IDocumentSearchIndexQueue _indexQueue;
    private readonly IDocumentSearchIndexQueueMetrics _indexMetrics;

    public SearchController(
        AppDbContext db,
        IDocumentSearchIndexMonitor indexMonitor,
        IDocumentSearchIndexQueue indexQueue,
        IDocumentSearchIndexQueueMetrics indexMetrics)
    {
        _db = db;
        _indexMonitor = indexMonitor;
        _indexQueue = indexQueue;
        _indexMetrics = indexMetrics;
    }

    [HttpGet]
    public async Task<ActionResult<GlobalSearchResponseDto>> Search([FromQuery] string? q, [FromQuery] int limit = 60)
    {
        var query = (q ?? string.Empty).Trim();
        if (query.Length < 2)
        {
            return Ok(new GlobalSearchResponseDto(query, 0, Array.Empty<GlobalSearchResultDto>()));
        }

        var terms = ParseTerms(query);
        if (terms.Count == 0)
        {
            return Ok(new GlobalSearchResponseDto(query, 0, Array.Empty<GlobalSearchResultDto>()));
        }

        await EnsureIndexTableExistsAsync();

        limit = Math.Clamp(limit, 1, 200);
        var results = new List<GlobalSearchResultDto>(256);

        var projects = await _db.Projects.AsNoTracking().ToListAsync();
        foreach (var p in projects)
        {
            TryAddResult(
                results,
                terms,
                entityType: "project",
                entityId: p.Id,
                title: string.IsNullOrWhiteSpace(p.JobNumber) ? "(Untitled Project)" : p.JobNumber,
                subtitle: p.CustomerName,
                route: $"/projects/{p.Id}",
                fields: new Dictionary<string, string?>
                {
                    ["Job Number"] = p.JobNumber,
                    ["Customer"] = p.CustomerName,
                    ["Description"] = p.Description,
                    ["Status"] = p.Status,
                    ["Office"] = p.Office,
                    ["Project Type"] = p.ProjectType,
                    ["Project Manager"] = p.ProjectManager,
                    ["Region"] = p.Region
                });
        }

        var installations = await _db.Installations.AsNoTracking().ToListAsync();
        foreach (var i in installations)
        {
            TryAddResult(
                results,
                terms,
                entityType: "installation",
                entityId: i.Id,
                title: !string.IsNullOrWhiteSpace(i.InstallationName) ? i.InstallationName : i.InstallationNumber,
                subtitle: i.SiteLocation,
                route: $"/installations/assets?project={Uri.EscapeDataString(i.ProjectId)}",
                fields: new Dictionary<string, string?>
                {
                    ["Installation Number"] = i.InstallationNumber,
                    ["Installation Name"] = i.InstallationName,
                    ["Site Location"] = i.SiteLocation,
                    ["Status"] = i.Status,
                    ["Assigned Team"] = i.AssignedTeam,
                    ["Installer Notes"] = i.InstallerNotes
                });
        }

        var assets = await _db.ProjectAssets.AsNoTracking().ToListAsync();
        var allRuns = await _db.AssetWorkflowRuns.AsNoTracking().ToListAsync();
        var latestRunByAsset = allRuns
            .GroupBy(r => r.AssetId)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(r => r.StartedAt).First());

        foreach (var a in assets)
        {
            latestRunByAsset.TryGetValue(a.Id, out var latestRun);
            TryAddResult(
                results,
                terms,
                entityType: "asset",
                entityId: a.Id,
                title: string.IsNullOrWhiteSpace(a.AssetTag) ? "(Unlabeled Asset)" : a.AssetTag,
                subtitle: a.AssetName,
                route: $"/installations/assets?project={Uri.EscapeDataString(a.ProjectId)}&asset={Uri.EscapeDataString(a.Id)}",
                fields: new Dictionary<string, string?>
                {
                    ["Asset Tag"] = a.AssetTag,
                    ["Asset Name"] = a.AssetName,
                    ["Serial Number"] = a.SerialNumber,
                    ["Model"] = a.AssetModel,
                    ["Manufacturer"] = a.Manufacturer,
                    ["Location"] = a.Location,
                    ["Notes"] = a.Notes,
                    ["Feature Values"] = ExtractReadableJsonText(a.FeatureValuesJson),
                    ["As-Built Captures"] = ExtractAsBuiltSearchText(a.AsBuiltJson),
                    ["Workflow Step Results"] = ExtractReadableJsonText(latestRun?.StepResultsJson)
                });
        }

        var docs = await _db.Documents.AsNoTracking().ToListAsync();
        foreach (var d in docs)
        {
            var isTips = string.Equals(d.Type, "tips", StringComparison.OrdinalIgnoreCase);
            TryAddResult(
                results,
                terms,
                entityType: "document",
                entityId: d.Id,
                title: string.IsNullOrWhiteSpace(d.Name) ? "(Untitled Document)" : d.Name,
                subtitle: d.Type,
                route: isTips ? "/tips" : "/documents",
                fields: new Dictionary<string, string?>
                {
                    ["Name"] = d.Name,
                    ["Type"] = d.Type,
                    ["Linked To"] = d.LinkedTo,
                    ["Created By"] = d.CreatedBy,
                    ["Notes"] = d.Notes,
                    ["Custom Values"] = ExtractReadableJsonText(d.CustomValuesJson)
                });
        }

        var customers = await _db.Customers.AsNoTracking().ToListAsync();
        foreach (var c in customers)
        {
            TryAddResult(
                results,
                terms,
                entityType: "customer",
                entityId: c.Id,
                title: string.IsNullOrWhiteSpace(c.Name) ? "(Unnamed Customer)" : c.Name,
                subtitle: c.CustomerId,
                route: "/admin?tab=customers",
                fields: new Dictionary<string, string?>
                {
                    ["Name"] = c.Name,
                    ["Customer ID"] = c.CustomerId,
                    ["Office"] = c.Office,
                    ["Industry"] = c.Industry
                });
        }

        var sites = await _db.Sites.AsNoTracking().ToListAsync();
        foreach (var s in sites)
        {
            TryAddResult(
                results,
                terms,
                entityType: "site",
                entityId: s.Id,
                title: string.IsNullOrWhiteSpace(s.Name) ? "(Unnamed Site)" : s.Name,
                subtitle: s.City,
                route: "/admin?tab=customers",
                fields: new Dictionary<string, string?>
                {
                    ["Name"] = s.Name,
                    ["Address"] = s.Address,
                    ["City"] = s.City,
                    ["State"] = s.State,
                    ["Country"] = s.Country,
                    ["Zip Code"] = s.ZipCode,
                    ["Contact"] = s.ContactName,
                    ["Email"] = s.ContactEmail,
                    ["Notes"] = s.Notes
                });
        }

        var instructions = await _db.WorkInstructions.AsNoTracking().ToListAsync();
        foreach (var wi in instructions)
        {
            TryAddResult(
                results,
                terms,
                entityType: "workInstruction",
                entityId: wi.Id,
                title: string.IsNullOrWhiteSpace(wi.Title) ? "(Untitled Work Instruction)" : wi.Title,
                subtitle: wi.Status,
                route: "/work-instructions",
                fields: new Dictionary<string, string?>
                {
                    ["Title"] = wi.Title,
                    ["Summary"] = wi.Summary,
                    ["Status"] = wi.Status,
                    ["Steps"] = ExtractReadableJsonText(wi.StepsJson),
                    ["Feature Values"] = ExtractReadableJsonText(wi.FeatureValuesJson)
                });
        }

        await AddIndexedDocumentContentResultsAsync(results, terms, docs);

        var ordered = results
            .OrderByDescending(r => r.Score)
            .ThenBy(r => r.Title, StringComparer.OrdinalIgnoreCase)
            .Take(limit)
            .ToList();

        return Ok(new GlobalSearchResponseDto(query, ordered.Count, ordered));
    }

    [HttpGet("index-status")]
    [Authorize(Roles = "Admin")]
    public ActionResult<DocumentSearchIndexStatusSnapshot> GetIndexStatus()
    {
        var status = _indexMonitor.GetSnapshot();
        var merged = status with { QueueDepth = _indexMetrics.QueueDepth };
        return Ok(merged);
    }

    [HttpPost("rebuild-index")]
    [Authorize(Roles = "Admin")]
    public IActionResult RebuildIndex()
    {
        _indexQueue.EnqueueFullRebuild();
        return Accepted(new { queued = true, message = "Index rebuild queued." });
    }

    [HttpGet("document-preview")]
    public async Task<ActionResult<SearchDocumentPreviewDto>> GetDocumentPreview(
        [FromQuery] string entityId,
        [FromQuery] string sourceType,
        [FromQuery] string? q,
        [FromQuery] int limit = 200)
    {
        var normalizedSource = (sourceType ?? string.Empty).Trim().ToLowerInvariant();
        if (normalizedSource is not ("library" or "asset"))
        {
            return BadRequest("sourceType must be 'library' or 'asset'.");
        }
        if (string.IsNullOrWhiteSpace(entityId))
        {
            return BadRequest("entityId is required.");
        }

        await EnsureIndexTableExistsAsync();
        var terms = ParseTerms(q ?? string.Empty);
        var chunks = await QueryIndexRowsBySourceAsync(normalizedSource, entityId, Math.Clamp(limit, 20, 600));

        if (terms.Count > 0)
        {
            chunks = chunks
                .Where(c =>
                {
                    var lower = c.ChunkText.ToLowerInvariant();
                    return terms.All(t => lower.Contains(t));
                })
                .ToList();
        }

        if (normalizedSource == "library")
        {
            var doc = await _db.Documents.AsNoTracking().FirstOrDefaultAsync(d => d.Id == entityId);
            if (doc is null) return NotFound();

            var downloadUrl = string.IsNullOrWhiteSpace(doc.FilePath)
                ? doc.DownloadUrl
                : $"{Request.Scheme}://{Request.Host}/api/documents/{doc.Id}/download";

            return Ok(new SearchDocumentPreviewDto(
                EntityId: entityId,
                SourceType: "library",
                Title: string.IsNullOrWhiteSpace(doc.Name) ? "(Untitled Document)" : doc.Name,
                Subtitle: doc.Type,
                DownloadUrl: downloadUrl,
                Hits: chunks.Select(c => new SearchDocumentPreviewHitDto(c.Context, c.ChunkText)).ToList()
            ));
        }

        var assetDoc = await _db.AssetDocuments.AsNoTracking().FirstOrDefaultAsync(a => a.Id == entityId);
        if (assetDoc is null) return NotFound();
        var latest = await _db.AssetDocumentRevisions
            .AsNoTracking()
            .Where(r => r.DocumentId == entityId)
            .OrderByDescending(r => r.RevisionNumber)
            .FirstOrDefaultAsync();
        if (latest is null) return NotFound();

        return Ok(new SearchDocumentPreviewDto(
            EntityId: entityId,
            SourceType: "asset",
            Title: string.IsNullOrWhiteSpace(latest.OriginalName) ? "(Untitled Asset Document)" : latest.OriginalName,
            Subtitle: $"Asset {assetDoc.AssetId}",
            DownloadUrl: $"{Request.Scheme}://{Request.Host}/api/asset-documents/{assetDoc.Id}/download",
            Hits: chunks.Select(c => new SearchDocumentPreviewHitDto(c.Context, c.ChunkText)).ToList()
        ));
    }

    private async Task AddIndexedDocumentContentResultsAsync(
        List<GlobalSearchResultDto> target,
        List<string> terms,
        List<DocumentEntity> docs)
    {
        List<AssetDocumentEntity> assetDocs;
        List<AssetDocumentRevisionEntity> revisions;
        try
        {
            assetDocs = await _db.AssetDocuments.AsNoTracking().ToListAsync();
            revisions = await _db.AssetDocumentRevisions.AsNoTracking().ToListAsync();
        }
        catch
        {
            assetDocs = new List<AssetDocumentEntity>();
            revisions = new List<AssetDocumentRevisionEntity>();
        }

        var latestByDoc = revisions
            .GroupBy(r => r.DocumentId)
            .Select(g => g.OrderByDescending(r => r.RevisionNumber).First())
            .ToDictionary(r => r.DocumentId, r => r);

        var docsById = docs.ToDictionary(d => d.Id, d => d);
        var assetDocsById = assetDocs.ToDictionary(d => d.Id, d => d);

        var firstTerm = terms[0];
        var rows = await QueryIndexRowsByFirstTermAsync(firstTerm, maxRows: 500);
        var hitIndex = 0;

        foreach (var row in rows)
        {
            var lowerChunk = row.ChunkText.ToLowerInvariant();
            if (!terms.All(t => lowerChunk.Contains(t))) continue;

            if (row.SourceType == "library")
            {
                if (!docsById.TryGetValue(row.SourceId, out var doc)) continue;
                var title = string.IsNullOrWhiteSpace(doc.Name) ? "(Untitled Document)" : doc.Name;
                var subtitlePrefix = string.IsNullOrWhiteSpace(doc.Type) ? "Document content" : doc.Type;
                target.Add(new GlobalSearchResultDto(
                    Id: $"document:{doc.Id}:content:{hitIndex++}",
                    EntityType: "document",
                    EntityId: doc.Id,
                    Title: title,
                    Subtitle: $"{subtitlePrefix} - {row.Context}",
                    Route: "/documents",
                    Snippet: BuildSnippetFromChunk(row.ChunkText, terms),
                    MatchedFields: new List<string> { $"Content ({row.Context})" },
                    Score: 14
                ));
            }
            else if (row.SourceType == "asset")
            {
                if (!assetDocsById.TryGetValue(row.SourceId, out var ad)) continue;
                if (!latestByDoc.TryGetValue(ad.Id, out var rev)) continue;
                var title = string.IsNullOrWhiteSpace(rev.OriginalName) ? "(Untitled Asset Document)" : rev.OriginalName;
                target.Add(new GlobalSearchResultDto(
                    Id: $"document:{ad.Id}:asset-content:{hitIndex++}",
                    EntityType: "document",
                    EntityId: ad.Id,
                    Title: title,
                    Subtitle: $"Asset {ad.AssetId} - {row.Context}",
                    Route: "/installations/assets",
                    Snippet: BuildSnippetFromChunk(row.ChunkText, terms),
                    MatchedFields: new List<string> { $"Content ({row.Context})" },
                    Score: 13
                ));
            }
        }
    }

    private Task<List<IndexedChunkRow>> QueryIndexRowsByFirstTermAsync(string firstTerm, int maxRows)
        => SearchDocumentChunksStore.QueryByFirstTermAsync(_db, firstTerm, maxRows);

    private Task<List<IndexedChunkRow>> QueryIndexRowsBySourceAsync(string sourceType, string sourceId, int maxRows)
        => SearchDocumentChunksStore.QueryBySourceAsync(_db, sourceType, sourceId, maxRows);

    private Task EnsureIndexTableExistsAsync()
        => SearchDocumentChunksStore.EnsureTableAsync(_db);

    private static List<string> ParseTerms(string query)
    {
        var matches = Regex.Matches(query, "\"([^\"]+)\"|(\\S+)");
        var terms = new List<string>();
        foreach (Match match in matches)
        {
            var value = match.Groups[1].Success ? match.Groups[1].Value : match.Groups[2].Value;
            if (!string.IsNullOrWhiteSpace(value))
            {
                terms.Add(value.Trim().ToLowerInvariant());
            }
        }
        return terms;
    }

    private static void TryAddResult(
        List<GlobalSearchResultDto> target,
        List<string> terms,
        string entityType,
        string entityId,
        string title,
        string? subtitle,
        string route,
        Dictionary<string, string?> fields)
    {
        var normalizedTitle = title ?? string.Empty;
        var searchableFields = fields
            .Where(kv => !string.IsNullOrWhiteSpace(kv.Value))
            .ToDictionary(kv => kv.Key, kv => SanitizeSearchText(kv.Value!));

        var allText = string.Join(" ", searchableFields.Values);
        var normalizedAll = Normalize(allText).ToLowerInvariant();

        if (!terms.All(t => normalizedAll.Contains(t)))
        {
            return;
        }

        var matchedFields = searchableFields
            .Where(kv => FieldContainsTerm(kv.Value, terms))
            .Select(kv => kv.Key)
            .ToList();

        var snippetSource = PreferHumanSnippetField(searchableFields, terms);
        var body = BuildSnippet(snippetSource.Value ?? normalizedTitle, terms);
        var snippet = string.IsNullOrWhiteSpace(snippetSource.Key) || string.IsNullOrWhiteSpace(body)
            ? body
            : $"{snippetSource.Key}: {body}";
        var score = ComputeScore(normalizedTitle, matchedFields, terms, searchableFields);

        target.Add(new GlobalSearchResultDto(
            Id: $"{entityType}:{entityId}",
            EntityType: entityType,
            EntityId: entityId,
            Title: normalizedTitle,
            Subtitle: subtitle,
            Route: route,
            Snippet: snippet,
            MatchedFields: matchedFields,
            Score: score
        ));
    }

    private static KeyValuePair<string, string?> PreferHumanSnippetField(
        Dictionary<string, string> fields,
        List<string> terms)
    {
        // Prefer identity / brand fields over capture blobs so snippets stay readable.
        string[] preferred =
        [
            "Asset Tag", "Asset Name", "Serial Number", "Manufacturer", "Model",
            "Name", "Title", "Job Number", "Job Reference", "Customer",
            "Location", "Notes", "As-Built Captures", "Feature Values"
        ];
        foreach (var key in preferred)
        {
            if (fields.TryGetValue(key, out var value) && FieldContainsTerm(value, terms))
            {
                return new KeyValuePair<string, string?>(key, value);
            }
        }

        var first = fields.FirstOrDefault(kv => FieldContainsTerm(kv.Value, terms));
        return first.Key is null
            ? default
            : new KeyValuePair<string, string?>(first.Key, first.Value);
    }

    private static bool FieldContainsTerm(string? value, List<string> terms)
    {
        if (string.IsNullOrWhiteSpace(value)) return false;
        var text = Normalize(value).ToLowerInvariant();
        return terms.Any(text.Contains);
    }

    private static int ComputeScore(
        string title,
        List<string> matchedFields,
        List<string> terms,
        Dictionary<string, string> fields)
    {
        var titleNorm = Normalize(title).ToLowerInvariant();
        var score = 0;

        if (titleNorm.Equals(string.Join(" ", terms), StringComparison.OrdinalIgnoreCase))
        {
            score += 80;
        }

        foreach (var term in terms)
        {
            if (titleNorm.Contains(term))
            {
                score += 20;
            }
        }

        foreach (var field in matchedFields)
        {
            score += field switch
            {
                "Asset Tag" or "Name" or "Title" or "Job Number" or "Job Reference" => 12,
                "Asset Name" or "Serial Number" or "Manufacturer" or "Customer" => 10,
                "Model" or "Location" or "Notes" => 6,
                _ => 3
            };
        }

        // Brand / manufacturer exact-ish hits should beat accidental long-blob matches.
        if (fields.TryGetValue("Manufacturer", out var mfr) &&
            terms.Any(t => Normalize(mfr).Equals(t, StringComparison.OrdinalIgnoreCase)))
        {
            score += 25;
        }

        return score;
    }

    private static string BuildSnippet(string text, List<string> terms)
    {
        var normalized = SanitizeSearchText(text);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return string.Empty;
        }

        var lower = normalized.ToLowerInvariant();
        var firstIndex = int.MaxValue;
        foreach (var term in terms)
        {
            var idx = lower.IndexOf(term, StringComparison.Ordinal);
            if (idx >= 0 && idx < firstIndex)
            {
                firstIndex = idx;
            }
        }

        if (firstIndex == int.MaxValue)
        {
            return normalized.Length <= 160 ? normalized : $"{normalized[..157]}...";
        }

        const int radius = 70;
        var start = Math.Max(0, firstIndex - radius);
        var length = Math.Min(160, normalized.Length - start);
        var snippet = normalized.Substring(start, length).Trim();

        if (start > 0) snippet = $"...{snippet}";
        if (start + length < normalized.Length) snippet = $"{snippet}...";
        return snippet;
    }

    private static string BuildSnippetFromChunk(string chunkText, List<string> terms)
    {
        var normalized = SanitizeSearchText(chunkText);
        if (string.IsNullOrWhiteSpace(normalized)) return string.Empty;
        var lower = normalized.ToLowerInvariant();
        var idx = terms
            .Select(t => lower.IndexOf(t, StringComparison.Ordinal))
            .Where(i => i >= 0)
            .DefaultIfEmpty(-1)
            .Min();
        if (idx < 0) return normalized.Length <= 180 ? normalized : $"{normalized[..177]}...";

        const int radius = 82;
        var start = Math.Max(0, idx - radius);
        var length = Math.Min(180, normalized.Length - start);
        var snippet = normalized.Substring(start, length).Trim();
        if (start > 0) snippet = $"...{snippet}";
        if (start + length < normalized.Length) snippet = $"{snippet}...";
        return snippet;
    }

    private static string Normalize(string text)
        => Regex.Replace(text ?? string.Empty, "\\s+", " ").Trim();

    /// <summary>
    /// Strip UUIDs / JSON punctuation so snippets stay human-readable.
    /// </summary>
    private static string SanitizeSearchText(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return string.Empty;
        var cleaned = text;
        // UUID / GUID tokens
        cleaned = Regex.Replace(cleaned, @"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b", " ");
        // Long hex / base64-ish blobs
        cleaned = Regex.Replace(cleaned, @"\b[A-Za-z0-9+/=_-]{48,}\b", " ");
        // JSON structural noise
        cleaned = Regex.Replace(cleaned, @"[{}\[\]""]", " ");
        cleaned = Regex.Replace(cleaned, @"\\[nrt]", " ");
        cleaned = Regex.Replace(cleaned, @"[,:;]+", " ");
        return Normalize(cleaned);
    }

    /// <summary>
    /// Walk JSON and collect readable string leaves (skip ids / keys that look like UUIDs).
    /// </summary>
    private static string ExtractReadableJsonText(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return string.Empty;
        var trimmed = json.Trim();
        if (trimmed is "{}" or "[]" or "null") return string.Empty;
        if (trimmed[0] is not ('{' or '['))
        {
            return SanitizeSearchText(trimmed);
        }

        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(trimmed);
            var parts = new List<string>();
            CollectReadableJsonValues(doc.RootElement, parts);
            return SanitizeSearchText(string.Join(" ", parts));
        }
        catch
        {
            return SanitizeSearchText(trimmed);
        }
    }

    private static void CollectReadableJsonValues(System.Text.Json.JsonElement el, List<string> parts)
    {
        switch (el.ValueKind)
        {
            case System.Text.Json.JsonValueKind.Object:
                foreach (var prop in el.EnumerateObject())
                {
                    // Prefer human labels over raw ids when both exist nearby.
                    if (IsNoiseJsonKey(prop.Name)) continue;
                    if (prop.Value.ValueKind == System.Text.Json.JsonValueKind.String)
                    {
                        var s = prop.Value.GetString();
                        if (IsReadableString(s))
                        {
                            // Include the property name when it looks like a field label.
                            if (LooksLikeLabelKey(prop.Name)) parts.Add(HumanizeKey(prop.Name));
                            parts.Add(s!);
                        }
                    }
                    else
                    {
                        CollectReadableJsonValues(prop.Value, parts);
                    }
                }
                break;
            case System.Text.Json.JsonValueKind.Array:
                foreach (var item in el.EnumerateArray())
                    CollectReadableJsonValues(item, parts);
                break;
            case System.Text.Json.JsonValueKind.String:
                {
                    var s = el.GetString();
                    if (IsReadableString(s)) parts.Add(s!);
                    break;
                }
            case System.Text.Json.JsonValueKind.Number:
                parts.Add(el.ToString());
                break;
            case System.Text.Json.JsonValueKind.True:
            case System.Text.Json.JsonValueKind.False:
                parts.Add(el.GetBoolean() ? "Yes" : "No");
                break;
        }
    }

    private static string ExtractAsBuiltSearchText(string? asBuiltJson)
    {
        if (string.IsNullOrWhiteSpace(asBuiltJson)) return string.Empty;
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(asBuiltJson);
            if (!doc.RootElement.TryGetProperty("fields", out var fields) ||
                fields.ValueKind != System.Text.Json.JsonValueKind.Array)
            {
                return ExtractReadableJsonText(asBuiltJson);
            }

            var parts = new List<string>();
            foreach (var field in fields.EnumerateArray())
            {
                var label = field.TryGetProperty("label", out var labelEl) ? labelEl.GetString()
                    : field.TryGetProperty("Label", out var labelEl2) ? labelEl2.GetString()
                    : null;
                var value = field.TryGetProperty("value", out var valueEl) ? valueEl.GetString()
                    : field.TryGetProperty("Value", out var valueEl2) ? valueEl2.GetString()
                    : field.TryGetProperty("selectedValue", out var selEl) ? selEl.GetString()
                    : null;
                var feature = field.TryGetProperty("featureName", out var featEl) ? featEl.GetString()
                    : field.TryGetProperty("FeatureName", out var featEl2) ? featEl2.GetString()
                    : null;

                if (IsReadableString(feature)) parts.Add(feature!);
                if (IsReadableString(label) && IsReadableString(value))
                    parts.Add($"{label}: {value}");
                else if (IsReadableString(value))
                    parts.Add(value!);
                else if (IsReadableString(label))
                    parts.Add(label!);
            }

            return SanitizeSearchText(string.Join(" · ", parts));
        }
        catch
        {
            return ExtractReadableJsonText(asBuiltJson);
        }
    }

    private static bool IsNoiseJsonKey(string key)
    {
        var k = key.Trim().ToLowerInvariant();
        return k is "id" or "uuid" or "guid" or "stepid" or "assetid" or "featureid"
            or "productid" or "projectid" or "runid" or "inputid" or "documentid"
            or "downloadurl" or "filepath" or "contenttype" or "iterationindex";
    }

    private static bool LooksLikeLabelKey(string key)
    {
        var k = key.Trim().ToLowerInvariant();
        return k is "label" or "name" or "title" or "featurename" or "inputlabel"
            or "fieldlabel" or "description" or "value" or "selectedvalue";
    }

    private static string HumanizeKey(string key)
    {
        if (string.IsNullOrWhiteSpace(key)) return key;
        return Regex.Replace(key, "([a-z])([A-Z])", "$1 $2");
    }

    private static bool IsReadableString(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return false;
        var v = value.Trim();
        if (v.Length < 2) return false;
        if (Regex.IsMatch(v, @"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"))
            return false;
        if (v.Length >= 48 && Regex.IsMatch(v, @"^[A-Za-z0-9+/=_-]+$")) return false;
        if (v.StartsWith("data:", StringComparison.OrdinalIgnoreCase)) return false;
        return true;
    }
}

public record GlobalSearchResultDto(
    string Id,
    string EntityType,
    string EntityId,
    string Title,
    string? Subtitle,
    string Route,
    string Snippet,
    List<string> MatchedFields,
    int Score
);

public record GlobalSearchResponseDto(
    string Query,
    int Total,
    IReadOnlyList<GlobalSearchResultDto> Results
);

public record SearchDocumentPreviewHitDto(
    string Context,
    string Text
);

public record SearchDocumentPreviewDto(
    string EntityId,
    string SourceType,
    string Title,
    string? Subtitle,
    string? DownloadUrl,
    IReadOnlyList<SearchDocumentPreviewHitDto> Hits
);
