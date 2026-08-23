/**
 * Native focused sync session — overlay + keep-awake for user-initiated sync only.
 * Background reconnect/pull-sync use banners only. Session ends when offline even
 * if the queue still has pending items (WhatsApp-style "waiting to send").
 */
import { useEffect, useRef } from "react";
import type { BootstrapReason } from "../utils/bootstrapFreshness";
import offlineBootstrapService from "../services/offlineBootstrapService";
import { pendingCount, pendingGetConflicted } from "../services/localDB";
import { shouldDeferBackgroundSync } from "../services/connectivityMonitor";
import { isSyncFlushing } from "../utils/syncFlushLock";
import { isMobileNativePlatform } from "../utils/platform";
import { isNativeSyncUiActive } from "../utils/nativeSyncUiState";
import {
  deriveForegroundSyncSessionState,
  dispatchForegroundSyncSessionState,
  isNativeSyncSessionComplete,
  NATIVE_SYNC_FOCUSED_REQUESTED_EVENT,
  shouldStartFocusedSyncSessionForBootstrap,
  type NativeForegroundSyncSessionState,
} from "../utils/nativeForegroundSyncSession";
import { useAppToast } from "../contexts/AppToastContext";

const POLL_MS = 500;

async function readSessionInputs() {
  const [pending, conflicted, bootstrapStatus] = await Promise.all([
    pendingCount(),
    pendingGetConflicted(),
    offlineBootstrapService.getStatus(),
  ]);

  return {
    pendingCount: pending,
    conflictCount: conflicted.length,
    readyForOffline: bootstrapStatus.readyForOffline,
    flushing: isSyncFlushing(),
    bootstrapping: bootstrapStatus.isRunning,
    cannotFlush: shouldDeferBackgroundSync(),
  };
}

export function useNativeForegroundSyncSession(): void {
  const toast = useAppToast();
  const sessionActiveRef = useRef(false);
  const focusedRequestedRef = useRef(false);
  const interruptedRef = useRef(false);
  const pollTimerRef = useRef<number | null>(null);
  const lastStateRef = useRef<NativeForegroundSyncSessionState | null>(null);

  useEffect(() => {
    if (!isMobileNativePlatform()) return;

    let cancelled = false;

    const publish = (state: NativeForegroundSyncSessionState) => {
      const prev = lastStateRef.current;
      if (
        prev
        && prev.sessionActive === state.sessionActive
        && prev.overlayVisible === state.overlayVisible
        && prev.keepAwake === state.keepAwake
        && prev.conflictsOnly === state.conflictsOnly
      ) {
        return;
      }
      lastStateRef.current = state;
      dispatchForegroundSyncSessionState(state);
    };

    const stopPolling = () => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    const startPolling = () => {
      if (pollTimerRef.current !== null) return;
      pollTimerRef.current = window.setInterval(() => {
        void evaluate();
      }, POLL_MS);
    };

    const endSession = () => {
      sessionActiveRef.current = false;
      focusedRequestedRef.current = false;
      interruptedRef.current = false;
      stopPolling();
      publish({
        sessionActive: false,
        overlayVisible: false,
        keepAwake: false,
        conflictsOnly: false,
      });
    };

    const evaluate = async () => {
      if (cancelled) return;

      const inputs = await readSessionInputs();
      if (cancelled) return;

      if (!sessionActiveRef.current) {
        publish({
          sessionActive: false,
          overlayVisible: false,
          keepAwake: false,
          conflictsOnly: false,
        });
        return;
      }

      if (isNativeSyncSessionComplete(inputs)) {
        endSession();
        return;
      }

      const derived = deriveForegroundSyncSessionState({
        ...inputs,
        sessionActive: true,
      });

      const overlayAllowed = !derived.overlayVisible
        || isNativeSyncUiActive(true, { midFlush: inputs.flushing });

      publish({
        ...derived,
        overlayVisible: derived.overlayVisible && overlayAllowed,
        keepAwake: derived.keepAwake && overlayAllowed,
      });
    };

    const beginSession = () => {
      if (sessionActiveRef.current) {
        void evaluate();
        return;
      }
      sessionActiveRef.current = true;
      startPolling();
      void evaluate();
    };

    const onFocusedRequested = () => {
      focusedRequestedRef.current = true;
      beginSession();
    };

    const onFlushStart = () => {
      if (!focusedRequestedRef.current && !sessionActiveRef.current) return;
      beginSession();
    };

    const onBootstrapStarted = (event: Event) => {
      const detail = (event as CustomEvent<{ reason?: BootstrapReason }>).detail;
      if (!shouldStartFocusedSyncSessionForBootstrap(detail?.reason)) return;
      focusedRequestedRef.current = true;
      beginSession();
    };

    const onSessionProgress = () => {
      if (sessionActiveRef.current) void evaluate();
    };

    const onBackground = () => {
      if (!sessionActiveRef.current) return;
      void readSessionInputs().then((inputs) => {
        if (!isNativeSyncSessionComplete(inputs)) {
          interruptedRef.current = true;
        }
      });
    };

    const onForeground = () => {
      if (!sessionActiveRef.current) return;
      if (interruptedRef.current) {
        void readSessionInputs().then((inputs) => {
          if (!isNativeSyncSessionComplete(inputs)) {
            toast.info(
              "Sync paused when you left the app. Pending items will upload when you're back online.",
              7000,
            );
          } else {
            interruptedRef.current = false;
          }
        });
      }
      void evaluate();
    };

    window.addEventListener(NATIVE_SYNC_FOCUSED_REQUESTED_EVENT, onFocusedRequested);
    window.addEventListener("sync-engine:flush-start", onFlushStart);
    window.addEventListener("bootstrap:started", onBootstrapStarted);
    window.addEventListener("sync-engine:flush-complete", onSessionProgress);
    window.addEventListener("sync-engine:syncing", onSessionProgress);
    window.addEventListener("bootstrap:complete", onSessionProgress);
    window.addEventListener("bootstrap:error", onSessionProgress);
    window.addEventListener("app-backgrounded", onBackground);
    window.addEventListener("app-foregrounded", onForeground);

    return () => {
      cancelled = true;
      stopPolling();
      window.removeEventListener(NATIVE_SYNC_FOCUSED_REQUESTED_EVENT, onFocusedRequested);
      window.removeEventListener("sync-engine:flush-start", onFlushStart);
      window.removeEventListener("bootstrap:started", onBootstrapStarted);
      window.removeEventListener("sync-engine:flush-complete", onSessionProgress);
      window.removeEventListener("sync-engine:syncing", onSessionProgress);
      window.removeEventListener("bootstrap:complete", onSessionProgress);
      window.removeEventListener("bootstrap:error", onSessionProgress);
      window.removeEventListener("app-backgrounded", onBackground);
      window.removeEventListener("app-foregrounded", onForeground);
      if (sessionActiveRef.current) {
        publish({
          sessionActive: false,
          overlayVisible: false,
          keepAwake: false,
          conflictsOnly: false,
        });
      }
    };
  }, [toast]);
}

export default useNativeForegroundSyncSession;
