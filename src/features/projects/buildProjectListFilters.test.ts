import { describe, expect, it } from "vitest";
import { buildProjectListFilters } from "./buildProjectListFilters";

describe("buildProjectListFilters", () => {
  it("scopes the API fetch to activeOffice when not All", () => {
    const filters = buildProjectListFilters({
      activeOffice: "Australia",
      statusFilter: "All",
      projectNumberFilter: "",
      showArchived: false,
    });
    expect(filters.country).toBe("Australia");
  });

  it("does not scope the API fetch when activeOffice is All", () => {
    const filters = buildProjectListFilters({
      activeOffice: "All",
      statusFilter: "All",
      projectNumberFilter: "",
      showArchived: false,
    });
    expect(filters.country).toBeUndefined();
  });

  it("does not scope the API fetch for Admin even when a specific office is selected", () => {
    const filters = buildProjectListFilters({
      activeOffice: "Australia",
      statusFilter: "All",
      projectNumberFilter: "",
      showArchived: false,
      skipOfficeFilter: true,
    });
    expect(filters.country).toBeUndefined();
  });
});
