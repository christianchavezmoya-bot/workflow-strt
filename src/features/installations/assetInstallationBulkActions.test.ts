import { describe, expect, it } from "vitest";
import type { ProjectAsset } from "../../types/projectAsset";
import type { User } from "../../types/user";
import { buildBulkTechWarnRows, findAssetsWithAssignedUser } from "./assetInstallationBulkActions";

describe("findAssetsWithAssignedUser", () => {
  const assets = [
    { id: "a1", assetTag: "TAG-1", assignedUserId: null },
    { id: "a2", assetTag: "TAG-2", assignedUserId: "user-1" },
  ] as ProjectAsset[];

  it("returns assets that already have assignedUserId", () => {
    expect(findAssetsWithAssignedUser(assets).map((a) => a.id)).toEqual(["a2"]);
  });
});

describe("buildBulkTechWarnRows", () => {
  it("maps asset tags to assigned user full names", () => {
    const assets = [{ id: "a1", assetTag: "TAG-1", assignedUserId: "user-1" }] as ProjectAsset[];
    const usersById = new Map<string, User>([
      ["user-1", { id: "user-1", fullName: "Alex Tech", email: "alex@example.com", isActive: true } as User],
    ]);
    expect(buildBulkTechWarnRows(assets, usersById)).toEqual([
      { assetTag: "TAG-1", current: "Alex Tech" },
    ]);
  });

  it("falls back to Unknown when user is missing", () => {
    const assets = [{ id: "a1", assetTag: "TAG-1", assignedUserId: "missing" }] as ProjectAsset[];
    expect(buildBulkTechWarnRows(assets, new Map())).toEqual([
      { assetTag: "TAG-1", current: "Unknown" },
    ]);
  });
});
