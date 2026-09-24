import { beforeEach, describe, expect, it, vi } from "vitest";

const platformMocks = vi.hoisted(() => ({
  isMobileNativePlatform: vi.fn().mockReturnValue(false),
}));

const deviceStorageMocks = vi.hoisted(() => ({
  getStorageInfo: vi.fn(),
}));

vi.mock("../utils/platform", () => platformMocks);
vi.mock("./nativePlugins/deviceStorage", () => ({
  DeviceStorage: deviceStorageMocks,
  default: deviceStorageMocks,
}));

import { isValidNativeStorageInfo, readDeviceStorage } from "./deviceStorageCapability";

const GB = 1024 ** 3;

beforeEach(() => {
  vi.clearAllMocks();
  platformMocks.isMobileNativePlatform.mockReturnValue(false);
});

describe("isValidNativeStorageInfo (pure validator for the native bridge boundary)", () => {
  it("accepts a well-formed byte reading", () => {
    expect(isValidNativeStorageInfo({ totalBytes: 128 * GB, freeBytes: 40 * GB })).toBe(true);
    expect(isValidNativeStorageInfo({ totalBytes: 1, freeBytes: 0 })).toBe(true); // a full disk is valid
  });

  it("rejects NaN, Infinity, negatives, a non-positive total, and non-numbers", () => {
    expect(isValidNativeStorageInfo({ totalBytes: Number.NaN, freeBytes: 1 })).toBe(false);
    expect(isValidNativeStorageInfo({ totalBytes: 1, freeBytes: Number.NaN })).toBe(false);
    expect(isValidNativeStorageInfo({ totalBytes: Number.POSITIVE_INFINITY, freeBytes: 1 })).toBe(false);
    expect(isValidNativeStorageInfo({ totalBytes: 1, freeBytes: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isValidNativeStorageInfo({ totalBytes: -1, freeBytes: 1 })).toBe(false);
    expect(isValidNativeStorageInfo({ totalBytes: 0, freeBytes: 0 })).toBe(false);
    expect(isValidNativeStorageInfo({ totalBytes: 1, freeBytes: -1 })).toBe(false);
    // No formatted strings / percentages may cross the bridge.
    expect(isValidNativeStorageInfo({ totalBytes: "128 GB", freeBytes: "40 GB" })).toBe(false);
    expect(isValidNativeStorageInfo({ totalBytes: 100, freeBytes: "31%" })).toBe(false);
  });

  it("rejects a malformed/absent response object", () => {
    expect(isValidNativeStorageInfo(null)).toBe(false);
    expect(isValidNativeStorageInfo(undefined)).toBe(false);
    expect(isValidNativeStorageInfo({})).toBe(false);
    expect(isValidNativeStorageInfo({ totalBytes: 100 })).toBe(false); // freeBytes missing
    expect(isValidNativeStorageInfo(42)).toBe(false);
  });

  it("passes through freeBytes > totalBytes rather than clamping (iOS purgeable-space semantics)", () => {
    // Documented, deliberate: see the validator's doc comment. It stays visible instead of being
    // silently normalized; computeStorageHealth only ever applies "<= threshold" rules, so an
    // over-large free figure can never manufacture a false CRITICAL.
    expect(isValidNativeStorageInfo({ totalBytes: 64 * GB, freeBytes: 70 * GB })).toBe(true);
  });
});

describe("readDeviceStorage — native", () => {
  beforeEach(() => {
    platformMocks.isMobileNativePlatform.mockReturnValue(true);
  });

  it("returns NATIVE_DEVICE_API with real bytes on a valid plugin response", async () => {
    deviceStorageMocks.getStorageInfo.mockResolvedValue({ totalBytes: 128 * GB, freeBytes: 42 * GB });

    const reading = await readDeviceStorage();

    expect(reading).toEqual({
      source: "NATIVE_DEVICE_API",
      totalBytes: 128 * GB,
      freeBytes: 42 * GB,
      quotaBytes: null,
      quotaUsageBytes: null,
    });
  });

  it("falls back to UNAVAILABLE when the plugin is not present in this build (bridge rejects)", async () => {
    deviceStorageMocks.getStorageInfo.mockRejectedValue(new Error('"DeviceStorage" plugin is not implemented on android'));

    const reading = await readDeviceStorage();

    expect(reading.source).toBe("UNAVAILABLE");
    expect(reading.freeBytes).toBeNull();
    expect(reading.totalBytes).toBeNull();
    expect(reading.unavailableReason).toMatch(/unavailable or failed/i);
  });

  it("falls back to UNAVAILABLE when the native call throws", async () => {
    deviceStorageMocks.getStorageInfo.mockRejectedValue(new Error("Failed to read device storage information"));

    const reading = await readDeviceStorage();

    expect(reading.source).toBe("UNAVAILABLE");
    expect(reading.freeBytes).toBeNull();
    expect(reading.totalBytes).toBeNull();
  });

  it("falls back to UNAVAILABLE on a malformed native result, never surfacing the bad numbers", async () => {
    deviceStorageMocks.getStorageInfo.mockResolvedValue({ totalBytes: -1, freeBytes: Number.NaN });

    const reading = await readDeviceStorage();

    expect(reading.source).toBe("UNAVAILABLE");
    expect(reading.freeBytes).toBeNull();
    expect(reading.totalBytes).toBeNull();
    expect(reading.unavailableReason).toMatch(/malformed/i);
  });

  it("never consults navigator.storage.estimate() on native", async () => {
    const estimate = vi.fn();
    vi.stubGlobal("navigator", { storage: { estimate } });
    deviceStorageMocks.getStorageInfo.mockResolvedValue({ totalBytes: 64 * GB, freeBytes: 8 * GB });

    await readDeviceStorage();

    expect(estimate).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("readDeviceStorage — web behavior is unchanged by the native work", () => {
  it("still reports WEB_QUOTA_ESTIMATE, and still never presents it as device free/total space", async () => {
    vi.stubGlobal("navigator", {
      storage: { estimate: vi.fn().mockResolvedValue({ quota: 10 * GB, usage: 2 * GB }) },
    });

    const reading = await readDeviceStorage();

    expect(reading.source).toBe("WEB_QUOTA_ESTIMATE");
    expect(reading.quotaBytes).toBe(10 * GB);
    expect(reading.quotaUsageBytes).toBe(2 * GB);
    // The critical invariant: an origin quota is NEVER reported as device free/total disk.
    expect(reading.freeBytes).toBeNull();
    expect(reading.totalBytes).toBeNull();
    expect(deviceStorageMocks.getStorageInfo).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("returns UNAVAILABLE when the browser has no StorageManager", async () => {
    vi.stubGlobal("navigator", {});

    const reading = await readDeviceStorage();

    expect(reading.source).toBe("UNAVAILABLE");
    expect(reading.unavailableReason).toMatch(/navigator\.storage\.estimate/);
    vi.unstubAllGlobals();
  });

  it("returns UNAVAILABLE when estimate() rejects (private/restricted context)", async () => {
    vi.stubGlobal("navigator", { storage: { estimate: vi.fn().mockRejectedValue(new Error("denied")) } });

    const reading = await readDeviceStorage();

    expect(reading.source).toBe("UNAVAILABLE");
    vi.unstubAllGlobals();
  });
});
