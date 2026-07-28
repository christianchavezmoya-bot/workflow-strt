import type { ProjectAsset } from "../types/projectAsset";
import type { WorkflowReportExportContext } from "./workflowReportExport";
import {
  workflowReportSignatureBucketLabel,
  type WorkflowReportSignatureBucket,
} from "./workflowReportSignatureFilter";

export type BulkReportExplorerSortKey = "tag" | "status" | "signature" | "completed";

export const BULK_REPORT_EXPLORER_SORT_OPTIONS: Array<{ value: BulkReportExplorerSortKey; label: string }> = [
  { value: "tag", label: "Asset tag" },
  { value: "status", label: "Asset status" },
  { value: "signature", label: "Signature status" },
  { value: "completed", label: "Workflow completed" },
];

const SIGNATURE_SORT_ORDER: Record<WorkflowReportSignatureBucket, number> = {
  "completed-all-signatures": 0,
  "completed-installer-signed": 1,
  "completed-no-signatures": 2,
  "in-progress": 3,
  "not-started": 4,
  "no-workflow": 5,
  other: 6,
};

export type BulkReportSortableEntry = {
  asset: ProjectAsset;
  bucket?: WorkflowReportSignatureBucket;
  context?: WorkflowReportExportContext;
};

function assetTagLabel(asset: ProjectAsset): string {
  return asset.assetTag || asset.assetName || asset.serialNumber || asset.id;
}

function completedTimestamp(entry: BulkReportSortableEntry): number {
  const run = entry.context?.run;
  if (!run) return 0;
  const raw = run.completedAt ?? (run.isLocked ? run.updatedAt : "");
  if (!raw) return 0;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

export function sortBulkReportExplorerEntries<T extends BulkReportSortableEntry>(
  items: T[],
  sortKey: BulkReportExplorerSortKey,
): T[] {
  const sorted = [...items];
  sorted.sort((a, b) => {
    switch (sortKey) {
      case "status":
        return a.asset.status.localeCompare(b.asset.status)
          || assetTagLabel(a.asset).localeCompare(assetTagLabel(b.asset), undefined, { numeric: true });
      case "signature": {
        const left = SIGNATURE_SORT_ORDER[a.bucket ?? "other"];
        const right = SIGNATURE_SORT_ORDER[b.bucket ?? "other"];
        return left - right
          || workflowReportSignatureBucketLabel(a.bucket ?? "other")
            .localeCompare(workflowReportSignatureBucketLabel(b.bucket ?? "other"))
          || assetTagLabel(a.asset).localeCompare(assetTagLabel(b.asset), undefined, { numeric: true });
      }
      case "completed":
        return completedTimestamp(b) - completedTimestamp(a)
          || assetTagLabel(a.asset).localeCompare(assetTagLabel(b.asset), undefined, { numeric: true });
      case "tag":
      default:
        return assetTagLabel(a.asset).localeCompare(assetTagLabel(b.asset), undefined, { numeric: true });
    }
  });
  return sorted;
}
