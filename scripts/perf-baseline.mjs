#!/usr/bin/env node
/**
 * Performance baseline — record and compare.
 *
 * check:bundle-budget enforces ceilings. A ceiling cannot tell you that a chunk
 * grew 30% but stayed under budget, which is exactly the kind of drift a large
 * refactor produces. This records actual measured values so a later run can be
 * compared against them.
 *
 *   node scripts/perf-baseline.mjs record    # write the baseline (after npm run build)
 *   node scripts/perf-baseline.mjs compare   # compare current build to the baseline
 *
 * Exit codes for compare: 0 within tolerance, 1 a regression exceeded tolerance.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST_ASSETS = path.join(ROOT, "dist", "assets");
// Committed reference data, so it lives beside the visual baseline rather than
// in e2e-results/, which holds throwaway run output.
const BASELINE_FILE = path.join(ROOT, "e2e", "perf-baseline.json");
const RUNTIME_REPORT = path.join(ROOT, "e2e-results", "web-perf-report.json");

/** A chunk may grow this much before it counts as a regression. */
const CHUNK_GROWTH_TOLERANCE = 0.10;
/** Total bundle tolerance is tighter — many small growths still add up. */
const TOTAL_GROWTH_TOLERANCE = 0.05;
/** Runtime timings vary between runs; only flag a clear slowdown. */
const TIMING_GROWTH_TOLERANCE = 0.25;

/** Strip Vite's content hash so chunks match across builds. */
function chunkName(fileName) {
  return fileName.replace(/-[A-Za-z0-9_-]{8,}\.(js|css)$/, ".$1");
}

function gzipSizeBytes(filePath) {
  return zlib.gzipSync(fs.readFileSync(filePath)).length;
}

function readBundle() {
  if (!fs.existsSync(DIST_ASSETS)) {
    console.error("perf-baseline: dist/assets missing — run `npm run build` first");
    process.exit(1);
  }

  const chunks = {};
  let total = 0;

  for (const file of fs.readdirSync(DIST_ASSETS)) {
    if (!/\.(js|css)$/.test(file)) continue;
    const size = gzipSizeBytes(path.join(DIST_ASSETS, file));
    // Vite can emit several files that normalise to one name; sum them.
    chunks[chunkName(file)] = (chunks[chunkName(file)] ?? 0) + size;
    total += size;
  }

  return { chunks, totalGzipBytes: total };
}

/** Runtime timings, if a web-perf run has written them. Optional. */
function readRuntime() {
  if (!fs.existsSync(RUNTIME_REPORT)) return null;
  try {
    const report = JSON.parse(fs.readFileSync(RUNTIME_REPORT, "utf8"));
    return {
      loginMs: report.loginMs ?? null,
      assetsContentMs: report.assetsContentMs ?? null,
      totalApiCalls: report.totalApiCalls ?? null,
    };
  } catch {
    return null;
  }
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function pct(from, to) {
  if (!from) return "n/a";
  const delta = ((to - from) / from) * 100;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;
}

function record() {
  const bundle = readBundle();
  const runtime = readRuntime();

  const baseline = {
    recordedAt: new Date().toISOString(),
    note: "Regenerate with `npm run perf:baseline:record` after an intentional change.",
    // Bundle sizes are derived from source, so they are comparable on any machine
    // and safe to commit. Runtime timings are not — they reflect the hardware that
    // measured them, so only compare them against a baseline recorded on the same
    // machine. A committed baseline normally has runtime: null and comparison of
    // timings is skipped.
    bundle,
    runtime,
  };

  fs.mkdirSync(path.dirname(BASELINE_FILE), { recursive: true });
  fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(baseline, null, 2)}\n`);

  const count = Object.keys(bundle.chunks).length;
  console.log(`perf-baseline: recorded ${count} chunks, total ${kb(bundle.totalGzipBytes)} gzip`);
  console.log(runtime
    ? `perf-baseline: runtime timings included (login ${runtime.loginMs}ms, assets ${runtime.assetsContentMs}ms)`
    : "perf-baseline: no runtime timings — run `npm run test:e2e:web-perf` first to include them");
  console.log(`perf-baseline: written to ${path.relative(ROOT, BASELINE_FILE)}`);
}

function compare() {
  if (!fs.existsSync(BASELINE_FILE)) {
    console.error(`perf-baseline: no baseline at ${path.relative(ROOT, BASELINE_FILE)}`);
    console.error("perf-baseline: run `npm run perf:baseline:record` first");
    process.exit(1);
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
  const current = readBundle();
  const regressions = [];
  const notable = [];

  for (const [name, wasBytes] of Object.entries(baseline.bundle.chunks)) {
    const nowBytes = current.chunks[name];
    if (nowBytes === undefined) {
      notable.push(`  gone     ${name} (was ${kb(wasBytes)}) — renamed or removed`);
      continue;
    }
    const growth = (nowBytes - wasBytes) / wasBytes;
    if (growth > CHUNK_GROWTH_TOLERANCE) {
      regressions.push(`  GREW     ${name}  ${kb(wasBytes)} -> ${kb(nowBytes)}  ${pct(wasBytes, nowBytes)}`);
    } else if (Math.abs(growth) > 0.02) {
      notable.push(`  changed  ${name}  ${kb(wasBytes)} -> ${kb(nowBytes)}  ${pct(wasBytes, nowBytes)}`);
    }
  }

  for (const name of Object.keys(current.chunks)) {
    if (!(name in baseline.bundle.chunks)) {
      notable.push(`  new      ${name} (${kb(current.chunks[name])})`);
    }
  }

  const totalGrowth =
    (current.totalGzipBytes - baseline.bundle.totalGzipBytes) / baseline.bundle.totalGzipBytes;
  if (totalGrowth > TOTAL_GROWTH_TOLERANCE) {
    regressions.push(
      `  GREW     TOTAL  ${kb(baseline.bundle.totalGzipBytes)} -> ${kb(current.totalGzipBytes)}  ` +
      `${pct(baseline.bundle.totalGzipBytes, current.totalGzipBytes)}`,
    );
  }

  const currentRuntime = readRuntime();
  if (baseline.runtime && currentRuntime) {
    for (const key of ["loginMs", "assetsContentMs"]) {
      const was = baseline.runtime[key];
      const now = currentRuntime[key];
      if (!was || !now) continue;
      const growth = (now - was) / was;
      if (growth > TIMING_GROWTH_TOLERANCE) {
        regressions.push(`  SLOWER   ${key}  ${was}ms -> ${now}ms  ${pct(was, now)}`);
      } else if (Math.abs(growth) > 0.10) {
        notable.push(`  changed  ${key}  ${was}ms -> ${now}ms  ${pct(was, now)}`);
      }
    }
  }

  console.log(`perf-baseline: comparing against baseline recorded ${baseline.recordedAt}`);
  console.log(
    `perf-baseline: total ${kb(baseline.bundle.totalGzipBytes)} -> ${kb(current.totalGzipBytes)} ` +
    `(${pct(baseline.bundle.totalGzipBytes, current.totalGzipBytes)})`,
  );

  if (notable.length) {
    console.log("\nChanged, within tolerance:");
    notable.forEach((line) => console.log(line));
  }

  if (regressions.length) {
    console.error("\nRegressions beyond tolerance:");
    regressions.forEach((line) => console.error(line));
    console.error(
      "\nIf this growth is intended, re-record the baseline in the same PR and say why " +
      "in the description.",
    );
    process.exit(1);
  }

  console.log("\nperf-baseline: OK — nothing regressed beyond tolerance.");
}

const mode = process.argv[2];
if (mode === "record") record();
else if (mode === "compare") compare();
else {
  console.error("usage: node scripts/perf-baseline.mjs <record|compare>");
  process.exit(1);
}
