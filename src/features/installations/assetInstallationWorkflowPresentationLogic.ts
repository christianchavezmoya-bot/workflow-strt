import type { AssetWorkflowRun, RunIssue } from "../../types/assetWorkflowRun";
import type { AssetIssue, ProjectAsset } from "../../types/projectAsset";
import type { WorkflowAssignment } from "../../types/workflowType";
import { countMissingWorkflowItems, runHasCompletedAllSteps } from "../../utils/workflowCompleteness";

export type AssetAttentionSummary = {
  paused: boolean;
  blockingIssueCount: number;
  highObservationCount: number;
  openIssueCount: number;
  missingMediaCount: number;
  needsMissingMediaRepair: boolean;
  awaitingInstallerSig: boolean;
  awaitingCustomerSig: boolean;
  latestRun: AssetWorkflowRun | null;
  latestLockedRun: AssetWorkflowRun | null;
};

export function getSortedAssetRuns(
  runsMap: Record<string, AssetWorkflowRun[]>,
  assetId: string,
): AssetWorkflowRun[] {
  return [...(runsMap[assetId] ?? [])].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
}

export function getAssetAttentionSummary(
  asset: ProjectAsset,
  runsMap: Record<string, AssetWorkflowRun[]>,
  pausedProgress: Record<string, { done: number; total: number }>,
): AssetAttentionSummary {
  const sortedRuns = getSortedAssetRuns(runsMap, asset.id);
  const latestRun = sortedRuns[0] ?? null;
  const latestLockedRun = sortedRuns.find((run) => run.isLocked) ?? null;
  const latestRunMissingMediaCount = latestRun ? countMissingWorkflowItems(latestRun) : 0;
  const needsMissingMediaRepair = Boolean(
    latestRun && runHasCompletedAllSteps(latestRun) && latestRunMissingMediaCount > 0,
  );
  const paused =
    Boolean(pausedProgress[asset.id]) ||
    latestRun?.status === "Paused" ||
    asset.workflowSummary?.evidenceStatus === "Paused";

  let assetIssues: AssetIssue[] = [];
  try {
    assetIssues = JSON.parse(asset.issuesJson || "[]");
  } catch {
    /* ignore */
  }
  const runIssues = sortedRuns.flatMap((run) => {
    try {
      return JSON.parse(run.issuesJson || "[]") as RunIssue[];
    } catch {
      return [];
    }
  });
  const openIssues = [...assetIssues, ...runIssues].filter((issue) => !issue.resolved);
  const blockingIssueCount = openIssues.filter((issue) => issue.isBlocking).length;
  const highObservationCount = openIssues.filter(
    (issue) => !issue.isBlocking && issue.issueType === "observation" && issue.severity === "high",
  ).length;

  return {
    paused,
    blockingIssueCount,
    highObservationCount,
    openIssueCount: openIssues.length,
    missingMediaCount: latestRunMissingMediaCount,
    needsMissingMediaRepair,
    awaitingInstallerSig: Boolean(
      latestLockedRun?.isLocked && latestLockedRun.signatureStatus === "PendingInstaller",
    ),
    awaitingCustomerSig: Boolean(
      latestLockedRun?.isLocked &&
        latestLockedRun.signatureStatus === "PendingCustomer" &&
        !latestLockedRun.customerSignedAt,
    ),
    latestRun,
    latestLockedRun,
  };
}

export function getWorkflowNameForRun(
  run: AssetWorkflowRun | null,
  asset: ProjectAsset,
  assignments: WorkflowAssignment[],
): string {
  if (!run) return asset.assetTag || asset.assetName || "Workflow";
  try {
    const snapshot = JSON.parse(run.workflowSnapshotJson ?? "{}");
    if (typeof snapshot?.name === "string" && snapshot.name.trim()) return snapshot.name;
  } catch {
    /* ignore */
  }
  const assignment = assignments.find((item) => item.workflowConfigId === run.workflowConfigId);
  return assignment?.workflowConfigName || asset.assetTag || asset.assetName || "Workflow";
}
