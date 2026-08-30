/**
 * Regression tests for stale asset 404 handling (native offline-first).
 *
 * A  — one authoritative 404 on first encounter
 * B  — durably removed from assets store + dashboard-workspace cache
 * C  — same session: no repeat GET after mark
 * D  — after restart: hydrate restores missing-id guard
 * E  — network/timeout errors do not purge valid local assets
 * F1 — 404 + asset.dirty=true → asset row retained
 * F2 — 404 + pending action targeting the asset → asset row retained
 * F3 — 404 + pending action targeting one of the asset's runs (media/time/issue/
 *      signature/step-results are all bundled into run mutations) → retained
 * F4 — background prefetch still stops requesting it despite the retained row
 * G  — normal valid asset: assignments/runs still prefetch as before
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

vi.mock("../utils/platform", () => ({
  isMobileNativePlatform: vi.fn(() => true),
}));

vi.mock("./connectivityMonitor", () => ({
  shouldSkipBlockingFetch: vi.fn(() => false),
  shouldSkipRunMutation: vi.fn(() => false),
}));

vi.mock("./localDB", () => ({
  entityGetAsset: vi.fn(),
  entityPutAsset: vi.fn().mockResolvedValue(undefined),
  entityDeleteAsset: vi.fn().mockResolvedValue(undefined),
  entityGetAllAssets: vi.fn(),
  entityGetAllProjects: vi.fn(),
  entityGetWorkflowRunsByAsset: vi.fn().mockResolvedValue([]),
  pendingGetAll: vi.fn().mockResolvedValue([]),
  pendingMarkConflict: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./offlineStore", () => ({
  default: {
    getCache: vi.fn(),
    saveCache: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("./api", () => ({
  default: { get: vi.fn() },
}));

import api from "./api";
import offlineStore from "./offlineStore";
import {
  entityDeleteAsset,
  entityGetAsset,
  entityGetWorkflowRunsByAsset,
  pendingGetAll,
  pendingMarkConflict,
} from "./localDB";
import { projectAssetService } from "./projectAssetService";
import {
  hydrateKnownMissingAssetIds,
  isKnownMissingAssetId,
  resetKnownMissingAssetIdsForTests,
} from "../utils/staleAssetIds";
import { purgeStaleAssetOnAuthoritative404 } from "../utils/staleAssetPurge";
import { prefetchAssetWorkflowData } from "./assetPrefetchService";
import { assetWorkflowAssignmentService } from "./assetWorkflowAssignmentService";
import { assetWorkflowRunService } from "./assetWorkflowRunService";

vi.mock("./assetWorkflowAssignmentService", () => ({
  assetWorkflowAssignmentService: { listByAsset: vi.fn().mockResolvedValue([]) },
}));
vi.mock("./assetWorkflowRunService", () => ({
  assetWorkflowRunService: { listByAssetFresh: vi.fn().mockResolvedValue([]) },
}));
vi.mock("./assetDocumentLinkService", () => ({
  assetDocumentLinkService: { listByAsset: vi.fn().mockResolvedValue([]) },
}));
vi.mock("./documentService", () => ({
  prefetchAssetLinkedDocuments: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./workflowConfigService", () => ({
  workflowConfigService: { getById: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../utils/nativeReconnectCoordinator", () => ({
  shouldDeferPerAssetBackgroundRefresh: vi.fn(() => false),
}));
vi.mock("../utils/bootstrapFreshness", () => ({
  clearServerChangeFlag: vi.fn().mockResolvedValue(undefined),
}));

describe("stale asset persistence regressions", () => {
  beforeEach(() => {
    resetKnownMissingAssetIdsForTests();
    vi.mocked(entityGetAsset).mockReset();
    vi.mocked(entityDeleteAsset).mockClear();
    vi.mocked(entityGetWorkflowRunsByAsset).mockReset().mockResolvedValue([]);
    vi.mocked(pendingGetAll).mockReset().mockResolvedValue([]);
    vi.mocked(pendingMarkConflict).mockClear();
    vi.mocked(api.get).mockReset();
    vi.mocked(offlineStore.getCache).mockReset();
    vi.mocked(offlineStore.saveCache).mockClear();
    vi.mocked(assetWorkflowAssignmentService.listByAsset).mockClear().mockResolvedValue([]);
    vi.mocked(assetWorkflowRunService.listByAssetFresh).mockClear().mockResolvedValue([]);
  });

  it("A — getById returns null once on authoritative 404 and marks missing", async () => {
    vi.mocked(entityGetAsset).mockResolvedValue(null);
    vi.mocked(api.get).mockRejectedValue({ isAxiosError: true, response: { status: 404 } });
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);

    const first = await projectAssetService.getById("ghost-1");
    const second = await projectAssetService.getById("ghost-1");

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(isKnownMissingAssetId("ghost-1")).toBe(true);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("B — authoritative 404 purge drops asset row and workspace cache entry", async () => {
    vi.mocked(offlineStore.getCache).mockResolvedValue({
      currentInstalls: [{ id: "ghost-1", projectId: "p1" }],
      currentInspections: [],
      installHistory: [],
      inspectionHistory: [],
    });

    await purgeStaleAssetOnAuthoritative404("ghost-1", "user-1");

    expect(entityDeleteAsset).toHaveBeenCalledWith("ghost-1");
    expect(offlineStore.saveCache).toHaveBeenCalledWith(
      "dashboard-workspace:user-1",
      expect.objectContaining({ currentInstalls: [] }),
    );
  });

  it("C — verifyAssetExistsOnline skips repeat GET when already known missing", async () => {
    await purgeStaleAssetOnAuthoritative404("ghost-1", "user-1");
    vi.mocked(api.get).mockClear();

    const exists = await projectAssetService.verifyAssetExistsOnline("ghost-1");

    expect(exists).toBe(false);
    expect(api.get).not.toHaveBeenCalled();
  });

  it("D — hydrateKnownMissingAssetIds restores guard across app restart", async () => {
    vi.mocked(offlineStore.getCache).mockResolvedValue(["ghost-1", "ghost-2"]);

    await hydrateKnownMissingAssetIds();

    expect(isKnownMissingAssetId("ghost-1")).toBe(true);
    expect(isKnownMissingAssetId("ghost-2")).toBe(true);
  });

  it("E — network error during verify preserves local asset (no purge)", async () => {
    vi.mocked(entityGetAsset).mockResolvedValue({
      id: "live-1",
      productId: "prod-1",
      projectId: "p1",
      data: { id: "live-1", productId: "prod-1", projectId: "p1" },
      dirty: false,
    });
    vi.mocked(api.get).mockRejectedValue(new Error("Network Error"));
    vi.spyOn(axios, "isAxiosError").mockReturnValue(false);

    const exists = await projectAssetService.verifyAssetExistsOnline("live-1");

    expect(exists).toBe(true);
    expect(entityDeleteAsset).not.toHaveBeenCalled();
    expect(isKnownMissingAssetId("live-1")).toBe(false);
  });

  it("F1 — 404 + asset.dirty=true retains the local asset row", async () => {
    vi.mocked(entityGetAsset).mockResolvedValue({
      id: "dirty-1",
      productId: "prod-1",
      projectId: "p1",
      data: { id: "dirty-1", productId: "prod-1", projectId: "p1" },
      dirty: true,
    });

    await purgeStaleAssetOnAuthoritative404("dirty-1", "user-1");

    expect(entityDeleteAsset).not.toHaveBeenCalled();
    // saveCache IS called to persist the known-missing-id set itself (stops
    // background GETs) — it must NOT be called to strip the workspace cache.
    expect(offlineStore.saveCache).not.toHaveBeenCalledWith(
      "dashboard-workspace:user-1",
      expect.anything(),
    );
    expect(isKnownMissingAssetId("dirty-1")).toBe(true); // background GETs still stop
  });

  it("F2 — 404 + pending action targeting the asset directly retains the row and flags the action", async () => {
    const op = {
      id: "op-1",
      entityId: "asset-2",
      entityType: "asset",
      url: "/project-assets/asset-2",
      method: "PATCH",
      body: {},
      optimisticPatch: {},
      createdAt: new Date().toISOString(),
      retries: 0,
      status: "pending",
    };
    vi.mocked(pendingGetAll).mockResolvedValue([op] as never);

    await purgeStaleAssetOnAuthoritative404("asset-2", "user-1");

    expect(entityDeleteAsset).not.toHaveBeenCalled();
    expect(pendingMarkConflict).toHaveBeenCalledWith(
      "op-1",
      expect.objectContaining({ conflictHttpStatus: 404, conflictKind: "business_rule" }),
    );
    expect(isKnownMissingAssetId("asset-2")).toBe(true);
  });

  it("F3 — 404 + pending action targeting one of the asset's runs retains the row (media/time/issue/signature/step-results all queue this way)", async () => {
    vi.mocked(entityGetWorkflowRunsByAsset).mockResolvedValue([
      { id: "run-9", assetId: "asset-3", dirty: false },
    ] as never);
    const op = {
      id: "op-2",
      entityId: "run-9",
      entityType: "workflow-run",
      url: "/asset-workflow-runs/run-9/capture-cell",
      method: "PATCH",
      body: {},
      optimisticPatch: {},
      createdAt: new Date().toISOString(),
      retries: 0,
      status: "pending",
    };
    vi.mocked(pendingGetAll).mockResolvedValue([op] as never);

    await purgeStaleAssetOnAuthoritative404("asset-3", "user-1");

    expect(entityDeleteAsset).not.toHaveBeenCalled();
    expect(pendingMarkConflict).toHaveBeenCalledWith("op-2", expect.objectContaining({ conflictHttpStatus: 404 }));
  });

  it("F4 — background prefetch does not re-request an asset retained for recovery", async () => {
    vi.mocked(entityGetAsset).mockResolvedValue({
      id: "dirty-4",
      productId: "prod-1",
      projectId: "p1",
      data: { id: "dirty-4", productId: "prod-1", projectId: "p1" },
      dirty: true,
    });
    await purgeStaleAssetOnAuthoritative404("dirty-4", "user-1");
    expect(entityDeleteAsset).not.toHaveBeenCalled(); // row intentionally retained

    vi.mocked(api.get).mockClear();
    await prefetchAssetWorkflowData("dirty-4");

    expect(api.get).not.toHaveBeenCalled();
    expect(assetWorkflowAssignmentService.listByAsset).not.toHaveBeenCalled();
    expect(assetWorkflowRunService.listByAssetFresh).not.toHaveBeenCalled();
  });

  it("G — normal valid asset still prefetches assignments and runs", async () => {
    vi.mocked(entityGetAsset).mockResolvedValue({
      id: "live-2",
      productId: "prod-1",
      projectId: "p1",
      data: { id: "live-2", productId: "prod-1", projectId: "p1" },
      dirty: false,
    });
    vi.mocked(api.get).mockResolvedValue({
      data: { id: "live-2", productId: "prod-1", projectId: "p1" },
    });
    vi.spyOn(axios, "isAxiosError").mockReturnValue(false);

    await prefetchAssetWorkflowData("live-2");

    expect(assetWorkflowAssignmentService.listByAsset).toHaveBeenCalledWith("live-2");
    expect(assetWorkflowRunService.listByAssetFresh).toHaveBeenCalledWith("live-2");
    expect(entityDeleteAsset).not.toHaveBeenCalled();
    expect(isKnownMissingAssetId("live-2")).toBe(false);
  });
});
