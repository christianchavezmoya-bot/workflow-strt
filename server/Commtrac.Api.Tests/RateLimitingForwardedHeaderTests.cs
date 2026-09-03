using System;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;
using Commtrac.Api.RateLimiting;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// Unit-level checks for <see cref="ClientIpKeyResolver"/>'s normalization rules, isolated
/// from the HTTP pipeline so IPv4-mapped-IPv6 and IPv6 /64 collapsing can be asserted
/// directly against known address pairs.
/// </summary>
public class ClientIpKeyResolverTests
{
    private static string ResolveFor(string? ip)
    {
        var context = new DefaultHttpContext();
        context.Connection.RemoteIpAddress = ip is null ? null : IPAddress.Parse(ip);
        return ClientIpKeyResolver.Resolve(context);
    }

    [Fact]
    public void Null_remote_address_falls_back_to_the_shared_unknown_bucket()
    {
        Assert.Equal(ClientIpKeyResolver.UnknownIpKey, ResolveFor(null));
    }

    [Fact]
    public void Ipv4_mapped_ipv6_normalizes_to_the_same_key_as_the_plain_ipv4_address()
    {
        var mapped = ResolveFor("::ffff:198.51.100.42");
        var plain = ResolveFor("198.51.100.42");
        Assert.Equal(plain, mapped);
        Assert.Equal("ip:v4:198.51.100.42", plain);
    }

    [Fact]
    public void Ipv6_addresses_in_the_same_slash_64_share_a_partition()
    {
        var a = ResolveFor("2001:db8:1234:5678:aaaa:bbbb:cccc:dddd");
        var b = ResolveFor("2001:db8:1234:5678:1111:2222:3333:4444");
        Assert.Equal(a, b);
        Assert.StartsWith("ip:v6:", a);
        Assert.EndsWith("/64", a);
    }

    [Fact]
    public void Ipv6_addresses_in_different_slash_64_networks_are_independent()
    {
        var a = ResolveFor("2001:db8:1234:5678::1");
        var b = ResolveFor("2001:db8:1234:5679::1");
        Assert.NotEqual(a, b);
    }
}

/// <summary>
/// End-to-end checks that the rate limiter's IP dimension partitions on the same
/// trust-boundary-checked RemoteIpAddress that <c>ForwardedHeadersConfiguratorTests</c>
/// guards (PR #335) — never on a raw, unvalidated X-Forwarded-For value. Reuses
/// <see cref="ForwardedHeadersTestFactory"/> (real production permit limits/windows) since
/// these only need to prove partition correctness within a single window, not expiry.
/// </summary>
[Collection(ApiTestCollection.Name)]
public class RateLimitingForwardedHeaderTests
{
    private const string TrustedAlbPeer = "172.31.22.212";   // inside the VPC CIDR
    private const string UntrustedPeer = "203.0.113.99";     // public internet

    private static HttpRequestMessage LoginRequest(string peer, string? forwardedFor, string email)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/auth/login")
        {
            Content = JsonContent.Create(new { email, password = "wrong-password" }),
        };
        req.Headers.Add(ForwardedHeadersTestFactory.PeerHeader, peer);
        if (forwardedFor is not null)
        {
            req.Headers.Add("X-Forwarded-For", forwardedFor);
        }
        return req;
    }

    [Fact]
    public async Task Forged_forwarded_for_from_an_untrusted_peer_cannot_rotate_the_rate_limit_partition()
    {
        using var factory = new ForwardedHeadersTestFactory();
        var client = factory.CreateClient();

        // Attacker controls an untrusted peer and rotates a forged X-Forwarded-For value on
        // every request, hoping each "identity" gets its own limiter bucket. Since the peer
        // is untrusted, UseForwardedHeaders must ignore the header entirely, so every
        // request still resolves to the same real peer IP and shares one partition.
        for (var i = 0; i < SecurityRateLimitPolicies.CredentialIpPermitLimit; i++)
        {
            using var req = LoginRequest(UntrustedPeer, forwardedFor: $"10.0.0.{i}", email: $"probe-{i}@commtrac.local");
            var resp = await client.SendAsync(req);
            Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
        }

        using var overLimit = LoginRequest(UntrustedPeer, forwardedFor: "10.0.0.250", email: "probe-over@commtrac.local");
        var limited = await client.SendAsync(overLimit);
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.NotNull(limited.Headers.RetryAfter);
    }

    [Fact]
    public async Task Trusted_forwarded_ip_partitions_independently_per_real_client()
    {
        using var factory = new ForwardedHeadersTestFactory();
        var client = factory.CreateClient();

        const string clientA = "198.51.100.10";
        const string clientB = "198.51.100.20";

        // Client A exhausts its own IP-level partition.
        for (var i = 0; i < SecurityRateLimitPolicies.CredentialIpPermitLimit; i++)
        {
            using var req = LoginRequest(TrustedAlbPeer, forwardedFor: clientA, email: $"a-probe-{i}@commtrac.local");
            var resp = await client.SendAsync(req);
            Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
        }

        using var aOverLimit = LoginRequest(TrustedAlbPeer, forwardedFor: clientA, email: "a-probe-over@commtrac.local");
        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.SendAsync(aOverLimit)).StatusCode);

        // Client B, forwarded through the same trusted ALB peer, is unaffected by A's usage.
        using var bReq = LoginRequest(TrustedAlbPeer, forwardedFor: clientB, email: "b-probe@commtrac.local");
        var bResp = await client.SendAsync(bReq);
        Assert.Equal(HttpStatusCode.Unauthorized, bResp.StatusCode);
    }
}
