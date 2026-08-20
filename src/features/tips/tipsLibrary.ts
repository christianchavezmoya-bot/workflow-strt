import type { DocumentRecord } from "../../services/documentService";

export type TipSort = "newest" | "oldest" | "most-viewed" | "least-viewed" | "top-rated" | "name";

export const TIP_SORT_LABELS: Record<TipSort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  "most-viewed": "Most viewed",
  "least-viewed": "Least viewed",
  "top-rated": "Top rated",
  name: "Title A–Z",
};

/** Months of no opens before a tip is offered up for review/removal. */
export const STALE_TIP_MONTHS = 6;

export function viewCountOf(doc: DocumentRecord): number {
  return doc.viewCount ?? 0;
}

export function ratingAverageOf(doc: DocumentRecord): number {
  return doc.ratingAverage ?? 0;
}

export function ratingCountOf(doc: DocumentRecord): number {
  return doc.ratingCount ?? 0;
}

function uploadedTime(doc: DocumentRecord): number {
  const parsed = Date.parse(doc.uploadedAt ?? "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * The reference date for staleness: the last open, or the upload date when a tip
 * has never been opened. Without the fallback a brand-new tip would look stale.
 */
export function lastActivityTime(doc: DocumentRecord): number {
  const viewed = doc.lastViewedAtUtc ? Date.parse(doc.lastViewedAtUtc) : NaN;
  if (!Number.isNaN(viewed)) return viewed;
  return uploadedTime(doc);
}

/**
 * True when nobody has opened the tip within `months`. Used by Admin/PM to find
 * material worth pruning rather than to hide anything from users.
 */
export function isStaleTip(doc: DocumentRecord, now = Date.now(), months = STALE_TIP_MONTHS): boolean {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  return lastActivityTime(doc) < cutoff.getTime();
}

export function sortTips(docs: DocumentRecord[], sort: TipSort): DocumentRecord[] {
  const sorted = [...docs];
  switch (sort) {
    case "oldest":
      return sorted.sort((a, b) => uploadedTime(a) - uploadedTime(b));
    case "most-viewed":
      return sorted.sort((a, b) => viewCountOf(b) - viewCountOf(a) || uploadedTime(b) - uploadedTime(a));
    case "least-viewed":
      return sorted.sort((a, b) => viewCountOf(a) - viewCountOf(b) || uploadedTime(a) - uploadedTime(b));
    case "top-rated":
      // Unrated tips sort last; equal averages fall back to how many people rated.
      return sorted.sort(
        (a, b) =>
          ratingAverageOf(b) - ratingAverageOf(a) ||
          ratingCountOf(b) - ratingCountOf(a) ||
          viewCountOf(b) - viewCountOf(a),
      );
    case "name":
      return sorted.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    case "newest":
    default:
      return sorted.sort((a, b) => uploadedTime(b) - uploadedTime(a));
  }
}

export type TipMetadataInput = {
  contentType: string;
  division: string;
  productId?: string;
  productName?: string;
};

/** The customValues shape tips are stored with, shared by add, edit and QR upload. */
export function buildTipCustomValues(input: TipMetadataInput): Record<string, string> {
  return {
    contentType: input.contentType,
    division: input.division,
    productId: input.productId ?? "",
    productLabel: input.productName ?? "",
    product: input.productName ?? "",
  };
}

/** linkedTo falls back through product → division → General, matching the add flow. */
export function resolveTipLinkedTo(input: TipMetadataInput): string {
  return input.productId || input.division || "General";
}

export function formatRatingSummary(doc: DocumentRecord): string {
  const count = ratingCountOf(doc);
  if (count === 0) return "Not rated";
  return `${ratingAverageOf(doc).toFixed(1)} (${count})`;
}
