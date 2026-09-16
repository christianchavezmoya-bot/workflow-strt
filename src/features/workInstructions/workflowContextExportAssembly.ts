import type { ProductWorkflowContext } from "../../types/productWorkflowContext";
import type { FeatureSelection } from "../../services/productConfigService";
import type { WorkflowAuthoringContext, WorkflowAuthoringFeature } from "../../types/workflowAuthoringContext";

/**
 * Builds the "Workflow Actions → Export Workflow Context" JSON directly from what the Builder
 * currently has on screen — live `featureSelections` (activeCount), not whatever is persisted in
 * WorkflowConfigFeature. This is deliberate: unlike Sync/Publish/Import, which must treat the
 * persisted WorkflowConfigFeature as the canonical quantity authority, this export is an authoring
 * aid for generating a new workflow file, so the current UI state wins — a workflow that has never
 * been saved, or one whose Builder quantities have since diverged from the last save, must still
 * export exactly what the user can see at the moment they press the button. Mirrors the
 * Dependencies-win-else-Feature.captureFields fallback rule used server-side in
 * WorkflowConfigsController.GetAuthoringContext, so the two paths stay in sync even though this
 * one reads live state instead of the DB.
 *
 * A standalone module (rather than inline in WorkflowBuilder.tsx) so it can be unit-tested in
 * isolation — importing WorkflowBuilder.tsx itself fails under Vitest due to a pre-existing
 * @mui/x-date-pickers ESM resolution issue in one of its sub-components.
 */
export function assembleAuthoringContextFromBuilderState(
  productContext: ProductWorkflowContext,
  featureSelections: FeatureSelection[],
  workflowConfigId: string,
  workflowConfigName: string,
): WorkflowAuthoringContext {
  const selByFeatureId = new Map(featureSelections.map((s) => [s.featureId, s]));

  const features: WorkflowAuthoringFeature[] = [];
  for (const meta of productContext.features) {
    const sel = selByFeatureId.get(meta.featureId);
    if (!sel || sel.activeCount <= 0) continue; // zero/unselected Features are never exported

    const captureFields =
      meta.dependencies.length > 0
        ? Array.from(new Set(meta.dependencies.flatMap((d) => d.captureFields)))
        : meta.captureFields;

    features.push({
      featureId: meta.featureId,
      name: meta.name,
      quantity: sel.activeCount,
      captureFields,
      brand: meta.brand ?? null,
      supplier: meta.supplier ?? null,
      alternativePartNumber: meta.alternativePartNumber ?? null,
      manufacturerPartNumber: meta.manufacturerPartNumber ?? null,
      unitPrice: meta.unitPrice ?? null,
      dependencyIds: meta.dependencies.map((d) => d.dependencyId),
    });
  }

  return {
    schemaVersion: 1,
    product: productContext.product,
    workflowConfigId,
    workflowConfigName,
    features,
  };
}
