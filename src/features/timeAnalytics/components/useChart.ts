/**
 * useChart — create a Chart.js instance from a canvas ref and clean up on unmount.
 */

import { useEffect, type RefObject } from "react";
import { Chart, type ChartConfiguration, type ChartItem } from "../chartSetup";

export function useChart(
  ref: RefObject<HTMLCanvasElement | null>,
  buildConfig: () => ChartConfiguration,
  deps: ReadonlyArray<unknown> = [],
): void {
  useEffect(() => {
    if (!ref.current) return;
    const ctx = ref.current.getContext("2d");
    if (!ctx) return;

    const chart = new Chart(ctx as ChartItem, buildConfig());

    return () => {
      try { chart.destroy(); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
