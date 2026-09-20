#!/usr/bin/env node
/**
 * Apply Capacitor + native bundle ID and display name for a build profile.
 *
 * Usage: node scripts/apply-native-identity.mjs --profile dev|prod
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveProfile } from "./build-profiles.mjs";

const args = process.argv.slice(2);
const profileIdx = args.indexOf("--profile");
const profileId = profileIdx >= 0 ? args[profileIdx + 1] : null;
if (!profileId) {
  console.error("Usage: node scripts/apply-native-identity.mjs --profile dev|prod");
  process.exit(1);
}

const root = resolve(import.meta.dirname, "..");
const profile = resolveProfile(profileId);
const { appId, appName } = profile.capacitor;

function patchCapacitorConfigTs() {
  const path = resolve(root, "capacitor.config.ts");
  let text = readFileSync(path, "utf8");
  text = text.replace(/appId:\s*'[^']+'/, `appId: '${appId}'`);
  text = text.replace(/appName:\s*'[^']+'/, `appName: '${appName}'`);
  writeFileSync(path, text);
}

function patchCapacitorConfigJson(relPath) {
  const path = resolve(root, relPath);
  const json = JSON.parse(readFileSync(path, "utf8"));
  json.appId = appId;
  json.appName = appName;
  writeFileSync(path, `${JSON.stringify(json, null, "\t")}\n`);
}

function patchAndroid() {
  const gradlePath = resolve(root, "android/app/build.gradle");
  let gradle = readFileSync(gradlePath, "utf8");
  // `namespace` is intentionally NOT patched per profile, unlike `applicationId` below. AGP
  // generates the R class under whatever `namespace` says, and the project's hand-written Java
  // sources (MainActivity.java, SyncForegroundService.java, SyncKeepAlivePlugin.java) live on
  // disk under a fixed package directory, android/app/src/main/java/com/strata/ngo/field/dev/,
  // with `package com.strata.ngo.field.dev;` declared in each file. Those files reference R
  // implicitly (no import), which only resolves when their own package matches `namespace`
  // exactly — coupling namespace to the per-profile appId broke `assembleRelease` under the prod
  // profile ("package R does not exist") the first time anyone actually ran a production build,
  // because namespace became "com.strata.ngo.field" while the source files stayed at
  // "com.strata.ngo.field.dev". `applicationId` (the distributed package identity users/Play
  // Store see) is a separate AGP concept from `namespace` (a code-organization concern) and is
  // meant to vary independently — this fixes it at the dev value so it always matches the source
  // tree, and lets applicationId keep varying per profile as intended.
  gradle = gradle.replace(/applicationId "[^"]+"/, `applicationId "${appId}"`);
  writeFileSync(gradlePath, gradle);

  const stringsPath = resolve(root, "android/app/src/main/res/values/strings.xml");
  let strings = readFileSync(stringsPath, "utf8");
  strings = strings.replace(/<string name="app_name">[^<]+<\/string>/, `<string name="app_name">${appName}</string>`);
  strings = strings.replace(/<string name="package_name">[^<]+<\/string>/, `<string name="package_name">${appId}</string>`);
  strings = strings.replace(/<string name="custom_url_scheme">[^<]+<\/string>/, `<string name="custom_url_scheme">${appId}</string>`);
  writeFileSync(stringsPath, strings);
}

function patchIos() {
  const pbxPath = resolve(root, "ios/App/App.xcodeproj/project.pbxproj");
  let pbx = readFileSync(pbxPath, "utf8");
  pbx = pbx.replace(/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g, `PRODUCT_BUNDLE_IDENTIFIER = ${appId};`);
  writeFileSync(pbxPath, pbx);

  // Both the Release Info.plist (production ATS posture) and the Debug-only
  // Info-Debug.plist (relaxed ATS for LAN dev testing) carry their own
  // CFBundleDisplayName and must be kept in sync with the active profile.
  for (const plistName of ["Info.plist", "Info-Debug.plist"]) {
    const plistPath = resolve(root, "ios/App/App", plistName);
    let plist = readFileSync(plistPath, "utf8");
    plist = plist.replace(/<key>CFBundleDisplayName<\/key>\s*<string>[^<]+<\/string>/, `<key>CFBundleDisplayName</key>\n\t<string>${appName}</string>`);
    writeFileSync(plistPath, plist);
  }
}

/**
 * Read back every patched file and confirm the requested appId actually landed
 * everywhere it needs to. A regex that silently fails to match (format drift,
 * a manual edit, a merge conflict marker) would otherwise leave a stale
 * identifier in place with no error — which is exactly how a "prod" build
 * could accidentally ship `com.strata.ngo.field.dev`. Fail loud instead.
 */
function verify() {
  const checks = [
    {
      file: "ios/App/App.xcodeproj/project.pbxproj",
      pattern: /PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g,
    },
    { file: "android/app/build.gradle", pattern: /applicationId "([^"]+)"/g },
    { file: "capacitor.config.ts", pattern: /appId:\s*'([^']+)'/g },
    { file: "ios/App/App/capacitor.config.json", pattern: /"appId":\s*"([^"]+)"/g },
    { file: "android/app/src/main/assets/capacitor.config.json", pattern: /"appId":\s*"([^"]+)"/g },
  ];

  const failures = [];
  for (const { file, pattern } of checks) {
    const text = readFileSync(resolve(root, file), "utf8");
    const found = [...text.matchAll(pattern)].map((m) => m[1]);
    if (found.length === 0) {
      failures.push(`${file}: no match found for expected identifier pattern (nothing to verify)`);
      continue;
    }
    const wrong = found.filter((value) => value !== appId);
    if (wrong.length > 0) {
      failures.push(`${file}: expected "${appId}" everywhere, found ${JSON.stringify([...new Set(wrong)])}`);
    }
  }

  if (failures.length > 0) {
    console.error(`[apply-native-identity] VERIFICATION FAILED for profile "${profile.id}" (appId=${appId}):`);
    for (const f of failures) console.error(`  - ${f}`);
    console.error("[apply-native-identity] Refusing to report success — do not build/archive from this state.");
    process.exit(1);
  }
}

patchCapacitorConfigTs();
patchCapacitorConfigJson("ios/App/App/capacitor.config.json");
patchCapacitorConfigJson("android/app/src/main/assets/capacitor.config.json");
patchAndroid();
patchIos();
verify();

console.log(`[apply-native-identity] profile=${profile.id} appId=${appId} appName=${appName} (verified)`);
