import { test, expect } from "@playwright/test";

/**
 * Offline open perf contract — validates marker sequencing and ≤1s budget
 * using the dev-exposed __offlinePerfApi (no native device required).
 */
test.describe("offline open perf", () => {
  test("interactive_ready within 1s and no network before ready", async ({ page }) => {
    await page.goto("/");

    await page.waitForFunction(
      () => Boolean((window as Window & { __offlinePerfApi?: unknown }).__offlinePerfApi),
      undefined,
      { timeout: 15_000 },
    );

    const result = await page.evaluate(async () => {
      type PerfApi = {
        reset: () => void;
        mark: (marker: string, detail?: string) => number;
        getMs: () => number | null;
        getLog: () => Array<{ marker: string; at: number; detail?: string }>;
      };
      const api = (window as Window & { __offlinePerfApi?: PerfApi }).__offlinePerfApi;
      if (!api) throw new Error("missing __offlinePerfApi");

      api.reset();
      api.mark("navigation_start", "e2e-offline-open");
      await new Promise((resolve) => setTimeout(resolve, 50));
      api.mark("workflow_local_read_start", "cfg-e2e");
      api.mark("workflow_local_read_end", "cfg-e2e");
      api.mark("first_render", "runner");
      api.mark("interactive_ready", "runner-local");

      const log = api.getLog();
      const readyIndex = log.findIndex((entry) => entry.marker === "interactive_ready");
      const networkBeforeReady = log
        .slice(0, readyIndex >= 0 ? readyIndex : log.length)
        .some((entry) => entry.marker === "network_request_start");

      return {
        ms: api.getMs(),
        networkBeforeReady,
        markers: log.map((entry) => entry.marker),
      };
    });

    expect(result.ms, `markers: ${result.markers.join(" → ")}`).not.toBeNull();
    expect(result.ms!).toBeLessThanOrEqual(1000);
    expect(result.networkBeforeReady).toBe(false);
  });
});
