import type { ProjectAsset } from "../../types/projectAsset";
import type { User } from "../../types/user";
import type { BulkAssignWarnRow } from "./assetInstallationWorkflowAssign";

export type BulkWarnRow = BulkAssignWarnRow;

/** Selected assets that already have an assigned user — bulk assign warns first. */
export function findAssetsWithAssignedUser(assets: ProjectAsset[]): ProjectAsset[] {
  return assets.filter((asset) => !!asset.assignedUserId);
}

export function buildBulkTechWarnRows(
  assets: ProjectAsset[],
  usersById: Map<string, User>,
): BulkWarnRow[] {
  return assets.map((asset) => ({
    assetTag: asset.assetTag,
    current: usersById.get(asset.assignedUserId!)?.fullName ?? "Unknown",
  }));
}
