/**
 * Pure storage-health computation. Deliberately has NO knowledge of sync state — storage health
 * and discard eligibility are separate concepts (owner design correction): unsynced work never
 * alters the health level here, it only blocks removal of the specific affected project, which
 * is projectDiscardService.ts's job, not this module's.
 */

export type StorageHealthLevel = "HEALTHY" | "WARNING" | "HIGH" | "CRITICAL";

export interface StorageHealthInput {
  /** N-Go's own measured/estimated local footprint, in bytes. */
  nGoUsageBytes: number;
  /** The budget nGoUsageBytes is compared against — see computeNGoBudgetBytes() below. */
  nGoBudgetBytes: number;
  /** Real device free bytes, when known (native, once a working device-storage API exists —
   *  see deviceStorageCapability.ts; currently always null on native, see its doc comment).
   *  null means "unknown," never "zero" — a missing signal must not read as full-disk pressure. */
  deviceFreeBytes: number | null;
  /** Real device total bytes, when known. Needed only to compute a percentage from
   *  deviceFreeBytes; if this is null the percentage-based rules are skipped (see below). */
  deviceTotalBytes: number | null;
}

export interface StorageHealthResult {
  level: StorageHealthLevel;
  /** Which single signal produced the returned level (for UI copy / debugging), or "budget-only"
   *  when device-space signals were unavailable and only the N-Go budget ratio was evaluated. */
  drivenBy: "budget" | "device-percent" | "device-absolute" | "budget-only";
  nGoUsageRatio: number;
  deviceFreeRatio: number | null;
}

interface Thresholds {
  budgetRatio: number;
  /** The percentage-free rule is QUALIFIED (see the "Percentage guardrail" note below on
   *  computeStorageHealth) — this alone is never sufficient to escalate. */
  deviceFreeRatioMax: number;
  /** Guardrail for the percentage rule: it only applies when device free bytes ALSO fall at or
   *  under this absolute ceiling. Distinct from deviceFreeAbsoluteBytesMax, which is the
   *  independent, unqualified absolute-free-space rule below. */
  devicePercentGuardrailBytesMax: number;
  deviceFreeAbsoluteBytesMax: number;
}

/**
 * Owner-approved thresholds (do not silently tune — see the audit for why these values).
 *
 * Policy refinement (post-PR #369): percentage-free alone was found to over-escalate on
 * high-capacity devices — a 512 GB phone with 40 GB free (7.8%) read CRITICAL despite tens of
 * GB of real headroom. Percentage is a genuinely useful EARLY-PRESSURE signal on smaller/
 * constrained devices, but becomes misleading in isolation once a device is large enough that a
 * small percentage still represents a large absolute margin. The fix is NOT to drop percentage,
 * and NOT to loosen it into an OR with a big absolute number (that would just move the same
 * problem) — it is to QUALIFY it: the percentage rule for a tier only applies when device free
 * bytes ALSO fall at or under that tier's `devicePercentGuardrailBytesMax`. The independent
 * `deviceFreeAbsoluteBytesMax` rule (and the N-Go budget rule) remain plain, unqualified ORs —
 * only percentage gained a guardrail.
 */
const THRESHOLDS: Record<Exclude<StorageHealthLevel, "HEALTHY">, Thresholds> = {
  WARNING: {
    budgetRatio: 0.5,
    deviceFreeRatioMax: 0.15,
    devicePercentGuardrailBytesMax: 20 * 1024 ** 3,
    deviceFreeAbsoluteBytesMax: 5 * 1024 ** 3,
  },
  HIGH: {
    budgetRatio: 0.7,
    deviceFreeRatioMax: 0.1,
    devicePercentGuardrailBytesMax: 10 * 1024 ** 3,
    deviceFreeAbsoluteBytesMax: 2 * 1024 ** 3,
  },
  CRITICAL: {
    budgetRatio: 0.85,
    deviceFreeRatioMax: 0.05,
    devicePercentGuardrailBytesMax: 5 * 1024 ** 3,
    deviceFreeAbsoluteBytesMax: 1 * 1024 ** 3,
  },
};

const LEVEL_ORDER: StorageHealthLevel[] = ["HEALTHY", "WARNING", "HIGH", "CRITICAL"];
function worse(a: StorageHealthLevel, b: StorageHealthLevel): StorageHealthLevel {
  return LEVEL_ORDER.indexOf(a) >= LEVEL_ORDER.indexOf(b) ? a : b;
}

/**
 * N-Go's own storage budget, derived from device capacity rather than one fixed global number
 * (a fixed ceiling means the same absolute warning point on a 64GB phone and a 512GB phone,
 * which the audit found misleading either way). Formula, in order:
 *
 *   1. If device total capacity is known: budget = clamp(deviceTotalBytes * shareOfDevice,
 *      [floorBytes, ceilingBytes]) — a small, bounded share of the device, never above the
 *      ceiling even on very large devices, never below the floor even on very small ones.
 *   2. If device total capacity is UNKNOWN (the current native reality — see
 *      deviceStorageCapability.ts): fall back to a single fixed budget (fallbackBytes). This is
 *      explicitly a stopgap, not a tuned recommendation — it exists so the health computation
 *      still produces a meaningful ratio today, and should be replaced by the device-relative
 *      formula the moment a real deviceTotalBytes becomes available.
 *
 * Defaults: shareOfDevice = 5% of device capacity, floor = 2GB, ceiling = 20GB, fallback = 5GB
 * (fallback picked as a conservative middle value — not device-tuned, flagged here rather than
 * silently chosen without comment).
 */
export function computeNGoBudgetBytes(
  deviceTotalBytes: number | null,
  options?: { shareOfDevice?: number; floorBytes?: number; ceilingBytes?: number; fallbackBytes?: number },
): number {
  const shareOfDevice = options?.shareOfDevice ?? 0.05;
  const floorBytes = options?.floorBytes ?? 2 * 1024 ** 3;
  const ceilingBytes = options?.ceilingBytes ?? 20 * 1024 ** 3;
  const fallbackBytes = options?.fallbackBytes ?? 5 * 1024 ** 3;

  if (deviceTotalBytes == null || deviceTotalBytes <= 0) return fallbackBytes;
  const raw = deviceTotalBytes * shareOfDevice;
  return Math.min(ceilingBytes, Math.max(floorBytes, raw));
}

/**
 * Worst-signal-wins storage health. Unsynced/pending sync data is intentionally NOT a parameter
 * here — see the module doc comment. Any level derivable from real numbers takes priority over
 * "budget-only" degraded mode.
 */
/**
 * Phase 1H: whether a LARGE/FORCED download (uncapped byte/file prefetch — see
 * getBootstrapPrefetchLimits(force=true) in syncPolicy.ts) deserves a pre-download warning.
 * Deliberately does NOT gate uploading pending local work — see the module doc comment; this is
 * consulted only before the download portion of a forced sync, never before flushing the queue.
 */
export function shouldWarnBeforeForcedDownload(level: StorageHealthLevel): boolean {
  return level === "HIGH" || level === "CRITICAL";
}

export function computeStorageHealth(input: StorageHealthInput): StorageHealthResult {
  const nGoUsageRatio = input.nGoBudgetBytes > 0 ? input.nGoUsageBytes / input.nGoBudgetBytes : 0;
  const deviceFreeRatio =
    input.deviceFreeBytes != null && input.deviceTotalBytes != null && input.deviceTotalBytes > 0
      ? input.deviceFreeBytes / input.deviceTotalBytes
      : null;

  let level: StorageHealthLevel = "HEALTHY";
  let drivenBy: StorageHealthResult["drivenBy"] = deviceFreeRatio == null ? "budget-only" : "budget";

  for (const tier of ["WARNING", "HIGH", "CRITICAL"] as const) {
    const t = THRESHOLDS[tier];
    if (nGoUsageRatio >= t.budgetRatio) {
      level = worse(level, tier);
      if (level === tier) drivenBy = deviceFreeRatio == null ? "budget-only" : "budget";
    }
    // Percentage guardrail: the percentage-free rule ALONE is not sufficient to escalate — it
    // only applies when device free bytes are ALSO at or under this tier's absolute guardrail
    // (see the THRESHOLDS doc comment). This is an AND with the guardrail, never an OR.
    if (
      deviceFreeRatio != null &&
      deviceFreeRatio <= t.deviceFreeRatioMax &&
      input.deviceFreeBytes != null &&
      input.deviceFreeBytes <= t.devicePercentGuardrailBytesMax
    ) {
      level = worse(level, tier);
      if (level === tier) drivenBy = "device-percent";
    }
    // Independent absolute-free-space rule — unqualified, unchanged from before this refinement.
    if (input.deviceFreeBytes != null && input.deviceFreeBytes <= t.deviceFreeAbsoluteBytesMax) {
      level = worse(level, tier);
      if (level === tier) drivenBy = "device-absolute";
    }
  }

  return { level, drivenBy, nGoUsageRatio, deviceFreeRatio };
}
