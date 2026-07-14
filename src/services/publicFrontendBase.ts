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

function isPrivateIpv4Host(hostname: string): boolean {
  const match = hostname.trim().match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return false;
  const [, aRaw, bRaw] = match;
  const a = Number(aRaw);
  const b = Number(bRaw);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function shouldPreferApiDerivedBase(candidateBase: string, apiDerivedBase: string): boolean {
  if (!candidateBase) return true;

  try {
    const candidateUrl = new URL(candidateBase);
    const apiDerivedUrl = new URL(apiDerivedBase);

    const candidateHost = candidateUrl.hostname.trim().toLowerCase();
    if (candidateHost === "localhost" || candidateHost === "127.0.0.1" || candidateHost === "::1") {
      return true;
    }

    return isPrivateIpv4Host(candidateHost)
      && isPrivateIpv4Host(apiDerivedUrl.hostname)
      && candidateHost !== apiDerivedUrl.hostname.toLowerCase();
  } catch {
    return false;
  }
}

function getApiDerivedPublicFrontendBaseUrl(): string {
  try {
    const apiUrl = new URL(getApiBaseUrl());
    const frontendPort = window.location.port || (window.location.protocol === "https:" ? "443" : "5173");
    return formatOrigin(apiUrl.protocol, apiUrl.hostname, frontendPort);
  } catch {
    return trimTrailingSlash(window.location.origin);
  }
}

export function getFallbackPublicFrontendBaseUrl(): string {
  return getApiDerivedPublicFrontendBaseUrl();
}

export async function resolvePublicFrontendBaseUrl(): Promise<string> {
  const frontendPort = window.location.port || (window.location.protocol === "https:" ? "443" : "5173");
  const apiDerivedBase = getApiDerivedPublicFrontendBaseUrl();

  try {
    const runtime = await settingsService.getRuntimeFrontendBase(frontendPort);
    const runtimeBase = trimTrailingSlash(runtime.frontendBaseUrl || "");
    if (runtimeBase && !shouldPreferApiDerivedBase(runtimeBase, apiDerivedBase)) return runtimeBase;
  } catch {
    // Fall through to the saved public setting.
  }

  try {
    const settings = await settingsService.getPublicAppSettings();
    const savedBase = trimTrailingSlash(settings.frontendBaseUrl || "");
    if (savedBase && !shouldPreferApiDerivedBase(savedBase, apiDerivedBase)) return savedBase;
  } catch {
    // Fall through to the derived LAN-safe default.
  }

  return apiDerivedBase;
}
