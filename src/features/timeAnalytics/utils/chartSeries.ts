import type { TimeAnalyticsSnapshot } from "../types";

/** Inclusive day count between ISO date strings. */
export function rangeDayCount(from: string, to: string): number {
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return 31;
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

/** Prefer daily trend buckets when the selected window is ≤ 31 days. */
export function preferDailyTrend(data: TimeAnalyticsSnapshot): boolean {
  return rangeDayCount(data.range.from, data.range.to) <= 31;
}

export interface ProductiveDowntimeTrend {
  labels: string[];
  productive: number[];
  downtime: number[];
  granularity: "daily" | "monthly";
  subtitle: string;
}

/** Productive vs downtime series — daily for short ranges, monthly otherwise. */
export function productiveDowntimeTrend(data: TimeAnalyticsSnapshot): ProductiveDowntimeTrend {
  const daily = preferDailyTrend(data);
  const trendDaily = data.downtime.trendDaily ?? [];

  if (daily && trendDaily.length > 0) {
    return {
      labels: trendDaily.map(d => formatDailyLabel(d.date)),
      productive: trendDaily.map(d => d.productive),
      downtime: trendDaily.map(d => d.downtime),
      granularity: "daily",
      subtitle: "Daily aggregates from workflow time tracking",
    };
  }

  return {
    labels: data.downtime.trendMonthly.map(t => t.month),
    productive: data.downtime.trendMonthly.map(t => t.productive),
    downtime: data.downtime.trendMonthly.map(t => t.downtime),
    granularity: "monthly",
    subtitle: "Monthly aggregates from workflow time tracking",
  };
}

function formatDailyLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso.slice(5);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Stable deps for chart hooks — new snapshot or range triggers rebuild. */
export function chartDeps(data: TimeAnalyticsSnapshot, ...extra: unknown[]): unknown[] {
  return [data.generatedAt, data.range.from, data.range.to, ...extra];
}
