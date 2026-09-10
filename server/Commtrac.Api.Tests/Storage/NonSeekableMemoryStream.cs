namespace Commtrac.Api.Tests.Storage;

/// <summary>
/// Wraps a MemoryStream but reports CanSeek = false and throws on Seek/Position-set —
/// reproducing the one characteristic of S3's real GetObject ResponseStream that caused
/// the PR #352 false positive: ASP.NET's FileStreamResult.EnableRangeProcessing silently
/// no-ops on a non-seekable stream. A plain seekable MemoryStream fake would not have
/// caught that regression, so every fake S3 read in these tests must return one of these.
/// </summary>
internal sealed class NonSeekableMemoryStream : Stream
{
    private readonly MemoryStream _inner;

    public NonSeekableMemoryStream(byte[] data) => _inner = new MemoryStream(data, writable: false);

    public override bool CanRead => true;
    public override bool CanSeek => false;
    public override bool CanWrite => false;
    public override long Length => throw new NotSupportedException("Non-seekable — matches real S3 ResponseStream.");
    public override long Position
    {
        get => throw new NotSupportedException("Non-seekable — matches real S3 ResponseStream.");
        set => throw new NotSupportedException("Non-seekable — matches real S3 ResponseStream.");
    }

    public override int Read(byte[] buffer, int offset, int count) => _inner.Read(buffer, offset, count);

    public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken)
        => _inner.ReadAsync(buffer, offset, count, cancellationToken);

    public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        => _inner.ReadAsync(buffer, cancellationToken);

    public override void Flush() => _inner.Flush();
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

    protected override void Dispose(bool disposing)
    {
        if (disposing) _inner.Dispose();
        base.Dispose(disposing);
    }
}
