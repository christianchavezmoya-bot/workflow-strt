using System.Net;
using System.Net.Http.Headers;
using Commtrac.Api.Services.Storage;
using Xunit;

namespace Commtrac.Api.Tests.Storage;

/// <summary>
/// End-to-end proof (real HTTP request through the real WorkflowConfigsController.ServeMedia
/// action) that S3-backed reference media now genuinely supports HTTP byte ranges — the
/// exact HTTP contract WKWebView's &lt;video&gt; needs. This is the S3-shaped counterpart to
/// WorkflowConfigMediaTests' MIME/serving tests, which only ever exercise Local storage.
/// </summary>
[Collection(ApiTestCollection.Name)]
public class S3ServeMediaHttpTests : IClassFixture<S3ApiTestFactory>
{
    private readonly S3ApiTestFactory _factory;

    public S3ServeMediaHttpTests(S3ApiTestFactory factory) => _factory = factory;

    private static byte[] TestBytes(int length)
    {
        var bytes = new byte[length];
        for (var i = 0; i < length; i++) bytes[i] = (byte)(i % 256);
        return bytes;
    }

    private string SeedVideo(int length = 2_000_000)
    {
        var configId = Guid.NewGuid().ToString();
        var mediaId = Guid.NewGuid().ToString();
        var key = $"{S3ApiTestFactory.KeyPrefix}/Storage/WorkflowMedia/{configId}/{mediaId}.mp4";
        _factory.S3.Put(key, TestBytes(length));
        return $"/api/workflow-configs/{configId}/media/{mediaId}/file";
    }

    [Fact]
    public async Task Normal_GET_against_S3_backed_video_returns_200_with_Accept_Ranges_and_Content_Length()
    {
        var url = SeedVideo(2_000_000);
        var client = _factory.CreateClient();

        var resp = await client.GetAsync(url);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal("video/mp4", resp.Content.Headers.ContentType?.MediaType);
        Assert.Equal(2_000_000, resp.Content.Headers.ContentLength);
        Assert.Contains("bytes", resp.Headers.AcceptRanges);
    }

    [Fact]
    public async Task Range_bytes_0_1023_against_S3_backed_video_returns_206_with_correct_headers()
    {
        var url = SeedVideo(2_000_000);
        var client = _factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Range = new RangeHeaderValue(0, 1023);

        var resp = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.PartialContent, resp.StatusCode);
        Assert.Equal("video/mp4", resp.Content.Headers.ContentType?.MediaType);
        Assert.Equal(1024, resp.Content.Headers.ContentLength);
        Assert.NotNull(resp.Content.Headers.ContentRange);
        Assert.Equal(0, resp.Content.Headers.ContentRange!.From);
        Assert.Equal(1023, resp.Content.Headers.ContentRange.To);
        Assert.Equal(2_000_000, resp.Content.Headers.ContentRange.Length);
        Assert.Contains("bytes", resp.Headers.AcceptRanges);

        var body = await resp.Content.ReadAsByteArrayAsync();
        Assert.Equal(1024, body.Length);
    }

    [Fact]
    public async Task Open_ended_range_against_S3_backed_video_returns_206_to_end_of_object()
    {
        var url = SeedVideo(2000);
        var client = _factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Range = new RangeHeaderValue(1024, null);

        var resp = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.PartialContent, resp.StatusCode);
        Assert.Equal(976, resp.Content.Headers.ContentLength); // 2000 - 1024
        Assert.Equal(1024, resp.Content.Headers.ContentRange!.From);
        Assert.Equal(1999, resp.Content.Headers.ContentRange.To);
    }

    [Fact]
    public async Task Suffix_range_against_S3_backed_video_returns_206_for_last_N_bytes()
    {
        var url = SeedVideo(2000);
        var client = _factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Range = new RangeHeaderValue(null, 500);

        var resp = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.PartialContent, resp.StatusCode);
        Assert.Equal(500, resp.Content.Headers.ContentLength);
        Assert.Equal(1500, resp.Content.Headers.ContentRange!.From);
        Assert.Equal(1999, resp.Content.Headers.ContentRange.To);
    }

    [Fact]
    public async Task Unsatisfiable_range_against_S3_backed_video_returns_416_with_Content_Range_star_total()
    {
        var url = SeedVideo(2000);
        var client = _factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Range = new RangeHeaderValue(999_999_999, null);

        var resp = await client.SendAsync(request);

        Assert.Equal((HttpStatusCode)416, resp.StatusCode);
        // Content-Range is a content header (System.Net.Http buckets it under
        // resp.Content.Headers, not resp.Headers) even on a bodyless 416 response.
        Assert.Equal("bytes */2000", resp.Content.Headers.ContentRange?.ToString());
    }

    [Fact]
    public async Task S3_backed_image_serving_still_works_unranged()
    {
        var configId = Guid.NewGuid().ToString();
        var mediaId = Guid.NewGuid().ToString();
        var key = $"{S3ApiTestFactory.KeyPrefix}/Storage/WorkflowMedia/{configId}/{mediaId}.jpg";
        _factory.S3.Put(key, TestBytes(50_000));

        var client = _factory.CreateClient();
        var resp = await client.GetAsync($"/api/workflow-configs/{configId}/media/{mediaId}/file");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal("image/jpeg", resp.Content.Headers.ContentType?.MediaType);
        Assert.Equal(50_000, resp.Content.Headers.ContentLength);
    }

    [Fact]
    public async Task Missing_S3_backed_media_returns_404_not_a_range_error()
    {
        var client = _factory.CreateClient();
        var resp = await client.GetAsync($"/api/workflow-configs/{Guid.NewGuid()}/media/{Guid.NewGuid()}/file");

        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task Malformed_media_id_still_rejected_on_S3_backed_serving()
    {
        var client = _factory.CreateClient();
        var resp = await client.GetAsync($"/api/workflow-configs/{Guid.NewGuid()}/media/not-a-guid/file");

        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Theory]
    [InlineData("..")]
    [InlineData("../../etc")]
    public async Task Traversal_like_config_id_still_rejected_on_S3_backed_serving(string maliciousId)
    {
        var client = _factory.CreateClient();
        var resp = await client.GetAsync($"/api/workflow-configs/{Uri.EscapeDataString(maliciousId)}/media/{Guid.NewGuid()}/file");

        Assert.True(resp.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Unauthorized);
    }
}
