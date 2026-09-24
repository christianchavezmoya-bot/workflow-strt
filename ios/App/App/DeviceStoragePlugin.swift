import Foundation
import Capacitor

/// Reports total/available capacity of the volume N-Go's app data lives on, so storageHealth.ts
/// can use real device free space instead of budget-only mode. See
/// src/services/nativePlugins/deviceStorage.ts for the JS side and
/// docs/OFFLINE_STORAGE_MANAGEMENT.md for the design.
///
/// Measures the volume containing the app's documents directory. Every directory inside an iOS
/// app container (Documents, Library, tmp — so both Capacitor Filesystem's Directory.Data and the
/// WebView's IndexedDB) sits on the same data volume, so one lookup covers all of N-Go's writes.
///
/// AVAILABLE capacity uses `volumeAvailableCapacityForImportantUsage` (iOS 11+), not raw
/// `volumeAvailableCapacity`. That is deliberate and is the API Apple documents for exactly this
/// question — "can I store something the user asked for?" — because it accounts for space the
/// system can reclaim by purging caches/offloadable content. It is therefore usually LARGER than
/// raw free bytes and is a better operational estimate of what N-Go can still write than a raw
/// figure that would report a device as full while iOS is still holding purgeable data. If that
/// key is unavailable the code falls back to plain `volumeAvailableCapacity`, then rejects.
///
/// Privacy: returns two integers. No iCloud query, no file enumeration, no identifiers, and no
/// permission prompt — volume capacity for the app's own container requires no entitlement.
@objc(DeviceStoragePlugin)
public class DeviceStoragePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DeviceStoragePlugin"
    public let jsName = "DeviceStorage"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStorageInfo", returnType: CAPPluginReturnPromise)
    ]

    @objc func getStorageInfo(_ call: CAPPluginCall) {
        guard let containerURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            call.reject("Application documents directory is unavailable")
            return
        }

        do {
            let values = try containerURL.resourceValues(forKeys: [
                .volumeTotalCapacityKey,
                .volumeAvailableCapacityForImportantUsageKey,
                .volumeAvailableCapacityKey
            ])

            guard let totalCapacity = values.volumeTotalCapacity, totalCapacity > 0 else {
                call.reject("Volume reported no usable total capacity")
                return
            }

            // Prefer "important usage" (Int64); fall back to plain available capacity (Int).
            let availableBytes: Int64
            if let importantUsage = values.volumeAvailableCapacityForImportantUsage {
                availableBytes = importantUsage
            } else if let plainAvailable = values.volumeAvailableCapacity {
                availableBytes = Int64(plainAvailable)
            } else {
                call.reject("Volume reported no available-capacity value")
                return
            }

            call.resolve([
                "totalBytes": Int64(totalCapacity),
                "freeBytes": max(0, availableBytes)
            ])
        } catch {
            // The JS side treats a rejection as "unavailable" and falls back to budget-only health.
            call.reject("Failed to read device storage information: \(error.localizedDescription)")
        }
    }
}
