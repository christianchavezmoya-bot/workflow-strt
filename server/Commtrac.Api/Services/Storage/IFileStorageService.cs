namespace Commtrac.Api.Services.Storage;

/// <summary>
/// Stores binary artifacts (documents, workflow media, report shares).
/// Relative paths use forward slashes and match values persisted in the DB
/// (e.g. "Storage/Documents/{file}").
/// </summary>
public interface IFileStorageService
{
    /// <summary>Local disk only — do not use for cloud storage reads/writes.</summary>
    string GetAbsolutePath(string relativePath);
    bool Exists(string relativePath);
    Stream OpenRead(string relativePath);

    /// <summary>
    /// Range-aware read supporting real HTTP byte-range semantics (RFC 7233) uniformly
    /// across storage backends. This matters specifically for S3: its GetObject response
    /// stream is not seekable, so ASP.NET's built-in FileStreamResult.EnableRangeProcessing
    /// (which requires Stream.CanSeek to compute/serve a range) silently falls back to
    /// serving the whole object with no Accept-Ranges/Content-Range — which is exactly the
    /// defect this method exists to fix. <paramref name="rangeHeaderValue"/> is the raw
    /// incoming "Range" request header value (e.g. "bytes=0-1023"), or null/empty for a
    /// normal full-content request. Returns null when the file does not exist. Throws
    /// <see cref="RangeNotSatisfiableException"/> when a single, well-formed range is out
    /// of bounds for the resource; a malformed or multi-range header is treated as no
    /// Range header (full content) per RFC 7233 §3.1.
    /// </summary>
    Task<FileRangeResult?> OpenReadRangeAsync(string relativePath, string? rangeHeaderValue, CancellationToken cancellationToken = default);

    Task<byte[]> ReadBytesAsync(string relativePath, CancellationToken cancellationToken = default);
    Task<string> ReadTextAsync(string relativePath, CancellationToken cancellationToken = default);
    Task SaveAsync(string relativePath, Stream content, CancellationToken cancellationToken = default);
    Task WriteBytesAsync(string relativePath, byte[] content, CancellationToken cancellationToken = default);
    Task WriteTextAsync(string relativePath, string content, CancellationToken cancellationToken = default);
    void Delete(string relativePath);
    void DeleteDirectory(string relativeDirectory);
    void EnsureDirectory(string relativeDirectory);
    string BuildRelativePath(params string[] segments);
    /// <summary>
    /// Lists file names (not full relative paths) under a directory.
    /// When <paramref name="namePrefix"/> is set, returns files whose name starts with that prefix.
    /// </summary>
    IReadOnlyList<string> ListFileNames(string relativeDirectory, string? namePrefix = null);
}
