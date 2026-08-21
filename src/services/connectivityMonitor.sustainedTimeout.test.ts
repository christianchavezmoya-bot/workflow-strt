import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/app", () => ({
  App: { addListener: vi.fn(async () => ({ remove: vi.fn() })) },
}));

vi.mock("@capacitor/network", () => ({
  Network: {
    getStatus: vi.fn(async () => ({ connected: true, connectionType: "wifi" })),
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
  },
}));

vi.mock("../utils/platform", () => ({
  isMobileNativePlatform: vi.fn(() => true),
}));

vi.mock("./networkService", () => ({
  isServerReachable: vi.fn(async () => true),
}));

vi.mock("./offlineModeState", () => ({
  isManualOfflineModeActive: vi.fn(() => false),
}));

vi.mock("./apiReachabilitySignals", () => ({
  hadRecentApiSuccess: vi.fn(() => false),
}));

vi.mock("../utils/syncConnectivityGuard", () => ({
  shouldSuppressUnreachableOffline: vi.fn(() => false),
}));

vi.mock("../utils/circuitBreaker", () => ({
  isCircuitOpen: vi.fn(() => false),
  resetCircuitBreaker: vi.fn(),
  tripCircuitBreaker: vi.fn(),
}));

import { hadRecentApiSuccess } from "./apiReachabilitySignals";
import { tripCircuitBreaker } from "../utils/circuitBreaker";
import {
  _resetConnectivityMonitorForTests,
  getServerReachable,
  startConnectivityMonitor,
} from "./connectivityMonitor";

function dispatchTimeoutBurst(count: number): void {
  for (let i = 0; i < count; i += 1) {
    window.dispatchEvent(new CustomEvent("api-server-unreachable", { detail: { isTimeout: true } }));
  }
}

describe("sustained timeout offline ceiling", () => {
  beforeEach(async () => {
    _resetConnectivityMonitorForTests();
    vi.mocked(hadRecentApiSuccess).mockReturnValue(false);
    startConnectivityMonitor();
    await vi.waitFor(() => expect(getServerReachable()).toBe(true));
  });

  afterEach(() => {
    _resetConnectivityMonitorForTests();
  });

  it("suppresses amber offline for a few timeout signals while radio is up", () => {
    dispatchTimeoutBurst(2);
    expect(getServerReachable()).toBe(true);
    expect(tripCircuitBreaker).toHaveBeenCalled();
  });

  it("flips offline after sustained timeout signals with no recent success", () => {
    dispatchTimeoutBurst(5);
    expect(getServerReachable()).toBe(false);
  });

  it("resets sustained timeout counter when a request succeeds", () => {
    dispatchTimeoutBurst(4);
    window.dispatchEvent(new Event("api-server-reachable"));
    dispatchTimeoutBurst(4);
    expect(getServerReachable()).toBe(true);
  });
});
