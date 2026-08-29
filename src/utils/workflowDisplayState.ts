// Shared workflow display-state logic.
//
// PHASE 1: this module is intentionally wired to NOTHING yet. It is a pure,
// self-contained function that the Assets page, Dashboard, and Run History
// dialog will each adopt in later phases. Until then it is dead code and
// cannot affect the running app.
//
// It returns DATA ONLY — no JSX, no onClick handlers. Each surface maps the
// returned `action.kind` to its own local click handler. This is deliberate:
// the click handlers close over per-surface component state and must stay
// local, so the shared function decides *what* to show, never *what happens*.
//
// The derivations here mirror getAssetAttentionSummary in AssetInstallationPage
// exactly (same blocking/high-observation/missing-media logic) and reuse the
// shared completeness helpers, so behavior is identical to today — only the
// presentation vocabulary (simplified actions, stacked widgets, relabeled
// statuses) is new.

import type { ProjectAsset, ProjectAssetStatus, AssetIssue } from "../types/projectAsset";
import type { AssetWorkflowRun, RunIssue } from "../types/assetWorkflowRun";
import { runHasCaptureBlobs } from "../types/assetWorkflowRunSummary";
import { countMissingWorkflowItems, runHasCompletedAllSteps } from "./workflowCompleteness";

// ── Public types ────────────────────────────────────────────────────────────

export type StatusKey = ProjectAssetStatus; // "NotStarted" | "InProgress" | "Paused" | "Pending" | "Complete" | "Closed" | "Issue"

export type ActionKind =
  | "none"
  | "upload-json"
  | "no-workflow"
  | "start"
  | "resume"
  | "continue"
  | "add-missing-photos"
  | "resolve-blocking"
  | "installer-sign"
  | "customer-sign"
  | "run-details";

export type WidgetKind =
  | "missing-photo"
  | "issue-low"
  | "issue-medium"
  | "issue-high-blocking"
  | "high-observation";

export type WidgetColor = "yellow" | "grey" | "red" | "orange";
export type ChipColor = "default" | "primary" | "warning" | "success" | "info" | "error";
export type FeatureColor = "warning" | "primary" | "error" | "success" | "default";
export type ActionColor = "success" | "warning" | "error" | "info" | "inherit";

export interface FeatureWidget {
  kind: WidgetKind;
  /** open (undimmed) count — issues still needing attention */
  openCount: number;
  /** resolved (dimmed) count — kept visible for the record (R1) */
  resolvedCount: number;
  color: WidgetColor;
  icon: "camera" | "exclamation";
}

export interface WorkflowDisplayState {
  feature: {
    label: string;
    color: FeatureColor;
    /** stacked; always populated regardless of asset lifecycle */
    widgets: FeatureWidget[];
  };
  status: {
    key: StatusKey;
    label: string;
    color: ChipColor;
  };
  action: {
    kind: ActionKind;
    label: string;
    tooltip: string;
    color: ActionColor;
  } | null;
  gates: {
    /** false while a blocking issue OR missing media exists — both stop sign/lock */
    canComplete: boolean;
    blockingIssueCount: number;
    highObservationCount: number;
    missingMediaCount: number;
    openIssueCount: number;
  };
}

export interface DisplayStateOptions {
  /** from the caller's pausedProgress[asset.id] (component state) */
  paused?: boolean;
  /** whether the project/asset is in inspection (JSON-upload) mode */
  inspectionMode?: boolean;
  /** whether a runnable workflow source exists (config or template assigned) */
  hasRunnableWorkflowSource: boolean;
}

// ── Status relabels (display only — enum values are unchanged) ───────────────
// R2: "Issue" is NOT surfaced as a status; it is displayed as "In Progress"
// and carried by the red blocking widget instead. The underlying enum value
// stays intact everywhere else (filters, server derivation, create path).

const STATUS_LABELS: Record<ProjectAssetStatus, string> = {
  NotStarted: "Not Started",
  InProgress: "In Progress",
  Paused: "Paused by user",   // relabel
  Pending: "Pending sign",    // relabel
  Complete: "Complete",
  Closed: "Closed",
  Issue: "In Progress",       // R2: display Issue as In Progress; red widget carries it
  Cancelled: "Cancelled",
};

const STATUS_COLORS: Record<ProjectAssetStatus, ChipColor> = {
  NotStarted: "default",
  InProgress: "primary",
  Paused: "warning",
  Pending: "warning",
  Complete: "success",
  Closed: "info",
  Issue: "primary",           // R2: same as In Progress; the widget is red, not the chip
  Cancelled: "error",
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function sortRuns(runs: AssetWorkflowRun[]): AssetWorkflowRun[] {
  return [...runs].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
}

interface IssueTally {
  openLow: number; resolvedLow: number;
  openMedium: number; resolvedMedium: number;
  openBlocking: number; resolvedBlocking: number;
  openHighObs: number; resolvedHighObs: number;
  openIssueCount: number;
}

function tallyIssues(asset: ProjectAsset, runs: AssetWorkflowRun[]): IssueTally {
  let assetIssues: AssetIssue[] = [];
  try { assetIssues = JSON.parse(asset.issuesJson || "[]"); } catch { assetIssues = []; }
  const runIssues = runs.flatMap((run) => {
    try { return JSON.parse(run.issuesJson || "[]") as RunIssue[]; } catch { return []; }
  });
  const all = [...assetIssues, ...runIssues] as Array<AssetIssue | RunIssue>;

  const t: IssueTally = {
    openLow: 0, resolvedLow: 0,
    openMedium: 0, resolvedMedium: 0,
    openBlocking: 0, resolvedBlocking: 0,
    openHighObs: 0, resolvedHighObs: 0,
    openIssueCount: 0,
  };

  for (const issue of all) {
    const isHighObs = !issue.isBlocking && issue.issueType === "observation" && issue.severity === "high";
    if (issue.isBlocking) {
      if (issue.resolved) t.resolvedBlocking++; else t.openBlocking++;
    } else if (isHighObs) {
      if (issue.resolved) t.resolvedHighObs++; else t.openHighObs++;
    } else if (issue.severity === "medium") {
      if (issue.resolved) t.resolvedMedium++; else t.openMedium++;
    } else {
      // low / anything else non-blocking non-high-obs
      if (issue.resolved) t.resolvedLow++; else t.openLow++;
    }
    if (!issue.resolved) t.openIssueCount++;
  }
  return t;
}

function buildWidgets(t: IssueTally, missingMediaCount: number): FeatureWidget[] {
  const widgets: FeatureWidget[] = [];

  // Missing photos — yellow camera. (Only meaningful once steps are done; the
  // caller passes 0 otherwise.) No "resolved" concept for missing media.
  if (missingMediaCount > 0) {
    widgets.push({ kind: "missing-photo", openCount: missingMediaCount, resolvedCount: 0, color: "yellow", icon: "camera" });
  }

  // R1: widgets show for BOTH open and resolved (resolved dimmed by the UI via
  // resolvedCount). Emit a widget if either count is non-zero.
  if (t.openBlocking > 0 || t.resolvedBlocking > 0) {
    widgets.push({ kind: "issue-high-blocking", openCount: t.openBlocking, resolvedCount: t.resolvedBlocking, color: "red", icon: "exclamation" });
  }
  if (t.openHighObs > 0 || t.resolvedHighObs > 0) {
    widgets.push({ kind: "high-observation", openCount: t.openHighObs, resolvedCount: t.resolvedHighObs, color: "orange", icon: "exclamation" });
  }
  if (t.openMedium > 0 || t.resolvedMedium > 0) {
    widgets.push({ kind: "issue-medium", openCount: t.openMedium, resolvedCount: t.resolvedMedium, color: "yellow", icon: "exclamation" });
  }
  if (t.openLow > 0 || t.resolvedLow > 0) {
    widgets.push({ kind: "issue-low", openCount: t.openLow, resolvedCount: t.resolvedLow, color: "grey", icon: "exclamation" });
  }

  return widgets;
}

// ── Main function ───────────────────────────────────────────────────────────

export function getWorkflowDisplayState(
  asset: ProjectAsset,
  runs: AssetWorkflowRun[],
  opts: DisplayStateOptions
): WorkflowDisplayState {
  const sorted = sortRuns(runs);
  const activeRun = sorted.find(
    (r) => !r.isLocked && (r.status === "InProgress" || r.status === "Paused" || r.status === "Issue"),
  ) ?? null;
  const latestRun = activeRun ?? sorted[0] ?? null;
  const latestLockedRun = sorted.find((r) => r.isLocked) ?? null;
  const summary = asset.workflowSummary;

  const runMissingFromBlobs = latestRun ? countMissingWorkflowItems(latestRun) : 0;
  const hasRunBlobs = latestRun ? runHasCaptureBlobs(latestRun) : false;

  let allStepsDone = Boolean(latestRun && runHasCompletedAllSteps(latestRun));
  let missingMediaCount = runMissingFromBlobs;

  // Web Project Assets uses slim run-summary placeholders (no step JSON on the client).
  // Prefer server workflowSummary when present and the client run row is a placeholder.
  const summaryRun = latestLockedRun ?? latestRun;
  const summaryHasBlobs = summaryRun ? runHasCaptureBlobs(summaryRun) : false;
  if (!activeRun && summaryRun && !summaryHasBlobs && summary?.hasWorkflow) {
    const summaryMissing = summary.missingItems ?? 0;
    const summaryEvidenceMissing = summary.evidenceStatus === "MissingData";
    if (summaryEvidenceMissing || summaryMissing > 0) {
      allStepsDone = true;
      missingMediaCount = Math.max(summaryMissing, summaryEvidenceMissing ? 1 : 0);
    } else if (summaryRun.isLocked || summary.latestRunLocked) {
      allStepsDone = true;
      missingMediaCount = 0;
    } else if (
      summary.latestRunLocked
      || summaryRun.isLocked
      || summary.evidenceStatus === "Complete"
    ) {
      allStepsDone = true;
    }
  }

  // Missing media only counts as an actionable/visible gap once all steps done.
  const effectiveMissing = allStepsDone ? missingMediaCount : 0;

  const t = tallyIssues(asset, sorted);
  let blockingIssueCount = t.openBlocking;
  // Slim run placeholders zero out issuesJson — trust server summary when steps are done.
  if (!hasRunBlobs && summary?.hasOpenIssues && allStepsDone && blockingIssueCount === 0) {
    blockingIssueCount = 1;
  }
  const highObservationCount = t.openHighObs;

  const paused = Boolean(
    opts.paused
    || latestRun?.status === "Paused"
    || asset.workflowSummary?.evidenceStatus === "Paused"
  );

  const awaitingInstallerSig = Boolean(
    latestLockedRun?.isLocked && latestLockedRun.signatureStatus === "PendingInstaller"
  );
  const awaitingCustomerSig = Boolean(
    latestLockedRun?.isLocked
    && latestLockedRun.signatureStatus === "PendingCustomer"
    && !latestLockedRun.customerSignedAt
  );

  // ── Feature label + color (evidence signal) ───────────────────────────────
  let featureLabel: string;
  let featureColor: FeatureColor;
  if (paused) {
    featureLabel = "paused"; featureColor = "warning";
  } else if (latestLockedRun && effectiveMissing > 0) {
    featureLabel = "Missing captures"; featureColor = "error";
  } else if (latestLockedRun && allStepsDone && effectiveMissing === 0) {
    featureLabel = "Done"; featureColor = "success";
  } else if (asset.status === "InProgress" || asset.status === "Issue" || (latestRun && !latestRun.isLocked)) {
    featureLabel = "Running"; featureColor = "primary";
  } else {
    featureLabel = "pending"; featureColor = "warning";
  }

  const widgets = buildWidgets(
    blockingIssueCount > t.openBlocking
      ? { ...t, openBlocking: blockingIssueCount }
      : t,
    effectiveMissing,
  );

  // ── Status (relabeled display; enum untouched) ────────────────────────────
  // R2: when the raw status is "Issue", display it as In Progress (the red
  // widget carries the issue signal).
  const statusKey = asset.status;
  const status = {
    key: statusKey,
    label: STATUS_LABELS[statusKey],
    color: STATUS_COLORS[statusKey],
  };

  // ── Action (simplified cascade; first match wins) ─────────────────────────
  const action = computeAction({
    asset,
    opts,
    paused,
    allStepsDone,
    missingMediaCount: effectiveMissing,
    blockingIssueCount,
    awaitingInstallerSig,
    awaitingCustomerSig,
    hasLockedRun: Boolean(latestLockedRun),
  });

  return {
    feature: { label: featureLabel, color: featureColor, widgets },
    status,
    action,
    gates: {
      // Both a blocking issue and missing media stop lock/sign.
      canComplete: blockingIssueCount === 0 && effectiveMissing === 0,
      blockingIssueCount,
      highObservationCount,
      missingMediaCount: effectiveMissing,
      openIssueCount: t.openIssueCount,
    },
  };
}

interface ActionInput {
  asset: ProjectAsset;
  opts: DisplayStateOptions;
  paused: boolean;
  allStepsDone: boolean;
  missingMediaCount: number;
  blockingIssueCount: number;
  awaitingInstallerSig: boolean;
  awaitingCustomerSig: boolean;
  hasLockedRun: boolean;
}

function computeAction(i: ActionInput): WorkflowDisplayState["action"] {
  const { asset, opts } = i;

  // Cancelled assets are terminal and locked: no start/continue/resume/sign.
  // Checked before everything else so a cancel mid-run cannot fall through to a
  // signature or resume action.
  if (asset.status === "Cancelled") {
    return { kind: "run-details", label: "Run Details", tooltip: "Asset cancelled — view only", color: "inherit" };
  }

  // 0. Awaiting signatures — checked FIRST, before the workflow-source check.
  //
  // A locked run awaiting a signature is a real, actionable state that does NOT depend
  // on the asset still resolving a *runnable* workflow source: the run already exists,
  // and the only thing left to do is sign it. Previously this was checked AFTER the
  // "no runnable workflow source" branch below, which returns early — so whenever
  // hasRunnableWorkflowSource was false, an asset genuinely pending customer sign-off
  // rendered as "No workflow" and the signature action was unreachable.
  //
  // That happened on the phone but not the web: hasRunnableWorkflowSource is derived
  // from assignmentsMap, which on native is primed from the offline cache and can come
  // up empty, while the web fetches assignments fresh. Reordering fixes the symptom on
  // both platforms and makes the cascade correct regardless of why the flag is false.
  if (i.awaitingCustomerSig) {
    return { kind: "customer-sign", label: "Customer Sign-off", tooltip: "Capture the customer signature", color: "warning" };
  }

  // Missing required media blocks installer sign-off — surface photo recovery first (R3).
  if (i.allStepsDone && i.missingMediaCount > 0) {
    return { kind: "add-missing-photos", label: "Add Missing Photos", tooltip: "Capture the missing photo evidence", color: "warning" };
  }

  if (i.awaitingInstallerSig) {
    return { kind: "installer-sign", label: "Installer Sign-off", tooltip: "Capture the installer signature", color: "warning" };
  }

  // 1. No runnable workflow source.
  if (!opts.hasRunnableWorkflowSource) {
    if (opts.inspectionMode) {
      return { kind: "upload-json", label: "Upload JSON", tooltip: "Import an inspection definition", color: "info" };
    }
    // Completed/closed inspection assets with no source → view only.
    if ((asset.status === "Complete" || asset.status === "Closed") && i.hasLockedRun) {
      return { kind: "run-details", label: "Run Details", tooltip: "View run history", color: "inherit" };
    }
    return { kind: "no-workflow", label: "no workflow", tooltip: "Assign a workflow to this asset first", color: "inherit" };
  }

  // 3. Steps complete, pre-sign-off gates (R3 priority: blocking issues after photos).
  if (i.allStepsDone) {
    if (i.blockingIssueCount > 0) {
      const label = i.blockingIssueCount === 1 ? "Resolve Blocking Issue" : `Resolve ${i.blockingIssueCount} Blocking Issues`;
      return { kind: "resolve-blocking", label, tooltip: "Resolve the blocking issue(s) before sign-off", color: "error" };
    }
  }

  // 4. Paused → resume (checked after sign-off/steps-complete gates so a
  //    completed-but-unsigned run doesn't get stuck on "resume").
  if (i.paused) {
    return { kind: "resume", label: "Resume Run", tooltip: "Resume the paused run", color: "success" };
  }

  // 5. Active run → continue.
  if (asset.status === "InProgress" || asset.status === "Issue") {
    return { kind: "continue", label: "Continue Run", tooltip: "Continue the run", color: "success" };
  }

  // 6. Not started → start.
  if (asset.status === "NotStarted") {
    return { kind: "start", label: "Start Run", tooltip: "Start the workflow", color: "success" };
  }

  // 7. Completed/closed → view.
  if (i.hasLockedRun || asset.status === "Complete" || asset.status === "Closed") {
    return { kind: "run-details", label: "Run Details", tooltip: "View run history", color: "inherit" };
  }

  return null;
}

/** Chip label/color for Dashboard My Jobs cards — keeps chip aligned with action/run state. */
export function myJobsCardChipFromDisplayState(displayState: WorkflowDisplayState): {
  label: string;
  color: ChipColor;
} {
  const actionKind = displayState.action?.kind ?? "run-details";

  if (actionKind === "add-missing-photos") {
    return { label: displayState.feature.label, color: "warning" };
  }
  if (actionKind === "installer-sign" || actionKind === "customer-sign") {
    return { label: "Pending sign", color: "info" };
  }
  if (displayState.gates.blockingIssueCount > 0) {
    return { label: "In Progress", color: "error" };
  }
  if (displayState.status.key === "Pending" && actionKind === "run-details") {
    return {
      label: displayState.feature.label === "Done" ? "Complete" : "Field Work Complete",
      color: "success",
    };
  }
  if (actionKind === "resume") {
    return { label: "Paused by user", color: "warning" };
  }
  if (actionKind === "continue") {
    return {
      label: "In Progress",
      color: displayState.gates.openIssueCount > 0 ? "error" : "primary",
    };
  }
  return { label: displayState.status.label, color: displayState.status.color };
}
