using Commtrac.Api.Services;

namespace Commtrac.Api.Tests;

public class FrontendBaseUrlPolicyTests
{
    [Theory]
    [InlineData("https://www.strata-ngo.com")]
    [InlineData("https://www.strata-ngo.com/")]
    [InlineData("HTTPS://WWW.STRATA-NGO.COM")]
    public void IsLegacyInterimDevWebHost_matches_www(string url)
    {
        Assert.True(FrontendBaseUrlPolicy.IsLegacyInterimDevWebHost(url));
    }

    [Theory]
    [InlineData("https://staging.strata-ngo.com")]
    [InlineData("https://api.staging.strata-ngo.com")]
    [InlineData("")]
    [InlineData("not-a-url")]
    public void IsLegacyInterimDevWebHost_rejects_non_www(string url)
    {
        Assert.False(FrontendBaseUrlPolicy.IsLegacyInterimDevWebHost(url));
    }
}
