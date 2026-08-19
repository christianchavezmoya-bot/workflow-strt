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
  shouldDeferBackgroundSync,
  _resetConnectivityStateForTests,
} from "./connectivityMonitor";

describe("interactive write vs background sync gates", () => {
  beforeEach(() => {
    vi.mocked(isMobileNativePlatform).mockReturnValue(true);
    vi.mocked(isManualOfflineModeActive).mockReturnValue(false);
    vi.mocked(isCircuitOpen).mockReturnValue(false);
    _resetConnectivityStateForTests();
  });

  it("shouldSkipRunMutation matches radio/manual offline only (interactive writes)", () => {
    expect(shouldSkipRunMutation()).toBe(false);
    expect(shouldSkipRunMutation()).toBe(shouldSkipBlockingFetch());
  });

  it("shouldDeferBackgroundSync stays true when circuit is open even if radio is up", () => {
    vi.mocked(isCircuitOpen).mockReturnValue(true);
    expect(shouldSkipBlockingFetch()).toBe(false);
    expect(shouldSkipRunMutation()).toBe(false);
    expect(shouldDeferBackgroundSync()).toBe(true);
  });

  it("true radio-off still skips interactive writes (offline-first queue path)", () => {
    vi.mocked(isManualOfflineModeActive).mockReturnValue(true);
    expect(shouldSkipBlockingFetch()).toBe(true);
    expect(shouldSkipRunMutation()).toBe(true);
    expect(shouldDeferBackgroundSync()).toBe(true);
  });
});
