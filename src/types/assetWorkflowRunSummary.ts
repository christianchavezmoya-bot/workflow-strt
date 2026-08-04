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
  productiveSeconds: number;
  downtimeSeconds: number;
  hasBomActual: boolean;
  completedByName?: string;
  installerSignedAt?: string;
  customerSignedAt?: string;
}

/** True when a run carries enough JSON to derive capture / sign-off columns. */
export function runHasCaptureBlobs(run: Pick<AssetWorkflowRun, "stepResultsJson" | "workflowSnapshotJson">): boolean {
  return (run.stepResultsJson?.length ?? 0) > 20 || (run.workflowSnapshotJson?.length ?? 0) > 20;
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
    productiveSeconds: summary.productiveSeconds ?? 0,
    downtimeSeconds: summary.downtimeSeconds ?? 0,
    downtimeEvents: 0,
    runNumber: summary.runNumber,
    signatureStatus: summary.signatureStatus,
    startedAt: summary.startedAt,
    completedAt: summary.completedAt,
    completedByName: summary.completedByName,
    installerSignedAt: summary.installerSignedAt,
    customerSignedAt: summary.customerSignedAt,
    bomActualJson: summary.hasBomActual ? "[]" : undefined,
    createdAt: summary.startedAt,
    updatedAt: summary.updatedAt,
  };
}

/** Prefer runs with capture blobs — never let slim summary placeholders clobber full runs. */
export function mergeRunRecord(existing: AssetWorkflowRun | undefined, incoming: AssetWorkflowRun): AssetWorkflowRun {
  if (!existing) return incoming;
  const existingHasBlobs = runHasCaptureBlobs(existing);
  const incomingHasBlobs = runHasCaptureBlobs(incoming);
  if (existingHasBlobs && !incomingHasBlobs) return existing;
  if (!existingHasBlobs && incomingHasBlobs) return incoming;
  // Both slim or both full — keep the fresher UpdatedAt.
  const existingTs = new Date(existing.updatedAt).getTime();
  const incomingTs = new Date(incoming.updatedAt).getTime();
  return incomingTs >= existingTs ? incoming : existing;
}

export function mergeRunsIntoMap(
  prev: Record<string, AssetWorkflowRun[]>,
  runs: AssetWorkflowRun[],
): Record<string, AssetWorkflowRun[]> {
  const next = { ...prev };
  runs.forEach((run) => {
    const existing = next[run.assetId] ?? [];
    const byId = new Map(existing.map((r) => [r.id, r]));
    byId.set(run.id, mergeRunRecord(byId.get(run.id), run));
    next[run.assetId] = Array.from(byId.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
  });
  return next;
}
