import { describe, expect, it } from "vitest";
import {
  buildSchemaCaptureTableSkeleton,
  getCaptureTableStructureKey,
  stepResultsStructureFingerprint,
} from "./projectCaptureTable";
import type { Feature } from "../types/feature";
import type { ProjectAsset } from "../types/projectAsset";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";

const asset = {
  id: "a1",
  projectId: "p1",
  productId: "prod1",
  assetTag: "CAD-0039",
  status: "InProgress",
  featureValuesJson: "[]",
  issuesJson: "[]",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
} as ProjectAsset;

const relay: Feature = {
  id: "f1",
  name: "Acme Relay",
  valueType: "component",
  isInventory: true,
};

describe("buildSchemaCaptureTableSkeleton", () => {
  it("builds feature columns from dependencies when runs are not loaded", () => {
    const table = buildSchemaCaptureTableSkeleton(
      [asset],
      [relay],
      {
        f1: [{
          id: "d1",
          featureId: "f1",
          name: "Serial Number",
          sortOrder: 0,
          isInventory: true,
          captureFields: [],
          defaultQty: 1,
          unitPrice: 0,
        }],
      },
      { f1: 1 },
    );
    expect(table.groups.length).toBe(1);
    expect(table.groups[0].columns.some((c) => c.fieldLabel.includes("Serial"))).toBe(true);
    expect(table.rows[0].cells).toEqual({});
  });

  it("returns empty groups when no inventory features", () => {
    const table = buildSchemaCaptureTableSkeleton([asset], [], {}, {});
    expect(table.groups.length).toBe(0);
  });
});

describe("stepResultsStructureFingerprint", () => {
  it("is stable when only cell values change", () => {
    const before = stepResultsStructureFingerprint(JSON.stringify([
      { stepId: "s1", values: { input1: "alpha" }, iterationIndex: 0 },
    ]));
    const after = stepResultsStructureFingerprint(JSON.stringify([
      { stepId: "s1", values: { input1: "beta" }, iterationIndex: 0 },
    ]));
    expect(before).toBe(after);
  });

  it("changes when a new input key appears", () => {
    const before = stepResultsStructureFingerprint(JSON.stringify([
      { stepId: "s1", values: { input1: "alpha" } },
    ]));
    const after = stepResultsStructureFingerprint(JSON.stringify([
      { stepId: "s1", values: { input1: "alpha", input2: "new" } },
    ]));
    expect(before).not.toBe(after);
  });
});

describe("getCaptureTableStructureKey", () => {
  const run = (stepResultsJson: string): AssetWorkflowRun => ({
    id: "run-1",
    assetId: "a1",
    workflowConfigId: "wc1",
    workflowVersion: 1,
    status: "InProgress",
    isLocked: false,
    startedAt: "2026-01-01",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    stepResultsJson,
    workflowSnapshotJson: '{"steps":[]}',
    issuesJson: "[]",
    timeTrackingJson: "[]",
    productiveSeconds: 0,
    downtimeSeconds: 0,
    downtimeEvents: 0,
    runNumber: 1,
    signatureStatus: "None",
  });

  it("matches across value-only stepResults edits", () => {
    const jsonA = JSON.stringify([{ stepId: "s1", values: { serial: "111" } }]);
    const jsonB = JSON.stringify([{ stepId: "s1", values: { serial: "222" } }]);
    const keyA = getCaptureTableStructureKey({ a1: [run(jsonA)] }, ["a1"]);
    const keyB = getCaptureTableStructureKey({ a1: [run(jsonB)] }, ["a1"]);
    expect(keyA).toBe(keyB);
  });
});
