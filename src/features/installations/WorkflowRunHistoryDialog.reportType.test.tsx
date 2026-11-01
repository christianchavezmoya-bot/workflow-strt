/**
 * Report identity at the run-history "Standard Report" call site: the PDF must carry the run's
 * real workflow type (it used to pass none → "WORKFLOW REPORT" / "workflow_…").
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";
import type { ProjectAsset } from "../../types/projectAsset";

const generateWorkflowReport = vi.fn();
const getConfigById = vi.fn();
const listTypes = vi.fn();

const run = {
  id: "r1", assetId: "a1", workflowConfigId: "cfg-1", workflowVersion: 1,
  workflowSnapshotJson: JSON.stringify({ name: "HA-Coal SAT", stepsJson: "[]" }), status: "Complete", isLocked: true,
  stepResultsJson: "[]", issuesJson: "[]", timeTrackingJson: "[]", productiveSeconds: 0, downtimeSeconds: 0, downtimeEvents: 0,
  runNumber: 1, signatureStatus: "None", startedAt: "2026-10-20T00:00:00Z", completedAt: "2026-10-20T09:00:00Z",
  createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T09:30:00Z",
} as unknown as AssetWorkflowRun;

vi.mock("../../hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1", fullName: "Tech", role: "Admin" } }) }));
vi.mock("../../contexts/AppToastContext", () => ({ useAppToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }) }));
vi.mock("../../hooks/useProjectTimeZone", () => ({ useProjectTimeZone: () => "Australia/Sydney" }));
vi.mock("../../services/assetWorkflowRunService", () => ({
  assetWorkflowRunService: {
    listByAsset: vi.fn(async () => [run]),
    listByAssetFresh: vi.fn(async () => [run]),
    listLocalByAsset: vi.fn(async () => []),
  },
}));
vi.mock("../../services/signatureService", () => ({ signatureService: { listEvents: vi.fn().mockResolvedValue([]), createToken: vi.fn() } }));
vi.mock("../../services/projectContactService", () => ({ projectContactService: { listContacts: vi.fn().mockResolvedValue([]), createContact: vi.fn() } }));
vi.mock("../../services/brandSettingsService", () => ({ brandSettingsService: { get: vi.fn().mockResolvedValue({}) } }));
vi.mock("../../services/featureService", () => ({ featureService: { getByProduct: vi.fn().mockResolvedValue([]) } }));
vi.mock("../../services/mediaStore", () => ({ mediaStore: { resolveUploadPayload: vi.fn() } }));
vi.mock("../../utils/platform", async (orig) => ({ ...(await orig<typeof import("../../utils/platform")>()), isMobileNativePlatform: () => false }));
vi.mock("../../utils/generateWorkflowReport", () => ({
  generateWorkflowReport: (...a: unknown[]) => generateWorkflowReport(...a),
  resolveImageToDataUrl: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../services/workflowConfigService", () => ({ workflowConfigService: { getById: (...a: unknown[]) => getConfigById(...a) } }));
vi.mock("../../services/workflowTypeService", () => ({ workflowTypeService: { list: () => listTypes() } }));
// The time-entries editor (MUI date pickers, which this Vitest setup can't load as ESM) is
// unrelated to report generation.
vi.mock("../../components/ui/TimeEntriesEditorDialog", () => ({ default: () => null }));

import WorkflowRunHistoryDialog from "./WorkflowRunHistoryDialog";

const asset = { id: "a1", projectId: "p1", productId: "", assetTag: "CM-102", status: "Closed" } as unknown as ProjectAsset;

function renderDialog() {
  render(
    <WorkflowRunHistoryDialog
      open onClose={vi.fn()} asset={asset} workflowConfigId="cfg-1" workflowConfigName="HA-Coal SAT"
      currentUserName="Tech" onRerun={vi.fn()} project={{ customerName: "Cust", jobNumber: "J000376" }}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  generateWorkflowReport.mockResolvedValue(undefined);
  listTypes.mockResolvedValue([
    { id: "wftype-commissioning", name: "Commissioning", sortOrder: 2, isActive: true },
    { id: "wftype-other", name: "Other", sortOrder: 5, isActive: true },
  ]);
});

describe("run history Standard Report carries the real workflow type", () => {
  it.each([
    ["wftype-commissioning", "Commissioning"],
    ["wftype-other", "Other"],
  ])("config type %s → %s", async (workflowTypeId, expected) => {
    getConfigById.mockResolvedValue({ id: "cfg-1", workflowTypeId, stepsJson: "[]" });
    renderDialog();
    fireEvent.click((await screen.findByText("Standard Report")).closest("button")!); // its Tooltip supplies the aria-label
    await waitFor(() => expect(generateWorkflowReport).toHaveBeenCalled());
    expect(generateWorkflowReport.mock.calls[0][0]).toMatchObject({ documentType: expected, workflowConfigName: "HA-Coal SAT", jobNumber: "J000376" });
  });

  it("type lookups failing (offline) still generates the report, with the neutral type", async () => {
    getConfigById.mockRejectedValue(new Error("offline"));
    listTypes.mockRejectedValue(new Error("offline"));
    renderDialog();
    fireEvent.click((await screen.findByText("Standard Report")).closest("button")!); // its Tooltip supplies the aria-label
    await waitFor(() => expect(generateWorkflowReport).toHaveBeenCalled());
    expect(generateWorkflowReport.mock.calls[0][0].documentType).toBe("Workflow");
  });
});
