import { Fragment, useMemo, useRef } from "react";
import { Typography } from "@mui/material";
import { Card, Kpi, Tag, ActivityFeed, Avatar, ChartBox } from "./primitives";
import { useChart } from "./useChart";
import { lineTrend, gauge } from "./ChartTheme";
import type { TimeAnalyticsSnapshot } from "../types";
import { formatRangeLabel } from "../utils/datePresets";
import { chartDeps, productiveDowntimeTrend } from "../utils/chartSeries";

export function OverviewView({ data }: { data: TimeAnalyticsSnapshot }) {
  const k = data.kpis;
  const rangeLabel = formatRangeLabel(data.range.from, data.range.to);
  const timelineDay = data.range.to;
  const trendMeta = productiveDowntimeTrend(data);

  return (
    <>
      <div className="ta-grid cols-12">
        <div className="span-8">
          <Card glow>
            <div style={{ padding: "4px 4px" }}>
              <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700 }}>Operations Summary</h2>
              <p style={{ margin: 0, color: "var(--ta-text-dim)", fontSize: 12.5, lineHeight: 1.55 }}>
                Tracking <b style={{ color: "var(--ta-text)" }}>{k.activeInstallers} active installers</b> across{" "}
                <b style={{ color: "var(--ta-text)" }}>{k.projectsActive} projects</b> for{" "}
                <b style={{ color: "var(--ta-text)" }}>{rangeLabel}</b>. Productivity is{" "}
                <b style={{ color: k.productivityPct >= 80 ? "var(--ta-good)" : "var(--ta-warn)" }}>{k.productivityPct}%</b>.
              </p>
              <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Tag tone="cool">{data.projects.length} projects in scope</Tag>
                <Tag tone="violet">{k.assetsRemaining} assets remaining</Tag>
                {k.fastestInstallerName !== "—" && (
                  <Tag tone="good">Fastest: {k.fastestInstallerName}</Tag>
                )}
              </div>
            </div>
          </Card>
        </div>
        <div className="span-4">
          <Card title="Productivity" sub="Selected period">
            <Gauge pct={k.productivityPct} />
          </Card>
        </div>
      </div>

      <div className="ta-grid cols-6">
        <Kpi label="Active Installers" value={k.activeInstallers} icon="⚒" tone="default" hint="with logged runs" />
        <Kpi label="Completed Today" value={k.completedToday} icon="✓" tone="good" hint="UTC completion date" />
        <Kpi label="Productive Hours" value={k.productiveHours.toFixed(1)} unit="h" icon="⏱" hint={rangeLabel} />
        <Kpi label="Downtime Hours" value={k.downtimeHours.toFixed(1)} unit="h" icon="◐" tone="warn" hint={rangeLabel} />
        <Kpi label="Productivity" value={k.productivityPct} unit="%" icon="◈" tone="good" hint="productive / total" />
        <Kpi label="Avg Install" value={k.avgInstallMinutes} unit="min" icon="⏲" tone="violet" hint="completed runs" />
      </div>

      <div className="ta-grid cols-12">
        <div className="span-8">
          <Card title={`Productive vs Downtime — ${rangeLabel}`} sub={trendMeta.subtitle}>
            <ChartBox height="lg">
              <TrendChart data={data} />
            </ChartBox>
          </Card>
        </div>
        <div className="span-4">
          <Card title="Recent Activity" sub="Latest completions and issues">
            <ActivityFeed items={data.activity} max={8} />
          </Card>
        </div>
      </div>

      <div className="ta-grid cols-12">
        <div className="span-8">
          <Card title={`Installer Timeline — ${timelineDay}`} sub="Productive and downtime segments for filter end date">
            <InstallerTimeline data={data} />
          </Card>
        </div>
        <div className="span-4">
          <Card title="Project Health" sub="Status distribution">
            <ProjectHealth data={data} />
          </Card>
        </div>
      </div>

      <div className="ta-grid cols-2">
        <Card title="Top Performers" sub="Ranked by productivity in selected period">
          <Leaderboard data={data} />
        </Card>
        <Card title="Milestones & Alerts" sub="From project health and recent activity">
          <Milestones data={data} />
        </Card>
      </div>
    </>
  );
}

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
  const series = useMemo(() => productiveDowntimeTrend(data), [data]);
  useChart(
    ref,
    () => lineTrend(series.labels, series.productive, series.downtime),
    chartDeps(data, series.granularity, series.labels.join("|"), series.productive.join(","), series.downtime.join(",")),
  );
  return <canvas ref={ref} />;
}

function InstallerTimeline({ data }: { data: TimeAnalyticsSnapshot }) {
  if (data.installerTimeline.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12.5, py: 1 }}>
        No installer segments on {data.range.to}. Try a date with completed workflow runs.
      </Typography>
    );
  }

  return (
    <div>
      <div className="ta-tl">
        {data.installerTimeline.map(it => (
          <Fragment key={it.installerId}>
            <div className="label">
              <Avatar initials={it.initials} color={it.color} />
              <div>
                <div className="name">{it.installerName.split(" ")[0]}</div>
                <div className="role">{it.team}</div>
              </div>
            </div>
            <div className="row">
              {it.segments.map((s, i) => {
                const left = (s.startHour / 24) * 100;
                const width = ((s.endHour - s.startHour) / 24) * 100;
                return (
                  <div
                    key={`${s.kind}-${s.startHour}-${s.endHour}-${i}`}
                    className={`ta-tbar ${s.kind}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${s.label} · ${s.startHour.toFixed(1)}–${s.endHour.toFixed(1)}h`}
                  >
                    {width > 6 ? s.label : ""}
                  </div>
                );
              })}
            </div>
          </Fragment>
        ))}
      </div>
      <div className="ta-tl-legend">
        <div className="leg"><span className="sw" style={{ background: "linear-gradient(90deg, #2dd4bf, #5eead4)" }} /> Productive</div>
        <div className="leg"><span className="sw" style={{ background: "repeating-linear-gradient(45deg, #f87171 0 4px, #b14545 4px 8px)" }} /> Downtime</div>
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

function Milestones({ data }: { data: TimeAnalyticsSnapshot }) {
  const items = useMemo(() => {
    const out: { type: "good" | "warn" | "bad"; text: string; time: string }[] = [];

    for (const p of data.projects) {
      const pct = p.totalAssets > 0 ? Math.round((p.doneAssets / p.totalAssets) * 100) : 0;
      if (p.health === "bad") {
        out.push({
          type: "warn",
          text: `<b>${p.name}</b> is behind schedule — ${pct}% complete, due ${p.due}.`,
          time: "alert",
        });
      } else if (p.health === "warn") {
        out.push({
          type: "warn",
          text: `<b>${p.name}</b> flagged at risk — ${pct}% complete.`,
          time: "alert",
        });
      } else if (pct >= 50 && pct < 100) {
        out.push({
          type: "good",
          text: `<b>${p.name}</b> passed ${pct}% completion milestone.`,
          time: "milestone",
        });
      }
    }

    for (const ev of data.activity.filter(a => a.type !== "good").slice(0, 4)) {
      out.push({ type: ev.type, text: ev.text, time: formatFeedTime(ev.timestamp) });
    }

    for (const ev of data.activity.filter(a => a.type === "good").slice(0, 3)) {
      out.push({ type: "good", text: ev.text, time: formatFeedTime(ev.timestamp) });
    }

    return out.slice(0, 8);
  }, [data]);

  if (items.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12.5, py: 1 }}>
        No milestones or alerts in the selected period. Try widening the date range or completing workflow runs.
      </Typography>
    );
  }

  return (
    <div className="ta-feed">
      {items.map((it, i) => (
        <div className="ta-feed-item" key={i}>
          <div className={`ico ${it.type}`}>{it.type === "good" ? "✓" : "!"}</div>
          <div className="text" dangerouslySetInnerHTML={{ __html: it.text }} />
          <div className="time">{it.time}</div>
        </div>
      ))}
    </div>
  );
}

function formatFeedTime(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "recent";
  const mins = Math.round((Date.now() - ts) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString();
}
