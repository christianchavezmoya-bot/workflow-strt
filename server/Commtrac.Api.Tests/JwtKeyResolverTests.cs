using Commtrac.Api.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace Commtrac.Api.Tests;

public class JwtKeyResolverTests
{
    [Fact]
    public void Resolve_accepts_32_byte_key_in_production()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Key"] = new string('x', 32),
            })
            .Build();
        var env = new TestHostEnvironment("Production");

        var key = JwtKeyResolver.Resolve(config, env);

        Assert.Equal(new string('x', 32), key);
    }

    [Fact]
    public void Resolve_rejects_short_key_in_production()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Key"] = new string('x', 31),
            })
            .Build();
        var env = new TestHostEnvironment("Production");

        var ex = Assert.Throws<InvalidOperationException>(() => JwtKeyResolver.Resolve(config, env));

        Assert.Contains("32 UTF-8 bytes", ex.Message);
    }

    [Fact]
    public void Resolve_allows_short_key_in_development()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Key"] = "short-dev-key",
            })
            .Build();
        var env = new TestHostEnvironment("Development");

        var key = JwtKeyResolver.Resolve(config, env);

        Assert.Equal("short-dev-key", key);
    }

    private sealed class TestHostEnvironment(string environmentName) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environmentName;
        public string ApplicationName { get; set; } = "Commtrac.Api.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = null!;
    }
}
