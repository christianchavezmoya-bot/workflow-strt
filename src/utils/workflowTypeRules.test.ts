import { describe, expect, it } from "vitest";
import {
  defaultTypeIdForLegacyMode,
  deriveWorkflowMode,
  isInspectionWorkflowType,
  isInstallationProjectMode,
  assignmentAllowedForProject,
  resolveProjectWorkflowTypeId,
} from "./workflowTypeRules";

describe("workflowTypeRules", () => {
  it("derives inspection vs install-style modes", () => {
    expect(deriveWorkflowMode({ id: "wftype-inspection", name: "Inspection" })).toBe("INSPECTION_ONLY");
    expect(deriveWorkflowMode({ id: "wftype-repair", name: "Repair" })).toBe("INSTALLATION_ONLY");
  });

  it("detects inspection types by id or name", () => {
    expect(isInspectionWorkflowType({ id: "custom", name: "Site Inspection" })).toBe(true);
    expect(isInspectionWorkflowType({ id: "wftype-installation", name: "Installation" })).toBe(false);
  });

  it("backfills legacy mode to default catalog ids", () => {
    expect(defaultTypeIdForLegacyMode("INSPECTION_ONLY")).toBe("wftype-inspection");
    expect(defaultTypeIdForLegacyMode("MIXED")).toBeNull();
    expect(defaultTypeIdForLegacyMode("INSTALLATION_ONLY")).toBe("wftype-installation");
  });

  it("resolves project workflow type from stored id or legacy mode", () => {
    expect(
      resolveProjectWorkflowTypeId({
        workflowTypeId: "wftype-repair",
        workflowMode: "INSTALLATION_ONLY",
        isInstallationProject: true,
      }),
    ).toBe("wftype-repair");

    expect(
      resolveProjectWorkflowTypeId({
        workflowTypeId: undefined,
        workflowMode: "MIXED",
        isInstallationProject: true,
      }),
    ).toBe("");

    expect(
      resolveProjectWorkflowTypeId({
        workflowTypeId: undefined,
        workflowMode: undefined,
        isInstallationProject: false,
      }),
    ).toBe("wftype-inspection");
  });

  it("treats install-style modes as installation-enabled", () => {
    expect(isInstallationProjectMode("INSTALLATION_ONLY")).toBe(true);
    expect(isInstallationProjectMode("MIXED")).toBe(true);
    expect(isInstallationProjectMode("INSPECTION_ONLY")).toBe(false);
  });

  it("assignment guard mirrors server rules", () => {
    expect(assignmentAllowedForProject("wftype-installation", "INSTALLATION_ONLY", "wftype-inspection")).toBe(false);
    expect(assignmentAllowedForProject(null, "MIXED", "wftype-inspection")).toBe(true);
    expect(assignmentAllowedForProject("wftype-repair", "INSTALLATION_ONLY", "wftype-repair")).toBe(true);
  });
});
