import { describe, expect, it } from "vitest";
import {
  bucketDashboardWorkspaceItems,
  isDashboardWorkspaceCurrentItem,
  isDashboardWorkspaceHistoryItem,
} from "./dashboardWorkspaceBucket";
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

describe("isDashboardWorkspaceCurrentItem", () => {
  it("keeps active assigned work in current", () => {
    expect(isDashboardWorkspaceCurrentItem(item("a1", "NotStarted"))).toBe(true);
    expect(isDashboardWorkspaceCurrentItem(item("a1", "InProgress"))).toBe(true);
    expect(isDashboardWorkspaceCurrentItem(item("a1", "Pending"))).toBe(true);
    expect(isDashboardWorkspaceCurrentItem(item("a1", "Issue"))).toBe(true);
    expect(isDashboardWorkspaceCurrentItem(item("a1", "OnHold"))).toBe(true);
  });

  it("treats paused runs as current even when asset status is ambiguous", () => {
    expect(isDashboardWorkspaceCurrentItem(item("a1", "InProgress", { runStatus: "Paused" }))).toBe(true);
  });

  it("keeps PendingInstaller signature work in current when asset awaits sign-off", () => {
    expect(isDashboardWorkspaceCurrentItem(item("a1", "Pending", { signatureStatus: "PendingInstaller" }))).toBe(true);
  });

  it("routes terminal assets out of current", () => {
    expect(isDashboardWorkspaceCurrentItem(item("a1", "Complete"))).toBe(false);
    expect(isDashboardWorkspaceCurrentItem(item("a1", "Closed"))).toBe(false);
    expect(isDashboardWorkspaceCurrentItem(item("a1", "Cancelled"))).toBe(false);
  });
});

describe("isDashboardWorkspaceHistoryItem", () => {
  it("includes terminal asset statuses", () => {
    expect(isDashboardWorkspaceHistoryItem(item("a1", "Complete"))).toBe(true);
    expect(isDashboardWorkspaceHistoryItem(item("a1", "Completed"))).toBe(true);
    expect(isDashboardWorkspaceHistoryItem(item("a1", "Closed"))).toBe(true);
    expect(isDashboardWorkspaceHistoryItem(item("a1", "Cancelled"))).toBe(true);
    expect(isDashboardWorkspaceHistoryItem(item("a1", "InProgress"))).toBe(false);
  });
});

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

  it("places Closed assets in install history", () => {
    const bucketed = bucketDashboardWorkspaceItems([item("a1", "Closed")]);
    expect(bucketed.installHistory.map((row) => row.id)).toEqual(["a1"]);
    expect(bucketed.currentInstalls).toHaveLength(0);
  });

  it("places Cancelled assets in install history", () => {
    const bucketed = bucketDashboardWorkspaceItems([item("a1", "Cancelled")]);
    expect(bucketed.installHistory.map((row) => row.id)).toEqual(["a1"]);
    expect(bucketed.currentInstalls).toHaveLength(0);
  });

  it("routes inspection-only assets to current inspections", () => {
    const bucketed = bucketDashboardWorkspaceItems([
      item("a1", "InProgress", { workflowMode: "INSPECTION_ONLY" }),
    ]);
    expect(bucketed.currentInspections.map((row) => row.id)).toEqual(["a1"]);
    expect(bucketed.currentInstalls).toHaveLength(0);
  });

  it("places closed inspection assets in inspection history", () => {
    const bucketed = bucketDashboardWorkspaceItems([
      item("a1", "Closed", { workflowMode: "INSPECTION_ONLY" }),
    ]);
    expect(bucketed.inspectionHistory.map((row) => row.id)).toEqual(["a1"]);
    expect(bucketed.currentInspections).toHaveLength(0);
  });
});
