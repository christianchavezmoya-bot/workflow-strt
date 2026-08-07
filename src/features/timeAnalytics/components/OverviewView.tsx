import { useMemo, useRef } from "react";
import { Card, Kpi, Tag, ActivityFeed, Avatar, ChartBox, SectionHeader, MiniBar } from "./primitives";
import { useChart } from "./useChart";
import { lineTrend, gauge } from "./ChartTheme";
import type { TimeAnalyticsSnapshot } from "../types";

export function OverviewView({ data }: { data: TimeAnalyticsSnapshot }) {
  const k = data.kpis;

  return (
    <>
      {/* Hero / live strip */}
      <div className="ta-grid cols-12">
        <div className="span-8">
          <Card glow>
            <div style={{ padding: "4px 4px" }}>
              <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700 }}>Live Operations Command Center</h2>
              <p style={{ margin: 0, color: "var(--ta-text-dim)", fontSize: 12.5, lineHeight: 1.55 }}>
                Tracking <b style={{ color: "var(--ta-text)" }}>{k.activeInstallers} active installers</b> across{" "}
                <b style={{ color: "var(--ta-text)" }}>{k.projectsActive} projects</b>. Today's productivity is{" "}
                <b style={{ color: "var(--ta-good)" }}>{k.productivityPct}%</b> — system is healthy and on plan.
              </p>
              <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Tag tone="good">● All crews connected</Tag>
                <Tag tone="cool">◐ Benchmark sync 2m ago</Tag>
                <Tag tone="violet">⌖ Forecast stable</Tag>
              </div>
            </div>
          </Card>
        </div>
        <div className="span-4">
          <Card title="Productivity" sub="Real-time across all crews">
            <Gauge pct={k.productivityPct} />
          </Card>
        </div>
      </div>

      {/* KPI strip */}
      <div className="ta-grid cols-6">
        <Kpi label="Active Installers" value={k.activeInstallers} icon="⚒" tone="default"
             delta={{ dir: "up", text: "2 vs yesterday" }} hint="across 5 teams" />
        <Kpi label="Completed Today" value={k.completedToday} icon="✓" tone="good"
             delta={{ dir: "up", text: "18% wk avg" }} />
        <Kpi label="Productive Hours" value={k.productiveHours.toFixed(1)} unit="h" icon="⏱"
             delta={{ dir: "up", text: "4.2% vs last wk" }} />
        <Kpi label="Downtime Hours" value={k.downtimeHours.toFixed(1)} unit="h" icon="◐" tone="warn"
             delta={{ dir: "down", text: "12% permit delays" }} />
        <Kpi label="Productivity" value={k.productivityPct} unit="%" icon="◈" tone="good"
             delta={{ dir: "up", text: "1.4 pp vs 85% target" }} />
        <Kpi label="Avg Install" value={k.avgInstallMinutes} unit="min" icon="⏲" tone="violet"
             delta={{ dir: "down", text: "8 min improving" }} />
      </div>

      {/* Trend + Activity */}
      <div className="ta-grid cols-12">
        <div className="span-8">
          <Card title="Productive vs Downtime — last 30 days" sub="Daily aggregates across all active crews" action={<span style={{ fontSize: 11 }}>Export</span>}>
            <ChartBox height="lg">
              <TrendChart data={data} />
            </ChartBox>
          </Card>
        </div>
        <div className="span-4">
          <Card title="Live Activity" sub="Streaming events from field devices" action={<span style={{ fontSize: 11 }}>● Live</span>}>
            <ActivityFeed items={data.activity} max={8} />
          </Card>
        </div>
      </div>

      {/* Timeline + project health */}
      <div className="ta-grid cols-12">
        <div className="span-8">
          <Card title="Live Installer Timeline — today" sub="Productive · Downtime · Travel · Breaks" action={<span style={{ fontSize: 11 }}>Now</span>}>
            <InstallerTimeline data={data} />
          </Card>
        </div>
        <div className="span-4">
          <Card title="Project Health" sub="Status distribution across all projects">
            <ProjectHealth data={data} />
          </Card>
        </div>
      </div>

      {/* Top performers + milestones */}
      <div className="ta-grid cols-2">
        <Card title="Today's Top Performers" sub="Ranked by productivity, install count and quality">
          <Leaderboard data={data} />
        </Card>
        <Card title="Milestones & Alerts" sub="Auto-detected from workflows, downtime & quality signals">
          <Milestones />
        </Card>
      </div>
    </>
  );
}

// ----- Sub-components for Overview -----

function Gauge({ pct }: { pct: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useChart(ref, () => gauge(pct), [pct]);
  return (
    <div className="ta-gauge" style={{ height: 180 }}>
      <canvas ref={ref} />
      <div className="ta-gauge-text">
        <div className="v">{pct}%</div>
        <div className="l">Productivity</div>
      </div>
    </div>
  );
}

function TrendChart({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const series = useMemo(() => {
    // Derive 30-day series from the heatmap-like monthly aggregate plus daily noise
    const prod = data.downtime.trendMonthly.map(t => t.productive / 22);
    const down = data.downtime.trendMonthly.map(t => t.downtime / 22);
    return {
      labels: data.downtime.trendMonthly.map(t => t.month),
      prod, down,
    };
  }, [data]);
  useChart(ref, () => lineTrend(series.labels, series.prod, series.down), [series.labels.join(",")]);
  return <canvas ref={ref} />;
}

function InstallerTimeline({ data }: { data: TimeAnalyticsSnapshot }) {
  return (
    <div>
      <div className="ta-tl">
        {data.installerTimeline.map(it => (
          <>
            <div className="label" key={`l-${it.installerId}`}>
              <Avatar initials={it.initials} color={it.color} />
              <div>
                <div className="name">{it.installerName.split(" ")[0]}</div>
                <div className="role">{it.team}</div>
              </div>
            </div>
            <div className="row" key={`r-${it.installerId}`}>
              {it.segments.map((s, i) => {
                const left = (s.startHour / 24) * 100;
                const width = ((s.endHour - s.startHour) / 24) * 100;
                return (
                  <div
                    key={i}
                    className={`ta-tbar ${s.kind}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${s.label} · ${s.startHour.toFixed(1)}–${s.endHour.toFixed(1)}h`}
                  >
                    {width > 6 ? s.label : ""}
                  </div>
                );
              })}
            </div>
          </>
        ))}
      </div>
      <div className="ta-tl-legend">
        <div className="leg"><span className="sw" style={{ background: "linear-gradient(90deg, #2dd4bf, #5eead4)" }} /> Productive</div>
        <div className="leg"><span className="sw" style={{ background: "repeating-linear-gradient(45deg, #f87171 0 4px, #b14545 4px 8px)" }} /> Downtime</div>
        <div className="leg"><span className="sw" style={{ background: "linear-gradient(90deg, #fbbf24, #f59e0b)" }} /> Travel</div>
        <div className="leg"><span className="sw" style={{ background: "rgba(255,255,255,0.10)", border: "1px dashed var(--ta-border-hi)" }} /> Break</div>
      </div>
    </div>
  );
}

function ProjectHealth({ data }: { data: TimeAnalyticsSnapshot }) {
  const total = data.projects.length || 1;
  const onTrack = data.projects.filter(p => p.health === "good").length;
  const atRisk  = data.projects.filter(p => p.health === "warn").length;
  const behind  = data.projects.filter(p => p.health === "bad").length;
  const pct = (n: number) => Math.round((n / total) * 100);
  return (
    <div className="ta-donut-row" style={{ alignItems: "center" }}>
      <div style={{ position: "relative", width: 140, height: 140 }}>
        <ProjectDonut onTrack={onTrack} atRisk={atRisk} behind={behind} />
      </div>
      <div className="legend">
        <div className="lg">
          <span className="sw" style={{ background: "var(--ta-good)" }} /> On Track ({onTrack})
          <span className="v">{pct(onTrack)}%</span>
        </div>
        <div className="lg">
          <span className="sw" style={{ background: "var(--ta-warn)" }} /> At Risk ({atRisk})
          <span className="v">{pct(atRisk)}%</span>
        </div>
        <div className="lg">
          <span className="sw" style={{ background: "var(--ta-bad)" }} /> Behind ({behind})
          <span className="v">{pct(behind)}%</span>
        </div>
      </div>
    </div>
  );
}

function ProjectDonut({ onTrack, atRisk, behind }: { onTrack: number; atRisk: number; behind: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cfg = useMemo(() => ({
    type: "doughnut" as const,
    data: { labels: ["On Track", "At Risk", "Behind"], datasets: [{ data: [onTrack, atRisk, behind], backgroundColor: ["#34d399", "#fbbf24", "#f87171"], borderColor: "rgba(11,29,36,0.85)", borderWidth: 2 }] },
    options: { cutout: "70%", plugins: { legend: { display: false }, tooltip: { enabled: false } } },
  }), [onTrack, atRisk, behind]);
  useChart(ref, () => cfg, [onTrack, atRisk, behind]);
  return <canvas ref={ref} />;
}

function Leaderboard({ data }: { data: TimeAnalyticsSnapshot }) {
  const top = [...data.installers].sort((a, b) => b.productivityPct - a.productivityPct).slice(0, 6);
  return (
    <div>
      {top.map((r, i) => {
        const cls = i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "";
        return (
          <div className={`ta-leader-row ${cls}`} key={r.id}>
            <div className="rk">{i + 1}</div>
            <div>
              <Avatar initials={r.initials} color={r.color} />
              <span className="nm">{r.name}<span className="sub"> · {r.team} · {r.region}</span></span>
            </div>
            <div className="v">{r.productivityPct.toFixed(1)}<span className="u">%</span></div>
          </div>
        );
      })}
    </div>
  );
}

function Milestones() {
  const items = [
    { type: "good" as const, text: "<b>5,000th install</b> completed this quarter at Aurora Substation 12." },
    { type: "good" as const, text: "<b>Priya Raman</b> set new personal record: 142m avg on TrioMeter X." },
    { type: "warn" as const, text: "<b>3 weather holds</b> currently active — NSW team Alpha rescheduling." },
    { type: "good" as const, text: "Benchmark engine updated <b>14 expected-time</b> models overnight." },
    { type: "good" as const, text: "<b>Meridian Water</b> contract renewal signed — 460 additional assets." },
  ];
  return (
    <div className="ta-feed">
      {items.map((it, i) => (
        <div className="ta-feed-item" key={i}>
          <div className={`ico ${it.type}`}>{it.type === "good" ? "✓" : "!"}</div>
          <div className="text" dangerouslySetInnerHTML={{ __html: it.text }} />
          <div className="time">today</div>
        </div>
      ))}
    </div>
  );
}
