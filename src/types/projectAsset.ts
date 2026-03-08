export type ProjectAssetStatus = "NotStarted" | "InProgress" | "Complete" | "Issue";

export interface IssueComment {
  id: string;
  text: string;
  author: string;
  createdAt: string;
}

export interface AssetIssue {
  id: string;
  description: string;
  /** "blocking" | "observation" | "scope-deviation" */
  issueType: "blocking" | "observation" | "scope-deviation";
  isBlocking: boolean;
  severity: "low" | "medium" | "high";
  stepId?: string;
  stepTitle?: string;
  reportedAt: string;
  resolved: boolean;
  comments?: IssueComment[];
  resolutionNote?: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface ProjectAsset {
  id: string;
  projectId: string;
  productId: string;
  productConfigId?: string;
  workflowTemplateId?: string;
  assetTag: string;
  /** Equipment type/name e.g. "AGI-10", "Shuttle Car", "Skid Steer" */
  assetName?: string;
  serialNumber?: string;
  assetModel?: string;
  manufacturer?: string;
  location?: string;
  assignedUserId?: string;
  status: ProjectAssetStatus;
  workOrderId?: string;
  notes?: string;
  /** JSON string: Record<featureId, string> */
  featureValuesJson: string;
  /** JSON string: AssetIssue[] */
  issuesJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectAssetInput {
  projectId: string;
  productId: string;
  productConfigId?: string;
  workflowTemplateId?: string;
  assetTag: string;
  assetName?: string;
  serialNumber?: string;
  assetModel?: string;
  manufacturer?: string;
  location?: string;
  assignedUserId?: string;
  notes?: string;
  featureValuesJson?: string;
  issuesJson?: string;
}
