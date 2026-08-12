import { useMemo, useRef } from "react";
import { Card, Kpi, Tag, ChartBox, MiniBar } from "./primitives";
import { useChart } from "./useChart";
import { barH, stacked } from "./ChartTheme";
import type { TimeAnalyticsSnapshot } from "../types";
import { chartDeps } from "../utils/chartSeries";

export function CustomersView({ data }: { data: TimeAnalyticsSnapshot }) {
  return (
    <>
      <div className="ta-grid cols-5">
        <Kpi label="Customers" value={data.customers.length} icon="◉" tone="default" hint="across 3 industries" />
        <Kpi label="Active Projects" value={data.kpis.projectsActive} icon="▣" tone="good" hint="in flight" />
        <Kpi label="Total Assets" value={data.customers.reduce((a, b) => a + b.totalAssets, 0)} icon="▦" hint="contracted" />
        <Kpi label="Productive Hours" value={(data.customers.reduce((a, b) => a + b.productiveHours, 0) / 1000).toFixed(1) + "k"} unit="h" icon="⏱" tone="violet" hint="this period" />
        <Kpi label="Avg Productivity" value={avg(data.customers.map(c => c.productivityPct)).toFixed(1)} unit="%" icon="◈" tone="good" hint="blended" />
      </div>

      <Card title="Customer Rollup" sub="Total projects, assets, productive and downtime hours per customer">
        <CustomerTable data={data} />
      </Card>

      <div className="ta-grid cols-12">
        <div className="span-7">
          <Card title="Productive vs Downtime by Customer" sub="Stacked breakdown of logged hours">
            <ChartBox height="lg"><StackedCustomerChart data={data} /></ChartBox>
          </Card>
        </div>
        <div className="span-5">
          <Card title="Avg Install Duration per Customer" sub="Lower is better · overall benchmark 128 min">
            <ChartBox height="lg"><AvgCustomerChart data={data} /></ChartBox>
          </Card>
        </div>
      </div>
    </>
  );
}

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function CustomerTable({ data }: { data: TimeAnalyticsSnapshot }) {
  const sorted = [...data.customers].sort((a, b) => b.totalAssets - a.totalAssets);
  return (
    <div className="ta-tbl-wrap">
      <table className="ta-tbl">
        <thead>
          <tr>
            <th>Customer</th><th>Industry</th>
            <th className="num">Projects</th><th className="num">Assets</th>
            <th className="num">Productive h</th><th className="num">Downtime h</th>
            <th>Productivity</th><th className="num">Avg Install</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(c => (
            <tr key={c.id}>
              <td className="name">{c.name}<span className="sub">{c.country}</span></td>
              <td><Tag>{c.industry}</Tag></td>
              <td className="num">{c.projectCount}</td>
              <td className="num">{c.totalAssets}</td>
              <td className="num">{c.productiveHours}</td>
              <td className="num">{c.downtimeHours}</td>
              <td>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <MiniBar pct={c.productivityPct} tone="good" width={90} />
                  <span style={{ fontSize: 11, color: "var(--ta-text-mute)", fontFamily: "'JetBrains Mono', monospace" }}>{c.productivityPct}%</span>
                </div>
              </td>
              <td className="num">{c.avgInstallMinutes}m</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StackedCustomerChart({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useChart(ref, () => stacked(
    data.customers.map(c => c.name),
    [
      { label: "Productive", data: data.customers.map(c => c.productiveHours), backgroundColor: "#2dd4bf" },
      { label: "Downtime",   data: data.customers.map(c => c.downtimeHours),   backgroundColor: "#f87171" },
    ],
  ), chartDeps(data, data.customers.map(c => `${c.id}:${c.productiveHours}:${c.downtimeHours}`).join("|")));
  return <canvas ref={ref} />;
}

function AvgCustomerChart({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useChart(ref, () => barH(data.customers.map(c => c.name), data.customers.map(c => c.avgInstallMinutes), "#818cf8"), chartDeps(data, data.customers.map(c => `${c.id}:${c.avgInstallMinutes}`).join("|")));
  return <canvas ref={ref} />;
}
