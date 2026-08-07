import { useMemo, useRef } from "react";
import { Card, Kpi, Tag, ChartBox, MiniBar } from "./primitives";
import { useChart } from "./useChart";
import { barH, multiLine } from "./ChartTheme";
import type { TimeAnalyticsSnapshot } from "../types";

export function AssetsView({ data }: { data: TimeAnalyticsSnapshot }) {
  return (
    <>
      <div className="ta-grid cols-4">
        <Kpi label="Asset Models" value={data.assets.length} icon="▦" tone="default" hint="in active catalogue" />
        <Kpi label="Avg Install" value={data.assets.length ? Math.round(avg(data.assets.map(a => a.avgMinutes))) : 0} unit="min" icon="⏲" tone="violet" hint="across all assets" />
        <Kpi label="Std Deviation" value={data.assets.length ? (avg(data.assets.map(a => a.std))).toFixed(1) : "0"} unit="min" icon="σ" tone="warn" hint="lower is more consistent" />
        <Kpi label="Easiest Asset" value={data.assets.length ? [...data.assets].sort((a, b) => a.avgMinutes - b.avgMinutes)[0].type : "—"} icon="✓" tone="good" />
      </div>

      <Card title="Average Installation Time by Asset Type" sub="Min · Max · Std Deviation · Sample size across all projects" action={<span style={{ fontSize: 11 }}>Compare across projects ▾</span>}>
        <AssetTable data={data} />
      </Card>

      <div className="ta-grid cols-12">
        <div className="span-7">
          <Card title="Avg Install Time by Model" sub="Sorted descending by average duration">
            <ChartBox height="lg"><AssetBarChart data={data} /></ChartBox>
          </Card>
        </div>
        <div className="span-5">
          <Card title="Model Comparison — Across Projects" sub="Normalised speed per project · 100 = project average">
            <ChartBox height="lg"><AssetComparisonChart data={data} /></ChartBox>
          </Card>
        </div>
      </div>

      <div className="ta-grid cols-2">
        <Card title="Hardest Assets to Install" sub="Highest average install time · high variation">
          <AssetList data={data} mode="hardest" />
        </Card>
        <Card title="Easiest Assets to Install" sub="Lowest average install time · most consistent">
          <AssetList data={data} mode="easiest" />
        </Card>
      </div>
    </>
  );
}

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function AssetTable({ data }: { data: TimeAnalyticsSnapshot }) {
  return (
    <div className="ta-tbl-wrap">
      <table className="ta-tbl">
        <thead>
          <tr>
            <th>Asset Type</th><th>Model</th>
            <th className="num">Avg</th><th className="num">Min</th><th className="num">Max</th>
            <th className="num">σ</th><th className="num">Installs</th><th>Difficulty</th>
          </tr>
        </thead>
        <tbody>
          {data.assets.map(a => {
            const cls = a.difficulty > 12 ? "bad" : a.difficulty > 6 ? "warn" : "good";
            const lbl = a.difficulty > 12 ? "Hard" : a.difficulty > 6 ? "Medium" : "Easy";
            return (
              <tr key={a.type}>
                <td className="name">{a.type}<span className="sub">{a.model}</span></td>
                <td>{a.model}</td>
                <td className="num">{a.avgMinutes}m</td>
                <td className="num muted">{a.minMinutes}m</td>
                <td className="num muted">{a.maxMinutes}m</td>
                <td className="num">{a.std.toFixed(1)}</td>
                <td className="num">{a.installs}</td>
                <td><Tag tone={cls as any}>{lbl}<span style={{ color: "var(--ta-text-mute)", marginLeft: 6 }}>· {a.difficulty.toFixed(1)}</span></Tag></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AssetBarChart({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useChart(ref, () => barH(data.assets.map(a => a.type), data.assets.map(a => a.avgMinutes)), [data.assets.length]);
  return <canvas ref={ref} />;
}

function AssetComparisonChart({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const labels = data.assets.map(a => a.model);
  // Build three mock project series — replace with real data
  const projects = data.projects.slice(0, 3);
  useChart(ref, () => multiLine(
    labels,
    projects.map((p, i) => ({
      label: p.name,
      data: data.assets.map((a, j) => Math.round(a.avgMinutes * (0.92 + i * 0.06 + ((j * 7 + i * 3) % 10) * 0.008))),
      borderColor: ["#2dd4bf", "#ff9f45", "#3aa1ff"][i],
    })),
  ), [labels.length, projects.length, data.assets]);
  return <canvas ref={ref} />;
}

function AssetList({ data, mode }: { data: TimeAnalyticsSnapshot; mode: "hardest" | "easiest" }) {
  const sorted = [...data.assets].sort((a, b) => mode === "hardest" ? b.avgMinutes - a.avgMinutes : a.avgMinutes - b.avgMinutes);
  const slice = mode === "hardest" ? sorted.slice(0, 4) : sorted.slice(-4).reverse();
  const max = Math.max(...data.assets.map(a => a.avgMinutes));
  return (
    <div className="ta-barlist">
      {slice.map(a => (
        <div className="r" key={a.type}>
          <div className="l">{a.type}</div>
          <div className="b"><span style={{ width: `${(a.avgMinutes / max) * 100}%`, background: mode === "hardest" ? "linear-gradient(90deg, #2dd4bf, #ff9f45)" : "linear-gradient(90deg, #34d399, #3aa1ff)" }} /></div>
          <div className="v">{a.avgMinutes}m</div>
        </div>
      ))}
    </div>
  );
}
