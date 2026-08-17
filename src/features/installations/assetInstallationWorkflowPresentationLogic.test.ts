import { describe, expect, it } from "vitest";
import type { ProjectAsset } from "../../types/projectAsset";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";
import {
  getAssetAttentionSummary,
  getSortedAssetRuns,
  getWorkflowNameForRun,
} from "./assetInstallationWorkflowPresentationLogic";

describe("getSortedAssetRuns", () => {
  it("sorts runs newest first", () => {
    const runsMap = {
      a1: [
        { id: "r1", assetId: "a1", startedAt: "2026-01-01T10:00:00.000Z" },
        { id: "r2", assetId: "a1", startedAt: "2026-02-01T10:00:00.000Z" },
      ] as AssetWorkflowRun[],
    };
    expect(getSortedAssetRuns(runsMap, "a1").map((r) => r.id)).toEqual(["r2", "r1"]);
  });
});

describe("getAssetAttentionSummary", () => {
  const asset = {
    id: "a1",
    projectId: "p1",
    issuesJson: JSON.stringify([{ id: "i1", resolved: false, isBlocking: true, severity: "high" }]),
  } as ProjectAsset;

  it("counts blocking issues from asset json", () => {
    const summary = getAssetAttentionSummary(asset, {}, {});
    expect(summary.blockingIssueCount).toBe(1);
    expect(summary.openIssueCount).toBe(1);
  });

  it("detects paused from pausedProgress", () => {
    const summary = getAssetAttentionSummary(asset, {}, { a1: { done: 1, total: 3 } });
    expect(summary.paused).toBe(true);
  });
});

describe("getWorkflowNameForRun", () => {
  it("prefers assignment config name", () => {
    const asset = { id: "a1", assetTag: "TAG-1" } as ProjectAsset;
    const run = { workflowConfigId: "cfg-1" } as AssetWorkflowRun;
    expect(
      getWorkflowNameForRun(run, asset, [
        { id: "asgn-1", workflowConfigId: "cfg-1", workflowConfigName: "Install v3" } as never,
      ]),
    ).toBe("Install v3");
  });
});
