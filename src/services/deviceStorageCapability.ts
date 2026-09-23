/**
 * deviceStorageCapability — reports what this session can learn about DEVICE free/total
 * storage, as distinct from N-Go's own footprint (see offlineStorageService.ts).
 *
 * PHASE 1A FINDING (audit-verified against the installed package, not assumed from memory):
 * @capacitor/device 8.0.3's DeviceInfo has NO disk-space fields. Its full interface (checked
 * directly against node_modules/@capacitor/device/dist/esm/definitions.d.ts) is: name, model,
 * platform, operatingSystem, osVersion, iOSVersion, androidSDKVersion, manufacturer, isVirtual,
 * memUsed (app MEMORY, not disk), webViewVersion. There is no diskFree/diskTotal/realDiskFree/
 * realDiskTotal — that shape existed on an older/different plugin lineage, not this one. Per
 * instruction, this sub-task STOPS here rather than guessing at fields or writing an unreviewed
 * native plugin: @capacitor/device was installed, inspected, and removed again (see PR — net
 * dependency change is zero) because it provides nothing this module could use.
 *
 * Consequence: DEVICE_FREE_UNAVAILABLE is a real, expected, first-class state on native today,
 * not an error path. storageHealth.ts must produce a meaningful result without a free-space
 * figure (see its "budget-only" mode) rather than treating this as a fatal condition.
 *
 * WEB: navigator.storage.estimate() is real and installed-library-typed
 * (lib.dom.d.ts StorageEstimate: `{ quota?: number; usage?: number }`), but it reports the
 * BROWSER ORIGIN'S storage quota/usage — not actual device free disk. It is intentionally
 * labeled DEVICE_QUOTA_ESTIMATE (never "free space") everywhere it surfaces, per instruction.
 */

import { isMobileNativePlatform } from "../utils/platform";

export type DeviceStorageSource =
  /** Real device free/total bytes. Not achievable today — see module doc comment. */
  | "NATIVE_DEVICE_API"
  /** Browser StorageManager.estimate() — an origin quota estimate, not true device free space. */
  | "WEB_QUOTA_ESTIMATE"
  /** No API available on this platform/browser produced a usable number. */
  | "UNAVAILABLE";

export interface DeviceStorageReading {
  source: DeviceStorageSource;
  /** True device free bytes. Only ever set when source === "NATIVE_DEVICE_API" (never today). */
  freeBytes: number | null;
  /** True device total bytes. Only ever set when source === "NATIVE_DEVICE_API" (never today). */
  totalBytes: number | null;
  /** Browser storage-quota bytes (origin-scoped, NOT device free space). WEB_QUOTA_ESTIMATE only. */
  quotaBytes: number | null;
  /** Browser storage-usage bytes already consumed within that quota. WEB_QUOTA_ESTIMATE only. */
  quotaUsageBytes: number | null;
  /** Human-readable reason, set whenever source !== "NATIVE_DEVICE_API"/"WEB_QUOTA_ESTIMATE" cleanly. */
  unavailableReason?: string;
}

const UNAVAILABLE_NATIVE: DeviceStorageReading = {
  source: "UNAVAILABLE",
  freeBytes: null,
  totalBytes: null,
  quotaBytes: null,
  quotaUsageBytes: null,
  unavailableReason:
    "No installed API reports real device free/total storage on this platform " +
    "(see deviceStorageCapability.ts doc comment — @capacitor/device 8.0.3 has no disk fields).",
};

/**
 * Best-effort device storage reading for the current platform. Never throws; a failed or
 * unsupported lookup resolves to source "UNAVAILABLE" with freeBytes/totalBytes both null —
 * storageHealth.ts is required to handle that without treating it as an error.
 */
export async function readDeviceStorage(): Promise<DeviceStorageReading> {
  if (isMobileNativePlatform()) {
    // See module doc comment: no native API in this dependency set provides this today.
    return UNAVAILABLE_NATIVE;
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

  return {
    source: "UNAVAILABLE",
    freeBytes: null,
    totalBytes: null,
    quotaBytes: null,
    quotaUsageBytes: null,
    unavailableReason: "navigator.storage.estimate() is not available in this browser/context.",
  };
}
