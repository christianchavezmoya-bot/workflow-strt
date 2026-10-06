export type ProjectAssetStatus = "NotStarted" | "InProgress" | "Paused" | "Pending" | "Complete" | "Closed" | "Issue" | "Cancelled";

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
  reportMedia?: string[];
  resolutionMedia?: string[];
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
  assetName?: string;
  serialNumber?: string;
  assetModel?: string;
  manufacturer?: string;
  location?: string;
  assignedUserId?: string;
  status: ProjectAssetStatus;
  workOrderId?: string;
  notes?: string;
  featureValuesJson: string;
  issuesJson: string;
  configLabel?: string;
  installedAt?: string;
  installedBy?: string;
  asBuiltJson?: string;
  createdAt: string;
  updatedAt: string;
  workflowSummary?: ProjectAssetWorkflowSummary;
  isDeleted?: boolean;
  deletedAtUtc?: string;
  deletedByUserId?: string;
  deleteReason?: string;
}

export interface ProjectAssetWorkflowSummary {
  hasWorkflow: boolean;
  evidenceStatus: "None" | "Pending" | "Running" | "Paused" | "Complete" | "MissingData";
  requiredItems: number;
  completedItems: number;
  missingItems: number;
  latestRunId?: string;
  latestRunStatus?: string;
  latestRunLocked: boolean;
  signatureStatus?: string;
  hasOpenIssues: boolean;
  /** Explicit unresolved blocking gate. Generic open issues must never be promoted to blocking. */
  hasOpenBlockingIssues?: boolean;
  latestRunStartedAt?: string;
  latestRunCompletedAt?: string;
  totalInventoryFeatures?: number;
  completedInventoryFeatures?: number;
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
  configLabel?: string;
}
