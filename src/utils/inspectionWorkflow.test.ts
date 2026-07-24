import { describe, expect, it } from "vitest";
import {
  filterInspectionRuns,
  inspectionConfigIdsFrom,
  isInspectionWorkflowConfig,
} from "../utils/inspectionWorkflow";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import type { WorkflowConfig } from "../types/workflowConfig";

describe("inspectionWorkflow helpers", () => {
  it("detects inspection configs by configType and workflowTypeId", () => {
    expect(isInspectionWorkflowConfig({ configType: "Inspection", workflowTypeId: undefined })).toBe(true);
    expect(isInspectionWorkflowConfig({ configType: "Install", workflowTypeId: "wftype-inspection" })).toBe(true);
    expect(isInspectionWorkflowConfig({ configType: "Install", workflowTypeId: "wftype-install" })).toBe(false);
  });

  it("filters runs to inspection config ids", () => {
    const ids = new Set(["cfg-insp", "cfg-insp-2"]);
    const runs = [
      { id: "r1", workflowConfigId: "cfg-insp" },
      { id: "r2", workflowConfigId: "cfg-install" },
      { id: "r3", workflowConfigId: "cfg-insp-2" },
    ] as AssetWorkflowRun[];
    expect(filterInspectionRuns(runs, ids).map((run) => run.id)).toEqual(["r1", "r3"]);
  });

  it("builds inspection config id set from configs", () => {
    const configs = [
      { id: "a", configType: "Inspection", workflowTypeId: undefined },
      { id: "b", configType: "Install", workflowTypeId: "wftype-install" },
    ] as WorkflowConfig[];
    expect([...inspectionConfigIdsFrom(configs)]).toEqual(["a"]);
  });
});
