using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// End-to-end smoke of the auth stack: DB seeding + BCrypt verify + JWT/session
/// creation, exercised through the real HTTP pipeline against a fresh temp DB.
///
/// History: this test originally exposed a fresh-DB init crash
/// (`SQLite Error 1: 'no such column: p.IsDeleted'`) — DbInitializer queried the
/// soft-delete-filtered tables before their model-only columns existed. Fixed by
/// `DbInitializer.EnsureSoftDeleteColumns`, which adds IsDeleted/DeletedAtUtc to
/// those tables right after Migrate(). This test now guards that fix.
/// </summary>
[Collection(ApiTestCollection.Name)]
public class AuthLoginTests : IClassFixture<ApiTestFactory>
{
    private readonly ApiTestFactory _factory;

    public AuthLoginTests(ApiTestFactory factory) => _factory = factory;

    [Fact]
    public async Task Login_with_seeded_admin_returns_token()
    {
        var client = _factory.CreateClient();

        var resp = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "admin@commtrac.local",
            password = "Admin123!",
        });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        var token = doc.RootElement.GetProperty("token").GetString();
        Assert.False(string.IsNullOrWhiteSpace(token), "expected a non-empty JWT for the seeded admin");
    }

    [Fact]
    public async Task Login_with_wrong_password_is_unauthorized()
    {
        var client = _factory.CreateClient();

        var resp = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "admin@commtrac.local",
            password = "definitely-wrong",
        });

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }
}
