import { useState, useRef } from "react";
import { Card, Kpi, ChartBox } from "./primitives";
import { useChart } from "./useChart";
import { comboFan, barV } from "./ChartTheme";
import type { TimeAnalyticsSnapshot } from "../types";
import { chartDeps } from "../utils/chartSeries";

export function ForecastsView({ data }: { data: TimeAnalyticsSnapshot }) {
  const f = data.forecast;
  const atRisk = data.projects.filter(p => p.health !== "good").length;

  return (
    <>
      <div className="ta-grid cols-4">
        <Kpi label="Remaining Labour" value={f.remainingHours.toLocaleString()} unit="h" icon="⏱" tone="default" hint="estimated from remaining assets" />
        <Kpi label="Est. Completion" value={f.estimatedCompletion} icon="⌖" tone="good" hint={`${f.confidencePct}% confidence`} />
        <Kpi label="Risk Level" value={cap(f.riskLevel)} icon="!" tone={f.riskLevel === "high" ? "bad" : "warn"} hint={`${atRisk} projects not on track`} />
        <Kpi label="Crews Needed" value={f.crewsNeeded} icon="⚒" tone="violet" hint="from remaining hours / weeks" />
      </div>

      <div className="ta-grid cols-12">
        <div className="span-7">
          <Card title="Completion Forecast" sub="Confidence band (low / mid / high) · cumulative installs">
            <ChartBox height="lg"><FanChart data={data} /></ChartBox>
          </Card>
        </div>
        <div className="span-5">
          <Card title="Quarterly Completions" sub="Completed workflow runs by quarter">
            <ChartBox height="lg"><HistoryChart data={data} /></ChartBox>
          </Card>
        </div>
      </div>

      <div className="ta-grid cols-12">
        <div className="span-7">
          <Card title="Capacity Planning — What-if Simulation" sub="Model weeks to finish using remaining labour hours">
            <CapacityPlanner remainingHours={f.remainingHours} />
          </Card>
        </div>
        <div className="span-5">
          <Card title="Installer Headcount" sub="Active installers in selected period">
            <ResourcePlan data={data} />
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
  ), chartDeps(data, data.forecast.completion.map(c => `${c.week}:${c.mid}`).join("|")));
  return <canvas ref={ref} />;
}

function HistoryChart({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useChart(ref, () => barV(
    data.forecast.history.map(h => h.period),
    [
      { label: "Actual", data: data.forecast.history.map(h => h.actual), backgroundColor: "#2dd4bf" },
    ],
  ), chartDeps(data, data.forecast.history.map(h => `${h.period}:${h.actual}`).join("|")));
  return <canvas ref={ref} />;
}

function CapacityPlanner({ remainingHours }: { remainingHours: number }) {
  const [s, setS] = useState({ crews: 4, shift: 8, overtime: 0, parallel: 1 });

  const effective = s.crews * s.shift * 5 * (1 + s.overtime / 40);
  const weeks = remainingHours / Math.max(1, effective);
  const adj = weeks / Math.sqrt(s.parallel);
  const completion = new Date();
  completion.setDate(completion.getDate() + Math.round(adj * 7));

  const slider = (label: string, key: keyof typeof s, min: number, max: number, step: number, unit: string) => (
    <div className="ta-cap-row" key={key}>
      <div className="lbl">{label}</div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={s[key]}
        onChange={e => setS(prev => ({ ...prev, [key]: +e.target.value }))}
      />
      <div className="v">{s[key]}{unit}</div>
    </div>
  );

  return (
    <div className="ta-cap-grid">
      <div>
        {slider("Active Crews",   "crews",   1, 28, 1, "")}
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
          <div className="h">based on {remainingHours.toLocaleString()}h remaining</div>
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

function ResourcePlan({ data }: { data: TimeAnalyticsSnapshot }) {
  const byRole = data.installers.reduce<Record<string, number>>((acc, i) => {
    const role = i.role || "Installer";
    acc[role] = (acc[role] ?? 0) + 1;
    return acc;
  }, {});
  const rows = Object.entries(byRole).sort((a, b) => b[1] - a[1]);
  const total = data.installers.length || 1;
  const avgProductivity = data.installers.length
    ? Math.round(data.installers.reduce((a, i) => a + i.productivityPct, 0) / data.installers.length)
    : 0;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid var(--ta-border)" }}>
          <div style={{ fontSize: 11, color: "var(--ta-text-mute)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Active Installers</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, marginTop: 6 }}>{total}</div>
          <div style={{ fontSize: 11, color: "var(--ta-text-mute)", marginTop: 4 }}>with runs in period</div>
        </div>
        <div style={{ padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid var(--ta-border)" }}>
          <div style={{ fontSize: 11, color: "var(--ta-text-mute)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Avg Productivity</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, marginTop: 6 }}>{avgProductivity}%</div>
          <div style={{ fontSize: 11, color: "var(--ta-text-mute)", marginTop: 4 }}>team-wide in period</div>
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <div className="ta-section-h"><h3>By Role</h3></div>
        {rows.map(([role, count]) => (
          <div className="ta-prog" key={role} style={{ marginBottom: 12 }}>
            <div className="lbl">
              <span>{role}</span>
              <span className="v">{count}</span>
            </div>
            <div className="trk"><span style={{ width: `${(count / total) * 100}%`, background: "var(--ta-accent)" }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
