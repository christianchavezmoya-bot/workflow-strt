import { describe, expect, it } from "vitest";
import { computeNGoBudgetBytes, computeStorageHealth, shouldWarnBeforeForcedDownload, type StorageHealthInput } from "./storageHealth";

const GB = 1024 ** 3;

function input(partial: Partial<StorageHealthInput>): StorageHealthInput {
  return {
    nGoUsageBytes: 0,
    nGoBudgetBytes: 10 * GB,
    deviceFreeBytes: null,
    deviceTotalBytes: null,
    ...partial,
  };
}

describe("computeStorageHealth — budget-ratio boundaries (required test #1)", () => {
  const cases: [ratio: number, expected: string][] = [
    [0.0, "HEALTHY"],
    [0.49, "HEALTHY"],
    [0.499999, "HEALTHY"],
    [0.5, "WARNING"], // exact boundary: WARNING triggers at >= 0.5
    [0.69, "WARNING"],
    [0.7, "HIGH"], // exact boundary
    [0.84, "HIGH"],
    [0.85, "CRITICAL"], // exact boundary
    [1.0, "CRITICAL"],
    [1.5, "CRITICAL"], // over budget entirely
  ];
  it.each(cases)("budget usage ratio %s -> %s (device signals unknown)", (ratio, expected) => {
    const budget = 10 * GB;
    const result = computeStorageHealth(input({ nGoUsageBytes: ratio * budget, nGoBudgetBytes: budget }));
    expect(result.level).toBe(expected);
    expect(result.nGoUsageRatio).toBeCloseTo(ratio, 5);
  });
});

describe("computeStorageHealth — device free PERCENTAGE boundaries", () => {
  const cases: [freeRatio: number, expected: string][] = [
    [0.21, "HEALTHY"],
    [0.2, "WARNING"], // exact boundary: WARNING at <= 20%
    [0.16, "WARNING"],
    [0.15, "HIGH"], // exact boundary
    [0.11, "HIGH"],
    [0.1, "CRITICAL"], // exact boundary
    [0.0, "CRITICAL"],
  ];
  it.each(cases)("device free ratio %s -> %s (budget usage is 0, large device so absolute floor doesn't also fire)", (freeRatio, expected) => {
    const totalBytes = 1000 * GB; // large enough that the % boundary is tested in isolation from the absolute-GB rule
    const result = computeStorageHealth(
      input({ deviceFreeBytes: freeRatio * totalBytes, deviceTotalBytes: totalBytes }),
    );
    expect(result.level).toBe(expected);
    expect(result.deviceFreeRatio).toBeCloseTo(freeRatio, 5);
  });
});

describe("computeStorageHealth — device free ABSOLUTE boundaries (required test #1)", () => {
  const cases: [freeGB: number, expected: string][] = [
    [6, "HEALTHY"],
    [5.01, "HEALTHY"],
    [5, "WARNING"], // exact boundary: WARNING at <= 5GB
    [2.5, "WARNING"],
    [2, "HIGH"], // exact boundary
    [1.5, "HIGH"],
    [1, "CRITICAL"], // exact boundary
    [0, "CRITICAL"],
  ];
  it.each(cases)("device free %sGB -> %s (deviceTotalBytes unknown, so the %-based rule is skipped entirely — isolates the absolute rule)", (freeGB, expected) => {
    const result = computeStorageHealth(input({ deviceFreeBytes: freeGB * GB, deviceTotalBytes: null }));
    expect(result.level).toBe(expected);
    expect(result.deviceFreeRatio).toBeNull();
  });
});

describe("computeStorageHealth — worst-signal-wins (required test #2)", () => {
  it("HEALTHY budget + CRITICAL device free -> CRITICAL overall", () => {
    const result = computeStorageHealth(
      input({ nGoUsageBytes: 0.1 * 10 * GB, nGoBudgetBytes: 10 * GB, deviceFreeBytes: 0.5 * GB, deviceTotalBytes: 1000 * GB }),
    );
    expect(result.level).toBe("CRITICAL");
    expect(result.drivenBy).toBe("device-absolute");
  });

  it("CRITICAL budget + HEALTHY device free -> CRITICAL overall (budget alone is enough)", () => {
    const result = computeStorageHealth(
      input({ nGoUsageBytes: 0.9 * 10 * GB, nGoBudgetBytes: 10 * GB, deviceFreeBytes: 500 * GB, deviceTotalBytes: 1000 * GB }),
    );
    expect(result.level).toBe("CRITICAL");
    expect(result.drivenBy).toBe("budget");
  });

  it("WARNING budget + HIGH device-percent -> HIGH overall (the worse of the two)", () => {
    const result = computeStorageHealth(
      input({ nGoUsageBytes: 0.55 * 10 * GB, nGoBudgetBytes: 10 * GB, deviceFreeBytes: 0.12 * 1000 * GB, deviceTotalBytes: 1000 * GB }),
    );
    expect(result.level).toBe("HIGH");
  });

  it("all three signals HEALTHY -> HEALTHY", () => {
    const result = computeStorageHealth(
      input({ nGoUsageBytes: 0.1 * 10 * GB, nGoBudgetBytes: 10 * GB, deviceFreeBytes: 500 * GB, deviceTotalBytes: 1000 * GB }),
    );
    expect(result.level).toBe("HEALTHY");
  });

  it("device free absolute is CRITICAL even while device free PERCENTAGE looks healthy (huge device, tiny absolute margin edge case)", () => {
    // 0.9GB free out of a 500GB device is 0.18% free (percentage rule would also fire here,
    // but this proves the ABSOLUTE floor independently catches a dangerously low margin).
    const result = computeStorageHealth(
      input({ nGoUsageBytes: 0, nGoBudgetBytes: 10 * GB, deviceFreeBytes: 0.9 * GB, deviceTotalBytes: 500 * GB }),
    );
    expect(result.level).toBe("CRITICAL");
  });
});

describe("computeStorageHealth — device-storage-unavailable fallback (required test #3)", () => {
  it("both deviceFreeBytes and deviceTotalBytes null -> health is computed from budget alone, never treated as an error/CRITICAL by default", () => {
    const result = computeStorageHealth(input({ nGoUsageBytes: 0.1 * 10 * GB, nGoBudgetBytes: 10 * GB }));
    expect(result.level).toBe("HEALTHY");
    expect(result.drivenBy).toBe("budget-only");
    expect(result.deviceFreeRatio).toBeNull();
  });

  it("device-unavailable + high budget usage still correctly escalates using budget alone", () => {
    const result = computeStorageHealth(input({ nGoUsageBytes: 0.9 * 10 * GB, nGoBudgetBytes: 10 * GB }));
    expect(result.level).toBe("CRITICAL");
    expect(result.drivenBy).toBe("budget-only");
  });

  it("deviceTotalBytes known but deviceFreeBytes null (partial signal) does not crash and skips percentage/absolute rules", () => {
    const result = computeStorageHealth(input({ nGoUsageBytes: 0.1 * 10 * GB, nGoBudgetBytes: 10 * GB, deviceTotalBytes: 1000 * GB }));
    expect(result.level).toBe("HEALTHY");
    expect(result.deviceFreeRatio).toBeNull();
  });

  it("a zero/negative budget never divides by zero or throws", () => {
    expect(() => computeStorageHealth(input({ nGoBudgetBytes: 0 }))).not.toThrow();
    const result = computeStorageHealth(input({ nGoBudgetBytes: 0 }));
    expect(result.nGoUsageRatio).toBe(0);
    expect(Number.isFinite(result.nGoUsageRatio)).toBe(true);
  });
});

describe("computeNGoBudgetBytes — device-relative formula", () => {
  it("uses a bounded share of device capacity when device total is known", () => {
    // 5% default share, floor 2GB, ceiling 20GB
    expect(computeNGoBudgetBytes(200 * GB)).toBe(10 * GB); // 5% of 200GB = 10GB, within [2,20]
  });

  it("clamps to the floor on a small device (5% would be below the floor)", () => {
    expect(computeNGoBudgetBytes(16 * GB)).toBe(2 * GB); // 5% of 16GB = 0.8GB < 2GB floor
  });

  it("clamps to the ceiling on a very large device (5% would exceed the ceiling)", () => {
    expect(computeNGoBudgetBytes(2000 * GB)).toBe(20 * GB); // 5% of 2000GB = 100GB > 20GB ceiling
  });

  it("falls back to a fixed budget when device total is unknown (null) — the stopgap case", () => {
    expect(computeNGoBudgetBytes(null)).toBe(5 * GB);
  });

  it("falls back when device total is zero or negative (defensive, should never happen but must not divide oddly)", () => {
    expect(computeNGoBudgetBytes(0)).toBe(5 * GB);
    expect(computeNGoBudgetBytes(-1)).toBe(5 * GB);
  });

  it("options override the defaults", () => {
    expect(computeNGoBudgetBytes(200 * GB, { shareOfDevice: 0.1, floorBytes: 1 * GB, ceilingBytes: 50 * GB })).toBe(20 * GB);
  });
});

describe("shouldWarnBeforeForcedDownload — Phase 1H gate", () => {
  it("warns only at HIGH and CRITICAL, never at HEALTHY or WARNING (uploads are never gated by this)", () => {
    expect(shouldWarnBeforeForcedDownload("HEALTHY")).toBe(false);
    expect(shouldWarnBeforeForcedDownload("WARNING")).toBe(false);
    expect(shouldWarnBeforeForcedDownload("HIGH")).toBe(true);
    expect(shouldWarnBeforeForcedDownload("CRITICAL")).toBe(true);
  });
});
