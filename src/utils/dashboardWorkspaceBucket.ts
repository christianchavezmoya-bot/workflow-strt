import type {
  DashboardWorkspace,
  DashboardWorkspaceAssetItem,
} from "../services/projectAssetService";

/** Splits workspace items into current/history x installation/inspection buckets. */
export function bucketDashboardWorkspaceItems(items: DashboardWorkspaceAssetItem[]): DashboardWorkspace {
  const isInstallationWorkflow = (mode?: string) =>
    !mode || mode === "INSTALLATION_ONLY" || mode === "MIXED";
  const isInspectionWorkflow = (mode?: string) =>
    mode === "INSPECTION_ONLY" || mode === "MIXED";

  const isCurrent = (item: DashboardWorkspaceAssetItem) =>
    item.status !== "Complete" && item.status !== "Completed" && item.status !== "Closed";

  const isHistory = (item: DashboardWorkspaceAssetItem) =>
    item.status === "Complete" || item.status === "Completed";

  return {
    currentInstalls: items.filter((item) => isCurrent(item) && isInstallationWorkflow(item.workflowMode)),
    currentInspections: items.filter((item) => isCurrent(item) && isInspectionWorkflow(item.workflowMode)),
    installHistory: items.filter((item) => isHistory(item) && isInstallationWorkflow(item.workflowMode)),
    inspectionHistory: items.filter((item) => isHistory(item) && isInspectionWorkflow(item.workflowMode)),
  };
}
