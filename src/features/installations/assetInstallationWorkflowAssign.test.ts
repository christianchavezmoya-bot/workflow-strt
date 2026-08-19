import { describe, expect, it } from "vitest";
import type { ProjectAsset } from "../../types/projectAsset";
import type { WorkflowConfig } from "../../types/workflowConfig";
import type { WorkflowAssignment, WorkflowType } from "../../types/workflowType";
import {
  assignFormFromConfigSelection,
  buildAssignFormPreselection,
  buildBulkAssignOpenForm,
  buildBulkAssignWarnRows,
  dedupeLatestPublishedWorkflowConfigs,
  filterBulkWorkflowConfigs,
  filterPublishedConfigsForProject,
  filterPublishedConfigsForRequestedType,
  filterWorkflowTypesForProject,
  findAssetsNeedingBulkAssignWarning,
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

describe("dedupeLatestPublishedWorkflowConfigs", () => {
  it("keeps highest version per config name", () => {
    const configs = [
      config({ id: "v1", name: "Install", version: 1 }),
      config({ id: "v3", name: "Install", version: 3 }),
      config({ id: "v2", name: "Install", version: 2 }),
      config({ id: "other", name: "Inspect", version: 1 }),
    ];
    expect(dedupeLatestPublishedWorkflowConfigs(configs).map((c) => c.id)).toEqual(["other", "v3"]);
  });
});

describe("filterPublishedConfigsForProject", () => {
  const configs = [
    config({ id: "c1", workflowTypeId: "type-install", configType: "Installation" }),
    config({ id: "c2", workflowTypeId: "type-inspection", configType: "Inspection" }),
  ];

  it("returns all configs for legacy MIXED without project type", () => {
    expect(
      filterPublishedConfigsForProject(configs, types, {
        workflowTypeId: undefined,
        workflowMode: "MIXED",
        isInstallationProject: true,
      }),
    ).toEqual(configs);
  });

  it("filters to project workflow type", () => {
    expect(
      filterPublishedConfigsForProject(configs, types, {
        workflowTypeId: "type-install",
        workflowMode: "INSTALLATION_ONLY",
        isInstallationProject: true,
      }).map((c) => c.id),
    ).toEqual(["c1"]);
  });
});

describe("filterWorkflowTypesForProject", () => {
  it("locks to project type when set", () => {
    expect(
      filterWorkflowTypesForProject(types, {
        workflowTypeId: "type-inspection",
        workflowMode: "INSPECTION_ONLY",
        isInstallationProject: false,
      }).map((t) => t.id),
    ).toEqual(["type-inspection"]);
  });

  it("returns all active types for legacy MIXED", () => {
    expect(
      filterWorkflowTypesForProject(types, {
        workflowTypeId: undefined,
        workflowMode: "MIXED",
        isInstallationProject: true,
      }),
    ).toEqual(types);
  });
});

describe("buildBulkAssignOpenForm", () => {
  it("prefers project workflow type over URL param", () => {
    expect(
      buildBulkAssignOpenForm("inspection", types, {
        workflowTypeId: "type-install",
        workflowMode: "INSTALLATION_ONLY",
        isInstallationProject: true,
      }),
    ).toEqual({
      workflowTypeId: "type-install",
      workflowConfigId: "",
    });
  });

  it("preselects workflow type from URL param and clears config", () => {
    expect(buildBulkAssignOpenForm("installation", types)).toEqual({
      workflowTypeId: "type-install",
      workflowConfigId: "",
    });
  });
});

describe("filterBulkWorkflowConfigs", () => {
  const configs = [
    config({ id: "c1", name: "A", workflowTypeId: "type-install", configType: "Installation" }),
    config({ id: "c2", name: "B", workflowTypeId: "type-inspection", configType: "Inspection" }),
  ];

  it("returns all configs when no type is selected", () => {
    expect(filterBulkWorkflowConfigs(configs, null)).toEqual(configs);
  });

  it("filters by workflowTypeId or configType name", () => {
    expect(filterBulkWorkflowConfigs(configs, types[0]).map((c) => c.id)).toEqual(["c1"]);
  });
});

describe("bulk assign warning helpers", () => {
  const assets = [
    { id: "a1", assetTag: "TAG-1", status: "NotStarted" },
    { id: "a2", assetTag: "TAG-2", status: "InProgress" },
    { id: "a3", assetTag: "TAG-3", status: "NotStarted" },
  ] as ProjectAsset[];

  const assignmentsMap: Record<string, WorkflowAssignment[]> = {
    a3: [
      {
        id: "asgn-1",
        assetId: "a3",
        workflowConfigId: "cfg-1",
        workflowTypeId: "type-install",
        workflowTypeName: "Installation",
        workflowConfigName: "Install v1",
        active: true,
        assignedAt: "",
      },
    ],
  };

  it("findAssetsNeedingBulkAssignWarning flags assignments and active statuses", () => {
    expect(findAssetsNeedingBulkAssignWarning(assets, assignmentsMap).map((a) => a.id)).toEqual([
      "a2",
      "a3",
    ]);
  });

  it("buildBulkAssignWarnRows describes current assignment or status", () => {
    expect(buildBulkAssignWarnRows([assets[1], assets[2]], assignmentsMap)).toEqual([
      { assetTag: "TAG-2", current: "InProgress" },
      { assetTag: "TAG-3", current: "Installation" },
    ]);
  });
});
