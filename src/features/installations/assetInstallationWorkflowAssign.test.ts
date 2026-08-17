import { describe, expect, it } from "vitest";
import type { WorkflowConfig } from "../../types/workflowConfig";
import type { WorkflowType } from "../../types/workflowType";
import {
  assignFormFromConfigSelection,
  buildAssignFormPreselection,
  filterPublishedConfigsForRequestedType,
  resolveAssignmentWorkflowTypeId,
  resolveRequestedWorkflowTypeId,
} from "./assetInstallationWorkflowAssign";

const types = [
  { id: "type-install", name: "Installation", sortOrder: 1, isActive: true },
  { id: "type-inspection", name: "Inspection", sortOrder: 2, isActive: true },
] as WorkflowType[];

function config(overrides: Partial<WorkflowConfig> = {}): WorkflowConfig {
  return {
    id: "cfg-1",
    productId: "prod-1",
    name: "Install v1",
    status: "Published",
    version: 1,
    stepsJson: "[]",
    mediaJson: "[]",
    featureSelectionsJson: "[]",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  } as WorkflowConfig;
}

describe("resolveRequestedWorkflowTypeId", () => {
  it("matches by type id (case-insensitive)", () => {
    expect(resolveRequestedWorkflowTypeId("TYPE-INSTALL", types)).toBe("type-install");
  });

  it("matches by type name (case-insensitive)", () => {
    expect(resolveRequestedWorkflowTypeId("inspection", types)).toBe("type-inspection");
  });

  it("returns empty when query param is absent or unknown", () => {
    expect(resolveRequestedWorkflowTypeId(null, types)).toBe("");
    expect(resolveRequestedWorkflowTypeId("unknown", types)).toBe("");
  });
});

describe("filterPublishedConfigsForRequestedType", () => {
  const configs = [
    config({ id: "c1", workflowTypeId: "type-install", configType: "Installation" }),
    config({ id: "c2", workflowTypeId: "type-inspection", configType: "Inspection" }),
    config({ id: "c3", configType: "Installation" }),
  ];

  it("filters by workflowTypeId FK", () => {
    const filtered = filterPublishedConfigsForRequestedType(configs, "type-install", "installation");
    expect(filtered.map((c) => c.id)).toEqual(["c1", "c3"]);
  });

  it("returns empty when no requested type id", () => {
    expect(filterPublishedConfigsForRequestedType(configs, "", "installation")).toEqual([]);
  });
});

describe("buildAssignFormPreselection", () => {
  it("preselects when exactly one config matches the requested type", () => {
    const configs = [
      config({ id: "only-one", workflowTypeId: "type-install", configType: "Installation" }),
      config({ id: "other", workflowTypeId: "type-inspection", configType: "Inspection" }),
    ];
    expect(
      buildAssignFormPreselection(configs, types, "type-install", "installation"),
    ).toEqual({
      workflowTypeId: "type-install",
      workflowConfigId: "only-one",
    });
  });

  it("leaves form empty when multiple configs match", () => {
    const configs = [
      config({ id: "a", workflowTypeId: "type-install" }),
      config({ id: "b", workflowTypeId: "type-install" }),
    ];
    expect(
      buildAssignFormPreselection(configs, types, "type-install", "installation"),
    ).toEqual({
      workflowTypeId: "",
      workflowConfigId: "",
    });
  });
});

describe("assignFormFromConfigSelection", () => {
  it("derives workflowTypeId from selected config", () => {
    const configs = [config({ id: "cfg-x", configType: "Inspection" })];
    expect(assignFormFromConfigSelection("cfg-x", configs, types)).toEqual({
      workflowConfigId: "cfg-x",
      workflowTypeId: "type-inspection",
    });
  });
});

describe("resolveAssignmentWorkflowTypeId", () => {
  it("uses form workflowTypeId when already set", () => {
    expect(
      resolveAssignmentWorkflowTypeId("from-form", "cfg-1", [], types),
    ).toBe("from-form");
  });

  it("re-derives from config when form type is empty (offline recovery)", () => {
    const configs = [config({ id: "cfg-offline", configType: "Inspection" })];
    expect(
      resolveAssignmentWorkflowTypeId("", "cfg-offline", configs, types),
    ).toBe("type-inspection");
  });

  it("falls back to config.workflowTypeId when types list cannot match configType", () => {
    const configs = [config({ id: "cfg-fk", workflowTypeId: "orphan-type", configType: "Mystery" })];
    expect(
      resolveAssignmentWorkflowTypeId("", "cfg-fk", configs, []),
    ).toBe("orphan-type");
  });

  it("returns empty when config is missing and form type is empty", () => {
    expect(resolveAssignmentWorkflowTypeId("", "missing", [], types)).toBe("");
  });
});
