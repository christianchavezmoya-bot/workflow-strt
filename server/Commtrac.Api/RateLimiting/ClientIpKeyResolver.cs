using System.Net;
using System.Net.Sockets;

namespace Commtrac.Api.RateLimiting;

/// <summary>
/// Resolves a normalized rate-limiter partition key from the request's client IP.
///
/// Must run after UseForwardedHeaders() has already resolved HttpContext.Connection
/// .RemoteIpAddress from the trusted-hop-only configuration in
/// ForwardedHeadersConfigurator (PR #335) — this type never reads X-Forwarded-For
/// directly, so a caller cannot influence its own partition key via a forged header
/// unless it controls a peer inside the trusted VPC CIDR.
/// </summary>
public static class ClientIpKeyResolver
{
    /// <summary>
    /// Shared bucket for requests where RemoteIpAddress is unexpectedly null (should not
    /// happen in Kestrel behind a real socket connection, but a null value must still land
    /// in a bounded, rate-limited partition rather than bypassing limiting entirely).
    /// </summary>
    public const string UnknownIpKey = "ip:unknown";

    public static string Resolve(HttpContext context)
    {
        var ip = context.Connection.RemoteIpAddress;
        if (ip is null)
        {
            return UnknownIpKey;
        }

        if (ip.IsIPv4MappedToIPv6)
        {
            ip = ip.MapToIPv4();
        }

        if (ip.AddressFamily == AddressFamily.InterNetwork)
        {
            return $"ip:v4:{ip}";
        }

        if (ip.AddressFamily == AddressFamily.InterNetworkV6)
        {
            // Normalize to the /64 network so a single holder of a larger block (common
            // for residential/mobile IPv6 allocations) can't rotate addresses within it
            // to bypass the limiter one request at a time.
            var bytes = ip.GetAddressBytes(); // 16 bytes
            for (var i = 8; i < 16; i++)
            {
                bytes[i] = 0;
            }
            var network = new IPAddress(bytes);
            return $"ip:v6:{network}/64";
        }

        // Any other address family (should not occur in practice): fall back to the
        // shared bounded bucket rather than an unbounded per-value partition.
        return UnknownIpKey;
    }
}
