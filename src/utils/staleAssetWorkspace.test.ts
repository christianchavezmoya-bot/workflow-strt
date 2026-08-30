import { describe, expect, it, beforeEach } from "vitest";
import type { DashboardWorkspace } from "../services/projectAssetService";
import { filterKnownMissingFromWorkspace, stripAssetIdFromWorkspace } from "./staleAssetWorkspace";
import { markKnownMissingAssetId, resetKnownMissingAssetIdsForTests } from "./staleAssetIds";

const baseItem = {
  projectId: "p1",
  jobNumber: "JO1",
  assetTag: "A-1",
  status: "NotStarted" as const,
  historyStatus: "NotStarted" as const,
  completedSteps: 0,
  totalSteps: 1,
  missingItems: 0,
  workflowMode: "INSTALLATION_ONLY" as const,
  isDeleted: false,
  hasOpenIssues: false,
  assignedUserId: "user-1",
};

const workspace: DashboardWorkspace = {
  currentInstalls: [{ ...baseItem, id: "live-1" }, { ...baseItem, id: "ghost-1" }],
  currentInspections: [{ ...baseItem, id: "ghost-2" }],
  installHistory: [],
  inspectionHistory: [{ ...baseItem, id: "live-2" }],
};

describe("staleAssetWorkspace", () => {
  beforeEach(() => {
    resetKnownMissingAssetIdsForTests();
  });

  it("filters known-missing ids from workspace snapshot", () => {
    markKnownMissingAssetId("ghost-1");
    markKnownMissingAssetId("ghost-2");

    const filtered = filterKnownMissingFromWorkspace(workspace);

    expect(filtered.currentInstalls.map((r) => r.id)).toEqual(["live-1"]);
    expect(filtered.currentInspections).toHaveLength(0);
    expect(filtered.inspectionHistory.map((r) => r.id)).toEqual(["live-2"]);
  });

  it("strips a single asset id from all workspace buckets", () => {
    const stripped = stripAssetIdFromWorkspace(workspace, "ghost-1");

    expect(stripped.currentInstalls.map((r) => r.id)).toEqual(["live-1"]);
    expect(stripped.currentInspections.map((r) => r.id)).toEqual(["ghost-2"]);
  });
});
