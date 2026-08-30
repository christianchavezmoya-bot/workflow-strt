using Commtrac.Api.Models;
using System.Text.Json;

namespace Commtrac.Api.Tests;

/// <summary>
/// Documents expected workflow-completion email gating (see NotificationService).
/// PM and extra recipients only when AssetClosedNotificationEnabled is true on the project schedule JSON.
/// </summary>
public class WorkflowCompletionNotificationTests
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [Fact]
    public void DeserializeSchedule_WhenAssetClosedDisabled_NotEnabledForNotify()
    {
        var json = JsonSerializer.Serialize(new ProjectScheduledReportDto(
            Enabled: false,
            Frequency: "weekly",
            DaysOfWeek: ["M"],
            SendTimeLocal: "08:00",
            RecipientEmails: ["pm@example.com"],
            AssetClosedNotificationEnabled: false), JsonOptions);

        var schedule = JsonSerializer.Deserialize<ProjectScheduledReportDto>(json, JsonOptions);
        Assert.NotNull(schedule);
        Assert.False(schedule!.AssetClosedNotificationEnabled);
    }

    [Fact]
    public void DeserializeSchedule_WhenAssetClosedEnabled_AllowsNotify()
    {
        var json = JsonSerializer.Serialize(new ProjectScheduledReportDto(
            Enabled: false,
            Frequency: "weekly",
            DaysOfWeek: ["M"],
            SendTimeLocal: "08:00",
            RecipientEmails: ["extra@example.com"],
            AssetClosedNotificationEnabled: true), JsonOptions);

        var schedule = JsonSerializer.Deserialize<ProjectScheduledReportDto>(json, JsonOptions);
        Assert.NotNull(schedule);
        Assert.True(schedule!.AssetClosedNotificationEnabled);
    }
}
