/** Short-lived sessionStorage paint cache for web list views (survives in-tab navigation). */

export function readWebSessionCache<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(`webSession:${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

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
