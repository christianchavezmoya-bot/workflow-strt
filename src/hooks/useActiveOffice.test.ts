import { describe, expect, it } from "vitest";
import { defaultOfficeForUser } from "./useActiveOffice";

describe("defaultOfficeForUser", () => {
  it("uses profile office when set", () => {
    expect(defaultOfficeForUser("Australia")).toBe("Australia");
    expect(defaultOfficeForUser(" USA ")).toBe("USA");
  });

  it("falls back to All when profile office is empty", () => {
    expect(defaultOfficeForUser("")).toBe("All");
    expect(defaultOfficeForUser(undefined)).toBe("All");
  });
});
