using Commtrac.Api.Data;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace Commtrac.Api.Tests;

// Test-hygiene fix (isolated from WF-4 logic): these tests mutate the process-global
// ASPNETCORE_ENVIRONMENT variable, which ApiTestFactory-booted hosts elsewhere in this suite also
// read at startup (see ApiTestCollection's own doc comment on parallel-factory races on CI). Two
// independent guards, per the same pattern already used for factory-booting tests:
// 1. [Collection(ApiTestCollection.Name)] — DisableParallelization=true — so these facts never run
//    concurrently with an ApiTestFactory host starting up on another thread.
// 2. Each fact restores the prior value in a finally block, so a failure/exception here can never
//    leak a mutated environment into a test that runs after it.
// Production seeder behavior (DbInitializer.ResolveSeed*Password) is unchanged.
[Collection(ApiTestCollection.Name)]
public class StrataNgoSeederPasswordTests
{
    [Fact]
    public void ResolveSeedAdminPassword_uses_development_fallback_in_development()
    {
        var previous = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");
        try
        {
            Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Development");
            var config = new ConfigurationBuilder().Build();

            var password = DbInitializer.ResolveSeedAdminPassword(config);

            Assert.Equal("Admin123!", password);
        }
        finally
        {
            Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", previous);
        }
    }

    [Fact]
    public void ResolveSeedAdminPassword_requires_config_outside_development()
    {
        var previous = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");
        try
        {
            Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Staging");
            var config = new ConfigurationBuilder().Build();

            var ex = Assert.Throws<InvalidOperationException>(
                () => DbInitializer.ResolveSeedAdminPassword(config));

            Assert.Contains("SeedAdmin:Password", ex.Message);
        }
        finally
        {
            Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", previous);
        }
    }

    [Fact]
    public void ResolveSeedProjectManagerPassword_requires_config_outside_development()
    {
        var previous = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");
        try
        {
            Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Production");
            var config = new ConfigurationBuilder().Build();

            var ex = Assert.Throws<InvalidOperationException>(
                () => DbInitializer.ResolveSeedProjectManagerPassword(config));

            Assert.Contains("SeedProjectManager:Password", ex.Message);
        }
        finally
        {
            Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", previous);
        }
    }
}
