/**
 * Report identity at the Dashboard "open history report" call site, through the REAL Dashboard
 * component: its own openHistoryReport callback loads the asset + latest run, resolves the type and
 * calls generateWorkflowReport. Sub-views are stubbed (the Supervisor install view becomes one
 * button that invokes the real onOpenHistory prop); services/hooks are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Provider } from "react-redux";

const H = vi.hoisted(() => {
  // A service object whose every method is an async stub resolving to an empty list.
  const service = () => new Proxy({} as Record<string, unknown>, {
    get(target, prop) {
      if (prop === "then") return undefined;
      if (!(prop in target)) target[prop as string] = vi.fn(async () => []);
      return target[prop as string];
    },
  });
  return { service };
});

const generateWorkflowReport = vi.fn();
const getAsset = vi.fn();
const listRuns = vi.fn();
const getConfigById = vi.fn();
const listTypes = vi.fn();

vi.mock("./AttentionItemList", () => ({ default: () => null }));
vi.mock("./DashboardAdminInspectionWorkspace", () => ({ default: () => null }));
vi.mock("./DashboardAdminInstallWorkspace", () => ({ default: () => null }));
vi.mock("./DashboardAssignWorkflowDialog", () => ({ default: () => null }));
vi.mock("./DashboardAttentionItemRow", () => ({ default: () => null }));
vi.mock("./DashboardAutoAssignConfirmDialog", () => ({ default: () => null }));
vi.mock("./DashboardAutoAssignFlagsSection", () => ({ default: () => null }));
vi.mock("./DashboardEngineerInstallView", () => ({ default: () => null }));
vi.mock("./DashboardEvidenceHealthGrid", () => ({ default: () => null }));
vi.mock("./DashboardFieldTechnicianInstallView", () => ({ default: () => null }));
vi.mock("./DashboardInspectionAttentionSection", () => ({ default: () => null }));
vi.mock("./DashboardInspectionInboxSection", () => ({ default: () => null }));
vi.mock("./DashboardInstallHistoryCard", () => ({ default: () => null }));
vi.mock("./DashboardManagerDesktopView", () => ({ default: () => null }));
vi.mock("./DashboardManagerMobileHome", () => ({ default: () => null }));
vi.mock("./DashboardManagerMobileProjectsList", () => ({ default: () => null }));
vi.mock("./DashboardMissingMediaFlagsSection", () => ({ default: () => null }));
vi.mock("./DashboardMyInspectionJobHistory", () => ({ default: () => null }));
vi.mock("./DashboardMyInspectionJobsToday", () => ({ default: () => null }));
vi.mock("./DashboardNeedsAttentionSection", () => ({ default: () => null }));
vi.mock("./DashboardPendingApprovalsSection", () => ({ default: () => null }));
vi.mock("./DashboardPhotoUpdateNotificationsSection", () => ({ default: () => null }));
vi.mock("./DashboardPmInstallWorkspace", () => ({ default: () => null }));
vi.mock("./DashboardProjectStatusGrid", () => ({ default: () => null }));
vi.mock("./DashboardQuickActionDialog", () => ({ default: () => null }));
vi.mock("./DashboardRegionalSnapshotSection", () => ({ default: () => null }));
vi.mock("./DashboardTabBar", () => ({ default: () => null }));
vi.mock("./DashboardViewerView", () => ({ default: () => null }));
vi.mock("./DashboardWorkloadPanel", () => ({ default: () => null }));
vi.mock("./DashboardWorkloadReportDialogs", () => ({ default: () => null }));
vi.mock("./DashboardWorkspaceHeader", () => ({ default: () => null }));
vi.mock("./PhotoUploadDialog", () => ({ default: () => null }));
vi.mock("../../components/GlobalOfficeMap", () => ({ default: () => null }));
vi.mock("../../components/ui/IssueDetailDialog", () => ({ default: () => null }));
vi.mock("../../components/ui/WorkflowSignatureFlowHost", () => ({ default: () => null }));
vi.mock("./DashboardSupervisorInstallView", () => ({
  default: ({ onOpenHistory }: { onOpenHistory: (asset: { id: string }) => void }) => (
    <button type="button" onClick={() => onOpenHistory({ id: "a1" })}>open-history</button>
  ),
}));
vi.mock("../../services/api", () => new Proxy({}, { get: (t: Record<string, unknown>, p: string) => (p in t ? t[p] : (t[p] = p === "default" ? H.service() : H.service())) }));
vi.mock("../../services/assetDocumentLinkService", () => new Proxy({}, { get: (t: Record<string, unknown>, p: string) => (p in t ? t[p] : (t[p] = p === "default" ? H.service() : H.service())) }));
vi.mock("../../services/assetWorkflowAssignmentService", () => new Proxy({}, { get: (t: Record<string, unknown>, p: string) => (p in t ? t[p] : (t[p] = p === "default" ? H.service() : H.service())) }));
vi.mock("../../services/brandSettingsService", () => new Proxy({}, { get: (t: Record<string, unknown>, p: string) => (p in t ? t[p] : (t[p] = p === "default" ? H.service() : H.service())) }));
vi.mock("../../services/connectivityMonitor", () => new Proxy({}, { get: (t: Record<string, unknown>, p: string) => (p in t ? t[p] : (t[p] = p === "default" ? H.service() : H.service())) }));
vi.mock("../../services/dashboardCache", () => new Proxy({}, { get: (t: Record<string, unknown>, p: string) => (p in t ? t[p] : (t[p] = p === "default" ? H.service() : H.service())) }));
vi.mock("../../services/dashboardService", () => new Proxy({}, { get: (t: Record<string, unknown>, p: string) => (p in t ? t[p] : (t[p] = p === "default" ? H.service() : H.service())) }));
vi.mock("../../services/featureService", () => new Proxy({}, { get: (t: Record<string, unknown>, p: string) => (p in t ? t[p] : (t[p] = p === "default" ? H.service() : H.service())) }));
vi.mock("../../services/inspectionImportService", () => new Proxy({}, { get: (t: Record<string, unknown>, p: string) => (p in t ? t[p] : (t[p] = p === "default" ? H.service() : H.service())) }));
vi.mock("../../services/localDB", () => new Proxy({}, { get: (t: Record<string, unknown>, p: string) => (p in t ? t[p] : (t[p] = p === "default" ? H.service() : H.service())) }));
vi.mock("../../services/mediaStore", () => new Proxy({}, { get: (t: Record<string, unknown>, p: string) => (p in t ? t[p] : (t[p] = p === "default" ? H.service() : H.service())) }));
vi.mock("../../services/notificationService", () => new Proxy({}, { get: (t: Record<string, unknown>, p: string) => (p in t ? t[p] : (t[p] = p === "default" ? H.service() : H.service())) }));
vi.mock("../../services/officesService", () => new Proxy({}, { get: (t: Record<string, unknown>, p: string) => (p in t ? t[p] : (t[p] = p === "default" ? H.service() : H.service())) }));
vi.mock("../../services/offlineBootstrapService", () => new Proxy({}, { get: (t: Record<string, unknown>, p: string) => (p in t ? t[p] : (t[p] = p === "default" ? H.service() : H.service())) }));
vi.mock("../../services/signatureService", () => new Proxy({}, { get: (t: Record<string, unknown>, p: string) => (p in t ? t[p] : (t[p] = p === "default" ? H.service() : H.service())) }));
vi.mock("../../services/projectAssetService", () => ({ projectAssetService: new Proxy({ getById: (...a: unknown[]) => getAsset(...a) } as Record<string, unknown>, { get: (t, p: string) => (p in t ? t[p] : (t[p] = vi.fn(async () => []))) }) }));
vi.mock("../../services/assetWorkflowRunService", () => ({ assetWorkflowRunService: new Proxy({ listByAsset: (...a: unknown[]) => listRuns(...a) } as Record<string, unknown>, { get: (t, p: string) => (p in t ? t[p] : (t[p] = vi.fn(async () => []))) }) }));
vi.mock("../../services/workflowConfigService", () => ({ workflowConfigService: new Proxy({ getById: (...a: unknown[]) => getConfigById(...a) } as Record<string, unknown>, { get: (t, p: string) => (p in t ? t[p] : (t[p] = vi.fn(async () => []))) }) }));
vi.mock("../../services/workflowTypeService", () => ({ workflowTypeService: { list: () => listTypes() } }));
vi.mock("../../utils/generateWorkflowReport", () => ({
  generateWorkflowReport: (...a: unknown[]) => generateWorkflowReport(...a),
  resolveImageToDataUrl: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1", fullName: "Sam Supervisor", role: "Supervisor", email: "s@example.com" } }) }));
vi.mock("../../hooks/useCatalogPrefetch", () => ({ useCatalogPrefetch: () => undefined }));
vi.mock("../../hooks/useRepoSubscription", () => ({ useRepoSubscription: () => undefined }));
vi.mock("../../hooks/useProjectTimeZone", () => ({ useProjectTimeZone: () => undefined }));

import Dashboard from "./Dashboard";
import { workflowReportBaseFileName } from "../../utils/workflowReportExport";
import { store } from "../../store";
import { setProjects } from "../../store/projectSlice";

function renderDashboard() {
  // The project the asset belongs to, so the report's job number is real (J000376).
  store.dispatch(setProjects({ items: [{ id: "p1", jobNumber: "J000376", customerName: "Cust", siteName: "Site" } as never], total: 1 }));
  render(<Provider store={store}><MemoryRouter><Dashboard /></MemoryRouter></Provider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  generateWorkflowReport.mockResolvedValue(undefined);
  getAsset.mockResolvedValue({ id: "a1", projectId: "p1", productId: "", assetTag: "CM-102", status: "Closed" });
  listRuns.mockResolvedValue([{ id: "r1", assetId: "a1", workflowConfigId: "cfg-1", runNumber: 1, isLocked: false,
    startedAt: "2026-10-20T00:00:00Z", completedAt: "2026-10-20T09:00:00Z", updatedAt: "2026-10-20T09:00:00Z",
    stepResultsJson: "[]", issuesJson: "[]", workflowSnapshotJson: "{}", signatureStatus: "None" }]);
  listTypes.mockResolvedValue([{ id: "wftype-commissioning", name: "Commissioning" }, { id: "wftype-repair", name: "Repair" }]);
});

type ReportArgs = {
  asset: Parameters<typeof workflowReportBaseFileName>[0];
  run: Parameters<typeof workflowReportBaseFileName>[1];
  documentType: string;
  jobNumber?: string;
  workflowConfigName: string;
  outputMode: string;
};

describe("Dashboard open-history report carries the real workflow type", () => {
  async function openReport() {
    renderDashboard();
    fireEvent.click(await screen.findByRole("button", { name: "open-history" }));
    await waitFor(() => expect(generateWorkflowReport).toHaveBeenCalledTimes(1));
    return generateWorkflowReport.mock.calls[0][0] as ReportArgs;
  }

  it.each([
    ["wftype-commissioning", "Commissioning"],
    ["wftype-repair", "Repair"],
  ])("config type %s → generator gets %s, and the PDF filename is named for it", async (workflowTypeId, expected) => {
    getConfigById.mockResolvedValue({ id: "cfg-1", name: "HA-Coal SAT", workflowTypeId });
    const args = await openReport();
    expect(getConfigById).toHaveBeenCalledWith("cfg-1");
    expect(args).toMatchObject({ documentType: expected, workflowConfigName: "HA-Coal SAT", outputMode: "open" });
    // The generator names the saved/opened PDF from exactly these arguments.
    expect(workflowReportBaseFileName(args.asset, args.run, args.documentType, args.jobNumber, args.workflowConfigName))
      .toBe(`${expected}_J000376_CM-102_HA-Coal_SAT`);
  });

  it("type lookups failing (offline) still opens the report, with the neutral type", async () => {
    getConfigById.mockRejectedValue(new Error("offline"));
    listTypes.mockRejectedValue(new Error("offline"));
    const args = await openReport();
    expect(args.documentType).toBe("Workflow");
  });
});
