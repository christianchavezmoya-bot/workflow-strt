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
    keys(): Promise<{ value: string[] }>;
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

/** Keys whose values must never appear in logs (JWT, hashes, device tokens). */
const SECRET_VALUE_KEYS = new Set<string>([
  "auth_token",
  "trusted_device_token",
  "app_pin_hash",
]);

// In-memory cache — always up-to-date, populated by initSecureStorage()
const cache = new Map<string, string | null>();

let _initDone = false;
let _initPromise: Promise<void> | null = null;

const KEYCHAIN_READ_TIMEOUT_MS = 2_000;

function logSecureKeyAction(key: string, action: string): void {
  if (SECRET_VALUE_KEYS.has(key)) {
    console.log(`[SecureStorage] ${action} (secret key)`);
    return;
  }
  console.log(`[SecureStorage] ${action} ${key}`);
}

// Lazy-load the plugin so it doesn't break on web where the native layer is absent
async function getPlugin(): Promise<SecureStoragePluginHandle | null> {
  if (!isMobileNativePlatform()) return null;
  try {
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

function readLocalStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

async function readKeychainValue(
  plugin: SecureStoragePluginHandle["plugin"],
  key: string,
): Promise<string | null> {
  try {
    const result = await Promise.race([
      plugin.get({ key }),
      new Promise<{ value: null }>((resolve) =>
        setTimeout(() => resolve({ value: null }), KEYCHAIN_READ_TIMEOUT_MS)
      ),
    ]);
    return result.value;
  } catch {
    return null;
  }
}

async function readExistingKeychainKeys(
  plugin: SecureStoragePluginHandle["plugin"],
): Promise<Set<string>> {
  try {
    const result = await Promise.race([
      plugin.keys(),
      new Promise<{ value: string[] }>((resolve) =>
        setTimeout(() => resolve({ value: [] }), KEYCHAIN_READ_TIMEOUT_MS)
      ),
    ]);
    return new Set(result.value ?? []);
  } catch {
    return new Set();
  }
}

/**
 * Call once before the app renders (in App.tsx).
 * On native: loads Keychain first (authoritative), then mirrors to localStorage.
 * On web: loads from localStorage only.
 */
export async function initSecureStorage(): Promise<void> {
  if (_initDone) return;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    console.log("[SecureStorage] Starting initialization...");

    if (!isMobileNativePlatform()) {
      for (const key of SECURE_KEYS) {
        cache.set(key, readLocalStorage(key));
      }
      _initDone = true;
      console.log("[SecureStorage] Loaded from localStorage (web)");
      return;
    }

    // Native: Keychain is authoritative. localStorage is a fast mirror only.
    const handle = await getPlugin();
    const plugin = handle?.plugin;

    if (plugin) {
      console.log("[SecureStorage] Loading secure keys from Keychain...");
      const existingKeys = await readExistingKeychainKeys(plugin);
      for (const key of SECURE_KEYS) {
        if (existingKeys.has(key)) {
          const keychainValue = await readKeychainValue(plugin, key);
          if (keychainValue !== null) {
            cache.set(key, keychainValue);
            try { localStorage.setItem(key, keychainValue); } catch { /* ignore */ }
            logSecureKeyAction(key, "Loaded from Keychain");
            continue;
          }
        }

        const localValue = readLocalStorage(key);
        cache.set(key, localValue);
        if (localValue !== null) {
          // One-time migration: push legacy localStorage values into Keychain.
          try {
            await plugin.set({ key, value: localValue });
            logSecureKeyAction(key, "Migrated from localStorage → Keychain");
          } catch (e) {
            console.warn(`[SecureStorage] Keychain migration failed for ${key}:`, e);
          }
        }
      }
    } else {
      console.warn("[SecureStorage] Keychain unavailable — falling back to localStorage");
      for (const key of SECURE_KEYS) {
        cache.set(key, readLocalStorage(key));
      }
    }

    _initDone = true;
    console.log("[SecureStorage] Initialization complete");
  })();

  return _initPromise;
}

/** Synchronous read — returns from in-memory cache. Always fast. */
export function secureGet(key: string): string | null {
  return cache.get(key) ?? null;
}

/** Write value — updates cache immediately, persists to localStorage, then Keychain in background. */
export async function secureSet(key: string, value: string): Promise<void> {
  cache.set(key, value);

  try { localStorage.setItem(key, value); } catch { /* ignore */ }

  if (!isMobileNativePlatform()) return;

  getPlugin().then(async (handle) => {
    const plugin = handle?.plugin;
    if (!plugin) return;
    try {
      await plugin.set({ key, value });
      logSecureKeyAction(key, "Saved to Keychain");
    } catch (e) {
      console.warn(`[SecureStorage] Keychain save failed for ${key}:`, e);
    }
  }).catch(() => {});
}

/** Remove value — clears cache immediately, removes from localStorage and Keychain. */
export async function secureRemove(key: string): Promise<void> {
  cache.set(key, null);

  try { localStorage.removeItem(key); } catch { /* ignore */ }

  if (!isMobileNativePlatform()) return;

  getPlugin().then(async (handle) => {
    const plugin = handle?.plugin;
    if (!plugin) return;
    try { await plugin.remove({ key }); } catch { /* non-fatal */ }
  }).catch(() => {});
}

export async function secureClearAuth(): Promise<void> {
  await Promise.all(SECURE_KEYS.map((key) => secureRemove(key)));
  try {
    window.dispatchEvent(new Event("sse:disconnect"));
  } catch { /* non-browser */ }
}

/** True when initSecureStorage() has finished populating the cache. */
export function isSecureStorageReady(): boolean {
  return _initDone;
}
