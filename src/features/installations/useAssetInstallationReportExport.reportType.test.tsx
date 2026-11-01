/**
 * Report identity at the real export call site (not just the filename utility): the asset report
 * preview + PDF/JSON/DOCX exports must carry the workflow's actual type — every catalog type, not
 * "Inspection or else Installation".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";
import type { ProjectAsset } from "../../types/projectAsset";
import type { WorkflowConfig } from "../../types/workflowConfig";
import type { WorkflowType } from "../../types/workflowType";

const generateWorkflowReport = vi.fn();
const downloadBlob = vi.fn();

vi.mock("../../contexts/AppToastContext", () => ({ useAppToast: () => ({ error: vi.fn(), success: vi.fn() }) }));
vi.mock("../../utils/generateWorkflowReport", () => ({
  generateWorkflowReport: (...args: unknown[]) => generateWorkflowReport(...args),
  resolveImageToDataUrl: vi.fn(),
}));
vi.mock("../../utils/bulkWorkflowReportDownload", () => ({ downloadBlob: (...args: unknown[]) => downloadBlob(...args) }));

import { useAssetInstallationReportExport, type BuildAssetReportContextParams } from "./useAssetInstallationReportExport";

const catalog: WorkflowType[] = [
  { id: "wftype-installation", name: "Installation", sortOrder: 1, isActive: true },
  { id: "wftype-commissioning", name: "Commissioning", sortOrder: 2, isActive: true },
  { id: "wftype-inspection", name: "Inspection", sortOrder: 3, isActive: true },
  { id: "wftype-repair", name: "Repair", sortOrder: 4, isActive: true },
  { id: "wftype-other", name: "Other", sortOrder: 5, isActive: true },
  { id: "custom-sat", name: "Site Acceptance Test", sortOrder: 6, isActive: true },
];

const asset = { id: "a1", projectId: "p1", productId: "", assetTag: "CM-102", status: "Closed", productConfigId: "cfg-1" } as unknown as ProjectAsset;
const run = {
  id: "r1", assetId: "a1", workflowConfigId: "cfg-1", workflowVersion: 1, workflowSnapshotJson: "{}", status: "Complete",
  isLocked: false, stepResultsJson: '[{"stepId":"s1","values":{"x":"1"}}]', issuesJson: "[]", timeTrackingJson: "[]",
  productiveSeconds: 0, downtimeSeconds: 0, downtimeEvents: 0, runNumber: 1, signatureStatus: "None",
  startedAt: "2026-10-01T00:00:00Z", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
} as unknown as AssetWorkflowRun;

function params(config: Partial<WorkflowConfig>, workflowTypes: WorkflowType[] | undefined = catalog): BuildAssetReportContextParams {
  const wfConfig = { id: "cfg-1", productId: "", name: "HA-Coal SAT", status: "Published", version: 1, stepsJson: "[]", mediaJson: "[]", featureSelectionsJson: "[]", createdAt: "", updatedAt: "", ...config } as WorkflowConfig;
  return {
    runsMap: { a1: [run] },
    wfConfigMap: new Map([["cfg-1", wfConfig]]),
    workflowTypes,
    users: [],
    projects: [{ id: "p1", jobNumber: "J000376", customerName: "Cust", siteName: "Site" }] as unknown as BuildAssetReportContextParams["projects"],
    asset,
    assetWorkflowRunService: { listByAsset: vi.fn(), getById: vi.fn(), loadRunDetailsForAssets: vi.fn() } as never,
    customerService: { getCustomers: vi.fn().mockResolvedValue([]) } as never,
    brandSettingsService: { get: vi.fn().mockResolvedValue({}) } as never,
    featureService: { getByProduct: vi.fn().mockResolvedValue([]) } as never,
    signatureService: { listEvents: vi.fn().mockResolvedValue([]) } as never,
    mediaStore: { resolveUploadPayload: vi.fn() } as never,
    isMobileNativePlatform: () => false,
    pickCaptureRun: ((runs: AssetWorkflowRun[]) => runs[0]) as never,
    runHasCaptureBlobs: (() => true) as never,
    resolveProjectTimeZoneForReport: (async () => undefined) as never,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  generateWorkflowReport.mockResolvedValue(new Blob(["%PDF"], { type: "application/pdf" }));
});

const CASES: Array<[string, Partial<WorkflowConfig>, string]> = [
  ["Installation", { workflowTypeId: "wftype-installation" }, "Installation"],
  ["Commissioning", { workflowTypeId: "wftype-commissioning" }, "Commissioning"],
  ["Inspection", { workflowTypeId: "wftype-inspection" }, "Inspection"],
  ["Repair", { workflowTypeId: "wftype-repair" }, "Repair"],
  ["Other", { workflowTypeId: "wftype-other" }, "Other"],
  ["custom catalog type", { workflowTypeId: "custom-sat" }, "Site Acceptance Test"],
  ["legacy configType only", { configType: "Install" }, "Installation"],
  ["legacy wftype-commissioning in configType", { configType: "wftype-commissioning" }, "Commissioning"],
  ["no type data", {}, "Workflow"],
];

describe("asset report export: one resolved type for title, filename and metadata", () => {
  it.each(CASES)("%s → %s (preview: generator type + filename)", async (_, config, expected) => {
    const { result } = renderHook(() => useAssetInstallationReportExport());
    await act(async () => { await result.current.openReportExportDialog(asset, params(config)); });

    expect(generateWorkflowReport).toHaveBeenCalledTimes(1);
    expect(generateWorkflowReport.mock.calls[0][0]).toMatchObject({ documentType: expected, outputMode: "blob" });
    const safe = expected.replace(/[^a-zA-Z0-9-_]+/g, "_");
    expect(result.current.reportPreviewFileBase).toBe(`${safe}_J000376_CM-102_HA-Coal_SAT`);
  });

  it("Commissioning never falls back to an Installation identity (the original defect)", async () => {
    const { result } = renderHook(() => useAssetInstallationReportExport());
    await act(async () => { await result.current.openReportExportDialog(asset, params({ workflowTypeId: "wftype-commissioning", configType: "Commissioning" })); });
    expect(JSON.stringify(generateWorkflowReport.mock.calls[0][0].documentType)).not.toMatch(/install/i);
    expect(result.current.reportPreviewFileBase).not.toMatch(/install/i);
  });

  it("catalog not supplied (e.g. not yet loaded): seeded ids still resolve", async () => {
    const { result } = renderHook(() => useAssetInstallationReportExport());
    await act(async () => { await result.current.openReportExportDialog(asset, params({ workflowTypeId: "wftype-repair" }, undefined)); });
    expect(generateWorkflowReport.mock.calls[0][0].documentType).toBe("Repair");
  });

  it("PDF download, JSON and DOCX exports all use the same resolved type", async () => {
    const p = params({ workflowTypeId: "wftype-commissioning" });
    const { result } = renderHook(() => useAssetInstallationReportExport());
    await act(async () => { await result.current.openReportExportDialog(asset, p); });

    await act(async () => { await result.current.handleAssetReportExport("pdf", p); });
    expect(generateWorkflowReport.mock.calls.slice(-1)[0][0]).toMatchObject({ documentType: "Commissioning", outputMode: "download" });

    await act(async () => { await result.current.handleAssetReportExport("json", p); });
    const [jsonBlob, jsonName] = downloadBlob.mock.calls.slice(-1)[0];
    expect(jsonName).toBe("Commissioning_J000376_CM-102_HA-Coal_SAT.json");
    expect(JSON.parse(await (jsonBlob as Blob).text()).documentType).toBe("Commissioning");

    await act(async () => { await result.current.handleAssetReportExport("docx", p); });
    expect(downloadBlob.mock.calls.slice(-1)[0][1]).toBe("Commissioning_J000376_CM-102_HA-Coal_SAT.docx");
  });
});
