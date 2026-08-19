import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/platform", () => ({
  isMobileNativePlatform: vi.fn(() => true),
}));

vi.mock("./offlineModeState", () => ({
  isManualOfflineModeActive: vi.fn(() => false),
}));

vi.mock("../utils/circuitBreaker", () => ({
  isCircuitOpen: vi.fn(() => false),
  resetCircuitBreaker: vi.fn(),
  tripCircuitBreaker: vi.fn(),
}));

vi.mock("./apiReachabilitySignals", () => ({
  hadRecentApiSuccess: vi.fn(() => true),
}));

vi.mock("../utils/syncConnectivityGuard", () => ({
  shouldSuppressUnreachableOffline: vi.fn(() => false),
}));

import { isMobileNativePlatform } from "../utils/platform";
import { isManualOfflineModeActive } from "./offlineModeState";
import { isCircuitOpen } from "../utils/circuitBreaker";
import {
  shouldSkipBlockingFetch,
  shouldSkipRunMutation,
  shouldSkipInteractiveWrite,
  shouldDeferBackgroundSync,
  _resetConnectivityStateForTests,
  _setServerReachableForTests,
} from "./connectivityMonitor";

describe("interactive write vs background sync gates", () => {
  beforeEach(() => {
    vi.mocked(isMobileNativePlatform).mockReturnValue(true);
    vi.mocked(isManualOfflineModeActive).mockReturnValue(false);
    vi.mocked(isCircuitOpen).mockReturnValue(false);
    _resetConnectivityStateForTests();
  });

  it("does not skip when radio is up and reachability is unknown (fail open)", () => {
    _setServerReachableForTests(null);
    expect(shouldSkipInteractiveWrite()).toBe(false);
    expect(shouldSkipRunMutation()).toBe(false);
  });

  it("does not skip when server is confirmed reachable (#246 online path)", () => {
    _setServerReachableForTests(true);
    expect(shouldSkipInteractiveWrite()).toBe(false);
    expect(shouldSkipRunMutation()).toBe(false);
  });

  it("skips when server is confirmed unreachable (amber banner offline)", () => {
    _setServerReachableForTests(false);
    expect(shouldSkipBlockingFetch()).toBe(false);
    expect(shouldSkipInteractiveWrite()).toBe(true);
    expect(shouldSkipRunMutation()).toBe(true);
    expect(shouldDeferBackgroundSync()).toBe(true);
  });

  it("skips when circuit is open even if radio is up", () => {
    vi.mocked(isCircuitOpen).mockReturnValue(true);
    _setServerReachableForTests(null);
    expect(shouldSkipBlockingFetch()).toBe(false);
    expect(shouldSkipInteractiveWrite()).toBe(true);
    expect(shouldDeferBackgroundSync()).toBe(true);
  });

  it("true radio-off still skips interactive writes (offline-first queue path)", () => {
    vi.mocked(isManualOfflineModeActive).mockReturnValue(true);
    expect(shouldSkipBlockingFetch()).toBe(true);
    expect(shouldSkipInteractiveWrite()).toBe(true);
    expect(shouldSkipRunMutation()).toBe(true);
    expect(shouldDeferBackgroundSync()).toBe(true);
  });

  it("shouldSkipRunMutation stays aligned with shouldSkipInteractiveWrite", () => {
    expect(shouldSkipRunMutation()).toBe(shouldSkipInteractiveWrite());
    _setServerReachableForTests(false);
    expect(shouldSkipRunMutation()).toBe(shouldSkipInteractiveWrite());
    vi.mocked(isCircuitOpen).mockReturnValue(true);
    expect(shouldSkipRunMutation()).toBe(shouldSkipInteractiveWrite());
  });
});
