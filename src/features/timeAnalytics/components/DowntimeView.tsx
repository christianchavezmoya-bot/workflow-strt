import { useMemo, useRef } from "react";
import { Card, Kpi, ChartBox, MiniBar } from "./primitives";
import { useChart } from "./useChart";
import { pareto, doughnut, multiLine, dualAxisLine } from "./ChartTheme";
import type { TimeAnalyticsSnapshot } from "../types";

export function DowntimeView({ data }: { data: TimeAnalyticsSnapshot }) {
  const totalMin = data.downtime.reasons.reduce((a, b) => a + b.totalMinutes, 0);
  const occ = data.downtime.reasons.reduce((a, b) => a + b.occurrences, 0);
  const top = data.downtime.reasons[0];

  return (
    <>
      <div className="ta-grid cols-4">
        <Kpi label="Total Downtime" value={(totalMin / 60).toFixed(0)} unit="h" icon="◐" tone="warn" hint="this period" />
        <Kpi label="Total Incidents" value={occ} icon="!" tone="bad" hint="across all reasons" />
        <Kpi label="Top Reason" value={top?.reason.split(" ")[0] ?? "—"} icon="⌖" tone="violet" hint={`${top?.reason} — ${Math.round((top?.totalMinutes / totalMin) * 100)}% of total`} />
        <Kpi label="Avg Downtime" value={Math.round(totalMin / Math.max(1, occ))} unit="min" icon="⏲" hint="per incident" />
      </div>

      <div className="ta-grid cols-12">
        <div className="span-7">
          <Card title="Pareto — Downtime Reasons" sub="Sorted by impact (total minutes lost) with cumulative %">
            <ChartBox height="lg"><ParetoChart data={data} /></ChartBox>
          </Card>
        </div>
        <div className="span-5">
          <Card title="Reason Distribution" sub="Share of total downtime minutes">
            <ReasonDonut data={data} />
          </Card>
        </div>
      </div>

      <div className="ta-grid cols-12">
        <div className="span-12">
          <Card title="Downtime Trends — 12 Months" sub="Monthly downtime vs productive hours · dual axis">
            <ChartBox height="lg"><TrendChart data={data} /></ChartBox>
          </Card>
        </div>
      </div>

      <div className="ta-grid cols-12">
        <div className="span-12">
          <Card title="Detailed Downtime Reasons" sub="Occurrences, average and total time per reason">
            <ReasonTable data={data} />
          </Card>
        </div>
      </div>
    </>
  );
}

function ParetoChart({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { labels, totals, cumPct } = useMemo(() => {
    const labels = data.downtime.reasons.map(r => r.reason);
    const totals = data.downtime.reasons.map(r => r.totalMinutes / 60);
    const sum = totals.reduce((a, b) => a + b, 0);
    let acc = 0;
    const cumPct = totals.map(t => ((acc += t) / sum) * 100);
    return { labels, totals, cumPct };
  }, [data]);
  useChart(ref, () => pareto(labels, totals, cumPct), [labels.length]);
  return <canvas ref={ref} />;
}

function ReasonDonut({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const total = data.downtime.reasons.reduce((a, b) => a + b.totalMinutes, 0);
  useChart(ref, () => doughnut(
    data.downtime.reasons.map(r => r.reason),
    data.downtime.reasons.map(r => r.totalMinutes),
  ), [data.downtime.reasons.length]);
  return (
    <div className="ta-donut-row">
      <div style={{ position: "relative", width: 160, height: 160 }}>
        <canvas ref={ref} />
      </div>
      <div className="legend">
        {data.downtime.reasons.map((r, i) => {
          const color = ["#2dd4bf", "#818cf8", "#3aa1ff", "#34d399", "#fbbf24", "#f472b6", "#a78bfa", "#22d3ee"][i % 8];
          return (
            <div className="lg" key={r.reason}>
              <span className="sw" style={{ background: color }} />
              {r.reason}
              <span className="v">{Math.round((r.totalMinutes / total) * 100)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrendChart({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useChart(ref, () => dualAxisLine(
    data.downtime.trendMonthly.map(t => t.month),
    { label: "Productive hours", data: data.downtime.trendMonthly.map(t => t.productive), color: "#2dd4bf" },
    { label: "Downtime hours",   data: data.downtime.trendMonthly.map(t => t.downtime),   color: "#f87171" },
  ), [data.downtime.trendMonthly.length]);
  return <canvas ref={ref} />;
}

function ReasonTable({ data }: { data: TimeAnalyticsSnapshot }) {
  const total = data.downtime.reasons.reduce((a, b) => a + b.totalMinutes, 0);
  return (
    <div className="ta-tbl-wrap">
      <table className="ta-tbl">
        <thead>
          <tr>
            <th>Reason</th>
            <th className="num">Occurrences</th>
            <th className="num">Avg Duration</th>
            <th className="num">Total Time</th>
            <th>Distribution</th>
          </tr>
        </thead>
        <tbody>
          {data.downtime.reasons.map(r => (
            <tr key={r.reason}>
              <td className="name">{r.reason}</td>
              <td className="num">{r.occurrences}</td>
              <td className="num">{r.avgMinutes}m</td>
              <td className="num">{(r.totalMinutes / 60).toFixed(0)}h</td>
              <td>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <MiniBar pct={(r.totalMinutes / total) * 100} tone="warn" width={150} />
                  <span style={{ fontSize: 11, color: "var(--ta-text-mute)", fontFamily: "'JetBrains Mono', monospace" }}>{Math.round((r.totalMinutes / total) * 100)}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
