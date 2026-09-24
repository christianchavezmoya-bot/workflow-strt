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

// Required test #1 (unchanged by the policy refinement — budgetRatio values were not touched).
describe("computeStorageHealth — budget-ratio boundaries (required test #1, unchanged)", () => {
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

// Required test #1 / #7 (unchanged by the policy refinement — deviceFreeAbsoluteBytesMax values
// were not touched; this rule remains a plain, unqualified OR, independent of percentage).
describe("computeStorageHealth — device free ABSOLUTE boundaries (required tests #1, #7, unchanged)", () => {
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

/**
 * Policy refinement (post-PR #369): the percentage-free rule is now QUALIFIED — it only escalates
 * a tier when device free bytes ALSO fall at or under that tier's `devicePercentGuardrailBytesMax`
 * (an AND, never an OR). This whole section replaces the old "vary ratio over one huge fixed
 * total" parameterization, which is no longer valid: on a huge fixed total, a "low" percentage
 * still means a huge absolute free-byte count that now fails every guardrail.
 */
describe("computeStorageHealth — QUALIFIED device free PERCENTAGE (required tests #3, #4, #5, #12)", () => {
  // Required test #3: qualified percentage WARNING — also doubles as the exact WARNING boundary
  // (15% AND exactly 20GB) required in section J, since both land on the same construction.
  it("15% free AND exactly 20GB free -> WARNING (percentage qualified by its guardrail)", () => {
    const freeBytes = 20 * GB;
    const totalBytes = freeBytes / 0.15;
    const result = computeStorageHealth(input({ deviceFreeBytes: freeBytes, deviceTotalBytes: totalBytes }));
    expect(result.deviceFreeRatio).toBeCloseTo(0.15, 10);
    expect(result.level).toBe("WARNING");
    expect(result.drivenBy).toBe("device-percent");
  });

  // Required test #4: qualified percentage HIGH — also the exact HIGH boundary (10% AND exactly 10GB).
  it("10% free AND exactly 10GB free -> HIGH (percentage qualified by its guardrail)", () => {
    const freeBytes = 10 * GB;
    const totalBytes = freeBytes / 0.1;
    const result = computeStorageHealth(input({ deviceFreeBytes: freeBytes, deviceTotalBytes: totalBytes }));
    expect(result.deviceFreeRatio).toBeCloseTo(0.1, 10);
    expect(result.level).toBe("HIGH");
    expect(result.drivenBy).toBe("device-percent");
  });

  // Required test #5: qualified percentage CRITICAL — also the exact CRITICAL boundary (5% AND exactly 5GB).
  it("5% free AND exactly 5GB free -> CRITICAL (percentage qualified by its guardrail)", () => {
    const freeBytes = 5 * GB;
    const totalBytes = freeBytes / 0.05;
    const result = computeStorageHealth(input({ deviceFreeBytes: freeBytes, deviceTotalBytes: totalBytes }));
    expect(result.deviceFreeRatio).toBeCloseTo(0.05, 10);
    expect(result.level).toBe("CRITICAL");
    expect(result.drivenBy).toBe("device-percent");
  });

  // Required test #12: just OUTSIDE the WARNING guardrail — the ratio alone qualifies (14% <= 15%)
  // but free bytes (20.01GB) exceed the 20GB guardrail, so percentage must NOT escalate at all.
  // Nothing else qualifies either (20.01GB is also above the WARNING absolute floor of 5GB), so the
  // final health must be HEALTHY — asserted as the exact final level, not just "one branch skipped".
  it("14% free but 20.01GB free -> percentage WARNING does not fire -> HEALTHY overall", () => {
    const freeBytes = 20.01 * GB;
    const totalBytes = freeBytes / 0.14;
    const result = computeStorageHealth(input({ deviceFreeBytes: freeBytes, deviceTotalBytes: totalBytes }));
    expect(result.deviceFreeRatio).toBeCloseTo(0.14, 10);
    expect(result.level).toBe("HEALTHY");
  });

  // Required test #12: just OUTSIDE the HIGH guardrail (9% <= 10% but 10.01GB > 10GB guardrail).
  // HIGH-via-percentage must not fire — but 10.01GB IS within WARNING's own 20GB guardrail and
  // 9% <= WARNING's 15% ratio, so WARNING legitimately fires from percentage at that lower tier.
  // The exact final level must be WARNING, not HEALTHY and not HIGH.
  it("9% free but 10.01GB free -> percentage HIGH does not fire, but WARNING (lower tier) still legitimately does -> WARNING overall", () => {
    const freeBytes = 10.01 * GB;
    const totalBytes = freeBytes / 0.09;
    const result = computeStorageHealth(input({ deviceFreeBytes: freeBytes, deviceTotalBytes: totalBytes }));
    expect(result.deviceFreeRatio).toBeCloseTo(0.09, 10);
    expect(result.level).toBe("WARNING");
    expect(result.drivenBy).toBe("device-percent");
  });

  // Required test #12: just OUTSIDE the CRITICAL guardrail (4% <= 5% but 5.01GB > 5GB guardrail).
  // CRITICAL-via-percentage must not fire — but 5.01GB IS within HIGH's 10GB guardrail and
  // 4% <= HIGH's 10% ratio, so HIGH legitimately fires from percentage at that lower tier.
  // The exact final level must be HIGH, not HEALTHY and not CRITICAL.
  it("4% free but 5.01GB free -> percentage CRITICAL does not fire, but HIGH (lower tier) still legitimately does -> HIGH overall", () => {
    const freeBytes = 5.01 * GB;
    const totalBytes = freeBytes / 0.04;
    const result = computeStorageHealth(input({ deviceFreeBytes: freeBytes, deviceTotalBytes: totalBytes }));
    expect(result.deviceFreeRatio).toBeCloseTo(0.04, 10);
    expect(result.level).toBe("HIGH");
    expect(result.drivenBy).toBe("device-percent");
  });
});

// Required test #6 — the core motivation for this policy refinement: low percentage-free alone,
// on a device with a large absolute free-byte margin, must NOT escalate. These are the exact
// PR #369 false-CRITICAL cases (the 512GB/40GB example from the review, and the 372.5GB/21.7GB
// reading recorded from the iOS Simulator in that PR) — both now resolve to HEALTHY.
describe("computeStorageHealth — low percentage + large absolute free space does NOT escalate (required test #6)", () => {
  it("512 GB total / 40 GB free (~7.8%) -> HEALTHY (device capacity alone)", () => {
    const result = computeStorageHealth(input({ deviceFreeBytes: 40 * GB, deviceTotalBytes: 512 * GB }));
    expect(result.deviceFreeRatio).toBeCloseTo(0.078125, 5);
    expect(result.level).toBe("HEALTHY");
  });

  it("372.5 GB total / 21.7 GB free (~5.8%) -> HEALTHY — resolves the PR #369 simulator reading", () => {
    const result = computeStorageHealth(input({ deviceFreeBytes: 21.7 * GB, deviceTotalBytes: 372.5 * GB }));
    expect(result.deviceFreeRatio).toBeCloseTo(0.058255, 5);
    expect(result.level).toBe("HEALTHY");
  });
});

// Required test #8 — the N-Go budget rule remains a fully independent OR, unaffected by the
// percentage guardrail refinement (it was never percentage-based to begin with).
describe("computeStorageHealth — N-Go budget still escalates independently (required test #8)", () => {
  it("N-Go budget usage >= 85% with 100 GB device free (comfortably above every guardrail) -> CRITICAL from budget alone", () => {
    const budget = 10 * GB;
    const result = computeStorageHealth(
      input({ nGoUsageBytes: 0.9 * budget, nGoBudgetBytes: budget, deviceFreeBytes: 100 * GB, deviceTotalBytes: 1000 * GB }),
    );
    expect(result.level).toBe("CRITICAL");
    expect(result.drivenBy).toBe("budget");
  });
});

// Section B worked examples not already covered above.
describe("computeStorageHealth — section B worked examples", () => {
  it("128 GB total / 17 GB free (~13.3%) -> WARNING (qualifies WARNING's 20GB guardrail, not HIGH's 10GB one)", () => {
    const result = computeStorageHealth(input({ deviceFreeBytes: 17 * GB, deviceTotalBytes: 128 * GB }));
    expect(result.level).toBe("WARNING");
  });

  it("64 GB total / 8 GB free (12.5%) -> WARNING (ratio fails HIGH's 10% cutoff entirely)", () => {
    const result = computeStorageHealth(input({ deviceFreeBytes: 8 * GB, deviceTotalBytes: 64 * GB }));
    expect(result.level).toBe("WARNING");
  });

  it("64 GB total / 6 GB free (9.375%) -> HIGH (qualifies HIGH's 10GB guardrail)", () => {
    const result = computeStorageHealth(input({ deviceFreeBytes: 6 * GB, deviceTotalBytes: 64 * GB }));
    expect(result.level).toBe("HIGH");
  });

  it("64 GB total / 4 GB free (6.25%) -> HIGH (absolute rule alone would only reach WARNING at <=5GB; percentage pushes it to HIGH)", () => {
    const result = computeStorageHealth(input({ deviceFreeBytes: 4 * GB, deviceTotalBytes: 64 * GB }));
    expect(result.level).toBe("HIGH");
  });

  it("64 GB total / 3 GB free (~4.7%) -> CRITICAL (qualifies CRITICAL's 5GB guardrail)", () => {
    const result = computeStorageHealth(input({ deviceFreeBytes: 3 * GB, deviceTotalBytes: 64 * GB }));
    expect(result.level).toBe("CRITICAL");
  });

  it("64 GB total / 800 MB free -> CRITICAL from the absolute rule regardless of percentage", () => {
    const result = computeStorageHealth(input({ deviceFreeBytes: 0.8 * GB, deviceTotalBytes: 64 * GB }));
    expect(result.level).toBe("CRITICAL");
    expect(result.drivenBy).toBe("device-absolute");
  });

  it("16 GB total / 3 GB free (18.75%) -> WARNING from the absolute rule alone (ratio fails WARNING's own 15% cutoff)", () => {
    const result = computeStorageHealth(input({ deviceFreeBytes: 3 * GB, deviceTotalBytes: 16 * GB }));
    expect(result.deviceFreeRatio).toBeCloseTo(0.1875, 4);
    expect(result.level).toBe("WARNING");
    expect(result.drivenBy).toBe("device-absolute");
  });
});

// Required test #9 — worst-signal-wins across budget/percent/absolute still holds under the
// refined percentage rule.
describe("computeStorageHealth — worst-signal-wins (required tests #2, #9)", () => {
  it("HEALTHY budget + CRITICAL device free (percentage AND absolute both qualify) -> CRITICAL overall", () => {
    const result = computeStorageHealth(
      input({ nGoUsageBytes: 0.1 * 10 * GB, nGoBudgetBytes: 10 * GB, deviceFreeBytes: 0.5 * GB, deviceTotalBytes: 1000 * GB }),
    );
    expect(result.level).toBe("CRITICAL");
    expect(result.drivenBy).toBe("device-absolute");
  });

  it("CRITICAL budget + HEALTHY device free (500GB free, comfortably above every guardrail) -> CRITICAL overall (budget alone is enough)", () => {
    const result = computeStorageHealth(
      input({ nGoUsageBytes: 0.9 * 10 * GB, nGoBudgetBytes: 10 * GB, deviceFreeBytes: 500 * GB, deviceTotalBytes: 1000 * GB }),
    );
    expect(result.level).toBe("CRITICAL");
    expect(result.drivenBy).toBe("budget");
  });

  it("WARNING budget + HIGH device-percent (6GB/64GB, guardrail-qualified) -> HIGH overall (the worse of the two)", () => {
    const budget = 10 * GB;
    const result = computeStorageHealth(
      input({ nGoUsageBytes: 0.55 * budget, nGoBudgetBytes: budget, deviceFreeBytes: 6 * GB, deviceTotalBytes: 64 * GB }),
    );
    expect(result.level).toBe("HIGH");
  });

  it("all three signals HEALTHY -> HEALTHY", () => {
    const result = computeStorageHealth(
      input({ nGoUsageBytes: 0.1 * 10 * GB, nGoBudgetBytes: 10 * GB, deviceFreeBytes: 500 * GB, deviceTotalBytes: 1000 * GB }),
    );
    expect(result.level).toBe("HEALTHY");
  });

  it("device free absolute is CRITICAL while device free percentage is also critically low (huge device, tiny absolute margin edge case)", () => {
    // 0.9GB free out of a 500GB device is 0.18% free — both the percentage rule (qualified: 0.9GB
    // is within CRITICAL's 5GB guardrail) and the independent absolute floor fire here.
    const result = computeStorageHealth(
      input({ nGoUsageBytes: 0, nGoBudgetBytes: 10 * GB, deviceFreeBytes: 0.9 * GB, deviceTotalBytes: 500 * GB }),
    );
    expect(result.level).toBe("CRITICAL");
  });
});

// Required test #10 (unchanged by the policy refinement).
describe("computeStorageHealth — device-storage-unavailable fallback (required tests #3, #10, unchanged)", () => {
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

// computeNGoBudgetBytes() is explicitly NOT part of this policy refinement — unchanged formula,
// unchanged tests, kept here to prove the refinement didn't touch it.
describe("computeNGoBudgetBytes — device-relative formula (NOT changed by this policy refinement)", () => {
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

// Required test #11 — forced-download warning behavior reflects the RESULTING health level, not
// a hardcoded expectation. shouldWarnBeforeForcedDownload() itself is unchanged (still HIGH/
// CRITICAL only); what changes is which health level a given device reading now produces.
describe("shouldWarnBeforeForcedDownload — reflects resulting health (required test #11)", () => {
  it("warns only at HIGH and CRITICAL, never at HEALTHY or WARNING (uploads are never gated by this) — unchanged gate logic", () => {
    expect(shouldWarnBeforeForcedDownload("HEALTHY")).toBe(false);
    expect(shouldWarnBeforeForcedDownload("WARNING")).toBe(false);
    expect(shouldWarnBeforeForcedDownload("HIGH")).toBe(true);
    expect(shouldWarnBeforeForcedDownload("CRITICAL")).toBe(true);
  });

  it("512 GB total / 40 GB free + low N-Go usage -> HEALTHY -> no forced-download warning (previously a false CRITICAL that DID warn)", () => {
    const result = computeStorageHealth(input({ nGoUsageBytes: 0.1 * 10 * GB, nGoBudgetBytes: 10 * GB, deviceFreeBytes: 40 * GB, deviceTotalBytes: 512 * GB }));
    expect(result.level).toBe("HEALTHY");
    expect(shouldWarnBeforeForcedDownload(result.level)).toBe(false);
  });

  it("64 GB total / 6 GB free + low N-Go usage -> HIGH -> forced-download warning still shown", () => {
    const result = computeStorageHealth(input({ nGoUsageBytes: 0.1 * 10 * GB, nGoBudgetBytes: 10 * GB, deviceFreeBytes: 6 * GB, deviceTotalBytes: 64 * GB }));
    expect(result.level).toBe("HIGH");
    expect(shouldWarnBeforeForcedDownload(result.level)).toBe(true);
  });
});
