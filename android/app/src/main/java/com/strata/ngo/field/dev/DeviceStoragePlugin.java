package com.strata.ngo.field.dev;

import android.os.StatFs;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/**
 * Reports total/available capacity of the filesystem N-Go's app data actually lives on, so
 * storageHealth.ts can use real device free space instead of budget-only mode. See
 * src/services/nativePlugins/deviceStorage.ts for the JS side and
 * docs/OFFLINE_STORAGE_MANAGEMENT.md for the design.
 *
 * Measures getFilesDir() — the app's INTERNAL data volume, which is where Capacitor Filesystem's
 * Directory.Data (mediaStore.ts's captured media, configMediaCache.ts's reference media) and the
 * WebView's IndexedDB both land. Deliberately NOT getExternalFilesDir()/removable storage: an SD
 * card's free space says nothing about whether N-Go can still write.
 *
 * Uses StatFs#getTotalBytes()/#getAvailableBytes() (API 18+, well under this project's minSdk 24)
 * rather than the deprecated getBlockCount()*getBlockSize() multiplication, which additionally
 * overflows int on large volumes.
 *
 * Permissions: NONE. Reading stat info for the app's own private data directory requires no
 * runtime permission and no manifest entry on any supported API level — no MANAGE_EXTERNAL_STORAGE,
 * no READ/WRITE_EXTERNAL_STORAGE. The plugin never enumerates files; it returns two longs.
 */
@CapacitorPlugin(name = "DeviceStorage")
public class DeviceStoragePlugin extends Plugin {

    @PluginMethod
    public void getStorageInfo(PluginCall call) {
        try {
            File dataDir = getContext().getFilesDir();
            if (dataDir == null) {
                call.reject("Application files directory is unavailable");
                return;
            }

            StatFs stat = new StatFs(dataDir.getAbsolutePath());
            long totalBytes = stat.getTotalBytes();
            long availableBytes = stat.getAvailableBytes();

            if (totalBytes <= 0) {
                call.reject("Filesystem reported a non-positive total capacity");
                return;
            }

            JSObject result = new JSObject();
            // JSObject.put(String, long) is preserved as a JSON number; the JS side re-validates
            // both figures anyway (isValidNativeStorageInfo in deviceStorageCapability.ts).
            result.put("totalBytes", totalBytes);
            result.put("freeBytes", Math.max(0L, availableBytes));
            call.resolve(result);
        } catch (Exception e) {
            // IllegalArgumentException (path vanished), SecurityException, or anything else — the
            // JS side treats a rejection as "unavailable" and falls back to budget-only health.
            call.reject("Failed to read device storage information: " + e.getMessage(), e);
        }
    }
}
