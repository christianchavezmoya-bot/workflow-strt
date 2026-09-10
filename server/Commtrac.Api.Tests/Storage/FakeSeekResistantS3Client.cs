using System.Net;
using Amazon;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;

namespace Commtrac.Api.Tests.Storage;

/// <summary>
/// A fake S3 client for testing S3FileStorageService's range behavior without a real
/// AWS connection. Subclasses the real AmazonS3Client and overrides only the virtual
/// operation methods S3FileStorageService actually calls — everything else falls back to
/// the (never-invoked) base implementation. Every object read returns a
/// NonSeekableMemoryStream, deliberately reproducing the one property of a real S3
/// GetObject ResponseStream whose absence let the PR #352 Range fix pass its own tests
/// while silently not working against real S3.
/// </summary>
public sealed class FakeSeekResistantS3Client : AmazonS3Client
{
    private readonly Dictionary<string, byte[]> _objects = new();

    public FakeSeekResistantS3Client()
        : base(new BasicAWSCredentials("test", "test"), new AmazonS3Config { RegionEndpoint = RegionEndpoint.APSoutheast2 })
    {
    }

    public void Put(string key, byte[] content) => _objects[key] = content;

    public override Task<ListObjectsV2Response> ListObjectsV2Async(ListObjectsV2Request request, CancellationToken cancellationToken = default)
    {
        var prefix = request.Prefix ?? string.Empty;
        var response = new ListObjectsV2Response { IsTruncated = false };
        foreach (var key in _objects.Keys)
        {
            if (!key.StartsWith(prefix, StringComparison.Ordinal)) continue;
            response.S3Objects.Add(new S3Object { Key = key, BucketName = request.BucketName });
        }
        return Task.FromResult(response);
    }

    public override Task<GetObjectMetadataResponse> GetObjectMetadataAsync(
        GetObjectMetadataRequest request, CancellationToken cancellationToken = default)
    {
        if (!_objects.TryGetValue(request.Key, out var bytes))
        {
            throw new AmazonS3Exception("Not Found") { StatusCode = HttpStatusCode.NotFound };
        }

        return Task.FromResult(new GetObjectMetadataResponse { ContentLength = bytes.Length });
    }

    public override Task<GetObjectResponse> GetObjectAsync(GetObjectRequest request, CancellationToken cancellationToken = default)
    {
        if (!_objects.TryGetValue(request.Key, out var bytes))
        {
            throw new AmazonS3Exception("Not Found") { StatusCode = HttpStatusCode.NotFound };
        }

        if (request.ByteRange is { } byteRange)
        {
            var start = (int)byteRange.Start;
            var end = (int)Math.Min(byteRange.End, bytes.Length - 1);
            if (start < 0 || start >= bytes.Length || start > end)
            {
                // Real S3 rejects an out-of-bounds range with its own 416 — callers of this
                // fake are expected to pre-validate via GetObjectMetadataAsync + HttpRangeHeader
                // the same way S3FileStorageService does, so this path shouldn't be hit by it.
                throw new AmazonS3Exception("Requested Range Not Satisfiable") { StatusCode = HttpStatusCode.RequestedRangeNotSatisfiable };
            }

            var slice = bytes[start..(end + 1)];
            return Task.FromResult(new GetObjectResponse
            {
                ResponseStream = new NonSeekableMemoryStream(slice),
                ContentLength = slice.Length,
                HttpStatusCode = HttpStatusCode.PartialContent,
            });
        }

        return Task.FromResult(new GetObjectResponse
        {
            ResponseStream = new NonSeekableMemoryStream(bytes),
            ContentLength = bytes.Length,
            HttpStatusCode = HttpStatusCode.OK,
        });
    }
}
