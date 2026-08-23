import type { BootstrapReason } from "./bootstrapFreshness";

/** User-initiated sync — full overlay + keep-awake until network work finishes. */
export const FOCUSED_SYNC_SESSION_REASONS: ReadonlySet<BootstrapReason> = new Set([
  "sync-now",
  "first-login",
  "readiness-panel",
]);

/** @deprecated Use FOCUSED_SYNC_SESSION_REASONS — reconnect/pull-sync are background-only. */
export const FOREGROUND_SESSION_REASONS = FOCUSED_SYNC_SESSION_REASONS;

/** Dispatched when the user (or first-login) requests a focused foreground sync. */
export const NATIVE_SYNC_FOCUSED_REQUESTED_EVENT = "native-sync-focused-requested";

export type NativeForegroundSyncSessionInput = {
  pendingCount: number;
  conflictCount: number;
  readyForOffline: boolean;
  flushing: boolean;
  bootstrapping: boolean;
  /** True when the device cannot reach the server (offline / unreachable). */
  cannotFlush: boolean;
};

export type NativeForegroundSyncSessionMode = "focused" | "upload";

export type NativeForegroundSyncSessionState = {
  sessionActive: boolean;
  overlayVisible: boolean;
  keepAwake: boolean;
  conflictsOnly: boolean;
};

export const NATIVE_FOREGROUND_SYNC_SESSION_EVENT = "native-foreground-sync-session:state";

export function shouldStartFocusedSyncSessionForBootstrap(
  reason: BootstrapReason | undefined,
): boolean {
  if (!reason) return false;
  return FOCUSED_SYNC_SESSION_REASONS.has(reason);
}

/** @deprecated */
export const shouldStartForegroundSessionForBootstrap = shouldStartFocusedSyncSessionForBootstrap;

export function isNativeSyncSessionNetworkIdle(input: NativeForegroundSyncSessionInput): boolean {
  return !input.flushing && !input.bootstrapping;
}

/**
 * Session is complete when network work is idle AND either:
 * - queue/bootstrap/conflicts are clear (online success path), or
 * - the device cannot sync right now (release the user; queue waits for reconnect).
 */
export function isNativeSyncSessionComplete(
  input: NativeForegroundSyncSessionInput,
): boolean {
  if (!isNativeSyncSessionNetworkIdle(input)) return false;

  if (input.cannotFlush) {
    return true;
  }

  return (
    input.pendingCount === 0
    && input.conflictCount === 0
    && input.readyForOffline
  );
}

/** Upload-only session (reconnect flush) — logo while queue drains; no bootstrap hold. */
export function isUploadSyncSessionComplete(
  input: NativeForegroundSyncSessionInput,
): boolean {
  if (input.flushing) return false;
  if (input.cannotFlush) return true;
  return input.pendingCount === 0 && input.conflictCount === 0;
}

/** Keep screen awake while network work is still running. Conflicts need a person, not a spinner. */
export function shouldKeepAwakeDuringSession(
  input: NativeForegroundSyncSessionInput & { sessionActive: boolean },
): boolean {
  if (!input.sessionActive) return false;
  if (input.cannotFlush) return false;
  return input.flushing || input.bootstrapping || input.pendingCount > 0;
}

export function deriveForegroundSyncSessionState(
  input: NativeForegroundSyncSessionInput & {
    sessionActive: boolean;
    sessionMode?: NativeForegroundSyncSessionMode | null;
  },
): NativeForegroundSyncSessionState {
  const mode = input.sessionMode ?? "focused";
  const complete = mode === "upload"
    ? isUploadSyncSessionComplete(input)
    : isNativeSyncSessionComplete(input);

  let overlayVisible = input.sessionActive && !complete;
  let keepAwake = shouldKeepAwakeDuringSession(input);

  if (mode === "upload") {
    if (input.cannotFlush) {
      overlayVisible = false;
      keepAwake = false;
    } else if (input.flushing) {
      overlayVisible = input.sessionActive;
      keepAwake = input.sessionActive;
    } else if (input.pendingCount === 0 && input.conflictCount > 0) {
      overlayVisible = input.sessionActive;
      keepAwake = false;
    } else {
      overlayVisible = false;
      keepAwake = false;
    }
  }

  const conflictsOnly = overlayVisible
    && !input.cannotFlush
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

export function dispatchNativeSyncFocusedRequested(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NATIVE_SYNC_FOCUSED_REQUESTED_EVENT));
}
