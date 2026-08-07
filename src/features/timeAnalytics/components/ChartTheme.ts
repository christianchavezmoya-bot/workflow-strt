/**
 * Chart.js theme + config factories.
 *
 * Each function returns a Chart.js config object. The actual
 * `new Chart(canvas, config)` call is in `mountChart()` so
 * we get lifecycle safety (destroy on unmount, dedup on re-render).
 */

import type { Chart as ChartT, ChartConfiguration } from "chart.js";

// ============================================================
// Theme constants (match styles.css)
// ============================================================

export const TA_PAL = {
  accent:  "#2dd4bf",
  accent2: "#5eead4",
  accent3: "#ff9f45",
  info:    "#3aa1ff",
  good:    "#34d399",
  warn:    "#fbbf24",
  bad:     "#f87171",
  pink:    "#f472b6",
  violet:  "#a78bfa",
  cyan:    "#22d3ee",
  lime:    "#a3e635",
};

export const TA_COLORS = [
  TA_PAL.accent, TA_PAL.accent3, TA_PAL.info, TA_PAL.good, TA_PAL.warn,
  TA_PAL.pink, TA_PAL.violet, TA_PAL.cyan, TA_PAL.lime,
];

const gridColor = "rgba(255, 255, 255, 0.06)";
const tickColor = "#6b7390";

/** Apply global defaults — call once at app boot. */
export function applyGlobalChartTheme(Chart: typeof ChartT): void {
  Chart.defaults.font.family = "Manrope, Sora, system-ui, sans-serif";
  Chart.defaults.font.size   = 11.5;
  Chart.defaults.color       = "#aab1c8";
  Chart.defaults.borderColor = "rgba(255, 255, 255, 0.06)";
  Chart.defaults.responsive  = true;
  Chart.defaults.maintainAspectRatio = false;
}

// ============================================================
// Config factories — typed loosely to avoid Chart.js's verbose
// generic types. The runtime behavior is what matters; the
// chart.js types are slightly stricter than the v4 API in places.
// ============================================================

export type TAConfig = any;

const commonOpts = (extra: any = {}): any => ({
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "rgba(11, 29, 36, 0.95)",
      borderColor: "rgba(255, 255, 255, 0.12)",
      borderWidth: 1,
      titleColor: "#e4edf2",
      bodyColor: "#aab1c8",
      padding: 10,
      cornerRadius: 8,
      displayColors: true,
      boxPadding: 4,
    },
  },
  scales: {
    x: { grid: { color: gridColor }, ticks: { color: tickColor }, border: { display: false } },
    y: { grid: { color: gridColor }, ticks: { color: tickColor }, border: { display: false } },
  },
  ...extra,
});

const legendOn = {
  display: true,
  position: "top" as const,
  align: "end" as const,
  labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: "circle" as const, color: "#aab1c8" },
};

// ============================================================
// Config factories
// ============================================================

export const lineTrend = (labels: string[], prod: number[], down: number[]): TAConfig => ({
  type: "line",
  data: {
    labels,
    datasets: [
      { label: "Productive", data: prod, borderColor: TA_PAL.accent, borderWidth: 2, backgroundColor: "rgba(45,212,191,0.18)", fill: true, tension: 0.35, pointRadius: 0, pointHoverRadius: 5 },
      { label: "Downtime",  data: down, borderColor: TA_PAL.bad,    borderWidth: 1.5, backgroundColor: "rgba(248,113,113,0.06)", fill: true, tension: 0.35, pointRadius: 0, pointHoverRadius: 4, borderDash: [3, 3] },
    ],
  },
  options: commonOpts({
    plugins: { legend: legendOn, tooltip: { mode: "index", intersect: false, backgroundColor: "rgba(11,29,36,0.95)", borderColor: "rgba(255,255,255,0.12)", borderWidth: 1, titleColor: "#e4edf2", bodyColor: "#aab1c8", padding: 10, cornerRadius: 8 } },
    scales: {
      x: { grid: { display: false }, ticks: { color: tickColor }, border: { display: false } },
      y: { grid: { color: gridColor, drawBorder: false }, ticks: { color: tickColor }, border: { display: false } },
    },
    interaction: { mode: "index", intersect: false },
  }),
});

export const barH = (labels: string[], data: number[], color = TA_PAL.accent): TAConfig => ({
  type: "bar",
  data: { labels, datasets: [{ data, backgroundColor: color, borderRadius: 6, maxBarThickness: 18 }] },
  options: commonOpts({
    indexAxis: "y",
    scales: {
      x: { grid: { color: gridColor, drawBorder: false }, ticks: { color: tickColor }, border: { display: false } },
      y: { grid: { display: false }, ticks: { color: "#aab1c8" }, border: { display: false } },
    },
  }),
});

export const barV = (labels: string[], datasets: { label?: string; data: number[]; backgroundColor?: string }[]): TAConfig => {
  const multi = datasets.length > 1;
  return {
    type: "bar",
    data: { labels, datasets: datasets.map((d, i) => ({ ...d, backgroundColor: d.backgroundColor ?? TA_COLORS[i % TA_COLORS.length], borderRadius: 6, maxBarThickness: 22 })) },
    options: commonOpts({
      plugins: { legend: multi ? legendOn : { display: false }, tooltip: { mode: "index", intersect: false, backgroundColor: "rgba(11,29,36,0.95)", borderColor: "rgba(255,255,255,0.12)", borderWidth: 1, titleColor: "#e4edf2", bodyColor: "#aab1c8", padding: 10, cornerRadius: 8 } },
      interaction: { mode: "index", intersect: false },
    }),
  };
};

export const doughnut = (labels: string[], data: number[], colors?: string[]): TAConfig => ({
  type: "doughnut",
  data: { labels, datasets: [{ data, backgroundColor: colors ?? TA_COLORS, borderColor: "rgba(11,29,36,0.85)", borderWidth: 2, hoverOffset: 6 }] },
  options: {
    cutout: "68%",
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: "rgba(11,29,36,0.95)", borderColor: "rgba(255,255,255,0.12)", borderWidth: 1, titleColor: "#e4edf2", bodyColor: "#aab1c8", padding: 10, cornerRadius: 8 },
    },
  },
});

export const radar = (labels: string[], datasets: { label: string; data: number[]; backgroundColor?: string; borderColor?: string }[]): TAConfig => ({
  type: "radar",
  data: { labels, datasets: datasets.map((d, i) => ({ ...d, backgroundColor: d.backgroundColor ?? (TA_COLORS[i] + "33"), borderColor: d.borderColor ?? TA_COLORS[i], pointBackgroundColor: TA_COLORS[i], pointRadius: 2, borderWidth: 1.5 })) },
  options: {
    plugins: { legend: legendOn },
    scales: {
      r: {
        angleLines: { color: "rgba(255,255,255,0.08)" },
        grid: { color: "rgba(255,255,255,0.06)" },
        pointLabels: { color: "#aab1c8", font: { size: 10.5 } },
        ticks: { display: false, backdropColor: "transparent" },
        suggestedMin: 0,
      },
    },
  },
});

export const scatter = (points: { x: number; y: number; name: string; color: string }[]): TAConfig => ({
  type: "scatter",
  data: {
    datasets: [{
      label: "Installers",
      data: points.map(p => ({ x: p.x, y: p.y, name: p.name })),
      backgroundColor: points.map(p => p.color),
      pointRadius: 7,
      pointHoverRadius: 9,
      borderColor: "rgba(255,255,255,0.4)",
      borderWidth: 1,
    }],
  },
  options: commonOpts({
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: "rgba(11,29,36,0.95)", borderColor: "rgba(255,255,255,0.12)", borderWidth: 1, titleColor: "#e4edf2", bodyColor: "#aab1c8", padding: 10, cornerRadius: 8, callbacks: { label: (ctx: any) => `${ctx.raw.name} — ${ctx.raw.x}min, ${ctx.raw.y} defects` } },
    },
    scales: {
      x: { title: { display: true, text: "Avg install time (min)", color: "#aab1c8" }, grid: { color: gridColor }, ticks: { color: tickColor }, border: { display: false } },
      y: { title: { display: true, text: "Defects (last 30d)", color: "#aab1c8" }, grid: { color: gridColor }, ticks: { color: tickColor, stepSize: 1 }, border: { display: false } },
    },
  }),
});

export const stacked = (labels: string[], datasets: { label: string; data: number[]; backgroundColor?: string }[]): TAConfig => ({
  type: "bar",
  data: { labels, datasets: datasets.map((d, i) => ({ ...d, backgroundColor: d.backgroundColor ?? TA_COLORS[i % TA_COLORS.length], borderRadius: 4, maxBarThickness: 32 })) },
  options: commonOpts({
    plugins: { legend: legendOn, tooltip: { mode: "index", intersect: false, backgroundColor: "rgba(11,29,36,0.95)", borderColor: "rgba(255,255,255,0.12)", borderWidth: 1, titleColor: "#e4edf2", bodyColor: "#aab1c8", padding: 10, cornerRadius: 8 } },
    scales: {
      x: { stacked: true, grid: { display: false }, ticks: { color: tickColor }, border: { display: false } },
      y: { stacked: true, grid: { color: gridColor, drawBorder: false }, ticks: { color: tickColor }, border: { display: false } },
    },
    interaction: { mode: "index", intersect: false },
  }),
});

export const multiLine = (labels: string[], datasets: { label: string; data: number[]; borderColor?: string; borderDash?: number[] }[]): TAConfig => ({
  type: "line",
  data: { labels, datasets: datasets.map((d, i) => ({ ...d, borderColor: d.borderColor ?? TA_COLORS[i % TA_COLORS.length], backgroundColor: "transparent", tension: 0.32, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2 })) },
  options: commonOpts({
    plugins: { legend: legendOn, tooltip: { mode: "index", intersect: false, backgroundColor: "rgba(11,29,36,0.95)", borderColor: "rgba(255,255,255,0.12)", borderWidth: 1, titleColor: "#e4edf2", bodyColor: "#aab1c8", padding: 10, cornerRadius: 8 } },
    scales: {
      x: { grid: { display: false }, ticks: { color: tickColor }, border: { display: false } },
      y: { grid: { color: gridColor, drawBorder: false }, ticks: { color: tickColor }, border: { display: false } },
    },
    interaction: { mode: "index", intersect: false },
  }),
});

/** Pareto combo: bar + cumulative line on right axis. */
export const pareto = (
  labels: string[],
  totals: number[],
  cumPct: number[],
): TAConfig => ({
  type: "bar",
  data: {
    labels,
    datasets: [
      { label: "Hours lost",    data: totals, backgroundColor: TA_PAL.warn, borderRadius: 6, maxBarThickness: 22, yAxisID: "y" },
      { label: "Cumulative %", data: cumPct, type: "line", borderColor: TA_PAL.pink, backgroundColor: TA_PAL.pink, borderWidth: 2, pointRadius: 3, yAxisID: "y2", tension: 0.2 },
    ],
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: legendOn, tooltip: { mode: "index", intersect: false, backgroundColor: "rgba(11,29,36,0.95)", borderColor: "rgba(255,255,255,0.12)", borderWidth: 1, titleColor: "#e4edf2", bodyColor: "#aab1c8", padding: 10, cornerRadius: 8 } },
    scales: {
      x: { grid: { display: false }, ticks: { color: tickColor }, border: { display: false } },
      y: { grid: { color: gridColor, drawBorder: false }, ticks: { color: tickColor }, border: { display: false }, title: { display: true, text: "Hours", color: "#aab1c8" } },
      y2: { position: "right", grid: { display: false }, ticks: { color: TA_PAL.pink, callback: (v: any) => v + "%" }, border: { display: false }, max: 100, title: { display: true, text: "Cumulative", color: "#aab1c8" } },
    },
    interaction: { mode: "index", intersect: false },
  },
});

/** Combo: stacked bar (low–high) + line (actual). */
export const comboFan = (labels: string[], fan: { low: number; mid: number; high: number }[], actual: number[]): TAConfig => ({
  type: "bar",
  data: {
    labels,
    datasets: [
      { label: "Low–High", data: fan.map(f => f.high - f.low), backgroundColor: "rgba(45,212,191,0.10)", borderRadius: 8, maxBarThickness: 36, order: 2 },
      { label: "Mid",      data: fan.map(f => f.mid),           backgroundColor: "rgba(45,212,191,0.55)", borderRadius: 8, maxBarThickness: 24, order: 1 },
      { label: "Actual",   data: actual, type: "line", borderColor: TA_PAL.accent3, backgroundColor: TA_PAL.accent3, borderWidth: 2, pointRadius: 3, tension: 0.3, order: 0 },
    ],
  },
  options: commonOpts({
    plugins: { legend: legendOn, tooltip: { mode: "index", intersect: false, backgroundColor: "rgba(11,29,36,0.95)", borderColor: "rgba(255,255,255,0.12)", borderWidth: 1, titleColor: "#e4edf2", bodyColor: "#aab1c8", padding: 10, cornerRadius: 8 } },
    scales: {
      x: { stacked: true, grid: { display: false }, ticks: { color: tickColor }, border: { display: false } },
      y: { stacked: true, grid: { color: gridColor, drawBorder: false }, ticks: { color: tickColor }, border: { display: false } },
    },
    interaction: { mode: "index", intersect: false },
  }),
});

/** Gauge — semicircle doughnut. */
export const gauge = (pct: number): TAConfig => ({
  type: "doughnut",
  data: {
    datasets: [{
      data: [pct, 100 - pct],
      backgroundColor: [TA_PAL.accent, "rgba(255,255,255,0.06)"],
      borderWidth: 0,
      circumference: 270, rotation: 225, cutout: "78%",
    }],
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
  },
});

/** Dual-axis line (for downtime trend where values differ by orders of magnitude). */
export const dualAxisLine = (
  labels: string[],
  seriesA: { label: string; data: number[]; color: string },
  seriesB: { label: string; data: number[]; color: string },
): TAConfig => ({
  type: "line",
  data: {
    labels,
    datasets: [
      { label: seriesA.label, data: seriesA.data, borderColor: seriesA.color, backgroundColor: "rgba(45,212,191,0.12)", fill: true, tension: 0.35, pointRadius: 0, pointHoverRadius: 5, borderWidth: 2, yAxisID: "y" },
      { label: seriesB.label, data: seriesB.data, borderColor: seriesB.color, backgroundColor: "transparent", fill: false, tension: 0.35, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2, borderDash: [4, 3], yAxisID: "y2" },
    ],
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: legendOn, tooltip: { mode: "index", intersect: false, backgroundColor: "rgba(11,29,36,0.95)", borderColor: "rgba(255,255,255,0.12)", borderWidth: 1, titleColor: "#e4edf2", bodyColor: "#aab1c8", padding: 10, cornerRadius: 8 } },
    scales: {
      x: { grid: { display: false }, ticks: { color: tickColor }, border: { display: false } },
      y: { position: "left",  grid: { color: gridColor, drawBorder: false }, ticks: { color: tickColor }, border: { display: false }, title: { display: true, text: seriesA.label, color: seriesA.color } },
      y2:{ position: "right", grid: { display: false }, ticks: { color: tickColor }, border: { display: false }, title: { display: true, text: seriesB.label, color: seriesB.color } },
    },
  },
});
