using Commtrac.Api.Services.Storage;
using Microsoft.Extensions.Options;
using Xunit;

namespace Commtrac.Api.Tests.Storage;

/// <summary>
/// Proves S3FileStorageService.OpenReadRangeAsync genuinely supports HTTP byte ranges
/// against S3-shaped behavior (non-seekable ResponseStream, real GetObjectRequest.ByteRange
/// truncation) — the exact thing WorkflowConfigMediaTests (PR #352) did NOT cover, because
/// ApiTestFactory only ever exercises LocalFileStorageService's seekable FileStream.
/// </summary>
public class S3RangeReadTests
{
    private static (S3FileStorageService storage, FakeSeekResistantS3Client client) BuildStorage()
    {
        var client = new FakeSeekResistantS3Client();
        var options = Options.Create(new StorageOptions { Provider = "S3", Bucket = "test-bucket", KeyPrefix = "test-prefix" });
        var storage = new S3FileStorageService(client, options);
        return (storage, client);
    }

    private static byte[] TestBytes(int length)
    {
        var bytes = new byte[length];
        for (var i = 0; i < length; i++) bytes[i] = (byte)(i % 256);
        return bytes;
    }

    [Fact]
    public async Task No_range_header_returns_full_content_not_partial()
    {
        var (storage, client) = BuildStorage();
        var data = TestBytes(2000);
        client.Put("test-prefix/clip.mp4", data);

        var result = await storage.OpenReadRangeAsync("clip.mp4", rangeHeaderValue: null);

        Assert.NotNull(result);
        Assert.False(result!.IsPartial);
        Assert.Equal(2000, result.TotalLength);
        Assert.Equal(2000, result.ContentLength);
        Assert.Equal(0, result.RangeStart);
        Assert.Equal(1999, result.RangeEnd);
        Assert.False(result.Stream.CanSeek, "fake must reproduce S3's non-seekable ResponseStream");
    }

    [Fact]
    public async Task Closed_range_bytes_0_1023_returns_exactly_that_slice_via_real_S3_ByteRange()
    {
        var (storage, client) = BuildStorage();
        var data = TestBytes(2000);
        client.Put("test-prefix/clip.mp4", data);

        var result = await storage.OpenReadRangeAsync("clip.mp4", "bytes=0-1023");

        Assert.NotNull(result);
        Assert.True(result!.IsPartial);
        Assert.Equal(2000, result.TotalLength);
        Assert.Equal(1024, result.ContentLength);
        Assert.Equal(0, result.RangeStart);
        Assert.Equal(1023, result.RangeEnd);
        Assert.False(result.Stream.CanSeek);

        using var ms = new MemoryStream();
        await result.Stream.CopyToAsync(ms);
        Assert.Equal(data[0..1024], ms.ToArray());
    }

    [Fact]
    public async Task Mid_range_bytes_1024_2047_returns_exactly_that_slice()
    {
        var (storage, client) = BuildStorage();
        var data = TestBytes(4000);
        client.Put("test-prefix/clip.mp4", data);

        var result = await storage.OpenReadRangeAsync("clip.mp4", "bytes=1024-2047");

        Assert.NotNull(result);
        Assert.True(result!.IsPartial);
        Assert.Equal(1024, result.ContentLength);
        Assert.Equal(1024, result.RangeStart);
        Assert.Equal(2047, result.RangeEnd);

        using var ms = new MemoryStream();
        await result.Stream.CopyToAsync(ms);
        Assert.Equal(data[1024..2048], ms.ToArray());
    }

    [Fact]
    public async Task Open_ended_range_bytes_1000_dash_resolves_to_end_of_object()
    {
        var (storage, client) = BuildStorage();
        var data = TestBytes(2000);
        client.Put("test-prefix/clip.mp4", data);

        var result = await storage.OpenReadRangeAsync("clip.mp4", "bytes=1000-");

        Assert.NotNull(result);
        Assert.True(result!.IsPartial);
        Assert.Equal(1000, result.RangeStart);
        Assert.Equal(1999, result.RangeEnd);
        Assert.Equal(1000, result.ContentLength);

        using var ms = new MemoryStream();
        await result.Stream.CopyToAsync(ms);
        Assert.Equal(data[1000..2000], ms.ToArray());
    }

    [Fact]
    public async Task Suffix_range_bytes_dash_500_resolves_to_last_500_bytes()
    {
        var (storage, client) = BuildStorage();
        var data = TestBytes(2000);
        client.Put("test-prefix/clip.mp4", data);

        var result = await storage.OpenReadRangeAsync("clip.mp4", "bytes=-500");

        Assert.NotNull(result);
        Assert.True(result!.IsPartial);
        Assert.Equal(1500, result.RangeStart);
        Assert.Equal(1999, result.RangeEnd);
        Assert.Equal(500, result.ContentLength);

        using var ms = new MemoryStream();
        await result.Stream.CopyToAsync(ms);
        Assert.Equal(data[1500..2000], ms.ToArray());
    }

    [Fact]
    public async Task Unsatisfiable_range_throws_with_correct_total_length()
    {
        var (storage, client) = BuildStorage();
        var data = TestBytes(2000);
        client.Put("test-prefix/clip.mp4", data);

        var ex = await Assert.ThrowsAsync<RangeNotSatisfiableException>(
            () => storage.OpenReadRangeAsync("clip.mp4", "bytes=999999999-"));

        Assert.Equal(2000, ex.TotalLength);
    }

    [Fact]
    public async Task Multi_range_header_is_treated_as_no_range_full_content()
    {
        var (storage, client) = BuildStorage();
        var data = TestBytes(2000);
        client.Put("test-prefix/clip.mp4", data);

        var result = await storage.OpenReadRangeAsync("clip.mp4", "bytes=0-10,20-30");

        Assert.NotNull(result);
        Assert.False(result!.IsPartial);
        Assert.Equal(2000, result.ContentLength);
    }

    [Fact]
    public async Task Missing_object_returns_null()
    {
        var (storage, _) = BuildStorage();

        var result = await storage.OpenReadRangeAsync("does-not-exist.mp4", "bytes=0-1023");

        Assert.Null(result);
    }

    [Fact]
    public async Task Missing_object_with_no_range_also_returns_null()
    {
        var (storage, _) = BuildStorage();

        var result = await storage.OpenReadRangeAsync("does-not-exist.mp4", rangeHeaderValue: null);

        Assert.Null(result);
    }
}

/// <summary>Pure unit tests for the RFC 7233 parsing logic shared by both storage backends.</summary>
public class HttpRangeHeaderTests
{
    [Fact]
    public void No_header_is_not_a_range()
    {
        Assert.False(HttpRangeHeader.TryParse(null, 2000, out _, out var unsatisfiable));
        Assert.False(unsatisfiable);
    }

    [Fact]
    public void Closed_range_parses_correctly()
    {
        Assert.True(HttpRangeHeader.TryParse("bytes=0-1023", 2000, out var range, out _));
        Assert.Equal(0, range.Start);
        Assert.Equal(1023, range.End);
    }

    [Fact]
    public void Open_ended_range_resolves_end_to_total_length_minus_one()
    {
        Assert.True(HttpRangeHeader.TryParse("bytes=1000-", 2000, out var range, out _));
        Assert.Equal(1000, range.Start);
        Assert.Equal(1999, range.End);
    }

    [Fact]
    public void Suffix_range_resolves_start_from_total_length()
    {
        Assert.True(HttpRangeHeader.TryParse("bytes=-500", 2000, out var range, out _));
        Assert.Equal(1500, range.Start);
        Assert.Equal(1999, range.End);
    }

    [Fact]
    public void Suffix_range_larger_than_total_length_clamps_to_zero()
    {
        Assert.True(HttpRangeHeader.TryParse("bytes=-5000", 2000, out var range, out _));
        Assert.Equal(0, range.Start);
        Assert.Equal(1999, range.End);
    }

    [Fact]
    public void End_beyond_total_length_is_clamped_not_rejected()
    {
        Assert.True(HttpRangeHeader.TryParse("bytes=0-999999", 2000, out var range, out _));
        Assert.Equal(0, range.Start);
        Assert.Equal(1999, range.End);
    }

    [Fact]
    public void Start_beyond_total_length_is_unsatisfiable()
    {
        Assert.False(HttpRangeHeader.TryParse("bytes=999999999-", 2000, out _, out var unsatisfiable));
        Assert.True(unsatisfiable);
    }

    [Fact]
    public void Start_after_end_is_unsatisfiable()
    {
        Assert.False(HttpRangeHeader.TryParse("bytes=1000-500", 2000, out _, out var unsatisfiable));
        Assert.True(unsatisfiable);
    }

    [Fact]
    public void Multi_range_is_ignored_not_unsatisfiable()
    {
        Assert.False(HttpRangeHeader.TryParse("bytes=0-10,20-30", 2000, out _, out var unsatisfiable));
        Assert.False(unsatisfiable);
    }

    [Fact]
    public void Malformed_value_is_ignored_not_unsatisfiable()
    {
        Assert.False(HttpRangeHeader.TryParse("bytes=abc-def", 2000, out _, out var unsatisfiable));
        Assert.False(unsatisfiable);
    }

    [Fact]
    public void Non_bytes_unit_is_ignored()
    {
        Assert.False(HttpRangeHeader.TryParse("items=0-5", 2000, out _, out var unsatisfiable));
        Assert.False(unsatisfiable);
    }

    [Fact]
    public void Zero_length_resource_is_always_unsatisfiable_for_a_range()
    {
        Assert.False(HttpRangeHeader.TryParse("bytes=0-10", 0, out _, out var unsatisfiable));
        Assert.True(unsatisfiable);
    }
}
