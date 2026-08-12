using System.Globalization;
using System.Text.Json;
using Commtrac.Api.Data;
using Commtrac.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Commtrac.Api.Services;

/// <summary>
/// Builds the Time Analytics dashboard snapshot from workflow runs, assets,
/// projects, customers, products, and users already stored in Commtrac.
/// </summary>
public class TimeAnalyticsSnapshotService
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private static readonly string[] AvatarColors =
    [
        "#2dd4bf", "#ff9f45", "#3aa1ff", "#a78bfa",
        "#34d399", "#fbbf24", "#f472b6", "#22d3ee",
        "#fb923c", "#60a5fa",
    ];

    private static readonly HashSet<string> DoneAssetStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "Complete", "Completed", "Closed",
    };

    private const double DefaultHourlyRate = 85.0;
    private const double DefaultRevenueMultiplier = 1.35;
    private const double DefaultQuotedRatio = 0.92;

    private readonly AppDbContext _db;

    public TimeAnalyticsSnapshotService(AppDbContext db) => _db = db;

    public async Task<TimeAnalyticsSnapshotDto> BuildAsync(
        string? from,
        string? to,
        string? customerId,
        string? productId,
        string? projectId,
        TimeAnalyticsFinanceParamsDto? financeParams = null,
        CancellationToken ct = default)
    {
        financeParams ??= new TimeAnalyticsFinanceParamsDto(
            DefaultHourlyRate, DefaultRevenueMultiplier, DefaultQuotedRatio);
        var toDate = ParseDate(to) ?? DateTime.UtcNow.Date;
        var fromDate = ParseDate(from) ?? toDate.AddDays(-30);
        if (fromDate > toDate) (fromDate, toDate) = (toDate, fromDate);

        var fromUtc = DateTime.SpecifyKind(fromDate, DateTimeKind.Utc);
        var toUtc = DateTime.SpecifyKind(toDate.AddDays(1).AddTicks(-1), DateTimeKind.Utc);

        var filters = new TimeAnalyticsFiltersDto(
            fromDate.ToString("yyyy-MM-dd"),
            toDate.ToString("yyyy-MM-dd"),
            customerId ?? "",
            productId ?? "",
            projectId ?? "");

        // ── Scope projects / assets ─────────────────────────────────────────
        var projectQuery = _db.Projects.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(customerId))
            projectQuery = projectQuery.Where(p => p.CustomerId == customerId);
        if (!string.IsNullOrWhiteSpace(projectId))
            projectQuery = projectQuery.Where(p => p.Id == projectId);

        var projects = await projectQuery
            .Select(p => new ProjectSlice(
                p.Id,
                p.CustomerId,
                p.CustomerName,
                p.JobNumber,
                p.Description,
                p.FinishDate,
                p.Status,
                p.Office,
                p.Region))
            .ToListAsync(ct);

        var projectIds = projects.Select(p => p.Id).ToHashSet();
        if (projectIds.Count == 0)
            return EmptySnapshot(filters, fromDate, toDate, financeParams);

        var assetQuery = _db.ProjectAssets.AsNoTracking()
            .Where(a => !a.IsDeleted && projectIds.Contains(a.ProjectId));
        if (!string.IsNullOrWhiteSpace(productId))
            assetQuery = assetQuery.Where(a => a.ProductId == productId);

        var assets = await assetQuery
            .Select(a => new AssetSlice(
                a.Id,
                a.ProjectId,
                a.ProductId,
                a.AssetTag,
                a.AssetName,
                a.AssetModel,
                a.Status,
                a.InstalledAt))
            .ToListAsync(ct);

        if (assets.Count == 0)
            return EmptySnapshot(filters, fromDate, toDate, financeParams);

        var assetIds = assets.Select(a => a.Id).ToHashSet();
        var assetById = assets.ToDictionary(a => a.Id);

        // Runs with activity overlapping the requested window.
        var runs = await _db.AssetWorkflowRuns.AsNoTracking()
            .Where(r => assetIds.Contains(r.AssetId))
            .Where(r => r.StartedAt <= toUtc && (r.CompletedAt == null || r.CompletedAt >= fromUtc))
            .Select(r => new RunSlice(
                r.Id,
                r.AssetId,
                r.TechnicianUserId,
                r.CompletedByName,
                r.ProductiveSeconds,
                r.DowntimeSeconds,
                r.TimeTrackingJson,
                r.IssuesJson,
                r.Status,
                r.StartedAt,
                r.CompletedAt))
            .ToListAsync(ct);

        var productIds = assets.Select(a => a.ProductId).Distinct().ToList();
        var products = await _db.Products.AsNoTracking()
            .Where(p => productIds.Contains(p.Id))
            .Select(p => new ProductSlice(p.Id, p.Name, p.Description, p.DivisionId))
            .ToListAsync(ct);
        var productById = products.ToDictionary(p => p.Id);

        var divisionIds = products.Where(p => p.DivisionId != null).Select(p => p.DivisionId!).Distinct().ToList();
        var divisions = divisionIds.Count == 0
            ? new Dictionary<string, string>()
            : await _db.Divisions.AsNoTracking()
                .Where(d => divisionIds.Contains(d.Id))
                .ToDictionaryAsync(d => d.Id, d => d.Name, ct);

        var customerIds = projects.Select(p => p.CustomerId).Distinct().ToList();
        var customers = await _db.Customers.AsNoTracking()
            .Where(c => customerIds.Contains(c.CustomerId) || customerIds.Contains(c.Id))
            .Select(c => new CustomerSlice(c.Id, c.CustomerId, c.Name, c.Industry, c.Office))
            .ToListAsync(ct);
        var customerByBizId = customers
            .GroupBy(c => c.CustomerId)
            .ToDictionary(g => g.Key, g => g.First());

        var userIds = runs
            .Select(r => r.TechnicianUserId)
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct()
            .ToList();
        var users = userIds.Count == 0
            ? new Dictionary<string, UserSlice>()
            : await _db.Users.AsNoTracking()
                .Where(u => userIds.Contains(u.Id))
                .Select(u => new UserSlice(u.Id, u.FullName, u.Role, u.Office))
                .ToDictionaryAsync(u => u.Id, ct);

        // ── Aggregations ────────────────────────────────────────────────────
        var todayUtc = DateTime.UtcNow.Date;
        var completedToday = runs.Count(r =>
            r.CompletedAt.HasValue
            && r.Status.Equals("Complete", StringComparison.OrdinalIgnoreCase)
            && r.CompletedAt.Value.Date == todayUtc);

        var totalProdSec = runs.Sum(r => r.ProductiveSeconds);
        var totalDownSec = runs.Sum(r => r.DowntimeSeconds);
        var productiveHours = Math.Round(totalProdSec / 3600.0, 1);
        var downtimeHours = Math.Round(totalDownSec / 3600.0, 1);
        var productivityPct = totalProdSec + totalDownSec > 0
            ? Math.Round(totalProdSec * 100.0 / (totalProdSec + totalDownSec), 1)
            : 0;

        var installDurations = runs
            .Where(r => r.CompletedAt.HasValue)
            .Select(r => (r.CompletedAt!.Value - r.StartedAt).TotalMinutes)
            .Where(m => m > 0 && m < 24 * 60)
            .ToList();
        var avgInstallMinutes = installDurations.Count > 0
            ? (int)Math.Round(installDurations.Average())
            : 0;

        var installerRows = BuildInstallers(runs, users, assetById, projects);
        var fastestName = installerRows
            .OrderBy(i => i.AvgInstallMinutes)
            .FirstOrDefault()?.Name ?? "—";

        var projectRows = BuildProjects(projects, assets, runs);
        var assetRows = BuildAssetTypes(assets, runs);
        var productRows = BuildProducts(products, divisions, assets, runs, fromUtc, toUtc);
        var customerRows = BuildCustomers(projects, assets, runs, customerByBizId);

        var downtime = BuildDowntime(runs, fromDate, toDate);
        var finance = BuildFinance(installerRows, projectRows, runs, financeParams);
        var rangeDays = Math.Max(1, (toDate - fromDate).Days + 1);
        var forecast = BuildForecast(projectRows, runs, toDate, rangeDays);
        var benchmarks = BuildBenchmarks(assetRows);
        var activity = BuildActivity(runs, users, assetById, projects);
        var timeline = BuildTimeline(runs, users, toDate);
        var heatmap = BuildHeatmap(runs);
        var qualitySpeed = BuildQualitySpeed(installerRows);
        var productTrend = BuildProductTrend(runs, assets, productById, fromUtc, toUtc);
        var burndown = BuildBurndown(projectRows, assets, runs, toDate);
        var throughputDaily = BuildThroughputDaily(runs, fromDate, toDate);

        var assetsRemaining = assets.Count(a => !IsDoneAsset(a.Status));
        var projectsActive = projectRows.Count(p =>
            !p.Status.Equals("Completed", StringComparison.OrdinalIgnoreCase)
            && !p.Status.Equals("Closed", StringComparison.OrdinalIgnoreCase));

        var kpis = new TimeAnalyticsKpiDto(
            ActiveInstallers: installerRows.Count,
            CompletedToday: completedToday,
            ProductiveHours: productiveHours,
            DowntimeHours: downtimeHours,
            ProductivityPct: productivityPct,
            AvgInstallMinutes: avgInstallMinutes,
            FastestInstallerName: fastestName,
            ProjectsActive: projectsActive,
            AssetsRemaining: assetsRemaining,
            Revenue: finance.Revenue,
            LabourCost: finance.LabourCost);

        return new TimeAnalyticsSnapshotDto(
            GeneratedAt: DateTime.UtcNow.ToString("o"),
            Range: new TimeAnalyticsRangeDto(fromDate.ToString("yyyy-MM-dd"), toDate.ToString("yyyy-MM-dd")),
            Filters: filters,
            Kpis: kpis,
            Installers: installerRows,
            Projects: projectRows,
            Assets: assetRows,
            Products: productRows,
            Customers: customerRows,
            Downtime: downtime,
            Finance: finance,
            Forecast: forecast,
            Benchmarks: benchmarks,
            Activity: activity,
            InstallerTimeline: timeline,
            Heatmap: heatmap,
            QualitySpeed: qualitySpeed,
            ProductTrend: productTrend,
            Burndown: burndown,
            ThroughputDaily: throughputDaily);
    }

    // ── Builders ────────────────────────────────────────────────────────────

    private static List<TimeAnalyticsInstallerDto> BuildInstallers(
        List<RunSlice> runs,
        Dictionary<string, UserSlice> users,
        Dictionary<string, AssetSlice> assetById,
        List<ProjectSlice> projects)
    {
        var projectById = projects.ToDictionary(p => p.Id);
        var groups = runs.GroupBy(r => r.TechnicianUserId ?? r.CompletedByName ?? "unknown");

        return groups.Select(g =>
        {
            var first = g.First();
            UserSlice? user = null;
            if (!string.IsNullOrWhiteSpace(first.TechnicianUserId))
                users.TryGetValue(first.TechnicianUserId, out user);

            var name = user?.FullName ?? first.CompletedByName ?? "Unknown";
            var id = first.TechnicianUserId ?? SlugId(name);
            var prodSec = g.Sum(r => r.ProductiveSeconds);
            var downSec = g.Sum(r => r.DowntimeSeconds);
            var prodH = Math.Round(prodSec / 3600.0, 1);
            var downH = Math.Round(downSec / 3600.0, 1);
            var pct = prodSec + downSec > 0 ? Math.Round(prodSec * 100.0 / (prodSec + downSec), 1) : 0;

            var durations = g.Where(r => r.CompletedAt.HasValue)
                .Select(r => (r.CompletedAt!.Value - r.StartedAt).TotalMinutes)
                .Where(m => m > 0 && m < 24 * 60)
                .ToList();
            var avgMin = durations.Count > 0 ? (int)Math.Round(durations.Average()) : 0;
            var completions = g.Count(r => r.Status.Equals("Complete", StringComparison.OrdinalIgnoreCase));
            var defects = g.Sum(CountIssues);

            var team = "Field";
            var region = user?.Office ?? "—";
            if (g.Select(r => assetById.GetValueOrDefault(r.AssetId)?.ProjectId)
                .Where(pid => pid != null)
                .Select(pid => projectById.GetValueOrDefault(pid!))
                .FirstOrDefault(p => p != null) is { } proj)
            {
                team = string.IsNullOrWhiteSpace(proj.Region) ? proj.Office : proj.Region!;
                region = proj.Office;
            }

            return new TimeAnalyticsInstallerDto(
                id, name, user?.Role ?? "Installer", team, region,
                ColorFor(id), Initials(name),
                prodH, downH, pct, avgMin, completions, defects);
        })
        .OrderByDescending(i => i.ProductivityPct)
        .ToList();
    }

    private static List<TimeAnalyticsProjectDto> BuildProjects(
        List<ProjectSlice> projects,
        List<AssetSlice> assets,
        List<RunSlice> runs)
    {
        var assetsByProject = assets.GroupBy(a => a.ProjectId).ToDictionary(g => g.Key, g => g.ToList());
        var runsByProject = runs
            .Where(r => assetsByProject.Values.Any(list => list.Any(a => a.Id == r.AssetId)))
            .GroupBy(r => assets.First(a => a.Id == r.AssetId).ProjectId)
            .ToDictionary(g => g.Key, g => g.ToList());

        return projects.Select(p =>
        {
            var projAssets = assetsByProject.GetValueOrDefault(p.Id) ?? [];
            var total = projAssets.Count;
            var done = projAssets.Count(a => IsDoneAsset(a.Status));
            var pct = total > 0 ? done * 100.0 / total : 0;

            var projRuns = runsByProject.GetValueOrDefault(p.Id) ?? [];
            var prodH = Math.Round(projRuns.Sum(r => r.ProductiveSeconds) / 3600.0, 1);
            var downH = Math.Round(projRuns.Sum(r => r.DowntimeSeconds) / 3600.0, 1);

            var (status, health) = MapProjectHealth(p.Status, pct);
            var label = !string.IsNullOrWhiteSpace(p.JobNumber) ? p.JobNumber
                : !string.IsNullOrWhiteSpace(p.Description) ? p.Description
                : p.Id;

            return new TimeAnalyticsProjectDto(
                p.Id, label, p.CustomerId, p.CustomerName,
                status, health, p.FinishDate ?? "—",
                total, done, prodH, downH);
        })
        .OrderByDescending(p => p.DoneAssets)
        .ToList();
    }

    private static List<TimeAnalyticsAssetTypeDto> BuildAssetTypes(
        List<AssetSlice> assets,
        List<RunSlice> runs)
    {
        var durationsByAsset = runs
            .Where(r => r.CompletedAt.HasValue)
            .GroupBy(r => r.AssetId)
            .ToDictionary(
                g => g.Key,
                g => g.Select(r => (r.CompletedAt!.Value - r.StartedAt).TotalMinutes)
                    .Where(m => m > 0 && m < 24 * 60)
                    .DefaultIfEmpty(0)
                    .Average());

        return assets
            .GroupBy(a => (Type: a.AssetName ?? a.AssetTag, Model: a.AssetModel ?? a.AssetTag))
            .Select(g =>
            {
                var mins = g
                    .Select(a => durationsByAsset.GetValueOrDefault(a.Id))
                    .Where(m => m > 0)
                    .ToList();
                if (mins.Count == 0) mins = [0];

                var avg = mins.Average();
                var min = mins.Min();
                var max = mins.Max();
                var std = mins.Count > 1 ? StdDev(mins) : 0;
                var globalAvg = durationsByAsset.Values.Where(v => v > 0).DefaultIfEmpty(avg).Average();
                var difficulty = globalAvg > 0 ? Math.Round((avg - globalAvg) / globalAvg * 100, 1) : 0;

                return new TimeAnalyticsAssetTypeDto(
                    g.Key.Type,
                    g.Key.Model,
                    (int)Math.Round(avg),
                    (int)Math.Round(min),
                    (int)Math.Round(max),
                    Math.Round(std, 1),
                    g.Count(),
                    difficulty);
            })
            .OrderByDescending(a => a.AvgMinutes)
            .ToList();
    }

    private static List<TimeAnalyticsProductDto> BuildProducts(
        List<ProductSlice> products,
        Dictionary<string, string> divisions,
        List<AssetSlice> assets,
        List<RunSlice> runs,
        DateTime fromUtc,
        DateTime toUtc)
    {
        var mid = fromUtc.AddTicks((toUtc - fromUtc).Ticks / 2);

        return products.Select(p =>
        {
            var productAssetIds = assets.Where(a => a.ProductId == p.Id).Select(a => a.Id).ToHashSet();
            var productRuns = runs.Where(r => productAssetIds.Contains(r.AssetId)).ToList();

            var durations = productRuns
                .Where(r => r.CompletedAt.HasValue)
                .Select(r => (r.CompletedAt!.Value - r.StartedAt).TotalMinutes)
                .Where(m => m > 0 && m < 24 * 60)
                .ToList();

            var early = productRuns.Where(r => r.StartedAt < mid).ToList();
            var late = productRuns.Where(r => r.StartedAt >= mid).ToList();
            double EarlyAvg() => early.Where(r => r.CompletedAt.HasValue)
                .Select(r => (r.CompletedAt!.Value - r.StartedAt).TotalMinutes)
                .Where(m => m > 0 && m < 24 * 60).DefaultIfEmpty(0).Average();
            double LateAvg() => late.Where(r => r.CompletedAt.HasValue)
                .Select(r => (r.CompletedAt!.Value - r.StartedAt).TotalMinutes)
                .Where(m => m > 0 && m < 24 * 60).DefaultIfEmpty(0).Average();

            var earlyAvg = EarlyAvg();
            var lateAvg = LateAvg();
            var trend = earlyAvg > 0 ? Math.Round((lateAvg - earlyAvg) / earlyAvg * 100, 1) : 0;

            var completions = productRuns.Count(r => r.Status.Equals("Complete", StringComparison.OrdinalIgnoreCase));
            var defects = productRuns.Sum(CountIssues);
            var defectRate = completions > 0 ? Math.Round(defects * 100.0 / completions, 1) : 0;

            var family = p.DivisionId != null && divisions.TryGetValue(p.DivisionId, out var div) ? div : "General";

            return new TimeAnalyticsProductDto(
                p.Id, p.Name, family, "—",
                durations.Count > 0 ? (int)Math.Round(durations.Average()) : 0,
                completions, trend, defectRate);
        })
        .OrderByDescending(p => p.Installs)
        .ToList();
    }

    private static List<TimeAnalyticsCustomerDto> BuildCustomers(
        List<ProjectSlice> projects,
        List<AssetSlice> assets,
        List<RunSlice> runs,
        Dictionary<string, CustomerSlice> customerByBizId)
    {
        return projects
            .GroupBy(p => p.CustomerId)
            .Select(g =>
            {
                var custProjects = g.ToList();
                var projectIds = custProjects.Select(p => p.Id).ToHashSet();
                var custAssets = assets.Where(a => projectIds.Contains(a.ProjectId)).ToList();
                var custAssetIds = custAssets.Select(a => a.Id).ToHashSet();
                var custRuns = runs.Where(r => custAssetIds.Contains(r.AssetId)).ToList();

                var prodSec = custRuns.Sum(r => r.ProductiveSeconds);
                var downSec = custRuns.Sum(r => r.DowntimeSeconds);
                var prodH = Math.Round(prodSec / 3600.0, 1);
                var downH = Math.Round(downSec / 3600.0, 1);
                var pct = prodSec + downSec > 0 ? Math.Round(prodSec * 100.0 / (prodSec + downSec), 1) : 0;

                var durations = custRuns
                    .Where(r => r.CompletedAt.HasValue)
                    .Select(r => (r.CompletedAt!.Value - r.StartedAt).TotalMinutes)
                    .Where(m => m > 0 && m < 24 * 60)
                    .ToList();

                var first = custProjects[0];
                customerByBizId.TryGetValue(first.CustomerId, out var cust);
                var name = cust?.Name ?? first.CustomerName;
                var id = first.CustomerId;

                return new TimeAnalyticsCustomerDto(
                    id, name,
                    cust?.Industry ?? "—",
                    ExtractCountry(cust?.Office ?? first.Office),
                    custProjects.Count,
                    custAssets.Count,
                    custAssets.Count(a => IsDoneAsset(a.Status)),
                    prodH, downH, pct,
                    durations.Count > 0 ? (int)Math.Round(durations.Average()) : 0);
            })
            .OrderByDescending(c => c.TotalAssets)
            .ToList();
    }

    private static TimeAnalyticsDowntimeDto BuildDowntime(
        List<RunSlice> runs,
        DateTime fromDate,
        DateTime toDate)
    {
        var reasonMap = new Dictionary<string, (int Count, int TotalMin)>(StringComparer.OrdinalIgnoreCase);
        var monthly = new Dictionary<string, (double Prod, double Down)>();
        var daily = new Dictionary<DateTime, (double Prod, double Down)>();

        for (var d = fromDate.Date; d <= toDate.Date; d = d.AddDays(1))
            daily[d] = (0, 0);

        foreach (var run in runs)
        {
            var monthKey = run.StartedAt.ToString("MMM yyyy", CultureInfo.InvariantCulture);
            if (!monthly.ContainsKey(monthKey)) monthly[monthKey] = (0, 0);
            var m = monthly[monthKey];
            m.Prod += run.ProductiveSeconds / 3600.0;
            m.Down += run.DowntimeSeconds / 3600.0;
            monthly[monthKey] = m;

            var day = run.StartedAt.Date;
            if (daily.ContainsKey(day))
            {
                var dd = daily[day];
                dd.Prod += run.ProductiveSeconds / 3600.0;
                dd.Down += run.DowntimeSeconds / 3600.0;
                daily[day] = dd;
            }

            foreach (var entry in ParseTimeEntries(run.TimeTrackingJson))
            {
                if (!entry.Category.Equals("downtime", StringComparison.OrdinalIgnoreCase)) continue;
                var reason = string.IsNullOrWhiteSpace(entry.Reason) ? "Unspecified" : entry.Reason!.Trim();
                var mins = EntryMinutes(entry, run);
                if (!reasonMap.ContainsKey(reason)) reasonMap[reason] = (0, 0);
                var cur = reasonMap[reason];
                reasonMap[reason] = (cur.Count + 1, cur.TotalMin + mins);
            }
        }

        // Fallback: if no parsed downtime entries, bucket by run-level downtime seconds.
        if (reasonMap.Count == 0 && runs.Sum(r => r.DowntimeSeconds) > 0)
        {
            reasonMap["Recorded downtime"] = (
                runs.Count(r => r.DowntimeSeconds > 0),
                runs.Sum(r => r.DowntimeSeconds) / 60);
        }

        var reasons = reasonMap
            .Select(kv => new TimeAnalyticsDowntimeReasonDto(
                kv.Key,
                kv.Value.Count,
                kv.Value.Count > 0 ? kv.Value.TotalMin / kv.Value.Count : 0,
                kv.Value.TotalMin))
            .OrderByDescending(r => r.TotalMinutes)
            .Take(12)
            .ToList();

        var trendMonthly = monthly
            .OrderBy(kv => DateTime.ParseExact(kv.Key, "MMM yyyy", CultureInfo.InvariantCulture))
            .Select(kv => new TimeAnalyticsMonthlyTrendDto(
                kv.Key,
                Math.Round(kv.Value.Prod, 1),
                Math.Round(kv.Value.Down, 1)))
            .ToList();

        var trendDaily = daily
            .OrderBy(kv => kv.Key)
            .Select(kv => new TimeAnalyticsDailyTrendDto(
                kv.Key.ToString("yyyy-MM-dd"),
                Math.Round(kv.Value.Prod, 1),
                Math.Round(kv.Value.Down, 1)))
            .ToList();

        return new TimeAnalyticsDowntimeDto(reasons, trendMonthly, trendDaily);
    }

    private static TimeAnalyticsFinanceDto BuildFinance(
        List<TimeAnalyticsInstallerDto> installers,
        List<TimeAnalyticsProjectDto> projects,
        List<RunSlice> runs,
        TimeAnalyticsFinanceParamsDto financeParams)
    {
        var hourlyRate = financeParams.HourlyRate;
        var revenueMultiplier = financeParams.RevenueMultiplier;
        var quotedRatio = financeParams.QuotedRatio;

        var labour = Math.Round(installers.Sum(i => i.ProductiveHours + i.DowntimeHours) * hourlyRate, 0);
        var revenue = Math.Round(labour * revenueMultiplier, 0);
        var marginPct = revenue > 0
            ? Math.Round((revenue - labour) * 100.0 / revenue, 1)
            : 0;

        var billableHours = runs.Sum(r => r.ProductiveSeconds) / 3600.0;
        var totalHours = runs.Sum(r => r.ProductiveSeconds + r.DowntimeSeconds) / 3600.0;
        var billablePct = totalHours > 0 ? Math.Round(billableHours * 100.0 / totalHours, 1) : 0;

        var byInstaller = installers
            .OrderByDescending(i => i.ProductiveHours + i.DowntimeHours)
            .Take(12)
            .Select(i => new TimeAnalyticsFinanceInstallerDto(
                i.Id, i.Name,
                Math.Round((i.ProductiveHours + i.DowntimeHours) * hourlyRate, 0)))
            .ToList();

        var byProject = projects
            .OrderByDescending(p => p.ProductiveHours + p.DowntimeHours)
            .Take(12)
            .Select(p =>
            {
                var actual = p.ProductiveHours + p.DowntimeHours;
                var quoted = actual > 0 ? Math.Round(actual * quotedRatio, 1) : 0;
                return new TimeAnalyticsFinanceProjectDto(p.Id, p.Name, quoted, actual);
            })
            .ToList();

        return new TimeAnalyticsFinanceDto(
            Revenue: revenue,
            LabourCost: labour,
            MarginPct: marginPct,
            BillablePct: billablePct,
            Params: financeParams,
            ByInstaller: byInstaller,
            ByProject: byProject);
    }

    private static TimeAnalyticsForecastDto BuildForecast(
        List<TimeAnalyticsProjectDto> projects,
        List<RunSlice> runs,
        DateTime toDate,
        int rangeDays)
    {
        var remainingAssets = projects.Sum(p => p.TotalAssets - p.DoneAssets);
        var avgHoursPerAsset = runs.Count > 0
            ? runs.Average(r => Math.Max(r.ProductiveSeconds + r.DowntimeSeconds, 1) / 3600.0)
            : 2.5;
        var remainingHours = Math.Round(remainingAssets * avgHoursPerAsset, 0);

        var dailyThroughput = runs.Count(r =>
                r.Status.Equals("Complete", StringComparison.OrdinalIgnoreCase)
                && r.CompletedAt.HasValue)
            / (double)rangeDays;
        if (dailyThroughput < 0.5) dailyThroughput = 0.5;
        var weeksToFinish = remainingAssets / (dailyThroughput * 7);
        if (double.IsNaN(weeksToFinish) || double.IsInfinity(weeksToFinish)) weeksToFinish = 12;
        weeksToFinish = Math.Clamp(weeksToFinish, 1, 52);

        var estDate = toDate.AddDays((int)Math.Ceiling(weeksToFinish * 7));
        var risk = weeksToFinish > 16 ? "high" : weeksToFinish > 8 ? "medium" : "low";
        var crews = Math.Max(1, (int)Math.Ceiling(remainingHours / (40 * Math.Max(weeksToFinish, 1))));

        var completion = Enumerable.Range(0, 8)
            .Select(i =>
            {
                var week = toDate.AddDays(i * 7).ToString("MMM d");
                var mid = projects.Sum(p => p.DoneAssets) + dailyThroughput * 7 * (i + 1);
                return new TimeAnalyticsForecastWeekDto(
                    week,
                    mid * 0.85,
                    mid,
                    mid * 1.15);
            })
            .ToList();

        var history = Enumerable.Range(0, 6)
            .Select(i =>
            {
                var q = toDate.AddMonths(-5 + i);
                var label = $"Q{(q.Month - 1) / 3 + 1} {q.Year}";
                var actual = runs.Count(r =>
                    r.CompletedAt.HasValue
                    && r.CompletedAt.Value.Month == q.Month
                    && r.CompletedAt.Value.Year == q.Year);
                return new TimeAnalyticsForecastHistoryDto(label, actual, actual);
            })
            .ToList();

        return new TimeAnalyticsForecastDto(
            remainingHours,
            estDate.ToString("yyyy-MM-dd"),
            risk,
            crews,
            80,
            completion,
            history);
    }

    private static List<TimeAnalyticsBenchmarkDto> BuildBenchmarks(List<TimeAnalyticsAssetTypeDto> assets)
    {
        if (assets.Count == 0) return [];

        var globalAvg = assets.Average(a => a.AvgMinutes);
        return assets
            .Take(10)
            .Select(a =>
            {
                var expected = (int)Math.Round(globalAvg);
                var confidence = a.Installs >= 10 ? 92 : a.Installs >= 5 ? 85 : 75;
                return new TimeAnalyticsBenchmarkDto(a.Type, expected, a.AvgMinutes, confidence);
            })
            .ToList();
    }

    private static List<TimeAnalyticsActivityDto> BuildActivity(
        List<RunSlice> runs,
        Dictionary<string, UserSlice> users,
        Dictionary<string, AssetSlice> assetById,
        List<ProjectSlice> projects)
    {
        var projectById = projects.ToDictionary(p => p.Id);
        var events = new List<TimeAnalyticsActivityDto>();

        foreach (var run in runs
            .Where(r => r.CompletedAt.HasValue)
            .OrderByDescending(r => r.CompletedAt)
            .Take(15))
        {
            if (!assetById.TryGetValue(run.AssetId, out var asset)) continue;
            var proj = projectById.GetValueOrDefault(asset.ProjectId);
            var tech = run.TechnicianUserId != null && users.TryGetValue(run.TechnicianUserId, out var u)
                ? u.FullName
                : run.CompletedByName ?? "Installer";
            var tag = asset.AssetTag;
            var type = run.Status.Equals("Complete", StringComparison.OrdinalIgnoreCase) ? "good" : "warn";
            events.Add(new TimeAnalyticsActivityDto(
                type,
                $"<b>{tech}</b> completed workflow on <b>{tag}</b>{(proj != null ? $" · {proj.JobNumber}" : "")}",
                run.CompletedAt!.Value.ToString("o")));
        }

        foreach (var run in runs.OrderByDescending(r => r.StartedAt).Take(10))
        {
            var issues = CountIssues(run);
            if (issues == 0) continue;
            if (!assetById.TryGetValue(run.AssetId, out var asset)) continue;
            events.Add(new TimeAnalyticsActivityDto(
                "warn",
                $"<b>{issues}</b> issue(s) flagged on <b>{asset.AssetTag}</b>",
                run.StartedAt.ToString("o")));
        }

        return events
            .OrderByDescending(e => e.Timestamp)
            .Take(12)
            .ToList();
    }

    private static List<TimeAnalyticsTimelineDto> BuildTimeline(
        List<RunSlice> runs,
        Dictionary<string, UserSlice> users,
        DateTime focusDate)
    {
        var day = focusDate.Date;
        var dayRuns = runs.Where(r =>
            r.StartedAt.Date == day || (r.CompletedAt?.Date == day)).ToList();
        var groups = dayRuns.GroupBy(r => r.TechnicianUserId ?? r.CompletedByName ?? "unknown").Take(8);

        return groups.Select(g =>
        {
            var first = g.First();
            users.TryGetValue(first.TechnicianUserId ?? "", out var user);
            var name = user?.FullName ?? first.CompletedByName ?? "Unknown";
            var id = first.TechnicianUserId ?? SlugId(name);

            var segments = new List<TimeAnalyticsTimelineSegmentDto>();
            foreach (var run in g)
            {
                foreach (var entry in ParseTimeEntries(run.TimeTrackingJson))
                {
                    if (entry.StartedAtUtc.Date != day) continue;
                    var start = entry.StartedAtUtc.TimeOfDay.TotalHours;
                    var end = (entry.EndedAtUtc ?? run.CompletedAt ?? DateTime.UtcNow).TimeOfDay.TotalHours;
                    if (end <= start) end = start + 0.25;
                    var kind = entry.Category.Equals("downtime", StringComparison.OrdinalIgnoreCase) ? "down" : "prod";
                    segments.Add(new TimeAnalyticsTimelineSegmentDto(
                        start, end, kind,
                        kind == "down" ? (entry.Reason ?? "Downtime") : "Install"));
                }

                // Fallback single productive block from run bounds.
                if (segments.Count == 0 && run.StartedAt.Date == day)
                {
                    var end = (run.CompletedAt ?? DateTime.UtcNow).TimeOfDay.TotalHours;
                    segments.Add(new TimeAnalyticsTimelineSegmentDto(
                        run.StartedAt.TimeOfDay.TotalHours,
                        Math.Max(end, run.StartedAt.TimeOfDay.TotalHours + 0.5),
                        "prod", "Install"));
                }
            }

            return new TimeAnalyticsTimelineDto(
                id, name, Initials(name), ColorFor(id),
                user?.Office ?? "Field", segments);
        }).ToList();
    }

    private static List<TimeAnalyticsHeatmapDto> BuildHeatmap(List<RunSlice> runs)
    {
        var days = new[] { "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" };
        var grid = new double[7, 24];

        foreach (var run in runs)
        {
            foreach (var entry in ParseTimeEntries(run.TimeTrackingJson))
            {
                if (!entry.Category.Equals("productive", StringComparison.OrdinalIgnoreCase)) continue;
                var mins = EntryMinutes(entry, run);
                if (mins <= 0) continue;
                var dow = (int)entry.StartedAtUtc.DayOfWeek;
                var hour = entry.StartedAtUtc.Hour;
                grid[dow, hour] += mins;
            }
        }

        var max = 1.0;
        for (var d = 0; d < 7; d++)
        for (var h = 0; h < 24; h++)
            if (grid[d, h] > max) max = grid[d, h];

        var cells = new List<TimeAnalyticsHeatmapDto>();
        for (var d = 1; d <= 5; d++) // Mon–Fri display
        {
            var dayIndex = d % 7;
            for (var h = 6; h <= 18; h++)
            {
                cells.Add(new TimeAnalyticsHeatmapDto(
                    days[dayIndex],
                    h,
                    Math.Round(grid[dayIndex, h] / max, 2)));
            }
        }
        return cells;
    }

    private static List<TimeAnalyticsQualitySpeedDto> BuildQualitySpeed(
        List<TimeAnalyticsInstallerDto> installers) =>
        installers
            .Select(i => new TimeAnalyticsQualitySpeedDto(
                i.Id, i.Name, i.Color, i.AvgInstallMinutes, i.Defects))
            .ToList();

    private static List<TimeAnalyticsProductTrendDto> BuildProductTrend(
        List<RunSlice> runs,
        List<AssetSlice> assets,
        Dictionary<string, ProductSlice> productById,
        DateTime fromUtc,
        DateTime toUtc)
    {
        var topProducts = productById.Values.Take(4).ToList();
        if (topProducts.Count == 0) return [];

        var months = new List<DateTime>();
        var cursor = new DateTime(fromUtc.Year, fromUtc.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        while (cursor <= toUtc)
        {
            months.Add(cursor);
            cursor = cursor.AddMonths(1);
        }
        if (months.Count == 0) months.Add(fromUtc);

        return months.Select(m =>
        {
            var series = new Dictionary<string, double>();
            foreach (var product in topProducts)
            {
                var assetIds = assets.Where(a => a.ProductId == product.Id).Select(a => a.Id).ToHashSet();
                var monthRuns = runs.Where(r =>
                    assetIds.Contains(r.AssetId)
                    && r.StartedAt.Year == m.Year
                    && r.StartedAt.Month == m.Month
                    && r.CompletedAt.HasValue).ToList();

                var avg = monthRuns.Count > 0
                    ? monthRuns.Average(r => (r.CompletedAt!.Value - r.StartedAt).TotalMinutes)
                    : 0;
                series[product.Name] = Math.Round(avg, 0);
            }
            return new TimeAnalyticsProductTrendDto(m.ToString("MMM"), series);
        }).ToList();
    }

    private static List<TimeAnalyticsBurndownDto> BuildBurndown(
        List<TimeAnalyticsProjectDto> projects,
        List<AssetSlice> assets,
        List<RunSlice> runs,
        DateTime toDate)
    {
        var focus = projects.OrderByDescending(p => p.TotalAssets - p.DoneAssets).FirstOrDefault();
        if (focus == null) return [];

        var focusAssets = assets.Where(a => a.ProjectId == focus.Id).Select(a => a.Id).ToHashSet();
        var total = focus.TotalAssets;
        var weeks = 12;
        var idealStep = total / (double)weeks;

        var completionsByWeek = runs
            .Where(r => focusAssets.Contains(r.AssetId) && r.CompletedAt.HasValue)
            .GroupBy(r => WeekStart(r.CompletedAt!.Value))
            .ToDictionary(g => g.Key, g => g.Count());

        var remaining = total;
        var list = new List<TimeAnalyticsBurndownDto>();
        for (var i = 0; i < weeks; i++)
        {
            var weekStart = WeekStart(toDate.AddDays(-7 * (weeks - 1 - i)));
            if (completionsByWeek.TryGetValue(weekStart, out var done)) remaining -= done;
            remaining = Math.Max(0, remaining);
            list.Add(new TimeAnalyticsBurndownDto(
                weekStart.ToString("MMM d"),
                (int)Math.Round(total - idealStep * (i + 1)),
                remaining));
        }
        return list;
    }

    private static List<TimeAnalyticsThroughputDayDto> BuildThroughputDaily(
        List<RunSlice> runs,
        DateTime fromDate,
        DateTime toDate)
    {
        var completionsByDay = runs
            .Where(r =>
                r.Status.Equals("Complete", StringComparison.OrdinalIgnoreCase)
                && r.CompletedAt.HasValue)
            .GroupBy(r => r.CompletedAt!.Value.Date)
            .ToDictionary(g => g.Key, g => g.Count());

        var list = new List<TimeAnalyticsThroughputDayDto>();
        for (var d = fromDate.Date; d <= toDate.Date; d = d.AddDays(1))
        {
            list.Add(new TimeAnalyticsThroughputDayDto(
                d.ToString("yyyy-MM-dd"),
                completionsByDay.GetValueOrDefault(d)));
        }

        return list;
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private static TimeAnalyticsSnapshotDto EmptySnapshot(
        TimeAnalyticsFiltersDto filters,
        DateTime fromDate,
        DateTime toDate,
        TimeAnalyticsFinanceParamsDto financeParams) =>
        new(
            DateTime.UtcNow.ToString("o"),
            new TimeAnalyticsRangeDto(fromDate.ToString("yyyy-MM-dd"), toDate.ToString("yyyy-MM-dd")),
            filters,
            new TimeAnalyticsKpiDto(0, 0, 0, 0, 0, 0, "—", 0, 0, 0, 0),
            [], [], [], [], [],
            new TimeAnalyticsDowntimeDto([], [], []),
            new TimeAnalyticsFinanceDto(0, 0, 0, 0, financeParams, [], []),
            new TimeAnalyticsForecastDto(0, toDate.ToString("yyyy-MM-dd"), "low", 0, 0, [], []),
            [], [], [], [], [], [], [], []);

    private static bool IsDoneAsset(string status) =>
        DoneAssetStatuses.Contains(status);

    private static (string Status, string Health) MapProjectHealth(string rawStatus, double pctComplete)
    {
        var s = rawStatus.Trim();
        if (s.Equals("Closed", StringComparison.OrdinalIgnoreCase)
            || s.Equals("Complete", StringComparison.OrdinalIgnoreCase)
            || s.Equals("Completed", StringComparison.OrdinalIgnoreCase))
            return ("Completed", "good");

        if (pctComplete >= 75) return ("On Track", "good");
        if (pctComplete >= 40) return ("At Risk", "warn");
        return ("Behind", "bad");
    }

    private static int CountIssues(RunSlice run)
    {
        try
        {
            var issues = JsonSerializer.Deserialize<List<JsonElement>>(run.IssuesJson, JsonOpts);
            return issues?.Count ?? 0;
        }
        catch { return 0; }
    }

    private static List<TimeEntrySlice> ParseTimeEntries(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<List<TimeEntrySlice>>(json, JsonOpts) ?? [];
        }
        catch { return []; }
    }

    private static int EntryMinutes(TimeEntrySlice entry, RunSlice run)
    {
        var end = entry.EndedAtUtc ?? run.CompletedAt ?? DateTime.UtcNow;
        var mins = (int)Math.Round((end - entry.StartedAtUtc).TotalMinutes);
        return Math.Max(0, mins);
    }

    private static DateTime? ParseDate(string? value) =>
        DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var d)
            ? d.Date : null;

    private static DateTime WeekStart(DateTime dt)
    {
        var diff = (7 + (dt.DayOfWeek - DayOfWeek.Monday)) % 7;
        return dt.Date.AddDays(-diff);
    }

    private static double StdDev(IEnumerable<double> values)
    {
        var list = values.ToList();
        if (list.Count < 2) return 0;
        var avg = list.Average();
        return Math.Sqrt(list.Sum(v => (v - avg) * (v - avg)) / (list.Count - 1));
    }

    private static string ColorFor(string id)
    {
        var hash = Math.Abs(id.GetHashCode());
        return AvatarColors[hash % AvatarColors.Length];
    }

    private static string Initials(string name)
    {
        var parts = name.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return string.Concat(parts.Take(2).Select(p => char.ToUpperInvariant(p[0])));
    }

    private static string SlugId(string name) =>
        "u-" + string.Concat(name.ToLowerInvariant().Where(char.IsLetterOrDigit)).Trim();

    private static string ExtractCountry(string office)
    {
        if (string.IsNullOrWhiteSpace(office)) return "—";
        var parts = office.Split(',', StringSplitOptions.TrimEntries);
        return parts.Length > 0 ? parts[^1] : office;
    }

    private sealed record ProjectSlice(
        string Id, string CustomerId, string CustomerName, string JobNumber,
        string Description, string? FinishDate, string Status, string Office, string? Region);

    private sealed record AssetSlice(
        string Id, string ProjectId, string ProductId, string AssetTag,
        string? AssetName, string? AssetModel, string Status, DateTime? InstalledAt);

    private sealed record RunSlice(
        string Id, string AssetId, string? TechnicianUserId, string? CompletedByName,
        int ProductiveSeconds, int DowntimeSeconds, string TimeTrackingJson,
        string IssuesJson, string Status, DateTime StartedAt, DateTime? CompletedAt);

    private sealed record ProductSlice(string Id, string Name, string? Description, string? DivisionId);
    private sealed record CustomerSlice(string Id, string CustomerId, string Name, string? Industry, string Office);
    private sealed record UserSlice(string Id, string FullName, string Role, string Office);

    private sealed class TimeEntrySlice
    {
        public string Category { get; set; } = "productive";
        public DateTime StartedAtUtc { get; set; }
        public DateTime? EndedAtUtc { get; set; }
        public string? Reason { get; set; }
    }
}
