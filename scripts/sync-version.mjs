#!/usr/bin/env node
/**
 * Sync product version across package.json, Android, and iOS.
 *
 * Usage:
 *   node scripts/sync-version.mjs              # sync native files to package.json version
 *   node scripts/sync-version.mjs 0.2.0        # set package.json + sync native marketing version
 *   node scripts/sync-version.mjs 0.2.0 --bump-code   # also increment Android versionCode + iOS build
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const bumpCode = process.argv.includes("--bump-code");

const pkgPath = join(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const version = args[0] ?? pkg.version;

if (!/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`Invalid semver: ${version}`);
  process.exit(1);
}

if (args[0]) {
  pkg.version = version;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

const gradlePath = join(root, "android/app/build.gradle");
let gradle = readFileSync(gradlePath, "utf8");
gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${version}"`);
if (bumpCode) {
  gradle = gradle.replace(/versionCode\s+(\d+)/, (_, n) => {
    const next = Number(n) + 1;
    return `versionCode ${next}`;
  });
}
writeFileSync(gradlePath, gradle);

const pbxPath = join(root, "ios/App/App.xcodeproj/project.pbxproj");
let pbx = readFileSync(pbxPath, "utf8");
pbx = pbx.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
if (bumpCode) {
  pbx = pbx.replace(/CURRENT_PROJECT_VERSION = (\d+);/g, (_, n) => {
    const next = Number(n) + 1;
    return `CURRENT_PROJECT_VERSION = ${next};`;
  });
}
writeFileSync(pbxPath, pbx);

console.log(
  `Synced version ${version} → package.json, Android versionName, iOS MARKETING_VERSION` +
    (bumpCode ? " (build numbers bumped)" : ""),
);
