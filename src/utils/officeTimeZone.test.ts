import { describe, expect, it } from "vitest";
import { inferTimeZoneFromLocation, inferTimeZoneFromOfficeLabel } from "./officeTimeZone";

describe("officeTimeZone", () => {
  it("maps Chile to America/Santiago", () => {
    expect(inferTimeZoneFromLocation("Chile")).toBe("America/Santiago");
    expect(inferTimeZoneFromOfficeLabel("Chile")).toBe("America/Santiago");
  });

  it("still maps Australia offices", () => {
    expect(inferTimeZoneFromLocation("Australia", "Western Australia")).toBe("Australia/Perth");
  });
});
