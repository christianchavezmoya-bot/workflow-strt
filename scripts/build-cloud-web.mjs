#!/usr/bin/env node
/**
 * Cloud web build with validated DEV/PROD profiles.
 *
 * Usage:
 *   node scripts/build-cloud-web.mjs --profile dev
 *   node scripts/build-cloud-web.mjs --profile prod
 *   node scripts/build-cloud-web.mjs --staging   # alias for --profile dev
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import {
  loadProfileEnv,
  resolveProfile,
  validateApiBaseForProfile,
  validateAppEnvForProfile,
} from "./build-profiles.mjs";
import { writeBuildManifest } from "./write-build-manifest.mjs";

const args = process.argv.slice(2);
const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

function readArg(name) {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
}

function fail(msg) {
  console.error(`[build-cloud-web] ERROR: ${msg}`);
  process.exit(1);
}

const profileId =
  readArg("--profile")
  ?? (args.includes("--staging") ? "dev" : null)
  ?? (args.includes("--production") ? "prod" : null);

if (!profileId) {
  fail('Specify --profile dev|prod (or --staging / --production alias).');
}

const profile = resolveProfile(profileId);
loadProfileEnv(root, profile);

process.env.VITE_APP_ENV = validateAppEnvForProfile(process.env.VITE_APP_ENV, profile);

// Canonical cloud DEV builds always target staging API (ignore local Docker LAN env files).
if (profile.id === "dev" && process.env.BUILD_STRICT_PROFILE !== "false") {
    const current = process.env.VITE_API_BASE?.trim() ?? "";
    if (!current.includes("api.staging.strata-ngo.com")) {
      if (current) {
        console.warn(
          `[build-cloud-web] Overriding VITE_API_BASE=${current} → ${profile.defaultApiBase} (canonical DEV build)`,
        );
      }
      process.env.VITE_API_BASE = profile.defaultApiBase;
    }
  }

let gitSha = "unknown";
try {
  gitSha = execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
} catch {
  // non-git environment
}

process.env.VITE_APP_VERSION = pkg.version;
process.env.VITE_BUILD_SHA = process.env.VITE_BUILD_SHA ?? gitSha;
process.env.VITE_BUILD_TIME = process.env.VITE_BUILD_TIME ?? new Date().toISOString();

const apiBase = validateApiBaseForProfile(
  process.env.VITE_API_BASE ?? profile.defaultApiBase,
  profile,
);
process.env.VITE_API_BASE = apiBase;

console.log(`[build-cloud-web] profile=${profile.id}`);
console.log(`[build-cloud-web] VITE_APP_ENV=${process.env.VITE_APP_ENV}`);
console.log(`[build-cloud-web] VITE_API_BASE=${apiBase}`);
console.log(`[build-cloud-web] VITE_BUILD_SHA=${process.env.VITE_BUILD_SHA}`);
console.log("[build-cloud-web] Running tsc -b && vite build…");

const result = spawnSync("npm", ["run", "build"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
  shell: true,
});

if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}

writeBuildManifest({
  profile: profile.id,
  appEnv: process.env.VITE_APP_ENV,
  apiBase,
  debugFeaturesEnabled: profile.debugFeaturesEnabled,
});

console.log("[build-cloud-web] build-manifest.json written");
process.exit(0);
