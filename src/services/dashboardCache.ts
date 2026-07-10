/**
 * dashboardCache — lightweight in-memory cache for Dashboard data on the
 * native phone app only. Survives component unmount/remount so the Dashboard
 * shows instantly when navigating back, while still allowing the normal
 * network fetches to update the data in the background.
 *
 * Key design decisions:
 * - Module-level Map — survives route changes, clears on app restart (expected)
 * - 60 second TTL — safety net; data never gets dangerously stale
 * - Zero dependencies on other app modules — pure data store
 * - Only read/written by Dashboard.tsx (guarded by isMobileNativePlatform)
 * - Never bypasses or skips any network call — purely additive
 */

const DEFAULT_TTL_MS = 60_000; // 60 seconds

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();

/** Store a value in the cache with the default TTL. */
export function put<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** Retrieve a cached value. Returns null if missing or expired. */
export function get<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

/** Remove one entry. Call after a mutation that invalidates this data. */
export function invalidate(key: string): void {
  store.delete(key);
}

/** Remove all entries. Useful on logout. */
export function invalidateAll(): void {
  store.clear();
}

// ── Typed keys for Dashboard data ──────────────────────────────────
// Using string constants avoids typos and makes it easy to find all
// cache touchpoints.

export const DASHBOARD_CACHE_KEYS = {
  openIssues: "dashboard:openIssues",
  pendingSigs: "dashboard:pendingSigs",
  openAssets: "dashboard:openAssets",
  projectAssetSummary: "dashboard:projectAssetSummary",
  workload: "dashboard:workload",
  dashboardWorkspace: "dashboard:dashboardWorkspace",
  globalOffices: "dashboard:globalOffices",
  availableCountries: "dashboard:availableCountries",
  dashboardUsers: "dashboard:dashboardUsers",
  evidenceData: "dashboard:evidenceData",
  healthData: "dashboard:healthData",
} as const;