import type { AssetWorkflowRun } from "./assetWorkflowRun";

/** Slim run row from runs-summary — no StepResultsJson / WorkflowSnapshotJson. */
export interface AssetWorkflowRunSummary {
  id: string;
  assetId: string;
  workflowConfigId: string;
  status: AssetWorkflowRun["status"];
  isLocked: boolean;
  signatureStatus: string;
  startedAt: string;
  completedAt?: string;
  updatedAt: string;
  runNumber: number;
}

export function runSummaryToPlaceholderRun(summary: AssetWorkflowRunSummary): AssetWorkflowRun {
  return {
    id: summary.id,
    assetId: summary.assetId,
    workflowConfigId: summary.workflowConfigId,
    workflowVersion: 1,
    workflowSnapshotJson: "{}",
    status: summary.status,
    isLocked: summary.isLocked,
    stepResultsJson: "[]",
    issuesJson: "[]",
    timeTrackingJson: "[]",
    productiveSeconds: 0,
    downtimeSeconds: 0,
    downtimeEvents: 0,
    runNumber: summary.runNumber,
    signatureStatus: summary.signatureStatus,
    startedAt: summary.startedAt,
    completedAt: summary.completedAt,
    createdAt: summary.startedAt,
    updatedAt: summary.updatedAt,
  };
}

export function mergeRunsIntoMap(
  prev: Record<string, AssetWorkflowRun[]>,
  runs: AssetWorkflowRun[],
): Record<string, AssetWorkflowRun[]> {
  const next = { ...prev };
  runs.forEach((run) => {
    const existing = next[run.assetId] ?? [];
    const byId = new Map(existing.map((r) => [r.id, r]));
    byId.set(run.id, run);
    next[run.assetId] = Array.from(byId.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
  });
  return next;
}
