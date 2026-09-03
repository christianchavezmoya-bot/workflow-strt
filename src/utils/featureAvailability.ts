import type { ProductFeatureDefinition } from "../types/product";
import type { FeatureSelection } from "../services/productConfigService";

/**
 * Governs whether a Feature Library item should be offered as a NEW choice in a Workflow
 * Builder picker (the "Installed Features" quantity list, and the Features tab). This is
 * display-only — it must never be used to filter the feature list handed to Workflow
 * Builder for resolving already-referenced features (name/type/subProperties lookups for
 * steps that already exist), or an existing workflow that references a feature which has
 * since become Feature: No would silently lose that feature's display.
 *
 * Feature: Yes (isInventory === true) is always offered. Feature: No is hidden from NEW
 * selection, but an item already selected in the current context (activeCount > 0, or
 * included) remains visible/adjustable — editing Yes → No must not yank an already-chosen
 * feature out from under whoever is mid-edit.
 */
export function isFeatureAvailableForNewSelection(
  feature: Pick<ProductFeatureDefinition, "id" | "isInventory">,
  selections: Pick<FeatureSelection, "featureId" | "included" | "activeCount">[],
): boolean {
  if (feature.isInventory) return true;
  const sel = selections.find((s) => s.featureId === feature.id);
  return Boolean(sel && (sel.included || sel.activeCount > 0));
}
