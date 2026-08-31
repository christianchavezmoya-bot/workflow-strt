using Commtrac.Api.Data;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace Commtrac.Api.Tests;

public class StrataNgoSeederPasswordTests
{
    [Fact]
    public void ResolveSeedAdminPassword_uses_development_fallback_in_development()
    {
        Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Development");
        var config = new ConfigurationBuilder().Build();

        var password = DbInitializer.ResolveSeedAdminPassword(config);

        Assert.Equal("Admin123!", password);
    }

    [Fact]
    public void ResolveSeedAdminPassword_requires_config_outside_development()
    {
        Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Staging");
        var config = new ConfigurationBuilder().Build();

        var ex = Assert.Throws<InvalidOperationException>(
            () => DbInitializer.ResolveSeedAdminPassword(config));

        Assert.Contains("SeedAdmin:Password", ex.Message);
    }

    [Fact]
    public void ResolveSeedProjectManagerPassword_requires_config_outside_development()
    {
        Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Production");
        var config = new ConfigurationBuilder().Build();

        var ex = Assert.Throws<InvalidOperationException>(
            () => DbInitializer.ResolveSeedProjectManagerPassword(config));

        Assert.Contains("SeedProjectManager:Password", ex.Message);
    }
}
