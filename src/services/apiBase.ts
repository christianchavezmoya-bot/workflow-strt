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
  if (import.meta.env.VITE_API_BASE) {
    return normalizeApiBaseUrl(import.meta.env.VITE_API_BASE);
  }
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  return `${protocol}//${hostname}:4000/api`;
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
