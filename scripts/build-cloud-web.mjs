#!/usr/bin/env node
/**
 * Production/staging web build with VITE_API_BASE validation.
 *
 * Usage:
 *   VITE_API_BASE=https://api.staging.example.com/api node scripts/build-cloud-web.mjs
 *   node scripts/build-cloud-web.mjs --staging   # allows http + localhost (local Docker staging)
 *
 * Loads (in order): .env.production.local, .env.production, .env.staging.local, .env.staging
 * when --staging; otherwise production files only.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const isStaging = args.includes("--staging");
const root = resolve(import.meta.dirname, "..");

function loadEnvFile(name) {
  const path = resolve(root, name);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

if (isStaging) {
  loadEnvFile(".env.staging.local");
  loadEnvFile(".env.staging");
  process.env.VITE_APP_ENV = process.env.VITE_APP_ENV ?? "dev";
} else {
  loadEnvFile(".env.production.local");
  loadEnvFile(".env.production");
  process.env.VITE_APP_ENV = process.env.VITE_APP_ENV ?? "prod";
}

console.log(`[build-cloud-web] VITE_APP_ENV=${process.env.VITE_APP_ENV}`);

const apiBase = process.env.VITE_API_BASE?.trim() ?? "";

function fail(msg) {
  console.error(`[build-cloud-web] ERROR: ${msg}`);
  process.exit(1);
}

if (!apiBase) {
  fail(
    isStaging
      ? "VITE_API_BASE is required. Copy .env.staging.example → .env.staging.local"
      : "VITE_API_BASE is required. Copy .env.production.example → .env.production.local"
  );
}

if (!apiBase.endsWith("/api") && !apiBase.endsWith("/api/")) {
  console.warn("[build-cloud-web] WARN: VITE_API_BASE should end with /api");
}

if (!isStaging && !apiBase.startsWith("https://")) {
  fail("Production builds require HTTPS VITE_API_BASE (use --staging for http staging URLs)");
}

if (!isStaging && (apiBase.includes("localhost") || apiBase.includes("127.0.0.1"))) {
  fail("Cloud web build must not use localhost — use staging/production API URL");
}

console.log(`[build-cloud-web] VITE_API_BASE=${apiBase}`);
console.log("[build-cloud-web] Running tsc -b && vite build…");

const result = spawnSync("npm", ["run", "build"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
  shell: true,
});

process.exit(result.status ?? 1);
