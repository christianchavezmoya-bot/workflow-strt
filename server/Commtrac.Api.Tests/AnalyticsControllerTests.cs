using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Commtrac.Api.Controllers;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Commtrac.Api.Tests;

public class AnalyticsControllerTests
{
    private static AppDbContext CreateDb() =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(System.Guid.NewGuid().ToString())
            .Options);

    [Fact]
    public async Task IngestBatch_EmptyEvents_ReturnsNoContent()
    {
        using var db = CreateDb();
        var controller = CreateController(db);
        var result = await controller.IngestBatch(
            new AnalyticsEventBatchRequest(new List<AnalyticsEventRequest>()));
        Assert.IsType<NoContentResult>(result);
    }

    private static AnalyticsController CreateController(AppDbContext db) =>
        new(db)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity())
                }
            }
        };

    [Fact]
    public async Task IngestBatch_ValidBatch_PersistsEvents()
    {
        using var db = CreateDb();
        var controller = CreateController(db);
        var request = new AnalyticsEventBatchRequest(new List<AnalyticsEventRequest>
        {
            new("onboarding_started", "user-1", "Admin", null, null),
            new("tour_step_viewed",   "user-1", "Admin", null,
                new Dictionary<string, object?> { ["stepIndex"] = 1 }),
        });

        var result = await controller.IngestBatch(request);

        Assert.IsType<NoContentResult>(result);
        Assert.Equal(2, await db.AnalyticsEvents.CountAsync());
    }

    [Fact]
    public async Task IngestBatch_FallsBackToJwtIdentity_WhenUserIdAbsentInPayload()
    {
        using var db = CreateDb();
        var controller = new AnalyticsController(db)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(new[]
                    {
                        new Claim(ClaimTypes.NameIdentifier, "jwt-user"),
                        new Claim(ClaimTypes.Role, "PM"),
                    }))
                }
            }
        };

        await controller.IngestBatch(new AnalyticsEventBatchRequest(new List<AnalyticsEventRequest>
        {
            new("onboarding_completed", null, null, null, null),
        }));

        var saved = await db.AnalyticsEvents.FirstAsync();
        Assert.Equal("jwt-user", saved.UserId);
        Assert.Equal("PM", saved.Role);
    }

    [Fact]
    public async Task IngestBatch_CapsAt100Events()
    {
        using var db = CreateDb();
        var controller = CreateController(db);
        var events = Enumerable.Range(0, 150)
            .Select(_ => new AnalyticsEventRequest("tour_step_viewed", null, null, null, null))
            .ToList();

        await controller.IngestBatch(new AnalyticsEventBatchRequest(events));

        Assert.Equal(100, await db.AnalyticsEvents.CountAsync());
    }
}
