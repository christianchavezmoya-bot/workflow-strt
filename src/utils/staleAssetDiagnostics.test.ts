import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/offlineStore", () => ({
  default: {
    saveCache: vi.fn().mockResolvedValue(undefined),
    getCache: vi.fn(),
  },
}));

vi.mock("./platform", () => ({
  isMobileNativePlatform: vi.fn(() => true),
}));

import offlineStore from "../services/offlineStore";
import { isMobileNativePlatform } from "./platform";
import type { DashboardWorkspace, DashboardWorkspaceAssetItem } from "../services/projectAssetService";
import {
  buildReconcileTrace,
  getStaleAssetFetchTrace,
  getStaleAssetReconcileTrace,
  recordFetchAttempt,
  recordReconcilePass,
  type StaleAssetFetchAttempt,
  type StaleAssetReconcilePass,
} from "./staleAssetDiagnostics";

const RECONCILE_KEY = "stale-asset-reconcile-trace";
const FETCH_KEY = "stale-asset-fetch-trace";

function item(id: string): DashboardWorkspaceAssetItem {
  return {
    id,
    projectId: "proj-1",
    jobNumber: "J-1",
    status: "InProgress",
    historyStatus: "Current",
    completedSteps: 0,
    totalSteps: 3,
    missingItems: 0,
    workflowMode: "Install",
    isDeleted: false,
    hasOpenIssues: false,
  };
}

function workspace(overrides: Partial<DashboardWorkspace> = {}): DashboardWorkspace {
  return {
    currentInstalls: [],
    currentInspections: [],
    installHistory: [],
    inspectionHistory: [],
    ...overrides,
  };
}

/** Last value written to a given cache key. */
function lastSavedFor<T>(key: string): T {
  const calls = vi.mocked(offlineStore.saveCache).mock.calls.filter(([k]) => k === key);
  return calls[calls.length - 1][1] as T;
}

describe("staleAssetDiagnostics — reconciliation trace", () => {
  beforeEach(() => {
    vi.mocked(offlineStore.saveCache).mockClear().mockResolvedValue(undefined);
    vi.mocked(offlineStore.getCache).mockReset().mockResolvedValue(undefined);
    vi.mocked(isMobileNativePlatform).mockReturnValue(true);
  });

  // Required test #8
  it("traces an asset that was known-missing, came back in the workspace, and had its marker cleared", async () => {
    const ws = workspace({ currentInstalls: [item("ghost-1")] });
    const preTrace = buildReconcileTrace(["ghost-1"], ws);

    expect(preTrace).toEqual([
      { assetId: "ghost-1", presentInWorkspace: true, workspaceSection: "currentInstalls" },
    ]);

    // Simulates the real reconcile having cleared the marker for ghost-1.
    await recordReconcilePass("dashboardWorkspace", preTrace, () => false);

    const saved = lastSavedFor<StaleAssetReconcilePass[]>(RECONCILE_KEY);
    expect(saved).toHaveLength(1);
    expect(saved[0].source).toBe("dashboardWorkspace");
    expect(saved[0].ids[0]).toEqual({
      assetId: "ghost-1",
      knownMissingBefore: true,
      presentInWorkspace: true,
      workspaceSection: "currentInstalls",
      knownMissingAfter: false,
      markerCleared: true,
    });
  });

  // Required test #9
  it("keeps an asset marked known-missing when it did not come back in the workspace", async () => {
    const ws = workspace({ currentInstalls: [item("live-1")] });
    const preTrace = buildReconcileTrace(["ghost-2"], ws);

    expect(preTrace).toEqual([
      { assetId: "ghost-2", presentInWorkspace: false, workspaceSection: undefined },
    ]);

    // Real reconcile leaves it missing, so the guard still reports it missing.
    await recordReconcilePass("dashboardWorkspace", preTrace, () => true);

    const saved = lastSavedFor<StaleAssetReconcilePass[]>(RECONCILE_KEY);
    expect(saved[0].ids[0]).toMatchObject({
      assetId: "ghost-2",
      knownMissingBefore: true,
      presentInWorkspace: false,
      knownMissingAfter: true,
      markerCleared: false,
    });
    expect(saved[0].ids[0].workspaceSection).toBeUndefined();
  });

  it("identifies which workspace section an id reappeared in", () => {
    const ws = workspace({
      currentInspections: [item("b")],
      installHistory: [item("c")],
      inspectionHistory: [item("d")],
    });
    const trace = buildReconcileTrace(["a", "b", "c", "d"], ws);
    expect(trace.map((t) => t.workspaceSection)).toEqual([
      undefined,
      "currentInspections",
      "installHistory",
      "inspectionHistory",
    ]);
  });

  it("writes nothing when there are no known-missing ids to reconcile", async () => {
    await recordReconcilePass("dashboardWorkspace", []);
    expect(offlineStore.saveCache).not.toHaveBeenCalled();
  });

  it("never throws when the trace cannot be written", async () => {
    vi.mocked(offlineStore.saveCache).mockRejectedValue(new Error("quota exceeded"));
    const preTrace = buildReconcileTrace(["ghost-1"], workspace());
    await expect(recordReconcilePass("dashboardWorkspace", preTrace, () => true)).resolves.toBeUndefined();
  });
});

describe("staleAssetDiagnostics — fetch trace", () => {
  beforeEach(() => {
    // Back the mock with a real in-memory store so append semantics across
    // successive calls behave the way they do against offlineStore on device.
    const store = new Map<string, unknown>();
    vi.mocked(offlineStore.saveCache).mockClear().mockImplementation(async (key: string, data: unknown) => {
      store.set(key, data);
    });
    vi.mocked(offlineStore.getCache).mockReset().mockImplementation(async (key: string) => store.get(key) ?? null);
    vi.mocked(isMobileNativePlatform).mockReturnValue(true);
  });

  // Required test #10
  it("records whether the id was already known-missing at the time of the fetch", async () => {
    await recordFetchAttempt("asset-1", false, "getById");
    await recordFetchAttempt("ghost-1", true, "verifyAssetExistsOnline");

    const saved = lastSavedFor<StaleAssetFetchAttempt[]>(FETCH_KEY);
    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject({
      assetId: "asset-1",
      knownMissingAtCallTime: false,
      source: "getById",
    });
    expect(saved[1]).toMatchObject({
      assetId: "ghost-1",
      knownMissingAtCallTime: true,
      source: "verifyAssetExistsOnline",
    });
    expect(saved[0].timestamp).toBeTruthy();
  });

  it("captures no request, response, or asset content", async () => {
    await recordFetchAttempt("asset-1", false, "getById");
    const saved = lastSavedFor<StaleAssetFetchAttempt[]>(FETCH_KEY);
    expect(Object.keys(saved[0]).sort()).toEqual([
      "assetId",
      "knownMissingAtCallTime",
      "source",
      "timestamp",
    ]);
  });

  it("never throws when the fetch trace cannot be written", async () => {
    vi.mocked(offlineStore.saveCache).mockRejectedValue(new Error("db closed"));
    await expect(recordFetchAttempt("asset-1", false, "getById")).resolves.toBeUndefined();
  });
});

describe("staleAssetDiagnostics — bounds and platform gating", () => {
  beforeEach(() => {
    vi.mocked(offlineStore.saveCache).mockClear().mockResolvedValue(undefined);
    vi.mocked(offlineStore.getCache).mockReset().mockResolvedValue(undefined);
    vi.mocked(isMobileNativePlatform).mockReturnValue(true);
  });

  // Required test #11
  it("caps the reconcile history at the 10 most recent passes", async () => {
    const existing: StaleAssetReconcilePass[] = Array.from({ length: 10 }, (_, i) => ({
      timestamp: `2026-01-01T00:0${i}:00.000Z`,
      source: `pass-${i}`,
      ids: [],
    }));
    vi.mocked(offlineStore.getCache).mockResolvedValue(existing);

    await recordReconcilePass("newest-pass", buildReconcileTrace(["ghost-1"], workspace()), () => true);

    const saved = lastSavedFor<StaleAssetReconcilePass[]>(RECONCILE_KEY);
    expect(saved).toHaveLength(10);
    expect(saved[0].source).toBe("pass-1"); // oldest dropped
    expect(saved[9].source).toBe("newest-pass");
  });

  // Required test #11 (fetch history)
  it("caps the fetch history at the 100 most recent attempts", async () => {
    const existing: StaleAssetFetchAttempt[] = Array.from({ length: 100 }, (_, i) => ({
      timestamp: "2026-01-01T00:00:00.000Z",
      assetId: `asset-${i}`,
      knownMissingAtCallTime: false,
      source: "getById",
    }));
    vi.mocked(offlineStore.getCache).mockResolvedValue(existing);

    await recordFetchAttempt("asset-newest", false, "getById");

    const saved = lastSavedFor<StaleAssetFetchAttempt[]>(FETCH_KEY);
    expect(saved).toHaveLength(100);
    expect(saved[0].assetId).toBe("asset-1"); // oldest dropped
    expect(saved[99].assetId).toBe("asset-newest");
  });

  it("is native-only — web never writes or reads these traces", async () => {
    vi.mocked(isMobileNativePlatform).mockReturnValue(false);
    await recordFetchAttempt("asset-1", false, "getById");
    await recordReconcilePass("dashboardWorkspace", buildReconcileTrace(["ghost-1"], workspace()), () => true);
    expect(offlineStore.saveCache).not.toHaveBeenCalled();
    expect(await getStaleAssetFetchTrace()).toEqual([]);
    expect(await getStaleAssetReconcileTrace()).toEqual([]);
  });

  it("returns empty arrays rather than throwing when traces cannot be read", async () => {
    vi.mocked(offlineStore.getCache).mockRejectedValue(new Error("db closed"));
    expect(await getStaleAssetReconcileTrace()).toEqual([]);
    expect(await getStaleAssetFetchTrace()).toEqual([]);
  });
});
