/**
 * Offline-resilient time tracking for the workflow runner.
 *
 * Delegates to assetWorkflowRunService.trackTimeEntry, which applies optimistic
 * local run updates and enqueues TIME_ENTRY ops in the unified syncQueue
 * (IndexedDB). Pending count reflects syncQueue entries for the active run.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { assetWorkflowRunService } from "../services/assetWorkflowRunService";
import syncQueue from "../services/syncQueue";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";

export type TrackAction = "StartProductive" | "ResumeProductive" | "StartDowntime" | "StopDowntime" | "StopAll";

const LEGACY_QUEUE_KEY = "commtrac_time_queue_v1";

interface Options {
  runId: string | null;
  /** Called with the latest run after a successful server sync (optional). */
  onSynced?: (updated: AssetWorkflowRun) => void;
}

export interface OfflineQueueState {
  pendingCount: number;
  syncing: boolean;
  isOnline: boolean;
  queueOrSend: (action: TrackAction, reason?: string) => Promise<AssetWorkflowRun | null>;
  /** Request a global sync flush (e.g. before RUN_COMPLETE). */
  flush: () => Promise<void>;
}

async function countPendingTimeEntries(runId: string): Promise<number> {
  const ops = await syncQueue.listByEntityId(runId);
  return ops.filter(
    (op) => op.opType === "TIME_ENTRY" && (op.status === "pending" || op.status === "failed"),
  ).length;
}

export function useOfflineTimeQueue({ runId, onSynced }: Options): OfflineQueueState {
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  const runIdRef = useRef(runId);
  const onSyncedRef = useRef(onSynced);
  runIdRef.current = runId;
  onSyncedRef.current = onSynced;

  const refreshCount = useCallback(async () => {
    const rid = runIdRef.current;
    if (!rid) {
      setPendingCount(0);
      return;
    }
    setPendingCount(await countPendingTimeEntries(rid));
  }, []);

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_QUEUE_KEY);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void refreshCount();
    const handler = () => void refreshCount();
    window.addEventListener("sync-pending-changed", handler);
    return () => window.removeEventListener("sync-pending-changed", handler);
  }, [runId, refreshCount]);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
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
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    window.dispatchEvent(new Event("sync-request-flush"));
  }, []);

  const queueOrSend = useCallback(async (
    action: TrackAction,
    reason?: string,
  ): Promise<AssetWorkflowRun | null> => {
    const rid = runIdRef.current;
    if (!rid) return null;

    const startedAtUtc = new Date().toISOString();
    try {
      const updated = await assetWorkflowRunService.trackTimeEntry(
        rid,
        action,
        reason,
        startedAtUtc,
      );
      void refreshCount();
      return updated;
    } catch {
      return null;
    }
  }, [refreshCount]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ run?: AssetWorkflowRun }>).detail;
      if (detail?.run && detail.run.id === runIdRef.current) {
        onSyncedRef.current?.(detail.run);
      }
    };
    window.addEventListener("workflow-run-synced", handler);
    return () => window.removeEventListener("workflow-run-synced", handler);
  }, []);

  return { pendingCount, syncing, isOnline, queueOrSend, flush };
}
