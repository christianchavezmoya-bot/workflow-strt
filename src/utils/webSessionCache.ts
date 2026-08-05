/** @deprecated Prefer `peekWebSessionCache` from `webFreshCache.ts` — kept for callers using the old module path. */
export { peekWebSessionCache as readWebSessionCache } from "../services/webFreshCache";

export function writeWebSessionCache<T>(key: string, value: T): void {
  try {
    sessionStorage.setItem(`webSession:${key}`, JSON.stringify(value));
  } catch {
    // Ignore quota / private mode errors.
  }
}

export function clearWebSessionCacheByPrefix(prefix: string): void {
  try {
    const fullPrefix = `webSession:${prefix}`;
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(fullPrefix)) sessionStorage.removeItem(k);
    }
  } catch {
    // Ignore.
  }
}
