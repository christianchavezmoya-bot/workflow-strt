import type { BootstrapReason } from "./bootstrapFreshness";

/** Bootstrap reasons that should hold the foreground sync overlay + keep-awake. */
export const FOREGROUND_SESSION_REASONS: ReadonlySet<BootstrapReason> = new Set([
  "sync-now",
  "first-login",
  "reconnect",
  "pull-sync",
  "readiness-panel",
]);

export type NativeForegroundSyncSessionInput = {
  pendingCount: number;
  conflictCount: number;
  readyForOffline: boolean;
  flushing: boolean;
  bootstrapping: boolean;
};

export type NativeForegroundSyncSessionState = {
  sessionActive: boolean;
  overlayVisible: boolean;
  keepAwake: boolean;
  conflictsOnly: boolean;
};

export const NATIVE_FOREGROUND_SYNC_SESSION_EVENT = "native-foreground-sync-session:state";

export function shouldStartForegroundSessionForBootstrap(
  reason: BootstrapReason | undefined,
): boolean {
  if (!reason) return false;
  return FOREGROUND_SESSION_REASONS.has(reason);
}

/** Session is complete only when uploads, downloads, and conflicts are all clear. */
export function isNativeSyncSessionComplete(
  input: NativeForegroundSyncSessionInput,
): boolean {
  return (
    input.pendingCount === 0
    && input.conflictCount === 0
    && input.readyForOffline
    && !input.flushing
    && !input.bootstrapping
  );
}

/** Keep screen awake while network work is still running. Conflicts need a person, not a spinner. */
export function shouldKeepAwakeDuringSession(
  input: NativeForegroundSyncSessionInput & { sessionActive: boolean },
): boolean {
  if (!input.sessionActive) return false;
  return input.flushing || input.bootstrapping || input.pendingCount > 0;
}

export function deriveForegroundSyncSessionState(
  input: NativeForegroundSyncSessionInput & { sessionActive: boolean },
): NativeForegroundSyncSessionState {
  const complete = isNativeSyncSessionComplete(input);
  const overlayVisible = input.sessionActive && !complete;
  const keepAwake = shouldKeepAwakeDuringSession(input);
  const conflictsOnly = overlayVisible
    && !input.flushing
    && !input.bootstrapping
    && input.pendingCount === 0
    && input.conflictCount > 0;

  return {
    sessionActive: input.sessionActive,
    overlayVisible,
    keepAwake,
    conflictsOnly,
  };
}

export function dispatchForegroundSyncSessionState(
  state: NativeForegroundSyncSessionState,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NATIVE_FOREGROUND_SYNC_SESSION_EVENT, { detail: state }));
}
