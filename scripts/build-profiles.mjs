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
    // Staging demos intentionally include BOM (every .env.staging*.example enables it).
    // Unlike prod this is a default, not a pin: an explicit VITE_ENABLE_BOM_MODULE=true|false wins.
    features: { bomModule: true },
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
    // Production ships BOM to Project (the production backend runs ENABLE_BOM_PROJECT_MODULE=true).
    // This is a PIN: build-cloud-web.mjs forces it regardless of env files or shell variables,
    // so a clean checkout can never silently build production without the module.
    // To turn BOM off in production, change it here in a reviewed PR — nowhere else.
    features: { bomModule: true },
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

/** Env var the frontend reads (src/modules/bom-project/featureFlag.ts). */
export const BOM_FLAG_ENV = "VITE_ENABLE_BOM_MODULE";

/**
 * Compile-time markers that only exist in a bundle built with the BOM module enabled.
 * Both come from code gated by BOM_MODULE_ENABLED, from two independent places:
 *   - sidebar: the nav entry's tourKey (src/components/layout/Sidebar.tsx)
 *   - routes:  the import-wizard route paths (src/app/routes.tsx)
 * The BOM module's own chunks (and strings such as "BOM to Project") ship in every
 * build, so they cannot be used to detect the flag. bom-flag.test.mjs fails if either
 * marker stops matching the source, so a rename cannot silently disarm the check.
 */
export const BOM_ARTIFACT_MARKERS = {
  sidebar: '"nav-bom"',
  routes: '"/admin/bom-project/imports/:id/mapping"',
};

/**
 * Decide the BOM flag for a profile build.
 *  - prod (pinned): always the profile value; an ambient/env-file value is reported, never used.
 *  - dev: an explicit "true"/"false" wins, otherwise the profile default.
 */
export function resolveBomModuleFlag(profile, envValue) {
  const declared = profile.features?.bomModule;
  if (typeof declared !== "boolean") {
    throw new Error(`Profile "${profile.id}" must declare features.bomModule (true|false).`);
  }
  const raw = envValue?.trim();
  if (profile.id === "prod") {
    const ignored = raw && raw !== String(declared) ? raw : null;
    return { enabled: declared, source: "profile-pin", ignoredEnvValue: ignored };
  }
  if (raw === "true" || raw === "false") {
    return { enabled: raw === "true", source: "env", ignoredEnvValue: null };
  }
  return { enabled: declared, source: "profile-default", ignoredEnvValue: raw || null };
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
