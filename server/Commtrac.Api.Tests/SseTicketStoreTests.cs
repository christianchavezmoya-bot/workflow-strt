using Commtrac.Api.Services;

namespace Commtrac.Api.Tests;

public class SseTicketStoreTests
{
    [Fact]
    public void TryIssue_returns_opaque_ticket()
    {
        var store = new SseTicketStore();

        var result = store.TryIssue("user-1", "session-1");

        Assert.Equal(SseTicketIssueStatus.Success, result.Status);
        Assert.False(string.IsNullOrWhiteSpace(result.Ticket));
        Assert.Equal(SseTicketStoreOptions.DefaultTicketLifetimeSeconds, result.ExpiresInSeconds);
        Assert.DoesNotContain(".", result.Ticket!);
    }

    [Fact]
    public void TryConsume_is_single_use()
    {
        var store = new SseTicketStore();
        var issued = store.TryIssue("user-1", null);
        Assert.Equal(SseTicketIssueStatus.Success, issued.Status);

        Assert.True(store.TryConsume(issued.Ticket!, out var userId, out _));
        Assert.Equal("user-1", userId);

        Assert.False(store.TryConsume(issued.Ticket!, out _, out _));
    }

    [Fact]
    public void TryConsume_rejects_expired_ticket()
    {
        var store = new SseTicketStore(new SseTicketStoreOptions { TicketLifetimeSeconds = 0 });
        var issued = store.TryIssue("user-1", null);
        Assert.Equal(SseTicketIssueStatus.Success, issued.Status);

        Thread.Sleep(20);

        Assert.False(store.TryConsume(issued.Ticket!, out _, out _));
    }

    [Fact]
    public void TryIssue_rate_limits_per_user()
    {
        var store = new SseTicketStore(new SseTicketStoreOptions
        {
            TicketLifetimeSeconds = 300,
            MaxTicketsPerUserPerMinute = 3,
        });

        for (var i = 0; i < 3; i++)
        {
            var ok = store.TryIssue("user-rate", null);
            Assert.Equal(SseTicketIssueStatus.Success, ok.Status);
        }

        var limited = store.TryIssue("user-rate", null);
        Assert.Equal(SseTicketIssueStatus.RateLimited, limited.Status);
        Assert.True(limited.RetryAfterSeconds >= 1);
    }
}
