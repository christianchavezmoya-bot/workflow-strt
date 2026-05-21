/**
 * bomValidationService.ts
 * Runs validation rules against canonical rows + draft project.
 * Errors block publish. Warnings require acknowledgement.
 */
import type { CanonicalBomRow } from "../types/canonicalBom";
import type { ClassificationResult } from "../types/classification";
import type { DraftProject } from "../types/projectDraft";
import type { ValidationResult, ValidationIssue } from "../types/validation";
import { VALIDATION_CODES } from "../types/validation";
import { createBomId } from "./bomId";

export function validateImport(
  importRunId: string,
  rows: CanonicalBomRow[],
  classifications: ClassificationResult[],
  draft: DraftProject
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const infos: ValidationIssue[] = [];

  const classMap = new Map(classifications.map((c) => [c.sourceRowId, c]));

  // ── Error checks ────────────────────────────────────────────────────────────

  // Duplicate asset names
  const assetNames = draft.assets.map((a) => a.assetName.toLowerCase());
  const dupes = assetNames.filter((n, i) => assetNames.indexOf(n) !== i);
  dupes.forEach((name) => {
    errors.push({
      id: createBomId("validation"),
      severity: "error",
      code: VALIDATION_CODES.DUPLICATE_ASSET_NAME,
      message: `Duplicate asset name: "${name}"`,
      suggestion: "Rename one of the assets before publishing.",
    });
  });

  // Components without part numbers where inventory tracked
  draft.assets.forEach((asset) => {
    asset.components.forEach((comp) => {
      if (comp.inventoryTracked && !comp.partNumber) {
        errors.push({
          id: createBomId("validation"),
          severity: "error",
          code: VALIDATION_CODES.MISSING_PART_NUMBER,
          message: `Component "${comp.description}" is inventory-tracked but has no part number.`,
          suggestion: "Add a part number or mark as non-inventory.",
          affectedDraftId: comp.draftComponentId,
          affectedSourceRowId: comp.sourceRowId,
          quickAction: "mark-non-inventory",
        });
      }
    });
  });

  // Rows with no classification result
  rows.forEach((row) => {
    if (!classMap.has(row.sourceRowId)) {
      errors.push({
        id: createBomId("validation"),
        severity: "error",
        code: VALIDATION_CODES.MISSING_CLASSIFICATION,
        message: `Row ${row.rowIndex} (${row.description}) has no classification.`,
        affectedSourceRowId: row.sourceRowId,
        quickAction: "set-ignore",
      });
    }
  });

  // ── Warning checks ──────────────────────────────────────────────────────────

  // Low confidence classifications
  classifications.forEach((cl) => {
    if (cl.confidenceScore < 0.5 && !cl.isManualOverride) {
      const row = rows.find((r) => r.sourceRowId === cl.sourceRowId);
      warnings.push({
        id: createBomId("validation"),
        severity: "warning",
        code: VALIDATION_CODES.LOW_CONFIDENCE,
        message: `Row ${row?.rowIndex ?? "?"} classification confidence is low (${Math.round(cl.confidenceScore * 100)}%).`,
        suggestion: "Review and manually override if needed.",
        affectedSourceRowId: cl.sourceRowId,
        quickAction: "review-classification",
      });
    }
  });

  // Inventory shortages
  draft.assets.forEach((asset) => {
    asset.components.forEach((comp) => {
      if (comp.differenceQty !== undefined && comp.differenceQty < 0) {
        warnings.push({
          id: createBomId("validation"),
          severity: "warning",
          code: VALIDATION_CODES.STOCK_SHORTAGE,
          message: `"${comp.description}" (${comp.partNumber ?? "no PN"}) has a stock shortage of ${Math.abs(comp.differenceQty)} ${comp.draftComponentId}.`,
          affectedDraftId: comp.draftComponentId,
          affectedSourceRowId: comp.sourceRowId,
        });
      }
    });
  });

  // Assets without workflow template suggestions
  draft.assets.forEach((asset) => {
    if (!asset.workflowTemplateCandidate) {
      warnings.push({
        id: createBomId("validation"),
        severity: "warning",
        code: VALIDATION_CODES.NO_WORKFLOW_SUGGESTION,
        message: `Asset "${asset.assetName}" has no workflow template suggestion.`,
        suggestion: "Assign a workflow template manually before publishing.",
        affectedDraftId: asset.draftAssetId,
      });
    }
  });

  // Ignored rows count
  const ignoredRows = classifications.filter((c) => c.itemType === "ignore");
  if (ignoredRows.length > 0) {
    infos.push({
      id: createBomId("validation"),
      severity: "info",
      code: VALIDATION_CODES.IGNORED_ROWS,
      message: `${ignoredRows.length} row(s) will be ignored and not imported.`,
    });
  }

  // Manual overrides info
  const overrides = classifications.filter((c) => c.isManualOverride);
  if (overrides.length > 0) {
    infos.push({
      id: createBomId("validation"),
      severity: "info",
      code: VALIDATION_CODES.MANUAL_OVERRIDE,
      message: `${overrides.length} row(s) have manual classification overrides.`,
    });
  }

  return {
    importRunId,
    isBlockingPublish: errors.length > 0,
    errors,
    warnings,
    infos,
  };
}
