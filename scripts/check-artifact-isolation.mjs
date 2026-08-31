#!/usr/bin/env node
/**
 * Verify a built dist/ directory matches DEV or PROD isolation rules.
 *
 * Usage:
 *   node scripts/check-artifact-isolation.mjs --profile prod --dist dist
 */
import { resolve } from "node:path";
import { analyzeArtifact } from "./lib/artifact-isolation.mjs";

const args = process.argv.slice(2);
function readArg(name, fallback) {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? fallback;
}

const profile = readArg("--profile", null);
const distDir = resolve(readArg("--dist", "dist"));

if (!profile) {
  console.error("Usage: node scripts/check-artifact-isolation.mjs --profile dev|prod [--dist path]");
  process.exit(1);
}

const result = analyzeArtifact(distDir, profile);
for (const check of result.checks) {
  console.log(`[artifact-isolation] ${check.pass ? "PASS" : "FAIL"} ${check.id}`);
}
if (!result.pass) {
  console.error("[artifact-isolation] FAIL");
  for (const v of result.violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log(`[artifact-isolation] PASS profile=${profile} chunks=${result.chunkCount}`);
