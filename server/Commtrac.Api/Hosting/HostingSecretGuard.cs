namespace Commtrac.Api.Hosting;

/// <summary>
/// Validates required secrets for non-Development hosting profiles.
/// Development keeps existing local defaults so day-to-day dev is unchanged.
/// </summary>
public static class HostingSecretGuard
{
    public static void ValidateProductionSecrets(IConfiguration configuration, IHostEnvironment environment)
    {
        if (environment.IsDevelopment()) return;
        _ = JwtKeyResolver.Resolve(configuration, environment);
    }
}
