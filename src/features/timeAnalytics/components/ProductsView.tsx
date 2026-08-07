import { useMemo, useRef } from "react";
import { Card, Kpi, Tag, ChartBox, MiniBar } from "./primitives";
import { useChart } from "./useChart";
import { barH, multiLine, radar } from "./ChartTheme";
import type { TimeAnalyticsSnapshot } from "../types";

export function ProductsView({ data }: { data: TimeAnalyticsSnapshot }) {
  return (
    <>
      <div className="ta-grid cols-4">
        <Kpi label="Active Products" value={data.products.length} icon="▤" tone="default" hint="in 4 families" />
        <Kpi label="Avg Install Time" value={data.products.length ? Math.round(avg(data.products.map(p => p.avgMinutes))) : 0} unit="min" icon="⏲" tone="violet" hint="across all products" />
        <Kpi label="Firmware Updates" value="3" icon="⌬" tone="warn" hint="this quarter" />
        <Kpi label="Process Improvements" value="7" icon="✓" tone="good" hint="implemented" />
      </div>

      <Card title="Product Performance" sub="Average install time, total installs and firmware impact per product">
        <ProductTable data={data} />
      </Card>

      <div className="ta-grid cols-12">
        <div className="span-7">
          <Card title="Product Performance Over Time" sub="Detects firmware or process impacts · 12-month rolling window">
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
          <Card title="Firmware Impact Detected" sub="Auto-correlated install time anomalies to firmware releases">
            <FirmwareCallouts />
          </Card>
        </div>
        <div className="span-7">
          <Card title="Performance Comparison Across Projects" sub="Normalised install time per product per project">
            <ChartBox height="lg"><ProductRadar data={data} /></ChartBox>
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
            <th>Product</th><th>Family</th><th>Firmware</th>
            <th className="num">Installs</th><th className="num">Avg Time</th>
            <th>Trend (90d)</th><th className="num">Defect Rate</th>
          </tr>
        </thead>
        <tbody>
          {data.products.map(p => {
            const trendColor = p.trend90d > 4 ? "var(--ta-bad)" : p.trend90d < -4 ? "var(--ta-good)" : "var(--ta-text-mute)";
            return (
              <tr key={p.id}>
                <td className="name">{p.name}<span className="sub">{p.id.toUpperCase()}</span></td>
                <td><Tag>{p.family}</Tag></td>
                <td><Tag tone="cool">{p.firmware}</Tag></td>
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
  // Use the top 4 product names as the series keys
  const seriesNames = data.products.slice(0, 4).map(p => p.name);
  useChart(ref, () => multiLine(
    data.productTrend.map(p => p.month),
    seriesNames.map(name => ({
      label: name,
      data: data.productTrend.map(p => p.series[name] ?? 0),
    })),
  ), [seriesNames.length, data.productTrend.length]);
  return <canvas ref={ref} />;
}

function ProductBarChart({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useChart(ref, () => barH(data.products.map(p => p.name), data.products.map(p => p.avgMinutes)), [data.products.length]);
  return <canvas ref={ref} />;
}

function ProductRadar({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const labels = data.products.map(p => p.name.split(" ")[0]);
  useChart(ref, () => radar(
    labels,
    [
      { label: "Aurora",  data: labels.map((_, i) => 95 + (i * 7) % 20) },
      { label: "Helix",   data: labels.map((_, i) => 102 + (i * 5) % 18) },
      { label: "Vortex",  data: labels.map((_, i) => 88 + (i * 3) % 16) },
    ],
  ), [labels.length]);
  return <canvas ref={ref} />;
}

function FirmwareCallouts() {
  const items = [
    { name: "PulseNode R3 · v2.0.3",   delta: "+18 min", tone: "bad",  hint: "avg install increased after release · 3 reworks" },
    { name: "AcuLink X-700 · v4.2.1",  delta: "−6 min",  tone: "good", hint: "new provisioning flow improved" },
    { name: "Sentinel Cam 4K · v3.1.0", delta: "+4 min",  tone: "warn", hint: "mount redesign added steps" },
    { name: "TrioMeter X · v2.4.7",    delta: "−9 min",  tone: "good", hint: "auto-calibration successful" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {items.map(i => (
        <div key={i.name} style={{ padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid var(--ta-border)" }}>
          <div style={{ fontSize: 11, color: "var(--ta-text-mute)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{i.name}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 700, marginTop: 6, color: i.tone === "good" ? "var(--ta-good)" : i.tone === "bad" ? "var(--ta-bad)" : "var(--ta-warn)" }}>{i.delta}</div>
          <div style={{ fontSize: 11, color: "var(--ta-text-mute)", marginTop: 4 }}>{i.hint}</div>
        </div>
      ))}
    </div>
  );
}
