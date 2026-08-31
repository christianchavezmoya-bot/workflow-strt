/**
 * Scans built web artifacts for DEV/PROD isolation violations.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { BUILD_PROFILES, resolveProfile } from "../build-profiles.mjs";

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
