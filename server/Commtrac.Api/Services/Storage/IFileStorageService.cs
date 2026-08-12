namespace Commtrac.Api.Services.Storage;

/// <summary>
/// Stores binary artifacts (documents, workflow media, report shares).
/// Relative paths use forward slashes and match values persisted in the DB
/// (e.g. "Storage/Documents/{file}").
/// </summary>
public interface IFileStorageService
{
    string GetAbsolutePath(string relativePath);
    bool Exists(string relativePath);
    Stream OpenRead(string relativePath);
    Task<byte[]> ReadBytesAsync(string relativePath, CancellationToken cancellationToken = default);
    Task<string> ReadTextAsync(string relativePath, CancellationToken cancellationToken = default);
    Task SaveAsync(string relativePath, Stream content, CancellationToken cancellationToken = default);
    Task WriteBytesAsync(string relativePath, byte[] content, CancellationToken cancellationToken = default);
    Task WriteTextAsync(string relativePath, string content, CancellationToken cancellationToken = default);
    void Delete(string relativePath);
    void DeleteDirectory(string relativeDirectory);
    void EnsureDirectory(string relativeDirectory);
    string BuildRelativePath(params string[] segments);
}
