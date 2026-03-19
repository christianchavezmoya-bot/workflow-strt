export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  id: string;
  severity: ValidationSeverity;
  code: string;
  message: string;
  /** Human-readable suggestion to fix this issue */
  suggestion?: string;
  /** The source row that triggered this issue */
  affectedSourceRowId?: string;
  /** The draft asset/component that triggered this issue */
  affectedDraftId?: string;
  /** Quick override action identifier (e.g. "mark-as-ignore") */
  quickAction?: string;
}

export interface ValidationResult {
  importRunId: string;
  isBlockingPublish: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  infos: ValidationIssue[];
}

export const VALIDATION_CODES = {
  // errors
  DUPLICATE_ASSET_NAME: "DUPLICATE_ASSET_NAME",
  MISSING_PART_NUMBER: "MISSING_PART_NUMBER",
  UNMAPPED_REQUIRED_ROW: "UNMAPPED_REQUIRED_ROW",
  MISSING_CLASSIFICATION: "MISSING_CLASSIFICATION",
  UNRESOLVED_INVENTORY: "UNRESOLVED_INVENTORY",
  MISSING_WORKFLOW_TEMPLATE: "MISSING_WORKFLOW_TEMPLATE",
  INVALID_DEPENDENCY_CHAIN: "INVALID_DEPENDENCY_CHAIN",
  DUPLICATE_COMPONENT: "DUPLICATE_COMPONENT",
  NEGATIVE_STOCK: "NEGATIVE_STOCK",
  // warnings
  LOW_CONFIDENCE: "LOW_CONFIDENCE",
  STOCK_SHORTAGE: "STOCK_SHORTAGE",
  NO_WORKFLOW_SUGGESTION: "NO_WORKFLOW_SUGGESTION",
  UNMATCHED_SUPPLIER: "UNMATCHED_SUPPLIER",
  IGNORED_ROWS: "IGNORED_ROWS",
  // info
  MANUAL_OVERRIDE: "MANUAL_OVERRIDE",
  PARTIAL_MATCH: "PARTIAL_MATCH",
} as const;
