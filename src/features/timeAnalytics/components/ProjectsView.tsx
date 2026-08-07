import { useMemo, useRef } from "react";
import { Card, Kpi, Tag, Avatar, ChartBox, MiniBar } from "./primitives";
import { useChart } from "./useChart";
import { multiLine, barV, TA_COLORS } from "./ChartTheme";
import type { TimeAnalyticsSnapshot } from "../types";

export function ProjectsView({ data }: { data: TimeAnalyticsSnapshot }) {
  const k = data.kpis;
  return (
    <>
      <div className="ta-grid cols-5">
        <Kpi label="Active Projects" value={k.projectsActive} icon="▣" tone="default" hint="across 5 customers" />
        <Kpi label="Assets Installed" value={data.projects.reduce((a, b) => a + b.doneAssets, 0)} icon="✓" tone="good" delta={{ dir: "up", text: "142 this mo" }} />
        <Kpi label="Assets Remaining" value={k.assetsRemaining} icon="◌" tone="violet" hint="across all projects" />
        <Kpi label="Productive Hours" value={(data.projects.reduce((a, b) => a + b.productiveHours, 0) / 1000).toFixed(1) + "k"} unit="h" icon="⏱" hint="month-to-date" />
        <Kpi label="On-Time Delivery" value="88" unit="%" icon="◈" tone="good" delta={{ dir: "up", text: "4 vs target 85%" }} />
      </div>

      <div className="ta-grid cols-2">
        {data.projects.map(p => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>

      <div className="ta-grid cols-12">
        <div className="span-7">
          <Card title={`Burn-Down Chart — ${data.projects[0]?.name ?? ""}`} sub="Assets remaining vs ideal plan · 24-week project">
            <ChartBox height="lg"><BurndownChart data={data} /></ChartBox>
          </Card>
        </div>
        <div className="span-5">
          <Card title="Daily Throughput" sub="Assets installed per day · last 4 weeks">
            <ChartBox height="lg"><ThroughputChart data={data} /></ChartBox>
          </Card>
        </div>
      </div>

      <div className="ta-grid cols-12">
        <div className="span-7">
          <Card title="Completion Forecast — All Projects" sub="Monte-Carlo estimate · 80% confidence band">
            <ChartBox height="lg"><ForecastChart data={data} /></ChartBox>
          </Card>
        </div>
        <div className="span-5">
          <Card title="Project Leaderboard" sub="Closest to delivery · ranked by % complete">
            <ProjectLeaderboard data={data} />
          </Card>
        </div>
      </div>
    </>
  );
}

function ProjectCard({ project }: { project: TimeAnalyticsSnapshot["projects"][number] }) {
  const pct = project.totalAssets > 0 ? Math.round((project.doneAssets / project.totalAssets) * 100) : 0;
  const productivityPct = (project.productiveHours + project.downtimeHours) > 0
    ? Math.round((project.productiveHours / (project.productiveHours + project.downtimeHours)) * 100)
    : 0;
  return (
    <div className="ta-proj">
      <div>
        <div className="name">{project.name}</div>
        <div className="meta">
          {project.customerName} · Due {project.due || "—"} · <Tag tone={project.health}>{project.status}</Tag>
        </div>
        <div className="stats">
          <div className="stat"><div className="v">{project.doneAssets}/{project.totalAssets}</div><div className="l">Assets</div></div>
          <div className="stat"><div className="v">{project.productiveHours}h</div><div className="l">Productive</div></div>
          <div className="stat"><div className="v">{project.downtimeHours}h</div><div className="l">Downtime</div></div>
          <div className="stat"><div className="v">{productivityPct}%</div><div className="l">Productivity</div></div>
        </div>
        <div className={`bar ${project.health === "good" ? "" : project.health}`}>
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="side">
        <div className="pct">{pct}%</div>
        <div className="due">complete</div>
      </div>
    </div>
  );
}

function BurndownChart({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useChart(ref, () => multiLine(
    data.burndown.map(d => d.week),
    [
      { label: "Ideal",  data: data.burndown.map(d => d.ideal),  borderColor: "#aab1c8", borderDash: [4, 4] },
      { label: "Actual", data: data.burndown.map(d => d.actual), borderColor: "#2dd4bf" },
    ],
  ), [data.burndown.length]);
  return <canvas ref={ref} />;
}

function ThroughputChart({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const labels = data.burndown.slice(-21).map(d => d.week);
  const series = useMemo(
    () => labels.map((label, i) => stableThroughput(label, i)),
    [labels],
  );
  useChart(ref, () => barV(labels, [{ label: "Assets installed", data: series }]), [labels, series]);
  return <canvas ref={ref} />;
}

/** Deterministic daily throughput for mock/demo charts (no Math.random re-render flicker). */
function stableThroughput(label: string, index: number): number {
  let hash = index * 17;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) | 0;
  }
  return 8 + (Math.abs(hash) % 7);
}

function ForecastChart({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useChart(ref, () => multiLine(
    data.forecast.completion.map(c => c.week),
    [
      { label: "Optimistic", data: data.forecast.completion.map((_, i) => 10 + i * 13), borderColor: "#34d399" },
      { label: "Plan",       data: data.forecast.completion.map((_, i) => 12 + i * 18), borderColor: "#2dd4bf" },
      { label: "Pessimistic",data: data.forecast.completion.map((_, i) => 14 + i * 25), borderColor: "#f87171" },
    ],
  ), [data.forecast.completion.length]);
  return <canvas ref={ref} />;
}

function ProjectLeaderboard({ data }: { data: TimeAnalyticsSnapshot }) {
  const ranked = [...data.projects]
    .map(p => ({ ...p, pct: p.totalAssets > 0 ? Math.round((p.doneAssets / p.totalAssets) * 100) : 0 }))
    .sort((a, b) => b.pct - a.pct);
  return (
    <div>
      {ranked.map((p, i) => {
        const cls = i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "";
        return (
          <div className={`ta-leader-row ${cls}`} key={p.id}>
            <div className="rk">{i + 1}</div>
            <div>
              <span className="nm">{p.name}<span className="sub"> · {p.customerName}</span></span>
            </div>
            <div className="v">{p.pct}<span className="u">%</span></div>
          </div>
        );
      })}
    </div>
  );
}
