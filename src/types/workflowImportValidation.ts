/** WF-6C: validation summary returned by POST /workflow-configs/{id}/import/validate — shown to
 *  the admin before import commits anything. Mirrors WorkflowImportValidationDto. */
export interface WorkflowImportValidation {
  valid: boolean;
  productId: string;
  productName: string;
  featureReferencesMatched: number;
  featureReferencesTotal: number;
  dependencyReferencesMatched: number;
  dependencyReferencesTotal: number;
  customStepCount: number;
  generatedStepsToReconstruct: number;
  unknownFeatureIds: string[];
  unknownDependencyIds: string[];
  schemaVersionSupported: boolean;
  productMatches: boolean;
  /** featureIds appearing more than once in featureSelections[] — never silently merged. */
  duplicateFeatureIds: string[];
}
