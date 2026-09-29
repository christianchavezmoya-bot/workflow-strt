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
 *
 * LANGUAGE MODEL IS SHIPPED UNCOMPRESSED (`eng.traineddata`, not `eng.traineddata.gz`):
 * Android's AAPT2 build tool silently gunzips any `assets/` file ending in `.gz` and strips the
 * extension while packaging the APK — a built-in AAPT2 behaviour, not something this project's
 * Gradle config controls or can disable. `.gz` survives untouched on iOS (Xcode does a verbatim
 * resource copy) and on plain web, so shipping the compressed file worked everywhere except
 * Android, where the runtime's request for the `.gz`-suffixed URL 404'd. Rather than carry
 * platform-specific runtime logic, every platform now gets the same uncompressed filename and
 * Tesseract is configured with `gzip: false` everywhere (see cameraCaptureService.ts). The
 * decompression happens once, here, at generation time, using Node's built-in `zlib` — no new
 * dependency — so it is deterministic and reproducible from the same npm-published source.
 */
import { createRequire } from "node:module";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

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
const copiedAssets = [
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
];

// `4.0.0_best_int` (not `4.0.0`) is the LSTM-only model — 2.8 MB compressed instead of 11 MB. It
// is the right one because we initialise the worker with OEM.LSTM_ONLY; the legacy engine data in
// the larger bundle would never be used. The npm-published source stays gzip-compressed (that's
// how the package ships); we decompress our OWN copy of it below.
const langModelSource = pkgFile("@tesseract.js-data/eng/package.json", "4.0.0_best_int", "eng.traineddata.gz");
const langModelOut = join(langDir, "eng.traineddata");
// A build from before this fix left a compressed `eng.traineddata.gz` here (this same script used
// to write one). Left in place, it wouldn't break anything on its own, but a stale, unreferenced
// multi-megabyte asset sitting in a directory this script owns is exactly the kind of drift this
// generator should never allow to accumulate — so a rerun always cleans it up itself rather than
// depending on a developer noticing and deleting it by hand.
const staleLangModelGz = join(langDir, "eng.traineddata.gz");

const clean = process.argv.includes("--clean");
if (clean) {
  rmSync(outDir, { recursive: true, force: true });
  console.log("[sync-ocr-assets] removed public/tesseract/");
  process.exit(0);
}

mkdirSync(langDir, { recursive: true });

let totalBytes = 0;

for (const asset of copiedAssets) {
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

let compressed;
try {
  compressed = readFileSync(langModelSource);
} catch {
  console.error(
    `[sync-ocr-assets] MISSING: eng traineddata (LSTM)\n` +
      `  expected at: ${langModelSource}\n` +
      `  Run \`npm install\` first. OCR cannot work offline without this file.`,
  );
  process.exit(1);
}
// Deterministic: zlib.gunzipSync on a fixed input always produces the same output bytes, so this
// generated file is reproducible across machines/CI runs from the same node_modules content.
const decompressed = gunzipSync(compressed);
writeFileSync(langModelOut, decompressed);
totalBytes += decompressed.length;
console.log(
  `[sync-ocr-assets] eng traineddata (LSTM, decompressed) ${(decompressed.length / 1048576).toFixed(2)} MB` +
    ` (source .gz was ${(compressed.length / 1048576).toFixed(2)} MB)`,
);

if (existsSync(staleLangModelGz)) {
  rmSync(staleLangModelGz);
  console.log("[sync-ocr-assets] removed stale eng.traineddata.gz left by an older run");
}

console.log(
  `[sync-ocr-assets] wrote ${copiedAssets.length + 1} files` +
    ` (${(totalBytes / 1048576).toFixed(2)} MB) to public/tesseract/`,
);
