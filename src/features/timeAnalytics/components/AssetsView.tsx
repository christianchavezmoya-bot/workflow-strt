import { useRef } from "react";
import { Card, Kpi, Tag, ChartBox } from "./primitives";
import { useChart } from "./useChart";
import { barH, scatter } from "./ChartTheme";
import type { TimeAnalyticsSnapshot } from "../types";
import { chartDeps } from "../utils/chartSeries";

export function AssetsView({ data }: { data: TimeAnalyticsSnapshot }) {
  const easiest = data.assets.length
    ? [...data.assets].sort((a, b) => a.avgMinutes - b.avgMinutes)[0]
    : null;

  return (
    <>
      <div className="ta-grid cols-4">
        <Kpi label="Asset Models" value={data.assets.length} icon="▦" tone="default" hint="in selected scope" />
        <Kpi label="Avg Install" value={data.assets.length ? Math.round(avg(data.assets.map(a => a.avgMinutes))) : 0} unit="min" icon="⏲" tone="violet" hint="across all assets" />
        <Kpi label="Std Deviation" value={data.assets.length ? (avg(data.assets.map(a => a.std))).toFixed(1) : "0"} unit="min" icon="σ" tone="warn" hint="lower is more consistent" />
        <Kpi label="Easiest Asset" value={easiest?.type ?? "—"} icon="✓" tone="good" />
      </div>

      <Card title="Average Installation Time by Asset Type" sub="Min · Max · Std Deviation · Sample size">
        <AssetTable data={data} />
      </Card>

      <div className="ta-grid cols-12">
        <div className="span-7">
          <Card title="Avg Install Time by Model" sub="Sorted descending by average duration">
            <ChartBox height="lg"><AssetBarChart data={data} /></ChartBox>
          </Card>
        </div>
        <div className="span-5">
          <Card title="Difficulty vs Duration" sub="Install count vs average minutes">
            <ChartBox height="lg"><AssetScatterChart data={data} /></ChartBox>
          </Card>
        </div>
      </div>

      <div className="ta-grid cols-2">
        <Card title="Hardest Assets to Install" sub="Highest average install time">
          <AssetList data={data} mode="hardest" />
        </Card>
        <Card title="Easiest Assets to Install" sub="Lowest average install time">
          <AssetList data={data} mode="easiest" />
        </Card>
      </div>
    </>
  );
}

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function assetRowKey(a: { type: string; model: string }): string {
  return `${a.type}::${a.model}`;
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
              <tr key={assetRowKey(a)}>
                <td className="name">{a.type}<span className="sub">{a.model}</span></td>
                <td>{a.model}</td>
                <td className="num">{a.avgMinutes}m</td>
                <td className="num muted">{a.minMinutes}m</td>
                <td className="num muted">{a.maxMinutes}m</td>
                <td className="num">{a.std.toFixed(1)}</td>
                <td className="num">{a.installs}</td>
                <td><Tag tone={cls as "good" | "warn" | "bad"}>{lbl}<span style={{ color: "var(--ta-text-mute)", marginLeft: 6 }}>· {a.difficulty.toFixed(1)}%</span></Tag></td>
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
  useChart(ref, () => barH(data.assets.map(a => a.type), data.assets.map(a => a.avgMinutes)), chartDeps(data, data.assets.map(a => `${a.type}:${a.avgMinutes}`).join("|")));
  return <canvas ref={ref} />;
}

function AssetScatterChart({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useChart(ref, () => scatter(
    data.assets.map(a => ({
      x: a.avgMinutes,
      y: a.installs,
      name: a.type,
      color: a.difficulty > 12 ? "#f87171" : a.difficulty > 6 ? "#fbbf24" : "#34d399",
    })),
  ), chartDeps(data, data.assets.map(a => `${a.type}:${a.avgMinutes}:${a.installs}`).join("|")));
  return <canvas ref={ref} />;
}

function AssetList({ data, mode }: { data: TimeAnalyticsSnapshot; mode: "hardest" | "easiest" }) {
  const sorted = [...data.assets].sort((a, b) => mode === "hardest" ? b.avgMinutes - a.avgMinutes : a.avgMinutes - b.avgMinutes);
  const slice = mode === "hardest" ? sorted.slice(0, 4) : sorted.slice(-4).reverse();
  const max = Math.max(...data.assets.map(a => a.avgMinutes), 1);
  return (
    <div className="ta-barlist">
      {slice.map(a => (
        <div className="r" key={assetRowKey(a)}>
          <div className="l">{a.type}</div>
          <div className="b"><span style={{ width: `${(a.avgMinutes / max) * 100}%`, background: mode === "hardest" ? "linear-gradient(90deg, #2dd4bf, #ff9f45)" : "linear-gradient(90deg, #34d399, #3aa1ff)" }} /></div>
          <div className="v">{a.avgMinutes}m</div>
        </div>
      ))}
    </div>
  );
}
