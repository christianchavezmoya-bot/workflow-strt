export type WorkflowConfigStatus = "Draft" | "Published" | "Archived";

export interface WorkflowConfig {
  id: string;
  productId: string;
  name: string;
  displayName?: string;
  configType?: string;
  status: WorkflowConfigStatus;
  version: number;
  templateSourceId?: string;
  stepsJson: string;
  mediaJson: string;
  featureSelectionsJson: string;
  notes?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertWorkflowConfigInput {
  name: string;
  productId: string;
  displayName?: string;
  configType?: string;
  notes?: string;
  stepsJson?: string;
  mediaJson?: string;
  featureSelectionsJson?: string;
}
