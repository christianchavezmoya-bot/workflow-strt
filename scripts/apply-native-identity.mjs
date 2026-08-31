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
  gradle = gradle.replace(/namespace = "[^"]+"/, `namespace = "${appId}"`);
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

  const plistPath = resolve(root, "ios/App/App/Info.plist");
  let plist = readFileSync(plistPath, "utf8");
  plist = plist.replace(/<key>CFBundleDisplayName<\/key>\s*<string>[^<]+<\/string>/, `<key>CFBundleDisplayName</key>\n\t<string>${appName}</string>`);
  writeFileSync(plistPath, plist);
}

patchCapacitorConfigTs();
patchCapacitorConfigJson("ios/App/App/capacitor.config.json");
patchCapacitorConfigJson("android/app/src/main/assets/capacitor.config.json");
patchAndroid();
patchIos();

console.log(`[apply-native-identity] profile=${profile.id} appId=${appId} appName=${appName}`);
