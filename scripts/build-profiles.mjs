/**
 * Canonical DEV / PROD build profiles for web and native artifacts.
 * Used by build-cloud-web.mjs, build-cloud-native.mjs, and artifact isolation checks.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const BUILD_PROFILES = {
  dev: {
    id: "dev",
    appEnv: "dev",
    defaultApiBase: "https://api.staging.strata-ngo.com/api",
    envFiles: [".env.staging.local", ".env.staging", ".env.staging.strata-ngo.local", ".env.staging.strata-ngo.example"],
    requireHttps: false,
    debugFeaturesEnabled: true,
    capacitor: {
      appId: "com.strata.ngo.field.dev",
      appName: "N-Go DEV",
    },
    prohibitedInArtifact: [],
    requiredInArtifact: {
      appEnv: "dev",
      apiHostPattern: /api\.staging\.strata-ngo\.com/,
    },
  },
  prod: {
    id: "prod",
    appEnv: "prod",
    defaultApiBase: "https://api.strata-ngo.com/api",
    envFiles: [".env.production.local", ".env.production", ".env.production.strata-ngo.local", ".env.production.strata-ngo.example"],
    requireHttps: true,
    debugFeaturesEnabled: false,
    capacitor: {
      appId: "com.strata.ngo.field",
      appName: "N-Go",
    },
    prohibitedInArtifact: [
      { id: "staging-api-host", pattern: /api\.staging\.strata-ngo\.com/ },
      { id: "lan-ip-10", pattern: /10\.7\.15\.155/ },
      { id: "lan-ip-generic", pattern: /https?:\/\/10\.\d+\.\d+\.\d+/ },
    ],
    requiredInArtifact: {
      appEnv: "prod",
      apiHostPattern: /api\.strata-ngo\.com/,
    },
  },
};

export function resolveProfile(profileId) {
  const profile = BUILD_PROFILES[profileId];
  if (!profile) {
    throw new Error(`Unknown build profile "${profileId}". Expected "dev" or "prod".`);
  }
  return profile;
}

export function loadEnvFile(root, name) {
  const path = resolve(root, name);
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    }
    return true;
  } catch {
    return false;
  }
}

export function loadProfileEnv(root, profile) {
  for (const file of profile.envFiles) {
    loadEnvFile(root, file);
  }
}

export function validateApiBaseForProfile(apiBase, profile) {
  const trimmed = apiBase?.trim() ?? "";
  if (!trimmed) {
    throw new Error(
      `VITE_API_BASE is required for ${profile.id} builds. Copy the appropriate .env.*.example to a local env file.`,
    );
  }

  if (!trimmed.endsWith("/api") && !trimmed.endsWith("/api/")) {
    console.warn(`[build] WARN: VITE_API_BASE should end with /api (${trimmed})`);
  }

  if (profile.requireHttps && !trimmed.startsWith("https://")) {
    throw new Error(`Production builds require HTTPS VITE_API_BASE (got ${trimmed})`);
  }

  if (profile.id === "prod") {
    if (trimmed.includes("staging.strata-ngo.com")) {
      throw new Error("Production builds must not target the staging API host.");
    }
    if (/localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\./.test(trimmed)) {
      throw new Error("Production builds must not use LAN or localhost API URLs.");
    }
  }

  if (profile.id === "dev" && trimmed.includes("api.strata-ngo.com") && !trimmed.includes("staging")) {
    throw new Error("DEV builds must target the staging API (api.staging.strata-ngo.com), not production.");
  }

  return trimmed;
}

/** Fail closed when env files or shell vars conflict with the selected profile. */
export function validateAppEnvForProfile(appEnv, profile) {
  const trimmed = appEnv?.trim() ?? "";
  if (!trimmed) {
    return profile.appEnv;
  }
  if (trimmed !== profile.appEnv && trimmed !== "production" && !(profile.appEnv === "prod" && trimmed === "production")) {
    throw new Error(
      `VITE_APP_ENV=${trimmed} is not allowed for ${profile.id} builds (expected ${profile.appEnv}).`,
    );
  }
  return profile.appEnv;
}
