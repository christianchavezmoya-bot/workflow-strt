namespace Commtrac.Api.Hosting;

/// <summary>
/// Central JWT signing-key resolution. Development may use a documented fallback;
/// production must supply a strong secret via config/env/user-secrets.
/// </summary>
public static class JwtKeyResolver
{
    public const string DevelopmentFallbackKey = "dev-only-change-me-32-bytes-minimum-key!!";

    public static bool IsWeakKey(string? key)
    {
        if (string.IsNullOrWhiteSpace(key)) return true;
        return key.StartsWith("dev-only-change-me", StringComparison.Ordinal);
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
