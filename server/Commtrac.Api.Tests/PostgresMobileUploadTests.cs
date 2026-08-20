using System;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// Optional Postgres tests — run only when COMMTRAC_POSTGRES_TEST=1.
///
/// "Upload from Phone" broke on Postgres only: expiring stale tokens compared the
/// ExpiresAtUtc column against DateTime.UtcNow inline, which Npgsql translates to the
/// server-side now(), and dates are stored as text on Postgres — so the request died
/// with 42883 "operator does not exist: text &lt; timestamp with time zone". The browser
/// showed it as a bare network error because the 500 carried no CORS headers, which is
/// why nothing pointed at the database. SQLite compares the same query happily, so only
/// a Postgres-backed test can hold this.
/// </summary>
[Collection(PostgresTestCollection.Name)]
public class PostgresMobileUploadTests
{
    [Fact]
    public async Task Creating_an_upload_token_succeeds_on_postgres()
    {
        if (!PostgresApiTestFactory.Enabled) return;

        using var factory = new PostgresApiTestFactory();
        var client = await CreateAuthenticatedClientAsync(factory);

        var resp = await client.PostAsJsonAsync("/api/mobile-upload/token", new
        {
            type = "tips",
            linkedTo = "AIM-100",
            customValuesJson = "{\"division\":\"Wireless\"}",
        });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        Assert.False(string.IsNullOrWhiteSpace(doc.RootElement.GetProperty("token").GetString()));
    }

    [Fact]
    public async Task Creating_a_token_expires_only_the_tokens_that_are_past_their_expiry()
    {
        if (!PostgresApiTestFactory.Enabled) return;

        using var factory = new PostgresApiTestFactory();
        var client = await CreateAuthenticatedClientAsync(factory);

        var stale = await SeedTokenAsync(factory, DateTime.UtcNow.AddMinutes(-5));
        var live = await SeedTokenAsync(factory, DateTime.UtcNow.AddMinutes(30));

        var resp = await client.PostAsJsonAsync("/api/mobile-upload/token", new { type = "tips", linkedTo = "AIM-100" });
        resp.EnsureSuccessStatusCode();

        // Dates compare as ISO-8601 text on Postgres, so an ordering bug would either
        // expire everything or nothing rather than throwing.
        Assert.Equal("expired", await ReadStatusAsync(factory, stale));
        Assert.Equal("pending", await ReadStatusAsync(factory, live));
    }

    [Fact]
    public async Task A_phone_can_upload_against_a_token_and_the_web_app_sees_it_complete()
    {
        if (!PostgresApiTestFactory.Enabled) return;

        using var factory = new PostgresApiTestFactory();
        var client = await CreateAuthenticatedClientAsync(factory);

        var created = await client.PostAsJsonAsync("/api/mobile-upload/token", new
        {
            type = "tips",
            linkedTo = "AIM-100",
            customValuesJson = "{\"division\":\"Wireless\"}",
        });
        created.EnsureSuccessStatusCode();
        using var createdDoc = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        var token = createdDoc.RootElement.GetProperty("token").GetString()!;

        // The phone scans the QR code and posts without a session of its own.
        var phone = factory.CreateClient();
        var info = await phone.GetAsync($"/api/mobile-upload/{token}/info");
        Assert.Equal(HttpStatusCode.OK, info.StatusCode);

        using var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(new byte[] { 1, 2, 3 });
        file.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        content.Add(file, "file", "from-phone.jpg");
        var upload = await phone.PostAsync($"/api/mobile-upload/{token}/upload", content);
        Assert.Equal(HttpStatusCode.OK, upload.StatusCode);

        var status = await client.GetAsync($"/api/mobile-upload/token/{token}");
        status.EnsureSuccessStatusCode();
        using var statusDoc = JsonDocument.Parse(await status.Content.ReadAsStringAsync());
        Assert.Equal("complete", statusDoc.RootElement.GetProperty("status").GetString());
        Assert.False(string.IsNullOrWhiteSpace(statusDoc.RootElement.GetProperty("documentId").GetString()));
    }

    private static async Task<HttpClient> CreateAuthenticatedClientAsync(PostgresApiTestFactory factory)
    {
        var client = factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "admin@commtrac.local",
            password = "Admin123!",
        });
        login.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await login.Content.ReadAsStringAsync());
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", doc.RootElement.GetProperty("token").GetString());
        return client;
    }

    private static async Task<string> SeedTokenAsync(PostgresApiTestFactory factory, DateTime expiresAtUtc)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var entry = new MobileUploadTokenEntity
        {
            Token = Guid.NewGuid().ToString("N")[..16],
            Type = "tips",
            LinkedTo = "AIM-100",
            Status = "pending",
            CreatedAtUtc = DateTime.UtcNow.AddMinutes(-10),
            ExpiresAtUtc = expiresAtUtc,
        };
        db.MobileUploadTokens.Add(entry);
        await db.SaveChangesAsync();
        return entry.Token;
    }

    private static async Task<string?> ReadStatusAsync(PostgresApiTestFactory factory, string token)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var entry = await db.MobileUploadTokens.AsNoTracking().FirstOrDefaultAsync(t => t.Token == token);
        return entry?.Status;
    }
}
