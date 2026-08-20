import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { cacheGet, cachePut } from "./localDB";
import { secureGet, secureSet, secureRemove } from "./secureStorage";
import { getApiBaseUrl } from "./apiBase";
import {
  shouldSkipBlockingFetch,
  shouldDeferBackgroundSync,
  shouldSkipInteractiveWrite,
} from "./connectivityMonitor";
import { isMobileNativePlatform } from "../utils/platform";
import { randomId } from "../utils/randomId";
import { formatPayloadSize } from "../utils/syncDiagnostics";
import { isCircuitOpen, resetCircuitBreaker } from "../utils/circuitBreaker";
import { isOfflineGraceValid, isOnlineForAuthSync } from "./biometricAuth";
import { markOfflinePerf } from "../utils/offlinePerf";
import { getTokenExpiry, getTokenLifetimeMs } from "../utils/authToken";
import { isSyncFlushing } from "../utils/syncFlushLock";
import { markApiRequestSuccess } from "./apiReachabilitySignals";

export const API_BASE_URL: string = getApiBaseUrl();

/** Matches axios default on the shared api instance below. */
export const API_DEFAULT_TIMEOUT_MS = 10_000;

if (
  isMobileNativePlatform() &&
  (API_BASE_URL.includes("localhost") || API_BASE_URL.includes("127.0.0.1"))
) {
  console.warn(
    `[api] API_BASE_URL is "${API_BASE_URL}" — iOS/Android builds cannot reach localhost. ` +
    `Set VITE_API_BASE to a LAN IP before building for device.`
  );
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json"
  },
  // 10 s ceiling for stalled requests; auth endpoints override this to 0.
  // With fetch-suppression guards in repositories, this rarely fires — it only
  // matters for genuine "was reachable a moment ago but this request stalls" cases.
  // Avoid going lower (e.g. 5s) because slow-but-valid requests on weak field
  // connections can take 6–8s.
  timeout: API_DEFAULT_TIMEOUT_MS,
});

/** Coalesce identical in-flight GETs on web so parallel mounts don't fan out duplicates. */
function inFlightGetKey(config: InternalAxiosRequestConfig): string {
  const params = config.params as Record<string, unknown> | undefined;
  const paramStr = params && typeof params === "object"
    ? Object.keys(params).sort().map((k) => `${k}=${String(params[k])}`).join("&")
    : "";
  return `${config.baseURL ?? ""}|${config.url ?? ""}|${paramStr}`;
}

type GetAdapter = (config: InternalAxiosRequestConfig) => Promise<AxiosResponse>;

const inFlightGets = new Map<string, Promise<AxiosResponse>>();

const rawAdapter = api.defaults.adapter ?? axios.defaults.adapter;
if (typeof rawAdapter === "function") {
  const baseGetAdapter = rawAdapter as GetAdapter;
  api.defaults.adapter = (config) => {
    const method = (config.method ?? "get").toLowerCase();
    if (method !== "get") {
      return baseGetAdapter(config);
    }
    const key = inFlightGetKey(config);
    const existing = inFlightGets.get(key);
    if (existing) return existing;
    const flight = baseGetAdapter(config).finally(() => {
      inFlightGets.delete(key);
    });
    inFlightGets.set(key, flight);
    return flight;
  };
}

export type ApiDebugSyncMeta = {
  source?: string;
  opType?: string;
  payloadBytes?: number;
};

export type ApiDebugLog = {
  id: string;
  time: string;
  method?: string;
  url?: string;
  status?: number;
  durationMs?: number;
  error?: string;
  payloadBytes?: number;
  payloadSizeFormatted?: string;
  opType?: string;
  source?: string;
};

type AxiosConfigWithMeta = {
  metadata?: { start: number };
  syncMeta?: ApiDebugSyncMeta;
};

const pushDebugLog = (log: ApiDebugLog) => {
  const anyWindow = window as typeof window & { __apiDebugLogs?: ApiDebugLog[] };
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
// Refresh the token if it expires within this many minutes (capped by token lifetime).
const REFRESH_THRESHOLD_MINUTES = 30;
/** Tokens shorter than this are never silently refreshed (1-min JWT test / row 9). */
const MIN_REFRESHABLE_LIFETIME_MS = 5 * 60 * 1000;
let refreshPromise: Promise<void> | null = null;
/** Prevents api-auth-error storms while Login is already shown on native. */
let nativeAuthExpiredSignaled = false;

if (typeof window !== "undefined") {
  window.addEventListener("auth-change", () => {
    nativeAuthExpiredSignaled = false;
    webSessionExpiredHandling = false;
  });
}

/** Native: switch App to Login via event — never hard-reload (reload loops with preserved token). Web: clear session and show Login without redundant reloads. */
let webSessionExpiredHandling = false;

function handleSessionExpiredOnline(): void {
  if (isMobileNativePlatform()) {
    if (nativeAuthExpiredSignaled) return;
    if (!isOnlineForAuthSync() && isOfflineGraceValid()) return;
    nativeAuthExpiredSignaled = true;
    window.dispatchEvent(new Event("api-auth-error"));
    return;
  }
  if (webSessionExpiredHandling) return;
  webSessionExpiredHandling = true;
  window.dispatchEvent(new Event("api-auth-error"));
  secureRemove("auth_token");
  secureRemove("auth_user");
  const onLoginRoute = window.location.pathname === "/login" || window.location.pathname === "/reset-password";
  if (!onLoginRoute) {
    window.location.href = "/login";
  } else {
    window.setTimeout(() => {
      webSessionExpiredHandling = false;
    }, 500);
  }
}

const silentRefresh = async () => {
  const token = secureGet("auth_token");
  if (!token || token === "local") return;

  const exp = getTokenExpiry(token);
  if (!exp) return;

  const remainingMs = exp * 1000 - Date.now();
  const lifetimeMs = getTokenLifetimeMs(token);
  if (lifetimeMs !== null && lifetimeMs < MIN_REFRESHABLE_LIFETIME_MS) {
    if (remainingMs < 0) {
      const online = !shouldSkipBlockingFetch() && !isCircuitOpen();
      if (isMobileNativePlatform() && online && !isSyncFlushing()) {
        handleSessionExpiredOnline();
      }
    }
    return;
  }
  const refreshThresholdMs = lifetimeMs !== null
    ? Math.min(REFRESH_THRESHOLD_MINUTES * 60 * 1000, lifetimeMs / 2)
    : REFRESH_THRESHOLD_MINUTES * 60 * 1000;
  if (remainingMs > refreshThresholdMs) return;
  if (remainingMs < 0) {
    // Online with an expired JWT: session is unusable — redirect to login.
    // Offline within the 24-hour grace window keeps the cached session alive.
    const online = !shouldSkipBlockingFetch() && !isCircuitOpen();
    if (isMobileNativePlatform() && online && !isSyncFlushing()) {
      handleSessionExpiredOnline();
    }
    return;
  }

  // Deduplicate concurrent refresh calls
  if (refreshPromise) {
    await refreshPromise;
    return;
  }

  refreshPromise = (async () => {
    try {
      const refreshBaseUrl = getApiBaseUrl();
      const res = await axios.post(
        `${refreshBaseUrl}/auth/refresh`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data?.token) {
        secureSet("auth_token", res.data.token);
        if (res.data.user) {
          secureSet("auth_user", JSON.stringify(res.data.user));
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

  // Non-auth requests: bail instantly when the request is doomed, so callers
  // fall through to their local-first cache immediately instead of burning a
  // full timeout first.
  //
  // Reads fail open on radio/manual only. Interactive mutations (POST/PUT/PATCH/DELETE)
  // also fast-bail when the amber banner already knows the server is unreachable,
  // so callers queue instantly instead of waiting for axios timeouts. Sync-engine
  // flush uploads use the same defer gate.
  const method = (config.method ?? "get").toLowerCase();
  const isSyncEngineWrite = config.syncMeta?.source === "sync-engine";
  const isMutation = method !== "get" && method !== "head" && method !== "options";

  // While the upload queue is flushing, defer non-critical GETs on native so a
  // large POST (e.g. RUN_COMPLETE with embedded photos) is not competing with
  // dashboard/catalog fetches on a slow LAN link.
  if (
    isMobileNativePlatform()
    && isSyncFlushing()
    && method === "get"
    && !url.includes("/auth/")
    && !isSyncEngineWrite
  ) {
    const err = new Error("offline-skip") as Error & { code?: string; isOfflineSkip?: boolean };
    err.code = "ERR_NETWORK";
    err.isOfflineSkip = true;
    throw err;
  }

  const skipBlocking =
    !url.includes("/auth/")
    && isMobileNativePlatform()
    && (
      isSyncEngineWrite
        ? shouldDeferBackgroundSync()
        : (isMutation ? shouldSkipInteractiveWrite() : shouldSkipBlockingFetch())
    );

  if (skipBlocking) {
    const err = new Error("offline-skip") as Error & { code?: string; isOfflineSkip?: boolean };
    err.code = "ERR_NETWORK";
    err.isOfflineSkip = true;
    throw err;
  }

  // Skip refresh for the refresh call itself and for login-related endpoints.
  // GETs must not block UI on token refresh — fire in background; mutations await.
  if (!url.includes("/auth/refresh") && !url.includes("/auth/login")) {
    if (method === "get") {
      void silentRefresh();
    } else {
      markOfflinePerf("token_refresh_start", url);
      await silentRefresh();
      markOfflinePerf("token_refresh_end", url);
    }
  }

  const token = secureGet("auth_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Auth endpoints must never time out — give them unlimited time.
  // The 8s timeout only applies to data GETs so the cache kicks in quickly.
  if (url.includes("/auth/")) {
    config.timeout = 0;
  }

  config.baseURL = getApiBaseUrl();
  (config as typeof config & AxiosConfigWithMeta).metadata = { start: Date.now() };
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
  if (!isMobileNativePlatform()) {
    const res = await api.get<T>(url, { params });
    return res.data;
  }

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
  // Fast-bail when we already know the server is unreachable: skip the doomed
  // request instead of waiting the full axios 10 s timeout before failing.
  // The connectivity monitor, native radio, and navigator.onLine are all
  // already consulted by shouldSkipBlockingFetch().
  if (shouldSkipBlockingFetch() || isCircuitOpen()) {
    throw new Error("offline-cache-miss");
  }
  const res = await api.get<T>(url, { params });
  return res.data;
}

api.interceptors.response.use(
  (response) => {
    const cfg = response.config as typeof response.config & AxiosConfigWithMeta;
    const meta = cfg.metadata;
    const syncMeta = cfg.syncMeta;
    const durationMs = meta?.start ? Date.now() - meta.start : undefined;
    pushDebugLog({
      id: randomId(),
      time: new Date().toLocaleTimeString(),
      method: response.config.method?.toUpperCase(),
      url: response.config.url,
      status: response.status,
      durationMs,
      payloadBytes: syncMeta?.payloadBytes,
      payloadSizeFormatted: syncMeta?.payloadBytes != null
        ? formatPayloadSize(syncMeta.payloadBytes)
        : undefined,
      opType: syncMeta?.opType,
      source: syncMeta?.source,
    });

    // Persist every fresh GET response so the cache stays warm
    if (isMobileNativePlatform() && response.config.method?.toLowerCase() === "get" && response.config.url) {
      cachePut(
        apiCacheKey(response.config.url, response.config.params as Record<string, unknown>),
        response.data
      ).catch(() => {});
    }

    markApiRequestSuccess();
    resetCircuitBreaker();
    window.dispatchEvent(new Event("api-server-reachable"));

    return response;
  },
  async (error) => {
    const status = error?.response?.status;
    const config = error?.config || {};

    // Outcome-based reachability signal.
    //
    // Only a real request failing with a genuine network error should mark the
    // server unreachable. HTTP responses like 403/404/500 prove the server
    // answered, so those do not count as unreachable.
    // Trip the circuit breaker only via the connectivityMonitor listener on this
    // event — calling tripCircuitBreaker() here as well double-counted failures.
    if (!(error as { isOfflineSkip?: boolean })?.isOfflineSkip && isNetworkOrTimeoutError(error)) {
      const isTimeout = (error as { code?: string }).code === "ECONNABORTED";
      window.dispatchEvent(new CustomEvent("api-server-unreachable", { detail: { isTimeout } }));
    }
    const cfg = config as typeof config & AxiosConfigWithMeta;
    const meta = cfg.metadata;
    const syncMeta = cfg.syncMeta;
    const durationMs = meta?.start ? Date.now() - meta.start : undefined;
    pushDebugLog({
      id: randomId(),
      time: new Date().toLocaleTimeString(),
      method: config.method?.toUpperCase(),
      url: config.url,
      status,
      durationMs,
      error: error?.message,
      payloadBytes: syncMeta?.payloadBytes,
      payloadSizeFormatted: syncMeta?.payloadBytes != null
        ? formatPayloadSize(syncMeta.payloadBytes)
        : undefined,
      opType: syncMeta?.opType,
      source: syncMeta?.source,
    });

    // Last-resort fallback: if a network request fails (cache miss path) try cache
    if (isMobileNativePlatform() && config.method?.toLowerCase() === "get" && isNetworkOrTimeoutError(error) && config.url) {
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
      // Don't redirect for login/refresh calls — they handle their own errors
      if (!reqUrl.includes("/auth/login") && !reqUrl.includes("/auth/refresh") && !reqUrl.includes("/brand-settings")) {
        const allowOfflineSession =
          isMobileNativePlatform()
          && isOfflineGraceValid()
          && shouldSkipBlockingFetch();
        if (allowOfflineSession) {
          return Promise.reject(error);
        }
        handleSessionExpiredOnline();
      }
    }
    if (status >= 500) {
      console.error("Server error", error);
    }
    return Promise.reject(error);
  }
);

export default api;
