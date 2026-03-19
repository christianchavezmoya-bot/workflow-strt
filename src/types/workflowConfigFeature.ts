/**
 * Links a WorkflowConfig to a Feature with a qty and per-dependency inclusion flags.
 * inclusions: { [dependencyId]: boolean } — true = generate a BOM step on Publish.
 */
export interface WorkflowConfigFeature {
  id: string;
  workflowConfigId: string;
  featureId: string;
  quantity: number;
  /** JSON string: { [dependencyId]: boolean } */
  inclusionsJson: string;
  sortOrder: number;
}

/** Parsed form of inclusionsJson */
export type DepInclusions = Record<string, boolean>;
