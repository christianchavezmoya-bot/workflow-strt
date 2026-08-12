/**
 * useChart — create a Chart.js instance from a canvas ref and clean up on unmount.
 * Rebuilds when `deps` change (config is memoized from buildConfig).
 */

import { useEffect, useMemo, type RefObject } from "react";
import { Chart, type ChartConfiguration, type ChartItem } from "../chartSetup";

export function useChart(
  ref: RefObject<HTMLCanvasElement | null>,
  buildConfig: () => ChartConfiguration,
  deps: ReadonlyArray<unknown> = [],
): void {
  const config = useMemo(() => buildConfig(), deps);

  useEffect(() => {
    if (!ref.current) return;
    const ctx = ref.current.getContext("2d");
    if (!ctx) return;

    const chart = new Chart(ctx as ChartItem, config);

    return () => {
      try { chart.destroy(); } catch { /* noop */ }
    };
  }, [ref, config]);
}
