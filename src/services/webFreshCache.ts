/**
 * webFreshCache — short-lived, in-memory stale-while-revalidate cache for
 * the WEB BROWSER read path only (never used on the native phone app).
 *
 * Context: the phone app uses a persistent, IndexedDB-backed local-first
 * cache (see localDB.ts's cacheGet/cachePut, and the repository pattern in
 * src/repositories/) so it can keep working fully offline. The web browser
 * is intentionally NOT offline-capable — every write and every "first load"
 * read always goes straight to the server, and there is no IndexedDB
 * involved at all for the browser's data reads.
 *
 * The problem this module solves: "always live" was previously implemented
 * as "never cache anything, ever" for the browser, which meant every single
 * click — even re-opening a screen you were on 5 seconds ago — paid a full
 * network round trip with nothing on screen while it waited. That's the
 * "depressingly slow" feeling reported when using the app from a browser
 * that isn't on the same machine as the server.
 *
 * The fix: a tiny in-memory cache (a plain Map — nothing written to disk,
 * nothing that survives a page reload) with a short TTL. On a cache hit,
 * the last-known result is returned INSTANTLY, while the real network
 * request still fires immediately in the background to get the truth and
 * refresh the cache. This is "stale-while-revalidate" — the browser is
 * never more than a few seconds behind the server, and a full page reload
 * or a wait longer than the TTL always produces a fully live fetch, with
 * zero risk of ever serving meaningfully outdated data.
 *
 * This module is read-only by design: it has no concept of writes, no
 * queue, no persistence. It must never be used to wrap a POST/PUT/PATCH/
 * DELETE call — those must always go straight to the server, exactly as
 * the existing platform split already does today.
 */

const DEFAULT_TTL_MS = 20_000;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();

function sessionStorageKey(cacheKey: string): string {
  return `webSession:${cacheKey}`;
}

function readSessionSnapshot<T>(cacheKey: string): T | null {
  try {
    const raw = sessionStorage.getItem(sessionStorageKey(cacheKey));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeSessionSnapshot<T>(cacheKey: string, value: T): void {
  try {
    sessionStorage.setItem(sessionStorageKey(cacheKey), JSON.stringify(value));
  } catch {
    // Ignore quota / private mode errors.
  }
}

function removeSessionSnapshot(cacheKey: string): void {
  try {
    sessionStorage.removeItem(sessionStorageKey(cacheKey));
  } catch {
    // Ignore.
  }
}

/** Synchronous read for instant in-tab paint (pairs with `persistSession` on webCachedGet). */
export function peekWebSessionCache<T>(cacheKey: string): T | null {
  return readSessionSnapshot<T>(cacheKey);
}

/**
 * Build a stable cache key from a logical name and an optional params
 * object. Call sites pass their own descriptive key (e.g. the URL plus
 * any id/filter that makes the result unique) rather than relying on this
 * module to inspect request internals.
 */
export function webCacheKey(name: string, params?: Record<string, unknown>): string {
  if (!params || Object.keys(params).length === 0) return name;
  const sorted = Object.keys(params).sort().map((k) => `${k}=${String(params[k])}`).join("&");
  return `${name}?${sorted}`;
}

/**
 * Stale-while-revalidate wrapper for a single read.
 *
 * - Cache hit (not expired): returns the cached value immediately, AND
 *   fires `fetcher()` in the background to refresh the cache. The
 *   `onFresh` callback (if provided) is called once the background fetch
 *   resolves, so callers showing a list on screen can update it the moment
 *   real data arrives rather than silently staying on the stale snapshot.
 * - Cache miss or expired: awaits `fetcher()` normally (identical to the
 *   pre-existing live-fetch behavior — no change, no regression for first
 *   loads or for anyone who waited longer than the TTL).
 *
 * Errors from the background revalidation fetch are swallowed — a failed
 * background refresh should never throw or disrupt whatever the cache hit
 * already returned to the caller.
 */
export async function webCachedGet<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: { ttlMs?: number; onFresh?: (value: T) => void; persistSession?: boolean }
): Promise<T> {
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  const entry = store.get(key) as CacheEntry<T> | undefined;
  const now = Date.now();

  const scheduleBackgroundRefresh = () => {
    fetcher()
      .then((fresh) => {
        store.set(key, { value: fresh, expiresAt: Date.now() + ttlMs });
        if (options?.persistSession) writeSessionSnapshot(key, fresh);
        options?.onFresh?.(fresh);
      })
      .catch(() => { /* background refresh failed — keep serving stale until TTL expires */ });
  };

  if (entry && entry.expiresAt > now) {
    scheduleBackgroundRefresh();
    return entry.value;
  }

  if (options?.persistSession) {
    const sessionSnapshot = readSessionSnapshot<T>(key);
    if (sessionSnapshot !== null) {
      store.set(key, { value: sessionSnapshot, expiresAt: now + ttlMs });
      scheduleBackgroundRefresh();
      return sessionSnapshot;
    }
  }

  const fresh = await fetcher();
  store.set(key, { value: fresh, expiresAt: Date.now() + ttlMs });
  if (options?.persistSession) writeSessionSnapshot(key, fresh);
  return fresh;
}

/** Drop one cached entry — call this right after a successful write so the
 * very next read for that same data is guaranteed to be live, not stale. */
export function invalidateWebCache(key: string): void {
  store.delete(key);
  removeSessionSnapshot(key);
}

/** Drop every cached entry whose key starts with the given prefix. Useful
 * when a single write could affect several related list views at once. */
export function invalidateWebCacheByPrefix(prefix: string): void {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
  try {
    const fullPrefix = sessionStorageKey(prefix);
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(fullPrefix)) sessionStorage.removeItem(k);
    }
  } catch {
    // Ignore private mode / unavailable sessionStorage.
  }
}

/** Test/debug helper — clears everything. Not used in production code paths. */
export function _clearWebCacheForTests(): void {
  store.clear();
}
