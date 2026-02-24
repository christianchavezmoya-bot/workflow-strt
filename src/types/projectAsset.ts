export type ProjectAssetStatus = "NotStarted" | "InProgress" | "Complete" | "Issue";

export interface ProjectAsset {
  id: string;
  projectId: string;
  productId: string;
  productConfigId?: string;
  workflowTemplateId?: string;
  assetTag: string;
  serialNumber?: string;
  location?: string;
  assignedUserId?: string;
  status: ProjectAssetStatus;
  workOrderId?: string;
  notes?: string;
  /** JSON string: Record<featureId, string> */
  featureValuesJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectAssetInput {
  projectId: string;
  productId: string;
  productConfigId?: string;
  workflowTemplateId?: string;
  assetTag: string;
  serialNumber?: string;
  location?: string;
  assignedUserId?: string;
  notes?: string;
  featureValuesJson?: string;
}
