import type { AssetWorkflowRun } from "../types/assetWorkflowRun";
import type { ProjectAsset } from "../types/projectAsset";
import { pickCaptureRun } from "./captureSpreadsheet";
import { formatCompactWallClock } from "./datetime";

const TERMINAL_STATUSES = new Set<ProjectAsset["status"]>(["Complete", "Closed", "Cancelled"]);

/** When the asset job was closed or completed, if known. */
export function resolveAssetClosedAt(
  asset: ProjectAsset,
  runs?: AssetWorkflowRun[],
): string | undefined {
  if (asset.installedAt) return asset.installedAt;
  const run = pickCaptureRun(runs ?? []);
  if (run?.completedAt) return run.completedAt;
  if (TERMINAL_STATUSES.has(asset.status)) return asset.updatedAt;
  return undefined;
}

export function formatAssetTableDate(
  iso: string | null | undefined,
  timeZoneId?: string | null,
): string {
  if (!iso) return "-";
  return formatCompactWallClock(iso, timeZoneId) || "-";
}
