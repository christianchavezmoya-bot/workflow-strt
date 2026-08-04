import { describe, expect, it } from "vitest";
import { buildSchemaCaptureTableSkeleton } from "./projectCaptureTable";
import type { Feature } from "../types/feature";
import type { ProjectAsset } from "../types/projectAsset";

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
