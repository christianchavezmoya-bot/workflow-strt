/**
 * Native foreground sync session — holds overlay + keep-awake until uploads,
 * downloads, and conflicts are all resolved. Silent stale-foreground prefetch
 * does not start a session.
 */
import { useEffect, useRef } from "react";
import type { BootstrapReason } from "../utils/bootstrapFreshness";
import offlineBootstrapService from "../services/offlineBootstrapService";
import { pendingCount, pendingGetConflicted } from "../services/localDB";
import { isSyncFlushing } from "../utils/syncFlushLock";
import { isMobileNativePlatform } from "../utils/platform";
import { isNativeSyncUiActive } from "../utils/nativeSyncUiState";
import {
  deriveForegroundSyncSessionState,
  dispatchForegroundSyncSessionState,
  isNativeSyncSessionComplete,
  shouldStartForegroundSessionForBootstrap,
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
  };
}

export function useNativeForegroundSyncSession(): void {
  const toast = useAppToast();
  const sessionActiveRef = useRef(false);
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

    const onFlushStart = () => {
      beginSession();
    };

    const onBootstrapStarted = (event: Event) => {
      const detail = (event as CustomEvent<{ reason?: BootstrapReason }>).detail;
      if (!shouldStartForegroundSessionForBootstrap(detail?.reason)) return;
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
            toast.warning(
              "Sync paused when you left the app. Stay on this screen until it finishes.",
              7000,
            );
          } else {
            interruptedRef.current = false;
          }
        });
      }
      void evaluate();
    };

    window.addEventListener("sync-engine:flush-start", onFlushStart);
    window.addEventListener("bootstrap:started", onBootstrapStarted);
    window.addEventListener("sync-engine:flush-complete", onSessionProgress);
    window.addEventListener("sync-engine:syncing", onSessionProgress);
    window.addEventListener("bootstrap:complete", onSessionProgress);
    window.addEventListener("bootstrap:error", onSessionProgress);
    window.addEventListener("app-backgrounded", onBackground);
    window.addEventListener("app-foregrounded", onForeground);

    if (isSyncFlushing()) {
      beginSession();
    }

    return () => {
      cancelled = true;
      stopPolling();
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
