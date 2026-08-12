/**
 * TimeAnalyticsPage — hosts all 10 analytics sub-views inside Strata AppShell.
 * Chart.js and view components load only when this route is visited.
 */

import { Suspense, lazy, useEffect, useMemo, useRef, type ComponentType } from "react";
import { MenuItem, Select, FormControl, TextField } from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../../../services/api";
import { useTimeAnalyticsData } from "../hooks/useTimeAnalyticsData";
import { applyGlobalChartTheme } from "../components/ChartTheme";
import { ErrorState, LoadingState } from "../components/primitives";
import type { TimeAnalyticsSnapshot } from "../types";
import {
  DATE_PRESETS,
  detectPreset,
  formatRangeLabel,
  rangeForPreset,
  type DatePresetId,
} from "../utils/datePresets";
import { exportSnapshotCsv } from "../utils/exportCsv";
import type { FinanceSettings } from "../utils/financeSettings";

type ViewComponent = ComponentType<{
  data: TimeAnalyticsSnapshot;
  financeSettings?: FinanceSettings;
  onFinanceSettingsChange?: (next: FinanceSettings) => void;
}>;

const lazyView = (loader: () => Promise<{ [key: string]: ViewComponent }>, exportName: string) =>
  lazy(async () => {
    const mod = await loader();
    return { default: mod[exportName] };
  });

export const TIME_ANALYTICS_VIEWS = [
  { id: "overview",   label: "Overview",   icon: "◈" },
  { id: "installers", label: "Installers", icon: "⚒" },
  { id: "projects",   label: "Projects",   icon: "▣" },
  { id: "assets",     label: "Assets",     icon: "▦" },
  { id: "products",   label: "Products",   icon: "▤" },
  { id: "customers",  label: "Customers",  icon: "◉" },
  { id: "downtime",   label: "Downtime",   icon: "◐" },
  { id: "finance",    label: "Finance",    icon: "$" },
  { id: "forecasts",  label: "Forecasts",  icon: "↗" },
  { id: "benchmarks", label: "Benchmarks", icon: "⌖" },
] as const;

export type TimeAnalyticsViewId = typeof TIME_ANALYTICS_VIEWS[number]["id"];

const VIEW_LOADERS = {
  overview: lazyView(() => import("../components/OverviewView"), "OverviewView"),
  installers: lazyView(() => import("../components/InstallersView"), "InstallersView"),
  projects: lazyView(() => import("../components/ProjectsView"), "ProjectsView"),
  assets: lazyView(() => import("../components/AssetsView"), "AssetsView"),
  products: lazyView(() => import("../components/ProductsView"), "ProductsView"),
  customers: lazyView(() => import("../components/CustomersView"), "CustomersView"),
  downtime: lazyView(() => import("../components/DowntimeView"), "DowntimeView"),
  finance: lazyView(() => import("../components/FinanceView"), "FinanceView"),
  forecasts: lazyView(() => import("../components/ForecastsView"), "ForecastsView"),
  benchmarks: lazyView(() => import("../components/BenchmarksView"), "BenchmarksView"),
} satisfies Record<TimeAnalyticsViewId, ReturnType<typeof lazyView>>;

export interface TimeAnalyticsPageProps {
  api?: typeof api;
  refreshIntervalMs?: number;
}

export default function TimeAnalyticsPage(props: TimeAnalyticsPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const themeAppliedRef = useRef(false);

  useEffect(() => {
    if (themeAppliedRef.current) return;
    applyGlobalChartTheme();
    themeAppliedRef.current = true;
  }, []);

  const activeView = useMemo<TimeAnalyticsViewId>(() => {
    const seg = location.pathname.split("/").filter(Boolean).pop();
    if (seg === "time-analytics") return "overview";
    const found = TIME_ANALYTICS_VIEWS.find(v => v.id === seg);
    return found ? found.id : "overview";
  }, [location.pathname]);

  const {
    data,
    loading,
    error,
    filters,
    setFilters,
    financeSettings,
    setFinanceSettings,
    refresh,
  } = useTimeAnalyticsData({
    api: props.api ?? api,
    refreshIntervalMs: props.refreshIntervalMs,
  });

  const activePreset = detectPreset(filters.from, filters.to);
  const rangeLabel = data
    ? formatRangeLabel(data.range.from, data.range.to)
    : formatRangeLabel(filters.from ?? "", filters.to ?? "");

  const showSparseDataHint =
    !!data && data.projects.length === 0 && data.customers.length === 0;

  const switchView = (id: TimeAnalyticsViewId) => {
    navigate(id === "overview" ? "/time-analytics" : `/time-analytics/${id}`);
  };

  const applyPreset = (id: DatePresetId) => {
    if (id === "custom") return;
    const preset = DATE_PRESETS.find(p => p.id === id);
    if (!preset) return;
    const range = rangeForPreset(preset);
    setFilters({ ...filters, from: range.from, to: range.to });
  };

  const ActiveView = VIEW_LOADERS[activeView];

  return (
    <div className="ta-root">
      <nav className="ta-tabs" role="tablist" aria-label="Time Analytics views">
        {TIME_ANALYTICS_VIEWS.map(v => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={v.id === activeView}
            className={`ta-tab ${v.id === activeView ? "active" : ""}`}
            onClick={() => switchView(v.id)}
            data-tour={`ta-tab-${v.id}`}
          >
            <span className="ico">{v.icon}</span>
            <span>{v.label}</span>
          </button>
        ))}
      </nav>

      <div className="ta-filters">
        <span className="label">Period</span>
        {DATE_PRESETS.map(p => (
          <button
            key={p.id}
            type="button"
            className={`ta-tag ${activePreset === p.id ? "active" : ""}`}
            style={{ cursor: "pointer" }}
            onClick={() => applyPreset(p.id)}
          >
            {p.label}
          </button>
        ))}

        <DateChip
          label="From"
          value={filters.from ?? ""}
          onChange={v => setFilters({ ...filters, from: v })}
        />
        <DateChip
          label="To"
          value={filters.to ?? ""}
          onChange={v => setFilters({ ...filters, to: v })}
        />

        {data && data.customers.length > 0 && (
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <Select
              displayEmpty
              value={filters.customerId ?? ""}
              onChange={e => setFilters({ ...filters, customerId: e.target.value as string, projectId: "" })}
              sx={filterSelectSx}
            >
              <MenuItem value="">All customers</MenuItem>
              {data.customers.map(c => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {data && data.products.length > 0 && (
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <Select
              displayEmpty
              value={filters.productId ?? ""}
              onChange={e => setFilters({ ...filters, productId: e.target.value as string })}
              sx={filterSelectSx}
            >
              <MenuItem value="">All products</MenuItem>
              {data.products.map(p => (
                <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {data && data.projects.length > 0 && (
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <Select
              displayEmpty
              value={filters.projectId ?? ""}
              onChange={e => setFilters({ ...filters, projectId: e.target.value as string })}
              sx={filterSelectSx}
            >
              <MenuItem value="">All projects</MenuItem>
              {(filters.customerId
                ? data.projects.filter(p => p.customerId === filters.customerId)
                : data.projects
              ).map(p => (
                <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {data && (
          <button
            type="button"
            className="ta-tag"
            style={{ cursor: "pointer" }}
            onClick={() => exportSnapshotCsv(data, activeView)}
            title="Export current view as CSV"
          >
            ↓ CSV
          </button>
        )}

        <button
          type="button"
          className="ta-tag"
          style={{ cursor: "pointer" }}
          onClick={() => void refresh()}
          title="Refresh"
        >
          ↻ Refresh
        </button>

        <span className="ta-range-hint">{rangeLabel}</span>
      </div>

      {error && (
        <ErrorState message={error} onRetry={() => void refresh()} />
      )}

      {showSparseDataHint && (
        <div className="ta-sparse-hint" role="status">
          Snapshot returned no projects or customers for the selected filters.
          Widen the date range or complete workflow runs to populate analytics.
        </div>
      )}

      {loading && !data ? (
        <LoadingState label="Loading time analytics…" />
      ) : data ? (
        <div key={activeView} className="ta-view-anim">
          <Suspense fallback={<LoadingState label="Loading view…" />}>
            <ActiveView
              data={data}
              financeSettings={financeSettings}
              onFinanceSettingsChange={setFinanceSettings}
            />
          </Suspense>
        </div>
      ) : null}
    </div>
  );
}

const filterSelectSx = {
  fontSize: 12.5,
  color: "var(--ta-text-dim)",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid var(--ta-border)",
  borderRadius: 1.25,
  "& .MuiSelect-select": { padding: "6px 10px" },
};

function DateChip({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <TextField
      type="date"
      size="small"
      label={label}
      value={value}
      onChange={e => onChange(e.target.value)}
      InputLabelProps={{ shrink: true, sx: { fontSize: 11, color: "var(--ta-text-mute)" } }}
      sx={{
        "& .MuiOutlinedInput-root": {
          fontSize: 12.5,
          color: "var(--ta-text-dim)",
          background: "rgba(255,255,255,0.04)",
          borderRadius: 1.25,
          "& fieldset": { borderColor: "var(--ta-border)" },
          "&:hover fieldset": { borderColor: "var(--ta-border-hi)" },
        },
        "& .MuiOutlinedInput-input": { padding: "6px 10px" },
      }}
    />
  );
}
