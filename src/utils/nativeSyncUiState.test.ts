import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/platform", () => ({
  isMobileNativePlatform: vi.fn(() => true),
}));

import {
  _resetConnectivityStateForTests,
  _setServerReachableForTests,
} from "../services/connectivityMonitor";
import { setManualOfflineModeActive, setOfflineModeActive } from "../services/offlineModeState";
import { setSyncFlushing } from "./syncFlushLock";
import { isNativeSyncUiActive, isNativeSyncUiActiveNow } from "./nativeSyncUiState";

describe("nativeSyncUiState", () => {
  beforeEach(() => {
    _resetConnectivityStateForTests();
    setOfflineModeActive(false);
    setManualOfflineModeActive(false);
    setSyncFlushing(false);
  });

  it("is inactive when syncing flag is false", () => {
    expect(isNativeSyncUiActive(false)).toBe(false);
  });

  it("is active when syncing and server is reachable", () => {
    _setServerReachableForTests(true);
    expect(isNativeSyncUiActive(true)).toBe(true);
  });

  it("is inactive when syncing but sync is deferred (server down)", () => {
    _setServerReachableForTests(false);
    expect(isNativeSyncUiActive(true)).toBe(false);
  });

  it("is active mid-flush even when server later marked unreachable", () => {
    _setServerReachableForTests(false);
    setSyncFlushing(true);
    expect(isNativeSyncUiActiveNow()).toBe(true);
  });
});
