using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// Tips upload uses the frontend <c>tips.create</c> flag, not <c>documents.upload</c>.
/// Installers can author tips without library document upload rights.
/// </summary>
[Collection(ApiTestCollection.Name)]
public class DocumentTipsPermissionTests : IClassFixture<ApiTestFactory>
{
    private readonly ApiTestFactory _factory;

    public DocumentTipsPermissionTests(ApiTestFactory factory) => _factory = factory;

    [Fact]
    public async Task Installer_with_tips_create_can_upload_tip_video_without_documents_upload()
    {
        var client = await CreateInstallerClientAsync();

        using var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(new byte[] { 1, 2, 3, 4, 5 });
        file.Headers.ContentType = new MediaTypeHeaderValue("video/mp4");
        content.Add(file, "file", "panel-install.mp4");
        content.Add(new StringContent("tips"), "type");
        content.Add(new StringContent("HA-Coal"), "linkedTo");

        var resp = await client.PostAsync("/api/documents/upload", content);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        Assert.Equal("tips", doc.RootElement.GetProperty("type").GetString());
        Assert.Equal("video/mp4", doc.RootElement.GetProperty("contentType").GetString());
    }

    [Fact]
    public async Task Installer_still_cannot_upload_library_document_without_documents_upload()
    {
        var client = await CreateInstallerClientAsync();

        using var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(new byte[] { 1, 2, 3 });
        file.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        content.Add(file, "file", "manual.pdf");
        content.Add(new StringContent("library"), "type");
        content.Add(new StringContent("General"), "linkedTo");

        var resp = await client.PostAsync("/api/documents/upload", content);

        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
    }

    private async Task<HttpClient> CreateInstallerClientAsync()
    {
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            if (!await db.Users.AnyAsync(u => u.Email == "installer.dev@stratango.local"))
            {
                db.Users.Add(new UserEntity
                {
                    Id = Guid.NewGuid().ToString(),
                    Email = "installer.dev@stratango.local",
                    FullName = "Test Installer",
                    Role = "Installer",
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword("Admin123!"),
                    IsActive = true,
                });
                await db.SaveChangesAsync();
            }
        }

        var client = _factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "installer.dev@stratango.local",
            password = "Admin123!",
        });
        login.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await login.Content.ReadAsStringAsync());
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", doc.RootElement.GetProperty("token").GetString());
        return client;
    }
}
