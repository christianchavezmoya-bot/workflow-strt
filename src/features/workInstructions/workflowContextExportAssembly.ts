import type { FeatureDependencyWorkflowContext, FeatureWorkflowContext, ProductWorkflowContext } from "../../types/productWorkflowContext";
import type { FeatureSelection } from "../../services/productConfigService";
import type {
  AuthoringCaptureField,
  AuthoringDependency,
  AuthoringGeneratedStep,
  WorkflowAuthoringContext,
  WorkflowAuthoringFeature,
} from "../../types/workflowAuthoringContext";
import { captureFieldLabel } from "../../utils/captureFieldLabel";
import { deterministicId } from "../../utils/deterministicId";

/** { [featureId]: { [dependencyId]: included } } — parsed WorkflowConfigFeature.inclusionsJson. */
export type InclusionsByFeature = Record<string, Record<string, boolean>>;

export interface AssembleAuthoringContextOptions {
  /** Per-dependency inclusion toggles as the Builder currently holds them. When a Feature has no
   *  entry, each of its dependencies is exported with `included: null` (unknown), never `false`. */
  inclusionsByFeature?: InclusionsByFeature;
}

/** Parses persisted WorkflowConfigFeature rows into the inclusion map the assembler takes.
 *  Malformed inclusionsJson is treated as "no inclusion state" for that Feature, never an error. */
export function inclusionsByFeatureFromRows(
  rows: { featureId: string; inclusionsJson?: string | null }[],
): InclusionsByFeature {
  const out: InclusionsByFeature = {};
  for (const row of rows) {
    try {
      const parsed: unknown = row.inclusionsJson ? JSON.parse(row.inclusionsJson) : {};
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        out[row.featureId] = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).map(([depId, v]) => [depId, v === true]),
        );
      }
    } catch {
      /* malformed JSON: leave this Feature without inclusion state */
    }
  }
  return out;
}

const isBlank = (v: string | null | undefined) => v == null || v.trim() === "";

/** Mirrors WorkflowConfigsController.ResolvePartNumber: alternative first, else manufacturer. */
function resolvePartNumber(meta: FeatureWorkflowContext): string | null {
  if (!isBlank(meta.alternativePartNumber)) return meta.alternativePartNumber!;
  if (!isBlank(meta.manufacturerPartNumber)) return meta.manufacturerPartNumber!;
  return null;
}

const unitsOf = (quantity: number) => Array.from({ length: quantity }, (_, i) => i + 1);

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
 * COMPLETENESS: the export carries the identity and structure of dependencies and capture fields,
 * not just display text — every dependency with its id/name/configuration, and every capture
 * field with its key, label, type, required flag, owning dependency, stable identity and the exact
 * per-unit ids the generators (Publish / Sync Feature Steps / Import) will assign. The original
 * summary fields (`captureFields: string[]`, `dependencyIds: string[]`) are kept byte-for-byte as
 * before so existing readers keep working; the richer members are additive (schemaVersion stays 1).
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
  options: AssembleAuthoringContextOptions = {},
): WorkflowAuthoringContext {
  const selByFeatureId = new Map(featureSelections.map((s) => [s.featureId, s]));

  const features: WorkflowAuthoringFeature[] = [];
  for (const meta of productContext.features) {
    const sel = selByFeatureId.get(meta.featureId);
    if (!sel || sel.activeCount <= 0) continue; // zero/unselected Features are never exported

    // LEGACY summary fields — computed exactly as before the completeness fix.
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
      ...buildStructure(meta, sel.activeCount, options.inclusionsByFeature?.[meta.featureId]),
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

/** The additive identity/structure members for one exported Feature. */
function buildStructure(
  meta: FeatureWorkflowContext,
  quantity: number,
  inclusions: Record<string, boolean> | undefined,
): Partial<WorkflowAuthoringFeature> {
  const featureId = meta.featureId;
  const units = unitsOf(quantity);
  const realDeps = [...meta.dependencies].sort((a, b) => a.sortOrder - b.sortOrder); // stable; matches ORDER BY SortOrder

  const inclusionOf = (dep: FeatureDependencyWorkflowContext): boolean | null =>
    inclusions ? inclusions[dep.dependencyId] === true : null;

  const field = (
    f: Omit<AuthoringCaptureField, "featureId" | "featureName" | "identity" | "generatedFieldIds">,
    dependencyId: string | null,
    dependencyName: string | null,
    generates: boolean,
    seedOf: (unitIndex: number) => string,
    identity: string,
  ): AuthoringCaptureField => ({
    ...f,
    featureId,
    featureName: meta.name,
    dependencyId,
    dependencyName,
    identity,
    generatedFieldIds: generates ? units.map((unitIndex) => ({ unitIndex, fieldId: deterministicId(seedOf(unitIndex)) })) : [],
  });

  const dependencies: AuthoringDependency[] = realDeps.map((dep) => {
    const included = inclusionOf(dep);
    const generates = included !== false; // unknown (null) is exported as if generated
    const fields: AuthoringCaptureField[] = dep.isInventory
      ? dep.captureFields.map((key, order) =>
          field(
            { key, label: captureFieldLabel(key), type: "text", required: true, order, source: "dependency", dependencyId: dep.dependencyId, dependencyName: dep.name },
            dep.dependencyId, dep.name, generates,
            (u) => `field:${featureId}:unit:${u}:dep:${dep.dependencyId}:key:${key}`,
            `feature:${featureId}:dep:${dep.dependencyId}:key:${key}`,
          ),
        )
      : [
          field(
            { key: "qty", label: `Actual qty — ${dep.name} (${dep.unit ?? "units"})`, type: "number", required: true, order: 0, source: "dependency", dependencyId: dep.dependencyId, dependencyName: dep.name },
            dep.dependencyId, dep.name, generates,
            (u) => `field:${featureId}:unit:${u}:dep:${dep.dependencyId}:key:qty`,
            `feature:${featureId}:dep:${dep.dependencyId}:key:qty`,
          ),
        ];
    return {
      dependencyId: dep.dependencyId,
      name: dep.name,
      featureId: dep.featureId,
      featureName: meta.name,
      isInventory: dep.isInventory,
      generatedStepType: dep.isInventory ? "installation" : "data-collection",
      defaultQty: dep.defaultQty,
      unit: dep.unit ?? null,
      unitPrice: dep.unitPrice,
      sortOrder: dep.sortOrder,
      included,
      captureFields: fields,
    };
  });

  // Where the capture fields come from — same rule as generation.
  let captureFieldSource: "dependencies" | "feature" | "none";
  let captureFieldDefinitions: AuthoringCaptureField[];
  if (realDeps.length > 0) {
    captureFieldSource = "dependencies";
    captureFieldDefinitions = dependencies.flatMap((d) => d.captureFields);
  } else if (meta.captureFields.length > 0) {
    // Feature-level fallback: modeled by generation as a synthetic inventory dependency whose id
    // is the Feature's own id. Only inventory Features actually generate from it.
    captureFieldSource = "feature";
    captureFieldDefinitions = meta.captureFields.map((key, order) =>
      field(
        { key, label: captureFieldLabel(key), type: "text", required: true, order, source: "feature", dependencyId: featureId, dependencyName: meta.name },
        featureId, meta.name, meta.isInventory,
        (u) => `field:${featureId}:unit:${u}:dep:${featureId}:key:${key}`,
        `feature:${featureId}:dep:${featureId}:key:${key}`,
      ),
    );
  } else {
    captureFieldSource = "none";
    captureFieldDefinitions = [];
  }

  // Which step types generation produces (only dependencies that are not switched off count).
  const active = realDeps.filter((d) => inclusionOf(d) !== false);
  const hasInstallation =
    realDeps.length > 0 ? active.some((d) => d.isInventory) : meta.isInventory && meta.captureFields.length > 0;
  const hasDataCollection = realDeps.length > 0 && active.some((d) => !d.isInventory);

  const generatedSteps: AuthoringGeneratedStep[] = units.flatMap((unitIndex) => {
    const steps: AuthoringGeneratedStep[] = [];
    for (const [stepType, on] of [["installation", hasInstallation], ["data-collection", hasDataCollection]] as const) {
      if (!on) continue;
      const generatorKey = `feature:${featureId}:unit:${unitIndex}:${stepType}`;
      steps.push({ unitIndex, stepType, generatorKey, stepId: deterministicId(`step:${generatorKey}`) });
    }
    return steps;
  });

  const partNumber = resolvePartNumber(meta);
  const partNumberField: AuthoringCaptureField | null = partNumber
    ? field(
        { key: "partNumber", label: "Part Number", type: "text", required: false, readOnly: true, value: partNumber, order: 0, source: "part-number", dependencyId: null, dependencyName: null },
        null, null, hasInstallation,
        (u) => `field:${featureId}:unit:${u}:partNumber`,
        `feature:${featureId}:partNumber`,
      )
    : null;

  return {
    description: meta.description ?? null,
    valueType: meta.valueType,
    isInventory: meta.isInventory,
    sortOrder: meta.sortOrder,
    options: meta.options,
    subProperties: meta.subProperties,
    productLink: meta.productLink ?? null,
    partNumber,
    partNumberField,
    dependencies,
    captureFieldSource,
    captureFieldDefinitions,
    generatedSteps,
  };
}
