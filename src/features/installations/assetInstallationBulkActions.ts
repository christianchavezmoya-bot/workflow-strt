import type { ProjectAsset } from "../../types/projectAsset";
import type { User } from "../../types/user";
import type { BulkAssignWarnRow } from "./assetInstallationWorkflowAssign";

export type BulkWarnRow = BulkAssignWarnRow;

export const ASSET_DOCUMENT_LIMIT = 3;

export const BULK_DOCUMENT_TYPES = [
  "Technical",
  "Drawings",
  "Procedures",
  "Authority to Work",
  "Tips & Tricks",
  "Tech Bulletins",
  "Informative",
  "Other",
] as const;

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

/** Assets at doc limit or with existing docs — bulk upload warns first. */
export function buildBulkDocsWarnRows(
  assets: ProjectAsset[],
  docsCountMap: Record<string, number>,
): BulkWarnRow[] {
  const atLimit = assets.filter((asset) => (docsCountMap[asset.id] ?? 0) >= ASSET_DOCUMENT_LIMIT);
  const withDocs = assets.filter((asset) => {
    const count = docsCountMap[asset.id] ?? 0;
    return count > 0 && count < ASSET_DOCUMENT_LIMIT;
  });
  return [
    ...atLimit.map((asset) => ({
      assetTag: asset.assetTag,
      current: `${ASSET_DOCUMENT_LIMIT}/${ASSET_DOCUMENT_LIMIT} docs - will be skipped`,
    })),
    ...withDocs.map((asset) => ({
      assetTag: asset.assetTag,
      current: `${docsCountMap[asset.id]}/${ASSET_DOCUMENT_LIMIT} docs (existing kept)`,
    })),
  ];
}

export function defaultBulkDocumentName(file: File): string {
  return file.name.replace(/\.[^.]+$/, "");
}

export type BulkDocsUploadCounts = {
  uploaded: number;
  skipped: number;
  failed: number;
};

export function summarizeBulkDocsUploadResult(
  counts: BulkDocsUploadCounts,
  skippedLabel = "skipped",
): string {
  const parts: string[] = [];
  if (counts.uploaded) parts.push(`${counts.uploaded} uploaded`);
  if (counts.skipped) parts.push(`${counts.skipped} ${skippedLabel}`);
  if (counts.failed) parts.push(`${counts.failed} failed`);
  return `Done - ${parts.join(", ")}.`;
}
