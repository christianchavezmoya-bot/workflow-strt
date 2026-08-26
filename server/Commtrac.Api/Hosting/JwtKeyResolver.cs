namespace Commtrac.Api.Hosting;

/// <summary>
/// Central JWT signing-key resolution. Development may use a documented fallback;
/// production must supply a strong secret via config/env/user-secrets.
/// </summary>
public static class JwtKeyResolver
{
    public const string DevelopmentFallbackKey = "dev-only-change-me-32-bytes-minimum-key!!";

    /// <summary>HS256 requires at least 256 bits (32 UTF-8 bytes) for the signing key.</summary>
    public const int MinimumKeyUtf8Bytes = 32;

    public static bool IsWeakKey(string? key)
    {
        if (string.IsNullOrWhiteSpace(key)) return true;
        return key.StartsWith("dev-only-change-me", StringComparison.Ordinal);
    }

    public static bool IsKeyTooShort(string? key)
    {
        if (string.IsNullOrWhiteSpace(key)) return true;
        return System.Text.Encoding.UTF8.GetByteCount(key) < MinimumKeyUtf8Bytes;
    }

    public static string Resolve(IConfiguration configuration, IHostEnvironment environment)
    {
        var key = configuration["Jwt:Key"];
        if (!string.IsNullOrWhiteSpace(key))
        {
            if (!environment.IsDevelopment() && IsWeakKey(key))
            {
                throw new InvalidOperationException(
                    "Jwt:Key is set to a development placeholder. Configure a strong random secret for non-Development environments.");
            }
            if (!environment.IsDevelopment() && IsKeyTooShort(key))
            {
                throw new InvalidOperationException(
                    $"Jwt:Key must be at least {MinimumKeyUtf8Bytes} UTF-8 bytes for HS256 signing. Update the secret in configuration (e.g. Jwt__Key in Secrets Manager) and redeploy.");
            }
            return key;
        }

        if (environment.IsDevelopment())
        {
            return DevelopmentFallbackKey;
        }

        throw new InvalidOperationException(
            "Jwt:Key is not configured. Set Jwt__Key (or user-secrets) before running in non-Development environments.");
    }
}
