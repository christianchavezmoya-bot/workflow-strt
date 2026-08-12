namespace Commtrac.Api.Services.Storage;

public class StorageOptions
{
    public const string SectionName = "Storage";

    /// <summary>Local (default) or S3.</summary>
    public string Provider { get; set; } = "Local";

    /// <summary>S3 bucket name (required when Provider=S3).</summary>
    public string? Bucket { get; set; }

    /// <summary>AWS region, e.g. us-east-1. Defaults to us-east-1 when empty.</summary>
    public string? Region { get; set; }

    /// <summary>Optional key prefix inside the bucket, e.g. commtrac/.</summary>
    public string? KeyPrefix { get; set; }

    /// <summary>Optional custom endpoint for MinIO/local S3 parity testing.</summary>
    public string? ServiceUrl { get; set; }

    /// <summary>Use path-style URLs (required for MinIO).</summary>
    public bool ForcePathStyle { get; set; }
}
