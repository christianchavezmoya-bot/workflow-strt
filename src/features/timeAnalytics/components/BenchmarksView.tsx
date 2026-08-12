import { useMemo, useRef } from "react";
import { Card, Kpi, ChartBox } from "./primitives";
import { useChart } from "./useChart";
import { scatter } from "./ChartTheme";
import type { TimeAnalyticsSnapshot } from "../types";

export function BenchmarksView({ data }: { data: TimeAnalyticsSnapshot }) {
  const avgConfidence = data.benchmarks.length
    ? Math.round(data.benchmarks.reduce((a, b) => a + b.confidencePct, 0) / data.benchmarks.length)
    : 0;
  const totalInstalls = data.benchmarks.reduce((a, b) => {
    const asset = data.assets.find(x => x.type === b.name);
    return a + (asset?.installs ?? 0);
  }, 0);
  const avgDrift = data.benchmarks.length
    ? +(data.benchmarks.reduce((a, b) => {
        const delta = b.expectedMinutes > 0
          ? ((b.actualMinutes - b.expectedMinutes) / b.expectedMinutes) * 100
          : 0;
        return a + delta;
      }, 0) / data.benchmarks.length).toFixed(1)
    : 0;

  return (
    <>
      <div className="ta-grid cols-4">
        <Kpi label="Asset Types" value={data.benchmarks.length} icon="⌖" tone="default" hint="with install samples" />
        <Kpi label="Avg Confidence" value={avgConfidence} unit="%" icon="✓" tone="good" hint="from sample size" />
        <Kpi label="Install Samples" value={totalInstalls} icon="⏱" tone="violet" hint="in selected period" />
        <Kpi label="Avg Drift" value={avgDrift > 0 ? `+${avgDrift}` : avgDrift} unit="%" icon="↺" tone={Math.abs(avgDrift) > 10 ? "warn" : "default"} hint="actual vs fleet average" />
      </div>

      <div className="ta-card glow" style={{ padding: 20, marginBottom: 16 }}>
        <div className="ta-grid cols-12" style={{ alignItems: "center" }}>
          <div className="span-8">
            <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700 }}>Install Time Benchmarks</h2>
            <p style={{ margin: 0, color: "var(--ta-text-dim)", fontSize: 12.5, lineHeight: 1.55 }}>
              Expected minutes use the fleet-wide average for asset types in the selected filter.
              Compare each type&apos;s actual average install time against that baseline.
            </p>
          </div>
          <div className="span-4">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid var(--ta-border)" }}>
                <div style={{ fontSize: 11, color: "var(--ta-text-mute)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Within ±10%</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, marginTop: 6 }}>
                  {withinPct(data.benchmarks, 10)}%
                </div>
                <div style={{ fontSize: 11, color: "var(--ta-text-mute)", marginTop: 4 }}>of asset types</div>
              </div>
              <div style={{ padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid var(--ta-border)" }}>
                <div style={{ fontSize: 11, color: "var(--ta-text-mute)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Avg Variance</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, marginTop: 6 }}>
                  {avgDrift > 0 ? "+" : ""}{avgDrift}%
                </div>
                <div style={{ fontSize: 11, color: "var(--ta-text-mute)", marginTop: 4 }}>actual vs expected</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Card title="Expected vs Actual — by Asset Type" sub="Expected = fleet average · bar = actual average">
        <BenchTable data={data} />
      </Card>

      <div className="ta-grid cols-12">
        <div className="span-7">
          <Card title="Quality vs Speed — Installer Matrix" sub="Lower-right = slower with more defects">
            <ChartBox height="lg"><QualitySpeedChart data={data} /></ChartBox>
          </Card>
        </div>
        <div className="span-5">
          <Card title="Variance Alerts" sub="Asset types furthest from fleet average">
            <RiskList data={data} />
          </Card>
        </div>
      </div>
    </>
  );
}

function withinPct(benchmarks: TimeAnalyticsSnapshot["benchmarks"], band: number): number {
  if (benchmarks.length === 0) return 0;
  const ok = benchmarks.filter(b => {
    if (b.expectedMinutes <= 0) return false;
    const delta = Math.abs((b.actualMinutes - b.expectedMinutes) / b.expectedMinutes) * 100;
    return delta <= band;
  }).length;
  return Math.round((ok / benchmarks.length) * 100);
}

function BenchTable({ data }: { data: TimeAnalyticsSnapshot }) {
  return (
    <div>
      {data.benchmarks.map(b => {
        const max = Math.max(b.expectedMinutes, b.actualMinutes, 1);
        const expectedPct = (b.expectedMinutes / max) * 100;
        const actualPct = (b.actualMinutes / max) * 100;
        const delta = b.expectedMinutes > 0
          ? ((b.actualMinutes - b.expectedMinutes) / b.expectedMinutes) * 100
          : 0;
        const cls = Math.abs(delta) < 6 ? "good" : Math.abs(delta) < 12 ? "warn" : "bad";
        return (
          <div className="ta-bench-row" key={b.name}>
            <div className="nm">{b.name}</div>
            <div className="bar">
              <span className="act" style={{ width: actualPct + "%" }} />
              <span className="exp" style={{ left: expectedPct + "%" }} />
            </div>
            <div className="v">{b.actualMinutes} / {b.expectedMinutes} min</div>
            <div className="badge">
              <span className={`ta-tag ${cls}`}>{(delta > 0 ? "+" : "") + delta.toFixed(1)}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QualitySpeedChart({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useChart(ref, () => scatter(
    data.qualitySpeed.map(p => ({ x: p.avgMinutes, y: p.defects, name: p.name, color: p.color })),
  ), [data.qualitySpeed.length]);
  return <canvas ref={ref} />;
}

function RiskList({ data }: { data: TimeAnalyticsSnapshot }) {
  const items = useMemo(() =>
    [...data.benchmarks]
      .map(b => {
        const delta = b.expectedMinutes > 0
          ? ((b.actualMinutes - b.expectedMinutes) / b.expectedMinutes) * 100
          : 0;
        return { ...b, delta };
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 5)
      .map(b => {
        const tone = Math.abs(b.delta) >= 12 ? "bad" : Math.abs(b.delta) >= 6 ? "warn" : "good";
        const tag = Math.abs(b.delta) >= 12 ? "High" : Math.abs(b.delta) >= 6 ? "Med" : "Low";
        const dir = b.delta > 0 ? "over" : "under";
        return {
          tag,
          tone,
          text: `<b>${b.name}</b> — ${Math.abs(b.delta).toFixed(1)}% ${dir} fleet average (${b.actualMinutes} vs ${b.expectedMinutes} min).`,
        };
      }),
  [data.benchmarks]);

  if (items.length === 0) {
    return <div style={{ fontSize: 12.5, color: "var(--ta-text-mute)" }}>No benchmark data for the selected filters.</div>;
  }

  return (
    <div className="ta-feed">
      {items.map((i, idx) => (
        <div className="ta-feed-item" key={idx}>
          <div className={`ico ${i.tone === "bad" ? "bad" : i.tone === "warn" ? "warn" : "good"}`}>!</div>
          <div className="text"><span className={`ta-tag ${i.tone}`}>{i.tag}</span> <span dangerouslySetInnerHTML={{ __html: i.text }} /></div>
        </div>
      ))}
    </div>
  );
}
