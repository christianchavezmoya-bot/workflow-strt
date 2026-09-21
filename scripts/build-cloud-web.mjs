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
  BOM_FLAG_ENV,
  loadProfileEnv,
  resolveBomModuleFlag,
  resolveProfile,
  validateApiBaseForProfile,
  validateAppEnvForProfile,
} from "./build-profiles.mjs";
import { analyzeBomModule } from "./lib/artifact-isolation.mjs";
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

// PROD builds (web or native) NEVER trust env files or an ambient shell value for the API
// base — they always use the one canonical production endpoint, no exceptions, no opt-out.
// This is deliberately unconditional (unlike the DEV override above): `.env.production.local`
// is Vite's own built-in env file, and CLAUDE.md documents putting a device LAN IP there for
// the plain `npm run build` on-device-testing workflow — that file must keep working for that
// purpose. It must never be consulted by this store-release pipeline, so we don't even look at
// it (or any other env file/shell var) for this one value.
if (profile.id === "prod") {
  const current = process.env.VITE_API_BASE?.trim() ?? "";
  if (current && current !== profile.defaultApiBase) {
    console.warn(
      `[build-cloud-web] Ignoring VITE_API_BASE=${current} from env files/shell — ` +
        `production builds always use ${profile.defaultApiBase}. Local overrides such as ` +
        `.env.production.local are for the plain \`npm run build\` LAN-testing workflow only ` +
        `and are never read by this script.`,
    );
  }
  process.env.VITE_API_BASE = profile.defaultApiBase;
}

// BOM to Project: resolved from the PROFILE, never from whatever env file happens to exist.
// prod is pinned (an untracked .env / shell value can neither enable nor disable it), so a clean
// checkout builds exactly what production expects. The compiled bundle is verified below.
const bom = resolveBomModuleFlag(profile, process.env[BOM_FLAG_ENV]);
if (bom.ignoredEnvValue) {
  console.warn(
    `[build-cloud-web] Ignoring ${BOM_FLAG_ENV}=${bom.ignoredEnvValue} from env files/shell — ` +
      `the ${profile.id} profile ${bom.source === "profile-pin" ? "pins" : "defaults"} it to ${bom.enabled}.`,
  );
}
process.env[BOM_FLAG_ENV] = String(bom.enabled);

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

// Hard release guard: by construction this can never fail given the forced override above,
// but a production build must refuse to proceed rather than silently ship the wrong API host
// if this file is ever refactored and that guarantee quietly breaks.
if (profile.id === "prod" && apiBase !== profile.defaultApiBase) {
  fail(
    `Production build resolved VITE_API_BASE="${apiBase}", but it must be exactly ` +
      `"${profile.defaultApiBase}". Refusing to build.`,
  );
}

console.log(`[build-cloud-web] profile=${profile.id}`);
console.log(`[build-cloud-web] VITE_APP_ENV=${process.env.VITE_APP_ENV}`);
console.log(`[build-cloud-web] VITE_API_BASE=${apiBase}`);
console.log(`[build-cloud-web] ${BOM_FLAG_ENV}=${bom.enabled} (${bom.source})`);
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

// Hard assertion on what was actually COMPILED, not on what we asked for: fail the build rather
// than ship a bundle whose BOM module state disagrees with the profile.
const bomCheck = analyzeBomModule(resolve(root, "dist"), profile.id, bom.enabled);
if (!bomCheck.pass) {
  fail(
    `BOM module mismatch in built artifact: expected ${bom.enabled ? "ENABLED" : "DISABLED"}, ` +
      `found sidebar=${bomCheck.detected.sidebar} routes=${bomCheck.detected.routes}. Refusing to produce a ` +
      `${profile.id} build that silently differs from the profile.`,
  );
}
console.log(`[build-cloud-web] BOM module verified in artifact: ${bomCheck.detected.enabled ? "enabled" : "disabled"}`);

writeBuildManifest({
  profile: profile.id,
  appEnv: process.env.VITE_APP_ENV,
  apiBase,
  debugFeaturesEnabled: profile.debugFeaturesEnabled,
  features: { bomModule: bom.enabled },
});

console.log("[build-cloud-web] build-manifest.json written");
process.exit(0);
