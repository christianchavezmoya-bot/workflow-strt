#!/usr/bin/env node
/**
 * Copies the Tesseract OCR runtime assets out of node_modules into `public/tesseract/`, so the
 * camera-assisted OCR capture feature (src/services/cameraCaptureService.ts) can run entirely
 * from N-Go's own origin instead of jsDelivr.
 *
 * Why this exists: tesseract.js defaults `workerPath`, `corePath` and `langPath` to
 * `https://cdn.jsdelivr.net/...`. That makes the FIRST OCR use on a device require Internet
 * access, which breaks N-Go's offline-first field-use requirement (a technician can be in a
 * basement/tunnel/rural site the first time they ever press "Text / OCR"). Serving these from
 * `public/` means:
 *   - Vite copies them verbatim into `dist/`, so the web deploy serves them same-origin;
 *   - `npx cap sync` copies `dist/` into the Android/iOS projects, so they are PACKAGED into
 *     the installed app and are available with no network at all from first use.
 *
 * These files are generated, not authored — `public/tesseract/` is gitignored. This script runs
 * from `postinstall` and again at the start of `npm run build`, so every build path (plain
 * `npm run build`, `build-cloud-web.mjs`, `build-cloud-native.mjs` — the latter two shell out to
 * `npm run build`) gets them without needing to remember.
 *
 * Only the assets actually reachable at runtime are copied — see cameraCaptureService.ts for the
 * matching path constants and the SIMD variant selection. Keep the two in sync.
 */
import { createRequire } from "node:module";
import { copyFileSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "tesseract");
const langDir = join(outDir, "lang");

/** Resolve a file inside an installed package without assuming a node_modules layout. */
function pkgFile(pkgJson, ...segments) {
  return join(dirname(require.resolve(pkgJson)), ...segments);
}

// NOTE: tesseract.js picks the core variant itself when `corePath` is a DIRECTORY, using its own
// SIMD feature detection, and would then request a `relaxedsimd` build we deliberately do not
// ship. cameraCaptureService.ts therefore passes an explicit FILE path and does its own SIMD
// check, so exactly these two files are the only core builds that can ever be requested.
const assets = [
  {
    from: pkgFile("tesseract.js/package.json", "dist", "worker.min.js"),
    to: join(outDir, "worker.min.js"),
    label: "tesseract.js worker",
  },
  {
    from: pkgFile("tesseract.js-core/package.json", "tesseract-core-lstm.wasm.js"),
    to: join(outDir, "tesseract-core-lstm.wasm.js"),
    label: "tesseract core (baseline)",
  },
  {
    from: pkgFile("tesseract.js-core/package.json", "tesseract-core-simd-lstm.wasm.js"),
    to: join(outDir, "tesseract-core-simd-lstm.wasm.js"),
    label: "tesseract core (SIMD)",
  },
  {
    // `4.0.0_best_int` (not `4.0.0`) is the LSTM-only model — 2.8 MB instead of 11 MB. It is the
    // right one because we initialise the worker with OEM.LSTM_ONLY; the legacy engine data in
    // the larger bundle would never be used.
    from: pkgFile("@tesseract.js-data/eng/package.json", "4.0.0_best_int", "eng.traineddata.gz"),
    to: join(langDir, "eng.traineddata.gz"),
    label: "eng traineddata (LSTM)",
  },
];

const clean = process.argv.includes("--clean");
if (clean) {
  rmSync(outDir, { recursive: true, force: true });
  console.log("[sync-ocr-assets] removed public/tesseract/");
  process.exit(0);
}

mkdirSync(langDir, { recursive: true });

let totalBytes = 0;
for (const asset of assets) {
  let sourceStat;
  try {
    sourceStat = statSync(asset.from);
  } catch {
    console.error(
      `[sync-ocr-assets] MISSING: ${asset.label}\n` +
        `  expected at: ${asset.from}\n` +
        `  Run \`npm install\` first. OCR cannot work offline without this file.`,
    );
    process.exit(1);
  }
  copyFileSync(asset.from, asset.to);
  totalBytes += sourceStat.size;
  console.log(
    `[sync-ocr-assets] ${asset.label.padEnd(26)} ${(sourceStat.size / 1048576).toFixed(2)} MB`,
  );
}

console.log(
  `[sync-ocr-assets] wrote ${assets.length} files (${(totalBytes / 1048576).toFixed(2)} MB) to public/tesseract/`,
);
