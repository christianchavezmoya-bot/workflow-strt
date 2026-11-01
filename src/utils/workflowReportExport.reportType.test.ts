/**
 * The resolved workflow type flows unchanged into the non-PDF export surfaces: the bulk-export PDF
 * filenames, the JSON export metadata and the DOCX title (which used to be a binary
 * "Inspection Report" / "Installation Report").
 */
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildWorkflowReportJson, createWorkflowReportDocx, type WorkflowReportExportContext } from "./workflowReportExport";
import { workflowReportPdfFileName } from "./bulkWorkflowReportDownload";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import type { ProjectAsset } from "../types/projectAsset";

function context(documentType?: string): WorkflowReportExportContext {
  return {
    run: {
      id: "run-1", assetId: "asset-1", workflowConfigId: "cfg-1", workflowVersion: 1, workflowSnapshotJson: "{}",
      status: "Complete", isLocked: true, stepResultsJson: "[]", issuesJson: "[]", timeTrackingJson: "[]",
      productiveSeconds: 0, downtimeSeconds: 0, downtimeEvents: 0, runNumber: 1, signatureStatus: "None",
      startedAt: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    } as unknown as AssetWorkflowRun,
    asset: { id: "asset-1", projectId: "p", productId: "x", assetTag: "CM-102", status: "Closed" } as unknown as ProjectAsset,
    workflowConfigName: "HA-Coal SAT",
    jobNumber: "J000376",
    documentType,
    signatureEvents: [],
  };
}

async function docxText(documentType?: string): Promise<string> {
  const blob = await createWorkflowReportDocx(context(documentType));
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return (await zip.file("word/document.xml")!.async("string")).replace(/<[^>]+>/g, " ");
}

describe("non-PDF export surfaces use the resolved workflow type", () => {
  it.each(["Commissioning", "Repair", "Other", "Site Acceptance Test"])("bulk export filename for %s", (type) => {
    expect(workflowReportPdfFileName(context(type))).toBe(`${type.replace(/ /g, "_")}_J000376_CM-102_HA-Coal_SAT.pdf`);
  });

  it.each(["Installation", "Commissioning", "Inspection", "Repair", "Other"])("JSON metadata documentType for %s", (type) => {
    expect(buildWorkflowReportJson(context(type)).documentType).toBe(type);
  });

  it("JSON metadata falls back to the neutral 'Workflow', never a guessed 'installation'", () => {
    expect(buildWorkflowReportJson(context(undefined)).documentType).toBe("Workflow");
  });

  it.each([
    ["Commissioning", "Commissioning Report"],
    ["Repair", "Repair Report"],
    ["Inspection", "Inspection Report"],
    ["Installation", "Installation Report"],
    [undefined, "Workflow Report"],
  ])("DOCX title for %s is %j", async (type, title) => {
    const text = await docxText(type);
    expect(text).toContain(title);
    if (type !== "Installation") expect(text).not.toContain("Installation Report");
  });
});
