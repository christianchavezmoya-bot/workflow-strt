import { describe, expect, it } from "vitest";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import type { ProjectAsset } from "../types/projectAsset";
import { workflowReportBaseFileName } from "./workflowReportExport";

const asset = {
  id: "asset-1", projectId: "p", productId: "prod", assetTag: "CM02-JM7403",
  assetName: "Continuous Miner", status: "Closed", featureValuesJson: "{}", issuesJson: "[]",
  createdAt: "", updatedAt: "",
} as ProjectAsset;
const run = { id: "r", runNumber: 1 } as AssetWorkflowRun;

describe("workflowReportBaseFileName", () => {
  it("uses report type, project number, asset tag and workflow name", () => {
    expect(workflowReportBaseFileName(asset, run, "Commissioning", "JO-1234", "Full PDS SAT"))
      .toBe("Commissioning_JO-1234_CM02-JM7403_Full_PDS_SAT");
  });

  it("never uses the legacy installation-record prefix", () => {
    expect(workflowReportBaseFileName(asset, run, "Commissioning", "JO-1234", "SAT"))
      .not.toContain("installation-record");
  });
});
