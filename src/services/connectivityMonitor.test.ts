import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/platform", () => ({
  isMobileNativePlatform: vi.fn(() => true),
}));

vi.mock("./networkService", () => ({
  isServerReachable: vi.fn(async () => true),
}));

vi.mock("@capacitor/app", () => ({
  App: { addListener: vi.fn(async () => ({ remove: vi.fn() })) },
}));

vi.mock("@capacitor/network", () => ({
  Network: {
    getStatus: vi.fn(async () => ({ connected: true })),
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
  },
}));

import { isServerReachable } from "./networkService";
import {
  _resetConnectivityStateForTests,
  getServerReachable,
  prepareForegroundConnectivityResume,
  startConnectivityMonitor,
} from "./connectivityMonitor";
import { _resetApiReachabilitySignalsForTests, markApiRequestSuccess } from "./apiReachabilitySignals";
import { isCircuitOpen } from "../utils/circuitBreaker";

function dispatchUnreachable(isTimeout = false): void {
  window.dispatchEvent(new CustomEvent("api-server-unreachable", { detail: { isTimeout } }));
}

describe("connectivityMonitor false-offline guards", () => {
  beforeAll(() => {
    startConnectivityMonitor();
  });

  beforeEach(() => {
    _resetConnectivityStateForTests();
    _resetApiReachabilitySignalsForTests();
    vi.mocked(isServerReachable).mockResolvedValue(true);
  });

  it("does not mark server unreachable on GET timeouts while radio is up", () => {
    dispatchUnreachable(true);
    dispatchUnreachable(true);
    expect(isCircuitOpen()).toBe(true);
    expect(getServerReachable()).not.toBe(false);
  });

  it("marks server unreachable on non-timeout failures", () => {
    dispatchUnreachable(false);
    dispatchUnreachable(false);
    expect(getServerReachable()).toBe(false);
  });

  it("clears stale offline UI state on foreground resume without leaving subscribers stuck", () => {
    dispatchUnreachable(false);
    dispatchUnreachable(false);
    expect(getServerReachable()).toBe(false);

    prepareForegroundConnectivityResume();
    expect(getServerReachable()).toBeNull();
  });

  it("recovers offline UI when a real API response succeeds", () => {
    dispatchUnreachable(false);
    dispatchUnreachable(false);
    expect(getServerReachable()).toBe(false);

    markApiRequestSuccess();
    window.dispatchEvent(new Event("api-server-reachable"));
    expect(getServerReachable()).toBe(true);
    expect(isCircuitOpen()).toBe(false);
  });
});
