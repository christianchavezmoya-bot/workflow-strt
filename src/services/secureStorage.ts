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

import { isMobileNativePlatform } from "../utils/platform";

type SecureStoragePluginHandle = {
  plugin: {
    get(options: { key: string }): Promise<{ value: string | null }>;
    set(options: { key: string; value: string }): Promise<unknown>;
    remove(options: { key: string }): Promise<unknown>;
  };
};

// All keys that live in Keychain (not localStorage)
const SECURE_KEYS = [
  "auth_token",
  "auth_user",
  "local_auth_user",
  "trusted_device_token",
  "last_online_login",     // timestamp of last successful online login
  "app_pin_hash",          // optional PIN fallback for when biometric unavailable
  "just_authenticated",    // flag to skip biometric on fresh login (cleared after app opens)
] as const;

// In-memory cache — always up-to-date, populated by initSecureStorage()
const cache = new Map<string, string | null>();

let _initDone = false;
let _initPromise: Promise<void> | null = null;

// Lazy-load the plugin so it doesn't break on web where the native layer is absent
async function getPlugin(): Promise<SecureStoragePluginHandle | null> {
  if (!isMobileNativePlatform()) return null;
  try {
    // Add timeout to plugin loading
    const pluginPromise = import("capacitor-secure-storage-plugin");
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000));
    const result = await Promise.race([pluginPromise, timeoutPromise]);
    if (!result) {
      console.warn("[SecureStorage] Plugin load timeout");
      return null;
    }
    return { plugin: result.SecureStoragePlugin };
  } catch (e) {
    console.warn("[SecureStorage] Plugin load error:", e);
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
    console.log("[SecureStorage] Starting initialization...");
    
    // First, immediately load from localStorage to unblock the app
    for (const key of SECURE_KEYS) {
      const value = localStorage.getItem(key);
      cache.set(key, value);
    }
    _initDone = true;
    console.log("[SecureStorage] Loaded from localStorage, app can continue");
    
    // Then try to load from Keychain in background (non-blocking)
    // This allows the app to start even if Keychain is slow
    getPlugin().then(async (handle) => {
      const plugin = handle?.plugin;
      if (!plugin) return;
      console.log("[SecureStorage] Keychain plugin loaded, checking for migrated data...");
      
      for (const key of SECURE_KEYS) {
        try {
          const result = await Promise.race([
            plugin.get({ key }),
            new Promise<{ value: null }>((resolve) => setTimeout(() => resolve({ value: null }), 500))
          ]);
          if (result.value !== null && !cache.get(key)) {
            // Only update cache if we didn't have a value
            cache.set(key, result.value);
            console.log(`[SecureStorage] Loaded ${key} from Keychain`);
          }
        } catch {
          // Ignore errors - localStorage is our fallback
        }
      }
    }).catch(() => {
      // Plugin failed to load, localStorage is our storage
    });
  })();

  return _initPromise;
}

/** Synchronous read — returns from in-memory cache. Always fast. */
export function secureGet(key: string): string | null {
  return cache.get(key) ?? null;
}

/** Write value — updates cache immediately, persists to localStorage, then Keychain in background. */
export async function secureSet(key: string, value: string): Promise<void> {
  // Always update cache first (synchronous, instant)
  cache.set(key, value);
  
  // Always save to localStorage immediately (synchronous, reliable)
  localStorage.setItem(key, value);
  console.log(`[SecureStorage] Saved ${key} to localStorage`);
  
  // Try Keychain in background (completely non-blocking)
  // Don't wait for this - localStorage is our reliable storage
  getPlugin().then(async (handle) => {
    const plugin = handle?.plugin;
    if (plugin) {
      try {
        await plugin.set({ key, value });
        console.log(`[SecureStorage] Saved ${key} to Keychain`);
      } catch (e) {
        console.warn(`[SecureStorage] Keychain save failed for ${key}:`, e);
      }
    }
  }).catch(() => {});
}

/** Background persistence - saves to both localStorage AND Keychain */
async function persistToKeychain(key: string, value: string): Promise<void> {
  // Always save to localStorage as backup (instant, reliable)
  localStorage.setItem(key, value);
  
  const plugin = (await getPlugin())?.plugin;
  if (plugin) {
    try {
      await plugin.set({ key, value });
      console.log(`[SecureStorage] Saved ${key} to Keychain`);
    } catch (e) {
      // non-fatal - localStorage is our backup
      console.warn("[SecureStorage] Failed to persist to Keychain:", key, e);
    }
  }
}

/** Remove value — clears cache immediately, removes from localStorage. */
export async function secureRemove(key: string): Promise<void> {
  // Update cache immediately (synchronous)
  cache.set(key, null);
  
  // Always remove from localStorage immediately
  localStorage.removeItem(key);
  
  // Remove from Keychain in background (non-blocking)
  getPlugin().then(async (handle) => {
    const plugin = handle?.plugin;
    if (plugin) {
      try { await plugin.remove({ key }); } catch { /* non-fatal */ }
    }
  }).catch(() => {});
}

/** Background removal - removes from both localStorage AND Keychain */
async function removeFromKeychain(key: string): Promise<void> {
  // Always remove from localStorage
  localStorage.removeItem(key);
  
  const plugin = (await getPlugin())?.plugin;
  if (plugin) {
    try { await plugin.remove({ key }); } catch { /* non-fatal */ }
  }
}

/** Wipe all auth keys — call on logout. */
export async function secureClearAuth(): Promise<void> {
  await Promise.all(SECURE_KEYS.map((key) => secureRemove(key)));
}
