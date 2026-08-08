import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardWorkspace } from "./projectAssetService";

vi.mock("../utils/platform", () => ({
  isMobileNativePlatform: vi.fn(() => true),
}));

vi.mock("./offlineStore", () => ({
  default: {
    getCache: vi.fn(),
    saveCache: vi.fn(),
  },
}));

vi.mock("./localDB", () => ({
  entityGetAllAssets: vi.fn(),
  entityGetAllProjects: vi.fn(),
  entityGetAsset: vi.fn(),
  entityGetWorkflowRunsByAsset: vi.fn(),
}));

import offlineStore from "./offlineStore";
import { entityGetAllAssets, entityGetAllProjects, entityGetWorkflowRunsByAsset } from "./localDB";
import { isMobileNativePlatform } from "../utils/platform";
import { projectAssetService } from "./projectAssetService";

const snapshotWorkspace: DashboardWorkspace = {
  currentInstalls: [{
    id: "new-1",
    projectId: "p1",
    jobNumber: "JO1",
    assetTag: "NEW-001",
    status: "NotStarted",
    historyStatus: "NotStarted",
    completedSteps: 0,
    totalSteps: 10,
    missingItems: 0,
    workflowMode: "INSTALLATION_ONLY",
    isDeleted: false,
    hasOpenIssues: false,
    assignedUserId: "user-1",
  }],
  currentInspections: [],
  installHistory: [],
  inspectionHistory: [],
};

describe("dashboardWorkspaceOfflineFirst", () => {
  beforeEach(() => {
    vi.mocked(isMobileNativePlatform).mockReturnValue(true);
    vi.mocked(offlineStore.getCache).mockReset();
    vi.mocked(entityGetAllAssets).mockReset();
    vi.mocked(entityGetAllProjects).mockReset();
    vi.mocked(entityGetWorkflowRunsByAsset).mockReset();
  });

  it("returns persisted workspace snapshot when available", async () => {
    vi.mocked(offlineStore.getCache).mockResolvedValue(snapshotWorkspace);

    const result = await projectAssetService.dashboardWorkspaceOfflineFirst("user-1");

    expect(offlineStore.getCache).toHaveBeenCalledWith("dashboard-workspace:user-1");
    expect(result.currentInstalls).toHaveLength(1);
    expect(result.currentInstalls[0]?.id).toBe("new-1");
    expect(entityGetAllAssets).not.toHaveBeenCalled();
  });

  it("falls back to entity rebuild when snapshot is missing", async () => {
    vi.mocked(offlineStore.getCache).mockResolvedValue(null);
    vi.mocked(entityGetAllProjects).mockResolvedValue([{ id: "p1", jobNumber: "JO1" }]);
    vi.mocked(entityGetAllAssets).mockResolvedValue([{
      id: "old-1",
      projectId: "p1",
      productId: "prod-1",
      assetTag: "OLD-001",
      status: "Paused",
      assignedUserId: "user-1",
      workflowSummary: { latestRunStatus: "Paused", requiredItems: 5, completedItems: 2 },
    }]);
    vi.mocked(entityGetWorkflowRunsByAsset).mockResolvedValue([]);

    const result = await projectAssetService.dashboardWorkspaceOfflineFirst("user-1");

    expect(entityGetAllAssets).toHaveBeenCalled();
    expect(result.currentInstalls).toHaveLength(1);
    expect(result.currentInstalls[0]?.id).toBe("old-1");
  });

  it("falls back to entity rebuild when snapshot is empty", async () => {
    vi.mocked(offlineStore.getCache).mockResolvedValue({
      currentInstalls: [],
      currentInspections: [],
      installHistory: [],
      inspectionHistory: [],
    });
    vi.mocked(entityGetAllProjects).mockResolvedValue([]);
    vi.mocked(entityGetAllAssets).mockResolvedValue([]);
    vi.mocked(entityGetWorkflowRunsByAsset).mockResolvedValue([]);

    const result = await projectAssetService.dashboardWorkspaceOfflineFirst("user-1");

    expect(entityGetAllAssets).toHaveBeenCalled();
    expect(result.currentInstalls).toHaveLength(0);
  });

  it("skips snapshot lookup when userId is undefined (org-wide view)", async () => {
    vi.mocked(entityGetAllProjects).mockResolvedValue([]);
    vi.mocked(entityGetAllAssets).mockResolvedValue([]);
    vi.mocked(entityGetWorkflowRunsByAsset).mockResolvedValue([]);

    await projectAssetService.dashboardWorkspaceOfflineFirst(undefined);

    expect(offlineStore.getCache).not.toHaveBeenCalled();
    expect(entityGetAllAssets).toHaveBeenCalled();
  });

  it("returns empty workspace on web", async () => {
    vi.mocked(isMobileNativePlatform).mockReturnValue(false);

    const result = await projectAssetService.dashboardWorkspaceOfflineFirst("user-1");

    expect(result).toEqual({
      currentInstalls: [],
      currentInspections: [],
      installHistory: [],
      inspectionHistory: [],
    });
    expect(offlineStore.getCache).not.toHaveBeenCalled();
  });
});
