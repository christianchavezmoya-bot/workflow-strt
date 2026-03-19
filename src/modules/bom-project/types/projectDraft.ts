export type DraftStatus =
  | "draft"
  | "validated"
  | "ready_to_publish"
  | "published";

export interface DraftProject {
  draftProjectId: string;
  importRunId: string;
  projectName: string;
  productFamily?: string;
  revision?: string;
  customerName?: string;
  siteName?: string;
  status: DraftStatus;
  assets: DraftAsset[];
}

export interface DraftAsset {
  draftAssetId: string;
  draftProjectId: string;
  assetName: string;
  assetType?: string;
  configType?: string;
  workflowTemplateCandidate?: string;
  location?: string;
  quantityMode?: "single" | "fleet";
  components: DraftComponent[];
  features: DraftFeature[];
  dependencies: DraftDependency[];
  captureFields: CaptureFieldPreview[];
  /** Source row IDs that produced this asset */
  sourceRowIds: string[];
  inventoryStatus: "ok" | "shortage" | "unknown";
}

export interface DraftComponent {
  draftComponentId: string;
  draftAssetId: string;
  partNumber?: string;
  description: string;
  qtyRequired: number;
  itemType: "component" | "consumable";
  inventoryTracked: boolean;
  serialRequired: boolean;
  captureSchemaId?: string;
  stockQty?: number;
  differenceQty?: number;
  sourceRowId: string;
}

export interface DraftFeature {
  draftFeatureId: string;
  draftAssetId: string;
  featureName: string;
  featureType?: string;
  configurable: boolean;
  testRequired: boolean;
  photoRequired: boolean;
  dependencySourceRule?: string;
  sourceRowId?: string;
}

export interface DraftDependency {
  prerequisiteItem: string;
  dependentItem: string;
  blocking: boolean;
  source: "rule" | "manual" | "template";
  generatedInstallOrder?: number;
}

export type CaptureFieldType =
  | "partNumber"
  | "serialNumber"
  | "assetTag"
  | "location"
  | "ipAddress"
  | "firmwareVersion"
  | "photo"
  | "passFail"
  | "measurement"
  | "notes"
  | "custom";

export interface CaptureFieldPreview {
  fieldType: CaptureFieldType;
  label: string;
  required: boolean;
  sourceFeatureId?: string;
}
