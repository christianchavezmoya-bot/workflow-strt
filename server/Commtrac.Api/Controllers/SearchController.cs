using System.Text.RegularExpressions;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Commtrac.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
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
                    ["Installer Notes"] = i.InstallerNotes,
                    ["Project ID"] = i.ProjectId
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
                    ["Feature Values"] = a.FeatureValuesJson,
                    ["As-Built Captures"] = a.AsBuiltJson,
                    ["Workflow Step Results"] = latestRun?.StepResultsJson
                });
        }

        var docs = await _db.Documents.AsNoTracking().ToListAsync();
        foreach (var d in docs)
        {
            TryAddResult(
                results,
                terms,
                entityType: "document",
                entityId: d.Id,
                title: string.IsNullOrWhiteSpace(d.Name) ? "(Untitled Document)" : d.Name,
                subtitle: d.Type,
                route: "/documents",
                fields: new Dictionary<string, string?>
                {
                    ["Name"] = d.Name,
                    ["Type"] = d.Type,
                    ["Linked To"] = d.LinkedTo,
                    ["Created By"] = d.CreatedBy,
                    ["Notes"] = d.Notes,
                    ["Custom Values"] = d.CustomValuesJson
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
                    ["Steps"] = wi.StepsJson,
                    ["Feature Values"] = wi.FeatureValuesJson
                });
        }

        var workOrders = await _db.WorkOrders.AsNoTracking().ToListAsync();
        foreach (var wo in workOrders)
        {
            TryAddResult(
                results,
                terms,
                entityType: "workOrder",
                entityId: wo.Id,
                title: string.IsNullOrWhiteSpace(wo.JobReference) ? "(Untitled Work Order)" : wo.JobReference,
                subtitle: wo.Status,
                route: "/work-instructions",
                fields: new Dictionary<string, string?>
                {
                    ["Job Reference"] = wo.JobReference,
                    ["Status"] = wo.Status,
                    ["Notes"] = wo.Notes,
                    ["Steps"] = wo.StepsDataJson,
                    ["Product ID"] = wo.ProductId
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

    private async Task<List<IndexedChunkRow>> QueryIndexRowsByFirstTermAsync(string firstTerm, int maxRows)
    {
        var rows = new List<IndexedChunkRow>();
        var connection = (SqliteConnection)_db.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open)
        {
            await connection.OpenAsync();
        }

        await using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
SELECT SourceType, SourceId, Context, ChunkText, ChunkOrder
FROM SearchDocumentChunks
WHERE lower(ChunkText) LIKE @needle
ORDER BY UpdatedAt DESC, ChunkOrder ASC
LIMIT @maxRows;";

        cmd.Parameters.AddWithValue("@needle", $"%{firstTerm.ToLowerInvariant()}%");
        cmd.Parameters.AddWithValue("@maxRows", Math.Clamp(maxRows, 50, 2000));

        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            rows.Add(new IndexedChunkRow(
                SourceType: reader.GetString(0),
                SourceId: reader.GetString(1),
                Context: reader.GetString(2),
                ChunkText: reader.GetString(3),
                ChunkOrder: reader.GetInt32(4)
            ));
        }

        return rows;
    }

    private async Task<List<IndexedChunkRow>> QueryIndexRowsBySourceAsync(string sourceType, string sourceId, int maxRows)
    {
        var rows = new List<IndexedChunkRow>();
        var connection = (SqliteConnection)_db.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open)
        {
            await connection.OpenAsync();
        }

        await using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
SELECT SourceType, SourceId, Context, ChunkText, ChunkOrder
FROM SearchDocumentChunks
WHERE SourceType = @sourceType AND SourceId = @sourceId
ORDER BY ChunkOrder ASC
LIMIT @maxRows;";
        cmd.Parameters.AddWithValue("@sourceType", sourceType);
        cmd.Parameters.AddWithValue("@sourceId", sourceId);
        cmd.Parameters.AddWithValue("@maxRows", Math.Clamp(maxRows, 20, 2000));

        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            rows.Add(new IndexedChunkRow(
                SourceType: reader.GetString(0),
                SourceId: reader.GetString(1),
                Context: reader.GetString(2),
                ChunkText: reader.GetString(3),
                ChunkOrder: reader.GetInt32(4)
            ));
        }

        return rows;
    }

    private Task EnsureIndexTableExistsAsync()
        => _db.Database.ExecuteSqlRawAsync(@"
CREATE TABLE IF NOT EXISTS SearchDocumentChunks (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    SourceType TEXT NOT NULL,
    SourceId TEXT NOT NULL,
    Context TEXT NOT NULL,
    ChunkText TEXT NOT NULL,
    ChunkOrder INTEGER NOT NULL,
    UpdatedAt TEXT NOT NULL
);");

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
        var allText = string.Join(" ", fields.Values.Where(v => !string.IsNullOrWhiteSpace(v)));
        var normalizedAll = Normalize(allText).ToLowerInvariant();

        if (!terms.All(t => normalizedAll.Contains(t)))
        {
            return;
        }

        var matchedFields = fields
            .Where(kv => FieldContainsTerm(kv.Value, terms))
            .Select(kv => kv.Key)
            .ToList();

        var snippetSource = fields.FirstOrDefault(kv => FieldContainsTerm(kv.Value, terms));
        var snippet = BuildSnippet(snippetSource.Value ?? normalizedTitle, terms);
        var score = ComputeScore(normalizedTitle, matchedFields.Count, terms);

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

    private static bool FieldContainsTerm(string? value, List<string> terms)
    {
        if (string.IsNullOrWhiteSpace(value)) return false;
        var text = Normalize(value).ToLowerInvariant();
        return terms.Any(text.Contains);
    }

    private static int ComputeScore(string title, int matchedFieldCount, List<string> terms)
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

        score += matchedFieldCount * 4;
        return score;
    }

    private static string BuildSnippet(string text, List<string> terms)
    {
        var normalized = Normalize(text);
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
        var normalized = Normalize(chunkText);
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
}

internal record IndexedChunkRow(
    string SourceType,
    string SourceId,
    string Context,
    string ChunkText,
    int ChunkOrder
);

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
