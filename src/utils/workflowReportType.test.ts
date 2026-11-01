import { describe, expect, it, vi } from "vitest";
import { FALLBACK_REPORT_TYPE, loadWorkflowReportType, resolveWorkflowReportType } from "./workflowReportType";

// The seeded catalog (AppDbContext.cs), as GET /workflow-types returns it, plus a custom admin type.
const catalog = [
  { id: "wftype-installation", name: "Installation" },
  { id: "wftype-commissioning", name: "Commissioning" },
  { id: "wftype-inspection", name: "Inspection" },
  { id: "wftype-repair", name: "Repair" },
  { id: "wftype-other", name: "Other" },
  { id: "c0ffee-custom", name: "Site Acceptance Test" },
];

describe("resolveWorkflowReportType", () => {
  it.each([
    ["wftype-installation", "Installation"],
    ["wftype-commissioning", "Commissioning"],
    ["wftype-inspection", "Inspection"],
    ["wftype-repair", "Repair"],
    ["wftype-other", "Other"],
  ])("catalog id %s → %s (all five seeded types, not just Inspection/Installation)", (id, name) => {
    expect(resolveWorkflowReportType({ workflowTypeId: id }, catalog)).toBe(name);
  });

  it("uses an admin-created custom type's catalog name", () => {
    expect(resolveWorkflowReportType({ workflowTypeId: "c0ffee-custom" }, catalog)).toBe("Site Acceptance Test");
  });

  it("follows a RENAMED catalog type (the live name wins over the seeded one)", () => {
    expect(resolveWorkflowReportType({ workflowTypeId: "wftype-commissioning" }, [{ id: "wftype-commissioning", name: "Commissioning & SAT" }]))
      .toBe("Commissioning & SAT");
  });

  it("catalog unavailable (offline cold start): seeded ids still resolve", () => {
    expect(resolveWorkflowReportType({ workflowTypeId: "wftype-repair" }, [])).toBe("Repair");
  });

  it("server-resolved name (public e-sign) is used when the catalog can't answer", () => {
    expect(resolveWorkflowReportType({ workflowTypeId: "c0ffee-custom", workflowTypeName: "Site Acceptance Test" }, []))
      .toBe("Site Acceptance Test");
  });

  it.each([
    ["Install", "Installation"],
    ["inspection", "Inspection"],
    ["COMMISSIONING", "Commissioning"],
    ["wftype-other", "Other"],
    ["Site Acceptance Test", "Site Acceptance Test"], // legacy text matching a catalog name
  ])("legacy configType %j → %s", (configType, name) => {
    expect(resolveWorkflowReportType({ configType }, catalog)).toBe(name);
  });

  it("legacy custom configType text the catalog doesn't know is used as typed", () => {
    expect(resolveWorkflowReportType({ configType: "  Pressure Test  " }, catalog)).toBe("Pressure Test");
  });

  it("an unknown type id with no other data never becomes a guessed Installation", () => {
    expect(resolveWorkflowReportType({ workflowTypeId: "deleted-type-id" }, catalog)).toBe(FALLBACK_REPORT_TYPE);
  });

  it.each([null, undefined, {}, { workflowTypeId: "  ", configType: "" }])("nothing known (%j) → neutral fallback", (source) => {
    expect(resolveWorkflowReportType(source, catalog)).toBe("Workflow");
  });

  it("workflowTypeId outranks contradictory legacy configType", () => {
    expect(resolveWorkflowReportType({ workflowTypeId: "wftype-commissioning", configType: "inspection" }, catalog)).toBe("Commissioning");
  });
});

describe("loadWorkflowReportType", () => {
  it("loads the run's config + catalog and resolves", async () => {
    const getConfig = vi.fn().mockResolvedValue({ workflowTypeId: "wftype-commissioning" });
    await expect(loadWorkflowReportType("cfg-1", { getConfig, listTypes: async () => catalog })).resolves.toBe("Commissioning");
    expect(getConfig).toHaveBeenCalledWith("cfg-1");
  });

  it("degrades instead of failing when the config or catalog can't be loaded (offline)", async () => {
    await expect(loadWorkflowReportType("cfg-1", {
      getConfig: () => Promise.reject(new Error("offline")),
      listTypes: () => Promise.reject(new Error("offline")),
    })).resolves.toBe("Workflow");
  });

  it("catalog failure alone still resolves a seeded id", async () => {
    await expect(loadWorkflowReportType("cfg-1", {
      getConfig: async () => ({ workflowTypeId: "wftype-inspection" }),
      listTypes: () => Promise.reject(new Error("offline")),
    })).resolves.toBe("Inspection");
  });
});
