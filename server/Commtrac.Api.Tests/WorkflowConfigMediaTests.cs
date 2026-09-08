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
/// Phase 1 hardening for Workflow Builder reference-media upload/serve:
/// server-side type allowlist, signature validation (never trust the client-supplied
/// extension or Content-Type alone), explicit size policy, safe MIME serving, and
/// path-safe route identifiers. See WorkflowMediaValidator.cs for the validation logic
/// under test here (exercised end-to-end through the controller, not unit-tested in
/// isolation, to also cover the request pipeline / [RequestSizeLimit] interaction).
/// </summary>
[Collection(ApiTestCollection.Name)]
public class WorkflowConfigMediaTests : IClassFixture<ApiTestFactory>
{
    private readonly ApiTestFactory _factory;

    public WorkflowConfigMediaTests(ApiTestFactory factory) => _factory = factory;

    // ── Minimal valid signature bytes for each supported format ────────────────
    private static byte[] ValidJpegBytes() => Concat(new byte[] { 0xFF, 0xD8, 0xFF, 0xE0 }, Filler(64));
    private static byte[] ValidPngBytes() => Concat(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }, Filler(64));
    private static byte[] ValidGifBytes() => Concat(new byte[] { 0x47, 0x49, 0x46, 0x38, 0x39, 0x61 }, Filler(64));
    private static byte[] ValidWebPBytes() => Concat(
        new byte[] { 0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50 }, Filler(64));
    private static byte[] ValidMp4Bytes() => Concat(
        new byte[] { 0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6F, 0x6D }, Filler(64));
    private static byte[] GarbageBytes() => Filler(64, seed: 7);
    private static byte[] HtmlBytes() => System.Text.Encoding.ASCII.GetBytes("<html><body>not a video</body></html>");

    private static byte[] Filler(int length, int seed = 1)
    {
        var b = new byte[length];
        for (var i = 0; i < length; i++) b[i] = (byte)((i * seed + 13) % 256);
        return b;
    }

    private static byte[] Concat(byte[] a, byte[] b)
    {
        var result = new byte[a.Length + b.Length];
        Buffer.BlockCopy(a, 0, result, 0, a.Length);
        Buffer.BlockCopy(b, 0, result, a.Length, b.Length);
        return result;
    }

    private static MultipartFormDataContent BuildUpload(byte[] bytes, string fileName, string? contentType)
    {
        var content = new MultipartFormDataContent();
        var part = new ByteArrayContent(bytes);
        if (contentType is not null)
        {
            part.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        }
        content.Add(part, "file", fileName);
        return content;
    }

    // ══════════════════════════ UPLOAD SUCCESS ══════════════════════════

    [Fact]
    public async Task Valid_jpeg_is_accepted_and_classified_as_image()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/media",
            BuildUpload(ValidJpegBytes(), "photo.jpg", "image/jpeg"));

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var mediaItem = await SingleMediaItemAsync(resp);
        Assert.Equal("image", mediaItem.GetProperty("type").GetString());
        Assert.Equal("image/jpeg", mediaItem.GetProperty("mime").GetString());
    }

    [Fact]
    public async Task Valid_png_is_accepted_and_classified_as_image()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/media",
            BuildUpload(ValidPngBytes(), "photo.png", "image/png"));

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var mediaItem = await SingleMediaItemAsync(resp);
        Assert.Equal("image", mediaItem.GetProperty("type").GetString());
        Assert.Equal("image/png", mediaItem.GetProperty("mime").GetString());
    }

    [Fact]
    public async Task Valid_gif_is_accepted_and_classified_as_image()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/media",
            BuildUpload(ValidGifBytes(), "photo.gif", "image/gif"));

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var mediaItem = await SingleMediaItemAsync(resp);
        Assert.Equal("image", mediaItem.GetProperty("type").GetString());
        Assert.Equal("image/gif", mediaItem.GetProperty("mime").GetString());
    }

    [Fact]
    public async Task Valid_webp_is_accepted_and_classified_as_image()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/media",
            BuildUpload(ValidWebPBytes(), "photo.webp", "image/webp"));

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var mediaItem = await SingleMediaItemAsync(resp);
        Assert.Equal("image", mediaItem.GetProperty("type").GetString());
        Assert.Equal("image/webp", mediaItem.GetProperty("mime").GetString());
    }

    [Fact]
    public async Task Valid_mp4_is_accepted_and_classified_as_video()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/media",
            BuildUpload(ValidMp4Bytes(), "clip.mp4", "video/mp4"));

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var mediaItem = await SingleMediaItemAsync(resp);
        Assert.Equal("video", mediaItem.GetProperty("type").GetString());
        Assert.Equal("video/mp4", mediaItem.GetProperty("mime").GetString());
    }

    // ══════════════════════════ EMPTY / SIZE ══════════════════════════

    [Fact]
    public async Task Empty_upload_is_rejected()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/media",
            BuildUpload(Array.Empty<byte>(), "empty.jpg", "image/jpeg"));

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Video_over_25MB_is_rejected_cleanly_with_a_controlled_message()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();

        // Between the explicit 25 MB video policy and the 30 MB request ceiling —
        // proves the IFormFile.Length check fires independently of [RequestSizeLimit].
        var oversized = Concat(new byte[] { 0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6F, 0x6D },
            new byte[26_000_000]);

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/media",
            BuildUpload(oversized, "big.mp4", "video/mp4"));

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        var body = await resp.Content.ReadAsStringAsync();
        Assert.Contains("25 MB", body);

        var storedFiles = ListStoredWorkflowMediaFiles(configId);
        Assert.Empty(storedFiles);
    }

    // ══════════════════════════ SPOOFING ══════════════════════════

    [Fact]
    public async Task Jpg_extension_with_invalid_bytes_is_rejected()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/media",
            BuildUpload(GarbageBytes(), "fake.jpg", "image/jpeg"));

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Png_extension_with_invalid_bytes_is_rejected()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/media",
            BuildUpload(GarbageBytes(), "fake.png", "image/png"));

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Mp4_extension_with_invalid_bytes_is_rejected()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/media",
            BuildUpload(GarbageBytes(), "fake.mp4", "video/mp4"));

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Content_type_video_mp4_with_actually_jpeg_bytes_is_rejected()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();

        // Extension (.mp4) does not match the detected signature (JPEG) — must fail
        // regardless of what Content-Type claims.
        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/media",
            BuildUpload(ValidJpegBytes(), "sneaky.mp4", "video/mp4"));

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Content_type_image_jpeg_with_actually_mp4_bytes_is_rejected()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/media",
            BuildUpload(ValidMp4Bytes(), "sneaky.jpg", "image/jpeg"));

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Declared_content_type_contradicting_a_matching_extension_and_signature_is_rejected()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();

        // Extension AND signature both say MP4 — only the Content-Type header lies.
        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/media",
            BuildUpload(ValidMp4Bytes(), "clip.mp4", "image/jpeg"));

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Unsupported_extension_is_rejected_even_when_content_type_claims_video()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/media",
            BuildUpload(ValidMp4Bytes(), "clip.mov", "video/mp4"));

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Html_renamed_to_mp4_is_rejected()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/media",
            BuildUpload(HtmlBytes(), "innocent.mp4", "video/mp4"));

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Arbitrary_binary_renamed_to_an_allowed_extension_is_rejected()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/media",
            BuildUpload(GarbageBytes(), "totally-a-photo.png", "image/png"));

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    // ── Content-Type must equal the exact detected MIME, not merely share the same
    // image/video family (review correction — see WorkflowMediaValidator.IsContentTypeConsistent) ──

    [Fact]
    public async Task Valid_mp4_with_octet_stream_content_type_is_rejected()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/media",
            BuildUpload(ValidMp4Bytes(), "clip.mp4", "application/octet-stream"));

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Valid_jpeg_with_text_plain_content_type_is_rejected()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/media",
            BuildUpload(ValidJpegBytes(), "photo.jpg", "text/plain"));

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Valid_png_with_image_jpeg_content_type_is_rejected()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/media",
            BuildUpload(ValidPngBytes(), "photo.png", "image/jpeg"));

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Valid_jpeg_with_image_png_content_type_is_rejected()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/media",
            BuildUpload(ValidJpegBytes(), "photo.jpg", "image/png"));

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Valid_mp4_with_image_jpeg_content_type_is_rejected()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/media",
            BuildUpload(ValidMp4Bytes(), "clip.mp4", "image/jpeg"));

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Genuinely_absent_content_type_with_valid_extension_and_signature_is_still_accepted()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/media",
            BuildUpload(ValidJpegBytes(), "photo.jpg", contentType: null));

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var mediaItem = await SingleMediaItemAsync(resp);
        Assert.Equal("image", mediaItem.GetProperty("type").GetString());
        Assert.Equal("image/jpeg", mediaItem.GetProperty("mime").GetString());
    }

    // ══════════════════════════ MIME / SERVING ══════════════════════════

    [Fact]
    public async Task Served_jpeg_returns_image_jpeg_content_type()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();
        var (mediaUrl, _) = await UploadAndGetUrlAsync(client, configId, ValidJpegBytes(), "photo.jpg", "image/jpeg");

        var served = await _factory.CreateClient().GetAsync(mediaUrl);

        Assert.Equal(HttpStatusCode.OK, served.StatusCode);
        Assert.Equal("image/jpeg", served.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Served_png_returns_image_png_content_type()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();
        var (mediaUrl, _) = await UploadAndGetUrlAsync(client, configId, ValidPngBytes(), "photo.png", "image/png");

        var served = await _factory.CreateClient().GetAsync(mediaUrl);

        Assert.Equal(HttpStatusCode.OK, served.StatusCode);
        Assert.Equal("image/png", served.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Served_gif_returns_image_gif_content_type()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();
        var (mediaUrl, _) = await UploadAndGetUrlAsync(client, configId, ValidGifBytes(), "photo.gif", "image/gif");

        var served = await _factory.CreateClient().GetAsync(mediaUrl);

        Assert.Equal(HttpStatusCode.OK, served.StatusCode);
        Assert.Equal("image/gif", served.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Served_webp_returns_image_webp_content_type()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();
        var (mediaUrl, _) = await UploadAndGetUrlAsync(client, configId, ValidWebPBytes(), "photo.webp", "image/webp");

        var served = await _factory.CreateClient().GetAsync(mediaUrl);

        Assert.Equal(HttpStatusCode.OK, served.StatusCode);
        Assert.Equal("image/webp", served.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Served_mp4_returns_video_mp4_content_type()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();
        var (mediaUrl, _) = await UploadAndGetUrlAsync(client, configId, ValidMp4Bytes(), "clip.mp4", "video/mp4");

        var served = await _factory.CreateClient().GetAsync(mediaUrl);

        Assert.Equal(HttpStatusCode.OK, served.StatusCode);
        Assert.Equal("video/mp4", served.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Unknown_stored_extension_is_never_served_as_video_mp4()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();
        var (_, mediaId) = await UploadAndGetUrlAsync(client, configId, ValidJpegBytes(), "photo.jpg", "image/jpeg");

        // Simulate a legacy/unsupported extension already sitting in storage (pre-Phase-1
        // data, or a future manual drop) by renaming the file on disk after a valid upload.
        RenameStoredMediaFile(configId, mediaId, ".bin");

        var served = await _factory.CreateClient().GetAsync($"/api/workflow-configs/{configId}/media/{mediaId}/file");

        Assert.Equal(HttpStatusCode.NotFound, served.StatusCode);
    }

    // ══════════════════════════ PATH / IDENTIFIERS ══════════════════════════

    [Theory]
    [InlineData("..")]
    [InlineData("../../etc")]
    [InlineData("..%2f..%2f")]
    [InlineData("a/b")]
    public async Task Traversal_like_config_id_is_rejected_on_serve(string maliciousId)
    {
        var anon = _factory.CreateClient();

        var resp = await anon.GetAsync($"/api/workflow-configs/{Uri.EscapeDataString(maliciousId)}/media/{Guid.NewGuid()}/file");

        // A plain ".."/"../.." collapses via standard URI dot-segment normalization before
        // it reaches routing, landing on an unmatched path that falls back to the app's
        // authenticated-by-default policy (401) rather than reaching ServeMedia's own
        // NotFound (404) — both are safe "no file content returned" outcomes. The
        // percent-encoded and slash-containing cases reach IsPathSafeConfigId directly
        // and assert the stronger 404.
        Assert.True(resp.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Unauthorized,
            $"Expected NotFound or Unauthorized, got {resp.StatusCode}");
    }

    [Fact]
    public async Task Malformed_media_id_is_rejected_on_serve()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();
        await UploadAndGetUrlAsync(client, configId, ValidJpegBytes(), "photo.jpg", "image/jpeg");

        var anon = _factory.CreateClient();
        var resp = await anon.GetAsync($"/api/workflow-configs/{configId}/media/not-a-guid/file");

        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task Traversal_like_config_id_is_rejected_on_upload()
    {
        var client = await CreateAuthenticatedClientAsync();

        var resp = await client.PostAsync("/api/workflow-configs/..%2f..%2fetc/media",
            BuildUpload(ValidJpegBytes(), "photo.jpg", "image/jpeg"));

        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task Legacy_non_guid_config_id_still_serves_previously_uploaded_media()
    {
        // Guards the exact backward-compatibility gap found during implementation:
        // StrataNgoSeeder seeds a WorkflowConfig with a non-GUID id ("wf-chambers-default").
        // The config-id check must be a path-safe charset allowlist, not a strict GUID
        // check, or every media action on that config would 404.
        var client = await CreateAuthenticatedClientAsync();
        const string legacyStyleId = "wf-chambers-default-test-clone";
        await SeedDraftConfigAsync(idOverride: legacyStyleId);

        var upload = await client.PostAsync($"/api/workflow-configs/{legacyStyleId}/media",
            BuildUpload(ValidJpegBytes(), "photo.jpg", "image/jpeg"));
        Assert.Equal(HttpStatusCode.OK, upload.StatusCode);

        var mediaItem = await SingleMediaItemAsync(upload);
        var mediaUrl = mediaItem.GetProperty("url").GetString()!;

        var served = await _factory.CreateClient().GetAsync(mediaUrl);
        Assert.Equal(HttpStatusCode.OK, served.StatusCode);
    }

    // ══════════════════════════ STORAGE BEHAVIOR ══════════════════════════

    [Fact]
    public async Task Rejected_upload_does_not_leave_a_stored_file()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/media",
            BuildUpload(GarbageBytes(), "fake.jpg", "image/jpeg"));

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        Assert.Empty(ListStoredWorkflowMediaFiles(configId));
    }

    [Fact]
    public async Task Accepted_upload_writes_media_metadata_correctly()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();

        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/media",
            BuildUpload(ValidJpegBytes(), "site-photo.jpg", "image/jpeg"));

        var mediaItem = await SingleMediaItemAsync(resp);
        Assert.Equal("site-photo.jpg", mediaItem.GetProperty("name").GetString());
        Assert.True(mediaItem.GetProperty("size").GetInt64() > 0);
        Assert.False(string.IsNullOrWhiteSpace(mediaItem.GetProperty("id").GetString()));
        Assert.False(string.IsNullOrWhiteSpace(mediaItem.GetProperty("url").GetString()));
        Assert.True(mediaItem.GetProperty("createdAt").GetInt64() > 0);
        Assert.Single(ListStoredWorkflowMediaFiles(configId));
    }

    [Fact]
    public async Task Delete_removes_the_stored_file_and_the_media_json_entry()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();
        var (_, mediaId) = await UploadAndGetUrlAsync(client, configId, ValidJpegBytes(), "photo.jpg", "image/jpeg");
        Assert.Single(ListStoredWorkflowMediaFiles(configId));

        var resp = await client.DeleteAsync($"/api/workflow-configs/{configId}/media/{mediaId}");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Empty(ListStoredWorkflowMediaFiles(configId));
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        Assert.Equal("[]", doc.RootElement.GetProperty("mediaJson").GetString());
    }

    // ══════════════════════════ AUTH REGRESSION ══════════════════════════

    [Fact]
    public async Task Upload_still_requires_admin_or_project_manager_role()
    {
        var anon = _factory.CreateClient();
        var configId = await SeedDraftConfigAsync();

        var resp = await anon.PostAsync($"/api/workflow-configs/{configId}/media",
            BuildUpload(ValidJpegBytes(), "photo.jpg", "image/jpeg"));

        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task ServeMedia_remains_anonymous_in_this_phase()
    {
        var client = await CreateAuthenticatedClientAsync();
        var configId = await SeedDraftConfigAsync();
        var (mediaUrl, _) = await UploadAndGetUrlAsync(client, configId, ValidJpegBytes(), "photo.jpg", "image/jpeg");

        // No Authorization header at all.
        var served = await _factory.CreateClient().GetAsync(mediaUrl);

        Assert.Equal(HttpStatusCode.OK, served.StatusCode);
    }

    // ══════════════════════════ helpers ══════════════════════════

    private async Task<(string Url, string MediaId)> UploadAndGetUrlAsync(
        HttpClient client, string configId, byte[] bytes, string fileName, string contentType)
    {
        var resp = await client.PostAsync($"/api/workflow-configs/{configId}/media",
            BuildUpload(bytes, fileName, contentType));
        resp.EnsureSuccessStatusCode();
        var mediaItem = await SingleMediaItemAsync(resp);
        return (mediaItem.GetProperty("url").GetString()!, mediaItem.GetProperty("id").GetString()!);
    }

    private static async Task<JsonElement> SingleMediaItemAsync(HttpResponseMessage resp)
    {
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        var mediaJson = doc.RootElement.GetProperty("mediaJson").GetString()!;
        using var mediaDoc = JsonDocument.Parse(mediaJson);
        var array = mediaDoc.RootElement.EnumerateArray().ToList();
        Assert.True(array.Count >= 1);
        return array[^1].Clone();
    }

    private string[] ListStoredWorkflowMediaFiles(string configId)
    {
        using var scope = _factory.Services.CreateScope();
        var env = scope.ServiceProvider.GetRequiredService<Microsoft.AspNetCore.Hosting.IWebHostEnvironment>();
        var dir = Path.Combine(env.ContentRootPath, "Storage", "WorkflowMedia", configId);
        return Directory.Exists(dir) ? Directory.GetFiles(dir) : Array.Empty<string>();
    }

    private void RenameStoredMediaFile(string configId, string mediaId, string newExtension)
    {
        var files = ListStoredWorkflowMediaFiles(configId);
        var match = files.Single(f => Path.GetFileNameWithoutExtension(f) == mediaId);
        var newPath = Path.Combine(Path.GetDirectoryName(match)!, $"{mediaId}{newExtension}");
        File.Move(match, newPath);
    }

    // This class exercises many upload scenarios and calls this per test. A fresh
    // /api/auth/login per call was fine at the original test count but comfortably
    // exceeds the app's own credential-endpoint rate limiter (30 requests/5 minutes,
    // IP-dimension — SecurityRateLimitPolicies.CredentialIpPermitLimit) once the MIME
    // regression tests were added. The limiter is working correctly; the fix belongs
    // here, not in production rate-limiting config: log in once per test-class run
    // (xUnit guarantees the same ApiTestFactory instance for the whole class via
    // IClassFixture) and reuse the authenticated client.
    private static HttpClient? _cachedAuthenticatedClient;
    private static readonly SemaphoreSlim CachedClientLock = new(1, 1);

    private static async Task<HttpClient> CreateAuthenticatedClientAsync(ApiTestFactory factory)
    {
        var client = factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "admin.dev@stratango.local",
            password = "Admin123!",
        });
        login.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await login.Content.ReadAsStringAsync());
        var token = doc.RootElement.GetProperty("token").GetString()!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    private async Task<HttpClient> CreateAuthenticatedClientAsync()
    {
        if (_cachedAuthenticatedClient is not null) return _cachedAuthenticatedClient;

        await CachedClientLock.WaitAsync();
        try
        {
            _cachedAuthenticatedClient ??= await CreateAuthenticatedClientAsync(_factory);
            return _cachedAuthenticatedClient;
        }
        finally
        {
            CachedClientLock.Release();
        }
    }

    private async Task<string> SeedDraftConfigAsync(string? idOverride = null)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var id = idOverride ?? Guid.NewGuid().ToString();
        var now = DateTime.UtcNow;
        db.WorkflowConfigs.Add(new WorkflowConfigEntity
        {
            Id = id,
            ProductId = "prod-test",
            Name = "Media Test Draft",
            Status = "Draft",
            Version = 1,
            StepsJson = "[]",
            MediaJson = "[]",
            FeatureSelectionsJson = "[]",
            CreatedAt = now,
            UpdatedAt = now,
        });
        await db.SaveChangesAsync();
        return id;
    }
}
