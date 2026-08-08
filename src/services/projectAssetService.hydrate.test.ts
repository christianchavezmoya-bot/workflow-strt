import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardWorkspace } from "./projectAssetService";

vi.mock("../utils/platform", () => ({
  isMobileNativePlatform: vi.fn(() => true),
}));

vi.mock("./localDB", () => ({
  entityGetAsset: vi.fn(),
  entityPutAsset: vi.fn(),
  entityGetWorkflowRunsByAsset: vi.fn().mockResolvedValue([]),
  entityGetAllAssets: vi.fn().mockResolvedValue([]),
  entityGetAllProjects: vi.fn().mockResolvedValue([]),
}));

vi.mock("./connectivityMonitor", () => ({
  shouldSkipBlockingFetch: vi.fn(() => false),
  shouldSkipRunMutation: vi.fn(() => false),
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

import { entityGetAsset, entityPutAsset } from "./localDB";
import { projectAssetService } from "./projectAssetService";

const workspace: DashboardWorkspace = {
  currentInstalls: [{
    id: "asset-1",
    projectId: "p1",
    jobNumber: "JO1",
    assetTag: "NEW-001",
    status: "NotStarted",
    historyStatus: "NotStarted",
    completedSteps: 0,
    totalSteps: 8,
    missingItems: 0,
    workflowMode: "INSTALLATION_ONLY",
    isDeleted: false,
    hasOpenIssues: false,
    assignedUserId: "user-1",
    runStatus: "NotStarted",
  }],
  currentInspections: [],
  installHistory: [],
  inspectionHistory: [],
};

describe("dashboardWorkspace hydrate", () => {
  beforeEach(() => {
    vi.mocked(entityGetAsset).mockReset();
    vi.mocked(entityPutAsset).mockReset();
  });

  it("hydrates existing asset entities from a successful workspace fetch", async () => {
    vi.mocked(entityGetAsset).mockResolvedValue({
      id: "asset-1",
      productId: "prod-1",
      projectId: "p1",
      data: { id: "asset-1", projectId: "p1", productId: "prod-1", assetTag: "OLD", status: "Paused" },
      dirty: false,
    });

    const api = (await import("./api")).default;
    vi.mocked(api.get).mockResolvedValue({ data: workspace });

    await projectAssetService.dashboardWorkspace("user-1");

    expect(entityPutAsset).toHaveBeenCalledWith(expect.objectContaining({
      id: "asset-1",
      productId: "prod-1",
      dirty: false,
    }));
    const putCall = vi.mocked(entityPutAsset).mock.calls[0]?.[0];
    const data = putCall?.data as { assetTag?: string; status?: string };
    expect(data.assetTag).toBe("NEW-001");
    expect(data.status).toBe("NotStarted");
  });

  it("does not overwrite dirty asset rows during hydrate", async () => {
    vi.mocked(entityGetAsset).mockResolvedValue({
      id: "asset-1",
      productId: "prod-1",
      projectId: "p1",
      data: { id: "asset-1", projectId: "p1", productId: "prod-1", status: "Paused" },
      dirty: true,
    });

    const api = (await import("./api")).default;
    vi.mocked(api.get).mockResolvedValue({ data: workspace });

    await projectAssetService.dashboardWorkspace("user-1");

    expect(entityPutAsset).not.toHaveBeenCalled();
  });
});
