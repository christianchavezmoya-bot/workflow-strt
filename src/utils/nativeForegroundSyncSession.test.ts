import { describe, expect, it } from "vitest";
import {
  deriveForegroundSyncSessionState,
  isNativeSyncSessionComplete,
  isNativeSyncSessionNetworkIdle,
  shouldKeepAwakeDuringSession,
  shouldStartFocusedSyncSessionForBootstrap,
} from "./nativeForegroundSyncSession";

const idle = {
  pendingCount: 0,
  conflictCount: 0,
  readyForOffline: true,
  flushing: false,
  bootstrapping: false,
  cannotFlush: false,
};

describe("nativeForegroundSyncSession", () => {
  describe("isNativeSyncSessionComplete", () => {
    it("is true when all checks pass online", () => {
      expect(isNativeSyncSessionComplete(idle)).toBe(true);
    });

    it("fails when pending uploads remain while online", () => {
      expect(isNativeSyncSessionComplete({ ...idle, pendingCount: 2 })).toBe(false);
    });

    it("completes when offline with pending queue (release user)", () => {
      expect(isNativeSyncSessionComplete({
        ...idle,
        pendingCount: 1,
        cannotFlush: true,
      })).toBe(true);
    });

    it("does not complete while flushing even if offline", () => {
      expect(isNativeSyncSessionComplete({
        ...idle,
        cannotFlush: true,
        flushing: true,
      })).toBe(false);
    });

    it("fails when conflicts remain while online", () => {
      expect(isNativeSyncSessionComplete({ ...idle, conflictCount: 1 })).toBe(false);
    });

    it("fails when bootstrap is not ready for offline while online", () => {
      expect(isNativeSyncSessionComplete({ ...idle, readyForOffline: false })).toBe(false);
    });
  });

  describe("shouldStartFocusedSyncSessionForBootstrap", () => {
    it("starts for user-initiated reasons only", () => {
      expect(shouldStartFocusedSyncSessionForBootstrap("sync-now")).toBe(true);
      expect(shouldStartFocusedSyncSessionForBootstrap("first-login")).toBe(true);
      expect(shouldStartFocusedSyncSessionForBootstrap("readiness-panel")).toBe(true);
    });

    it("does not start for background reconnect or pull-sync", () => {
      expect(shouldStartFocusedSyncSessionForBootstrap("reconnect")).toBe(false);
      expect(shouldStartFocusedSyncSessionForBootstrap("pull-sync")).toBe(false);
      expect(shouldStartFocusedSyncSessionForBootstrap("flush-complete")).toBe(false);
      expect(shouldStartFocusedSyncSessionForBootstrap("stale-foreground")).toBe(false);
      expect(shouldStartFocusedSyncSessionForBootstrap("sse-fallback")).toBe(false);
    });
  });

  describe("shouldKeepAwakeDuringSession", () => {
    it("is off when session is inactive", () => {
      expect(shouldKeepAwakeDuringSession({ ...idle, sessionActive: false })).toBe(false);
    });

    it("is off when device cannot flush", () => {
      expect(shouldKeepAwakeDuringSession({
        ...idle,
        sessionActive: true,
        pendingCount: 2,
        cannotFlush: true,
      })).toBe(false);
    });

    it("stays on while flushing or bootstrapping online", () => {
      expect(shouldKeepAwakeDuringSession({ ...idle, sessionActive: true, flushing: true })).toBe(true);
      expect(shouldKeepAwakeDuringSession({ ...idle, sessionActive: true, bootstrapping: true })).toBe(true);
    });
  });

  describe("deriveForegroundSyncSessionState", () => {
    it("shows overlay while bootstrap runs online", () => {
      expect(deriveForegroundSyncSessionState({
        ...idle,
        sessionActive: true,
        bootstrapping: true,
        readyForOffline: false,
      })).toEqual({
        sessionActive: true,
        overlayVisible: true,
        keepAwake: true,
        conflictsOnly: false,
      });
    });

    it("hides overlay when offline releases the session", () => {
      expect(deriveForegroundSyncSessionState({
        ...idle,
        sessionActive: true,
        pendingCount: 1,
        cannotFlush: true,
      })).toEqual({
        sessionActive: true,
        overlayVisible: false,
        keepAwake: false,
        conflictsOnly: false,
      });
    });

    it("keeps overlay but drops keep-awake for conflicts-only hold", () => {
      expect(deriveForegroundSyncSessionState({
        ...idle,
        sessionActive: true,
        conflictCount: 1,
      })).toEqual({
        sessionActive: true,
        overlayVisible: true,
        keepAwake: false,
        conflictsOnly: true,
      });
    });
  });

  describe("isNativeSyncSessionNetworkIdle", () => {
    it("is false while flushing or bootstrapping", () => {
      expect(isNativeSyncSessionNetworkIdle({ ...idle, flushing: true })).toBe(false);
      expect(isNativeSyncSessionNetworkIdle({ ...idle, bootstrapping: true })).toBe(false);
    });
  });
});
