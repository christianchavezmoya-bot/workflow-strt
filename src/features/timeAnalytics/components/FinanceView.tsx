import { useMemo, useRef, useState, useEffect } from "react";
import { TextField } from "@mui/material";
import { Card, Kpi, ChartBox } from "./primitives";
import { useChart } from "./useChart";
import { barH, barV, doughnut } from "./ChartTheme";
import type { TimeAnalyticsSnapshot } from "../types";
import type { FinanceSettings } from "../utils/financeSettings";
import { DEFAULT_FINANCE_SETTINGS } from "../utils/financeSettings";

interface FinanceViewProps {
  data: TimeAnalyticsSnapshot;
  financeSettings?: FinanceSettings;
  onFinanceSettingsChange?: (next: FinanceSettings) => void;
}

export function FinanceView({ data, financeSettings, onFinanceSettingsChange }: FinanceViewProps) {
  const f = data.finance;
  const params = f.params ?? financeSettings ?? DEFAULT_FINANCE_SETTINGS;

  const quotedVsActual = useMemo(() => {
    const projects = f.byProject.filter(p => p.actual > 0);
    if (projects.length === 0) return null;
    const quoted = projects.reduce((a, p) => a + p.quoted, 0);
    const actual = projects.reduce((a, p) => a + p.actual, 0);
    if (actual <= 0) return null;
    return {
      pct: Math.round((quoted / actual) * 100),
      overagePct: Math.round(((actual - quoted) / quoted) * 100),
    };
  }, [f.byProject]);

  return (
    <>
      <FinanceSettingsPanel
        settings={params}
        onChange={onFinanceSettingsChange}
      />

      <div className="ta-grid cols-5">
        <Kpi label="Revenue" value={fmt$short(f.revenue)} icon="$" tone="good" hint="labour × multiplier" />
        <Kpi label="Labour Cost" value={fmt$short(f.labourCost)} icon="$" tone="warn" hint={`@${params.hourlyRate}/hr`} />
        <Kpi label="Gross Margin" value={f.marginPct} unit="%" icon="%" tone="good" hint="computed from revenue" />
        <Kpi label="Billable %" value={f.billablePct} unit="%" icon="✓" tone="violet" hint="of hours logged" />
        <Kpi
          label="Quoted vs Actual"
          value={quotedVsActual ? quotedVsActual.pct : "—"}
          unit={quotedVsActual ? "%" : undefined}
          icon="↔"
          hint={quotedVsActual
            ? `${quotedVsActual.overagePct >= 0 ? "+" : ""}${quotedVsActual.overagePct}% vs quoted hours`
            : "no project hours in range"}
        />
      </div>

      <div className="ta-grid cols-12">
        <div className="span-6">
          <Card title="Labour Cost by Installer" sub="Top installers · selected period">
            <ChartBox height="lg"><InstallerCostChart data={data} /></ChartBox>
          </Card>
        </div>
        <div className="span-6">
          <Card title="Quoted vs Actual Hours by Project" sub={`Quoted = actual × ${params.quotedRatio}`}>
            <ChartBox height="lg"><QuotedActualChart data={data} /></ChartBox>
          </Card>
        </div>
      </div>

      <div className="ta-grid cols-12">
        <div className="span-5">
          <Card title="Billable vs Non-Billable" sub="From logged productive vs downtime hours">
            <BillableDonut pct={f.billablePct} />
          </Card>
        </div>
        <div className="span-7">
          <Card title="Project Hours Variance" sub="Quoted minus actual hours (negative = under quoted)">
            <ChartBox height="lg"><ProfitabilityChart data={data} /></ChartBox>
          </Card>
        </div>
      </div>
    </>
  );
}

function FinanceSettingsPanel({
  settings,
  onChange,
}: {
  settings: FinanceSettings;
  onChange?: (next: FinanceSettings) => void;
}) {
  const [draft, setDraft] = useState(settings);

  useEffect(() => {
    setDraft(settings);
  }, [settings.hourlyRate, settings.revenueMultiplier, settings.quotedRatio]);

  const apply = () => {
    onChange?.({
      hourlyRate: Number(draft.hourlyRate) || DEFAULT_FINANCE_SETTINGS.hourlyRate,
      revenueMultiplier: Number(draft.revenueMultiplier) || DEFAULT_FINANCE_SETTINGS.revenueMultiplier,
      quotedRatio: Number(draft.quotedRatio) || DEFAULT_FINANCE_SETTINGS.quotedRatio,
    });
  };

  const fieldSx = {
    "& .MuiOutlinedInput-root": {
      fontSize: 12.5,
      color: "var(--ta-text-dim)",
      background: "rgba(255,255,255,0.04)",
      borderRadius: 1.25,
      "& fieldset": { borderColor: "var(--ta-border)" },
    },
    "& .MuiOutlinedInput-input": { padding: "6px 10px" },
    "& .MuiInputLabel-root": { fontSize: 11, color: "var(--ta-text-mute)" },
  };

  return (
    <div className="ta-finance-settings">
      <div className="hint">
        Adjust labour-rate assumptions below. Values are saved in this browser and sent with each snapshot request.
        Revenue and margin are recalculated from your inputs.
      </div>
      <TextField
        type="number"
        size="small"
        label="Hourly rate ($/hr)"
        value={draft.hourlyRate}
        inputProps={{ min: 1, step: 1 }}
        onChange={e => setDraft(d => ({ ...d, hourlyRate: +e.target.value }))}
        sx={fieldSx}
      />
      <TextField
        type="number"
        size="small"
        label="Revenue multiplier (×)"
        value={draft.revenueMultiplier}
        inputProps={{ min: 1, step: 0.01 }}
        onChange={e => setDraft(d => ({ ...d, revenueMultiplier: +e.target.value }))}
        sx={fieldSx}
      />
      <TextField
        type="number"
        size="small"
        label="Quoted hours ratio"
        value={draft.quotedRatio}
        inputProps={{ min: 0.1, max: 1, step: 0.01 }}
        onChange={e => setDraft(d => ({ ...d, quotedRatio: +e.target.value }))}
        sx={fieldSx}
      />
      <button type="button" className="ta-tag active" style={{ cursor: "pointer", alignSelf: "end" }} onClick={apply}>
        Apply assumptions
      </button>
    </div>
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
  ), [data.finance.byInstaller.length, data.finance.params.hourlyRate]);
  return <canvas ref={ref} />;
}

function QuotedActualChart({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useChart(ref, () => barV(
    data.finance.byProject.map(p => p.name),
    [
      { label: "Quoted", data: data.finance.byProject.map(p => +(p.quoted).toFixed(1)), backgroundColor: "#2dd4bf" },
      { label: "Actual", data: data.finance.byProject.map(p => +(p.actual).toFixed(1)), backgroundColor: "#fbbf24" },
    ],
  ), [data.finance.byProject.length, data.finance.params.quotedRatio]);
  return <canvas ref={ref} />;
}

function BillableDonut({ pct }: { pct: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const nonBillable = Math.max(0, +(100 - pct).toFixed(1));
  useChart(ref, () => doughnut(
    ["Billable", "Non-billable"],
    [pct, nonBillable],
    ["#34d399", "#6b7390"],
  ), [pct]);
  return (
    <div className="ta-donut-row">
      <div style={{ position: "relative", width: 160, height: 160 }}>
        <canvas ref={ref} />
      </div>
      <div className="legend">
        <div className="lg"><span className="sw" style={{ background: "var(--ta-good)" }} /> Billable <span className="v">{pct}%</span></div>
        <div className="lg"><span className="sw" style={{ background: "var(--ta-text-mute)" }} /> Non-billable <span className="v">{nonBillable}%</span></div>
      </div>
    </div>
  );
}

function ProfitabilityChart({ data }: { data: TimeAnalyticsSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useChart(ref, () => barV(
    data.finance.byProject.slice(0, 6).map(p => p.name),
    [{
      label: "Variance h",
      data: data.finance.byProject.slice(0, 6).map(p => Math.round(p.quoted - p.actual)),
      // @ts-expect-error chart.js accepts string[] for per-bar colors
      backgroundColor: data.finance.byProject.slice(0, 6).map((p): string => (p.actual > p.quoted) ? "#f87171" : "#34d399"),
    }],
  ), [data.finance.byProject.length]);
  return <canvas ref={ref} />;
}
