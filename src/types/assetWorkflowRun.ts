import type { IssueComment } from "./projectAsset";

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
  resolvedNote?: string;   // resolution comment added from history view
  isBlocking: boolean;
  createdBy?: string;
  internalOnly?: boolean;  // if true, not included in customer-facing reports
  comments?: IssueComment[];
  resolutionNote?: string;
  resolvedAt?: string;
  resolvedBy?: string;
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
  runNumber: number;
  completedByName?: string;
  startedAt: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}
