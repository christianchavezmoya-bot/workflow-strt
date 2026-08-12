#!/usr/bin/env node
/**
 * Native release build: validates VITE_API_BASE, builds web bundle, cap sync.
 *
 * Usage:
 *   node scripts/build-cloud-native.mjs
 *   node scripts/build-cloud-native.mjs --staging
 *   node scripts/build-cloud-native.mjs --android   # also run cap sync android hint
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const isStaging = process.argv.includes("--staging");

const webArgs = ["scripts/build-cloud-web.mjs"];
if (isStaging) webArgs.push("--staging");

console.log("[build-cloud-native] Step 1/2 — cloud web build…");
const build = spawnSync("node", webArgs, { cwd: root, stdio: "inherit", shell: true });
if ((build.status ?? 1) !== 0) process.exit(build.status ?? 1);

console.log("[build-cloud-native] Step 2/2 — npx cap sync…");
const sync = spawnSync("npx", ["cap", "sync"], { cwd: root, stdio: "inherit", shell: true });
if ((sync.status ?? 1) !== 0) process.exit(sync.status ?? 1);

console.log("[build-cloud-native] Done. Open Xcode / run Gradle for platform binaries.");
console.log("  iOS:   open ios/App/App.xcodeproj");
console.log("  Android: source scripts/android-env.sh && cd android && ./gradlew assembleRelease");
