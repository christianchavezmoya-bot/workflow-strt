#!/usr/bin/env node
/**
 * Native release build: profile web build + native identity + cap sync.
 *
 * Usage:
 *   node scripts/build-cloud-native.mjs --profile dev|prod
 *   node scripts/build-cloud-native.mjs --staging   # alias for dev
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const profileIdx = args.indexOf("--profile");
const profile =
  (profileIdx >= 0 ? args[profileIdx + 1] : null)
  ?? (args.includes("--staging") ? "dev" : null)
  ?? (args.includes("--production") ? "prod" : null);

if (!profile) {
  console.error("Usage: node scripts/build-cloud-native.mjs --profile dev|prod");
  process.exit(1);
}

console.log(`[build-cloud-native] profile=${profile}`);

console.log("[build-cloud-native] Step 1/3 — apply native identity…");
const identity = spawnSync("node", ["scripts/apply-native-identity.mjs", "--profile", profile], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});
if ((identity.status ?? 1) !== 0) process.exit(identity.status ?? 1);

console.log("[build-cloud-native] Step 2/3 — cloud web build…");
const build = spawnSync("node", ["scripts/build-cloud-web.mjs", "--profile", profile], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});
if ((build.status ?? 1) !== 0) process.exit(build.status ?? 1);

console.log("[build-cloud-native] Step 3/3 — npx cap sync…");
const sync = spawnSync("npx", ["cap", "sync"], { cwd: root, stdio: "inherit", shell: true });
if ((sync.status ?? 1) !== 0) process.exit(sync.status ?? 1);

console.log("[build-cloud-native] Done. Open Xcode / Gradle for platform binaries.");
console.log("  iOS:     open ios/App/App.xcodeproj");
console.log("  Android: source scripts/android-env.sh && cd android && ./gradlew assembleRelease");
