/**
 * deviceStorageCapability — reports what this session can learn about DEVICE free/total
 * storage, as distinct from N-Go's own footprint (see offlineStorageService.ts).
 *
 * NATIVE (Android + iOS): a repo-owned Capacitor plugin, "DeviceStorage", reports real total/free
 * bytes for the filesystem N-Go's app data lives on — see src/services/nativePlugins/deviceStorage.ts
 * for the bridge and the two native implementations it points at. This replaces the Phase 1A state
 * where no installed API could answer the question at all (@capacitor/device 8.0.3 has no disk
 * fields — it was installed, inspected against its own shipped type definitions, found to expose
 * only memUsed/app memory, and removed again; net dependency change zero). No third-party plugin
 * was added for this: the bridge is ~60 lines of platform code in this repo, using
 * android.os.StatFs and Foundation's volume-capacity resource values.
 *
 * Native failure is still a real, first-class state, NOT an error path: an old build without the
 * plugin, an unsupported platform, a bridge exception, or a malformed response all resolve to
 * UNAVAILABLE with both figures null, and storageHealth.ts continues in its budget-only mode.
 * The Offline Storage screen must never break because a device could not answer.
 *
 * WEB: navigator.storage.estimate() is real and installed-library-typed
 * (lib.dom.d.ts StorageEstimate: `{ quota?: number; usage?: number }`), but it reports the
 * BROWSER ORIGIN'S storage quota/usage — not actual device free disk. It is intentionally
 * labeled WEB_QUOTA_ESTIMATE (never "free space") everywhere it surfaces, per instruction, and
 * that behavior is unchanged by the native work above.
 */

import { isMobileNativePlatform } from "../utils/platform";
import { DeviceStorage, type DeviceStorageInfo } from "./nativePlugins/deviceStorage";

export type DeviceStorageSource =
  /** Real device free/total bytes from the repo-owned DeviceStorage plugin (Android/iOS). */
  | "NATIVE_DEVICE_API"
  /** Browser StorageManager.estimate() — an origin quota estimate, not true device free space. */
  | "WEB_QUOTA_ESTIMATE"
  /** No API available on this platform/browser produced a usable number. */
  | "UNAVAILABLE";

export interface DeviceStorageReading {
  source: DeviceStorageSource;
  /** True device free bytes. Only ever set when source === "NATIVE_DEVICE_API". */
  freeBytes: number | null;
  /** True device total bytes. Only ever set when source === "NATIVE_DEVICE_API". */
  totalBytes: number | null;
  /** Browser storage-quota bytes (origin-scoped, NOT device free space). WEB_QUOTA_ESTIMATE only. */
  quotaBytes: number | null;
  /** Browser storage-usage bytes already consumed within that quota. WEB_QUOTA_ESTIMATE only. */
  quotaUsageBytes: number | null;
  /** Human-readable reason, set whenever source !== "NATIVE_DEVICE_API"/"WEB_QUOTA_ESTIMATE" cleanly. */
  unavailableReason?: string;
}

function unavailable(reason: string): DeviceStorageReading {
  return {
    source: "UNAVAILABLE",
    freeBytes: null,
    totalBytes: null,
    quotaBytes: null,
    quotaUsageBytes: null,
    unavailableReason: reason,
  };
}

/**
 * Pure validator for whatever the native bridge hands back. A native bridge is an untyped JSON
 * boundary: TypeScript's `Promise<DeviceStorageInfo>` is a claim, not a guarantee, so every field
 * is re-checked here rather than trusted. Rejects NaN, Infinity, negatives, non-numbers, a
 * non-positive total, and a null/non-object response.
 *
 * NOTE on freeBytes > totalBytes: this is NOT rejected and NOT clamped, and that is deliberate.
 * On iOS the available figure is `volumeAvailableCapacityForImportantUsage`, which includes space
 * the system can reclaim by purging caches — Apple's documented answer to "can I write this?" —
 * so it can legitimately exceed a naive free-space reading. It is still bounded by the volume, so
 * exceeding TOTAL capacity would indicate a genuinely malformed reading rather than purgeable
 * semantics; it is passed through unchanged so it stays visible instead of being silently
 * normalized into a healthy-looking number. computeStorageHealth() tolerates a ratio above 1
 * (it only ever compares against "<= threshold" rules, so a too-large free figure can never
 * manufacture a false CRITICAL).
 */
export function isValidNativeStorageInfo(value: unknown): value is DeviceStorageInfo {
  if (typeof value !== "object" || value === null) return false;
  const { totalBytes, freeBytes } = value as Record<string, unknown>;
  if (typeof totalBytes !== "number" || typeof freeBytes !== "number") return false;
  if (!Number.isFinite(totalBytes) || !Number.isFinite(freeBytes)) return false;
  if (totalBytes <= 0 || freeBytes < 0) return false;
  return true;
}

/**
 * Best-effort device storage reading for the current platform. Never throws; a failed or
 * unsupported lookup resolves to source "UNAVAILABLE" with freeBytes/totalBytes both null —
 * storageHealth.ts is required to handle that without treating it as an error.
 */
export async function readDeviceStorage(): Promise<DeviceStorageReading> {
  if (isMobileNativePlatform()) {
    try {
      const info = await DeviceStorage.getStorageInfo();
      if (!isValidNativeStorageInfo(info)) {
        return unavailable(
          "The DeviceStorage plugin returned a malformed storage reading (expected finite, " +
            "non-negative totalBytes/freeBytes in bytes).",
        );
      }
      return {
        source: "NATIVE_DEVICE_API",
        freeBytes: info.freeBytes,
        totalBytes: info.totalBytes,
        quotaBytes: null,
        quotaUsageBytes: null,
      };
    } catch {
      // Plugin not present in this build, method unimplemented on this platform, or a native
      // exception. All are non-fatal: fall back to budget-only health.
      return unavailable(
        "The DeviceStorage native plugin is unavailable or failed on this device; " +
          "storage health falls back to budget-only mode.",
      );
    }
  }

  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      if (typeof estimate.quota === "number" || typeof estimate.usage === "number") {
        return {
          source: "WEB_QUOTA_ESTIMATE",
          freeBytes: null,
          totalBytes: null,
          quotaBytes: typeof estimate.quota === "number" ? estimate.quota : null,
          quotaUsageBytes: typeof estimate.usage === "number" ? estimate.usage : null,
        };
      }
    } catch {
      // Fall through to UNAVAILABLE — some browsers reject in restricted/private contexts.
    }
  }

  return unavailable("navigator.storage.estimate() is not available in this browser/context.");
}
