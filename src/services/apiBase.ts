import { isMobileNativePlatform } from "../utils/platform";

const API_BASE_STORAGE_KEY = "commtrac_api_base";

// Clear any previously stored override — API URL is now controlled by VITE_API_BASE in .env
try { localStorage.removeItem(API_BASE_STORAGE_KEY); } catch { /* ignore */ }

function normalizeApiBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const withoutTrailingSlash = trimmed.replace(/\/+$/, "");
  return /\/api$/i.test(withoutTrailingSlash)
    ? withoutTrailingSlash
    : `${withoutTrailingSlash}/api`;
}

function tryParseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function isPrivateLanHost(hostname: string): boolean {
  return /^10\./.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
}

function rehostBrowserApiBase(baked: string, hostname: string): string {
  const parsed = tryParseUrl(baked);
  if (!parsed || isLoopbackHost(hostname)) return baked;

  const shouldRehost = isLoopbackHost(parsed.hostname)
    || (isPrivateLanHost(parsed.hostname) && parsed.hostname !== hostname);

  if (!shouldRehost) return baked;

  parsed.hostname = hostname;
  return normalizeApiBaseUrl(parsed.toString());
}

export function getStoredApiBaseUrl(): string | null {
  try {
    const raw = localStorage.getItem(API_BASE_STORAGE_KEY);
    if (!raw) return null;
    const normalized = normalizeApiBaseUrl(raw);
    return normalized || null;
  } catch {
    return null;
  }
}

export function getDefaultApiBaseUrl(): string {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  const port = window.location.port;
  const localBrowserDefault = `${protocol}//${hostname}:4000/api`;
  const dockerStagingBrowserDefault = `${protocol}//${hostname}:8080/api`;
  const baked = import.meta.env.VITE_API_BASE
    ? normalizeApiBaseUrl(import.meta.env.VITE_API_BASE)
    : "";

  if (!isMobileNativePlatform() && (hostname === "localhost" || hostname === "127.0.0.1")) {
    // Docker staging web (:5174) bakes VITE_API_BASE=http://localhost:8080/api — honour it.
    if (baked && /localhost|127\.0\.0\.1/i.test(baked)) {
      return baked;
    }
    return localBrowserDefault;
  }

  if (!isMobileNativePlatform() && port === "5174") {
    // Docker staging serves the web app on :5174 and the sibling API on :8080.
    // Always prefer the live sibling API instead of any device-build value baked into the bundle.
    return baked && /:8080\/api$/i.test(baked)
      ? rehostBrowserApiBase(baked, hostname)
      : dockerStagingBrowserDefault;
  }

  if (!isMobileNativePlatform() && baked) {
    return rehostBrowserApiBase(baked, hostname);
  }

  if (baked) {
    return baked;
  }
  return localBrowserDefault;
}

export function getApiBaseUrl(): string {
  return getDefaultApiBaseUrl();
}

export function setStoredApiBaseUrl(raw: string): string {
  const normalized = normalizeApiBaseUrl(raw);
  if (!normalized) {
    clearStoredApiBaseUrl();
    return "";
  }
  localStorage.setItem(API_BASE_STORAGE_KEY, normalized);
  window.dispatchEvent(new CustomEvent("api-base-changed", { detail: { baseUrl: normalized } }));
  return normalized;
}

export function clearStoredApiBaseUrl(): void {
  localStorage.removeItem(API_BASE_STORAGE_KEY);
  window.dispatchEvent(new Event("api-base-changed"));
}
