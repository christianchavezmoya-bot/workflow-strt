/**
 * End-to-end wiring proof for native device capacity: the real readDeviceStorage() feeding the
 * real computeNGoBudgetBytes()/computeStorageHealth(), with ONLY the native plugin boundary
 * mocked. This is the chain getOfflineStorageOverview() runs in production.
 *
 * Purpose (Sections G + I of the native-capacity work): confirm that supplying real device
 * total/free bytes AUTOMATICALLY switches the budget off its 5 GB fallback and lets device free
 * space independently drive WARNING/HIGH/CRITICAL — without changing any approved threshold or
 * the budget formula itself.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const platformMocks = vi.hoisted(() => ({
  isMobileNativePlatform: vi.fn().mockReturnValue(true),
}));

const deviceStorageMocks = vi.hoisted(() => ({
  getStorageInfo: vi.fn(),
}));

vi.mock("../utils/platform", () => platformMocks);
vi.mock("./nativePlugins/deviceStorage", () => ({
  DeviceStorage: deviceStorageMocks,
  default: deviceStorageMocks,
}));

import { readDeviceStorage } from "./deviceStorageCapability";
import { computeNGoBudgetBytes, computeStorageHealth } from "../utils/storageHealth";

const GB = 1024 ** 3;
const MB = 1024 ** 2;

/** The exact wiring from offlineStorageService.getOfflineStorageOverview(). */
async function healthFor(nGoUsageBytes: number) {
  const device = await readDeviceStorage();
  const nGoBudgetBytes = computeNGoBudgetBytes(device.totalBytes);
  return {
    device,
    nGoBudgetBytes,
    health: computeStorageHealth({
      nGoUsageBytes,
      nGoBudgetBytes,
      deviceFreeBytes: device.freeBytes,
      deviceTotalBytes: device.totalBytes,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  platformMocks.isMobileNativePlatform.mockReturnValue(true);
});

describe("native capacity automatically activates the device-relative budget (Section G)", () => {
  it("switches off the 5 GB fallback to 5% of device total once a real totalBytes arrives", async () => {
    deviceStorageMocks.getStorageInfo.mockResolvedValue({ totalBytes: 128 * GB, freeBytes: 64 * GB });

    const { device, nGoBudgetBytes } = await healthFor(1 * GB);

    expect(device.source).toBe("NATIVE_DEVICE_API");
    expect(nGoBudgetBytes).toBe(0.05 * 128 * GB); // 6.4 GB — not the 5 GB fallback
    expect(nGoBudgetBytes).not.toBe(5 * GB);
  });

  it("clamps to the 2 GB floor on a small device and the 20 GB ceiling on a very large one", async () => {
    deviceStorageMocks.getStorageInfo.mockResolvedValue({ totalBytes: 16 * GB, freeBytes: 8 * GB });
    expect((await healthFor(0)).nGoBudgetBytes).toBe(2 * GB); // 5% of 16GB = 0.8GB -> floor

    deviceStorageMocks.getStorageInfo.mockResolvedValue({ totalBytes: 1024 * GB, freeBytes: 500 * GB });
    expect((await healthFor(0)).nGoBudgetBytes).toBe(20 * GB); // 5% of 1TB = 51.2GB -> ceiling
  });

  it("keeps the 5 GB fallback and budget-only mode when the plugin is unavailable", async () => {
    deviceStorageMocks.getStorageInfo.mockRejectedValue(new Error("not implemented"));

    const { device, nGoBudgetBytes, health } = await healthFor(1 * GB);

    expect(device.source).toBe("UNAVAILABLE");
    expect(nGoBudgetBytes).toBe(5 * GB);
    expect(health.drivenBy).toBe("budget-only");
    expect(health.deviceFreeRatio).toBeNull();
  });
});

describe("native free space independently drives health levels (Section I)", () => {
  it("REQUIRED: N-Go using only 500 MB but the phone has 800 MB left -> CRITICAL", async () => {
    // 64 GB device, 800 MB free. N-Go's own footprint is trivially small (500 MB against a
    // 3.2 GB budget = 15%, comfortably HEALTHY), so the CRITICAL verdict can ONLY come from the
    // device signal — exactly the behavior real native capacity was added to enable.
    deviceStorageMocks.getStorageInfo.mockResolvedValue({ totalBytes: 64 * GB, freeBytes: 800 * MB });

    const { health, nGoBudgetBytes } = await healthFor(500 * MB);

    expect(500 * MB / nGoBudgetBytes).toBeLessThan(0.5); // budget signal alone would be HEALTHY
    expect(health.level).toBe("CRITICAL");
    expect(health.drivenBy).toBe("device-absolute"); // <= 1 GB absolute rule
  });

  it("drives WARNING from device free space alone (18% free on a healthy-budget device)", async () => {
    deviceStorageMocks.getStorageInfo.mockResolvedValue({ totalBytes: 128 * GB, freeBytes: 23 * GB }); // ~18%

    const { health } = await healthFor(100 * MB);

    expect(health.level).toBe("WARNING");
    expect(health.drivenBy).toBe("device-percent");
  });

  it("drives HIGH from device free space alone (~13% free)", async () => {
    deviceStorageMocks.getStorageInfo.mockResolvedValue({ totalBytes: 128 * GB, freeBytes: 17 * GB }); // ~13.3%

    const { health } = await healthFor(100 * MB);

    expect(health.level).toBe("HIGH");
    expect(health.drivenBy).toBe("device-percent");
  });

  it("stays HEALTHY when both the budget and real device space are comfortable", async () => {
    deviceStorageMocks.getStorageInfo.mockResolvedValue({ totalBytes: 256 * GB, freeBytes: 128 * GB });

    const { health } = await healthFor(1 * GB);

    expect(health.level).toBe("HEALTHY");
    expect(health.deviceFreeRatio).toBeCloseTo(0.5, 5);
  });
});

describe("OBSERVED CONSEQUENCE of the approved thresholds — reported, not changed (Section I)", () => {
  it("a 512 GB phone with 40 GB free (7.8%) is CRITICAL on the percentage rule despite a large absolute margin", async () => {
    // Deliberately asserted as-is rather than 'fixed': the percentage rule (free <= 10% ->
    // CRITICAL) fires even though 40 GB is objectively plenty of room for N-Go to keep working.
    // Flagged in the PR for an owner decision on whether the percentage and absolute rules should
    // be refined later; NOT silently changed here.
    deviceStorageMocks.getStorageInfo.mockResolvedValue({ totalBytes: 512 * GB, freeBytes: 40 * GB });

    const { health } = await healthFor(1 * GB);

    expect(health.deviceFreeRatio).toBeCloseTo(0.078, 3);
    expect(health.level).toBe("CRITICAL");
    expect(health.drivenBy).toBe("device-percent");
  });

  it("an IMPOSSIBLE freeBytes > totalBytes reading is rejected end-to-end, falling back to budget-only rather than computing an impossible ratio", async () => {
    // isValidNativeStorageInfo() rejects freeBytes > totalBytes (a review fix — the two figures
    // describe the SAME volume, so "available" can never legitimately exceed "total"). The whole
    // chain must therefore degrade to UNAVAILABLE/budget-only here, never surface a >1 device
    // free ratio, and never let a malformed reading masquerade as healthy OR as pressure.
    deviceStorageMocks.getStorageInfo.mockResolvedValue({ totalBytes: 64 * GB, freeBytes: 70 * GB });

    const { device, nGoBudgetBytes, health } = await healthFor(100 * MB);

    expect(device.source).toBe("UNAVAILABLE");
    expect(device.freeBytes).toBeNull();
    expect(device.totalBytes).toBeNull();
    expect(nGoBudgetBytes).toBe(5 * GB); // the 5 GB fallback, exactly as when the plugin is absent
    expect(health.drivenBy).toBe("budget-only");
    expect(health.deviceFreeRatio).toBeNull();
  });
});
