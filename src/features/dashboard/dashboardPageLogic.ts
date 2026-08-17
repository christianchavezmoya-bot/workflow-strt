import type { ProjectAsset } from "../../types/projectAsset";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";
import {
  myJobsCardChipFromDisplayState,
  type WorkflowDisplayState,
} from "../../utils/workflowDisplayState";

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export function isPausedAsset(status?: string | null) {
  return (status ?? "").toLowerCase() === "paused";
}

export function isInProgressAsset(status?: string | null) {
  const value = (status ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  return value === "inprogress" || value === "issue" || value === "hasissue";
}

export function isNotStartedAsset(status?: string | null) {
  const value = (status ?? "").toLowerCase();
  return value === "notstarted" || value === "not started";
}

export function isIssueAsset(status?: string | null) {
  const value = (status ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  return value === "issue" || value === "hasissue";
}

export function isPendingAsset(status?: string | null) {
  const value = (status ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  return value === "pending";
}

export function isClosedAsset(status?: string | null) {
  const value = (status ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  return value === "closed";
}

export function isWaitingForSignature(signatureStatus?: string | null) {
  const value = (signatureStatus ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  return value === "pendingcustomer" || value === "pendinginstaller";
}

export function pendingSignatureStageLabel(signatureStatus?: string | null) {
  const value = (signatureStatus ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  if (value === "pendinginstaller") return "Installer sign-off";
  if (value === "pendingcustomer") return "Customer sign-off";
  return "Sign-off";
}

export function pendingSignatureStageText(signatureStatus?: string | null) {
  const value = (signatureStatus ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  if (value === "pendinginstaller") return "Awaiting installer sign-off";
  if (value === "pendingcustomer") return "Awaiting customer sign-off";
  return "Awaiting sign-off";
}

/** Ignore stale offline-run ghosts when a locked completion already exists. */
export function pickActiveRunForAttention(sortedRuns: AssetWorkflowRun[]): AssetWorkflowRun | null {
  const awaitingSignature = sortedRuns.some(
    (run) =>
      run.isLocked &&
      (run.signatureStatus === "PendingInstaller" || run.signatureStatus === "PendingCustomer"),
  );
  if (awaitingSignature) return null;

  const unlocked = sortedRuns.find((run) => !run.isLocked) ?? null;
  if (!unlocked) return null;

  const lockedComplete = sortedRuns.find(
    (run) =>
      run.isLocked &&
      run.workflowConfigId === unlocked.workflowConfigId &&
      run.status === "Complete",
  );
  if (lockedComplete && unlocked.id.startsWith("offline-run-")) {
    return null;
  }
  return unlocked;
}

export function isActiveAsset(status?: string | null) {
  const value = (status ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  return (
    value === "notstarted" ||
    value === "inprogress" ||
    value === "onhold" ||
    value === "issue" ||
    value === "pending"
  );
}

export function isOpenInspectionStatus(status?: string | null) {
  const value = (status ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  return value === "notstarted" || value === "inprogress" || value === "paused" || value === "onhold";
}

export type ProjectStatusChipColor = "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning";

export const PROJECT_STATUS_CHIP_COLORS: Record<string, ProjectStatusChipColor> = {
  "In Progress": "primary",
  Completed: "success",
  "Pending Approval": "warning",
  Closed: "info",
  Cancelled: "error",
  Draft: "default",
  Approved: "info",
  "On Hold": "warning",
};

export function projectStatusChipColor(status?: string | null): ProjectStatusChipColor {
  return PROJECT_STATUS_CHIP_COLORS[status ?? ""] ?? "default";
}

export function dashboardStatusChip(asset: {
  runStatus?: string | null;
  status?: string | null;
  signatureStatus?: string | null;
  evidenceStatus?: string | null;
  hasOpenIssues?: boolean;
}): {
  label: string;
  color: "default" | "primary" | "success" | "error" | "warning" | "info";
} {
  const hasIssue = isIssueAsset(asset.status) || isIssueAsset(asset.runStatus);
  if (asset.hasOpenIssues === true) return { label: "In Progress", color: "error" };
  if ((asset.evidenceStatus ?? "").toLowerCase() === "missingdata") return { label: "Missing", color: "error" };
  if (hasIssue) return { label: "In Progress", color: asset.hasOpenIssues === false ? "primary" : "error" };
  if (isPausedAsset(asset.runStatus)) return { label: "Paused by user", color: "warning" };
  if (isInProgressAsset(asset.runStatus) || isInProgressAsset(asset.status))
    return { label: "In Progress", color: "primary" };
  if (isNotStartedAsset(asset.status)) return { label: "Not Started", color: "default" };
  if (isPendingAsset(asset.status)) return { label: "Pending sign", color: "info" };
  return { label: asset.runStatus || asset.status || "Unknown", color: "default" };
}

export type MyJobsCardWidget = {
  kind: "missing-photo" | "issue";
  count: number;
  color: "warning" | "error";
};

export type MyJobsCardAction = {
  actionKind: "default" | "missing-media" | "resolve-blocking" | "signature";
  chipLabel: string;
  chipColor: "default" | "primary" | "success" | "error" | "warning" | "info";
  buttonLabel: string;
  buttonColor: "inherit" | "primary" | "success" | "warning" | "error" | "info";
  helperText: string;
  widgets: MyJobsCardWidget[];
};

export function myJobsAssetIdsKey(assets: Array<{ id: string }>): string {
  return assets
    .map((a) => a.id)
    .sort()
    .join(",");
}

export function assetLikelyHasWorkflow(
  asset: { totalSteps?: number; workflowSummary?: { hasWorkflow?: boolean } },
  cachedAsset?: ProjectAsset | null,
): boolean {
  if ((asset.totalSteps ?? 0) > 0) return true;
  if (asset.workflowSummary?.hasWorkflow) return true;
  if (cachedAsset?.productConfigId || cachedAsset?.workflowTemplateId) return true;
  if (cachedAsset?.workflowSummary?.hasWorkflow) return true;
  return false;
}

export function myJobsCardWidgetsFromDisplayState(displayState: WorkflowDisplayState): MyJobsCardWidget[] {
  const widgets: MyJobsCardWidget[] = [];
  if (displayState.gates.missingMediaCount > 0) {
    widgets.push({
      kind: "missing-photo",
      count: displayState.gates.missingMediaCount,
      color: "warning",
    });
  }
  if (displayState.gates.openIssueCount > 0) {
    widgets.push({
      kind: "issue",
      count: displayState.gates.openIssueCount,
      color: "error",
    });
  }
  return widgets;
}

export function myJobsCardHelperTextFromDisplayState(displayState: WorkflowDisplayState): string {
  const actionKind = displayState.action?.kind ?? "none";
  if (actionKind === "add-missing-photos") {
    const count = displayState.gates.missingMediaCount;
    return count > 0
      ? `${count} missing photo${count === 1 ? "" : "s"}`
      : "Required workflow captures are still missing";
  }
  if (actionKind === "resolve-blocking") {
    const count = displayState.gates.blockingIssueCount;
    return count > 0
      ? `${count} blocking issue${count === 1 ? "" : "s"}`
      : "Resolve the blocking issue before continuing";
  }
  if (actionKind === "installer-sign") return "Awaiting installer sign-off";
  if (actionKind === "customer-sign") return "Awaiting customer sign-off";
  if (actionKind === "resume") return "Paused by user";
  if (actionKind === "continue") {
    return displayState.gates.openIssueCount > 0 ? "In progress - issue flagged" : "Running";
  }
  if (actionKind === "start") return "Ready to start";
  if (actionKind === "run-details") return "Field work complete";
  if (actionKind === "upload-json") return "Import an inspection definition";
  if (actionKind === "no-workflow") return "Assign a workflow to this asset first";
  return displayState.status.label;
}

export function compactNativeActionLabel(label: string): string {
  if (label === "Add Missing Photos") return "Add Photos";
  if (label === "Resolve Blocking Issue") return "Resolve Issue";
  if (label.startsWith("Resolve ") && label.includes("Blocking Issues")) return "Resolve Issues";
  return label;
}

export function myJobsCardActionFromDisplayState(
  displayState: WorkflowDisplayState,
  compact = false,
): MyJobsCardAction {
  const actionKind = displayState.action?.kind ?? "run-details";
  const widgets = myJobsCardWidgetsFromDisplayState(displayState);
  const chip = myJobsCardChipFromDisplayState(displayState);

  let resolvedActionKind: MyJobsCardAction["actionKind"] = "default";
  if (actionKind === "add-missing-photos") resolvedActionKind = "missing-media";
  else if (actionKind === "resolve-blocking") resolvedActionKind = "resolve-blocking";
  else if (actionKind === "installer-sign" || actionKind === "customer-sign") resolvedActionKind = "signature";

  return {
    actionKind: resolvedActionKind,
    chipLabel: chip.label,
    chipColor: chip.color,
    buttonLabel: compact
      ? compactNativeActionLabel(displayState.action?.label ?? "Run Details")
      : (displayState.action?.label ?? "Run Details"),
    buttonColor:
      actionKind === "add-missing-photos" || actionKind === "installer-sign" || actionKind === "customer-sign"
        ? "warning"
        : actionKind === "resolve-blocking"
          ? "error"
          : actionKind === "resume" || actionKind === "continue"
            ? "primary"
            : "inherit",
    helperText: myJobsCardHelperTextFromDisplayState(displayState),
    widgets,
  };
}

export function formatStepCompletionPercent(completedSteps: number, totalSteps: number) {
  if (totalSteps <= 0) return null;
  const percent = Math.round((Math.max(0, completedSteps) / totalSteps) * 100);
  return `${Math.min(100, percent)}% complete`;
}

export function formatMyJobsStepCompletionLabel(completedSteps: number, totalSteps: number) {
  if (totalSteps <= 0) return null;
  const percent = Math.round((Math.max(0, completedSteps) / totalSteps) * 100);
  return `${Math.min(100, percent)}% completed`;
}

export function workflowModeLabel(workflowMode?: string | null) {
  if (workflowMode === "INSPECTION_ONLY") return "Inspection";
  if (workflowMode === "MIXED") return "Mixed";
  return "Installation";
}

export function workflowModeChipColor(workflowMode?: string | null): "success" | "info" | "warning" {
  if (workflowMode === "INSPECTION_ONLY") return "info";
  if (workflowMode === "MIXED") return "warning";
  return "success";
}

export type AutoAssignFlag = {
  id: string;
  assetId: string;
  assetTag: string;
  jobNumber: string;
  assignedBy: string;
  assignedAt: string;
};

export function isInspectionWorkflowType(workflowTypeId?: string): boolean {
  if (!workflowTypeId) return false;
  const typeName = String(workflowTypeId).toLowerCase();
  return typeName.includes("inspection") || typeName === "insp";
}

export function historyChipColor(status?: string | null): "default" | "success" | "warning" | "error" | "info" {
  const value = (status ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (value === "closed") return "info";
  if (value === "fieldworkcomplete" || value === "completed" || value === "finished") return "success";
  if (value === "deleted") return "error";
  if (value === "cancelled") return "warning";
  return "default";
}

export function isDashboardVisibleProjectStatus(status?: string | null) {
  const normalized = String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  return normalized !== "cancelled" && normalized !== "closed" && normalized !== "archived";
}
