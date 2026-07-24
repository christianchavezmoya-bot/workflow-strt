import { describe, expect, it } from "vitest";
import { assetsForDeepCache } from "./offlineBootstrapService";
import type { ProjectAsset } from "../types/projectAsset";

function asset(partial: Partial<ProjectAsset> & Pick<ProjectAsset, "id">): ProjectAsset {
  return {
    projectId: "p1",
    productId: "prod1",
    status: "Pending",
    assignedUserId: null,
    ...partial,
  } as ProjectAsset;
}

describe("assetsForDeepCache", () => {
  const all = [
    asset({ id: "a1", assignedUserId: "user-1", status: "Complete" }),
    asset({ id: "a2", assignedUserId: "other", status: "InProgress" }),
    asset({ id: "a3", assignedUserId: "other", status: "Paused" }),
    asset({ id: "a4", assignedUserId: "other", status: "Pending" }),
    asset({ id: "a5", assignedUserId: "other", status: "Complete" }),
  ];

  it('returns all assets when scope is "all"', () => {
    expect(assetsForDeepCache(all, "all", "user-1").map((a) => a.id)).toEqual(
      ["a1", "a2", "a3", "a4", "a5"],
    );
  });

  it('filters to assigned user and active statuses when scope is "assigned"', () => {
    expect(assetsForDeepCache(all, "assigned", "user-1").map((a) => a.id)).toEqual(
      ["a1", "a2", "a3", "a4"],
    );
  });

  it("includes active statuses even without user id match", () => {
    expect(assetsForDeepCache(all, "assigned", null).map((a) => a.id)).toEqual(
      ["a2", "a3", "a4"],
    );
  });
});
