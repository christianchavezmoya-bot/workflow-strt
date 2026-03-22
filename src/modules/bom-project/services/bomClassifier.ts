/**
 * bomClassifier.ts
 * Applies classification rules to canonical BOM rows.
 * Rules are evaluated in priority order; first match wins.
 */
import type { CanonicalBomRow } from "../types/canonicalBom";
import type {
  ClassificationResult,
  ClassificationRule,
  RuleCondition,
  ItemType,
} from "../types/classification";

const VALID_ITEM_TYPES: ItemType[] = ["asset", "component", "consumable", "reference", "ignore"];

function parseItemTypeHint(raw: string | undefined): ItemType | undefined {
  if (!raw) return undefined;
  const normalized = raw.toLowerCase().trim();
  // Accept common variations
  if (normalized === "inventory") return "component";
  return VALID_ITEM_TYPES.find((t) => t === normalized);
}

// ── Default built-in rules ───────────────────────────────────────────────────

const DEFAULT_RULES: ClassificationRule[] = [
  {
    id: "rule-ignore-blank",
    priority: 0,
    description: "Ignore rows with empty description and no part number",
    conditions: [
      { field: "description", operator: "equals", value: "" },
      { field: "partNumber", operator: "isNull" },
    ],
    result: { itemType: "ignore", confidenceScore: 1 },
  },
  {
    id: "rule-asset-from-vehicle",
    priority: 10,
    description: "Rows with a vehicle type and no parent become assets",
    conditions: [{ field: "vehicleType", operator: "isNotNull" }],
    result: {
      itemType: "asset",
      inventoryTracked: false,
      installRequired: true,
      confidenceScore: 0.85,
    },
  },
  {
    id: "rule-consumable",
    priority: 20,
    description: "Rows with itemScope=consumable become consumables",
    conditions: [{ field: "itemScope", operator: "equals", value: "consumable" }],
    result: {
      itemType: "consumable",
      inventoryTracked: true,
      serialRequired: false,
      confidenceScore: 0.9,
    },
  },
  {
    id: "rule-reference",
    priority: 25,
    description: "Rows with itemScope=reference become reference items",
    conditions: [{ field: "itemScope", operator: "equals", value: "reference" }],
    result: { itemType: "reference", confidenceScore: 0.9 },
  },
  {
    id: "rule-default-component",
    priority: 100,
    description: "All other rows with a part number become components",
    conditions: [{ field: "partNumber", operator: "isNotNull" }],
    result: {
      itemType: "component",
      inventoryTracked: true,
      serialRequired: false,
      installRequired: true,
      confidenceScore: 0.6,
    },
  },
];

// ── Condition evaluator ──────────────────────────────────────────────────────

function evaluateCondition(row: CanonicalBomRow, cond: RuleCondition): boolean {
  const val = row[cond.field as keyof CanonicalBomRow];
  switch (cond.operator) {
    case "equals":       return String(val ?? "") === String(cond.value ?? "");
    case "notEquals":    return String(val ?? "") !== String(cond.value ?? "");
    case "contains":     return String(val ?? "").toLowerCase().includes(String(cond.value ?? "").toLowerCase());
    case "startsWith":   return String(val ?? "").toLowerCase().startsWith(String(cond.value ?? "").toLowerCase());
    case "endsWith":     return String(val ?? "").toLowerCase().endsWith(String(cond.value ?? "").toLowerCase());
    case "gt":           return typeof val === "number" && val > Number(cond.value);
    case "lt":           return typeof val === "number" && val < Number(cond.value);
    case "isNull":       return val === undefined || val === null || val === "";
    case "isNotNull":    return val !== undefined && val !== null && val !== "";
    default:             return false;
  }
}

function evaluateRule(row: CanonicalBomRow, rule: ClassificationRule): boolean {
  return rule.conditions.every((c) => evaluateCondition(row, c));
}

// ── Main classifier ──────────────────────────────────────────────────────────

export function classifyRow(
  row: CanonicalBomRow,
  customRules: ClassificationRule[] = [],
  importRunId: string
): ClassificationResult {
  // If the BOM file had a "Type" column, honour it as a manual override
  const hint = parseItemTypeHint(row.itemTypeHint);
  if (hint) {
    return {
      classificationId: crypto.randomUUID(),
      sourceRowId: row.sourceRowId,
      importRunId,
      itemType: hint,
      inventoryTracked: hint === "component" || hint === "consumable",
      serialRequired: false,
      configurable: false,
      installRequired: hint === "asset" || hint === "component",
      testRequired: false,
      photoRequired: false,
      confidenceScore: 1,
      ruleSource: "bom-column",
      isManualOverride: true,
    };
  }

  const allRules = [...customRules, ...DEFAULT_RULES].sort(
    (a, b) => a.priority - b.priority
  );

  for (const rule of allRules) {
    if (evaluateRule(row, rule)) {
      return {
        classificationId: crypto.randomUUID(),
        sourceRowId: row.sourceRowId,
        importRunId,
        itemType: rule.result.itemType ?? "component",
        inventoryTracked: rule.result.inventoryTracked ?? false,
        serialRequired: rule.result.serialRequired ?? false,
        configurable: rule.result.configurable ?? false,
        installRequired: rule.result.installRequired ?? false,
        testRequired: rule.result.testRequired ?? false,
        photoRequired: rule.result.photoRequired ?? false,
        workflowGroup: rule.result.workflowGroup,
        parentPartNumber: rule.result.parentPartNumber,
        dependencySource: rule.result.dependencySource,
        confidenceScore: rule.result.confidenceScore ?? 0.5,
        ruleSource: rule.id,
        isManualOverride: false,
      };
    }
  }

  // Fallback
  return {
    classificationId: crypto.randomUUID(),
    sourceRowId: row.sourceRowId,
    importRunId,
    itemType: "component",
    inventoryTracked: false,
    serialRequired: false,
    configurable: false,
    installRequired: false,
    testRequired: false,
    photoRequired: false,
    confidenceScore: 0.3,
    ruleSource: "fallback",
    isManualOverride: false,
  };
}

export function classifyAllRows(
  rows: CanonicalBomRow[],
  customRules: ClassificationRule[],
  importRunId: string
): ClassificationResult[] {
  return rows.map((r) => classifyRow(r, customRules, importRunId));
}
