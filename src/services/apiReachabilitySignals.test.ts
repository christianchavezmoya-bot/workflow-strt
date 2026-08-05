import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  _resetApiReachabilitySignalsForTests,
  getLastApiSuccessAt,
  hadRecentApiSuccess,
  markApiRequestSuccess,
  RECENT_API_SUCCESS_GRACE_MS,
} from "../services/apiReachabilitySignals";

describe("apiReachabilitySignals", () => {
  beforeEach(() => {
    _resetApiReachabilitySignalsForTests();
  });

  it("tracks recent success", () => {
    expect(hadRecentApiSuccess()).toBe(false);
    markApiRequestSuccess();
    expect(getLastApiSuccessAt()).toBeGreaterThan(0);
    expect(hadRecentApiSuccess()).toBe(true);
  });

  it("expires success grace after the window", () => {
    vi.useFakeTimers();
    markApiRequestSuccess();
    expect(hadRecentApiSuccess()).toBe(true);
    vi.advanceTimersByTime(RECENT_API_SUCCESS_GRACE_MS + 1);
    expect(hadRecentApiSuccess()).toBe(false);
    vi.useRealTimers();
  });
});
