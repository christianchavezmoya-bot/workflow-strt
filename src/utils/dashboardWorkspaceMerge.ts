import type {
  DashboardWorkspace,
  DashboardWorkspaceAssetItem,
} from "../services/projectAssetService";

export function dashboardWorkspaceHasRows(data: DashboardWorkspace): boolean {
  return data.currentInstalls.length > 0
    || data.currentInspections.length > 0
    || data.installHistory.length > 0
    || data.inspectionHistory.length > 0;
}

function dashboardWorkspaceItemHasCardSignals(item: DashboardWorkspaceAssetItem): boolean {
  return item.totalSteps > 0
    || item.completedSteps > 0
    || item.missingItems > 0
    || (item.evidenceStatus ?? "").toLowerCase() === "missingdata"
    || Boolean(item.signatureStatus)
    || item.hasOpenIssues;
}

export function mergeDashboardWorkspaceItems(
  previousItems: DashboardWorkspaceAssetItem[],
  nextItems: DashboardWorkspaceAssetItem[],
): DashboardWorkspaceAssetItem[] {
  // Never regress a populated list to empty on a transient/race fetch.
  if (nextItems.length === 0 && previousItems.length > 0) return previousItems;
  if (previousItems.length === 0 || nextItems.length === 0) return nextItems;

  const previousById = new Map(previousItems.map((item) => [item.id, item]));
  return nextItems.map((item) => {
    const previous = previousById.get(item.id);
    if (!previous) return item;
    if (!dashboardWorkspaceItemHasCardSignals(previous) || dashboardWorkspaceItemHasCardSignals(item)) return item;
    return {
      ...item,
      completedSteps: previous.completedSteps,
      totalSteps: previous.totalSteps,
      missingItems: previous.missingItems,
      evidenceStatus: previous.evidenceStatus,
      signatureStatus: previous.signatureStatus,
      hasOpenIssues: previous.hasOpenIssues,
    };
  });
}

export function stabilizeDashboardWorkspace(
  previous: DashboardWorkspace,
  next: DashboardWorkspace,
): DashboardWorkspace {
  return {
    currentInstalls: mergeDashboardWorkspaceItems(previous.currentInstalls, next.currentInstalls),
    currentInspections: mergeDashboardWorkspaceItems(previous.currentInspections, next.currentInspections),
    installHistory: mergeDashboardWorkspaceItems(previous.installHistory, next.installHistory),
    inspectionHistory: mergeDashboardWorkspaceItems(previous.inspectionHistory, next.inspectionHistory),
  };
}
