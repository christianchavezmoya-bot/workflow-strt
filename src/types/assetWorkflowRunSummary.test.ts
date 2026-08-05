import { describe, expect, it } from "vitest";
import type { AssetWorkflowRun } from "./assetWorkflowRun";
import {
  captureBlobsReadyForAssets,
  mergeRunRecord,
  mergeRunsIntoMap,
  runHasCaptureBlobs,
  runSummaryToPlaceholderRun,
  type AssetWorkflowRunSummary,
} from "./assetWorkflowRunSummary";

const summary: AssetWorkflowRunSummary = {
  id: "run-1",
  assetId: "asset-1",
  workflowConfigId: "cfg-1",
  status: "Complete",
  isLocked: true,
  signatureStatus: "PendingCustomer",
  startedAt: "2026-01-01T00:00:00Z",
  completedAt: "2026-01-02T00:00:00Z",
  updatedAt: "2026-01-02T00:00:00Z",
  runNumber: 1,
  productiveSeconds: 3600,
  downtimeSeconds: 0,
  hasBomActual: false,
};

const fullRun: AssetWorkflowRun = {
  ...runSummaryToPlaceholderRun(summary),
  workflowSnapshotJson: JSON.stringify({ steps: [{ id: "s1", title: "Sign-off" }] }),
  stepResultsJson: JSON.stringify([{ stepId: "s1", values: { field1: "ok" } }]),
  updatedAt: "2026-01-01T12:00:00Z",
};

describe("runHasCaptureBlobs", () => {
  it("detects placeholder vs full runs", () => {
    expect(runHasCaptureBlobs(runSummaryToPlaceholderRun(summary))).toBe(false);
    expect(runHasCaptureBlobs(fullRun)).toBe(true);
  });
});

describe("mergeRunRecord", () => {
  it("keeps full blobs when incoming is a slim placeholder", () => {
    const placeholder = runSummaryToPlaceholderRun({ ...summary, updatedAt: "2026-01-03T00:00:00Z" });
    expect(mergeRunRecord(fullRun, placeholder)).toBe(fullRun);
  });

  it("upgrades placeholder when incoming has blobs", () => {
    const placeholder = runSummaryToPlaceholderRun(summary);
    expect(mergeRunRecord(placeholder, fullRun)).toBe(fullRun);
  });
});

describe("captureBlobsReadyForAssets", () => {
  it("waits for detail fetch when runs are unknown", () => {
    expect(captureBlobsReadyForAssets({}, ["asset-1"], false)).toBe(false);
    expect(captureBlobsReadyForAssets({}, ["asset-1"], true)).toBe(true);
  });

  it("requires blobs when a placeholder run exists", () => {
    const placeholder = runSummaryToPlaceholderRun(summary);
    const map = { "asset-1": [placeholder] };
    expect(captureBlobsReadyForAssets(map, ["asset-1"], false)).toBe(false);
    expect(captureBlobsReadyForAssets(map, ["asset-1"], true)).toBe(false);
    expect(captureBlobsReadyForAssets({ "asset-1": [fullRun] }, ["asset-1"], false)).toBe(true);
  });
});

describe("mergeRunsIntoMap", () => {
  it("does not clobber capture blobs with later summary refresh", () => {
    const placeholder = runSummaryToPlaceholderRun({ ...summary, updatedAt: "2026-01-03T00:00:00Z" });
    const first = mergeRunsIntoMap({}, [fullRun]);
    const second = mergeRunsIntoMap(first, [placeholder]);
    expect(runHasCaptureBlobs(second["asset-1"][0])).toBe(true);
    expect(second["asset-1"][0].stepResultsJson).toContain("field1");
  });
});
