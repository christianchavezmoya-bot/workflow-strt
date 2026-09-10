namespace Commtrac.Api.Services.Storage;

using Microsoft.AspNetCore.Hosting;

/// <summary>
/// Local disk implementation — same layout as today under ContentRootPath/Storage/.
/// </summary>
public sealed class LocalFileStorageService : IFileStorageService
{
    private readonly string _rootPath;

    public LocalFileStorageService(IWebHostEnvironment environment)
    {
        _rootPath = environment.ContentRootPath;
    }

    public string BuildRelativePath(params string[] segments)
        => string.Join('/', segments.Select(s => s.Trim('/', '\\')).Where(s => !string.IsNullOrWhiteSpace(s)));

    public string GetAbsolutePath(string relativePath)
    {
        var normalized = NormalizeRelativePath(relativePath);
        var parts = normalized.Split('/', StringSplitOptions.RemoveEmptyEntries);
        return Path.GetFullPath(Path.Combine(new[] { _rootPath }.Concat(parts).ToArray()));
    }

    public bool Exists(string relativePath) => File.Exists(GetAbsolutePath(relativePath));

    public Stream OpenRead(string relativePath) => File.OpenRead(GetAbsolutePath(relativePath));

    public Task<FileRangeResult?> OpenReadRangeAsync(string relativePath, string? rangeHeaderValue, CancellationToken cancellationToken = default)
    {
        var absolutePath = GetAbsolutePath(relativePath);
        if (!File.Exists(absolutePath))
        {
            return Task.FromResult<FileRangeResult?>(null);
        }

        var totalLength = new FileInfo(absolutePath).Length;

        if (HttpRangeHeader.TryParse(rangeHeaderValue, totalLength, out var range, out var unsatisfiable))
        {
            var contentLength = range.End - range.Start + 1;
            var fileStream = File.OpenRead(absolutePath);
            fileStream.Seek(range.Start, SeekOrigin.Begin);
            Stream bounded = new BoundedReadStream(fileStream, contentLength);
            return Task.FromResult<FileRangeResult?>(
                new FileRangeResult(bounded, totalLength, contentLength, range.Start, range.End, IsPartial: true));
        }

        if (unsatisfiable)
        {
            throw new RangeNotSatisfiableException(totalLength);
        }

        var full = File.OpenRead(absolutePath);
        return Task.FromResult<FileRangeResult?>(
            new FileRangeResult(full, totalLength, totalLength, 0, Math.Max(0, totalLength - 1), IsPartial: false));
    }

    public Task<byte[]> ReadBytesAsync(string relativePath, CancellationToken cancellationToken = default)
        => File.ReadAllBytesAsync(GetAbsolutePath(relativePath), cancellationToken);

    public Task<string> ReadTextAsync(string relativePath, CancellationToken cancellationToken = default)
        => File.ReadAllTextAsync(GetAbsolutePath(relativePath), cancellationToken);

    public async Task SaveAsync(string relativePath, Stream content, CancellationToken cancellationToken = default)
    {
        var absolutePath = GetAbsolutePath(relativePath);
        Directory.CreateDirectory(Path.GetDirectoryName(absolutePath)!);
        await using var stream = File.Create(absolutePath);
        await content.CopyToAsync(stream, cancellationToken);
    }

    public Task WriteBytesAsync(string relativePath, byte[] content, CancellationToken cancellationToken = default)
    {
        var absolutePath = GetAbsolutePath(relativePath);
        Directory.CreateDirectory(Path.GetDirectoryName(absolutePath)!);
        return File.WriteAllBytesAsync(absolutePath, content, cancellationToken);
    }

    public Task WriteTextAsync(string relativePath, string content, CancellationToken cancellationToken = default)
    {
        var absolutePath = GetAbsolutePath(relativePath);
        Directory.CreateDirectory(Path.GetDirectoryName(absolutePath)!);
        return File.WriteAllTextAsync(absolutePath, content, cancellationToken);
    }

    public void Delete(string relativePath)
    {
        var absolutePath = GetAbsolutePath(relativePath);
        if (File.Exists(absolutePath))
        {
            File.Delete(absolutePath);
        }
    }

    public void DeleteDirectory(string relativeDirectory)
    {
        var absolutePath = GetAbsolutePath(relativeDirectory);
        if (Directory.Exists(absolutePath))
        {
            Directory.Delete(absolutePath, recursive: true);
        }
    }

    public void EnsureDirectory(string relativeDirectory)
    {
        Directory.CreateDirectory(GetAbsolutePath(relativeDirectory));
    }

    public IReadOnlyList<string> ListFileNames(string relativeDirectory, string? namePrefix = null)
    {
        var absoluteDirectory = GetAbsolutePath(relativeDirectory);
        if (!Directory.Exists(absoluteDirectory))
        {
            return Array.Empty<string>();
        }

        var pattern = string.IsNullOrWhiteSpace(namePrefix) ? "*" : $"{namePrefix}*";
        return Directory.GetFiles(absoluteDirectory, pattern)
            .Select(Path.GetFileName)
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Cast<string>()
            .ToList();
    }

    private static string NormalizeRelativePath(string relativePath)
        => relativePath.Replace('\\', '/').TrimStart('/');
}
