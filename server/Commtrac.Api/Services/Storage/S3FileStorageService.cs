using Amazon;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Options;

namespace Commtrac.Api.Services.Storage;

/// <summary>
/// S3-backed storage. Relative paths map to object keys under an optional prefix.
/// Credentials use the standard AWS SDK chain (env vars, IAM role, etc.).
/// </summary>
public sealed class S3FileStorageService : IFileStorageService
{
    private readonly IAmazonS3 _s3;
    private readonly StorageOptions _options;
    private readonly string _bucket;

    public S3FileStorageService(IAmazonS3 s3, IOptions<StorageOptions> options)
    {
        _s3 = s3;
        _options = options.Value;
        _bucket = _options.Bucket
            ?? throw new InvalidOperationException("Storage:Bucket is required when Storage:Provider=S3.");
    }

    public string BuildRelativePath(params string[] segments)
        => StoragePathHelper.BuildRelativePath(segments);

    public string GetAbsolutePath(string relativePath)
        => throw new NotSupportedException("S3 storage has no local absolute path. Use OpenRead/Exists with the relative path.");

    public bool Exists(string relativePath)
    {
        try
        {
            _s3.GetObjectMetadataAsync(_bucket, ToKey(relativePath)).GetAwaiter().GetResult();
            return true;
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return false;
        }
    }

    public Stream OpenRead(string relativePath)
    {
        var response = _s3.GetObjectAsync(_bucket, ToKey(relativePath)).GetAwaiter().GetResult();
        return response.ResponseStream;
    }

    public async Task<byte[]> ReadBytesAsync(string relativePath, CancellationToken cancellationToken = default)
    {
        await using var stream = OpenRead(relativePath);
        using var ms = new MemoryStream();
        await stream.CopyToAsync(ms, cancellationToken);
        return ms.ToArray();
    }

    public async Task<string> ReadTextAsync(string relativePath, CancellationToken cancellationToken = default)
    {
        await using var stream = OpenRead(relativePath);
        using var reader = new StreamReader(stream);
        return await reader.ReadToEndAsync(cancellationToken);
    }

    public Task SaveAsync(string relativePath, Stream content, CancellationToken cancellationToken = default)
        => PutObjectAsync(relativePath, content, cancellationToken);

    public Task WriteBytesAsync(string relativePath, byte[] content, CancellationToken cancellationToken = default)
        => PutObjectAsync(relativePath, new MemoryStream(content), cancellationToken);

    public Task WriteTextAsync(string relativePath, string content, CancellationToken cancellationToken = default)
        => PutObjectAsync(relativePath, new MemoryStream(System.Text.Encoding.UTF8.GetBytes(content)), cancellationToken);

    public void Delete(string relativePath)
    {
        _s3.DeleteObjectAsync(_bucket, ToKey(relativePath)).GetAwaiter().GetResult();
    }

    public void DeleteDirectory(string relativeDirectory)
    {
        var prefix = StoragePathHelper.RelativeDirectoryPrefix(_options.KeyPrefix, relativeDirectory);
        string? continuationToken = null;

        do
        {
            var listing = _s3.ListObjectsV2Async(new ListObjectsV2Request
            {
                BucketName = _bucket,
                Prefix = prefix,
                ContinuationToken = continuationToken,
            }).GetAwaiter().GetResult();

            foreach (var obj in listing.S3Objects)
            {
                _s3.DeleteObjectAsync(_bucket, obj.Key).GetAwaiter().GetResult();
            }

            continuationToken = listing.IsTruncated ? listing.NextContinuationToken : null;
        }
        while (continuationToken is not null);
    }

    public void EnsureDirectory(string relativeDirectory)
    {
        // S3 has no directories — prefixes are implicit on PutObject.
    }

    public IReadOnlyList<string> ListFileNames(string relativeDirectory, string? namePrefix = null)
    {
        var prefix = StoragePathHelper.RelativeDirectoryPrefix(_options.KeyPrefix, relativeDirectory);
        var results = new List<string>();
        string? continuationToken = null;

        do
        {
            var listing = _s3.ListObjectsV2Async(new ListObjectsV2Request
            {
                BucketName = _bucket,
                Prefix = prefix,
                ContinuationToken = continuationToken,
            }).GetAwaiter().GetResult();

            foreach (var obj in listing.S3Objects)
            {
                if (obj.Key.EndsWith('/')) continue;
                var fileName = obj.Key[prefix.Length..];
                if (fileName.Contains('/')) continue;
                if (!string.IsNullOrWhiteSpace(namePrefix) && !fileName.StartsWith(namePrefix, StringComparison.Ordinal))
                {
                    continue;
                }

                results.Add(fileName);
            }

            continuationToken = listing.IsTruncated ? listing.NextContinuationToken : null;
        }
        while (continuationToken is not null);

        return results;
    }

    private async Task PutObjectAsync(string relativePath, Stream content, CancellationToken cancellationToken)
    {
        var request = new PutObjectRequest
        {
            BucketName = _bucket,
            Key = ToKey(relativePath),
            InputStream = content,
            AutoCloseStream = false,
        };
        await _s3.PutObjectAsync(request, cancellationToken);
    }

    private string ToKey(string relativePath)
        => StoragePathHelper.ToObjectKey(_options.KeyPrefix, relativePath);
}

internal static class S3ClientFactory
{
    internal static IAmazonS3 Create(StorageOptions options)
    {
        if (string.IsNullOrWhiteSpace(options.Bucket))
        {
            throw new InvalidOperationException("Storage:Bucket is required when Storage:Provider=S3.");
        }

        var regionName = string.IsNullOrWhiteSpace(options.Region) ? "us-east-1" : options.Region;
        var config = new AmazonS3Config
        {
            RegionEndpoint = RegionEndpoint.GetBySystemName(regionName),
            ForcePathStyle = options.ForcePathStyle,
        };

        if (!string.IsNullOrWhiteSpace(options.ServiceUrl))
        {
            config.ServiceURL = options.ServiceUrl;
            config.AuthenticationRegion = regionName;
            config.ForcePathStyle = true;
        }

        return new AmazonS3Client(config);
    }
}
