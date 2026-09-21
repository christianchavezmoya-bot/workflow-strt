/**
 * Scans built web artifacts for DEV/PROD isolation violations.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { BOM_ARTIFACT_MARKERS, BUILD_PROFILES, resolveProfile } from "../build-profiles.mjs";

function readJsChunks(distDir) {
  const assetsDir = join(distDir, "assets");
  if (!existsSync(assetsDir)) {
    throw new Error(`Missing assets directory: ${assetsDir}`);
  }
  return readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => ({
      name,
      content: readFileSync(join(assetsDir, name), "utf8"),
    }));
}

/**
 * Detect whether the compiled bundle has the BOM module enabled.
 * `enabled` requires BOTH gated markers; exactly one means a half-built/inconsistent artifact.
 */
export function detectBomModule(combinedJs) {
  const sidebar = combinedJs.includes(BOM_ARTIFACT_MARKERS.sidebar);
  const routes = combinedJs.includes(BOM_ARTIFACT_MARKERS.routes);
  return { sidebar, routes, enabled: sidebar && routes, inconsistent: sidebar !== routes };
}

/** Read dist/ and compare the BOM state actually compiled in against what the profile requires. */
export function analyzeBomModule(distDir, profileId, expectedEnabled) {
  const profile = resolveProfile(profileId);
  const combined = readJsChunks(distDir).map((c) => c.content).join("\n");
  const detected = detectBomModule(combined);
  const expected = expectedEnabled ?? profile.features.bomModule;
  const pass = !detected.inconsistent && detected.enabled === expected;
  return { profile: profile.id, expected, detected, pass };
}

function readManifest(distDir) {
  const path = join(distDir, "build-manifest.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function countEnvMarkers(content) {
  const dev = (content.match(/"dev"/g) ?? []).length;
  const prod = (content.match(/"prod"/g) ?? []).length;
  return { dev, prod };
}

export function analyzeArtifact(distDir, profileId) {
  const profile = resolveProfile(profileId);
  const chunks = readJsChunks(distDir);
  const combined = chunks.map((c) => c.content).join("\n");
  const manifest = readManifest(distDir);
  const violations = [];
  const checks = [];

  if (manifest) {
    checks.push({ id: "manifest-profile", pass: manifest.profile === profile.id });
    checks.push({ id: "manifest-app-env", pass: manifest.appEnv === profile.appEnv });
    checks.push({ id: "manifest-debug-flag", pass: manifest.debugFeaturesEnabled === profile.debugFeaturesEnabled });
    if (manifest.profile !== profile.id) {
      violations.push(`build-manifest profile=${manifest.profile}, expected ${profile.id}`);
    }
    if (manifest.appEnv !== profile.appEnv) {
      violations.push(`build-manifest appEnv=${manifest.appEnv}, expected ${profile.appEnv}`);
    }
    if (manifest.debugFeaturesEnabled !== profile.debugFeaturesEnabled) {
      violations.push(
        `build-manifest debugFeaturesEnabled=${manifest.debugFeaturesEnabled}, expected ${profile.debugFeaturesEnabled}`,
      );
    }
    if (profile.id === "prod" && manifest.apiBase?.includes("staging.strata-ngo.com")) {
      violations.push(`build-manifest apiBase targets staging: ${manifest.apiBase}`);
    }
    if (profile.id === "dev" && manifest.apiBase && !manifest.apiBase.includes("staging.strata-ngo.com")) {
      violations.push(`build-manifest apiBase must target staging for DEV: ${manifest.apiBase}`);
    }
  } else {
    violations.push("missing build-manifest.json — rebuild with build-cloud-web.mjs");
  }

  // BOM module: the compiled bundle must match the profile (prod is pinned to enabled).
  // Also cross-check the manifest, when it records the flag, against what was really compiled.
  const bom = detectBomModule(combined);
  // prod: always the profile pin. dev: an explicit override is recorded in the manifest.
  const bomExpected =
    profile.id !== "prod" && typeof manifest?.features?.bomModule === "boolean"
      ? manifest.features.bomModule
      : profile.features.bomModule;
  const bomPass = !bom.inconsistent && bom.enabled === bomExpected;
  checks.push({ id: "bom-module", pass: bomPass });
  if (!bomPass) {
    violations.push(
      bom.inconsistent
        ? `BOM module markers inconsistent (sidebar=${bom.sidebar}, routes=${bom.routes}) — half-built artifact`
        : `BOM module ${bom.enabled ? "enabled" : "DISABLED"} in artifact but profile ${profile.id} requires ${bomExpected ? "enabled" : "disabled"}`,
    );
  }
  if (manifest && typeof manifest.features?.bomModule === "boolean") {
    const consistent = manifest.features.bomModule === bom.enabled;
    checks.push({ id: "bom-manifest-consistent", pass: consistent });
    if (!consistent) {
      violations.push(`build-manifest features.bomModule=${manifest.features.bomModule} but artifact has BOM ${bom.enabled ? "enabled" : "disabled"}`);
    }
  }

  for (const rule of profile.prohibitedInArtifact) {
    const hit = rule.pattern.test(combined);
    checks.push({ id: `prohibit-${rule.id}`, pass: !hit });
    if (hit) violations.push(`prohibited pattern matched: ${rule.id}`);
  }

  const envMarkers = countEnvMarkers(combined);
  if (profile.requiredInArtifact?.appEnv === "dev") {
    const pass = envMarkers.dev >= 1;
    checks.push({ id: "dev-env-marker", pass });
    if (!pass) violations.push('DEV artifact missing baked "dev" environment marker');
  }
  if (profile.requiredInArtifact?.appEnv === "prod") {
    const pass = envMarkers.prod >= 1 && envMarkers.dev <= envMarkers.prod;
    checks.push({ id: "prod-env-marker", pass });
    if (!pass) violations.push('PROD artifact missing dominant "prod" environment marker');
  }

  const apiPattern = profile.requiredInArtifact?.apiHostPattern;
  if (apiPattern) {
    const pass = apiPattern.test(combined);
    checks.push({ id: "expected-api-host", pass });
    if (!pass) violations.push(`expected API host pattern missing for ${profile.id}`);
  }

  return {
    profile: profile.id,
    chunkCount: chunks.length,
    manifest,
    envMarkers,
    checks,
    violations,
    pass: violations.length === 0,
  };
}

export function analyzeArtifactFromProfile(profileId) {
  return analyzeArtifact("dist", profileId);
}

export { BUILD_PROFILES };
