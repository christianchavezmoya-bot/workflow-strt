#!/usr/bin/env node
/**
 * Fail CI when key Vite route chunks exceed gzip budgets (web perf Phase 3.4).
 * Run after `npm run build`.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST_ASSETS = path.join(ROOT, "dist", "assets");

/** Gzip size ceilings — ratchet down as code-splitting improves. */
const CHUNK_BUDGETS = [
  { pattern: /^AssetInstallationPage-.*\.js$/, label: "AssetInstallationPage", maxGzipBytes: 95 * 1024 },
  { pattern: /^Dashboard-.*\.js$/, label: "Dashboard", maxGzipBytes: 40 * 1024 },
];

function gzipSizeBytes(filePath) {
  const raw = fs.readFileSync(filePath);
  return zlib.gzipSync(raw).length;
}

function main() {
  if (!fs.existsSync(DIST_ASSETS)) {
    console.error("check-bundle-budget: dist/assets missing — run npm run build first");
    process.exit(1);
  }

  const files = fs.readdirSync(DIST_ASSETS);
  let failed = false;

  for (const budget of CHUNK_BUDGETS) {
    const match = files.find((f) => budget.pattern.test(f));
    if (!match) {
      console.error(`check-bundle-budget: no chunk matching ${budget.label} (${budget.pattern})`);
      failed = true;
      continue;
    }
    const filePath = path.join(DIST_ASSETS, match);
    const gzipBytes = gzipSizeBytes(filePath);
    const rawBytes = fs.statSync(filePath).size;
    const ok = gzipBytes <= budget.maxGzipBytes;
    const tag = ok ? "PASS" : "FAIL";
    console.log(
      `[${tag}] ${budget.label}: gzip ${(gzipBytes / 1024).toFixed(1)} KB / ${(budget.maxGzipBytes / 1024).toFixed(0)} KB budget`
      + ` (raw ${(rawBytes / 1024).toFixed(1)} KB, ${match})`,
    );
    if (!ok) failed = true;
  }

  process.exit(failed ? 1 : 0);
}

main();
