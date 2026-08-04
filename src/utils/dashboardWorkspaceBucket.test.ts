import { describe, expect, it } from "vitest";
import { bucketDashboardWorkspaceItems } from "./dashboardWorkspaceBucket";
import type { DashboardWorkspaceAssetItem } from "../services/projectAssetService";

function item(
  id: string,
  status: string,
  overrides: Partial<DashboardWorkspaceAssetItem> = {},
): DashboardWorkspaceAssetItem {
  return {
    id,
    projectId: "p1",
    jobNumber: "JO1",
    assetTag: id,
    assetName: id,
    status,
    historyStatus: status,
    completedSteps: 0,
    totalSteps: 0,
    missingItems: 0,
    workflowMode: "INSTALLATION_ONLY",
    isDeleted: false,
    hasOpenIssues: false,
    ...overrides,
  };
}

describe("bucketDashboardWorkspaceItems", () => {
  it("places assigned NotStarted assets in current installs", () => {
    const bucketed = bucketDashboardWorkspaceItems([item("a1", "NotStarted", { assignedUserId: "u1" })]);
    expect(bucketed.currentInstalls.map((row) => row.id)).toEqual(["a1"]);
    expect(bucketed.installHistory).toHaveLength(0);
  });

  it("places InProgress assets in current installs", () => {
    const bucketed = bucketDashboardWorkspaceItems([item("a1", "InProgress")]);
    expect(bucketed.currentInstalls.map((row) => row.id)).toEqual(["a1"]);
  });

  it("places Complete assets in install history", () => {
    const bucketed = bucketDashboardWorkspaceItems([item("a1", "Complete")]);
    expect(bucketed.installHistory.map((row) => row.id)).toEqual(["a1"]);
    expect(bucketed.currentInstalls).toHaveLength(0);
  });

  it("places Completed assets in install history", () => {
    const bucketed = bucketDashboardWorkspaceItems([item("a1", "Completed")]);
    expect(bucketed.installHistory.map((row) => row.id)).toEqual(["a1"]);
  });

  // Phase 2 will route Closed assets into history instead of dropping them.
  it.skip("places Closed assets in install history (phase 2)", () => {
    const bucketed = bucketDashboardWorkspaceItems([item("a1", "Closed")]);
    expect(bucketed.installHistory.map((row) => row.id)).toEqual(["a1"]);
    expect(bucketed.currentInstalls).toHaveLength(0);
  });

  it("currently excludes Closed assets from both buckets", () => {
    const bucketed = bucketDashboardWorkspaceItems([item("a1", "Closed")]);
    expect(bucketed.currentInstalls).toHaveLength(0);
    expect(bucketed.installHistory).toHaveLength(0);
  });

  it("routes inspection-only assets to current inspections", () => {
    const bucketed = bucketDashboardWorkspaceItems([
      item("a1", "InProgress", { workflowMode: "INSPECTION_ONLY" }),
    ]);
    expect(bucketed.currentInspections.map((row) => row.id)).toEqual(["a1"]);
    expect(bucketed.currentInstalls).toHaveLength(0);
  });
});
