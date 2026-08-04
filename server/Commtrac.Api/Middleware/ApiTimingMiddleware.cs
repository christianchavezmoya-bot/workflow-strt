namespace Commtrac.Api.Middleware;

/// <summary>
/// Logs duration and response size for hot-path API routes (assets, runs, capture saves).
/// Enabled in Development only — see Program.cs.
/// </summary>
public sealed class ApiTimingMiddleware
{
    private static readonly string[] HotPathFragments =
    [
        "by-project",
        "by-product",
        "step-results",
        "capture-cell",
    ];

    private readonly RequestDelegate _next;
    private readonly ILogger<ApiTimingMiddleware> _logger;

    public ApiTimingMiddleware(RequestDelegate next, ILogger<ApiTimingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value ?? string.Empty;
        var isHotPath = path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase)
            && HotPathFragments.Any(fragment =>
                path.Contains(fragment, StringComparison.OrdinalIgnoreCase));

        if (!isHotPath)
        {
            await _next(context);
            return;
        }

        var sw = System.Diagnostics.Stopwatch.StartNew();
        var originalBody = context.Response.Body;
        await using var buffer = new MemoryStream();
        context.Response.Body = buffer;

        try
        {
            await _next(context);
        }
        finally
        {
            sw.Stop();
            buffer.Seek(0, SeekOrigin.Begin);
            var bytes = buffer.Length;
            await buffer.CopyToAsync(originalBody);
            context.Response.Body = originalBody;

            _logger.LogInformation(
                "[ApiTiming] {Method} {Path} → {Status} {ElapsedMs}ms {Bytes}b",
                context.Request.Method,
                path,
                context.Response.StatusCode,
                sw.ElapsedMilliseconds,
                bytes);
        }
    }
}
