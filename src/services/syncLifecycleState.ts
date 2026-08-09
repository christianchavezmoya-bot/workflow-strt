/**
 * syncLifecycleState — native app foreground/background gate for upload + download.
 *
 * While paused (background), the sync engine and offline bootstrap must not run.
 * Foreground resume clears pause and triggers reconnectAndFlush via events.
 */

export type SyncLifecycleListener = (paused: boolean) => void;

let paused = false;
const listeners = new Set<SyncLifecycleListener>();

export function isSyncLifecyclePaused(): boolean {
  return paused;
}

export function setSyncLifecyclePaused(value: boolean): void {
  if (paused === value) return;
  paused = value;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sync-lifecycle-paused", { detail: { paused: value } }));
  }
  listeners.forEach((fn) => fn(value));
}

export function subscribeSyncLifecyclePaused(fn: SyncLifecycleListener): () => void {
  listeners.add(fn);
  fn(paused);
  return () => {
    listeners.delete(fn);
  };
}
