import { describe, expect, it, beforeEach } from "vitest";
import {
  setSyncConnectivityPendingCount,
  setSyncConnectivitySyncing,
  shouldSuppressUnreachableOffline,
} from "./syncConnectivityGuard";

describe("syncConnectivityGuard", () => {
  beforeEach(() => {
    setSyncConnectivityPendingCount(0);
    setSyncConnectivitySyncing(false);
  });

  it("suppresses unreachable offline while pending uploads exist", () => {
    setSyncConnectivityPendingCount(16);
    expect(shouldSuppressUnreachableOffline()).toBe(true);
  });

  it("suppresses unreachable offline while sync engine is syncing", () => {
    setSyncConnectivitySyncing(true);
    expect(shouldSuppressUnreachableOffline()).toBe(true);
  });

  it("does not suppress when queue is idle", () => {
    expect(shouldSuppressUnreachableOffline()).toBe(false);
  });
});
