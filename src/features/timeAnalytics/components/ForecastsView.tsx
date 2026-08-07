import { useMemo, useState, useRef } from "react";
import { Card, Kpi, ChartBox } from "./primitives";
import { useChart } from "./useChart";
import { comboFan, barV } from "./ChartTheme";
import type { TimeAnalyticsSnapshot } from "../types";

export function ForecastsView({ data }: { data: TimeAnalyticsSnapshot }) {
  const f = data.forecast;
  return (
    <>
      <div className="ta-grid cols-4">
        <Kpi label="Remaining Labour" value={f.remainingHours.toLocaleString()} unit="h" icon="⏱" tone="default" hint="across all projects" />
        <Kpi label="Est. Completion" value={f.estimatedCompletion} icon="⌖" tone="good" hint="80% confidence" />
        <Kpi label="Risk Level" value={cap(f.riskLevel)} icon="!" tone={f.riskLevel === "high" ? "bad" : "warn"} hint={`${f.crewsNeeded - 12} projects at risk`} />
        <Kpi label="Crews Needed" value={f.crewsNeeded} icon="⚒" tone="violet" hint="+2 vs current plan" />
      </div>

      <div className="ta-grid cols-12">
        <div className="span-7">
          <Card title="Completion Forecast — All Projects" sub="Confidence band (low / mid / high) · cumulative installs">
            <ChartBox height="lg"><FanChart data={data} /></ChartBox>
          </Card>
        </div>
        <div className="span-5">
          <Card title="Historical Predictions vs Actual" sub="Track record of the forecast engine over 6 quarters">
            <ChartBox height="lg"><HistoryChart data={data} /></ChartBox>
          </Card>
        </div>
      </div>

      <div className="ta-grid cols-12">
        <div className="span-7">
          <Card title="Capacity Planning — What-if Simulation" sub="Adjust crew size and shift length to model shutdown completion scenarios">
            <CapacityPlanner />
          </Card>
        </div>
        <div className="span-5">
          <Card title="Resource Plan — Recommended" sub="Generated from forecast + benchmark engine">
            <ResourcePlan />
          </Card>
        </div>
      </div>
    </>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function FanChart({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useChart(ref, () => comboFan(
    data.forecast.completion.map(c => c.week),
    data.forecast.completion,
    data.forecast.completion.map(c => c.mid * 0.6),
  ), [data.forecast.completion.length]);
  return <canvas ref={ref} />;
}

function HistoryChart({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useChart(ref, () => barV(
    data.forecast.history.map(h => h.period),
    [
      { label: "Predicted", data: data.forecast.history.map(h => h.predicted), backgroundColor: "#818cf8" },
      { label: "Actual",    data: data.forecast.history.map(h => h.actual),    backgroundColor: "#2dd4bf" },
    ],
  ), [data.forecast.history.length]);
  return <canvas ref={ref} />;
}

function CapacityPlanner() {
  const [s, setS] = useState({ crews: 14, shift: 9, overtime: 0, parallel: 3 });

  const baseHrs = 1480;
  const effective = s.crews * s.shift * 5 * (1 + s.overtime / 40);
  const weeks = baseHrs / Math.max(1, effective);
  const adj = weeks / Math.sqrt(s.parallel);
  const completion = new Date();
  completion.setDate(completion.getDate() + Math.round(adj * 7));

  const slider = (label: string, key: keyof typeof s, min: number, max: number, step: number, unit: string) => {
    const input = (
      <input
        type="range"
        min={min} max={max} step={step}
        value={s[key]}
        onChange={e => setS(prev => ({ ...prev, [key]: +e.target.value }))}
      />
    ) as any;
    return (
      <div className="ta-cap-row" key={key}>
        <div className="lbl">{label}</div>
        {input}
        <div className="v">{s[key]}{unit}</div>
      </div>
    );
  };

  return (
    <div className="ta-cap-grid">
      <div>
        {slider("Active Crews",   "crews",   4, 28, 1, "")}
        {slider("Shift Length",   "shift",   6, 12, 0.5, "h")}
        {slider("Weekly Overtime","overtime",0, 20, 1, "h")}
        {slider("Parallel Sites", "parallel",1,  8, 1, "")}
      </div>
      <div className="ta-cap-out">
        <div className="o">
          <div className="l">Weekly Capacity</div>
          <div className="v">{Math.round(effective)}h</div>
          <div className="h">{s.crews} crews × {s.shift}h × 5d</div>
        </div>
        <div className="o">
          <div className="l">Est. Completion</div>
          <div className="v">{completion.toISOString().slice(0, 10)}</div>
          <div className="h">based on current plan</div>
        </div>
        <div className="o">
          <div className="l">Weeks to Finish</div>
          <div className="v">{adj.toFixed(1)} wks</div>
          <div className="h">including {s.overtime}h OT</div>
        </div>
      </div>
    </div>
  );
}

function ResourcePlan() {
  const rows = [
    { role: "Lead Tech",     current: 4, need: 5, delta: +1, color: "var(--ta-good)" },
    { role: "Senior Tech",   current: 5, need: 6, delta: +1, color: "var(--ta-good)" },
    { role: "Tech II",       current: 3, need: 3, delta:  0, color: "var(--ta-text-mute)" },
    { role: "Tech III",      current: 2, need: 1, delta: -1, color: "var(--ta-bad)" },
    { role: "Site Surveyor", current: 1, need: 2, delta: +1, color: "var(--ta-good)" },
  ];
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid var(--ta-border)" }}>
          <div style={{ fontSize: 11, color: "var(--ta-text-mute)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Utilization Target</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, marginTop: 6 }}>88%</div>
          <div style={{ fontSize: 11, color: "var(--ta-text-mute)", marginTop: 4 }}>balanced for sustainable load</div>
        </div>
        <div style={{ padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid var(--ta-border)" }}>
          <div style={{ fontSize: 11, color: "var(--ta-text-mute)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Buffer</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, marginTop: 6 }}>+12%</div>
          <div style={{ fontSize: 11, color: "var(--ta-text-mute)", marginTop: 4 }}>contingency for weather & rework</div>
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <div className="ta-section-h"><h3>Role Plan</h3></div>
        {rows.map(r => (
          <div className="ta-prog" key={r.role} style={{ marginBottom: 12 }}>
            <div className="lbl">
              <span>{r.role}</span>
              <span className="v">{r.current} → {r.need}</span>
            </div>
            <div className="trk"><span style={{ width: `${(r.need / 6) * 100}%`, background: r.color }} /></div>
            <div className="lbl">
              <span style={{ fontSize: 10.5, color: "var(--ta-text-mute)" }}>{r.delta === 0 ? "no change" : r.delta > 0 ? `hire ${r.delta}` : `reduce ${Math.abs(r.delta)}`}</span>
              <span className="v" style={{ color: r.color }}>{r.delta > 0 ? "+" + r.delta : r.delta}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
