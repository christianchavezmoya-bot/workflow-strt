namespace Commtrac.Api.Services.Storage;

public class StorageOptions
{
    public const string SectionName = "Storage";

    /// <summary>Local (default) or S3 (future).</summary>
    public string Provider { get; set; } = "Local";
}
