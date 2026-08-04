import type {
  DashboardWorkspace,
  DashboardWorkspaceAssetItem,
} from "../services/projectAssetService";

function normalizeDashboardStatus(value?: string | null): string {
  return (value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

/**
 * Mirrors server ProjectAssetsController.IsCurrentWorkspaceAsset using dashboard
 * workspace summary fields (status, runStatus, signatureStatus).
 */
export function isDashboardWorkspaceCurrentItem(item: DashboardWorkspaceAssetItem): boolean {
  const assetStatus = normalizeDashboardStatus(item.status);
  const runStatus = normalizeDashboardStatus(item.runStatus);

  if (
    assetStatus === "complete"
    || assetStatus === "completed"
    || assetStatus === "closed"
    || assetStatus === "cancelled"
  ) {
    return false;
  }

  if ((item.signatureStatus ?? "").trim().toLowerCase() === "pendinginstaller") {
    return true;
  }

  if (runStatus === "paused" || runStatus === "inprogress") {
    return true;
  }

  return assetStatus === "notstarted"
    || assetStatus === "inprogress"
    || assetStatus === "onhold"
    || assetStatus === "issue"
    || assetStatus === "pending"
    || assetStatus === "paused";
}

/** Terminal asset states land in history buckets (matches server workspace rules). */
export function isDashboardWorkspaceHistoryItem(item: DashboardWorkspaceAssetItem): boolean {
  const assetStatus = normalizeDashboardStatus(item.status);
  return assetStatus === "complete"
    || assetStatus === "completed"
    || assetStatus === "closed"
    || assetStatus === "cancelled";
}

/** Splits workspace items into current/history x installation/inspection buckets. */
export function bucketDashboardWorkspaceItems(items: DashboardWorkspaceAssetItem[]): DashboardWorkspace {
  const isInstallationWorkflow = (mode?: string) =>
    !mode || mode === "INSTALLATION_ONLY" || mode === "MIXED";
  const isInspectionWorkflow = (mode?: string) =>
    mode === "INSPECTION_ONLY" || mode === "MIXED";

  return {
    currentInstalls: items.filter((item) => isDashboardWorkspaceCurrentItem(item) && isInstallationWorkflow(item.workflowMode)),
    currentInspections: items.filter((item) => isDashboardWorkspaceCurrentItem(item) && isInspectionWorkflow(item.workflowMode)),
    installHistory: items.filter((item) => isDashboardWorkspaceHistoryItem(item) && isInstallationWorkflow(item.workflowMode)),
    inspectionHistory: items.filter((item) => isDashboardWorkspaceHistoryItem(item) && isInspectionWorkflow(item.workflowMode)),
  };
}
