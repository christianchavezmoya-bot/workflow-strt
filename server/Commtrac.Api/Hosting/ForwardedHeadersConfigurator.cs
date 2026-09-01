using System.Net;
using Microsoft.AspNetCore.HttpOverrides;

namespace Commtrac.Api.Hosting;

/// <summary>
/// Configures which upstream proxies may set X-Forwarded-For/-Proto.
///
/// Why this exists: UseForwardedHeaders() defaults KnownProxies/KnownNetworks to loopback
/// only. Behind the AWS ALB the immediate peer is a VPC address (172.31.x.x), so the
/// defaults caused the forwarded headers to be ignored entirely — every request appeared
/// to originate from the ALB's own ENI. That silently recorded the ALB's private IP as the
/// client IP in audit logs and sessions, and would make any future IP-partitioned rate
/// limiting collapse every user into a single partition.
///
/// The trusted set is deliberately NARROW: only the VPC CIDR the ALB's ENIs live in.
/// Blanket-trusting all proxies would let any caller spoof their IP via a forged header.
/// </summary>
public static class ForwardedHeadersConfigurator
{
    /// <summary>VPC CIDR for the ALB ENIs. Override via Networking:TrustedProxyNetworks.</summary>
    public const string DefaultTrustedNetwork = "172.31.0.0/16";

    /// <summary>
    /// One hop: client -> ALB -> app. The ALB appends the client address, so exactly one
    /// entry is trustworthy. A larger limit would let a caller prepend forged entries.
    /// Raise this only if a real additional trusted proxy (e.g. a CDN in front of the ALB)
    /// is introduced — and add that proxy's ranges to the trusted set at the same time.
    /// </summary>
    public const int TrustedProxyHopCount = 1;

    public static void Configure(ForwardedHeadersOptions options, IConfiguration config)
    {
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        options.ForwardLimit = TrustedProxyHopCount;

        // Defaults only trust loopback, which the ALB is not. Replace with the explicit
        // trusted set rather than appending, so the trusted surface is exactly what is
        // configured here plus loopback (kept for local/in-process hosting).
        options.KnownNetworks.Clear();
        options.KnownProxies.Clear();

        foreach (var cidr in ResolveTrustedNetworks(config))
        {
            if (TryParseCidr(cidr, out var network) && network is not null)
            {
                options.KnownNetworks.Add(network);
            }
        }

        // Loopback: in-process hosting and local development.
        options.KnownProxies.Add(IPAddress.Loopback);
        options.KnownProxies.Add(IPAddress.IPv6Loopback);
    }

    /// <summary>
    /// Trusted CIDRs, comma-separated, from Networking:TrustedProxyNetworks; falls back to
    /// the VPC default. An explicitly empty value trusts no network (loopback only).
    /// </summary>
    public static IReadOnlyList<string> ResolveTrustedNetworks(IConfiguration config)
    {
        var configured = config["Networking:TrustedProxyNetworks"];
        if (configured is null)
        {
            return new[] { DefaultTrustedNetwork };
        }

        return configured
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToArray();
    }

    /// <summary>Parses "a.b.c.d/len". Returns false for malformed input rather than throwing.</summary>
    public static bool TryParseCidr(string cidr, out Microsoft.AspNetCore.HttpOverrides.IPNetwork? network)
    {
        network = null;
        if (string.IsNullOrWhiteSpace(cidr)) return false;

        var parts = cidr.Split('/', StringSplitOptions.TrimEntries);
        if (parts.Length != 2) return false;
        if (!IPAddress.TryParse(parts[0], out var prefix)) return false;
        if (!int.TryParse(parts[1], out var prefixLength)) return false;

        var maxPrefix = prefix.AddressFamily == System.Net.Sockets.AddressFamily.InterNetworkV6 ? 128 : 32;
        if (prefixLength < 0 || prefixLength > maxPrefix) return false;

        network = new Microsoft.AspNetCore.HttpOverrides.IPNetwork(prefix, prefixLength);
        return true;
    }
}
