import type { DashboardWorkspace, DashboardWorkspaceAssetItem } from "../services/projectAssetService";
import { isKnownMissingAssetId } from "./staleAssetIds";

function filterRows(items: DashboardWorkspaceAssetItem[]): DashboardWorkspaceAssetItem[] {
  return items.filter((item) => item.id && !isKnownMissingAssetId(item.id));
}

/** Remove persisted ghost ids from a dashboard-workspace snapshot before prefetch/offline paint. */
export function filterKnownMissingFromWorkspace(workspace: DashboardWorkspace): DashboardWorkspace {
  return {
    currentInstalls: filterRows(workspace.currentInstalls),
    currentInspections: filterRows(workspace.currentInspections),
    installHistory: filterRows(workspace.installHistory),
    inspectionHistory: filterRows(workspace.inspectionHistory),
  };
}

export function stripAssetIdFromWorkspace(
  workspace: DashboardWorkspace,
  assetId: string,
): DashboardWorkspace {
  const filter = (items: DashboardWorkspaceAssetItem[]) =>
    items.filter((item) => item.id !== assetId);
  return {
    currentInstalls: filter(workspace.currentInstalls),
    currentInspections: filter(workspace.currentInspections),
    installHistory: filter(workspace.installHistory),
    inspectionHistory: filter(workspace.inspectionHistory),
  };
}
