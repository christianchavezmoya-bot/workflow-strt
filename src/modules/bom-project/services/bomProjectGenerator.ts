/**
 * bomProjectGenerator.ts
 * Builds DraftProject / DraftAsset / DraftComponent trees from classified rows.
 */
import type { CanonicalBomRow } from "../types/canonicalBom";
import type { ClassificationResult } from "../types/classification";
import type {
  DraftProject,
  DraftAsset,
  DraftComponent,
  DraftFeature,
  CaptureFieldPreview,
} from "../types/projectDraft";

interface GeneratorInput {
  importRunId: string;
  projectName: string;
  rows: CanonicalBomRow[];
  classifications: ClassificationResult[];
}

export function generateDraftProject(input: GeneratorInput): DraftProject {
  const { importRunId, projectName, rows, classifications } = input;

  const classMap = new Map<string, ClassificationResult>(
    classifications.map((c) => [c.sourceRowId, c])
  );

  // ── Identify assets ───────────────────────────────────────────────────────
  const assetRows = rows.filter(
    (r) => classMap.get(r.sourceRowId)?.itemType === "asset"
  );

  // ── Build asset drafts ────────────────────────────────────────────────────
  const draftProjectId = crypto.randomUUID();
  const assets: DraftAsset[] = assetRows.map((assetRow) => {
    const cl = classMap.get(assetRow.sourceRowId)!;
    const draftAssetId = crypto.randomUUID();
    const assetName = assetRow.assetNameCandidate ?? assetRow.vehicleType ?? assetRow.description;

    // Find component rows that belong to this asset (same group / vehicle type)
    const componentRows = rows.filter((r) => {
      const rcl = classMap.get(r.sourceRowId);
      if (!rcl || rcl.itemType === "asset" || rcl.itemType === "ignore" || rcl.itemType === "reference") return false;
      // Match by vehicle type or group name
      if (assetRow.vehicleType && r.vehicleType === assetRow.vehicleType && r.sourceRowId !== assetRow.sourceRowId) return true;
      if (assetRow.groupName && r.groupName === assetRow.groupName && r.sourceRowId !== assetRow.sourceRowId) return true;
      return false;
    });

    const components: DraftComponent[] = componentRows.map((cr) => {
      const ccl = classMap.get(cr.sourceRowId)!;
      return {
        draftComponentId: crypto.randomUUID(),
        draftAssetId,
        partNumber: cr.partNumber,
        description: cr.description,
        qtyRequired: cr.qty ?? cr.requiredQty ?? 1,
        itemType: ccl.itemType === "consumable" ? "consumable" : "component",
        inventoryTracked: ccl.inventoryTracked,
        serialRequired: ccl.serialRequired,
        stockQty: cr.stockQty,
        differenceQty: cr.differenceQty,
        sourceRowId: cr.sourceRowId,
      };
    });

    const features: DraftFeature[] = buildFeaturesFromClassification(cl, draftAssetId);
    const captureFields: CaptureFieldPreview[] = buildCaptureFields(cl, components);
    const hasShortage = components.some(
      (c) => c.differenceQty !== undefined && c.differenceQty < 0
    );

    return {
      draftAssetId,
      draftProjectId,
      assetName,
      partNumber: assetRow.partNumber,
      assetType: assetRow.vehicleType,
      configType: cl.workflowGroup,
      workflowTemplateCandidate: undefined, // resolved by adapter
      location: undefined,
      quantityMode: "single",
      components,
      features,
      dependencies: [],
      captureFields,
      sourceRowIds: [assetRow.sourceRowId, ...componentRows.map((r) => r.sourceRowId)],
      inventoryStatus: hasShortage ? "shortage" : components.length > 0 ? "ok" : "unknown",
    };
  });

  return {
    draftProjectId,
    importRunId,
    projectName,
    status: "draft",
    assets,
  };
}

function buildFeaturesFromClassification(
  cl: ClassificationResult,
  draftAssetId: string
): DraftFeature[] {
  const features: DraftFeature[] = [];

  if (cl.installRequired) {
    features.push({
      draftFeatureId: crypto.randomUUID(),
      draftAssetId,
      featureName: "Installation",
      featureType: "installation",
      configurable: cl.configurable,
      testRequired: cl.testRequired,
      photoRequired: cl.photoRequired,
    });
  }
  if (cl.testRequired) {
    features.push({
      draftFeatureId: crypto.randomUUID(),
      draftAssetId,
      featureName: "Commissioning Test",
      featureType: "test",
      configurable: false,
      testRequired: true,
      photoRequired: cl.photoRequired,
    });
  }

  return features;
}

function buildCaptureFields(
  cl: ClassificationResult,
  components: DraftComponent[]
): CaptureFieldPreview[] {
  const fields: CaptureFieldPreview[] = [];
  if (cl.serialRequired || components.some((c) => c.serialRequired)) {
    fields.push({ fieldType: "serialNumber", label: "Serial Number", required: true });
  }
  fields.push({ fieldType: "assetTag", label: "Asset Tag", required: false });
  fields.push({ fieldType: "location", label: "Install Location", required: false });
  if (cl.testRequired) {
    fields.push({ fieldType: "passFail", label: "Test Result", required: true });
  }
  if (cl.photoRequired) {
    fields.push({ fieldType: "photo", label: "Photo Evidence", required: true });
  }
  fields.push({ fieldType: "notes", label: "Notes", required: false });
  return fields;
}
