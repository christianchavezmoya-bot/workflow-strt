import { describe, expect, it } from "vitest";
import type { ProjectAsset } from "../../types/projectAsset";
import type { User } from "../../types/user";
import { rankAssetSearchResults } from "./assetInstallationAssetSearchLogic";

const baseAsset = (overrides: Partial<ProjectAsset> = {}): ProjectAsset => ({
  id: "a1",
  projectId: "p1",
  productId: "prod1",
  assetTag: "TAG-001",
  assetName: "Unit A",
  serialNumber: "SN-100",
  manufacturer: "CAT",
  assetModel: "D6",
  location: "Yard 3",
  status: "NotStarted",
  isDeleted: false,
  ...overrides,
} as ProjectAsset);

describe("rankAssetSearchResults", () => {
  it("returns empty for queries shorter than 2 characters", () => {
    expect(rankAssetSearchResults([baseAsset()], "T", [], {})).toEqual([]);
  });

  it("ranks asset tag matches highest", () => {
    const assets = [
      baseAsset({ id: "a1", assetTag: "CAT-001", location: "catwalk" }),
      baseAsset({ id: "a2", assetTag: "OTHER", manufacturer: "CAT" }),
    ];
    const results = rankAssetSearchResults(assets, "cat", [], {});
    expect(results[0]?.asset.id).toBe("a1");
    expect(results[0]?.matchLabel).toBe("Asset tag");
  });

  it("excludes deleted assets", () => {
    const results = rankAssetSearchResults(
      [baseAsset({ isDeleted: true })],
      "tag",
      [],
      {},
    );
    expect(results).toEqual([]);
  });

  it("matches installer names from users list", () => {
    const users = [{
      id: "u1",
      fullName: "Alex Installer",
      email: "alex@example.com",
      role: "Installer",
      office: "HQ",
      isActive: true,
      isFirstLogin: false,
    } as User];
    const results = rankAssetSearchResults(
      [baseAsset({ assignedUserId: "u1" })],
      "alex",
      users,
      {},
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.matchLabel).toBe("Installer: Alex Installer");
  });
});
