import { useMemo, useRef } from "react";
import { Card, Kpi, Tag, ChartBox } from "./primitives";
import { useChart } from "./useChart";
import { multiLine, barV, comboFan } from "./ChartTheme";
import type { TimeAnalyticsSnapshot } from "../types";
import { chartDeps } from "../utils/chartSeries";

export function ProjectsView({ data }: { data: TimeAnalyticsSnapshot }) {
  const k = data.kpis;
  const installed = data.projects.reduce((a, b) => a + b.doneAssets, 0);
  const totalAssets = data.projects.reduce((a, b) => a + b.totalAssets, 0);
  const onTimePct = totalAssets > 0
    ? Math.round(data.projects.filter(p => p.health === "good").length / Math.max(data.projects.length, 1) * 100)
    : 0;
  const customerCount = new Set(data.projects.map(p => p.customerId)).size;
  const focusProject = data.projects[0]?.name ?? "—";

  return (
    <>
      <div className="ta-grid cols-5">
        <Kpi label="Active Projects" value={k.projectsActive} icon="▣" tone="default" hint={`${customerCount} customers`} />
        <Kpi label="Assets Installed" value={installed} icon="✓" tone="good" hint="in selected period scope" />
        <Kpi label="Assets Remaining" value={k.assetsRemaining} icon="◌" tone="violet" hint="across filtered projects" />
        <Kpi label="Productive Hours" value={data.projects.reduce((a, b) => a + b.productiveHours, 0).toFixed(1)} unit="h" icon="⏱" hint="selected period" />
        <Kpi label="On Track" value={onTimePct} unit="%" icon="◈" tone="good" hint="projects with good health" />
      </div>

      <div className="ta-grid cols-2">
        {data.projects.map(p => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>

      <div className="ta-grid cols-12">
        <div className="span-7">
          <Card title={`Burn-Down Chart — ${focusProject}`} sub="Assets remaining vs ideal plan">
            <ChartBox height="lg"><BurndownChart data={data} /></ChartBox>
          </Card>
        </div>
        <div className="span-5">
          <Card title="Daily Throughput" sub="Completed assets per day in selected period">
            <ChartBox height="lg"><ThroughputChart data={data} /></ChartBox>
          </Card>
        </div>
      </div>

      <div className="ta-grid cols-12">
        <div className="span-7">
          <Card title="Completion Forecast" sub="Cumulative installs · low / mid / high band from recent throughput">
            <ChartBox height="lg"><ForecastChart data={data} /></ChartBox>
          </Card>
        </div>
        <div className="span-5">
          <Card title="Project Leaderboard" sub="Ranked by % complete">
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
  ), chartDeps(data, data.burndown.map(d => `${d.week}:${d.ideal}:${d.actual}`).join("|")));
  return <canvas ref={ref} />;
}

function ThroughputChart({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const daily = data.throughputDaily ?? [];
  const recent = daily.slice(-28);
  const labels = recent.map(d => d.date.slice(5));
  const series = recent.map(d => d.completions);
  useChart(ref, () => barV(labels, [{ label: "Assets installed", data: series }]), chartDeps(data, labels.join("|"), series.join(",")));
  return <canvas ref={ref} />;
}

function ForecastChart({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useChart(ref, () => comboFan(
    data.forecast.completion.map(c => c.week),
    data.forecast.completion,
    data.forecast.completion.map(c => c.mid * 0.6),
  ), chartDeps(data, data.forecast.completion.map(c => `${c.week}:${c.mid}`).join("|")));
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
