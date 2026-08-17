import { describe, expect, it } from "vitest";
import type { ProjectAsset } from "../../types/projectAsset";
import type { User } from "../../types/user";
import {
  buildBulkDocsWarnRows,
  buildBulkTechWarnRows,
  defaultBulkDocumentName,
  findAssetsWithAssignedUser,
  summarizeBulkDocsUploadResult,
} from "./assetInstallationBulkActions";

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

describe("buildBulkDocsWarnRows", () => {
  const assets = [
    { id: "a1", assetTag: "TAG-1" },
    { id: "a2", assetTag: "TAG-2" },
    { id: "a3", assetTag: "TAG-3" },
  ] as ProjectAsset[];

  it("flags assets at limit and assets with existing docs", () => {
    const docsCountMap = { a1: 3, a2: 1, a3: 0 };
    expect(buildBulkDocsWarnRows(assets, docsCountMap)).toEqual([
      { assetTag: "TAG-1", current: "3/3 docs - will be skipped" },
      { assetTag: "TAG-2", current: "1/3 docs (existing kept)" },
    ]);
  });
});

describe("summarizeBulkDocsUploadResult", () => {
  it("formats upload summary", () => {
    expect(
      summarizeBulkDocsUploadResult({ uploaded: 2, skipped: 1, failed: 0 }, "skipped (at limit)"),
    ).toBe("Done - 2 uploaded, 1 skipped (at limit).");
  });
});

describe("defaultBulkDocumentName", () => {
  it("strips file extension", () => {
    expect(defaultBulkDocumentName({ name: "drawing.pdf" } as File)).toBe("drawing");
  });
});
