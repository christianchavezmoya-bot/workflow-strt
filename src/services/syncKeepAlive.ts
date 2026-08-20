import { Capacitor, registerPlugin } from "@capacitor/core";
import { KeepAwake } from "@capacitor-community/keep-awake";
import { isMobileNativePlatform } from "../utils/platform";

interface SyncKeepAlivePlugin {
  start(): Promise<void>;
  stop(): Promise<void>;
}

const NativeSyncKeepAlive = registerPlugin<SyncKeepAlivePlugin>("SyncKeepAlive");

let keepAliveDepth = 0;

/** Prevent screen sleep (iOS idle timer + Android window flag) and start Android foreground service. */
export async function startSyncKeepAlive(): Promise<void> {
  if (!isMobileNativePlatform()) return;
  keepAliveDepth += 1;
  if (keepAliveDepth > 1) return;

  try {
    await KeepAwake.keepAwake();
  } catch {
    // Non-fatal — sync can still proceed in foreground.
  }

  if (Capacitor.getPlatform() === "android") {
    try {
      await NativeSyncKeepAlive.start();
    } catch {
      // Foreground service unavailable on this build — keep-awake may still help.
    }
  }
}

/** Release keep-awake and stop Android foreground service after sync completes. */
export async function stopSyncKeepAlive(): Promise<void> {
  if (!isMobileNativePlatform()) return;
  if (keepAliveDepth <= 0) return;
  keepAliveDepth -= 1;
  if (keepAliveDepth > 0) return;

  try {
    await KeepAwake.allowSleep();
  } catch {
    // ignore
  }

  if (Capacitor.getPlatform() === "android") {
    try {
      await NativeSyncKeepAlive.stop();
    } catch {
      // ignore
    }
  }
}

/** Test helper — reset nested keep-alive depth. */
export function resetSyncKeepAliveDepthForTests(): void {
  keepAliveDepth = 0;
}
