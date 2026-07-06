#!/usr/bin/env node
/** Remap legacy 13-scene screenshots to v4 20-scene numbering before fresh captures. */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "sales-presentation", "public", "screenshots", "scenes");
mkdirSync(dir, { recursive: true });

const map = {
  "01": "01", "03": "02", "04": "03", "05": "04", "06": "05", "07": "06", "08": "07", "09": "08",
  "10": "17", "11": "18", "12": "19", "13": "20",
};

for (const [from, to] of Object.entries(map)) {
  for (const v of ["v1", "v2", "v3", "v4"]) {
    const src = join(dir, `${from}-${v}.png`);
    const dst = join(dir, `${to}-${v}.png`);
    if (existsSync(src)) {
      copyFileSync(src, dst);
      console.log(`copied ${from}-${v} → ${to}-${v}`);
    }
  }
}

console.log("Remap done.");
