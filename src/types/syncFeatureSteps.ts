/** One unlocked run whose immutable snapshot still references the step — blocks its removal. */
export interface SyncFeatureStepBlockingRun {
  runId: string;
  assetId: string;
}

/**
 * One generated step's outcome from POST /workflow-configs/{id}/sync-feature-steps.
 *
 * A `blocked` item can represent a whole step that couldn't be removed at all (appliedFieldIds
 * absent), or a step that was partially reconciled: appliedFieldIds lists fields that WERE safely
 * added, blockedFieldIds lists fields that could NOT be removed because a run still references
 * this step (see blockingRuns). appliedFieldIds is also populated on `updated` items.
 */
export interface SyncFeatureStepItem {
  stepId: string;
  generatorKey: string;
  featureId: string;
  unitIndex: number;
  stepType: string;
  title: string;
  blockingRuns?: SyncFeatureStepBlockingRun[] | null;
  appliedFieldIds?: string[] | null;
  blockedFieldIds?: string[] | null;
}

/** Result of POST /workflow-configs/{id}/sync-feature-steps. */
export interface SyncFeatureStepsResult {
  added: SyncFeatureStepItem[];
  updated: SyncFeatureStepItem[];
  removed: SyncFeatureStepItem[];
  unchanged: SyncFeatureStepItem[];
  blocked: SyncFeatureStepItem[];
}

/** WF-6: 409 response body from POST /workflow-configs/{id}/import when the import would require
 *  removing/changing a generated step an unlocked run still references. Import is all-or-nothing
 *  on this — nothing was persisted when this comes back. */
export interface WorkflowImportBlocked {
  message: string;
  blockedSteps: SyncFeatureStepItem[];
}
