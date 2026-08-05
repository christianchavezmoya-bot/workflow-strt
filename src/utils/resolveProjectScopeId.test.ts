import { describe, expect, it } from "vitest";
import type { Project } from "../types/project";
import { resolveProjectScopeId } from "./resolveProjectScopeId";

const projects: Project[] = [
  {
    id: "uuid-8862",
    jobNumber: "JO00991",
    customerName: "Yancoal",
    customerId: "c1",
    description: "",
    startDate: "",
    finishDate: "",
    office: "Australia",
    projectType: "External",
    status: "In Progress",
    isInstallationProject: true,
    productIds: [],
  } as Project,
];

describe("resolveProjectScopeId", () => {
  it("returns UUID when input matches id", () => {
    expect(resolveProjectScopeId(projects, "uuid-8862")).toBe("uuid-8862");
  });

  it("returns UUID when input matches job number", () => {
    expect(resolveProjectScopeId(projects, "JO00991")).toBe("uuid-8862");
  });

  it("passes through unknown until projects load", () => {
    expect(resolveProjectScopeId([], "JO00991")).toBe("JO00991");
  });
});
