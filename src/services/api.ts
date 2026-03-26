import axios from "axios";
import { cacheGet, cachePut } from "./localDB";

// Automatically determine API base URL based on current hostname
const getApiBaseUrl = () => {
  // If VITE_API_BASE is explicitly set, use it
  if (import.meta.env.VITE_API_BASE) {
    return import.meta.env.VITE_API_BASE;
  }

  // Otherwise, use the same host as the frontend
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  return `${protocol}//${hostname}:4000/api`;
};

const api = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    "Content-Type": "application/json"
  },
  // Only used when there is no cache — auth endpoints override this to 0
  timeout: 5000,
});

type DebugLog = {
  id: string;
  time: string;
  method?: string;
  url?: string;
  status?: number;
  durationMs?: number;
  error?: string;
};

const pushDebugLog = (log: DebugLog) => {
  const anyWindow = window as typeof window & { __apiDebugLogs?: DebugLog[] };
  if (!anyWindow.__apiDebugLogs) {
    anyWindow.__apiDebugLogs = [];
  }
  anyWindow.__apiDebugLogs.push(log);
  if (anyWindow.__apiDebugLogs.length > 100) {
    anyWindow.__apiDebugLogs.shift();
  }
  window.dispatchEvent(new Event("api-debug-log"));
};

// ── Silent token refresh ────────────────────────────────────────────
// Decode JWT expiry without a library. Returns epoch seconds or null.
const getTokenExpiry = (token: string): number | null => {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp ?? null;
  } catch {
    return null;
  }
};

// Refresh the token if it expires within this many minutes
const REFRESH_THRESHOLD_MINUTES = 30;
let refreshPromise: Promise<void> | null = null;

const silentRefresh = async () => {
  const token = localStorage.getItem("auth_token");
  if (!token || token === "local") return;

  const exp = getTokenExpiry(token);
  if (!exp) return;

  const remainingMs = exp * 1000 - Date.now();
  if (remainingMs > REFRESH_THRESHOLD_MINUTES * 60 * 1000) return; // not close to expiry
  if (remainingMs < 0) return; // already expired — let 401 handler redirect

  // Deduplicate concurrent refresh calls
  if (refreshPromise) {
    await refreshPromise;
    return;
  }

  refreshPromise = (async () => {
    try {
      const res = await axios.post(
        `${getApiBaseUrl()}/auth/refresh`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data?.token) {
        localStorage.setItem("auth_token", res.data.token);
        if (res.data.user) {
          localStorage.setItem("auth_user", JSON.stringify(res.data.user));
        }
      }
    } catch {
      // Refresh failed — token may be invalid; let the next 401 handle it
    }
  })();

  try { await refreshPromise; } finally { refreshPromise = null; }
};

api.interceptors.request.use(async (config) => {
  const url = config.url ?? "";

  // Skip refresh for the refresh call itself and for login-related endpoints
  if (!url.includes("/auth/refresh") && !url.includes("/auth/login")) {
    await silentRefresh();
  }

  const token = localStorage.getItem("auth_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Auth endpoints must never time out — give them unlimited time.
  // The 8s timeout only applies to data GETs so the cache kicks in quickly.
  if (url.includes("/auth/")) {
    config.timeout = 0;
  }

  (config as typeof config & { metadata?: { start: number } }).metadata = { start: Date.now() };
  return config;
});

// ── Stale-while-revalidate GET cache ──────────────────────────────────────────
// Strategy: serve cached data INSTANTLY on every GET, then update the cache
// in the background. Data is always visible immediately — no waiting on network.
// If there is no cache yet (first load), the network request runs normally.

export function apiCacheKey(url: string, params?: Record<string, unknown>): string {
  const q = params && Object.keys(params).length
    ? "?" + new URLSearchParams(params as Record<string, string>).toString()
    : "";
  return `api_cache_v2_${url}${q}`;
}

function isNetworkOrTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string; response?: unknown };
  if (e.response) return false;
  return (
    e.code === "ECONNABORTED" ||
    e.code === "ERR_NETWORK" ||
    e.message === "Network Error" ||
    !navigator.onLine
  );
}

// ── cachedGet: stale-while-revalidate for GET requests ───────────────────────
// Returns cached data instantly if available, fires a background refresh,
// and notifies subscribers when fresh data arrives.
// Falls back to waiting for the network when no cache exists yet.
export async function cachedGet<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const key = apiCacheKey(url, params);
  const cached = await cacheGet<T>(key);

  if (cached !== null) {
    // Serve cache immediately — kick off background refresh
    api.get<T>(url, { params }).then((res) => {
      cachePut(key, res.data).catch(() => {});
      window.dispatchEvent(new CustomEvent("api-cache-updated", {
        detail: { url, data: res.data }
      }));
    }).catch(() => {
      window.dispatchEvent(new Event("api-serving-cache"));
    });
    return cached;
  }

  // No cache yet — wait for network normally
  const res = await api.get<T>(url, { params });
  return res.data;
}

api.interceptors.response.use(
  (response) => {
    const meta = (response.config as typeof response.config & { metadata?: { start: number } }).metadata;
    const durationMs = meta?.start ? Date.now() - meta.start : undefined;
    pushDebugLog({
      id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
      time: new Date().toLocaleTimeString(),
      method: response.config.method?.toUpperCase(),
      url: response.config.url,
      status: response.status,
      durationMs
    });

    // Persist every fresh GET response so the cache stays warm
    if (response.config.method?.toLowerCase() === "get" && response.config.url) {
      cachePut(
        apiCacheKey(response.config.url, response.config.params as Record<string, unknown>),
        response.data
      ).catch(() => {});
    }

    // Real server response — signal server is reachable (used by sync engine)
    window.dispatchEvent(new Event("api-server-reachable"));

    return response;
  },
  async (error) => {
    const status = error?.response?.status;
    const config = error?.config || {};
    const meta = (config as typeof config & { metadata?: { start: number } }).metadata;
    const durationMs = meta?.start ? Date.now() - meta.start : undefined;
    pushDebugLog({
      id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
      time: new Date().toLocaleTimeString(),
      method: config.method?.toUpperCase(),
      url: config.url,
      status,
      durationMs,
      error: error?.message
    });

    // Last-resort fallback: if a network request fails (cache miss path) try cache
    if (config.method?.toLowerCase() === "get" && isNetworkOrTimeoutError(error) && config.url) {
      const key = apiCacheKey(config.url, config.params as Record<string, unknown>);
      const cached = await cacheGet(key);
      if (cached !== null) {
        window.dispatchEvent(new Event("api-serving-cache"));
        return Promise.resolve({
          data: cached,
          status: 200,
          statusText: "OK (cached)",
          headers: {},
          config,
          request: null,
        });
      }
    }

    if (status === 401) {
      const reqUrl = config.url ?? "";
      if (!reqUrl.includes("/auth/login") && !reqUrl.includes("/auth/refresh")) {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");
        window.location.href = "/login";
      }
    }
    if (status >= 500) {
      console.error("Server error", error);
    }
    return Promise.reject(error);
  }
);

export default api;
