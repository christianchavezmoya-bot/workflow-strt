namespace Commtrac.Api.Services.Storage;

internal static class StoragePathHelper
{
    internal static string NormalizeRelativePath(string relativePath)
        => relativePath.Replace('\\', '/').TrimStart('/');

    internal static string BuildRelativePath(params string[] segments)
        => string.Join('/', segments.Select(s => s.Trim('/', '\\')).Where(s => !string.IsNullOrWhiteSpace(s)));

    internal static string ToObjectKey(string? keyPrefix, string relativePath)
    {
        var normalized = NormalizeRelativePath(relativePath);
        if (string.IsNullOrWhiteSpace(keyPrefix))
        {
            return normalized;
        }

        var prefix = keyPrefix.Trim().Trim('/').Replace('\\', '/');
        return string.IsNullOrWhiteSpace(prefix) ? normalized : $"{prefix}/{normalized}";
    }

    internal static string RelativeDirectoryPrefix(string? keyPrefix, string relativeDirectory)
    {
        var key = ToObjectKey(keyPrefix, relativeDirectory);
        return key.EndsWith('/') ? key : $"{key}/";
    }
}
