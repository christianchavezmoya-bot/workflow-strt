namespace Commtrac.Api.Services.Storage;

/// <summary>
/// Result of a range-aware storage read. For a non-partial ("full content") read,
/// RangeStart is 0, RangeEnd is TotalLength-1, and ContentLength equals TotalLength.
/// The caller (controller) owns disposing Stream once the response body is written.
/// </summary>
public sealed record FileRangeResult(
    Stream Stream,
    long TotalLength,
    long ContentLength,
    long RangeStart,
    long RangeEnd,
    bool IsPartial);

/// <summary>
/// Thrown by OpenReadRangeAsync when the request named exactly one syntactically valid
/// range that is out of bounds for the resource (e.g. "bytes=999999999-" on a 2MB file).
/// The caller should respond 416 Range Not Satisfiable with "Content-Range: bytes */TotalLength".
/// </summary>
public sealed class RangeNotSatisfiableException : Exception
{
    public long TotalLength { get; }

    public RangeNotSatisfiableException(long totalLength)
        : base($"Requested range is not satisfiable for a resource of length {totalLength}.")
    {
        TotalLength = totalLength;
    }
}
