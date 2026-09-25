/**
 * Support bundle integration for the observability-only sync diagnostics.
 * Verifies the new sections are present AND that nothing pre-existing
 * (buildIdentity, URL sanitization) regressed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingAction } from "./localDB";

const pendingRows: PendingAction[] = [];

vi.mock("./localDB", () => ({
  pendingGetAll: vi.fn(async () => pendingRows),
  droppedActionsGetAll: vi.fn(async () => []),
}));

vi.mock("./offlineBootstrapService", () => ({
  default: { getStatus: vi.fn(async () => null) },
}));

vi.mock("./syncDiagnosticsLog", () => ({
  syncDiagnosticList: vi.fn(async () => []),
}));

vi.mock("./pendingMediaIntegrity", () => ({
  checkPendingMediaIntegrity: vi.fn(async () => []),
}));

vi.mock("./connectivityMonitor", () => ({
  getServerReachable: vi.fn(() => true),
}));

vi.mock("./offlineModeState", () => ({
  isManualOfflineModeActive: vi.fn(() => false),
}));

vi.mock("./secureStorage", () => ({
  secureGet: vi.fn(() => null),
}));

vi.mock("../utils/platform", () => ({
  isMobileNativePlatform: vi.fn(() => true),
}));

vi.mock("../utils/offlinePerf", () => ({
  getOfflinePerfLog: vi.fn(() => []),
}));

vi.mock("./flushPassDiagnostics", () => ({
  getLastFlushPassDiagnostic: vi.fn(),
}));

vi.mock("../utils/circuitBreaker", () => ({
  isCircuitOpen: vi.fn(() => true),
  getCircuitOpenUntilMs: vi.fn(() => 1_767_225_600_000),
  getCircuitFailureCount: vi.fn(() => 4),
}));

vi.mock("../utils/staleAssetIds", () => ({
  getKnownMissingAssetIdsSnapshot: vi.fn(() => ["ghost-1", "ghost-2"]),
}));

vi.mock("../utils/staleAssetDiagnostics", () => ({
  getStaleAssetReconcileTrace: vi.fn(async () => []),
  getStaleAssetFetchTrace: vi.fn(async () => []),
}));

import { buildSyncSupportBundle } from "./syncSupportBundleService";
import { getLastFlushPassDiagnostic, type FlushPassDiagnostic } from "./flushPassDiagnostics";
import { getStaleAssetFetchTrace, getStaleAssetReconcileTrace } from "../utils/staleAssetDiagnostics";
import { isMobileNativePlatform } from "../utils/platform";

const lastFlushPass: FlushPassDiagnostic = {
  timestamp: "2026-09-25T02:00:00.000Z",
  canAttemptSyncFlush: true,
  serverReachable: false,
  hasNetworkSignal: true,
  circuitOpen: true,
  circuitOpenUntilMs: 1_767_225_600_000,
  circuitFailureCount: 4,
  dueCount: 2,
  due: [
    { id: "a1", opType: "RUN_COMPLETE", entityId: "run-1", entityType: "workflow-run", status: "pending" },
    { id: "a2", opType: "SIGNATURE_SUBMIT", entityId: "run-1", entityType: "workflow-run", status: "pending" },
  ],
  attemptedCount: 1,
  syncedCount: 0,
  stoppedEarly: true,
  stoppedAtActionId: "a1",
  stoppedReason: "NETWORK_ERROR_BROKE_LOOP:RUN_COMPLETE",
};

function pendingAction(overrides: Partial<PendingAction> = {}): PendingAction {
  return {
    id: "a1",
    url: "/asset-workflow-runs/run-1/complete?token=super-secret-value",
    method: "POST",
    body: { stepResultsJson: "[{\"photo\":\"data:image/jpeg;base64,AAAA\"}]" },
    entityType: "workflow-run",
    entityId: "run-1",
    optimisticPatch: { status: "Completed" },
    createdAt: "2026-09-25T01:00:00.000Z",
    retries: 2,
    status: "failed",
    opType: "RUN_COMPLETE",
    lastEligibilityCheckAt: "2026-09-25T02:00:00.000Z",
    lastEligible: false,
    lastSkipReason: "DEPENDENCY_PENDING",
    lastDependencyExists: true,
    lastDependencyOpType: "TIME_ENTRY",
    lastDependencyStatus: "pending",
    lastBundleCandidate: false,
    ...overrides,
  };
}

describe("buildSyncSupportBundle — observability diagnostics", () => {
  beforeEach(() => {
    pendingRows.length = 0;
    vi.mocked(isMobileNativePlatform).mockReturnValue(true);
    vi.mocked(getLastFlushPassDiagnostic).mockResolvedValue(lastFlushPass);
    vi.mocked(getStaleAssetReconcileTrace).mockResolvedValue([
      {
        timestamp: "2026-09-25T02:00:00.000Z",
        source: "dashboardWorkspace",
        ids: [{
          assetId: "ghost-1",
          knownMissingBefore: true,
          presentInWorkspace: true,
          workspaceSection: "currentInstalls",
          knownMissingAfter: false,
          markerCleared: true,
        }],
      },
    ]);
    vi.mocked(getStaleAssetFetchTrace).mockResolvedValue([
      {
        timestamp: "2026-09-25T02:00:00.000Z",
        assetId: "ghost-1",
        knownMissingAtCallTime: true,
        source: "getById",
      },
    ]);
  });

  // Required test #12
  it("includes the circuit breaker, last flush pass, known-missing ids, and stale-asset traces", async () => {
    const bundle = await buildSyncSupportBundle();

    expect(bundle.circuitBreaker).toEqual({
      open: true,
      openUntilMs: 1_767_225_600_000,
      failureCount: 4,
    });
    expect(bundle.lastFlushPass?.stoppedReason).toBe("NETWORK_ERROR_BROKE_LOOP:RUN_COMPLETE");
    expect(bundle.lastFlushPass?.stoppedAtActionId).toBe("a1");
    expect(bundle.lastFlushPass?.due.map((d) => d.id)).toEqual(["a1", "a2"]);
    expect(bundle.knownMissingAssetIds).toEqual(["ghost-1", "ghost-2"]);
    expect(bundle.staleAssetReconcileTrace?.[0].ids[0].markerCleared).toBe(true);
    expect(bundle.staleAssetFetchTrace?.[0]).toMatchObject({
      assetId: "ghost-1",
      knownMissingAtCallTime: true,
      source: "getById",
    });
  });

  // Required test #12 (per-action eligibility fields reach the bundle)
  it("includes per-action queue eligibility fields via the existing allowlist", async () => {
    pendingRows.push(pendingAction());
    const bundle = await buildSyncSupportBundle();

    const row = bundle.pendingActions[0];
    expect(row.lastEligible).toBe(false);
    expect(row.lastSkipReason).toBe("DEPENDENCY_PENDING");
    expect(row.lastEligibilityCheckAt).toBe("2026-09-25T02:00:00.000Z");
    expect(row.lastDependencyExists).toBe(true);
    expect(row.lastDependencyOpType).toBe("TIME_ENTRY");
    expect(row.lastDependencyStatus).toBe("pending");
    expect(row.lastBundleCandidate).toBe(false);
  });

  // Required test #13
  it("still sanitizes sensitive URL query values and omits request bodies", async () => {
    pendingRows.push(pendingAction());
    const bundle = await buildSyncSupportBundle();

    const row = bundle.pendingActions[0];
    expect(String(row.url)).not.toContain("super-secret-value");
    expect(String(row.url)).toContain("/asset-workflow-runs/run-1/complete");
    // No payload content anywhere in the row.
    expect(row.body).toBeUndefined();
    expect(row.optimisticPatch).toBeUndefined();

    const serialized = JSON.stringify(bundle);
    expect(serialized).not.toContain("super-secret-value");
    expect(serialized).not.toContain("data:image/jpeg;base64");
  });

  // Required test #14
  it("still reports the client build identity", async () => {
    const bundle = await buildSyncSupportBundle();
    expect(bundle.buildIdentity).toBeDefined();
    expect(bundle.buildIdentity.appVersion).toBeTruthy();
    expect(bundle.buildIdentity.platform).toBe("native");
    expect(bundle.appVersion).toBe(bundle.buildIdentity.appVersion);
    expect(bundle.schemaVersion).toBe(2);
  });

  it("tolerates an empty diagnostic history without failing the bundle", async () => {
    vi.mocked(getLastFlushPassDiagnostic).mockResolvedValue(null);
    vi.mocked(getStaleAssetReconcileTrace).mockResolvedValue([]);
    vi.mocked(getStaleAssetFetchTrace).mockResolvedValue([]);

    const bundle = await buildSyncSupportBundle();
    expect(bundle.lastFlushPass).toBeNull();
    expect(bundle.staleAssetReconcileTrace).toEqual([]);
    expect(bundle.staleAssetFetchTrace).toEqual([]);
  });

  describe("native-only contract", () => {
    // Review fix: circuitBreaker/knownMissingAssetIds were previously emitted
    // unconditionally while lastFlushPass/stale traces were already
    // native-gated by their readers — an inconsistent contract that
    // contradicted docs/SYNC_OBSERVABILITY_DIAGNOSTICS.md's "native-only"
    // claim. All five mobile/offline diagnostic fields must now agree.
    it("includes all five mobile/offline diagnostic fields on native", async () => {
      const bundle = await buildSyncSupportBundle();
      expect(bundle.circuitBreaker).toEqual({ open: true, openUntilMs: 1_767_225_600_000, failureCount: 4 });
      expect(bundle.lastFlushPass).not.toBeUndefined();
      expect(bundle.knownMissingAssetIds).toEqual(["ghost-1", "ghost-2"]);
      expect(bundle.staleAssetReconcileTrace).not.toBeUndefined();
      expect(bundle.staleAssetFetchTrace).not.toBeUndefined();
    });

    it("omits all five mobile/offline diagnostic fields on web", async () => {
      vi.mocked(isMobileNativePlatform).mockReturnValue(false);

      const bundle = await buildSyncSupportBundle();
      expect(bundle.circuitBreaker).toBeUndefined();
      expect(bundle.lastFlushPass).toBeUndefined();
      expect(bundle.knownMissingAssetIds).toBeUndefined();
      expect(bundle.staleAssetReconcileTrace).toBeUndefined();
      expect(bundle.staleAssetFetchTrace).toBeUndefined();

      // Pre-existing, non-diagnostic fields must be completely unaffected.
      expect(bundle.platform).toBe("web");
      expect(bundle.schemaVersion).toBe(2);
      expect(bundle.buildIdentity).toBeDefined();
      expect(bundle.summary).toBeDefined();
      expect(bundle.pendingActions).toEqual([]);
      expect(bundle.droppedActions).toEqual([]);
    });

    it("omitted web fields do not appear as literal keys in the serialized bundle", async () => {
      vi.mocked(isMobileNativePlatform).mockReturnValue(false);
      const bundle = await buildSyncSupportBundle();
      // JSON.stringify drops keys whose value is `undefined` — this proves
      // the fields are truly omitted, not sent as an explicit null.
      const serialized = JSON.stringify(bundle);
      for (const key of ["circuitBreaker", "lastFlushPass", "knownMissingAssetIds", "staleAssetReconcileTrace", "staleAssetFetchTrace"]) {
        expect(JSON.parse(serialized)).not.toHaveProperty(key);
      }
    });
  });
});
