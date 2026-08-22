import type { ProjectAssetSummaryItem } from "../../services/projectAssetService";

const FIELD_COMPLETE_STATUSES = new Set(["complete", "completed", "closed"]);

/** Signature states that block PM/Admin project closure (waived customer is allowed). */
const SIGNATURE_BLOCKING_STATUSES = new Set([
  "pendingcustomer",
  "pendinginstaller",
  "declined",
]);

export type ProjectCloseReadinessInput = {
  status?: string | null;
};

export type ProjectAssetCloseCheck = {
  status?: string | null;
  signatureStatus?: string | null;
  workflowSummary?: { signatureStatus?: string | null } | null;
};

function normalizeStatus(value?: string | null): string {
  return String(value ?? "").trim().toLowerCase();
}

function assetSignatureStatus(asset: ProjectAssetCloseCheck): string {
  return normalizeStatus(asset.signatureStatus ?? asset.workflowSummary?.signatureStatus);
}

export function assetBlocksProjectClose(asset: ProjectAssetCloseCheck): boolean {
  const status = normalizeStatus(asset.status);
  if (!FIELD_COMPLETE_STATUSES.has(status)) return true;
  if (status === "pending") return true;
  return SIGNATURE_BLOCKING_STATUSES.has(assetSignatureStatus(asset));
}

export function countAssetsBlockingProjectClose(assets: ProjectAssetCloseCheck[]): number {
  return assets.filter((asset) => assetBlocksProjectClose(asset)).length;
}

/**
 * Dashboard / aggregate path — uses server active-summary counts when available.
 */
export function isProjectReadyToCloseFromSummary(
  project: ProjectCloseReadinessInput,
  summary?: Pick<ProjectAssetSummaryItem, "complete" | "total" | "pendingSignature"> | null,
): boolean {
  if (normalizeStatus(project.status) !== "completed") return false;
  if (!summary || summary.total <= 0) return false;
  if (summary.complete < summary.total) return false;
  if ((summary.pendingSignature ?? 0) > 0) return false;
  return true;
}

/**
 * Per-asset path — project detail / chevron when assets are already loaded.
 */
export function isProjectReadyToCloseFromAssets(
  project: ProjectCloseReadinessInput,
  assets: ProjectAssetCloseCheck[],
): boolean {
  if (normalizeStatus(project.status) !== "completed") return false;
  if (assets.length === 0) return false;
  return assets.every((asset) => !assetBlocksProjectClose(asset));
}

export function projectCloseBlockedReason(
  project: ProjectCloseReadinessInput,
  summary?: Pick<ProjectAssetSummaryItem, "complete" | "total" | "pendingSignature"> | null,
): string | null {
  if (normalizeStatus(project.status) !== "completed") {
    return "Project must reach Completed status before it can be closed.";
  }
  if (!summary || summary.total <= 0) {
    return "Project has no installation assets.";
  }
  if (summary.complete < summary.total) {
    return `Field work is not complete (${summary.complete}/${summary.total} assets).`;
  }
  const pending = summary.pendingSignature ?? 0;
  if (pending > 0) {
    return `${pending} asset(s) still need signature sign-off (installer and/or customer). Waive customer signature where allowed, or collect remaining signatures.`;
  }
  return null;
}
