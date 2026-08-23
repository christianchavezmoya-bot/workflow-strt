import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./platform", () => ({
  isMobileNativePlatform: vi.fn(() => true),
}));

vi.mock("./syncFlushLock", () => ({
  isSyncFlushing: vi.fn(() => false),
}));

import { isMobileNativePlatform } from "./platform";
import { isSyncFlushing } from "./syncFlushLock";
import {
  isNativeReconnectBusy,
  isWorkflowRunnerOpen,
  markNativeBootstrapFinished,
  markNativeBootstrapStarted,
  markNativeReconnectPending,
  markNativeSyncFlushFinished,
  markNativeSyncFlushStarted,
  markWorkflowRunnerClosed,
  markWorkflowRunnerOpened,
  resetNativeReconnectCoordinatorForTests,
  shouldDeferNativeDashboardFullRefresh,
  shouldDeferPerAssetBackgroundRefresh,
  waitForBackgroundWorkSlot,
} from "./nativeReconnectCoordinator";

describe("nativeReconnectCoordinator", () => {
  beforeEach(() => {
    resetNativeReconnectCoordinatorForTests();
    vi.mocked(isMobileNativePlatform).mockReturnValue(true);
  });

  it("is idle by default", () => {
    expect(isNativeReconnectBusy()).toBe(false);
    expect(isWorkflowRunnerOpen()).toBe(false);
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

  it("defers background work while WorkOrderRunner is open", () => {
    markWorkflowRunnerOpened();
    expect(isWorkflowRunnerOpen()).toBe(true);
    expect(shouldDeferPerAssetBackgroundRefresh()).toBe(true);
    expect(shouldDeferNativeDashboardFullRefresh()).toBe(true);

    markWorkflowRunnerClosed();
    expect(isWorkflowRunnerOpen()).toBe(false);
    // Brief settle window still defers background work after runner closes.
    expect(shouldDeferPerAssetBackgroundRefresh()).toBe(true);
  });

  it("no-ops on web", () => {
    resetNativeReconnectCoordinatorForTests();
    vi.mocked(isMobileNativePlatform).mockReturnValue(false);

    markNativeReconnectPending();
    markWorkflowRunnerOpened();

    expect(isNativeReconnectBusy()).toBe(false);
    expect(isWorkflowRunnerOpen()).toBe(false);
    expect(shouldDeferPerAssetBackgroundRefresh()).toBe(false);
  });

  it("waitForBackgroundWorkSlot does not deadlock during bootstrap", async () => {
    markNativeBootstrapStarted();
    expect(shouldDeferPerAssetBackgroundRefresh()).toBe(true);
    await expect(waitForBackgroundWorkSlot(500)).resolves.toBe(true);
  });

  it("defers background work while sync flush lock is held", () => {
    vi.mocked(isSyncFlushing).mockReturnValue(true);
    expect(shouldDeferPerAssetBackgroundRefresh()).toBe(true);
    vi.mocked(isSyncFlushing).mockReturnValue(false);
    expect(shouldDeferPerAssetBackgroundRefresh()).toBe(false);
  });

  it("waitForBackgroundWorkSlot waits for runner to close", async () => {
    vi.useFakeTimers();
    markWorkflowRunnerOpened();

    const pending = waitForBackgroundWorkSlot(5_000);
    await vi.advanceTimersByTimeAsync(600);
    markWorkflowRunnerClosed();
    await vi.advanceTimersByTimeAsync(3_000);

    await expect(pending).resolves.toBe(true);
    vi.useRealTimers();
  });
});
