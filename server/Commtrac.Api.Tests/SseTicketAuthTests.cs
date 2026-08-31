using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Commtrac.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Commtrac.Api.Tests;

[Collection(ApiTestCollection.Name)]
public class SseTicketAuthTests : IClassFixture<ApiTestFactory>
{
    private readonly ApiTestFactory _factory;

    public SseTicketAuthTests(ApiTestFactory factory) => _factory = factory;

    [Fact]
    public async Task Ticket_without_auth_is_unauthorized()
    {
        var client = _factory.CreateClient();
        var resp = await client.PostAsync("/api/sse/ticket", null);
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task Login_can_mint_ticket_and_connect_sse_once()
    {
        var client = await CreateAuthedClientAsync();

        var ticketResp = await client.PostAsync("/api/sse/ticket", null);
        Assert.Equal(HttpStatusCode.OK, ticketResp.StatusCode);

        using var ticketDoc = JsonDocument.Parse(await ticketResp.Content.ReadAsStringAsync());
        var ticket = ticketDoc.RootElement.GetProperty("ticket").GetString();
        Assert.False(string.IsNullOrWhiteSpace(ticket));

        var sseClient = _factory.CreateClient();
        sseClient.Timeout = TimeSpan.FromSeconds(5);
        using var sseRequest = new HttpRequestMessage(HttpMethod.Get, $"/api/sse/events?ticket={Uri.EscapeDataString(ticket!)}");
        using var sseResponse = await sseClient.SendAsync(sseRequest, HttpCompletionOption.ResponseHeadersRead);
        Assert.Equal(HttpStatusCode.OK, sseResponse.StatusCode);

        await using var stream = await sseResponse.Content.ReadAsStreamAsync();
        using var reader = new StreamReader(stream);
        var sawConnected = false;
        for (var i = 0; i < 20 && !sawConnected; i++)
        {
            var line = await reader.ReadLineAsync();
            if (line is null) break;
            if (line.Contains("connected", StringComparison.Ordinal))
            {
                sawConnected = true;
            }
        }
        Assert.True(sawConnected, "expected SSE connected event");
    }

    [Fact]
    public async Task Ticket_is_single_use_for_sse_connect()
    {
        var client = await CreateAuthedClientAsync();
        var ticket = await MintTicketAsync(client);

        var first = await OpenSseAsync(ticket);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        first.Dispose();

        var second = await OpenSseAsync(ticket);
        Assert.Equal(HttpStatusCode.Unauthorized, second.StatusCode);
        second.Dispose();
    }

    [Fact]
    public async Task Ticket_cannot_authorize_rest_endpoint()
    {
        var client = await CreateAuthedClientAsync();
        var ticket = await MintTicketAsync(client);

        var anon = _factory.CreateClient();
        anon.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", ticket);
        var resp = await anon.GetAsync("/api/auth/profile");
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task Legacy_token_query_auth_is_rejected_outside_development()
    {
        var devClient = _factory.CreateClient();
        var loginResp = await devClient.PostAsJsonAsync("/api/auth/login", new
        {
            email = "admin@commtrac.local",
            password = "Admin123!",
        });
        Assert.Equal(HttpStatusCode.OK, loginResp.StatusCode);
        using var loginDoc = JsonDocument.Parse(await loginResp.Content.ReadAsStringAsync());
        var token = loginDoc.RootElement.GetProperty("token").GetString();

        await using var prodFactory = new ProductionSseTestFactory();
        var sseClient = prodFactory.CreateClient();
        var resp = await sseClient.GetAsync($"/api/sse/events?token={Uri.EscapeDataString(token!)}");
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task Revoked_session_cannot_mint_ticket()
    {
        var client = await CreateAuthedClientAsync();

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var session = await db.Sessions.OrderByDescending(s => s.CreatedAt).FirstAsync();
        session.IsRevoked = true;
        await db.SaveChangesAsync();

        var ticketResp = await client.PostAsync("/api/sse/ticket", null);
        Assert.Equal(HttpStatusCode.Unauthorized, ticketResp.StatusCode);
    }

    private async Task<HttpClient> CreateAuthedClientAsync()
    {
        var client = _factory.CreateClient();
        var loginResp = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "admin@commtrac.local",
            password = "Admin123!",
        });
        Assert.Equal(HttpStatusCode.OK, loginResp.StatusCode);

        using var doc = JsonDocument.Parse(await loginResp.Content.ReadAsStringAsync());
        var token = doc.RootElement.GetProperty("token").GetString();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    private static async Task<string> MintTicketAsync(HttpClient client)
    {
        var ticketResp = await client.PostAsync("/api/sse/ticket", null);
        Assert.Equal(HttpStatusCode.OK, ticketResp.StatusCode);
        using var ticketDoc = JsonDocument.Parse(await ticketResp.Content.ReadAsStringAsync());
        return ticketDoc.RootElement.GetProperty("ticket").GetString()!;
    }

    private async Task<HttpResponseMessage> OpenSseAsync(string ticket)
    {
        var sseClient = _factory.CreateClient();
        sseClient.Timeout = TimeSpan.FromSeconds(3);
        return await sseClient.SendAsync(
            new HttpRequestMessage(HttpMethod.Get, $"/api/sse/events?ticket={Uri.EscapeDataString(ticket)}"),
            HttpCompletionOption.ResponseHeadersRead);
    }
}
