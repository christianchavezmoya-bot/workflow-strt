/**
 * Copies ambient.mp3 into public/ for Vite + Capacitor.
 *
 * Priority:
 *   1. ./ambient.mp3  (repo root — e.g. desktop/workflow-strt/ambient.mp3)
 *   2. ./src/assets/ambient.mp3  (bundled fallback)
 */

import { copyFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const root = process.cwd();
const publicDir = join(root, "public");
const dest = join(publicDir, "ambient.mp3");
const rootSource = join(root, "ambient.mp3");
const fallbackSource = join(root, "src", "assets", "ambient.mp3");

const source = existsSync(rootSource)
  ? rootSource
  : existsSync(fallbackSource)
    ? fallbackSource
    : null;

if (!source) {
  console.warn("[ambient] No ambient.mp3 found — add one at repo root or src/assets/ambient.mp3");
  process.exit(0);
}

mkdirSync(publicDir, { recursive: true });
copyFileSync(source, dest);

const label = source === rootSource ? "repo root" : "src/assets fallback";
console.log(`[ambient] Copied ${label} ambient.mp3 → public/ambient.mp3`);
