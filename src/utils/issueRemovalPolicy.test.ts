import { describe, expect, it } from "vitest";
import { canRemoveOrDowngradeIssue } from "./issueRemovalPolicy";

const none = new Set<string>();
const openBlocking = { id: "b1", isBlocking: true, resolved: false };

describe("canRemoveOrDowngradeIssue (mirrors the API's RunIssueMerge rule)", () => {
  it("anyone may remove a non-blocking or resolved issue", () => {
    expect(canRemoveOrDowngradeIssue({ id: "o1", isBlocking: false, resolved: false }, { id: "u", role: "Installer" }, none)).toBe(true);
    expect(canRemoveOrDowngradeIssue({ id: "b2", isBlocking: true, resolved: true }, { id: "u", role: "Installer" }, none)).toBe(true);
  });

  it.each(["Admin", "Project Manager"])("%s may remove any open blocking issue", (role) => {
    expect(canRemoveOrDowngradeIssue({ ...openBlocking, createdByUserId: "someone-else" }, { id: "u", role }, none)).toBe(true);
  });

  it("an installer may remove only an open blocking issue they recorded", () => {
    const installer = { id: "inst-1", role: "Installer" };
    expect(canRemoveOrDowngradeIssue({ ...openBlocking, createdByUserId: "inst-1" }, installer, none)).toBe(true);
    expect(canRemoveOrDowngradeIssue({ ...openBlocking, createdByUserId: "pm-1" }, installer, none)).toBe(false);
  });

  it("a just-flagged issue (no server creator yet) is removable only if flagged in this session", () => {
    const installer = { id: "inst-1", role: "Installer" };
    expect(canRemoveOrDowngradeIssue(openBlocking, installer, new Set(["b1"]))).toBe(true);
    expect(canRemoveOrDowngradeIssue(openBlocking, installer, none)).toBe(false); // legacy/unknown creator
  });

  it("no signed-in user can't remove an open blocking issue", () => {
    expect(canRemoveOrDowngradeIssue({ ...openBlocking, createdByUserId: "x" }, null, none)).toBe(false);
  });
});
