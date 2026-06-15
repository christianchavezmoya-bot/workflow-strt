export type ProjectAssetStatus = "NotStarted" | "InProgress" | "Paused" | "Pending" | "Complete" | "Closed" | "Issue";

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
  /** Base64 data URLs attached when the issue was reported */
  reportMedia?: string[];
  /** Base64 data URLs attached when the issue was closed (evidence of fix) */
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
  /** Human-readable label for what was installed, e.g. "Strata AI / 2 Cameras + Reverse Input" */
  configLabel?: string;
  /** ISO timestamp when the installation workflow was completed */
  installedAt?: string;
  /** Name of the technician who completed the installation */
  installedBy?: string;
  /** JSON snapshot of all captured data-capture field values from completed workflow runs */
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
