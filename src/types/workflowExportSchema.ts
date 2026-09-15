import type { WorkflowStep } from "./workflow";
import type { DepInclusions } from "./workflowConfigFeature";

/** Current version of the reusable workflow JSON schema (WF-1/WF-6). Bump on breaking shape changes. */
export const WORKFLOW_EXPORT_SCHEMA_VERSION = 1;

/**
 * One WorkflowConfigFeature's worth of selection state, serialized by reference only —
 * featureId/dependencyId point back at Product-linked master data (Feature/FeatureDependency),
 * which is never duplicated into this schema. An importer must re-resolve these ids against
 * live master data rather than trust any embedded definition.
 */
export interface WorkflowExportFeatureSelection {
  featureId: string;
  /** Canonical quantity — mirrors WorkflowConfigFeature.quantity, not FeatureSelection.activeCount. */
  quantity: number;
  /** { [dependencyId]: boolean } — same shape as WorkflowConfigFeature.inclusionsJson parsed. */
  inclusions: DepInclusions;
}

/**
 * The reusable workflow JSON schema (WF-1/WF-6): a portable, product-scoped description of a
 * WorkflowConfig suitable for AI-agent generation or human authoring outside the Builder UI.
 *
 * - `featureSelections` is references + selection state only (see WorkflowExportFeatureSelection).
 * - `steps` includes both feature-generated steps (stepOrigin: "feature-generated", carrying their
 *   generatorKey) and custom/imported steps (stepOrigin: "custom") verbatim. On import, generated
 *   steps are informational only — the importer regenerates them from `featureSelections` against
 *   current Product master data rather than trusting this array as authoritative for that subset.
 * - Product master data (Feature/FeatureDependency definitions) must never be embedded here.
 */
export interface WorkflowExportDocument {
  schemaVersion: typeof WORKFLOW_EXPORT_SCHEMA_VERSION;
  productId: string;
  name: string;
  featureSelections: WorkflowExportFeatureSelection[];
  steps: WorkflowStep[];
}
