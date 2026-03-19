export type ItemScope =
  | "per_asset"
  | "project_total"
  | "consumable"
  | "reference";

/** Normalized BOM row — the canonical representation after column mapping */
export interface CanonicalBomRow {
  /** Stable ID referencing the raw source row */
  sourceRowId: string;
  importRunId: string;
  sheetName: string;
  rowIndex: number;

  // ── Identification ───────────────────────────────────────────────────────
  partNumber?: string;
  description: string;
  supplier?: string;

  // ── Quantities & Costing ─────────────────────────────────────────────────
  qty?: number;
  unit?: string;
  costUnit?: number;
  costExtended?: number;
  listPriceUnit?: number;
  listPriceExtended?: number;
  stockQty?: number;
  requiredQty?: number;
  differenceQty?: number;

  // ── Asset / Vehicle context ───────────────────────────────────────────────
  vehicleType?: string;
  assetNameCandidate?: string;
  groupName?: string;
  itemScope?: ItemScope;

  // ── Metadata ─────────────────────────────────────────────────────────────
  notes?: string;
}
