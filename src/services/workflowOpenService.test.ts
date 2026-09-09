import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import type { WorkflowConfig } from "../types/workflowConfig";
import { _clearWorkflowOpenCacheForTests } from "../utils/workflowOpenCache";

vi.mock("../utils/platform", () => ({
  isMobileNativePlatform: vi.fn(() => true),
}));

vi.mock("./connectivityMonitor", () => ({
  shouldSkipBlockingNetworkRead: vi.fn(() => true),
}));

vi.mock("./offlineBootstrapService", () => ({
  default: {
    retry: vi.fn(),
  },
}));

const getByIdLocalFirst = vi.fn();
const getById = vi.fn();
const refreshByIdInBackground = vi.fn();
const listByAsset = vi.fn();
const refreshByAssetInBackground = vi.fn();
const resolveOpenRunId = vi.fn();

vi.mock("./workflowConfigService", () => ({
  workflowConfigService: {
    getByIdLocalFirst: (...args: unknown[]) => getByIdLocalFirst(...args),
    getById: (...args: unknown[]) => getById(...args),
    refreshByIdInBackground: (...args: unknown[]) => refreshByIdInBackground(...args),
  },
}));

vi.mock("./assetWorkflowRunService", () => ({
  assetWorkflowRunService: {
    listByAsset: (...args: unknown[]) => listByAsset(...args),
    refreshByAssetInBackground: (...args: unknown[]) => refreshByAssetInBackground(...args),
  },
  resolveOpenRunId: (...args: unknown[]) => resolveOpenRunId(...args),
}));

import {
  loadWorkflowOpenPayload,
  isOfflineConfigMissingContext,
  OFFLINE_CONFIG_MISSING_MESSAGE,
} from "./workflowOpenService";

function sampleConfig(id = "cfg-1", mediaJson = "[]"): WorkflowConfig {
  return {
    id,
    name: "Install",
    productId: "prod-1",
    version: 1,
    status: "Published",
    stepsJson: JSON.stringify({
      steps: [{ id: "s1", title: "Step 1", order: 1, inputs: [], mediaIds: ["photoA"] }],
    }),
    mediaJson,
    featureSelectionsJson: "[]",
    configType: "Install",
    displayName: "Install",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const NON_EMPTY_MEDIA_JSON = JSON.stringify([
  { id: "photoA", type: "image", name: "photoA.jpg", size: 100, mime: "image/jpeg", url: "/media/photoA", createdAt: 1 },
]);

describe("loadWorkflowOpenPayload", () => {
  beforeEach(() => {
    _clearWorkflowOpenCacheForTests();
    getByIdLocalFirst.mockReset();
    getById.mockReset();
    refreshByIdInBackground.mockReset();
    listByAsset.mockReset();
    refreshByAssetInBackground.mockReset();
    resolveOpenRunId.mockReset();
    listByAsset.mockResolvedValue([]);
    resolveOpenRunId.mockResolvedValue(undefined);
  });

  it("returns parsed workflow from local config cache", async () => {
    getByIdLocalFirst.mockResolvedValue(sampleConfig());

    const payload = await loadWorkflowOpenPayload("cfg-1", { id: "asset-1" });

    expect(payload?.workflow.steps).toHaveLength(1);
    expect(payload?.config.id).toBe("cfg-1");
    expect(getById).not.toHaveBeenCalled();
  });

  it("uses configFromMemory without hitting services", async () => {
    const cfg = sampleConfig("cfg-mem");
    const payload = await loadWorkflowOpenPayload("cfg-mem", { id: "asset-1" }, { configFromMemory: cfg });

    expect(payload?.config.id).toBe("cfg-mem");
    expect(getByIdLocalFirst).not.toHaveBeenCalled();
  });

  it("detects active run for matching workflow config", async () => {
    getByIdLocalFirst.mockResolvedValue(sampleConfig());
    resolveOpenRunId.mockResolvedValue("run-1");
    const runs: AssetWorkflowRun[] = [{
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
    } as AssetWorkflowRun];

    const payload = await loadWorkflowOpenPayload("cfg-1", { id: "asset-1" }, { runs });

    expect(payload?.existingRunId).toBe("run-1");
    expect(listByAsset).not.toHaveBeenCalled();
  });

  it("resumes locked run when installer signature is pending", async () => {
    getByIdLocalFirst.mockResolvedValue(sampleConfig());
    resolveOpenRunId.mockResolvedValue("run-locked");
    const runs: AssetWorkflowRun[] = [{
      id: "run-locked",
      assetId: "asset-1",
      workflowConfigId: "cfg-1",
      isLocked: true,
      status: "Complete",
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
      signatureStatus: "PendingInstaller",
    } as AssetWorkflowRun];

    const payload = await loadWorkflowOpenPayload("cfg-1", { id: "asset-1" }, { runs });

    expect(payload?.existingRunId).toBe("run-locked");
    expect(resolveOpenRunId).toHaveBeenCalledWith("asset-1", "cfg-1", runs);
  });

  it("returns null when config is missing offline", async () => {
    getByIdLocalFirst.mockResolvedValue(null);

    const payload = await loadWorkflowOpenPayload("cfg-missing", { id: "asset-1" });

    expect(payload).toBeNull();
    expect(getById).not.toHaveBeenCalled();
  });

  it("merges non-empty config media into workflow.media by default, without an explicit mergeMedia flag (TEST F)", async () => {
    getByIdLocalFirst.mockResolvedValue(sampleConfig("cfg-media", NON_EMPTY_MEDIA_JSON));

    const payload = await loadWorkflowOpenPayload("cfg-media", { id: "asset-1" });

    expect(payload?.workflow.media).toHaveLength(1);
    expect(payload?.workflow.media?.[0]?.id).toBe("photoA");
  });

  it("still merges media when mergeMedia is explicitly true (existing callers keep working)", async () => {
    getByIdLocalFirst.mockResolvedValue(sampleConfig("cfg-media-2", NON_EMPTY_MEDIA_JSON));

    const payload = await loadWorkflowOpenPayload("cfg-media-2", { id: "asset-1" }, { mergeMedia: true });

    expect(payload?.workflow.media).toHaveLength(1);
  });

  it("respects an explicit mergeMedia: false and leaves workflow.media empty", async () => {
    getByIdLocalFirst.mockResolvedValue(sampleConfig("cfg-media-3", NON_EMPTY_MEDIA_JSON));

    const payload = await loadWorkflowOpenPayload("cfg-media-3", { id: "asset-1" }, { mergeMedia: false });

    expect(payload?.workflow.media ?? []).toHaveLength(0);
  });

  it("supports preview mode without asset run lookup", async () => {
    getByIdLocalFirst.mockResolvedValue(sampleConfig("cfg-preview"));

    const payload = await loadWorkflowOpenPayload("cfg-preview", null, { previewOnly: true });

    expect(payload?.workflow.steps).toHaveLength(1);
    expect(payload?.existingRunId).toBeUndefined();
    expect(listByAsset).not.toHaveBeenCalled();
    expect(refreshByAssetInBackground).not.toHaveBeenCalled();
  });
});

describe("workflowOpenService offline UX helpers", () => {
  it("exports a user-facing offline config message", () => {
    expect(OFFLINE_CONFIG_MISSING_MESSAGE).toContain("Connect to the internet");
  });

  it("isOfflineConfigMissingContext is true when native + skip network read", () => {
    expect(isOfflineConfigMissingContext()).toBe(true);
  });
});
