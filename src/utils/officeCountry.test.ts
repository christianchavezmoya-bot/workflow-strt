import { describe, it, expect } from "vitest";
import { createCountryResolver } from "./officeCountry";
import { getStepsForType } from "./status";

describe("createCountryResolver", () => {
  const offices = [
    { city: "New York", state: "NY", country: "USA" },
    { city: "London", state: "", country: "United Kingdom" },
  ];

  it("maps a country's aliases back to the canonical name", () => {
    const resolve = createCountryResolver(offices);
    expect(resolve("US")).toBe("USA");
    expect(resolve("united states")).toBe("USA");
    expect(resolve("U.S.")).toBe("USA");
  });

  it("resolves a known city to its country", () => {
    const resolve = createCountryResolver(offices);
    expect(resolve("London")).toBe("United Kingdom");
    expect(resolve("New York")).toBe("USA");
  });

  it("uses the last comma-segment as a country fallback", () => {
    const resolve = createCountryResolver(offices);
    // Last segment is a registered country alias…
    expect(resolve("Brooklyn, USA")).toBe("USA");
    // …or a built-in Australian state name.
    expect(resolve("Some Depot, NSW")).toBe("Australia");
    expect(resolve("NSW")).toBe("Australia");
  });

  it("falls back to the original string when unmapped", () => {
    const resolve = createCountryResolver(offices);
    expect(resolve("Atlantis")).toBe("Atlantis");
    expect(resolve("")).toBe("");
  });
});

describe("normalizeActiveOfficeFromUser", () => {
  it("extracts country from city, country profile office strings", async () => {
    const { normalizeActiveOfficeFromUser } = await import("./officeCountry");
    expect(normalizeActiveOfficeFromUser("Newcastle, Australia")).toBe("Australia");
    expect(normalizeActiveOfficeFromUser("")).toBe("All");
    expect(normalizeActiveOfficeFromUser("Australia")).toBe("Australia");
  });
});

describe("getStepsForType", () => {
  it("external projects include a Pending Approval step", () => {
    expect(getStepsForType("External")).toContain("Pending Approval");
  });

  it("internal projects skip Pending Approval", () => {
    expect(getStepsForType("Internal")).not.toContain("Pending Approval");
  });
});
