import axios from "axios";

/**
 * True when a failed request should be treated as offline / unreachable and
 * queued for sync. Covers:
 * - api.ts request-interceptor synthetic errors (isOfflineSkip / offline-skip)
 *   which axios.isAxiosError() does NOT recognize (axios 1.13.x)
 * - genuine Axios network errors (no response)
 * - timeout / ERR_NETWORK shapes
 */
export function isOfflineNetworkError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  }

  const candidate = error as {
    response?: unknown;
    code?: string;
    message?: string;
    isOfflineSkip?: boolean;
  };

  if (candidate.isOfflineSkip) return true;
  if (candidate.message === "offline-skip") return true;
  if (candidate.response) return false;

  if (axios.isAxiosError(error) && !error.response) return true;

  return (
    (typeof navigator !== "undefined" && navigator.onLine === false) ||
    candidate.code === "ECONNABORTED" ||
    candidate.code === "ERR_NETWORK" ||
    candidate.message === "Network Error" ||
    candidate.message === "skip-network-offline" ||
    candidate.message === "offline-cache-miss"
  );
}
