import type { IssueComment } from "./projectAsset";

export type RunStatus = "InProgress" | "Complete" | "Issue";

export interface RunTimeEntry {
  id: string;
  category: "productive" | "downtime";
  startedAtUtc: string;
  endedAtUtc?: string | null;
  reason?: string | null;
}

export interface RunIssue {
  id: string;
  description: string;
  /** "blocking" | "observation" | "scope-deviation" */
  issueType: "blocking" | "observation" | "scope-deviation";
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
  /** Base64 data URLs attached when the issue was reported */
  reportMedia?: string[];
  /** Base64 data URLs attached when the issue was closed (evidence of fix) */
  resolutionMedia?: string[];
  resolutionNote?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  /** Scope deviation extra fields */
  extraHours?: number;
  costImpact?: string;
  approvedBy?: string;
  approvedAt?: string;
}

export interface StepResult {
  stepId: string;
  values: Record<string, string>;
  completedAt: string;
  /** 0-based iteration index for repeatable steps */
  iterationIndex?: number;
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
  timeTrackingJson: string;
  productiveSeconds: number;
  downtimeSeconds: number;
  downtimeEvents: number;
  runNumber: number;
  completedByName?: string;
  signatureStatus: string;
  installerSignedAt?: string;
  customerSignedAt?: string;
  startedAt: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  /** JSON array of BomActualItem — confirmed parts used during this run */
  bomActualJson?: string;
}
