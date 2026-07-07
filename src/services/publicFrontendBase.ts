import { getApiBaseUrl } from "./apiBase";
import { settingsService } from "./settingsService";

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function formatOrigin(protocol: string, hostname: string, port: string): string {
  const normalizedPort = port.trim();
  const omitPort =
    (protocol === "http:" && normalizedPort === "80") ||
    (protocol === "https:" && normalizedPort === "443");

  return `${protocol}//${hostname}${omitPort || !normalizedPort ? "" : `:${normalizedPort}`}`;
}

export function getFallbackPublicFrontendBaseUrl(): string {
  try {
    const apiUrl = new URL(getApiBaseUrl());
    const browserProtocol = window.location.protocol;
    const defaultPort =
      browserProtocol === "https:"
        ? (window.location.port || "443")
        : (window.location.port || "5173");

    return formatOrigin(apiUrl.protocol, apiUrl.hostname, defaultPort);
  } catch {
    return trimTrailingSlash(window.location.origin);
  }
}

export async function resolvePublicFrontendBaseUrl(): Promise<string> {
  const frontendPort = window.location.port || (window.location.protocol === "https:" ? "443" : "5173");

  try {
    const runtime = await settingsService.getRuntimeFrontendBase(frontendPort);
    const runtimeBase = trimTrailingSlash(runtime.frontendBaseUrl || "");
    if (runtimeBase) return runtimeBase;
  } catch {
    // Fall through to the saved public setting.
  }

  try {
    const settings = await settingsService.getPublicAppSettings();
    const savedBase = trimTrailingSlash(settings.frontendBaseUrl || "");
    if (savedBase) return savedBase;
  } catch {
    // Fall through to the derived LAN-safe default.
  }

  return getFallbackPublicFrontendBaseUrl();
}
