namespace Commtrac.Api.Services;

/// <summary>
/// Canonical DEV web host is staging.strata-ngo.com (Phase C).
/// www.strata-ngo.com still serves the same DEV app during transition but is reserved for production (Phase F).
/// </summary>
public static class FrontendBaseUrlPolicy
{
    public const string CanonicalDevWebHost = "staging.strata-ngo.com";
    public const string LegacyInterimDevWebHost = "www.strata-ngo.com";

    public static bool IsLegacyInterimDevWebHost(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
        {
            return false;
        }

        return uri.Host.Equals(LegacyInterimDevWebHost, StringComparison.OrdinalIgnoreCase);
    }
}
