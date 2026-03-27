/**
 * secureStorage — thin wrapper over iOS Keychain / Android Keystore.
 *
 * On native (iOS / Android):
 *   Uses capacitor-secure-storage-plugin → data goes to iOS Keychain /
 *   Android EncryptedSharedPreferences.  Never touches localStorage.
 *
 * On web (dev / browser):
 *   Falls back to localStorage so existing dev workflows are unchanged.
 *
 * Usage pattern (sync reads, async writes):
 *   secureGet(key)          → sync, reads from in-memory cache
 *   secureSet(key, value)   → async, updates cache + persists to Keychain
 *   secureRemove(key)       → async, removes from cache + Keychain
 *   secureClearAuth()       → async, wipes all auth keys (call on logout)
 *   initSecureStorage()     → must be awaited once before the app renders
 */

import { Capacitor } from "@capacitor/core";

// All keys that live in Keychain (not localStorage)
const SECURE_KEYS = [
  "auth_token",
  "auth_user",
  "local_auth_user",
  "trusted_device_token",
  "offline_expiry",        // reserved for Step 2 (offline policy)
] as const;

// In-memory cache — always up-to-date, populated by initSecureStorage()
const cache = new Map<string, string | null>();

let _initDone = false;
let _initPromise: Promise<void> | null = null;

// Lazy-load the plugin so it doesn't break on web where the native layer is absent
async function getPlugin() {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { SecureStoragePlugin } = await import("capacitor-secure-storage-plugin");
    return SecureStoragePlugin;
  } catch {
    return null;
  }
}

// Wrap a promise with a timeout — resolves to fallback value on timeout
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

/**
 * Call once before the app renders (in main.tsx).
 * Loads every secure key from Keychain into the in-memory cache.
 * Also migrates any values still in localStorage → Keychain (one-time).
 */
export async function initSecureStorage(): Promise<void> {
  if (_initDone) return;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const plugin = await getPlugin();

    for (const key of SECURE_KEYS) {
      if (plugin) {
        try {
          // 800 ms timeout per key — if Keychain hangs, fall back to localStorage
          const result = await withTimeout(plugin.get({ key }), 800, { value: null as string | null });
          if (result.value !== null) {
            cache.set(key, result.value);
          } else {
            // Not in Keychain yet — check localStorage for migration
            const legacy = localStorage.getItem(key);
            if (legacy) {
              cache.set(key, legacy);
              try { await withTimeout(plugin.set({ key, value: legacy }), 800, undefined); } catch { /* non-fatal */ }
              localStorage.removeItem(key);
            } else {
              cache.set(key, null);
            }
          }
        } catch {
          cache.set(key, localStorage.getItem(key));
        }
      } else {
        // Web fallback: mirror localStorage
        cache.set(key, localStorage.getItem(key));
      }
    }

    _initDone = true;
  })();

  return _initPromise;
}

/** Synchronous read — returns from in-memory cache. Always fast. */
export function secureGet(key: string): string | null {
  return cache.get(key) ?? null;
}

/** Write value — updates cache immediately, persists to Keychain async. */
export async function secureSet(key: string, value: string): Promise<void> {
  cache.set(key, value);
  const plugin = await getPlugin();
  if (plugin) {
    try { await plugin.set({ key, value }); } catch { /* non-fatal */ }
  } else {
    localStorage.setItem(key, value);
  }
}

/** Remove value — clears cache immediately, removes from Keychain async. */
export async function secureRemove(key: string): Promise<void> {
  cache.set(key, null);
  const plugin = await getPlugin();
  if (plugin) {
    try { await plugin.remove({ key }); } catch { /* non-fatal */ }
  } else {
    localStorage.removeItem(key);
  }
}

/** Wipe all auth keys — call on logout. */
export async function secureClearAuth(): Promise<void> {
  await Promise.all(SECURE_KEYS.map((key) => secureRemove(key)));
}
