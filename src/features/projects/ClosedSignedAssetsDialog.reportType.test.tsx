/**
 * Report identity at the "Closed & Signed Assets" call site: the saved signed-report PDF must be
 * titled and named for the workflow's real type (it used to carry no type at all → "WORKFLOW").
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";
import type { ProjectAsset } from "../../types/projectAsset";

const generateWorkflowReport = vi.fn();
const uploadDocument = vi.fn();
const getConfigById = vi.fn();
const listTypes = vi.fn();

vi.mock("../../hooks/usePermissions", () => ({ usePermissions: () => ({ documents: { upload: true } }) }));
vi.mock("../../utils/generateWorkflowReport", () => ({
  generateWorkflowReport: (...a: unknown[]) => generateWorkflowReport(...a),
  resolveImageToDataUrl: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../services/documentService", () => ({
  documentService: { getDocuments: vi.fn().mockResolvedValue([]), uploadDocument: (...a: unknown[]) => uploadDocument(...a), openDocument: vi.fn() },
}));
vi.mock("../../services/brandSettingsService", () => ({ brandSettingsService: { get: vi.fn().mockResolvedValue({}) } }));
vi.mock("../../services/customerService", () => ({ customerService: { getCustomers: vi.fn().mockResolvedValue([]) } }));
vi.mock("../../services/featureService", () => ({ featureService: { getByProduct: vi.fn().mockResolvedValue([]) } }));
vi.mock("../../services/signatureService", () => ({ signatureService: { listEvents: vi.fn().mockResolvedValue([]) } }));
vi.mock("../../services/workflowConfigService", () => ({ workflowConfigService: { getById: (...a: unknown[]) => getConfigById(...a) } }));
vi.mock("../../services/workflowTypeService", () => ({ workflowTypeService: { list: () => listTypes() } }));

import ClosedSignedAssetsDialog from "./ClosedSignedAssetsDialog";

const asset = { id: "a1", projectId: "p1", productId: "", assetTag: "CM-102", assetName: "Chamber", status: "Closed" } as unknown as ProjectAsset;
const run = {
  id: "r1", assetId: "a1", workflowConfigId: "cfg-1", workflowVersion: 1,
  workflowSnapshotJson: JSON.stringify({ name: "HA-Coal SAT" }), status: "Complete", isLocked: true,
  stepResultsJson: "[]", issuesJson: "[]", timeTrackingJson: "[]", productiveSeconds: 0, downtimeSeconds: 0, downtimeEvents: 0,
  runNumber: 1, signatureStatus: "Signed", installerSignedAt: "2026-10-20T09:20:00Z", customerSignedAt: "2026-10-20T09:28:00Z",
  startedAt: "2026-10-20T00:00:00Z", createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T09:30:00Z",
} as unknown as AssetWorkflowRun;

const catalog = [
  { id: "wftype-commissioning", name: "Commissioning", sortOrder: 2, isActive: true },
  { id: "wftype-repair", name: "Repair", sortOrder: 4, isActive: true },
];

function renderDialog(r: AssetWorkflowRun = run) {
  render(
    <ClosedSignedAssetsDialog open onClose={vi.fn()} projectId="p1" projectJobNumber="J000376" assets={[asset]} latestRuns={[r]} users={[]} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  generateWorkflowReport.mockResolvedValue(new Blob(["%PDF"], { type: "application/pdf" }));
  uploadDocument.mockImplementation(async (file: File) => ({ id: "d1", name: file.name, customValues: {} }));
  listTypes.mockResolvedValue(catalog);
});

describe("Closed & Signed Assets — saved report carries the real workflow type", () => {
  it.each([
    ["wftype-commissioning", "Commissioning"],
    ["wftype-repair", "Repair"],
  ])("config type %s → PDF type %s and file name", async (workflowTypeId, expected) => {
    getConfigById.mockResolvedValue({ id: "cfg-1", workflowTypeId });
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Save PDF" }));
    await waitFor(() => expect(uploadDocument).toHaveBeenCalled());

    expect(getConfigById).toHaveBeenCalledWith("cfg-1");
    expect(generateWorkflowReport.mock.calls[0][0]).toMatchObject({ documentType: expected, outputMode: "blob" });
    expect((uploadDocument.mock.calls[0][0] as File).name).toBe(`${expected}_J000376_CM-102_HA-Coal_SAT.pdf`);
  });

  it("waived-customer sign-off row exports with the real type too", async () => {
    getConfigById.mockResolvedValue({ id: "cfg-1", workflowTypeId: "wftype-commissioning" });
    renderDialog({ ...run, signatureStatus: "WaivedCustomer", customerSignedAt: undefined } as AssetWorkflowRun);
    fireEvent.click(await screen.findByRole("button", { name: "Save PDF" }));
    await waitFor(() => expect(uploadDocument).toHaveBeenCalled());
    expect(generateWorkflowReport.mock.calls[0][0].documentType).toBe("Commissioning");
  });

  it("config/catalog unavailable (offline): still saves, with the neutral 'Workflow' type", async () => {
    getConfigById.mockRejectedValue(new Error("offline"));
    listTypes.mockRejectedValue(new Error("offline"));
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Save PDF" }));
    await waitFor(() => expect(uploadDocument).toHaveBeenCalled());
    expect(generateWorkflowReport.mock.calls[0][0].documentType).toBe("Workflow");
    expect((uploadDocument.mock.calls[0][0] as File).name).toBe("Workflow_J000376_CM-102_HA-Coal_SAT.pdf");
  });
});
