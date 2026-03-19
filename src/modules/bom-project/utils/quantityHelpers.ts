import { safeNumber } from "./safeNumber";
import type { CanonicalBomRow } from "../types/canonicalBom";

/** Derive difference qty if not explicitly provided */
export function deriveDifference(row: CanonicalBomRow): number | undefined {
  if (row.differenceQty !== undefined) return row.differenceQty;
  if (row.stockQty !== undefined && row.requiredQty !== undefined) {
    return row.stockQty - row.requiredQty;
  }
  return undefined;
}

/** Return a shortage indicator: true if stock < required */
export function hasShortage(row: CanonicalBomRow): boolean {
  const diff = deriveDifference(row);
  return diff !== undefined && diff < 0;
}

/** Normalise a raw quantity value to a positive number, or undefined */
export function normalizeQty(raw: unknown): number | undefined {
  const n = safeNumber(raw);
  return n !== undefined && n >= 0 ? n : undefined;
}
