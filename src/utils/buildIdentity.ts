import pkg from "../../package.json";
import { getAppEnvironment, isDevAppBuild, type AppEnvironment } from "./appEnvironment";
import { isMobileNativePlatform } from "./platform";
import { safeApiHost } from "./syncDiagnostics";

export interface ClientBuildIdentity {
  environment: AppEnvironment;
  appVersion: string;
  buildNumber: string;
  buildSha: string;
  buildTime: string;
  apiHost: string;
  platform: "web" | "native";
  debugFeaturesEnabled: boolean;
}

/** Non-sensitive build identity baked at compile time for support diagnostics. */
export function getClientBuildIdentity(): ClientBuildIdentity {
  const appVersion = import.meta.env.VITE_APP_VERSION ?? pkg.version;
  return {
    environment: getAppEnvironment(),
    appVersion,
    buildNumber: appVersion,
    buildSha: import.meta.env.VITE_BUILD_SHA ?? "unknown",
    buildTime: import.meta.env.VITE_BUILD_TIME ?? "",
    apiHost: safeApiHost(),
    platform: isMobileNativePlatform() ? "native" : "web",
    debugFeaturesEnabled: isDevAppBuild(),
  };
}

export function formatClientBuildIdentityLine(): string {
  const id = getClientBuildIdentity();
  const envLabel = id.environment.toUpperCase();
  const sha = id.buildSha.slice(0, 8);
  return `${envLabel} · v${id.appVersion} · ${id.platform} · ${id.apiHost} · ${sha}`;
}
