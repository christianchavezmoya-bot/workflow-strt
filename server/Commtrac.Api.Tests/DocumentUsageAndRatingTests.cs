using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// Covers the usage counters and per-user ratings that let an admin find tips
/// nobody opens. The aggregate is denormalised onto the document, so re-rating
/// must replace the old value rather than add a second one.
/// </summary>
[Collection(ApiTestCollection.Name)]
public class DocumentUsageAndRatingTests : IClassFixture<ApiTestFactory>
{
    private readonly ApiTestFactory _factory;

    public DocumentUsageAndRatingTests(ApiTestFactory factory) => _factory = factory;

    [Fact]
    public async Task RecordView_increments_count_and_sets_last_viewed()
    {
        var client = await CreateAuthenticatedClientAsync();
        var docId = await SeedTipAsync();

        var first = await client.PostAsync($"/api/documents/{docId}/view", null);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        var second = await client.PostAsync($"/api/documents/{docId}/view", null);
        second.EnsureSuccessStatusCode();

        using var doc = JsonDocument.Parse(await second.Content.ReadAsStringAsync());
        Assert.Equal(2, doc.RootElement.GetProperty("viewCount").GetInt32());
        Assert.NotEqual(JsonValueKind.Null, doc.RootElement.GetProperty("lastViewedAtUtc").ValueKind);
    }

    [Fact]
    public async Task Rating_twice_replaces_the_previous_value()
    {
        var client = await CreateAuthenticatedClientAsync();
        var docId = await SeedTipAsync();

        await client.PutAsJsonAsync($"/api/documents/{docId}/rating", new { stars = 5 });
        var resp = await client.PutAsJsonAsync($"/api/documents/{docId}/rating", new { stars = 2 });

        resp.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        Assert.Equal(1, doc.RootElement.GetProperty("ratingCount").GetInt32());
        Assert.Equal(2, doc.RootElement.GetProperty("ratingAverage").GetDouble());
        Assert.Equal(2, doc.RootElement.GetProperty("myRating").GetInt32());
    }

    [Fact]
    public async Task Rating_outside_one_to_five_is_rejected()
    {
        var client = await CreateAuthenticatedClientAsync();
        var docId = await SeedTipAsync();

        var tooHigh = await client.PutAsJsonAsync($"/api/documents/{docId}/rating", new { stars = 6 });
        var tooLow = await client.PutAsJsonAsync($"/api/documents/{docId}/rating", new { stars = 0 });

        Assert.Equal(HttpStatusCode.BadRequest, tooHigh.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, tooLow.StatusCode);
    }

    [Fact]
    public async Task Clearing_a_rating_resets_the_aggregate()
    {
        var client = await CreateAuthenticatedClientAsync();
        var docId = await SeedTipAsync();

        await client.PutAsJsonAsync($"/api/documents/{docId}/rating", new { stars = 4 });
        var resp = await client.DeleteAsync($"/api/documents/{docId}/rating");

        resp.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        Assert.Equal(0, doc.RootElement.GetProperty("ratingCount").GetInt32());
        Assert.Equal(0, doc.RootElement.GetProperty("ratingAverage").GetDouble());
        Assert.Equal(JsonValueKind.Null, doc.RootElement.GetProperty("myRating").ValueKind);
    }

    [Fact]
    public async Task Document_list_reports_usage_and_the_callers_own_rating()
    {
        var client = await CreateAuthenticatedClientAsync();
        var docId = await SeedTipAsync();

        await client.PostAsync($"/api/documents/{docId}/view", null);
        await client.PutAsJsonAsync($"/api/documents/{docId}/rating", new { stars = 3 });

        var resp = await client.GetAsync("/api/documents");
        resp.EnsureSuccessStatusCode();

        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        var row = doc.RootElement.EnumerateArray().First(e => e.GetProperty("id").GetString() == docId);
        Assert.Equal(1, row.GetProperty("viewCount").GetInt32());
        Assert.Equal(3, row.GetProperty("myRating").GetInt32());
        Assert.Equal(3, row.GetProperty("ratingAverage").GetDouble());
    }

    [Fact]
    public async Task ReplaceFile_keeps_the_document_id_and_its_usage()
    {
        var client = await CreateAuthenticatedClientAsync();
        var docId = await SeedTipAsync();
        await client.PostAsync($"/api/documents/{docId}/view", null);

        using var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(new byte[] { 1, 2, 3, 4 });
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        content.Add(file, "file", "replacement.png");

        var resp = await client.PostAsync($"/api/documents/{docId}/file", content);

        resp.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        Assert.Equal(docId, doc.RootElement.GetProperty("id").GetString());
        Assert.Equal("replacement.png", doc.RootElement.GetProperty("name").GetString());
        Assert.Equal("image/png", doc.RootElement.GetProperty("contentType").GetString());
        Assert.Equal(4, doc.RootElement.GetProperty("fileSize").GetInt64());
        // View history must survive a re-upload, otherwise editing a tip resets its usage.
        Assert.Equal(1, doc.RootElement.GetProperty("viewCount").GetInt32());
    }

    [Fact]
    public async Task ReplaceFile_can_keep_the_existing_name()
    {
        var client = await CreateAuthenticatedClientAsync();
        var docId = await SeedTipAsync();

        using var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(new byte[] { 9 });
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        content.Add(file, "file", "ignored-name.png");
        content.Add(new StringContent("true"), "keepName");

        var resp = await client.PostAsync($"/api/documents/{docId}/file", content);

        resp.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        Assert.Equal("Seeded Tip", doc.RootElement.GetProperty("name").GetString());
    }

    private async Task<HttpClient> CreateAuthenticatedClientAsync()
    {
        var client = _factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "admin.dev@stratango.local",
            password = "Admin123!",
        });
        login.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await login.Content.ReadAsStringAsync());
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", doc.RootElement.GetProperty("token").GetString());
        return client;
    }

    private async Task<string> SeedTipAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var doc = new DocumentEntity
        {
            Name = "Seeded Tip",
            Type = "tips",
            LinkedTo = "General",
            UploadedAt = DateTime.UtcNow.ToString("s"),
            ContentType = "image/jpeg",
            FileSize = 100,
        };
        db.Documents.Add(doc);
        await db.SaveChangesAsync();
        return doc.Id;
    }
}
