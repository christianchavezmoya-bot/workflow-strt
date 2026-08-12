import { describe, expect, it } from "vitest";
import type { TimeAnalyticsSnapshot } from "../types";
import { preferDailyTrend, productiveDowntimeTrend, rangeDayCount } from "./chartSeries";

function snap(overrides: Partial<TimeAnalyticsSnapshot> = {}): TimeAnalyticsSnapshot {
  return {
    generatedAt: "2026-01-01T00:00:00Z",
    range: { from: "2026-01-01", to: "2026-01-07" },
    filters: {},
    kpis: {
      activeInstallers: 0,
      completedToday: 0,
      productiveHours: 0,
      downtimeHours: 0,
      productivityPct: 0,
      avgInstallMinutes: 0,
      fastestInstallerName: "—",
      projectsActive: 0,
      assetsRemaining: 0,
      revenue: 0,
      labourCost: 0,
    },
    installers: [],
    projects: [],
    assets: [],
    products: [],
    customers: [],
    downtime: {
      reasons: [],
      trendMonthly: [{ month: "Jan 2026", productive: 10, downtime: 2 }],
      trendDaily: [
        { date: "2026-01-01", productive: 1, downtime: 0.5 },
        { date: "2026-01-02", productive: 2, downtime: 1 },
      ],
    },
    finance: {
      revenue: 0,
      labourCost: 0,
      marginPct: 0,
      billablePct: 0,
      params: { hourlyRate: 85, revenueMultiplier: 1.35, quotedRatio: 0.92 },
      byInstaller: [],
      byProject: [],
    },
    forecast: {
      remainingHours: 0,
      estimatedCompletion: "2026-01-01",
      riskLevel: "low",
      crewsNeeded: 0,
      confidencePct: 0,
      completion: [],
      history: [],
    },
    benchmarks: [],
    activity: [],
    installerTimeline: [],
    heatmap: [],
    qualitySpeed: [],
    productTrend: [],
    burndown: [],
    throughputDaily: [],
    ...overrides,
  };
}

describe("chartSeries", () => {
  it("counts inclusive days in a range", () => {
    expect(rangeDayCount("2026-01-01", "2026-01-01")).toBe(1);
    expect(rangeDayCount("2026-01-01", "2026-01-07")).toBe(7);
    expect(rangeDayCount("2026-01-01", "2026-01-31")).toBe(31);
  });

  it("prefers daily trend for windows ≤ 31 days", () => {
    expect(preferDailyTrend(snap())).toBe(true);
    expect(preferDailyTrend(snap({ range: { from: "2026-01-01", to: "2026-03-01" } }))).toBe(false);
  });

  it("returns daily series for short ranges when trendDaily is present", () => {
    const series = productiveDowntimeTrend(snap());
    expect(series.granularity).toBe("daily");
    expect(series.labels).toHaveLength(2);
    expect(series.productive).toEqual([1, 2]);
  });

  it("falls back to monthly series for long ranges", () => {
    const series = productiveDowntimeTrend(snap({
      range: { from: "2025-10-01", to: "2026-01-31" },
    }));
    expect(series.granularity).toBe("monthly");
    expect(series.labels).toEqual(["Jan 2026"]);
    expect(series.productive).toEqual([10]);
  });
});
