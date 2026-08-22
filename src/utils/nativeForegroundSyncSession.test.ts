import { describe, expect, it } from "vitest";
import {
  deriveForegroundSyncSessionState,
  isNativeSyncSessionComplete,
  shouldKeepAwakeDuringSession,
  shouldStartForegroundSessionForBootstrap,
} from "./nativeForegroundSyncSession";

const idle = {
  pendingCount: 0,
  conflictCount: 0,
  readyForOffline: true,
  flushing: false,
  bootstrapping: false,
};

describe("nativeForegroundSyncSession", () => {
  describe("isNativeSyncSessionComplete", () => {
    it("is true when all checks pass", () => {
      expect(isNativeSyncSessionComplete(idle)).toBe(true);
    });

    it("fails when pending uploads remain", () => {
      expect(isNativeSyncSessionComplete({ ...idle, pendingCount: 2 })).toBe(false);
    });

    it("fails when conflicts remain", () => {
      expect(isNativeSyncSessionComplete({ ...idle, conflictCount: 1 })).toBe(false);
    });

    it("fails when bootstrap is not ready for offline", () => {
      expect(isNativeSyncSessionComplete({ ...idle, readyForOffline: false })).toBe(false);
    });

    it("fails while flushing", () => {
      expect(isNativeSyncSessionComplete({ ...idle, flushing: true })).toBe(false);
    });

    it("fails while bootstrapping", () => {
      expect(isNativeSyncSessionComplete({ ...idle, bootstrapping: true })).toBe(false);
    });
  });

  describe("shouldStartForegroundSessionForBootstrap", () => {
    it("starts for user-facing reasons", () => {
      expect(shouldStartForegroundSessionForBootstrap("sync-now")).toBe(true);
      expect(shouldStartForegroundSessionForBootstrap("first-login")).toBe(true);
      expect(shouldStartForegroundSessionForBootstrap("reconnect")).toBe(true);
      expect(shouldStartForegroundSessionForBootstrap("readiness-panel")).toBe(true);
    });

    it("does not start for routine post-flush scheduling", () => {
      expect(shouldStartForegroundSessionForBootstrap("flush-complete")).toBe(false);
    });

    it("does not start for silent background prefetch", () => {
      expect(shouldStartForegroundSessionForBootstrap("stale-foreground")).toBe(false);
      expect(shouldStartForegroundSessionForBootstrap("sse-fallback")).toBe(false);
    });
  });

  describe("shouldKeepAwakeDuringSession", () => {
    it("is off when session is inactive", () => {
      expect(shouldKeepAwakeDuringSession({ ...idle, sessionActive: false })).toBe(false);
    });

    it("stays on while flushing or bootstrapping", () => {
      expect(shouldKeepAwakeDuringSession({ ...idle, sessionActive: true, flushing: true })).toBe(true);
      expect(shouldKeepAwakeDuringSession({ ...idle, sessionActive: true, bootstrapping: true })).toBe(true);
    });

    it("turns off when only conflicts remain (Phase D)", () => {
      expect(shouldKeepAwakeDuringSession({
        ...idle,
        sessionActive: true,
        conflictCount: 2,
        readyForOffline: false,
      })).toBe(false);
    });
  });

  describe("deriveForegroundSyncSessionState", () => {
    it("shows overlay and keep-awake while work is running", () => {
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

    it("keeps overlay but drops keep-awake for conflicts-only hold", () => {
      expect(deriveForegroundSyncSessionState({
        ...idle,
        sessionActive: true,
        conflictCount: 1,
        readyForOffline: true,
      })).toEqual({
        sessionActive: true,
        overlayVisible: true,
        keepAwake: false,
        conflictsOnly: true,
      });
    });

    it("hides overlay when session completes", () => {
      expect(deriveForegroundSyncSessionState({
        ...idle,
        sessionActive: true,
      })).toEqual({
        sessionActive: true,
        overlayVisible: false,
        keepAwake: false,
        conflictsOnly: false,
      });
    });
  });
});
