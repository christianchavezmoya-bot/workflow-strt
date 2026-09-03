import { describe, expect, it } from "vitest";
import type { AssetWorkflowRun } from "./assetWorkflowRun";
import {
  assetCaptureBlobsReady,
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

/**
 * The exact shape that broke the DEV acceptance "Installation Record" report: a long,
 * real workflow snapshot (present on essentially every real run, hydrated or not) paired
 * with an empty/un-hydrated step-results blob. The previous `||` treated this as "fully
 * loaded" and skipped the hydration fetch, so reports generated from `stepResultsJson: "[]"`
 * — "WORKFLOW STEPS (0 completed)" / "No step data available for this run." — even for a
 * genuinely completed, multi-step run.
 */
const snapshotOnlyRun: AssetWorkflowRun = {
  ...runSummaryToPlaceholderRun(summary),
  workflowSnapshotJson: JSON.stringify({
    steps: [
      { id: "s1", title: "Step one" },
      { id: "s2", title: "Step two" },
      { id: "s3", title: "Step three" },
    ],
  }),
  stepResultsJson: "[]",
};

describe("runHasCaptureBlobs", () => {
  it("detects placeholder vs full runs", () => {
    expect(runHasCaptureBlobs(runSummaryToPlaceholderRun(summary))).toBe(false);
    expect(runHasCaptureBlobs(fullRun)).toBe(true);
  });

  it("requires BOTH blobs — a long snapshot with empty step results is not 'fully loaded'", () => {
    expect(runHasCaptureBlobs(snapshotOnlyRun)).toBe(false);
  });

  it("also treats a short snapshot with long step results as not fully loaded (symmetric)", () => {
    const resultsOnlyRun: AssetWorkflowRun = {
      ...runSummaryToPlaceholderRun(summary),
      workflowSnapshotJson: "{}",
      stepResultsJson: JSON.stringify([{ stepId: "s1", values: { field1: "a very long captured value here" } }]),
    };
    expect(runHasCaptureBlobs(resultsOnlyRun)).toBe(false);
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

describe("assetCaptureBlobsReady", () => {
  it("treats assets with no runs as ready (avoids infinite detail refetch)", () => {
    expect(assetCaptureBlobsReady([])).toBe(true);
  });

  it("requires full blobs when a placeholder run exists", () => {
    expect(assetCaptureBlobsReady([runSummaryToPlaceholderRun(summary)])).toBe(false);
    expect(assetCaptureBlobsReady([fullRun])).toBe(true);
  });

  it("keeps fetching detail for a snapshot-only run instead of accepting it as ready", () => {
    expect(assetCaptureBlobsReady([snapshotOnlyRun])).toBe(false);
  });
});

describe("mergeRunRecord — snapshot-only run must not be preferred over a fully-hydrated one", () => {
  it("keeps the fully-hydrated run when the incoming update is snapshot-only", () => {
    expect(mergeRunRecord(fullRun, snapshotOnlyRun)).toBe(fullRun);
  });

  it("upgrades a snapshot-only run once real step results arrive", () => {
    expect(mergeRunRecord(snapshotOnlyRun, fullRun)).toBe(fullRun);
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
