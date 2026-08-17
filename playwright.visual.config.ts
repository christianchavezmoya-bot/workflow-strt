import { defineConfig, devices } from "@playwright/test";

/**
 * Visual baseline config — layout regression cover for the excellence programme.
 *
 * Runs against an ALREADY RUNNING app with seeded data, because reference
 * images are only meaningful against real content. It deliberately starts no
 * web server of its own: point it at Docker staging (the default) or at a dev
 * server via VISUAL_BASE_URL.
 *
 *   Docker staging:  npm run test:e2e:visual
 *   Dev server:      VISUAL_BASE_URL=http://localhost:5173 npm run test:e2e:visual
 *   Refresh images:  npm run test:e2e:visual -- --update-snapshots
 *
 * See docs/VISUAL_BASELINE.md.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /visual-baseline\.spec\.ts/,
  // Serial: screenshots of a shared, seeded environment must not race each other.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "e2e-results/visual-report", open: "never" }]],
  outputDir: "e2e-results/visual-artifacts",
  snapshotPathTemplate: "e2e/visual-baseline/{arg}{ext}",
  use: {
    baseURL: process.env.VISUAL_BASE_URL ?? "http://localhost:5174",
    trace: "on-first-retry",
    // Deterministic rendering: no motion, no OS colour-scheme drift.
    reducedMotion: "reduce",
    colorScheme: "dark",
  },
  expect: {
    toHaveScreenshot: {
      // Tolerates font antialiasing between machines while still catching a
      // moved element. Tighten if the baseline proves stable.
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
      caret: "hide",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
