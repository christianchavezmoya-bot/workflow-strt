/** Workflow-scoped equivalent of ProductWorkflowContext (see productWorkflowContext.ts) — mirrors
 *  WorkflowAuthoringContextDto on the server. Unlike the Product-level context, this contains
 *  ONLY the Features actually selected (quantity > 0) in one specific WorkflowConfig, each with
 *  its real quantity: "this is the actual equipment configuration for this workflow," not the
 *  Product's full catalog. Never contains customer/project/run data, answers, or secrets.
 *
 *  Schema compatibility: still `schemaVersion: 1`. Every field that existed before the
 *  completeness fix (`captureFields: string[]`, `dependencyIds: string[]`, brand/supplier/…) is
 *  unchanged in shape AND meaning; the richer members below are purely additive and marked
 *  optional so older payloads (and the DB-authoritative endpoint on an older server) still type-check.
 *  Consumers should feature-detect them (e.g. `feature.dependencies?.length`). */
export interface WorkflowAuthoringContext {
  schemaVersion: number;
  product: { id: string; name: string };
  workflowConfigId: string;
  workflowConfigName: string;
  features: WorkflowAuthoringFeature[];
}

export interface WorkflowAuthoringFeature {
  featureId: string;
  name: string;
  quantity: number;
  /** LEGACY, unchanged: capture-field KEYS only (strings), de-duplicated across dependencies.
   *  Loses which dependency a field belongs to — use `dependencies[].captureFields` /
   *  `captureFieldDefinitions` for identity and relationships. */
  captureFields: string[];
  brand?: string | null;
  supplier?: string | null;
  alternativePartNumber?: string | null;
  manufacturerPartNumber?: string | null;
  unitPrice?: number | null;
  /** LEGACY, unchanged: dependency IDs only. Use `dependencies` for names and configuration. */
  dependencyIds: string[];

  // ── Additive: identity + configuration from the Product master ────────────────────────
  description?: string | null;
  valueType?: string;
  isInventory?: boolean;
  sortOrder?: number;
  options?: string[];
  subProperties?: { id: string; name: string; valueType: string; isInventory?: boolean; unit?: string }[];
  productLink?: string | null;
  /** Reference part number as generation resolves it (alternative first, else manufacturer). */
  partNumber?: string | null;
  /** The read-only "Part Number" field generation adds to each installation step, when a P/N exists. */
  partNumberField?: AuthoringCaptureField | null;

  // ── Additive: dependencies + capture fields with full identity ───────────────────────
  /** Every dependency configured for this Feature, with ID + name + configuration. */
  dependencies?: AuthoringDependency[];
  /** Where generation takes this Feature's capture fields from: real dependencies when any exist,
   *  else the Feature's own captureFields (when it is an inventory Feature), else nothing. */
  captureFieldSource?: "dependencies" | "feature" | "none";
  /** Flat, ordered capture-field definitions exactly as generation resolves them. */
  captureFieldDefinitions?: AuthoringCaptureField[];
  /** The steps generation produces for this Feature's quantity (one per unit per step type). */
  generatedSteps?: AuthoringGeneratedStep[];
}

export interface AuthoringDependency {
  dependencyId: string;
  name: string;
  /** Parent Feature. */
  featureId: string;
  featureName: string;
  /** true = inventory (serialised per unit, "installation" step); false = quantity item ("data-collection" step). */
  isInventory: boolean;
  generatedStepType: "installation" | "data-collection";
  defaultQty: number;
  unit: string | null;
  unitPrice: number;
  sortOrder: number;
  /** Per-dependency inclusion toggle from the Builder (WorkflowConfigFeature.inclusions).
   *  `null` = no inclusion state recorded for this Feature (not the same as `false`). */
  included: boolean | null;
  captureFields: AuthoringCaptureField[];
}

export interface AuthoringCaptureField {
  /** Stored capture-field key (e.g. "serialNo"), or "qty" for a non-inventory dependency's quantity field. */
  key: string;
  /** Display label generation resolves for the key (same rule as the server's CaptureFieldLabel). */
  label: string;
  /** Field type generation produces: "text" for configured keys, "number" for quantity fields. */
  type: "text" | "number";
  required: boolean;
  /** Part-number reference field only: technicians cannot edit it. */
  readOnly?: boolean;
  /** Part-number reference field only: the reference value. */
  value?: string;
  /** Position within the owning dependency's (or Feature's) configured list. */
  order: number;
  /** "dependency" = configured on a real dependency; "feature" = Feature.captureFields fallback
   *  (owned by a synthetic dependency whose id equals the Feature id); "part-number" = P/N reference. */
  source: "dependency" | "feature" | "part-number";
  featureId: string;
  featureName: string;
  /** Owning dependency id. For source "feature" this is the synthetic dependency id === featureId. */
  dependencyId: string | null;
  dependencyName: string | null;
  /** Unit-independent stable reference built only from real ids. */
  identity: string;
  /** Exact ids Publish / Sync / Import generate for this field, one per physical unit (1-based).
   *  Empty when generation would not produce the field (e.g. a non-inventory Feature's fallback fields). */
  generatedFieldIds: { unitIndex: number; fieldId: string }[];
}

export interface AuthoringGeneratedStep {
  unitIndex: number;
  stepType: "installation" | "data-collection";
  /** "feature:<featureId>:unit:<n>:<stepType>" — the seed generation derives the step id from. */
  generatorKey: string;
  stepId: string;
}
