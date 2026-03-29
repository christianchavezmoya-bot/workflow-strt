// Workflow Builder — data model
// Phase 1: localStorage-persisted per-product workflow templates.

export type StepInputType =
  | "text"
  | "number"
  | "choice"
  | "checkbox"
  | "photo"
  | "video"
  | "signature"
  | "note"
  | "scan"
  | "date"
  | "component";

export type CaptureFieldType = "text" | "number" | "scan" | "date";

/** A structured data-capture field that generates the as-built document. */
export interface CaptureField {
  id: string;
  /** Machine-readable key used in asBuiltJson, e.g. "serialNumber", "firmwareVersion" */
  key: string;
  label: string;
  type: CaptureFieldType;
  required: boolean;
  /** Unit suffix displayed after the value, e.g. "dBm", "V", "°C" */
  unit?: string;
  /** Placeholder hint text */
  hint?: string;
  /** Product feature this field was generated from — drives repeat qty */
  featureId?: string;
}

export interface Decision {
  id: string;
  label: string;
  targetStepId: string | null;
}

export interface StepInput {
  id: string;
  type: StepInputType;
  label: string;
  required: boolean;
  options?: string[]; // for "choice" type
  featureId?: string; // set when sourced from a product feature definition
  subFields?: { id: string; name: string }[]; // for "component" type
}

export type StepType =
  | "preparation"
  | "installation"
  | "data-collection"
  | "test-acceptance"
  | "final-inspection"
  | "return-to-service"
  | "custom";

export const STEP_TYPE_LABELS: Record<StepType, string> = {
  "preparation":      "Preparation / Permits",
  "installation":     "Installation",
  "data-collection":  "Data Collection",
  "test-acceptance":  "Test & Acceptance",
  "final-inspection": "Final Inspection",
  "return-to-service":"Return to Service",
  "custom":           "Custom",
};

export interface WorkflowStep {
  id: string;
  order: number;
  title: string;
  description: string;
  /** When true, overrideReportText is used in the report instead of description */
  overrideInReport: boolean;
  overrideReportText: string;
  includeDescriptionInReport: boolean;
  mediaIds: string[];
  decisionsEnabled: boolean;
  decisions: Decision[];
  inputs: StepInput[];
  nextStepId: string | null;
  /** Structured data capture fields that roll up into the as-built document */
  captureFields?: CaptureField[];
  /** Step type — drives auto-population of title, description, inputs and captures */
  stepType?: StepType;
  /** Feature linked to this step (Installation / Data Collection) */
  stepFeatureId?: string;
  /** 1-based unit index for Installation / Data Collection steps */
  stepUnitIndex?: number;
  /** When set, this step repeats once per unit of the specified product feature.
   *  The qty comes from featureSelections defined in the workflow config.
   *  At runtime the installer confirms (or modifies) the expected qty. */
  repeatFeatureId?: string;
  /** Legacy: freeform repeatable toggle (replaced by repeatFeatureId). Kept for backward compat. */
  repeatable?: boolean;
  /** Legacy: label for each repeated unit. Kept for backward compat. */
  repeatLabel?: string;
}

export interface MediaItem {
  id: string;
  type: "image" | "video";
  name: string;
  size: number;
  mime: string;
  url: string;
  createdAt: number;
}

/** One item in the Bill of Materials for a workflow config */
export interface BomItem {
  id: string;
  description: string;
  partNumber?: string;
  /** true = tracked inventory (capture fields per unit), false = consumable (capture qty only) */
  isInventory: boolean;
  expectedQty: number;
  /** Unit of measure: "ea", "m", "kg", etc. */
  unitOfMeasure: string;
  /** Field names to capture per unit for inventory items, e.g. ["Serial No","Firmware","IP Address"] */
  captureFields?: string[];
  notes?: string;
}

/** Technician-confirmed BOM entry recorded on run completion */
export interface BomActualItem {
  bomItemId: string;
  description: string;
  isInventory: boolean;
  expectedQty: number;
  actualQty: number;
  unitOfMeasure: string;
  /** Per-unit captured values: one Record per unit, keyed by field name */
  unitCaptures?: Array<Record<string, string>>;
  notes?: string;
  /** Consumable was not applicable for this job */
  isNA?: boolean;
  /** Item was used but not in the original BOM (added by technician) */
  isUnlisted?: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  productId: string;
  createdAt: number;
  steps: WorkflowStep[];
  media: MediaItem[];
  /** Bill of materials defined on this workflow config */
  bomItems?: BomItem[];
}
