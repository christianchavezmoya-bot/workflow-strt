/**
 * useChart — create a Chart.js instance from a canvas ref and clean up on unmount.
 *
 * Pattern:
 *   const canvasRef = useRef<HTMLCanvasElement>(null);
 *   useChart(canvasRef, () => lineTrend(labels, prod, down));
 *
 * Re-renders destroy the previous chart and create a new one.
 * Safe for hot-reload and route changes.
 */

import { useEffect, type RefObject } from "react";
import { Chart, type ChartConfiguration, type ChartItem } from "chart.js";
import { ensureChartJsRegistered } from "./ChartTheme";

export function useChart(
  ref: RefObject<HTMLCanvasElement | null>,
  buildConfig: () => ChartConfiguration,
  deps: ReadonlyArray<unknown> = [],
): void {
  useEffect(() => {
    if (!ref.current) return;
    const ctx = ref.current.getContext("2d");
    if (!ctx) return;

    ensureChartJsRegistered();
    const chart = new Chart(ctx as ChartItem, buildConfig());

    return () => {
      try { chart.destroy(); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
