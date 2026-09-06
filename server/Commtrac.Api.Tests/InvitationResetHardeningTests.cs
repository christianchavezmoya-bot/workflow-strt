using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using System.Threading.Tasks;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// P2 hardening: invitation/reset tokens are now stored hashed at rest (never raw), the
/// invite/reset link is generated only from trusted server configuration (never
/// Origin/Referer/Host), and a newly created account can never authenticate with the old
/// shared/source-visible default password. See AuthController.HashToken/ResolveFrontendBaseUrl
/// and UsersController.Create/Invite. Uses InvitationResetHardeningTestFactory (non-Development,
/// capturing IEmailSender) so the actual hardened code paths run exactly as they would outside
/// Development.
/// </summary>
[Collection(ApiTestCollection.Name)]
public class InvitationResetHardeningTests
{
    private const string AdminEmail = "admin@hardening-test.local";
    private const string AdminPassword = "Admin123!Test";
    private const string OldPassword = "OldPassword123!";
    private const string NewPassword = "NewPassword456!";

    private static async Task<UserEntity> SeedActiveUserAsync(InvitationResetHardeningTestFactory factory, string email)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var user = new UserEntity
        {
            Id = Guid.NewGuid().ToString("N"),
            Email = email,
            FullName = "Hardening Test User",
            Role = "Viewer",
            Office = "Test Office",
            IsActive = true,
            IsFirstLogin = false,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(OldPassword),
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    private static async Task<UserEntity?> ReloadUserAsync(InvitationResetHardeningTestFactory factory, string userId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId);
    }

    private static async Task ExpireTokenAsync(InvitationResetHardeningTestFactory factory, string userId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var user = await db.Users.FirstAsync(u => u.Id == userId);
        user.ResetTokenExpiresUtc = DateTime.UtcNow.AddHours(-1);
        await db.SaveChangesAsync();
    }

    private static async Task<string> AdminTokenAsync(HttpClient client)
    {
        var resp = await client.PostAsJsonAsync("/api/auth/login", new { email = AdminEmail, password = AdminPassword });
        resp.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("token").GetString()!;
    }

    private static HttpRequestMessage AuthedPost(string url, string token, object? body = null)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, url);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (body is not null)
        {
            req.Content = JsonContent.Create(body);
        }
        return req;
    }

    private static string ExtractToken(string link)
    {
        var uri = new Uri(link);
        var query = QueryHelpers.ParseQuery(uri.Query);
        return query["token"].ToString();
    }

    [Fact]
    public async Task Forgot_password_stores_only_a_hash_never_the_raw_token()
    {
        using var factory = new InvitationResetHardeningTestFactory();
        var client = factory.CreateClient();
        var user = await SeedActiveUserAsync(factory, "hash-check@example.com");

        var resp = await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = user.Email });
        Assert.Equal(HttpStatusCode.NoContent, resp.StatusCode);

        var link = Assert.Single(factory.EmailSender.ResetLinks, l => l.ToEmail == user.Email).Link;
        var rawToken = ExtractToken(link);

        var reloaded = await ReloadUserAsync(factory, user.Id);
        Assert.NotNull(reloaded!.ResetToken);
        Assert.Equal(64, reloaded.ResetToken!.Length); // SHA-256 hex digest length
        Assert.NotEqual(rawToken, reloaded.ResetToken);
    }

    [Fact]
    public async Task Correct_issued_token_successfully_resets_password()
    {
        using var factory = new InvitationResetHardeningTestFactory();
        var client = factory.CreateClient();
        var user = await SeedActiveUserAsync(factory, "correct-token@example.com");

        await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = user.Email });
        var rawToken = ExtractToken(factory.EmailSender.ResetLinks[^1].Link);

        var resetResp = await client.PostAsJsonAsync("/api/auth/reset-password", new { token = rawToken, newPassword = NewPassword });
        Assert.Equal(HttpStatusCode.NoContent, resetResp.StatusCode);

        var loginResp = await client.PostAsJsonAsync("/api/auth/login", new { email = user.Email, password = NewPassword });
        Assert.Equal(HttpStatusCode.OK, loginResp.StatusCode);
    }

    [Fact]
    public async Task Incorrect_token_fails()
    {
        using var factory = new InvitationResetHardeningTestFactory();
        var client = factory.CreateClient();

        var resp = await client.PostAsJsonAsync("/api/auth/reset-password",
            new { token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)), newPassword = NewPassword });

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Expired_token_still_fails()
    {
        using var factory = new InvitationResetHardeningTestFactory();
        var client = factory.CreateClient();
        var user = await SeedActiveUserAsync(factory, "expired-token@example.com");

        await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = user.Email });
        var rawToken = ExtractToken(factory.EmailSender.ResetLinks[^1].Link);
        await ExpireTokenAsync(factory, user.Id);

        var resp = await client.PostAsJsonAsync("/api/auth/reset-password", new { token = rawToken, newPassword = NewPassword });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Consumed_token_cannot_be_replayed()
    {
        using var factory = new InvitationResetHardeningTestFactory();
        var client = factory.CreateClient();
        var user = await SeedActiveUserAsync(factory, "replay-check@example.com");

        await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = user.Email });
        var rawToken = ExtractToken(factory.EmailSender.ResetLinks[^1].Link);

        var first = await client.PostAsJsonAsync("/api/auth/reset-password", new { token = rawToken, newPassword = NewPassword });
        Assert.Equal(HttpStatusCode.NoContent, first.StatusCode);

        var replay = await client.PostAsJsonAsync("/api/auth/reset-password", new { token = rawToken, newPassword = "AnotherPassword789!" });
        Assert.Equal(HttpStatusCode.BadRequest, replay.StatusCode);
    }

    [Fact]
    public async Task Invitation_token_uses_the_same_protected_at_rest_mechanism()
    {
        using var factory = new InvitationResetHardeningTestFactory();
        var client = factory.CreateClient();
        var adminToken = await AdminTokenAsync(client);

        var createResp = await client.SendAsync(AuthedPost("/api/users", adminToken,
            new { fullName = "Invitee", email = "invitee@example.com", role = "Viewer", office = "Test Office" }));
        Assert.Equal(HttpStatusCode.Created, createResp.StatusCode);
        var created = await createResp.Content.ReadFromJsonAsync<JsonElement>();
        var userId = created.GetProperty("id").GetString()!;

        var inviteResp = await client.SendAsync(AuthedPost($"/api/users/{userId}/invite", adminToken));
        Assert.Equal(HttpStatusCode.NoContent, inviteResp.StatusCode);

        var link = Assert.Single(factory.EmailSender.InviteLinks, l => l.ToEmail == "invitee@example.com").Link;
        var rawToken = ExtractToken(link);

        var reloaded = await ReloadUserAsync(factory, userId);
        Assert.NotNull(reloaded!.ResetToken);
        Assert.Equal(64, reloaded.ResetToken!.Length);
        Assert.NotEqual(rawToken, reloaded.ResetToken);

        var resetResp = await client.PostAsJsonAsync("/api/auth/reset-password", new { token = rawToken, newPassword = NewPassword });
        Assert.Equal(HttpStatusCode.NoContent, resetResp.StatusCode);
    }

    [Fact]
    public async Task Token_stored_for_user_a_cannot_reset_user_b()
    {
        using var factory = new InvitationResetHardeningTestFactory();
        var client = factory.CreateClient();
        var userA = await SeedActiveUserAsync(factory, "user-a@example.com");
        var userB = await SeedActiveUserAsync(factory, "user-b@example.com");

        await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = userA.Email });
        var tokenA = ExtractToken(factory.EmailSender.ResetLinks[^1].Link);

        var resetResp = await client.PostAsJsonAsync("/api/auth/reset-password", new { token = tokenA, newPassword = NewPassword });
        Assert.Equal(HttpStatusCode.NoContent, resetResp.StatusCode);

        // User A's new password works; User B is completely untouched.
        var loginA = await client.PostAsJsonAsync("/api/auth/login", new { email = userA.Email, password = NewPassword });
        Assert.Equal(HttpStatusCode.OK, loginA.StatusCode);

        var loginBOld = await client.PostAsJsonAsync("/api/auth/login", new { email = userB.Email, password = OldPassword });
        Assert.Equal(HttpStatusCode.OK, loginBOld.StatusCode);

        var reloadedB = await ReloadUserAsync(factory, userB.Id);
        Assert.Null(reloadedB!.ResetToken);
    }

    [Fact]
    public async Task Production_link_uses_configured_trusted_frontend_url_ignoring_attacker_headers()
    {
        using var factory = new InvitationResetHardeningTestFactory(frontendBaseUrl: "https://www.strata-ngo.com");
        var client = factory.CreateClient();
        var user = await SeedActiveUserAsync(factory, "attacker-headers@example.com");

        using var req = new HttpRequestMessage(HttpMethod.Post, "/api/auth/forgot-password")
        {
            Content = JsonContent.Create(new { email = user.Email }),
        };
        req.Headers.TryAddWithoutValidation("Origin", "https://evil.example.com");
        req.Headers.TryAddWithoutValidation("Referer", "https://evil.example.com/phish");
        req.Headers.Host = "evil.example.com";

        var resp = await client.SendAsync(req);
        Assert.Equal(HttpStatusCode.NoContent, resp.StatusCode);

        var link = factory.EmailSender.ResetLinks[^1].Link;
        Assert.StartsWith("https://www.strata-ngo.com/reset-password?token=", link);
        Assert.DoesNotContain("evil.example.com", link);
    }

    [Fact]
    public async Task Missing_frontend_configuration_fails_safely_and_persists_nothing()
    {
        using var factory = new InvitationResetHardeningTestFactory(frontendBaseUrl: null);
        var client = factory.CreateClient();
        var user = await SeedActiveUserAsync(factory, "missing-config@example.com");

        // TestServer re-throws an unhandled action-method exception to the caller instead of
        // materializing it as an HTTP 500 (a real Kestrel-fronted deployment would return 500
        // to the actual client) — asserting the specific exception is the direct, faithful way
        // to prove the fail-safe path was taken rather than falling back to request headers.
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            client.PostAsJsonAsync("/api/auth/forgot-password", new { email = user.Email }));
        Assert.Contains("Email:FrontendBaseUrl is not configured", ex.Message);

        Assert.Empty(factory.EmailSender.ResetLinks);

        var reloaded = await ReloadUserAsync(factory, user.Id);
        Assert.Null(reloaded!.ResetToken);
        Assert.Null(reloaded.ResetTokenExpiresUtc);
    }

    [Fact]
    public async Task Newly_created_user_cannot_authenticate_with_the_previous_hardcoded_default_password()
    {
        using var factory = new InvitationResetHardeningTestFactory();
        var client = factory.CreateClient();
        var adminToken = await AdminTokenAsync(client);

        var createResp = await client.SendAsync(AuthedPost("/api/users", adminToken,
            new { fullName = "No Default Password", email = "no-default-password@example.com", role = "Viewer", office = "Test Office" }));
        Assert.Equal(HttpStatusCode.Created, createResp.StatusCode);

        var loginResp = await client.PostAsJsonAsync("/api/auth/login",
            new { email = "no-default-password@example.com", password = "Temp123!" });
        Assert.Equal(HttpStatusCode.Unauthorized, loginResp.StatusCode);
    }

    [Fact]
    public async Task Newly_created_account_remains_inactive_until_activation()
    {
        using var factory = new InvitationResetHardeningTestFactory();
        var client = factory.CreateClient();
        var adminToken = await AdminTokenAsync(client);

        var createResp = await client.SendAsync(AuthedPost("/api/users", adminToken,
            new { fullName = "Inactive Until Invite", email = "inactive-until-invite@example.com", role = "Viewer", office = "Test Office" }));
        Assert.Equal(HttpStatusCode.Created, createResp.StatusCode);

        var created = await createResp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(created.GetProperty("isActive").GetBoolean());
        Assert.True(created.GetProperty("isFirstLogin").GetBoolean());
    }

    [Fact]
    public async Task Normal_invitation_activation_still_succeeds()
    {
        using var factory = new InvitationResetHardeningTestFactory();
        var client = factory.CreateClient();
        var adminToken = await AdminTokenAsync(client);

        var createResp = await client.SendAsync(AuthedPost("/api/users", adminToken,
            new { fullName = "End To End", email = "end-to-end@example.com", role = "Viewer", office = "Test Office" }));
        var created = await createResp.Content.ReadFromJsonAsync<JsonElement>();
        var userId = created.GetProperty("id").GetString()!;

        var inviteResp = await client.SendAsync(AuthedPost($"/api/users/{userId}/invite", adminToken));
        Assert.Equal(HttpStatusCode.NoContent, inviteResp.StatusCode);

        var rawToken = ExtractToken(factory.EmailSender.InviteLinks[^1].Link);
        var activateResp = await client.PostAsJsonAsync("/api/auth/reset-password", new { token = rawToken, newPassword = NewPassword });
        Assert.Equal(HttpStatusCode.NoContent, activateResp.StatusCode);

        var reloaded = await ReloadUserAsync(factory, userId);
        Assert.True(reloaded!.IsActive);
        Assert.False(reloaded.IsFirstLogin);

        var loginResp = await client.PostAsJsonAsync("/api/auth/login", new { email = "end-to-end@example.com", password = NewPassword });
        Assert.Equal(HttpStatusCode.OK, loginResp.StatusCode);
    }
}
