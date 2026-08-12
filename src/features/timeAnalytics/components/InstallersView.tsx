import { Fragment, useMemo, useRef } from "react";
import { Card, Kpi, Tag, Avatar, ChartBox, MiniBar } from "./primitives";
import { useChart } from "./useChart";
import { barH } from "./ChartTheme";
import type { TimeAnalyticsSnapshot } from "../types";
import { formatRangeLabel } from "../utils/datePresets";

export function InstallersView({ data }: { data: TimeAnalyticsSnapshot }) {
  const k = data.kpis;
  const rangeLabel = formatRangeLabel(data.range.from, data.range.to);
  const fastest = [...data.installers].sort((a, b) => a.avgInstallMinutes - b.avgInstallMinutes)[0];

  return (
    <>
      <div className="ta-grid cols-5">
        <Kpi label="Active Installers" value={k.activeInstallers} icon="⚒" tone="default" hint={rangeLabel} />
        <Kpi label="Avg Productivity" value={avg(data.installers.map(i => i.productivityPct)).toFixed(1)} unit="%" icon="◈" tone="good" hint="team-wide" />
        <Kpi label="Top Avg Speed" value={fastest?.avgInstallMinutes ?? 0} unit="min" icon="⏲" tone="violet" hint={fastest?.name ?? "—"} />
        <Kpi label="Total Completions" value={data.installers.reduce((a, b) => a + b.completions, 0)} icon="✓" tone="good" hint={rangeLabel} />
        <Kpi label="Issues Logged" value={data.installers.reduce((a, b) => a + b.defects, 0)} icon="↺" tone="warn" hint="from workflow runs" />
      </div>

      <div className="ta-grid cols-12">
        <div className="span-8">
          <Card title="Installer Performance Ranking" sub={`Sorted by productivity · ${rangeLabel}`}>
            <InstallerTable data={data} />
          </Card>
        </div>
        <div className="span-4" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card title="Fastest Installers" sub="Lowest average install time">
            <FastestList data={data} />
          </Card>
          <Card title="Activity Heatmap" sub="Productive minutes by hour of day">
            <Heatmap data={data} />
          </Card>
        </div>
      </div>

      <div className="ta-grid cols-2">
        <Card title="Productivity Ranking" sub="Productive / (Productive + Downtime)">
          <ChartBox height="lg">
            <ProductivityChart data={data} />
          </ChartBox>
        </Card>
        <Card title="Downtime Ranking" sub={`Non-productive hours · ${rangeLabel}`}>
          <ChartBox height="lg">
            <DowntimeChart data={data} />
          </ChartBox>
        </Card>
      </div>
    </>
  );
}

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function InstallerTable({ data }: { data: TimeAnalyticsSnapshot }) {
  const rows = [...data.installers].sort((a, b) => b.productivityPct - a.productivityPct);
  return (
    <div className="ta-tbl-wrap">
      <table className="ta-tbl">
        <thead>
          <tr>
            <th>Installer</th><th>Team</th><th>Region</th>
            <th className="num">Completions</th><th>Productivity</th>
            <th className="num">Avg Duration</th><th className="num">Productive h</th>
            <th className="num">Downtime h</th><th className="num">Issues</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(i => (
            <tr key={i.id}>
              <td className="name">
                <Avatar initials={i.initials} color={i.color} />
                {i.name}<span className="sub">{i.role}</span>
              </td>
              <td><Tag>{i.team}</Tag></td>
              <td>{i.region}</td>
              <td className="num">{i.completions}</td>
              <td>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <MiniBar pct={i.productivityPct} tone="good" width={90} />
                  <span style={{ fontSize: 10.5, color: "var(--ta-text-mute)" }}>{i.productivityPct.toFixed(1)}%</span>
                </div>
              </td>
              <td className="num">{i.avgInstallMinutes} min</td>
              <td className="num">{i.productiveHours.toFixed(1)}</td>
              <td className="num" style={{ color: i.downtimeHours > 25 ? "var(--ta-bad)" : "var(--ta-text-dim)" }}>{i.downtimeHours.toFixed(1)}</td>
              <td className="num">{i.defects === 0 ? "—" : <Tag tone={i.defects > 2 ? "bad" : "warn"}>{i.defects}</Tag>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FastestList({ data }: { data: TimeAnalyticsSnapshot }) {
  const top = [...data.installers].sort((a, b) => a.avgInstallMinutes - b.avgInstallMinutes).slice(0, 5);
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
            <div className="v">{r.avgInstallMinutes}<span className="u"> min</span></div>
          </div>
        );
      })}
    </div>
  );
}

function Heatmap({ data }: { data: TimeAnalyticsSnapshot }) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <div>
      <div className="ta-heat-grid">
        <div />
        {Array.from({ length: 24 }, (_, h) => <div className="ta-heat-axis" key={h}>{h % 3 === 0 ? h : ""}</div>)}
        {days.map(day => (
          <Fragment key={day}>
            <div className="ta-heat-day">{day}</div>
            {Array.from({ length: 24 }, (_, h) => {
              const cell = data.heatmap.find(c => c.day === day && c.hour === h);
              const intensity = cell ? cell.intensity : 0;
              return (
                <div
                  className="ta-heat-cell"
                  key={`${day}-${h}`}
                  style={{ background: `rgba(45, 212, 191, ${(0.04 + intensity * 0.85).toFixed(2)})` }}
                  title={`${day} ${h}:00 — intensity ${(intensity * 100).toFixed(0)}%`}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
      <div className="ta-heat-scale">
        Less
        <div className="bar">
          {[0.1, 0.3, 0.5, 0.7, 0.9].map((a, i) => <span key={i} style={{ background: `rgba(45, 212, 191, ${a})` }} />)}
        </div>
        More
      </div>
    </div>
  );
}

function ProductivityChart({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sorted = useMemo(() => [...data.installers].sort((a, b) => b.productivityPct - a.productivityPct), [data]);
  useChart(ref, () => barH(sorted.map(i => i.name.split(" ")[0]), sorted.map(i => i.productivityPct), "#2dd4bf"), [sorted.map(s => s.id).join(",")]);
  return <canvas ref={ref} />;
}

function DowntimeChart({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sorted = useMemo(() => [...data.installers].sort((a, b) => b.downtimeHours - a.downtimeHours), [data]);
  useChart(ref, () => barH(sorted.map(i => i.name.split(" ")[0]), sorted.map(i => i.downtimeHours), "#f87171"), [sorted.map(s => s.id).join(",")]);
  return <canvas ref={ref} />;
}
