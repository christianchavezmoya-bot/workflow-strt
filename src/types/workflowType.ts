export interface WorkflowType {
  id: string;
  name: string;
  icon?: string;
  sortOrder: number;
  isActive: boolean;
}

export interface WorkflowAssignment {
  id: string;
  assetId: string;
  workflowConfigId: string;
  workflowTypeId: string;
  workflowTypeName: string;
  workflowConfigName: string;
  active: boolean;
  assignedBy?: string;
  assignedAt: string;
}
