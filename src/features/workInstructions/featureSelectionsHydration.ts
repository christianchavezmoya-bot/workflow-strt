import type { ProductFeatureDefinition } from "../../types/product";
import type { FeatureSelection } from "../../services/productConfigService";

/**
 * GOAL 4 fix: the single source of truth for turning a WorkflowConfig's server-authoritative
 * featureSelectionsJson into the Builder's featureSelections state. Used both on initial config
 * load and after any server round trip that returns a fresh WorkflowConfig (Sync Feature Steps,
 * Import Workflow JSON) — previously only the initial load applied this, so the Builder's
 * quantity UI could keep showing stale pre-import values until a manual page refresh. A Feature
 * present in `productFeatures` but absent from the parsed selections is explicit 0/not-included,
 * never a carried-over stale value.
 *
 * A standalone module (rather than a function inside WorkflowBuilder.tsx) specifically so it can
 * be unit-tested in isolation — importing WorkflowBuilder.tsx itself currently fails under Vitest
 * due to a pre-existing @mui/x-date-pickers ESM resolution issue in one of its other
 * sub-components, unrelated to this change.
 */
export function rehydrateFeatureSelections(
  featureSelectionsJson: string,
  productFeatures: ProductFeatureDefinition[],
): FeatureSelection[] {
  let sels: FeatureSelection[] = [];
  try {
    const parsed = JSON.parse(featureSelectionsJson);
    if (Array.isArray(parsed)) sels = parsed;
  } catch {
    return productFeatures.map((f) => ({ featureId: f.id, included: false, activeCount: 0 }));
  }
  const selMap = new Map(sels.map((s) => [s.featureId, s]));
  return productFeatures.map((f) => selMap.get(f.id) ?? { featureId: f.id, included: false, activeCount: 0 });
}
