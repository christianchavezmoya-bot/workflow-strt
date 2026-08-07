import { useRef } from "react";
import { Card, Kpi, ChartBox } from "./primitives";
import { useChart } from "./useChart";
import { scatter } from "./ChartTheme";
import type { TimeAnalyticsSnapshot } from "../types";

export function BenchmarksView({ data }: { data: TimeAnalyticsSnapshot }) {
  return (
    <>
      <div className="ta-grid cols-4">
        <Kpi label="Models" value="47" icon="⌖" tone="default" hint="expected-time models" />
        <Kpi label="Avg Confidence" value="89" unit="%" icon="✓" tone="good" hint="across all models" />
        <Kpi label="Predictions (30d)" value="1284" icon="⏱" tone="violet" hint="this month" />
        <Kpi label="Model Drift" value="+2.1" unit="%" icon="↺" tone="warn" hint="re-train scheduled" />
      </div>

      <div className="ta-card glow" style={{ padding: 20, marginBottom: 16 }}>
        <div className="ta-grid cols-12" style={{ alignItems: "center" }}>
          <div className="span-8">
            <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700 }}>Benchmark Engine — Strategic Feature</h2>
            <p style={{ margin: 0, color: "var(--ta-text-dim)", fontSize: 12.5, lineHeight: 1.55 }}>
              Continuously learns expected installation times by product, asset type, workflow and installer.
              Predicts future project duration, labour hours, crew size and risk.
              Uses historical data to improve estimating and operational planning.
            </p>
          </div>
          <div className="span-4">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid var(--ta-border)" }}>
                <div style={{ fontSize: 11, color: "var(--ta-text-mute)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Estimating Accuracy</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, marginTop: 6 }}>94%</div>
                <div style={{ fontSize: 11, color: "var(--ta-text-mute)", marginTop: 4 }}>within ±10% of actual</div>
              </div>
              <div style={{ padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid var(--ta-border)" }}>
                <div style={{ fontSize: 11, color: "var(--ta-text-mute)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Plan vs Actual</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, marginTop: 6 }}>+6%</div>
                <div style={{ fontSize: 11, color: "var(--ta-text-mute)", marginTop: 4 }}>actual faster than plan</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Card title="Expected vs Actual — by Asset Type" sub="Benchmark engine confidence score shown · bar = actual, marker = expected">
        <BenchTable data={data} />
      </Card>

      <div className="ta-grid cols-12">
        <div className="span-7">
          <Card title="Quality vs Speed — Installer Matrix" sub="Identify the optimal balance · top-right = slow + defect prone">
            <ChartBox height="lg"><QualitySpeedChart data={data} /></ChartBox>
          </Card>
        </div>
        <div className="span-5">
          <Card title="Risk Indicators" sub="Auto-derived from benchmark variance + recent trends">
            <RiskList />
          </Card>
        </div>
      </div>
    </>
  );
}

function BenchTable({ data }: { data: TimeAnalyticsSnapshot }) {
  return (
    <div>
      {data.benchmarks.map(b => {
        const max = Math.max(b.expectedMinutes, b.actualMinutes);
        const expectedPct = (b.expectedMinutes / max) * 100;
        const actualPct = (b.actualMinutes / max) * 100;
        const delta = ((b.actualMinutes - b.expectedMinutes) / b.expectedMinutes) * 100;
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

function RiskList() {
  const items = [
    { tag: "High", tone: "bad",  text: "<b>Smart Sensor Pro</b> — 13% over benchmark for 6 weeks · review install guide." },
    { tag: "Med",  tone: "warn", text: "<b>Distribution Hub</b> — drift detected on Q2 data · re-train model." },
    { tag: "Med",  tone: "warn", text: "<b>Diego Alvarez</b> productivity down 8% vs benchmark · coaching suggested." },
    { tag: "Low",  tone: "cool", text: "<b>Flow Meter</b> — best-in-class performance, 3% under expected." },
    { tag: "Low",  tone: "good", text: "<b>Industrial Meter</b> — improving trend, on track to retake #1." },
  ];
  return (
    <div className="ta-feed">
      {items.map((i, idx) => (
        <div className="ta-feed-item" key={idx}>
          <div className={`ico ${i.tone === "bad" ? "bad" : i.tone === "warn" ? "warn" : "good"}`}>!</div>
          <div className="text"><span className={`ta-tag ${i.tone}`}>{i.tag}</span> <span dangerouslySetInnerHTML={{ __html: i.text }} /></div>
          <div className="time">today</div>
        </div>
      ))}
    </div>
  );
}
