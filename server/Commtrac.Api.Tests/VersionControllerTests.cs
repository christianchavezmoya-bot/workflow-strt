using System.Net;
using System.Text.Json;
using Xunit;

namespace Commtrac.Api.Tests;

[Collection(ApiTestCollection.Name)]
public class VersionControllerTests : IClassFixture<ApiTestFactory>
{
    private readonly ApiTestFactory _factory;

    public VersionControllerTests(ApiTestFactory factory) => _factory = factory;

    [Fact]
    public async Task Version_is_public_and_returns_environment_metadata()
    {
        var client = _factory.CreateClient();
        var resp = await client.GetAsync("/api/version");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        Assert.Equal("Commtrac.Api", doc.RootElement.GetProperty("application").GetString());
        Assert.False(string.IsNullOrWhiteSpace(doc.RootElement.GetProperty("version").GetString()));
        Assert.Equal("Development", doc.RootElement.GetProperty("environment").GetString());
        Assert.False(string.IsNullOrWhiteSpace(doc.RootElement.GetProperty("gitSha").GetString()));

        var body = await resp.Content.ReadAsStringAsync();
        Assert.DoesNotContain("Password", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("ConnectionString", body, StringComparison.OrdinalIgnoreCase);
    }
}
