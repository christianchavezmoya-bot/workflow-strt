import { describe, expect, it } from "vitest";
import { canEditRun } from "./runEditPermissions";

describe("canEditRun permission ladder", () => {
  const statusesBeforeSign = ["None", "PendingInstaller"] as const;

  for (const status of statusesBeforeSign) {
    it(`allows Installer and Engineer to edit time+data when ${status}`, () => {
      for (const role of ["Installer", "Engineer"] as const) {
        expect(canEditRun({ signatureStatus: status }, role)).toEqual({
          time: true,
          data: true,
          finalized: false,
        });
      }
    });

    it(`allows Admin/PM/Supervisor to edit when ${status}`, () => {
      for (const role of ["Admin", "Project Manager", "Supervisor"] as const) {
        expect(canEditRun({ signatureStatus: status }, role)).toEqual({
          time: true,
          data: true,
          finalized: false,
        });
      }
    });
  }

  it("locks Installer/Engineer at PendingCustomer; PM/Admin remain editable", () => {
    expect(canEditRun({ signatureStatus: "PendingCustomer" }, "Installer")).toEqual({
      time: false,
      data: false,
      finalized: false,
    });
    expect(canEditRun({ signatureStatus: "PendingCustomer" }, "Engineer")).toEqual({
      time: false,
      data: false,
      finalized: false,
    });
    expect(canEditRun({ signatureStatus: "PendingCustomer" }, "Admin")).toEqual({
      time: true,
      data: true,
      finalized: false,
    });
    expect(canEditRun({ signatureStatus: "PendingCustomer" }, "Project Manager")).toEqual({
      time: true,
      data: true,
      finalized: false,
    });
  });

  it("locks everyone when Signed / Declined / WaivedCustomer", () => {
    for (const status of ["Signed", "Declined", "WaivedCustomer"] as const) {
      for (const role of ["Installer", "Engineer", "Admin", "Project Manager", "Supervisor", "Viewer"] as const) {
        expect(canEditRun({ signatureStatus: status }, role)).toEqual({
          time: false,
          data: false,
          finalized: true,
        });
      }
    }
  });

  it("denies Viewer before sign-off", () => {
    expect(canEditRun({ signatureStatus: "None" }, "Viewer")).toEqual({
      time: false,
      data: false,
      finalized: false,
    });
  });

  it("treats missing signatureStatus as None", () => {
    expect(canEditRun({ signatureStatus: undefined as unknown as string }, "Engineer").time).toBe(true);
  });
});
