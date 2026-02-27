export type RunStatus = "InProgress" | "Complete" | "Issue";

export interface RunIssue {
  id: string;
  description: string;
  issueType: "blocking" | "observation";
  severity: "low" | "medium" | "high";
  stepId?: string;
  stepTitle?: string;
  reportedAt: string;
  resolved: boolean;
  isBlocking: boolean;
}

export interface StepResult {
  stepId: string;
  values: Record<string, string>;
  completedAt: string;
}

export interface AssetWorkflowRun {
  id: string;
  assetId: string;
  workflowConfigId: string;
  workflowVersion: number;
  workflowSnapshotJson: string;
  workOrderId?: string;
  status: RunStatus;
  isLocked: boolean;
  technicianUserId?: string;
  stepResultsJson: string;
  issuesJson: string;
  startedAt: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}
