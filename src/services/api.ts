import axios from "axios";

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
  // Fail fast when server is unreachable so localStorage cache kicks in quickly
  timeout: 8000,
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
  // Skip refresh for the refresh call itself and for login-related endpoints
  const url = config.url ?? "";
  if (!url.includes("/auth/refresh") && !url.includes("/auth/login")) {
    await silentRefresh();
  }

  const token = localStorage.getItem("auth_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  (config as typeof config & { metadata?: { start: number } }).metadata = { start: Date.now() };
  return config;
});

// ── Global GET response cache ─────────────────────────────────────────────────
// Every successful GET is stored in localStorage keyed by URL+params.
// On network failure / timeout for a GET, we return the cached response so
// every page automatically shows last-known data while offline.

function apiCacheKey(url: string, params?: Record<string, unknown>): string {
  const q = params && Object.keys(params).length
    ? "?" + new URLSearchParams(params as Record<string, string>).toString()
    : "";
  return `api_cache_v2_${url}${q}`;
}

function isNetworkOrTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string; response?: unknown };
  if (e.response) return false;            // server replied (4xx/5xx) — not a network error
  return (
    e.code === "ECONNABORTED" ||           // axios timeout
    e.code === "ERR_NETWORK" ||
    e.message === "Network Error" ||
    !navigator.onLine
  );
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

    // Cache every successful GET response
    if (response.config.method?.toLowerCase() === "get" && response.config.url) {
      try {
        const key = apiCacheKey(response.config.url, response.config.params as Record<string, unknown>);
        localStorage.setItem(key, JSON.stringify(response.data));
      } catch { /* storage quota — ignore */ }
    }

    return response;
  },
  (error) => {
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

    // ── Offline / timeout fallback for GET requests ───────────────────────────
    if (config.method?.toLowerCase() === "get" && isNetworkOrTimeoutError(error) && config.url) {
      try {
        const key = apiCacheKey(config.url, config.params as Record<string, unknown>);
        const raw = localStorage.getItem(key);
        if (raw) {
          console.info(`[api] offline — serving cached response for ${config.url}`);
          window.dispatchEvent(new Event("api-serving-cache"));
          return Promise.resolve({
            data: JSON.parse(raw),
            status: 200,
            statusText: "OK (cached)",
            headers: {},
            config,
            request: null,
          });
        }
      } catch { /* parse error — fall through */ }
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
