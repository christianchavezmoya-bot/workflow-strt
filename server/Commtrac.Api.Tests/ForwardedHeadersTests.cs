using System.Linq;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;
using Commtrac.Api.Hosting;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace Commtrac.Api.Tests;

/// <summary>
/// Guards the fix for client IPs being recorded as the ALB's own VPC address.
///
/// UseForwardedHeaders defaults to trusting loopback only; behind the ALB the peer is a
/// VPC address, so X-Forwarded-For was ignored and audit logs/sessions recorded the load
/// balancer instead of the caller. These tests assert both halves of the contract: a
/// trusted proxy's forwarded header IS honoured, and an untrusted peer CANNOT spoof one.
/// </summary>
public class ForwardedHeadersConfiguratorTests
{
    private static IConfiguration Config(params (string Key, string Value)[] values) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(values.Select(v => new KeyValuePair<string, string?>(v.Key, v.Value)))
            .Build();

    [Fact]
    public void Defaults_to_the_vpc_network_when_unconfigured()
    {
        var networks = ForwardedHeadersConfigurator.ResolveTrustedNetworks(Config());
        Assert.Equal(new[] { "172.31.0.0/16" }, networks);
    }

    [Fact]
    public void Honours_configured_trusted_networks()
    {
        var networks = ForwardedHeadersConfigurator.ResolveTrustedNetworks(
            Config(("Networking:TrustedProxyNetworks", "10.0.0.0/8, 192.168.0.0/16")));
        Assert.Equal(new[] { "10.0.0.0/8", "192.168.0.0/16" }, networks);
    }

    [Fact]
    public void Explicitly_empty_configuration_trusts_no_network()
    {
        var networks = ForwardedHeadersConfigurator.ResolveTrustedNetworks(
            Config(("Networking:TrustedProxyNetworks", "")));
        Assert.Empty(networks);
    }

    [Fact]
    public void Configure_clears_loopback_only_defaults_and_trusts_the_vpc()
    {
        var options = new ForwardedHeadersOptions();
        ForwardedHeadersConfigurator.Configure(options, Config());

        Assert.Single(options.KnownNetworks);
        // One hop only: a larger limit would let a caller prepend forged XFF entries.
        Assert.Equal(1, options.ForwardLimit);
        Assert.Contains(IPAddress.Loopback, options.KnownProxies);
    }

    [Theory]
    [InlineData("172.31.0.0/16", true)]
    [InlineData("not-a-cidr", false)]
    [InlineData("172.31.0.0", false)]
    [InlineData("172.31.0.0/99", false)]
    [InlineData("", false)]
    public void TryParseCidr_rejects_malformed_input(string cidr, bool expected)
    {
        Assert.Equal(expected, ForwardedHeadersConfigurator.TryParseCidr(cidr, out _));
    }

    [Fact]
    public void Malformed_configured_network_is_skipped_rather_than_crashing_startup()
    {
        var options = new ForwardedHeadersOptions();
        ForwardedHeadersConfigurator.Configure(
            options, Config(("Networking:TrustedProxyNetworks", "junk, 10.0.0.0/8")));

        Assert.Single(options.KnownNetworks);
    }
}

[Collection(ApiTestCollection.Name)]
public class ForwardedHeadersEndToEndTests
{
    private const string TrustedAlbPeer = "172.31.22.212";   // inside the VPC CIDR
    private const string UntrustedPeer = "203.0.113.99";     // public internet
    private const string RealClientIp = "198.51.100.42";

    private static async Task<string> AdminTokenAsync(HttpClient client)
    {
        var resp = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "admin@StrataNgo.local",
            password = "Admin123!",
        });
        resp.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("token").GetString()!;
    }

    /// <summary>Most recent audit-log IP for the given action.</summary>
    private static async Task<string?> LatestAuditIpAsync(HttpClient client, string token, string action)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, "/api/auth/audit-log?limit=100");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        req.Headers.Add(ForwardedHeadersTestFactory.PeerHeader, TrustedAlbPeer);
        var resp = await client.SendAsync(req);
        resp.EnsureSuccessStatusCode();

        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        foreach (var entry in doc.RootElement.EnumerateArray())
        {
            if (entry.GetProperty("action").GetString() == action)
            {
                return entry.GetProperty("ipAddress").GetString();
            }
        }
        return null;
    }

    [Fact]
    public async Task Trusted_proxy_forwarded_for_is_recorded_as_the_real_client_ip()
    {
        using var factory = new ForwardedHeadersTestFactory();
        var client = factory.CreateClient();

        // A failed login from a real client, arriving via the ALB.
        using var login = new HttpRequestMessage(HttpMethod.Post, "/api/auth/login")
        {
            Content = JsonContent.Create(new { email = "admin@StrataNgo.local", password = "wrong-password" }),
        };
        login.Headers.Add(ForwardedHeadersTestFactory.PeerHeader, TrustedAlbPeer);
        login.Headers.Add("X-Forwarded-For", RealClientIp);
        var loginResp = await client.SendAsync(login);
        Assert.Equal(HttpStatusCode.Unauthorized, loginResp.StatusCode);

        var token = await AdminTokenAsync(client);
        var recordedIp = await LatestAuditIpAsync(client, token, "login_failed");

        Assert.Equal(RealClientIp, recordedIp);
        Assert.NotEqual(TrustedAlbPeer, recordedIp);
    }

    [Fact]
    public async Task Untrusted_peer_cannot_spoof_client_ip_via_forwarded_for()
    {
        using var factory = new ForwardedHeadersTestFactory();
        var client = factory.CreateClient();

        const string spoofed = "10.9.9.9";
        using var login = new HttpRequestMessage(HttpMethod.Post, "/api/auth/login")
        {
            Content = JsonContent.Create(new { email = "spoof-probe@commtrac.local", password = "wrong-password" }),
        };
        // Peer is NOT in the trusted VPC range, so its forwarded header must be ignored.
        login.Headers.Add(ForwardedHeadersTestFactory.PeerHeader, UntrustedPeer);
        login.Headers.Add("X-Forwarded-For", spoofed);
        var loginResp = await client.SendAsync(login);
        Assert.Equal(HttpStatusCode.Unauthorized, loginResp.StatusCode);

        var token = await AdminTokenAsync(client);
        var recordedIp = await LatestAuditIpAsync(client, token, "login_failed");

        Assert.NotEqual(spoofed, recordedIp);
        Assert.Equal(UntrustedPeer, recordedIp);
    }

    [Fact]
    public async Task Authentication_and_routing_behaviour_is_unchanged()
    {
        using var factory = new ForwardedHeadersTestFactory();
        var client = factory.CreateClient();

        // Anonymous endpoint still reachable.
        using var health = new HttpRequestMessage(HttpMethod.Get, "/api/health");
        health.Headers.Add(ForwardedHeadersTestFactory.PeerHeader, TrustedAlbPeer);
        Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(health)).StatusCode);

        // Protected endpoint still rejects anonymous callers.
        using var noAuth = new HttpRequestMessage(HttpMethod.Get, "/api/auth/audit-log");
        noAuth.Headers.Add(ForwardedHeadersTestFactory.PeerHeader, TrustedAlbPeer);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.SendAsync(noAuth)).StatusCode);

        // Valid credentials still authenticate, and the token still authorises.
        var token = await AdminTokenAsync(client);
        Assert.False(string.IsNullOrWhiteSpace(token));

        using var authed = new HttpRequestMessage(HttpMethod.Get, "/api/auth/audit-log?limit=1");
        authed.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        authed.Headers.Add(ForwardedHeadersTestFactory.PeerHeader, TrustedAlbPeer);
        Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(authed)).StatusCode);
    }
}
