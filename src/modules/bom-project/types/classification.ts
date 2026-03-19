export type ItemType =
  | "asset"
  | "component"
  | "consumable"
  | "reference"
  | "ignore";

export type DependencySource = "rule" | "manual" | "template";

/** Classification result for a single normalized BOM row */
export interface ClassificationResult {
  classificationId: string;
  sourceRowId: string;
  importRunId: string;

  // ── Classification ───────────────────────────────────────────────────────
  itemType: ItemType;
  inventoryTracked: boolean;
  serialRequired: boolean;
  configurable: boolean;
  installRequired: boolean;
  testRequired: boolean;
  photoRequired: boolean;

  // ── Grouping / hierarchy ──────────────────────────────────────────────────
  workflowGroup?: string;
  parentPartNumber?: string;
  dependencySource?: DependencySource;

  // ── Audit ────────────────────────────────────────────────────────────────
  confidenceScore: number;   // 0–1
  ruleSource?: string;
  isManualOverride: boolean;
}

/** A saved rule profile the user can reuse */
export interface RuleProfile {
  id: string;
  name: string;
  rules: ClassificationRule[];
  createdAt: string;
  updatedAt: string;
}

export interface ClassificationRule {
  id: string;
  priority: number;
  description: string;
  /** JSON-path-like conditions, e.g. partNumber.startsWith("MOD") */
  conditions: RuleCondition[];
  result: Partial<ClassificationResult>;
}

export interface RuleCondition {
  field: keyof import("./canonicalBom").CanonicalBomRow;
  operator:
    | "equals"
    | "notEquals"
    | "contains"
    | "startsWith"
    | "endsWith"
    | "gt"
    | "lt"
    | "isNull"
    | "isNotNull";
  value?: string | number | boolean;
}
