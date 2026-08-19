import { describe, expect, it } from "vitest";
import { isDashboardRoute, resolvePostLoginRoute } from "./postLoginRoute";

describe("resolvePostLoginRoute", () => {
  it("sends first-login users to profile setup", () => {
    expect(
      resolvePostLoginRoute({ role: "Project Manager" }, { isFirstLogin: true }),
    ).toBe("/profile");
  });

  it("sends expired-password users to profile setup", () => {
    expect(
      resolvePostLoginRoute({ role: "Admin" }, { passwordExpired: true }),
    ).toBe("/profile");
  });

  it("lands all roles on the dashboard after normal login", () => {
    for (const role of ["Admin", "Project Manager", "Installer", "Technician", "QA Inspector"]) {
      expect(resolvePostLoginRoute({ role }, {})).toBe("/");
    }
  });

  it("lands native app users on dashboard too", () => {
    expect(
      resolvePostLoginRoute({ role: "Installer" }, { nativeApp: true }),
    ).toBe("/");
  });
});

describe("isDashboardRoute", () => {
  it("matches root paths", () => {
    expect(isDashboardRoute("/")).toBe(true);
    expect(isDashboardRoute("")).toBe(true);
    expect(isDashboardRoute("/installations/assets")).toBe(false);
  });
});
