/**
 * The resolved workflow type reaches the PDF itself: header title "<TYPE> REPORT" and the filename
 * the generator saves under. Real jsPDF (jsdom); its own text()/save() are spied on a real instance.
 */
import { describe, expect, it, vi } from "vitest";
import * as jspdfModule from "jspdf";
import { generateWorkflowReport, type GenerateReportParams } from "./generateWorkflowReport";
import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import type { ProjectAsset } from "../types/projectAsset";

const run = {
  id: "run-1", assetId: "asset-1", workflowConfigId: "cfg-1", workflowVersion: 1,
  workflowSnapshotJson: JSON.stringify({ stepsJson: "[]" }), status: "Complete", isLocked: true,
  stepResultsJson: "[]", issuesJson: "[]", timeTrackingJson: "[]", productiveSeconds: 0, downtimeSeconds: 0,
  downtimeEvents: 0, runNumber: 1, signatureStatus: "None",
  startedAt: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
} as unknown as AssetWorkflowRun;
const asset = { id: "asset-1", projectId: "p", productId: "x", assetTag: "CM-102", status: "Closed", featureValuesJson: "{}", issuesJson: "[]", createdAt: "", updatedAt: "" } as unknown as ProjectAsset;

async function render(params: Omit<GenerateReportParams, "outputMode" | "run" | "asset" | "workflowConfigName">) {
  const RealJsPDF = jspdfModule.jsPDF;
  const texts: unknown[] = [];
  let savedAs: string | undefined;
  const spy = vi.spyOn(jspdfModule, "jsPDF").mockImplementation(function (this: unknown, ...args: unknown[]) {
    const inst = new RealJsPDF(...(args as ConstructorParameters<typeof RealJsPDF>)) as InstanceType<typeof RealJsPDF>;
    const text = inst.text.bind(inst);
    vi.spyOn(inst, "text").mockImplementation((...a: unknown[]) => { texts.push(a[0]); return text(...(a as Parameters<typeof text>)); });
    vi.spyOn(inst, "save").mockImplementation(((name: string) => { savedAs = name; }) as never);
    return inst;
  } as unknown as typeof RealJsPDF);
  try {
    await generateWorkflowReport({ run, asset, workflowConfigName: "HA-Coal SAT", jobNumber: "J000376", ...params, outputMode: "download", allowDownloadFallback: true });
  } finally {
    spy.mockRestore();
  }
  return { texts, savedAs };
}

describe("generateWorkflowReport — title and filename follow the resolved workflow type", () => {
  it.each([
    ["Installation", "INSTALLATION REPORT", "Installation_J000376_CM-102_HA-Coal_SAT.pdf"],
    ["Commissioning", "COMMISSIONING REPORT", "Commissioning_J000376_CM-102_HA-Coal_SAT.pdf"],
    ["Inspection", "INSPECTION REPORT", "Inspection_J000376_CM-102_HA-Coal_SAT.pdf"],
    ["Repair", "REPAIR REPORT", "Repair_J000376_CM-102_HA-Coal_SAT.pdf"],
    ["Other", "OTHER REPORT", "Other_J000376_CM-102_HA-Coal_SAT.pdf"],
    ["Site Acceptance Test", "SITE ACCEPTANCE TEST REPORT", "Site_Acceptance_Test_J000376_CM-102_HA-Coal_SAT.pdf"],
    ["Workflow", "WORKFLOW REPORT", "Workflow_J000376_CM-102_HA-Coal_SAT.pdf"],
  ])("%s → title %j, file %j", async (documentType, title, file) => {
    const { texts, savedAs } = await render({ documentType });
    expect(texts).toContain(title);
    expect(texts.some((t) => typeof t === "string" && /INSTALLATION REPORT/.test(t))).toBe(documentType === "Installation");
    expect(savedAs).toBe(file);
  });
});
