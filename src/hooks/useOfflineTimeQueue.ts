/**
 * Offline-resilient time tracking queue.
 *
 * When the device is offline (or the API call fails), actions are stored in
 * localStorage with the exact timestamp they occurred. When connectivity
 * returns, they are replayed in order against the server — so the resulting
 * time entries are accurate regardless of when the sync happens.
 *
 * Usage:
 *   const { pendingCount, syncing, isOnline, queueOrSend } = useOfflineTimeQueue({ runId, onSynced });
 *   const updated = await queueOrSend("StartDowntime", "Waiting for access");
 *   if (updated) syncFromServer(updated);   // online — authoritative data
 *   else         applyOptimistic(action);   // queued — update UI locally
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { assetWorkflowRunService } from "../services/assetWorkflowRunService";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";

export type TrackAction = "StartProductive" | "ResumeProductive" | "StartDowntime" | "StopDowntime" | "StopAll";

interface QueuedAction {
  /** Unique ID for deduplication. */
  id: string;
  runId: string;
  action: TrackAction;
  reason?: string;
  /** The real wall-clock time the user performed the action — sent to the
   *  server as StartedAtUtc so entries are accurate even when replayed later. */
  startedAtUtc: string;
}

const QUEUE_KEY = "commtrac_time_queue_v1";

function readQueue(): QueuedAction[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedAction[];
  } catch { return []; }
}

function writeQueue(q: QueuedAction[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch { /* storage quota — ignore */ }
}

interface Options {
  runId: string | null;
  /** Called with the latest server run after a successful flush. */
  onSynced: (updated: AssetWorkflowRun) => void;
}

export interface OfflineQueueState {
  /** How many actions are waiting to be synced for the current run. */
  pendingCount: number;
  /** True while the queue is being flushed to the server. */
  syncing: boolean;
  /** Current navigator.onLine value (reactive). */
  isOnline: boolean;
  /**
   * Try to send the action now; if offline/failed, queue it.
   * Returns the updated run on success, null if queued.
   */
  queueOrSend: (action: TrackAction, reason?: string) => Promise<AssetWorkflowRun | null>;
  /** Manually trigger a flush (e.g., on focus / visibility change). */
  flush: () => Promise<void>;
}

export function useOfflineTimeQueue({ runId, onSynced }: Options): OfflineQueueState {
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  // Stable refs so callbacks never go stale
  const runIdRef = useRef(runId);
  const onSyncedRef = useRef(onSynced);
  const syncingRef = useRef(false);
  runIdRef.current = runId;
  onSyncedRef.current = onSynced;

  function refreshCount() {
    const count = readQueue().filter((q) => q.runId === runIdRef.current).length;
    setPendingCount(count);
  }

  // Stable flush — uses refs, safe in event listeners and effects
  const flush = useCallback(async (): Promise<void> => {
    const rid = runIdRef.current;
    if (!rid || syncingRef.current) return;

    const mine = readQueue().filter((q) => q.runId === rid);
    if (mine.length === 0) return;

    syncingRef.current = true;
    setSyncing(true);

    let lastUpdated: AssetWorkflowRun | null = null;

    for (const item of mine) {
      try {
        lastUpdated = await assetWorkflowRunService.trackTimeEntry(
          item.runId,
          item.action,
          item.reason,
          item.startedAtUtc,   // <-- replay with the original timestamp
        );
        // Success: drop this item from queue
        writeQueue(readQueue().filter((q) => q.id !== item.id));
        refreshCount();
      } catch {
        // Still offline or server error — stop and retry next time
        break;
      }
    }

    syncingRef.current = false;
    setSyncing(false);
    if (lastUpdated) onSyncedRef.current(lastUpdated);
  }, []); // stable — everything via refs

  // React to online/offline events
  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      void flush();
    }
    function handleOffline() {
      setIsOnline(false);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [flush]);

  // Also flush on page/tab becoming visible (catches phone lock/unlock)
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void flush();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [flush]);

  // Flush when runId becomes available (app resumed with active run)
  useEffect(() => {
    refreshCount();
    if (runId && navigator.onLine) void flush();
  }, [runId, flush]);

  const queueOrSend = useCallback(async (
    action: TrackAction,
    reason?: string,
  ): Promise<AssetWorkflowRun | null> => {
    const rid = runIdRef.current;
    if (!rid) return null;

    const startedAtUtc = new Date().toISOString();

    if (navigator.onLine) {
      try {
        const updated = await assetWorkflowRunService.trackTimeEntry(rid, action, reason, startedAtUtc);
        return updated;
      } catch {
        // Network error despite onLine — fall through to queue
      }
    }

    // Offline path: persist and return null
    const item: QueuedAction = {
      id: crypto.randomUUID(),
      runId: rid,
      action,
      reason,
      startedAtUtc,
    };
    writeQueue([...readQueue(), item]);
    refreshCount();
    return null;
  }, []);

  return { pendingCount, syncing, isOnline, queueOrSend, flush };
}
