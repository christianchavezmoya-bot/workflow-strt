import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./platform", () => ({
  isMobileNativePlatform: vi.fn(() => true),
}));

import { isMobileNativePlatform } from "./platform";
import {
  isNativeReconnectBusy,
  markNativeBootstrapFinished,
  markNativeBootstrapStarted,
  markNativeReconnectPending,
  markNativeSyncFlushFinished,
  markNativeSyncFlushStarted,
  resetNativeReconnectCoordinatorForTests,
  shouldDeferNativeDashboardFullRefresh,
  shouldDeferPerAssetBackgroundRefresh,
} from "./nativeReconnectCoordinator";

describe("nativeReconnectCoordinator", () => {
  beforeEach(() => {
    resetNativeReconnectCoordinatorForTests();
    vi.mocked(isMobileNativePlatform).mockReturnValue(true);
  });

  it("is idle by default", () => {
    expect(isNativeReconnectBusy()).toBe(false);
    expect(shouldDeferPerAssetBackgroundRefresh()).toBe(false);
  });

  it("stays busy from reconnect pending through flush and bootstrap", () => {
    markNativeReconnectPending();
    expect(isNativeReconnectBusy()).toBe(true);

    markNativeSyncFlushStarted();
    markNativeSyncFlushFinished();
    expect(isNativeReconnectBusy()).toBe(true);

    markNativeBootstrapStarted();
    expect(shouldDeferNativeDashboardFullRefresh()).toBe(true);

    markNativeBootstrapFinished();
    expect(isNativeReconnectBusy()).toBe(true);
  });

  it("no-ops on web", () => {
    resetNativeReconnectCoordinatorForTests();
    vi.mocked(isMobileNativePlatform).mockReturnValue(false);

    markNativeReconnectPending();
    markNativeSyncFlushStarted();
    markNativeBootstrapStarted();

    expect(isNativeReconnectBusy()).toBe(false);
    expect(shouldDeferPerAssetBackgroundRefresh()).toBe(false);
  });
});
