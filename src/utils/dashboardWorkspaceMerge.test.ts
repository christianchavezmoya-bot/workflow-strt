import { describe, expect, it } from "vitest";
import {
  dashboardWorkspaceHasRows,
  mergeDashboardWorkspaceItems,
  stabilizeDashboardWorkspace,
} from "./dashboardWorkspaceMerge";
import type { DashboardWorkspaceAssetItem } from "../services/projectAssetService";

function item(id: string): DashboardWorkspaceAssetItem {
  return {
    id,
    projectId: "p1",
    jobNumber: "JO1",
    assetTag: id,
    assetName: id,
    status: "InProgress",
    historyStatus: "InProgress",
    completedSteps: 1,
    totalSteps: 5,
    missingItems: 0,
    workflowMode: "INSTALLATION_ONLY",
    isDeleted: false,
    hasOpenIssues: false,
    evidenceStatus: "Running",
  };
}

describe("mergeDashboardWorkspaceItems", () => {
  it("keeps previous items when next fetch is unexpectedly empty", () => {
    const previous = [item("a1"), item("a2")];
    expect(mergeDashboardWorkspaceItems(previous, [])).toEqual(previous);
  });

  it("returns next items when previous was empty", () => {
    const next = [item("a1")];
    expect(mergeDashboardWorkspaceItems([], next)).toEqual(next);
  });

  it("merges card signals from previous when next row lacks them", () => {
    const previous = [{ ...item("a1"), completedSteps: 3, totalSteps: 10 }];
    const next = [{ ...item("a1"), completedSteps: 0, totalSteps: 0 }];
    const merged = mergeDashboardWorkspaceItems(previous, next)[0];
    expect(merged.completedSteps).toBe(3);
    expect(merged.totalSteps).toBe(10);
  });
});

describe("stabilizeDashboardWorkspace", () => {
  it("does not blank current installs when server returns empty workspace", () => {
    const previous = {
      currentInstalls: [item("a1")],
      currentInspections: [],
      installHistory: [],
      inspectionHistory: [],
    };
    const next = {
      currentInstalls: [],
      currentInspections: [],
      installHistory: [],
      inspectionHistory: [],
    };
    const stabilized = stabilizeDashboardWorkspace(previous, next);
    expect(stabilized.currentInstalls).toHaveLength(1);
    expect(dashboardWorkspaceHasRows(stabilized)).toBe(true);
  });
});
