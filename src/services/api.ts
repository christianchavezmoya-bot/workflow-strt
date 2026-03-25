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
    if (status === 401) {
      const reqUrl = config.url ?? "";
      // Don't redirect for login/refresh calls — they handle their own errors
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
