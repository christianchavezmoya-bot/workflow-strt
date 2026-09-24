import { registerPlugin } from "@capacitor/core";

/**
 * Bridge to the local, hand-written DeviceStorage Capacitor plugin — not an npm package, so there
 * is no upstream type definition to import (same situation as localMediaServer.ts).
 *
 * Implementations:
 *   Android — android/app/src/main/java/com/strata/ngo/field/dev/DeviceStoragePlugin.java
 *             (android.os.StatFs over the app's internal files dir)
 *   iOS     — ios/App/App/DeviceStoragePlugin.swift
 *             (Foundation URLResourceValues volume capacity on the app's documents volume)
 *
 * Contract, enforced on the TS side by isValidNativeStorageInfo() below because a native bridge
 * can only ever be trusted as far as it is checked: both figures are BYTES — never a formatted
 * "12.4 GB" string, never a percentage — finite, non-negative, with totalBytes > 0.
 *
 * Privacy: the plugin reports two integers and nothing else. No filenames, no directory contents,
 * no identifiers, no per-app breakdown, and neither platform requires a storage permission for
 * these APIs (see docs/OFFLINE_STORAGE_MANAGEMENT.md).
 */
export interface DeviceStorageInfo {
  /** Total capacity, in bytes, of the filesystem holding N-Go's app data. */
  totalBytes: number;
  /** Capacity still available to N-Go for writes, in bytes. See the iOS note in
   *  DeviceStoragePlugin.swift: on iOS this is the "important usage" figure, which includes
   *  purgeable space and is deliberately the better operational estimate of what N-Go can write. */
  freeBytes: number;
}

export interface DeviceStoragePlugin {
  getStorageInfo(): Promise<DeviceStorageInfo>;
}

export const DeviceStorage = registerPlugin<DeviceStoragePlugin>("DeviceStorage");

export default DeviceStorage;
