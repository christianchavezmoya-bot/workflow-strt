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
import { createBomId } from "./bomId";

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

  const sortedRows = [...rows].sort((a, b) => {
    if (a.sheetName !== b.sheetName) return a.sheetName.localeCompare(b.sheetName);
    return a.rowIndex - b.rowIndex;
  });

  const assetRows = sortedRows.filter(
    (row) => classMap.get(row.sourceRowId)?.itemType === "asset"
  );

  const componentCandidateRows = sortedRows.filter((row) => {
    const classification = classMap.get(row.sourceRowId);
    return !!classification
      && classification.itemType !== "asset"
      && classification.itemType !== "ignore"
      && classification.itemType !== "reference";
  });

  const assignedComponentIds = new Set<string>();
  const draftProjectId = createBomId("draft-project");

  const assets: DraftAsset[] = assetRows.map((assetRow) => {
    const assetClassification = classMap.get(assetRow.sourceRowId)!;
    const draftAssetId = createBomId("draft-asset");
    const assetName = assetRow.assetNameCandidate ?? assetRow.vehicleType ?? assetRow.description;

    const explicitMatches = componentCandidateRows.filter((row) => {
      if (assignedComponentIds.has(row.sourceRowId)) return false;
      const rowClassification = classMap.get(row.sourceRowId);
      if (!rowClassification) return false;

      if (rowClassification.parentPartNumber && assetRow.partNumber && rowClassification.parentPartNumber === assetRow.partNumber) {
        return true;
      }
      if (assetRow.groupName && row.groupName && row.groupName === assetRow.groupName) {
        return true;
      }
      if (assetRow.vehicleType && row.vehicleType && row.vehicleType === assetRow.vehicleType) {
        return true;
      }
      return false;
    });

    explicitMatches.forEach((row) => assignedComponentIds.add(row.sourceRowId));

    const assetIndex = sortedRows.findIndex((row) => row.sourceRowId === assetRow.sourceRowId);
    const nextAssetIndex = sortedRows.findIndex(
      (row, index) =>
        index > assetIndex &&
        row.sheetName === assetRow.sheetName &&
        classMap.get(row.sourceRowId)?.itemType === "asset"
    );
    const endIndex = nextAssetIndex >= 0 ? nextAssetIndex : sortedRows.length;

    const sequentialMatches = explicitMatches.length === 0
      ? sortedRows.slice(assetIndex + 1, endIndex).filter((row) => {
          if (assignedComponentIds.has(row.sourceRowId)) return false;
          const rowClassification = classMap.get(row.sourceRowId);
          return !!rowClassification
            && rowClassification.itemType !== "asset"
            && rowClassification.itemType !== "ignore"
            && rowClassification.itemType !== "reference";
        })
      : [];

    sequentialMatches.forEach((row) => assignedComponentIds.add(row.sourceRowId));

    const componentRows = [...explicitMatches, ...sequentialMatches];
    const components: DraftComponent[] = componentRows.map((row) => {
      const rowClassification = classMap.get(row.sourceRowId)!;
      return {
        draftComponentId: createBomId("draft-component"),
        draftAssetId,
        partNumber: row.partNumber,
        description: row.description,
        qtyRequired: row.qty ?? row.requiredQty ?? 1,
        itemType: rowClassification.itemType === "consumable" ? "consumable" : "component",
        inventoryTracked: rowClassification.inventoryTracked,
        serialRequired: rowClassification.serialRequired,
        stockQty: row.stockQty,
        differenceQty: row.differenceQty,
        sourceRowId: row.sourceRowId,
      };
    });

    const features: DraftFeature[] = buildFeaturesFromClassification(assetClassification, draftAssetId);
    const captureFields: CaptureFieldPreview[] = buildCaptureFields(assetClassification, components);
    const hasShortage = components.some(
      (component) => component.differenceQty !== undefined && component.differenceQty < 0
    );

    return {
      draftAssetId,
      draftProjectId,
      assetName,
      partNumber: assetRow.partNumber,
      assetType: assetRow.vehicleType,
      configType: assetClassification.workflowGroup,
      workflowTemplateCandidate: undefined,
      location: undefined,
      quantityMode: "single",
      components,
      features,
      dependencies: [],
      captureFields,
      sourceRowIds: [assetRow.sourceRowId, ...componentRows.map((row) => row.sourceRowId)],
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
  classification: ClassificationResult,
  draftAssetId: string
): DraftFeature[] {
  const features: DraftFeature[] = [];

  if (classification.installRequired) {
    features.push({
      draftFeatureId: createBomId("draft-feature"),
      draftAssetId,
      featureName: "Installation",
      featureType: "installation",
      configurable: classification.configurable,
      testRequired: classification.testRequired,
      photoRequired: classification.photoRequired,
    });
  }
  if (classification.testRequired) {
    features.push({
      draftFeatureId: createBomId("draft-feature"),
      draftAssetId,
      featureName: "Commissioning Test",
      featureType: "test",
      configurable: false,
      testRequired: true,
      photoRequired: classification.photoRequired,
    });
  }

  return features;
}

function buildCaptureFields(
  classification: ClassificationResult,
  components: DraftComponent[]
): CaptureFieldPreview[] {
  const fields: CaptureFieldPreview[] = [];
  if (classification.serialRequired || components.some((component) => component.serialRequired)) {
    fields.push({ fieldType: "serialNumber", label: "Serial Number", required: true });
  }
  fields.push({ fieldType: "assetTag", label: "Asset Tag", required: false });
  fields.push({ fieldType: "location", label: "Install Location", required: false });
  if (classification.testRequired) {
    fields.push({ fieldType: "passFail", label: "Test Result", required: true });
  }
  if (classification.photoRequired) {
    fields.push({ fieldType: "photo", label: "Photo Evidence", required: true });
  }
  fields.push({ fieldType: "notes", label: "Notes", required: false });
  return fields;
}
