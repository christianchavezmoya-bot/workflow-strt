import { useMemo, useRef } from "react";
import { Card, Kpi, Tag, ChartBox, MiniBar } from "./primitives";
import { useChart } from "./useChart";
import { barH, multiLine } from "./ChartTheme";
import type { TimeAnalyticsSnapshot } from "../types";
import { chartDeps } from "../utils/chartSeries";

export function ProductsView({ data }: { data: TimeAnalyticsSnapshot }) {
  const families = new Set(data.products.map(p => p.family)).size;
  const improving = data.products.filter(p => p.trend90d < -4).length;
  const regressing = data.products.filter(p => p.trend90d > 4).length;

  return (
    <>
      <div className="ta-grid cols-4">
        <Kpi label="Active Products" value={data.products.length} icon="▤" tone="default" hint={`${families} families`} />
        <Kpi label="Avg Install Time" value={data.products.length ? Math.round(avg(data.products.map(p => p.avgMinutes))) : 0} unit="min" icon="⏲" tone="violet" hint="across all products" />
        <Kpi label="Improving Trend" value={improving} icon="↘" tone="good" hint="install time down in period" />
        <Kpi label="Regressing Trend" value={regressing} icon="↗" tone="warn" hint="install time up in period" />
      </div>

      <Card title="Product Performance" sub="Average install time, installs and defect rate per product">
        <ProductTable data={data} />
      </Card>

      <div className="ta-grid cols-12">
        <div className="span-7">
          <Card title="Product Performance Over Time" sub="Monthly average install minutes by product">
            <ChartBox height="lg"><ProductTrendChart data={data} /></ChartBox>
          </Card>
        </div>
        <div className="span-5">
          <Card title="Avg Install Time by Product">
            <ChartBox height="lg"><ProductBarChart data={data} /></ChartBox>
          </Card>
        </div>
      </div>

      <div className="ta-grid cols-12">
        <div className="span-5">
          <Card title="Largest Trend Shifts" sub="First vs second half of selected period">
            <TrendCallouts data={data} />
          </Card>
        </div>
        <div className="span-7">
          <Card title="Install Count by Product" sub="Completed workflows in selected period">
            <ChartBox height="lg"><ProductInstallsChart data={data} /></ChartBox>
          </Card>
        </div>
      </div>
    </>
  );
}

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function ProductTable({ data }: { data: TimeAnalyticsSnapshot }) {
  return (
    <div className="ta-tbl-wrap">
      <table className="ta-tbl">
        <thead>
          <tr>
            <th>Product</th><th>Family</th>
            <th className="num">Installs</th><th className="num">Avg Time</th>
            <th>Trend</th><th className="num">Defect Rate</th>
          </tr>
        </thead>
        <tbody>
          {data.products.map(p => {
            const trendColor = p.trend90d > 4 ? "var(--ta-bad)" : p.trend90d < -4 ? "var(--ta-good)" : "var(--ta-text-mute)";
            return (
              <tr key={p.id}>
                <td className="name">{p.name}<span className="sub">{p.id.toUpperCase()}</span></td>
                <td><Tag>{p.family}</Tag></td>
                <td className="num">{p.installs}</td>
                <td className="num">{p.avgMinutes}m</td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <MiniBar pct={50 + p.trend90d * 2} tone={p.trend90d > 0 ? "warn" : "good"} width={90} />
                    <span style={{ fontSize: 11, color: trendColor, fontFamily: "'JetBrains Mono', monospace" }}>{(p.trend90d > 0 ? "+" : "") + p.trend90d.toFixed(0)}%</span>
                  </div>
                </td>
                <td className="num">{p.defectRatePct.toFixed(1)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProductTrendChart({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const seriesNames = data.products.slice(0, 4).map(p => p.name);
  useChart(ref, () => multiLine(
    data.productTrend.map(p => p.month),
    seriesNames.map(name => ({
      label: name,
      data: data.productTrend.map(p => p.series[name] ?? 0),
    })),
  ), chartDeps(data, seriesNames.join("|"), data.productTrend.map(p => JSON.stringify(p.series)).join(";")));
  return <canvas ref={ref} />;
}

function ProductBarChart({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useChart(ref, () => barH(data.products.map(p => p.name), data.products.map(p => p.avgMinutes)), chartDeps(data, data.products.map(p => `${p.id}:${p.avgMinutes}`).join("|")));
  return <canvas ref={ref} />;
}

function ProductInstallsChart({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useChart(ref, () => barH(
    data.products.map(p => p.name.split(" ")[0]),
    data.products.map(p => p.installs),
    "#3aa1ff",
  ), chartDeps(data, data.products.map(p => `${p.id}:${p.installs}`).join("|")));
  return <canvas ref={ref} />;
}

function TrendCallouts({ data }: { data: TimeAnalyticsSnapshot }) {
  const items = useMemo(() =>
    [...data.products]
      .filter(p => Math.abs(p.trend90d) >= 4 && p.installs >= 2)
      .sort((a, b) => Math.abs(b.trend90d) - Math.abs(a.trend90d))
      .slice(0, 4),
  [data.products]);

  if (items.length === 0) {
    return (
      <div style={{ fontSize: 12.5, color: "var(--ta-text-mute)", padding: 8 }}>
        Not enough product runs in this period to detect meaningful trend shifts.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {items.map(p => {
        const tone = p.trend90d > 0 ? "bad" : "good";
        const delta = `${p.trend90d > 0 ? "+" : ""}${p.trend90d.toFixed(0)}%`;
        return (
          <div key={p.id} style={{ padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid var(--ta-border)" }}>
            <div style={{ fontSize: 11, color: "var(--ta-text-mute)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{p.name}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 700, marginTop: 6, color: tone === "good" ? "var(--ta-good)" : "var(--ta-bad)" }}>{delta}</div>
            <div style={{ fontSize: 11, color: "var(--ta-text-mute)", marginTop: 4 }}>
              Avg {p.avgMinutes} min · {p.installs} installs · {p.trend90d > 0 ? "slower" : "faster"} vs period start
            </div>
          </div>
        );
      })}
    </div>
  );
}
