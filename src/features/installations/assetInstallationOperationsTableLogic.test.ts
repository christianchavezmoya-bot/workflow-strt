import { describe, expect, it } from "vitest";
import type { ProjectAsset } from "../../types/projectAsset";
import type { WorkflowConfig } from "../../types/workflowConfig";
import {
  getOperationsColumnText,
  resolveOperationsConfigName,
  resolveOperationsConfigType,
} from "./assetInstallationOperationsTableLogic";
import { shouldVirtualizeOperationsTable } from "./operationsTableLayout";

describe("shouldVirtualizeOperationsTable", () => {
  it("virtualizes paginated web lists at or above the threshold", () => {
    expect(shouldVirtualizeOperationsTable(true, 20)).toBe(true);
    expect(shouldVirtualizeOperationsTable(true, 19)).toBe(false);
    expect(shouldVirtualizeOperationsTable(false, 100)).toBe(false);
  });
});

describe("resolveOperationsConfigType", () => {
  const asset = { id: "a1", projectId: "p1", productId: "prod", productConfigId: "pcfg-1" } as ProjectAsset;
  const wfConfigById = new Map<string, WorkflowConfig>([
    ["pcfg-1", { id: "pcfg-1", name: "Install v2", configType: "Installation" } as WorkflowConfig],
  ]);

  it("prefers product config configType", () => {
    expect(
      resolveOperationsConfigType(asset, { configType: "FromCfg" } as never, wfConfigById),
    ).toBe("FromCfg");
  });

  it("falls back to workflow config map", () => {
    expect(resolveOperationsConfigType(asset, null, wfConfigById)).toBe("Installation");
  });
});

describe("getOperationsColumnText", () => {
  const asset = {
    id: "a1",
    projectId: "proj-123456789",
    assetTag: "TAG-1",
    assetName: "Widget",
    serialNumber: "SN-1",
    createdAt: "2026-01-15T10:00:00.000Z",
  } as ProjectAsset;

  it("formats project column from job number", () => {
    const text = getOperationsColumnText("project", asset, {
      officeZone: "UTC",
      wfConfigById: new Map(),
      featuresSummary: "-",
      statusLabel: "Not Started",
      project: { jobNumber: "JO00991" } as never,
    });
    expect(text).toBe("JO00991");
  });

  it("uses callback-provided features and status labels", () => {
    expect(
      getOperationsColumnText("features", asset, {
        officeZone: "UTC",
        wfConfigById: new Map(),
        featuresSummary: "2/3 inv | Running",
        statusLabel: "In Progress",
      }),
    ).toBe("2/3 inv | Running");
  });
});

describe("resolveOperationsConfigName", () => {
  it("returns dash when no config is linked", () => {
    const asset = { id: "a1", projectId: "p1", productId: "prod" } as ProjectAsset;
    expect(resolveOperationsConfigName(asset, null, new Map())).toBe("-");
  });
});
