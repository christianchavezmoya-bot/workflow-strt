#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readFileSync } from "node:fs";

const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

export function writeBuildManifest({
  profile,
  appEnv,
  apiBase,
  debugFeaturesEnabled,
  distDir = join(root, "dist"),
}) {
  mkdirSync(distDir, { recursive: true });
  const manifest = {
    schemaVersion: 1,
    profile,
    appEnv,
    apiBase,
    appVersion: pkg.version,
    buildSha: process.env.VITE_BUILD_SHA ?? "unknown",
    buildTime: process.env.VITE_BUILD_TIME ?? new Date().toISOString(),
    debugFeaturesEnabled,
    builtAt: new Date().toISOString(),
  };
  writeFileSync(join(distDir, "build-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
