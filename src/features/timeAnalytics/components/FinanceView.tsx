import { useMemo, useRef } from "react";
import { Card, Kpi, ChartBox, MiniBar } from "./primitives";
import { useChart } from "./useChart";
import { barH, barV, doughnut } from "./ChartTheme";
import type { TimeAnalyticsSnapshot } from "../types";

export function FinanceView({ data }: { data: TimeAnalyticsSnapshot }) {
  const f = data.finance;
  return (
    <>
      <div className="ta-grid cols-5">
        <Kpi label="Revenue (MTD)" value={fmt$short(f.revenue)} icon="$" tone="good" delta={{ dir: "up", text: "8.2% vs last mo" }} />
        <Kpi label="Labour Cost" value={fmt$short(f.labourCost)} icon="$" tone="warn" hint="this period" />
        <Kpi label="Gross Margin" value={f.marginPct} unit="%" icon="%" tone="good" hint="blended" />
        <Kpi label="Billable %" value={f.billablePct} unit="%" icon="✓" tone="violet" hint="of hours logged" />
        <Kpi label="Quoted vs Actual" value="92" unit="%" icon="↔" hint="8% overage" />
      </div>

      <div className="ta-grid cols-12">
        <div className="span-6">
          <Card title="Labour Cost by Installer" sub="Top 8 · period-to-date">
            <ChartBox height="lg"><InstallerCostChart data={data} /></ChartBox>
          </Card>
        </div>
        <div className="span-6">
          <Card title="Quoted vs Actual Hours by Project" sub="Grouped comparison · overage highlighted">
            <ChartBox height="lg"><QuotedActualChart data={data} /></ChartBox>
          </Card>
        </div>
      </div>

      <div className="ta-grid cols-12">
        <div className="span-5">
          <Card title="Billable vs Non-Billable" sub="Hours classified by work type">
            <BillableDonut pct={f.billablePct} />
          </Card>
        </div>
        <div className="span-7">
          <Card title="Project Profitability" sub="Revenue − labour − materials per project">
            <ChartBox height="lg"><ProfitabilityChart data={data} /></ChartBox>
          </Card>
        </div>
      </div>
    </>
  );
}

function fmt$short(n: number): string {
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(0) + "k";
  return "$" + n;
}

function InstallerCostChart({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useChart(ref, () => barH(
    data.finance.byInstaller.map(i => i.name.split(" ")[0]),
    data.finance.byInstaller.map(i => i.cost),
    "#ff9f45",
  ), [data.finance.byInstaller.length]);
  return <canvas ref={ref} />;
}

function QuotedActualChart({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useChart(ref, () => barV(
    data.finance.byProject.map(p => p.name),
    [
      { label: "Quoted", data: data.finance.byProject.map(p => +(p.quoted / 1000).toFixed(1)), backgroundColor: "#2dd4bf" },
      { label: "Actual", data: data.finance.byProject.map(p => +(p.actual / 1000).toFixed(1)), backgroundColor: "#fbbf24" },
    ],
  ), [data.finance.byProject.length]);
  return <canvas ref={ref} />;
}

function BillableDonut({ pct }: { pct: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useChart(ref, () => doughnut(
    ["Billable", "Non-billable", "Rework"],
    [pct, +(100 - pct - 5.5).toFixed(1), 5.5],
    ["#34d399", "#6b7390", "#fbbf24"],
  ), [pct]);
  return (
    <div className="ta-donut-row">
      <div style={{ position: "relative", width: 160, height: 160 }}>
        <canvas ref={ref} />
      </div>
      <div className="legend">
        <div className="lg"><span className="sw" style={{ background: "var(--ta-good)" }} /> Billable <span className="v">{pct}%</span></div>
        <div className="lg"><span className="sw" style={{ background: "var(--ta-text-mute)" }} /> Non-billable <span className="v">{(100 - pct - 5.5).toFixed(1)}%</span></div>
        <div className="lg"><span className="sw" style={{ background: "var(--ta-warn)" }} /> Rework <span className="v">5.5%</span></div>
      </div>
    </div>
  );
}

function ProfitabilityChart({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useChart(ref, () => barV(
    data.finance.byProject.slice(0, 6).map(p => p.name),
    [{
      label: "Margin $k",
      data: data.finance.byProject.slice(0, 6).map(p => Math.round((p.quoted - p.actual) / 1000)),
      // @ts-ignore - chart.js types say string but runtime accepts string[]
      backgroundColor: data.finance.byProject.slice(0, 6).map((p): string => (p.actual > p.quoted) ? "#f87171" : "#34d399"),
    }],
  ), [data.finance.byProject.length]);
  return <canvas ref={ref} />;
}
