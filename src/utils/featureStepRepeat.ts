import type { WorkflowStep } from "../types/workflow";
import type { FeatureSelection } from "../services/productConfigService";

export interface FeatureLinkContext<F> {
  feature: F;
  sel: FeatureSelection;
}

/**
 * Resolve the product feature a runtime-repeatable step is linked to, or null if the step is not
 * feature-repeatable.
 *
 * WF-3 compatibility guard: a feature-generated step already carries a specific physical unit
 * (stepUnitIndex) baked in at publish time — WorkflowConfigsController.Publish() unrolls one step
 * per unit instead of one step repeated N times at runtime. Such a step must never enter this
 * legacy runtime feature-repeat path (it would otherwise prompt WorkOrderRunner to repeat an
 * already-unit-specific step). Legacy/manually-authored steps (stepOrigin undefined, or anything
 * other than "feature-generated") are unaffected and keep repeating exactly as before.
 */
export function getFeatureLinkContext<F extends { id: string; name: string }>(
  step: WorkflowStep,
  featureSelections: FeatureSelection[] | undefined,
  productFeatures: F[] | undefined,
): FeatureLinkContext<F> | null {
  if (step.stepOrigin === "feature-generated" && step.stepUnitIndex != null) return null;

  for (const inp of step.inputs ?? []) {
    if (inp.featureId) {
      const sel = (featureSelections ?? []).find((s) => s.featureId === inp.featureId && s.activeCount > 0);
      const feat = (productFeatures ?? []).find((f) => f.id === inp.featureId);
      if (sel && feat) return { feature: feat, sel };
    }
  }
  for (const cf of step.captureFields ?? []) {
    if (cf.featureId) {
      const sel = (featureSelections ?? []).find((s) => s.featureId === cf.featureId && s.activeCount > 0);
      const feat = (productFeatures ?? []).find((f) => f.id === cf.featureId);
      if (sel && feat) return { feature: feat, sel };
    }
  }
  return null;
}
