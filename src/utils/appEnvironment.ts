export type AppEnvironment = "dev" | "prod";

/** Baked at build time via VITE_APP_ENV (set by build-cloud-web.mjs). */
export function getAppEnvironment(): AppEnvironment {
  const baked = import.meta.env.VITE_APP_ENV;
  if (baked === "dev") return "dev";
  if (baked === "prod" || baked === "production") return "prod";
  return import.meta.env.DEV ? "dev" : "prod";
}

export function isDevAppBuild(): boolean {
  return getAppEnvironment() === "dev";
}

export function isProdAppBuild(): boolean {
  return getAppEnvironment() === "prod";
}

/** Debug panel, API log buffer, dev_role override, verbose auth logging. */
export function isDebugFeaturesEnabled(): boolean {
  return isDevAppBuild();
}

export function debugLog(...args: unknown[]): void {
  if (isDebugFeaturesEnabled()) {
    console.log(...args);
  }
}
