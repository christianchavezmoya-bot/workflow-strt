import { describe, expect, it } from "vitest";
import type { Feature } from "../types/feature";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import type { WorkflowConfig } from "../types/workflowConfig";
import {
  buildCaptureRow,
  buildProjectCaptureColumns,
  parseStepsFromStepsJson,
  pickCaptureRun,
} from "./captureSpreadsheet";

const runDefaults: Omit<AssetWorkflowRun, "id" | "assetId" | "workflowConfigId" | "workflowSnapshotJson" | "stepResultsJson" | "status" | "isLocked" | "startedAt" | "updatedAt"> = {
  workflowVersion: 1,
  issuesJson: "[]",
  timeTrackingJson: "[]",
  productiveSeconds: 0,
  downtimeSeconds: 0,
  downtimeEvents: 0,
  runNumber: 1,
  signatureStatus: "None",
  createdAt: "2026-01-01T00:00:00Z",
};

function makeRun(overrides: Partial<AssetWorkflowRun> & Pick<AssetWorkflowRun, "id" | "stepResultsJson" | "status" | "isLocked" | "startedAt" | "updatedAt">): AssetWorkflowRun {
  return {
    assetId: "a1",
    workflowConfigId: "c1",
    workflowSnapshotJson: "{}",
    ...runDefaults,
    ...overrides,
  };
}

const generatorFeature: Feature = {
  id: "feat-gen",
  name: "Generator",
  valueType: "text",
  isInventory: true,
  manufacturerPartNumber: "MFR-100",
  alternativePartNumber: "BUS-200",
};

function makeConfig(steps: unknown[], selections: unknown[]): WorkflowConfig {
  return {
    id: "cfg-1",
    productId: "prod-1",
    name: "Config A",
    status: "Published",
    version: 1,
    stepsJson: JSON.stringify({ steps }),
    mediaJson: "[]",
    featureSelectionsJson: JSON.stringify(selections),
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("buildProjectCaptureColumns", () => {
  it("builds columns from data-collection step captureFields", () => {
    const config = makeConfig(
      [
        {
          id: "step-dc",
          order: 1,
          stepFeatureId: "feat-gen",
          stepUnitIndex: 1,
          captureFields: [
            { id: "cf1", key: "generator1SerialNumber", label: "Serial Number", type: "text", required: true },
            { id: "cf2", key: "generator1Firmware", label: "Firmware", type: "text", required: true },
          ],
        },
      ],
      [{ featureId: "feat-gen", included: true, activeCount: 1 }],
    );

    const cols = buildProjectCaptureColumns({
      publishedConfigs: [config],
      features: [generatorFeature],
      depsByFeature: {},
      hiddenGroupKeys: new Set(),
    });

    const labels = cols.filter((c) => c.kind === "feature-capture").map((c) => c.fieldLabel);
    expect(labels).toContain("Serial Number");
    expect(labels).toContain("Firmware");
    expect(cols.some((c) => c.kind === "feature-pn-mfr")).toBe(true);
  });

  it("unions max units across two published configs", () => {
    const configA = makeConfig(
      [
        {
          id: "s1",
          stepFeatureId: "feat-gen",
          stepUnitIndex: 1,
          captureFields: [{ id: "c1", key: "k1", label: "Serial Number", type: "text", required: true }],
        },
      ],
      [{ featureId: "feat-gen", included: true, activeCount: 1 }],
    );
    const configB = makeConfig(
      [
        {
          id: "s2",
          stepFeatureId: "feat-gen",
          stepUnitIndex: 2,
          captureFields: [{ id: "c2", key: "k2", label: "Serial Number", type: "text", required: true }],
        },
      ],
      [{ featureId: "feat-gen", included: true, activeCount: 2 }],
    );

    const cols = buildProjectCaptureColumns({
      publishedConfigs: [configA, configB],
      features: [generatorFeature],
      depsByFeature: {},
      hiddenGroupKeys: new Set(),
    });

    const units = new Set(
      cols.filter((c) => c.kind === "feature-capture").map((c) => c.unitIndex),
    );
    expect(units.has(1)).toBe(true);
    expect(units.has(2)).toBe(true);
  });

  it("builds BOM dependency columns from bomSource steps", () => {
    const config = makeConfig(
      [
        {
          id: "bom-step",
          repeatFeatureId: "feat-gen",
          bomSource: { dependencyId: "dep-ctrl", featureId: "feat-gen", isInventory: true },
          captureFields: [{ id: "cf-sn", key: "serialNo", label: "Serial Number", type: "text", required: true }],
        },
      ],
      [{ featureId: "feat-gen", included: true, activeCount: 2 }],
    );

    const cols = buildProjectCaptureColumns({
      publishedConfigs: [config],
      features: [generatorFeature],
      depsByFeature: {
        "feat-gen": [
          {
            id: "dep-ctrl",
            featureId: "feat-gen",
            name: "Controller",
            isInventory: true,
            captureFields: ["serialNo"],
            defaultQty: 1,
            unitPrice: 0,
            sortOrder: 0,
          },
        ],
      },
      hiddenGroupKeys: new Set(),
    });

    expect(cols.some((c) => c.kind === "dependency-capture" && c.dependencyId === "dep-ctrl")).toBe(true);
  });
});

describe("pickCaptureRun", () => {
  it("prefers completed run over newer empty in-progress run", () => {
    const completed = makeRun({
      id: "r1",
      stepResultsJson: '[{"stepId":"s1","values":{"f1":"SN123"}}]',
      status: "Complete",
      isLocked: true,
      startedAt: "2026-01-01T10:00:00Z",
      updatedAt: "2026-01-01T11:00:00Z",
    });
    const inProgress = makeRun({
      id: "r2",
      stepResultsJson: "[]",
      status: "InProgress",
      isLocked: false,
      startedAt: "2026-01-02T10:00:00Z",
      updatedAt: "2026-01-02T10:00:00Z",
    });
    expect(pickCaptureRun([inProgress, completed])?.id).toBe("r1");
  });

  it("uses in-progress run with data when none completed", () => {
    const withData = makeRun({
      id: "r3",
      stepResultsJson: '[{"stepId":"s1","values":{"f1":"partial"}}]',
      status: "InProgress",
      isLocked: false,
      startedAt: "2026-01-01T10:00:00Z",
      updatedAt: "2026-01-01T10:30:00Z",
    });
    const empty = makeRun({
      id: "r4",
      stepResultsJson: "[]",
      status: "InProgress",
      isLocked: false,
      startedAt: "2026-01-02T10:00:00Z",
      updatedAt: "2026-01-02T10:00:00Z",
    });
    expect(pickCaptureRun([empty, withData])?.id).toBe("r3");
  });
});

describe("buildCaptureRow integration", () => {
  it("fills cells when column keys match capture field labels", () => {
    const steps = [
      {
        id: "step-dc",
        order: 1,
        stepFeatureId: "feat-gen",
        stepUnitIndex: 1,
        captureFields: [
          { id: "field-sn", key: "gen1sn", label: "Serial Number", type: "text" as const, required: true },
        ],
      },
    ];
    const snapshot = JSON.stringify({
      stepsJson: JSON.stringify({ steps }),
      featureSelectionsJson: JSON.stringify([{ featureId: "feat-gen", included: true, activeCount: 1 }]),
    });
    const run = makeRun({
      id: "run-1",
      assetId: "asset-1",
      workflowConfigId: "cfg-1",
      workflowSnapshotJson: snapshot,
      stepResultsJson: JSON.stringify([{ stepId: "step-dc", values: { "field-sn": "ABC-999" }, completedAt: "2026-01-01T01:00:00Z" }]),
      status: "Complete",
      isLocked: true,
      startedAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T01:00:00Z",
    });

    const config = makeConfig(steps, [{ featureId: "feat-gen", included: true, activeCount: 1 }]);
    const cols = buildProjectCaptureColumns({
      publishedConfigs: [config],
      features: [generatorFeature],
      depsByFeature: {},
      hiddenGroupKeys: new Set(),
    });
    const row = buildCaptureRow("asset-1", run, cols, [generatorFeature], { "feat-gen": 1 });
    const captureCol = cols.find((c) => c.fieldLabel === "Serial Number" && c.kind === "feature-capture");
    expect(captureCol).toBeDefined();
    expect(row.cells[captureCol!.id]?.value).toBe("ABC-999");
  });
});

describe("parseStepsFromStepsJson", () => {
  it("parses bare steps array and workflow object", () => {
    expect(parseStepsFromStepsJson(JSON.stringify([{ id: "s1" }]))).toHaveLength(1);
    expect(parseStepsFromStepsJson(JSON.stringify({ steps: [{ id: "s2" }] }))).toHaveLength(1);
  });
});
