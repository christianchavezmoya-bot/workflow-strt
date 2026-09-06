using System;
using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Threading.Tasks;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// P1 security fix: a successful password reset / invite activation must revoke every
/// existing session for that user — otherwise an already-authenticated attacker session
/// (e.g. from a compromised account) survives the very action meant to regain control.
/// See AuthController.ResetPassword. Reuses the exact `Sessions.IsRevoked = true`
/// convention already established by AuthController.RevokeAllSessions — no new mechanism.
///
/// Each test boots its own isolated ApiTestFactory (fresh SQLite DB, fresh in-memory rate
/// limiter state) rather than sharing one via IClassFixture, matching the pattern already
/// used by RateLimitingTests/PublicSignVerifyOtpTests — /api/auth/reset-password is
/// IP-rate-limited (10/15min), and a shared factory across ~10 tests would trip it.
/// </summary>
[Collection(ApiTestCollection.Name)]
public class PasswordResetSessionRevocationTests
{
    /// <summary>Generates a token the exact same way AuthController/UsersController do.</summary>
    private static string GenerateToken() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));

    private static async Task<UserEntity> SeedUserAsync(
        ApiTestFactory factory,
        string? resetToken,
        DateTime? resetTokenExpiresUtc,
        bool isActive = true,
        bool isFirstLogin = false)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var user = new UserEntity
        {
            Id = Guid.NewGuid().ToString("N"),
            Email = $"reset-test-{Guid.NewGuid():N}@example.com",
            FullName = "Reset Test User",
            Role = "Viewer",
            Office = "Test Office",
            IsActive = isActive,
            IsFirstLogin = isFirstLogin,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("OldPassword123!"),
            ResetToken = resetToken,
            ResetTokenExpiresUtc = resetTokenExpiresUtc,
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    private static async Task<SessionEntity> SeedSessionAsync(ApiTestFactory factory, string userId, string userEmail)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var session = new SessionEntity
        {
            Id = Guid.NewGuid().ToString("N"),
            UserId = userId,
            UserEmail = userEmail,
            IsRevoked = false,
        };
        db.Sessions.Add(session);
        await db.SaveChangesAsync();
        return session;
    }

    private static async Task<SessionEntity?> ReloadSessionAsync(ApiTestFactory factory, string sessionId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.Sessions.AsNoTracking().FirstOrDefaultAsync(s => s.Id == sessionId);
    }

    private static async Task<UserEntity?> ReloadUserAsync(ApiTestFactory factory, string userId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId);
    }

    private const string NewValidPassword = "NewPassword456!";

    [Fact]
    public async Task Valid_token_and_valid_password_succeeds()
    {
        using var factory = new ApiTestFactory();
        var token = GenerateToken();
        await SeedUserAsync(factory, token, DateTime.UtcNow.AddHours(24));

        var resp = await factory.CreateClient().PostAsJsonAsync("/api/auth/reset-password",
            new { token, newPassword = NewValidPassword });

        Assert.Equal(HttpStatusCode.NoContent, resp.StatusCode);
    }

    [Fact]
    public async Task Successful_reset_clears_the_reset_token_and_expiry()
    {
        using var factory = new ApiTestFactory();
        var token = GenerateToken();
        var user = await SeedUserAsync(factory, token, DateTime.UtcNow.AddHours(24));

        var resp = await factory.CreateClient().PostAsJsonAsync("/api/auth/reset-password",
            new { token, newPassword = NewValidPassword });
        Assert.Equal(HttpStatusCode.NoContent, resp.StatusCode);

        var reloaded = await ReloadUserAsync(factory, user.Id);
        Assert.Null(reloaded!.ResetToken);
        Assert.Null(reloaded.ResetTokenExpiresUtc);
    }

    [Fact]
    public async Task Successful_reset_revokes_all_existing_sessions_for_that_user()
    {
        using var factory = new ApiTestFactory();
        var token = GenerateToken();
        var user = await SeedUserAsync(factory, token, DateTime.UtcNow.AddHours(24));
        var session = await SeedSessionAsync(factory, user.Id, user.Email);

        var resp = await factory.CreateClient().PostAsJsonAsync("/api/auth/reset-password",
            new { token, newPassword = NewValidPassword });
        Assert.Equal(HttpStatusCode.NoContent, resp.StatusCode);

        var reloadedSession = await ReloadSessionAsync(factory, session.Id);
        Assert.True(reloadedSession!.IsRevoked);
    }

    [Fact]
    public async Task Successful_reset_revokes_multiple_sessions()
    {
        using var factory = new ApiTestFactory();
        var token = GenerateToken();
        var user = await SeedUserAsync(factory, token, DateTime.UtcNow.AddHours(24));
        var session1 = await SeedSessionAsync(factory, user.Id, user.Email);
        var session2 = await SeedSessionAsync(factory, user.Id, user.Email);
        var session3 = await SeedSessionAsync(factory, user.Id, user.Email);

        var resp = await factory.CreateClient().PostAsJsonAsync("/api/auth/reset-password",
            new { token, newPassword = NewValidPassword });
        Assert.Equal(HttpStatusCode.NoContent, resp.StatusCode);

        Assert.True((await ReloadSessionAsync(factory, session1.Id))!.IsRevoked);
        Assert.True((await ReloadSessionAsync(factory, session2.Id))!.IsRevoked);
        Assert.True((await ReloadSessionAsync(factory, session3.Id))!.IsRevoked);
    }

    [Fact]
    public async Task Successful_reset_does_not_revoke_sessions_belonging_to_another_user()
    {
        using var factory = new ApiTestFactory();
        var token = GenerateToken();
        var user = await SeedUserAsync(factory, token, DateTime.UtcNow.AddHours(24));
        var otherUser = await SeedUserAsync(factory, resetToken: null, resetTokenExpiresUtc: null);
        var ownSession = await SeedSessionAsync(factory, user.Id, user.Email);
        var otherUsersSession = await SeedSessionAsync(factory, otherUser.Id, otherUser.Email);

        var resp = await factory.CreateClient().PostAsJsonAsync("/api/auth/reset-password",
            new { token, newPassword = NewValidPassword });
        Assert.Equal(HttpStatusCode.NoContent, resp.StatusCode);

        Assert.True((await ReloadSessionAsync(factory, ownSession.Id))!.IsRevoked);
        Assert.False((await ReloadSessionAsync(factory, otherUsersSession.Id))!.IsRevoked,
            "a reset for one user must never revoke another user's sessions");
    }

    [Fact]
    public async Task Replaying_the_same_reset_token_fails()
    {
        using var factory = new ApiTestFactory();
        var token = GenerateToken();
        await SeedUserAsync(factory, token, DateTime.UtcNow.AddHours(24));
        var client = factory.CreateClient();

        var first = await client.PostAsJsonAsync("/api/auth/reset-password",
            new { token, newPassword = NewValidPassword });
        Assert.Equal(HttpStatusCode.NoContent, first.StatusCode);

        var replay = await client.PostAsJsonAsync("/api/auth/reset-password",
            new { token, newPassword = "AnotherPassword789!" });
        Assert.Equal(HttpStatusCode.BadRequest, replay.StatusCode);
    }

    [Fact]
    public async Task Expired_token_fails()
    {
        using var factory = new ApiTestFactory();
        var token = GenerateToken();
        await SeedUserAsync(factory, token, DateTime.UtcNow.AddHours(-1)); // already expired

        var resp = await factory.CreateClient().PostAsJsonAsync("/api/auth/reset-password",
            new { token, newPassword = NewValidPassword });

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Malformed_or_nonexistent_token_fails()
    {
        using var factory = new ApiTestFactory();
        // No user seeded with this token at all.
        var resp = await factory.CreateClient().PostAsJsonAsync("/api/auth/reset-password",
            new { token = "not-a-real-token-at-all", newPassword = NewValidPassword });

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Failed_reset_does_not_revoke_existing_sessions()
    {
        using var factory = new ApiTestFactory();
        var token = GenerateToken();
        var user = await SeedUserAsync(factory, token, DateTime.UtcNow.AddHours(-1)); // expired
        var session = await SeedSessionAsync(factory, user.Id, user.Email);

        var resp = await factory.CreateClient().PostAsJsonAsync("/api/auth/reset-password",
            new { token, newPassword = NewValidPassword });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);

        var reloadedSession = await ReloadSessionAsync(factory, session.Id);
        Assert.False(reloadedSession!.IsRevoked, "a rejected reset must never touch existing sessions");
    }

    [Fact]
    public async Task Weak_password_is_rejected_and_does_not_revoke_existing_sessions()
    {
        using var factory = new ApiTestFactory();
        var token = GenerateToken();
        var user = await SeedUserAsync(factory, token, DateTime.UtcNow.AddHours(24));
        var session = await SeedSessionAsync(factory, user.Id, user.Email);

        var resp = await factory.CreateClient().PostAsJsonAsync("/api/auth/reset-password",
            new { token, newPassword = "weak" });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);

        var reloaded = await ReloadUserAsync(factory, user.Id);
        Assert.NotNull(reloaded!.ResetToken); // token must still be usable — this attempt never succeeded
        Assert.False((await ReloadSessionAsync(factory, session.Id))!.IsRevoked);
    }

    [Fact]
    public async Task Invite_activation_shares_the_same_reset_endpoint_and_also_revokes_sessions()
    {
        // Mirrors exactly what UsersController.Invite() sets on a brand-new, not-yet-activated
        // account: a reset token, IsFirstLogin=true, IsActive=false. Proves invite activation
        // and forgot-password completion are the same code path (no duplicate implementation),
        // and that the same session-revocation behavior applies to it.
        using var factory = new ApiTestFactory();
        var token = GenerateToken();
        var user = await SeedUserAsync(factory, token, DateTime.UtcNow.AddHours(24), isActive: false, isFirstLogin: true);
        var session = await SeedSessionAsync(factory, user.Id, user.Email);

        var resp = await factory.CreateClient().PostAsJsonAsync("/api/auth/reset-password",
            new { token, newPassword = NewValidPassword });
        Assert.Equal(HttpStatusCode.NoContent, resp.StatusCode);

        var reloaded = await ReloadUserAsync(factory, user.Id);
        Assert.True(reloaded!.IsActive);
        Assert.False(reloaded.IsFirstLogin);
        Assert.Null(reloaded.ResetToken);
        Assert.True((await ReloadSessionAsync(factory, session.Id))!.IsRevoked);
    }
}
