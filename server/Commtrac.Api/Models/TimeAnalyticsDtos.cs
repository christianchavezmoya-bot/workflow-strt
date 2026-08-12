namespace Commtrac.Api.Models;

public record TimeAnalyticsFiltersDto(
    string? From,
    string? To,
    string? CustomerId,
    string? ProductId,
    string? ProjectId
);

public record TimeAnalyticsSnapshotDto(
    string GeneratedAt,
    TimeAnalyticsRangeDto Range,
    TimeAnalyticsFiltersDto Filters,
    TimeAnalyticsKpiDto Kpis,
    IReadOnlyList<TimeAnalyticsInstallerDto> Installers,
    IReadOnlyList<TimeAnalyticsProjectDto> Projects,
    IReadOnlyList<TimeAnalyticsAssetTypeDto> Assets,
    IReadOnlyList<TimeAnalyticsProductDto> Products,
    IReadOnlyList<TimeAnalyticsCustomerDto> Customers,
    TimeAnalyticsDowntimeDto Downtime,
    TimeAnalyticsFinanceDto Finance,
    TimeAnalyticsForecastDto Forecast,
    IReadOnlyList<TimeAnalyticsBenchmarkDto> Benchmarks,
    IReadOnlyList<TimeAnalyticsActivityDto> Activity,
    IReadOnlyList<TimeAnalyticsTimelineDto> InstallerTimeline,
    IReadOnlyList<TimeAnalyticsHeatmapDto> Heatmap,
    IReadOnlyList<TimeAnalyticsQualitySpeedDto> QualitySpeed,
    IReadOnlyList<TimeAnalyticsProductTrendDto> ProductTrend,
    IReadOnlyList<TimeAnalyticsBurndownDto> Burndown,
    IReadOnlyList<TimeAnalyticsThroughputDayDto> ThroughputDaily
);

public record TimeAnalyticsFinanceParamsDto(
    double HourlyRate,
    double RevenueMultiplier,
    double QuotedRatio
);

public record TimeAnalyticsRangeDto(string From, string To);

public record TimeAnalyticsKpiDto(
    int ActiveInstallers,
    int CompletedToday,
    double ProductiveHours,
    double DowntimeHours,
    double ProductivityPct,
    int AvgInstallMinutes,
    string FastestInstallerName,
    int ProjectsActive,
    int AssetsRemaining,
    double Revenue,
    double LabourCost
);

public record TimeAnalyticsInstallerDto(
    string Id,
    string Name,
    string Role,
    string Team,
    string Region,
    string Color,
    string Initials,
    double ProductiveHours,
    double DowntimeHours,
    double ProductivityPct,
    int AvgInstallMinutes,
    int Completions,
    int Defects
);

public record TimeAnalyticsProjectDto(
    string Id,
    string Name,
    string CustomerId,
    string CustomerName,
    string Status,
    string Health,
    string Due,
    int TotalAssets,
    int DoneAssets,
    double ProductiveHours,
    double DowntimeHours
);

public record TimeAnalyticsAssetTypeDto(
    string Type,
    string Model,
    int AvgMinutes,
    int MinMinutes,
    int MaxMinutes,
    double Std,
    int Installs,
    double Difficulty
);

public record TimeAnalyticsProductDto(
    string Id,
    string Name,
    string Family,
    string Firmware,
    int AvgMinutes,
    int Installs,
    double Trend90d,
    double DefectRatePct
);

public record TimeAnalyticsCustomerDto(
    string Id,
    string Name,
    string Industry,
    string Country,
    int ProjectCount,
    int TotalAssets,
    int DoneAssets,
    double ProductiveHours,
    double DowntimeHours,
    double ProductivityPct,
    int AvgInstallMinutes
);

public record TimeAnalyticsDowntimeDto(
    IReadOnlyList<TimeAnalyticsDowntimeReasonDto> Reasons,
    IReadOnlyList<TimeAnalyticsMonthlyTrendDto> TrendMonthly
);

public record TimeAnalyticsDowntimeReasonDto(
    string Reason,
    int Occurrences,
    int AvgMinutes,
    int TotalMinutes
);

public record TimeAnalyticsMonthlyTrendDto(
    string Month,
    double Productive,
    double Downtime
);

public record TimeAnalyticsFinanceDto(
    double Revenue,
    double LabourCost,
    double MarginPct,
    double BillablePct,
    TimeAnalyticsFinanceParamsDto Params,
    IReadOnlyList<TimeAnalyticsFinanceInstallerDto> ByInstaller,
    IReadOnlyList<TimeAnalyticsFinanceProjectDto> ByProject
);

public record TimeAnalyticsFinanceInstallerDto(string Id, string Name, double Cost);
public record TimeAnalyticsFinanceProjectDto(string Id, string Name, double Quoted, double Actual);

public record TimeAnalyticsForecastDto(
    double RemainingHours,
    string EstimatedCompletion,
    string RiskLevel,
    int CrewsNeeded,
    int ConfidencePct,
    IReadOnlyList<TimeAnalyticsForecastWeekDto> Completion,
    IReadOnlyList<TimeAnalyticsForecastHistoryDto> History
);

public record TimeAnalyticsForecastWeekDto(string Week, double Low, double Mid, double High);
public record TimeAnalyticsForecastHistoryDto(string Period, double Predicted, double Actual);

public record TimeAnalyticsBenchmarkDto(
    string Name,
    int ExpectedMinutes,
    int ActualMinutes,
    int ConfidencePct
);

public record TimeAnalyticsActivityDto(string Type, string Text, string Timestamp);

public record TimeAnalyticsTimelineDto(
    string InstallerId,
    string InstallerName,
    string Initials,
    string Color,
    string Team,
    IReadOnlyList<TimeAnalyticsTimelineSegmentDto> Segments
);

public record TimeAnalyticsTimelineSegmentDto(
    double StartHour,
    double EndHour,
    string Kind,
    string Label
);

public record TimeAnalyticsHeatmapDto(string Day, int Hour, double Intensity);

public record TimeAnalyticsQualitySpeedDto(
    string InstallerId,
    string Name,
    string Color,
    int AvgMinutes,
    int Defects
);

public record TimeAnalyticsProductTrendDto(string Month, Dictionary<string, double> Series);

public record TimeAnalyticsBurndownDto(string Week, int Ideal, int Actual);

public record TimeAnalyticsThroughputDayDto(string Date, int Completions);
