import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";

vi.mock("../utils/platform", () => ({
  isMobileNativePlatform: vi.fn(() => true),
}));

const listRunsByAsset = vi.fn();
vi.mock("./offlineStore", () => ({
  default: {
    listRunsByAsset: (...args: unknown[]) => listRunsByAsset(...args),
  },
}));

const pendingGetAll = vi.fn();
vi.mock("./localDB", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./localDB")>();
  return {
    ...actual,
    pendingGetAll: (...args: unknown[]) => pendingGetAll(...args),
  };
});

import { resolveOpenRunId } from "./assetWorkflowRunService";

function sampleRun(overrides: Partial<AssetWorkflowRun> = {}): AssetWorkflowRun {
  return {
    id: "run-1",
    assetId: "asset-1",
    workflowConfigId: "cfg-1",
    isLocked: false,
    status: "InProgress",
    runNumber: 1,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    stepResultsJson: "[]",
    issuesJson: "[]",
    timeTrackingJson: "[]",
    workflowVersion: 1,
    workflowSnapshotJson: "{}",
    productiveSeconds: 0,
    downtimeSeconds: 0,
    downtimeEvents: 0,
    signatureStatus: "None",
    ...overrides,
  } as AssetWorkflowRun;
}

describe("resolveOpenRunId", () => {
  beforeEach(() => {
    listRunsByAsset.mockReset();
    pendingGetAll.mockReset();
    listRunsByAsset.mockResolvedValue([]);
    pendingGetAll.mockResolvedValue([]);
  });

  it("returns active unlocked run from runs hint", async () => {
    const runs = [sampleRun({ id: "run-active" })];
    await expect(resolveOpenRunId("asset-1", "cfg-1", runs)).resolves.toBe("run-active");
  });

  it("returns locked run awaiting installer signature", async () => {
    const runs = [sampleRun({
      id: "run-locked",
      isLocked: true,
      status: "Complete",
      signatureStatus: "PendingInstaller",
    })];
    await expect(resolveOpenRunId("asset-1", "cfg-1", runs)).resolves.toBe("run-locked");
  });

  it("prefers local locked run over stale unlocked runs hint", async () => {
    const runs = [sampleRun({
      id: "run-stale",
      isLocked: false,
      stepResultsJson: "[]",
    })];
    listRunsByAsset.mockResolvedValue([{
      ...sampleRun({
        id: "run-stale",
        isLocked: true,
        status: "Complete",
        signatureStatus: "PendingInstaller",
        stepResultsJson: "[{\"stepId\":\"s1\",\"values\":{\"serialNo\":\"ABC\"}}]",
      }),
      dirty: true,
    }]);
    await expect(resolveOpenRunId("asset-1", "cfg-1", runs)).resolves.toBe("run-stale");
  });

  it("returns locked run with pending sync ops even when signature status is stale", async () => {
    const runs = [sampleRun({
      id: "run-pending-sync",
      isLocked: true,
      status: "Complete",
      signatureStatus: "None",
    })];
    pendingGetAll.mockResolvedValue([{
      id: "pending-1",
      entityType: "workflow-run",
      entityId: "run-pending-sync",
      opType: "RUN_COMPLETE",
      conflictDetected: false,
    }]);
    await expect(resolveOpenRunId("asset-1", "cfg-1", runs)).resolves.toBe("run-pending-sync");
  });

  it("returns locked run when only conflict-flagged sync ops remain", async () => {
    const runs = [sampleRun({
      id: "run-conflict-sync",
      isLocked: true,
      status: "Complete",
      signatureStatus: "None",
    })];
    pendingGetAll.mockResolvedValue([{
      id: "pending-1",
      entityType: "workflow-run",
      entityId: "run-conflict-sync",
      opType: "SIGNATURE_SUBMIT",
      conflictDetected: true,
    }]);
    await expect(resolveOpenRunId("asset-1", "cfg-1", runs)).resolves.toBe("run-conflict-sync");
  });
});
