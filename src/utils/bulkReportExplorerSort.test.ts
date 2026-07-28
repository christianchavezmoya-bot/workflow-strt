import { describe, expect, it } from "vitest";
import type { ProjectAsset } from "../types/projectAsset";
import { sortBulkReportExplorerEntries } from "./bulkReportExplorerSort";

function asset(partial: Partial<ProjectAsset> & Pick<ProjectAsset, "id" | "assetTag" | "status">): ProjectAsset {
  return {
    projectId: "p1",
    productId: "prod1",
    featureValuesJson: "{}",
    issuesJson: "[]",
    ...partial,
    id: partial.id,
    assetTag: partial.assetTag,
    status: partial.status,
  } as ProjectAsset;
}

describe("sortBulkReportExplorerEntries", () => {
  it("sorts by asset tag numerically", () => {
    const items = [
      { asset: asset({ id: "2", assetTag: "CAD0010", status: "Complete" }) },
      { asset: asset({ id: "1", assetTag: "CAD0002", status: "Complete" }) },
    ];
    const sorted = sortBulkReportExplorerEntries(items, "tag");
    expect(sorted.map((item) => item.asset.assetTag)).toEqual(["CAD0002", "CAD0010"]);
  });

  it("sorts by asset status", () => {
    const items = [
      { asset: asset({ id: "1", assetTag: "A", status: "InProgress" }) },
      { asset: asset({ id: "2", assetTag: "B", status: "Complete" }) },
    ];
    const sorted = sortBulkReportExplorerEntries(items, "status");
    expect(sorted[0]?.asset.status).toBe("Complete");
  });
});
