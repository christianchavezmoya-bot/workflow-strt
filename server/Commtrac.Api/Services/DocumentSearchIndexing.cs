using System.Threading.Channels;
using System.Diagnostics.CodeAnalysis;
using Commtrac.Api.Data;
using Commtrac.Api.Services.Storage;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Services;

public interface IDocumentSearchIndexQueue
{
    void EnqueueFullRebuild();
    void EnqueueLibraryDocument(string documentId);
    void EnqueueAssetDocument(string assetDocumentId);
    void RemoveLibraryDocument(string documentId);
    void RemoveAssetDocument(string assetDocumentId);
}

public interface IDocumentSearchIndexQueueMetrics
{
    int QueueDepth { get; }
}

public interface IDocumentSearchIndexMonitor
{
    DocumentSearchIndexStatusSnapshot GetSnapshot();
}

public record DocumentSearchIndexStatusSnapshot(
    bool IsRunning,
    string CurrentWorkType,
    int QueueDepth,
    DateTime? CurrentRunStartedAtUtc,
    int CurrentRunProcessed,
    int CurrentRunTotal,
    DateTime? LastRebuildStartedAtUtc,
    DateTime? LastRebuildCompletedAtUtc,
    int LastRebuildProcessed,
    int LastRebuildTotal,
    string? LastError
);

public enum DocumentIndexWorkType
{
    FullRebuild,
    IndexLibraryDocument,
    IndexAssetDocument,
    RemoveLibraryDocument,
    RemoveAssetDocument
}

public record DocumentIndexWorkItem(
    DocumentIndexWorkType Type,
    string? Id = null
);

public interface IDocumentSearchIndexChannel
{
    bool Enqueue(DocumentIndexWorkItem item);
    ValueTask<bool> WaitToReadAsync(CancellationToken ct);
    bool TryRead([NotNullWhen(true)] out DocumentIndexWorkItem? item);
}

public class DocumentSearchIndexStatusStore : IDocumentSearchIndexMonitor
{
    private readonly object _gate = new();

    private bool _isRunning;
    private string _currentWorkType = "Idle";
    private DateTime? _currentRunStartedAtUtc;
    private int _currentRunProcessed;
    private int _currentRunTotal;
    private DateTime? _lastRebuildStartedAtUtc;
    private DateTime? _lastRebuildCompletedAtUtc;
    private int _lastRebuildProcessed;
    private int _lastRebuildTotal;
    private string? _lastError;
    private int _queueDepth;

    public void OnQueueDepthChanged(int queueDepth)
    {
        lock (_gate)
        {
            _queueDepth = queueDepth;
        }
    }

    public void OnWorkStarted(DocumentIndexWorkType type)
    {
        lock (_gate)
        {
            _isRunning = true;
            _currentWorkType = type.ToString();
            _lastError = null;

            if (type == DocumentIndexWorkType.FullRebuild)
            {
                _currentRunStartedAtUtc = DateTime.UtcNow;
                _currentRunProcessed = 0;
                _currentRunTotal = 0;
                _lastRebuildStartedAtUtc = _currentRunStartedAtUtc;
            }
        }
    }

    public void OnRebuildProgress(int processed, int total)
    {
        lock (_gate)
        {
            _currentRunProcessed = processed;
            _currentRunTotal = total;
        }
    }

    public void OnWorkCompleted(DocumentIndexWorkType type)
    {
        lock (_gate)
        {
            _isRunning = false;
            _currentWorkType = "Idle";
            if (type == DocumentIndexWorkType.FullRebuild)
            {
                _lastRebuildCompletedAtUtc = DateTime.UtcNow;
                _lastRebuildProcessed = _currentRunProcessed;
                _lastRebuildTotal = _currentRunTotal;
            }
        }
    }

    public void OnWorkError(DocumentIndexWorkType type, string message)
    {
        lock (_gate)
        {
            _isRunning = false;
            _currentWorkType = "Idle";
            _lastError = message;
            if (type == DocumentIndexWorkType.FullRebuild)
            {
                _lastRebuildCompletedAtUtc = DateTime.UtcNow;
            }
        }
    }

    public DocumentSearchIndexStatusSnapshot GetSnapshot()
    {
        lock (_gate)
        {
            return new DocumentSearchIndexStatusSnapshot(
                IsRunning: _isRunning,
                CurrentWorkType: _currentWorkType,
                QueueDepth: _queueDepth,
                CurrentRunStartedAtUtc: _currentRunStartedAtUtc,
                CurrentRunProcessed: _currentRunProcessed,
                CurrentRunTotal: _currentRunTotal,
                LastRebuildStartedAtUtc: _lastRebuildStartedAtUtc,
                LastRebuildCompletedAtUtc: _lastRebuildCompletedAtUtc,
                LastRebuildProcessed: _lastRebuildProcessed,
                LastRebuildTotal: _lastRebuildTotal,
                LastError: _lastError
            );
        }
    }
}

public class DocumentSearchIndexQueue : IDocumentSearchIndexQueue, IDocumentSearchIndexChannel, IDocumentSearchIndexQueueMetrics
{
    private readonly Channel<DocumentIndexWorkItem> _channel = Channel.CreateUnbounded<DocumentIndexWorkItem>();
    private int _queueDepth;

    public int QueueDepth => Math.Max(0, Volatile.Read(ref _queueDepth));

    public bool Enqueue(DocumentIndexWorkItem item)
    {
        var ok = _channel.Writer.TryWrite(item);
        if (ok) Interlocked.Increment(ref _queueDepth);
        return ok;
    }

    public ValueTask<bool> WaitToReadAsync(CancellationToken ct) => _channel.Reader.WaitToReadAsync(ct);

    public bool TryRead([NotNullWhen(true)] out DocumentIndexWorkItem? item)
    {
        var ok = _channel.Reader.TryRead(out item);
        if (ok)
        {
            Interlocked.Decrement(ref _queueDepth);
        }
        return ok;
    }

    public void EnqueueFullRebuild() => Enqueue(new(DocumentIndexWorkType.FullRebuild));
    public void EnqueueLibraryDocument(string documentId) => Enqueue(new(DocumentIndexWorkType.IndexLibraryDocument, documentId));
    public void EnqueueAssetDocument(string assetDocumentId) => Enqueue(new(DocumentIndexWorkType.IndexAssetDocument, assetDocumentId));
    public void RemoveLibraryDocument(string documentId) => Enqueue(new(DocumentIndexWorkType.RemoveLibraryDocument, documentId));
    public void RemoveAssetDocument(string assetDocumentId) => Enqueue(new(DocumentIndexWorkType.RemoveAssetDocument, assetDocumentId));
}

public class DocumentSearchIndexWorker : BackgroundService
{
    private const string SourceLibrary = "library";
    private const string SourceAsset = "asset";

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IDocumentSearchIndexChannel _channel;
    private readonly IDocumentSearchIndexQueueMetrics _metrics;
    private readonly DocumentSearchIndexStatusStore _status;
    private readonly ILogger<DocumentSearchIndexWorker> _logger;

    public DocumentSearchIndexWorker(
        IServiceScopeFactory scopeFactory,
        IDocumentSearchIndexChannel channel,
        IDocumentSearchIndexQueueMetrics metrics,
        DocumentSearchIndexStatusStore status,
        ILogger<DocumentSearchIndexWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _channel = channel;
        _metrics = metrics;
        _status = status;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await EnsureIndexTableAsync(stoppingToken);
            _channel.Enqueue(new DocumentIndexWorkItem(DocumentIndexWorkType.FullRebuild));
            _status.OnQueueDepthChanged(_metrics.QueueDepth);

            while (await _channel.WaitToReadAsync(stoppingToken))
            {
                while (_channel.TryRead(out var workItem))
                {
                    if (workItem is null) continue;
                    _status.OnQueueDepthChanged(_metrics.QueueDepth);
                    try
                    {
                        _status.OnWorkStarted(workItem.Type);
                        await ProcessWorkItemAsync(workItem, stoppingToken);
                        _status.OnWorkCompleted(workItem.Type);
                    }
                    catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                    {
                        return;
                    }
                    catch (Exception ex)
                    {
                        _status.OnWorkError(workItem.Type, ex.Message);
                        _logger.LogError(ex, "Document search indexing failed for work item {Type} {Id}", workItem.Type, workItem.Id);
                    }
                    finally
                    {
                        _status.OnQueueDepthChanged(_metrics.QueueDepth);
                    }
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Normal shutdown: WaitToReadAsync (or EnsureIndexTableAsync) is cancelled when the
            // host stops. Exit quietly so the default BackgroundServiceExceptionBehavior.StopHost
            // isn't tripped by a benign cancellation — that was logging an alarming "unhandled
            // exception, the IHost instance is stopping" trace on every shutdown.
        }
    }

    private async Task ProcessWorkItemAsync(DocumentIndexWorkItem workItem, CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var extractor = scope.ServiceProvider.GetRequiredService<IDocumentContentSearchService>();
        var files = scope.ServiceProvider.GetRequiredService<IFileStorageService>();

        switch (workItem.Type)
        {
            case DocumentIndexWorkType.FullRebuild:
                await RebuildAllAsync(db, extractor, files, ct);
                break;
            case DocumentIndexWorkType.IndexLibraryDocument:
                if (!string.IsNullOrWhiteSpace(workItem.Id))
                    await IndexLibraryDocumentAsync(db, extractor, files, workItem.Id, ct);
                break;
            case DocumentIndexWorkType.IndexAssetDocument:
                if (!string.IsNullOrWhiteSpace(workItem.Id))
                    await IndexAssetDocumentAsync(db, extractor, files, workItem.Id, ct);
                break;
            case DocumentIndexWorkType.RemoveLibraryDocument:
                if (!string.IsNullOrWhiteSpace(workItem.Id))
                    await DeleteSourceChunksAsync(db, SourceLibrary, workItem.Id, ct);
                break;
            case DocumentIndexWorkType.RemoveAssetDocument:
                if (!string.IsNullOrWhiteSpace(workItem.Id))
                    await DeleteSourceChunksAsync(db, SourceAsset, workItem.Id, ct);
                break;
        }
    }

    private async Task RebuildAllAsync(
        AppDbContext db,
        IDocumentContentSearchService extractor,
        IFileStorageService files,
        CancellationToken ct)
    {
        await db.Database.ExecuteSqlRawAsync("DELETE FROM SearchDocumentChunks;", ct);

        var docs = await db.Documents
            .AsNoTracking()
            .Where(d => !string.IsNullOrWhiteSpace(d.FilePath))
            .ToListAsync(ct);
        List<Commtrac.Api.Models.AssetDocumentEntity> assetDocs = new();
        Dictionary<string, Commtrac.Api.Models.AssetDocumentRevisionEntity> latestByDoc = new();
        try
        {
            assetDocs = await db.AssetDocuments.AsNoTracking().ToListAsync(ct);
            var revisions = await db.AssetDocumentRevisions.AsNoTracking().ToListAsync(ct);
            latestByDoc = revisions
                .GroupBy(r => r.DocumentId)
                .Select(g => g.OrderByDescending(r => r.RevisionNumber).First())
                .ToDictionary(r => r.DocumentId, r => r);
        }
        catch
        {
            // Older databases may not have asset-document tables yet.
        }

        var total = docs.Count + assetDocs.Count(ad => latestByDoc.ContainsKey(ad.Id));
        var processed = 0;
        _status.OnRebuildProgress(processed, total);

        foreach (var doc in docs)
        {
            await IndexSourceAsync(db, extractor, files, SourceLibrary, doc.Id, doc.FilePath!, ct);
            processed++;
            _status.OnRebuildProgress(processed, total);
        }

        foreach (var ad in assetDocs)
        {
            if (!latestByDoc.TryGetValue(ad.Id, out var rev)) continue;
            var relativePath = files.BuildRelativePath("Storage", "Documents", ad.AssetId, rev.StoredName);
            await IndexSourceAsync(db, extractor, files, SourceAsset, ad.Id, relativePath, ct);
            processed++;
            _status.OnRebuildProgress(processed, total);
        }
    }

    private async Task IndexLibraryDocumentAsync(
        AppDbContext db,
        IDocumentContentSearchService extractor,
        IFileStorageService files,
        string docId,
        CancellationToken ct)
    {
        await DeleteSourceChunksAsync(db, SourceLibrary, docId, ct);
        var doc = await db.Documents.AsNoTracking().FirstOrDefaultAsync(d => d.Id == docId, ct);
        if (doc is null || string.IsNullOrWhiteSpace(doc.FilePath)) return;

        await IndexSourceAsync(db, extractor, files, SourceLibrary, docId, doc.FilePath, ct);
    }

    private async Task IndexAssetDocumentAsync(
        AppDbContext db,
        IDocumentContentSearchService extractor,
        IFileStorageService files,
        string assetDocId,
        CancellationToken ct)
    {
        try
        {
            await DeleteSourceChunksAsync(db, SourceAsset, assetDocId, ct);

            var assetDoc = await db.AssetDocuments.AsNoTracking().FirstOrDefaultAsync(a => a.Id == assetDocId, ct);
            if (assetDoc is null) return;

            var latest = await db.AssetDocumentRevisions
                .AsNoTracking()
                .Where(r => r.DocumentId == assetDocId)
                .OrderByDescending(r => r.RevisionNumber)
                .FirstOrDefaultAsync(ct);

            if (latest is null) return;

            var relativePath = files.BuildRelativePath("Storage", "Documents", assetDoc.AssetId, latest.StoredName);
            await IndexSourceAsync(db, extractor, files, SourceAsset, assetDocId, relativePath, ct);
        }
        catch
        {
            // Older databases may not have asset-document tables yet.
        }
    }

    private static async Task IndexSourceAsync(
        AppDbContext db,
        IDocumentContentSearchService extractor,
        IFileStorageService files,
        string sourceType,
        string sourceId,
        string relativePath,
        CancellationToken ct)
    {
        if (!files.Exists(relativePath)) return;

        await using var stream = files.OpenRead(relativePath);
        var fileName = Path.GetFileName(relativePath);
        var segments = await extractor.ExtractSegmentsAsync(stream, fileName, ct);
        if (segments.Count == 0) return;

        var chunks = BuildChunks(segments);
        if (chunks.Count == 0) return;

        await InsertChunksAsync(db, sourceType, sourceId, chunks, ct);
    }

    private static List<(string Context, string Text, int ChunkOrder)> BuildChunks(IReadOnlyList<DocumentTextSegment> segments)
    {
        const int chunkSize = 320;
        const int overlap = 80;
        var chunks = new List<(string Context, string Text, int ChunkOrder)>();
        var order = 0;

        foreach (var segment in segments)
        {
            var text = segment.Text;
            if (string.IsNullOrWhiteSpace(text)) continue;

            if (text.Length <= chunkSize)
            {
                chunks.Add((segment.Context, text, order++));
                continue;
            }

            var start = 0;
            while (start < text.Length)
            {
                var length = Math.Min(chunkSize, text.Length - start);
                var chunk = text.Substring(start, length).Trim();
                if (!string.IsNullOrWhiteSpace(chunk))
                {
                    chunks.Add((segment.Context, chunk, order++));
                }
                if (start + length >= text.Length) break;
                start += chunkSize - overlap;
            }
        }

        return chunks;
    }

    private static async Task InsertChunksAsync(
        AppDbContext db,
        string sourceType,
        string sourceId,
        List<(string Context, string Text, int ChunkOrder)> chunks,
        CancellationToken ct)
    {
        await SearchDocumentChunksStore.InsertChunksAsync(db, sourceType, sourceId, chunks, ct);
    }

    private static Task DeleteSourceChunksAsync(AppDbContext db, string sourceType, string sourceId, CancellationToken ct)
        => db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM SearchDocumentChunks WHERE SourceType = {sourceType} AND SourceId = {sourceId};", ct);

    private async Task EnsureIndexTableAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await SearchDocumentChunksStore.EnsureTableAsync(db, ct);
    }
}
