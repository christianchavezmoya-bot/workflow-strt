import { shouldSkipBlockingFetch } from "../../services/connectivityMonitor";
import { entityGetAsset } from "../../services/localDB";
import { workflowConfigService } from "../../services/workflowConfigService";
import { assetWorkflowAssignmentService } from "../../services/assetWorkflowAssignmentService";
import { assetWorkflowRunService, isAssetSignatureStatusFinalized, isPendingInstallerSignature, type OpenIssueRecord, type PendingSignatureRecord } from "../../services/assetWorkflowRunService";
import { projectAssetService, type DashboardWorkspaceAssetItem } from "../../services/projectAssetService";
import { WorkflowAssignmentRepository } from "../../repositories/WorkflowAssignmentRepository";
import { countMissingWorkflowItems, runHasCompletedAllSteps } from "../../utils/workflowCompleteness";
import { isDashboardAttentionIssue } from "../../utils/issueAttention";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";
import type { ProjectAsset } from "../../types/projectAsset";
import type { WorkflowAssignment } from "../../types/workflowType";
import type { QuickActionAttention } from "./DashboardQuickActionDialog";
import type { MissingMediaFlag } from "./photoUploadTypes";
import {
  isInProgressAsset,
  isPausedAsset,
  isPendingAsset,
  myJobsCardActionFromDisplayState,
  pendingSignatureStageLabel,
  pendingSignatureStageText,
  pickActiveRunForAttention,
  type MyJobsCardAction,
  type MyJobsCardWidget,
} from "./dashboardPageLogic";
import type { WorkflowDisplayState } from "../../utils/workflowDisplayState";

export type QuickActionAsset = DashboardWorkspaceAssetItem;

export type NativeMyJobsCardContext = {
  asset: ProjectAsset;
  runs: AssetWorkflowRun[];
};

export type DashboardProductWorkflow = {
  configId: string;
  configName: string;
  workflowTypeId?: string;
} | null;

export type AutoAssignConfirmState = {
  asset: QuickActionAsset;
  assignment?: WorkflowAssignment;
  reason: "unassigned" | "other";
  otherName?: string;
};

export function buildFallbackMissingMediaFlag(
  asset: QuickActionAsset,
  latestRun: AssetWorkflowRun | null,
  technicianName: string,
): MissingMediaFlag | null {
  if (!latestRun || !runHasCompletedAllSteps(latestRun)) return null;
  const missingCount = countMissingWorkflowItems(latestRun);
  if (missingCount <= 0) return null;
  return {
    id: `run-missing-${latestRun.id}`,
    runId: latestRun.id,
    assetId: asset.id,
    assetTag: asset.assetTag || asset.assetName || asset.id,
    jobNumber: asset.jobNumber,
    workflowName: "Workflow",
    technicianUserId: asset.assignedUserId ?? "",
    technicianName,
    completedAt: latestRun.completedAt ?? latestRun.updatedAt ?? latestRun.startedAt,
    missingSteps: [],
    totalExpected: 0,
    totalCaptured: 0,
  };
}

export function resolveMissingMediaForAsset(
  asset: QuickActionAsset,
  runs: AssetWorkflowRun[],
  missingMediaFlags: MissingMediaFlag[],
  technicianName: string,
): MissingMediaFlag | null {
  const sortedRuns = [...runs].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
  const latestRun = sortedRuns[0] ?? null;
  const latestRunFlag = latestRun
    ? missingMediaFlags.find((flag) => flag.runId === latestRun.id) ?? null
    : null;
  const fallbackMissingMedia = buildFallbackMissingMediaFlag(asset, latestRun, technicianName);
  const assetLevelFlag = missingMediaFlags.find((flag) => flag.assetId === asset.id) ?? null;
  return latestRunFlag ?? fallbackMissingMedia ?? assetLevelFlag;
}

export function computeQuickActionAttention(params: {
  asset: QuickActionAsset | null;
  runs: AssetWorkflowRun[];
  openIssues: OpenIssueRecord[];
  pendingSigs: PendingSignatureRecord[];
  missingMediaFlags: MissingMediaFlag[];
  technicianName: string;
}): QuickActionAttention {
  const { asset, runs, openIssues, pendingSigs, missingMediaFlags, technicianName } = params;
  if (!asset) {
    return {
      blockingIssues: [],
      highObservations: [],
      pendingSignature: null,
      missingMedia: null,
      activeRun: null,
      latestRun: null,
    };
  }

  const sortedRuns = [...runs].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
  const latestRun = sortedRuns[0] ?? null;
  const assetIssues = openIssues.filter((issue) => issue.assetId === asset.id);

  return {
    blockingIssues: assetIssues.filter((issue) => issue.isBlocking),
    highObservations: assetIssues.filter((issue) => isDashboardAttentionIssue(issue)),
    pendingSignature: pendingSigs.find((sig) => sig.assetId === asset.id) ?? null,
    missingMedia: resolveMissingMediaForAsset(asset, runs, missingMediaFlags, technicianName),
    activeRun: pickActiveRunForAttention(sortedRuns),
    latestRun,
  };
}

export function getMyJobsCardActionFallback(params: {
  asset: QuickActionAsset;
  isNativePlatform: boolean;
  pendingSigs: PendingSignatureRecord[];
  missingMediaFlags: MissingMediaFlag[];
}): MyJobsCardAction {
  const { asset, isNativePlatform, pendingSigs, missingMediaFlags } = params;
  const isActive = isInProgressAsset(asset.runStatus) || isInProgressAsset(asset.status);
  const isPaused = isPausedAsset(asset.runStatus);
  const pendingSignature = pendingSigs.find(
    (sig) => sig.assetId === asset.id && isPendingInstallerSignature(sig.signatureStatus),
  ) ?? null;
  const missingMediaFlag = missingMediaFlags.find((flag) => flag.assetId === asset.id) ?? null;
  const evidenceMissing = (asset.evidenceStatus ?? "").toLowerCase() === "missingdata";
  const hasMissingMediaFallback = asset.totalSteps > 0 && asset.completedSteps >= asset.totalSteps && asset.missingItems > 0;
  const missingCount = missingMediaFlag?.missingSteps?.length
    ?? (missingMediaFlag ? Math.max(0, missingMediaFlag.totalExpected - missingMediaFlag.totalCaptured) : 0)
    ?? 0;
  const effectiveMissingCount = missingCount > 0 ? missingCount : asset.missingItems;
  const hasMissingMedia = Boolean(missingMediaFlag) || hasMissingMediaFallback || evidenceMissing;

  const widgets: MyJobsCardWidget[] = [];
  if (hasMissingMedia) {
    widgets.push({ kind: "missing-photo", count: Math.max(0, effectiveMissingCount), color: "warning" });
  }
  if (asset.hasOpenIssues === true) {
    widgets.push({ kind: "issue", count: 0, color: "error" });
  }

  if (hasMissingMedia) {
    return {
      actionKind: "missing-media",
      chipLabel: "Missing captures",
      chipColor: "warning",
      buttonLabel: isNativePlatform ? "Add Photos" : "Add Missing Photos",
      buttonColor: "warning",
      helperText: effectiveMissingCount > 0
        ? `${effectiveMissingCount} missing photo${effectiveMissingCount === 1 ? "" : "s"}`
        : "Required workflow captures are still missing",
      widgets,
    };
  }

  if (pendingSignature) {
    return {
      actionKind: "default",
      chipLabel: "Pending sign",
      chipColor: "info",
      buttonLabel: pendingSignatureStageLabel(pendingSignature.signatureStatus),
      buttonColor: "warning",
      helperText: pendingSignatureStageText(pendingSignature.signatureStatus),
      widgets,
    };
  }

  if (isPaused) {
    return {
      actionKind: "default",
      chipLabel: "Paused by user",
      chipColor: "warning",
      buttonLabel: "Resume Run",
      buttonColor: "primary",
      helperText: "Paused by user",
      widgets,
    };
  }

  if (isActive) {
    const flagged = asset.hasOpenIssues === true;
    return {
      actionKind: "default",
      chipLabel: "In Progress",
      chipColor: flagged ? "error" : "primary",
      buttonLabel: "Continue Run",
      buttonColor: "primary",
      helperText: flagged ? "In progress - issue flagged" : "Running",
      widgets,
    };
  }

  if (isAssetSignatureStatusFinalized(asset.signatureStatus)) {
    return {
      actionKind: "default",
      chipLabel: "Complete",
      chipColor: "success",
      buttonLabel: "Run Details",
      buttonColor: "inherit",
      helperText: "Field work complete",
      widgets,
    };
  }

  return {
    actionKind: "default",
    chipLabel: isPendingAsset(asset.status) ? "Pending sign" : "Not Started",
    chipColor: isPendingAsset(asset.status) ? "info" : "default",
    buttonLabel: "Start Run",
    buttonColor: "inherit",
    helperText: isPendingAsset(asset.status) ? "Awaiting sign-off" : "Ready to start",
    widgets,
  };
}

export function getMyJobsCardAction(params: {
  asset: QuickActionAsset;
  isNativePlatform: boolean;
  pendingSigs: PendingSignatureRecord[];
  missingMediaFlags: MissingMediaFlag[];
  nativeMyJobsDisplayStateByAssetId: Map<string, WorkflowDisplayState>;
}): MyJobsCardAction {
  const displayState = params.nativeMyJobsDisplayStateByAssetId.get(params.asset.id);
  if (displayState) {
    return myJobsCardActionFromDisplayState(displayState, params.isNativePlatform);
  }
  return getMyJobsCardActionFallback(params);
}

export function canStartDirectlyFromDashboard(params: {
  asset: QuickActionAsset;
  assignments: WorkflowAssignment[];
  runs: AssetWorkflowRun[];
  productWorkflow: DashboardProductWorkflow;
  userId: string;
  openIssues: OpenIssueRecord[];
  pendingSigs: PendingSignatureRecord[];
  missingMediaFlags: MissingMediaFlag[];
  technicianName: string;
}): boolean {
  const { asset, assignments, runs, productWorkflow, userId } = params;
  const attention = computeQuickActionAttention({
    asset,
    runs,
    openIssues: params.openIssues,
    pendingSigs: params.pendingSigs,
    missingMediaFlags: params.missingMediaFlags,
    technicianName: params.technicianName,
  });

  if (asset.assignedUserId !== userId) return false;
  if (attention.blockingIssues.length > 0) return false;
  if (attention.highObservations.length > 0) return false;
  if (attention.missingMedia) return false;
  if (attention.pendingSignature) return false;
  if (attention.activeRun) return false;

  if (assignments.length === 1) return true;
  if (assignments.length > 1) return false;
  if (runs.length > 0) return false;

  return Boolean(productWorkflow);
}

export async function resolveProductWorkflowForAsset(
  fullAsset: ProjectAsset | null,
  assignments: WorkflowAssignment[],
): Promise<DashboardProductWorkflow> {
  if (assignments.length > 0 || !fullAsset?.productConfigId) return null;
  try {
    let cfg = await workflowConfigService.getByIdLocalFirst(fullAsset.productConfigId);
    if (!cfg && !shouldSkipBlockingFetch()) {
      cfg = await workflowConfigService.getById(fullAsset.productConfigId);
    }
    if (!cfg) return null;
    return {
      configId: cfg.id,
      configName: cfg.name,
      workflowTypeId: cfg.workflowTypeId,
    };
  } catch {
    return null;
  }
}

export async function loadQuickActionContext(params: {
  asset: QuickActionAsset;
  dashboardAssignmentsMap: Record<string, WorkflowAssignment[]>;
  nativeMyJobsCardContext: Record<string, NativeMyJobsCardContext>;
}): Promise<{
  assignments: WorkflowAssignment[];
  runs: AssetWorkflowRun[];
  fullAsset: ProjectAsset | null;
  resolvedProductWorkflow: DashboardProductWorkflow;
}> {
  const { asset, dashboardAssignmentsMap, nativeMyJobsCardContext } = params;
  const [localAssignments, runs, cachedEntity] = await Promise.all([
    WorkflowAssignmentRepository.getLocalByAsset(asset.id).catch(() => []),
    assetWorkflowRunService.listByAsset(asset.id).catch(() => []),
    entityGetAsset(asset.id),
  ]);

  let assignments = localAssignments.length > 0
    ? localAssignments
    : (dashboardAssignmentsMap[asset.id] ?? []);

  if (assignments.length === 0 && !shouldSkipBlockingFetch()) {
    assignments = await assetWorkflowAssignmentService.listByAsset(asset.id);
  }

  const cachedAsset = (cachedEntity?.data as ProjectAsset | undefined)
    ?? nativeMyJobsCardContext[asset.id]?.asset
    ?? null;

  let fullAsset: ProjectAsset | null = cachedAsset;
  if (!fullAsset && !shouldSkipBlockingFetch()) {
    fullAsset = await projectAssetService.getById(asset.id).catch(() => null);
  }

  const resolvedProductWorkflow = await resolveProductWorkflowForAsset(fullAsset, assignments);
  return { assignments, runs, fullAsset, resolvedProductWorkflow };
}
