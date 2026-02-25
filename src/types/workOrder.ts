export type WorkOrderStatus = "InProgress" | "Complete";

export interface StepCapture {
  stepId: string;
  values: Record<string, string>; // inputId → string value
  completedAt: string;
}

export interface WorkOrder {
  id: string;
  workflowTemplateId: string;
  productId: string;
  jobReference: string;
  status: WorkOrderStatus;
  stepsData: StepCapture[];
  projectAssetId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkOrderInput {
  workflowTemplateId: string;
  productId: string;
  jobReference: string;
  stepsDataJson: string; // JSON StepCapture[]
  projectAssetId?: string;
  notes?: string;
}
