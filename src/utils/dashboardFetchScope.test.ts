import { describe, expect, it } from "vitest";
import {
  shouldFetchProjectAssetSummary,
  shouldFetchTechnicianWorkload,
} from "./dashboardFetchScope";

describe("shouldFetchTechnicianWorkload", () => {
  it("fetches for roles that render the Technician Workload panel", () => {
    expect(shouldFetchTechnicianWorkload("Admin")).toBe(true);
    expect(shouldFetchTechnicianWorkload("Project Manager")).toBe(true);
    expect(shouldFetchTechnicianWorkload("Supervisor")).toBe(true);
  });

  it("skips the query for roles that never render the panel", () => {
    expect(shouldFetchTechnicianWorkload("Engineer")).toBe(false);
    expect(shouldFetchTechnicianWorkload("QA Inspector")).toBe(false);
    expect(shouldFetchTechnicianWorkload("Viewer")).toBe(false);
    expect(shouldFetchTechnicianWorkload("Client")).toBe(false);
  });

  it("skips the query for unknown, empty and missing roles", () => {
    expect(shouldFetchTechnicianWorkload("Installer")).toBe(false);
    expect(shouldFetchTechnicianWorkload("")).toBe(false);
    expect(shouldFetchTechnicianWorkload(undefined)).toBe(false);
    expect(shouldFetchTechnicianWorkload(null)).toBe(false);
  });

  it("tolerates surrounding whitespace from stored role values", () => {
    expect(shouldFetchTechnicianWorkload("  Project Manager  ")).toBe(true);
    expect(shouldFetchTechnicianWorkload("  Viewer  ")).toBe(false);
  });
});

describe("shouldFetchProjectAssetSummary", () => {
  it("fetches for manager roles that render project completion metrics", () => {
    expect(shouldFetchProjectAssetSummary("Admin")).toBe(true);
    expect(shouldFetchProjectAssetSummary("Project Manager")).toBe(true);
  });

  it("skips the aggregate for roles without project completion cards", () => {
    expect(shouldFetchProjectAssetSummary("Supervisor")).toBe(false);
    expect(shouldFetchProjectAssetSummary("Engineer")).toBe(false);
    expect(shouldFetchProjectAssetSummary("QA Inspector")).toBe(false);
    expect(shouldFetchProjectAssetSummary("Viewer")).toBe(false);
    expect(shouldFetchProjectAssetSummary("Client")).toBe(false);
  });

  it("skips the aggregate for unknown, empty and missing roles", () => {
    expect(shouldFetchProjectAssetSummary("Installer")).toBe(false);
    expect(shouldFetchProjectAssetSummary("")).toBe(false);
    expect(shouldFetchProjectAssetSummary(undefined)).toBe(false);
    expect(shouldFetchProjectAssetSummary(null)).toBe(false);
  });
});
