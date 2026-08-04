import api from "./api";
import { IssueRepository } from "../repositories/IssueRepository";
import type { AssetWorkflowRun, RunIssue } from "../types/assetWorkflowRun";
import type { ProjectAsset, ProjectAssetStatus, ProjectAssetWorkflowSummary } from "../types/projectAsset";
import type { Project } from "../types/project";
import offlineStore, { type OfflineRun } from "./offlineStore";
import syncQueue from "./syncQueue";
import {
  entityGetAsset,
  entityPutAsset,
  entityReplaceIssuesForAsset,
  entityGetAllWorkflowRuns,
  entityGetAllAssets,
  entityGetAllProjects,
} from "./localDB";
import { mediaStore } from "./mediaStore";
import { workflowConfigService } from "./workflowConfigService";
import type { RunTimeEntry } from "../types/assetWorkflowRun";
import { isMobileNativePlatform } from "../utils/platform";
import { randomId } from "../utils/randomId";
import { shouldSkipBlockingFetch, shouldSkipBlockingNetworkRead, shouldSkipRunMutation } from "./connectivityMonitor";
import { boundedFreshRead, BOUNDED_FRESH_TIMEOUT_MS } from "../utils/boundedFreshRead";
import { webCachedGet, invalidateWebCache, invalidateWebCacheByPrefix } from "./webFreshCache";
import { RUN_MUTATION_TIMEOUT_MS } from "../utils/syncPolicy";
import type { AssetWorkflowRunSummary } from "../types/assetWorkflowRunSummary";
import { mergeRunsIntoMap, runSummaryToPlaceholderRun } from "../types/assetWorkflowRunSummary";
import {
  countMissingWorkflowItems,
  getWorkflowStepCompletion,
  parseWorkflowStepsFromSnapshot,
  runHasCompletedAllSteps,
} from "../utils/workflowCompleteness";

export interface PendingSignatureRecord {
  runId:        string;
  assetId:      string;
  assetTag:     string;
  assetName:    string;
  projectId:    string;
  jobNumber:    string;
  customerName: string;
  completedAt:  string;
  completedBy:  string;
  signatureStatus: string;
}

export interface OpenIssueRecord {
  issueId:      string;
  description:  string;
  issueType:    "blocking" | "observation" | "scope-deviation";
  severity:     "low" | "medium" | "high";
  isBlocking:   boolean;
  reportedAt:   string;
  createdBy:    string | null;
  stepTitle:    string | null;
  runId:        string;
  assetId:      string;
  assetTag:     string;
  assetName:    string;
  assetLocation: string;
  projectId:    string;
  jobNumber:    string;
  customerName: string;
  /** "run" = from a workflow run; "asset" = manually added via the chevron */
  source:       "run" | "asset";
}

export interface ClosedIssueRecord extends OpenIssueRecord {
  resolvedAt:      string | null;
  resolvedBy:      string | null;
  resolutionNote:  string | null;
}

const CLOSED_ISSUES_CACHE_KEY = "asset-workflow-closed-issues-v1";

function parseTimeEntries(json: string): RunTimeEntry[] {
  try {
    const parsed = JSON.parse(json) as RunTimeEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serializeTimeEntries(entries: RunTimeEntry[]): string {
  return JSON.stringify(
    [...entries].sort(
      (a, b) => new Date(a.startedAtUtc).getTime() - new Date(b.startedAtUtc).getTime()
    )
  );
}

function recomputeTimeMetrics(entries: RunTimeEntry[], nowUtc: string): {
  productiveSeconds: number;
  downtimeSeconds: number;
  downtimeEvents: number;
} {
  const nowMs = Date.parse(nowUtc);
  let productiveSeconds = 0;
  let downtimeSeconds = 0;
  let downtimeEvents = 0;
  for (const entry of entries) {
    const startMs = Date.parse(entry.startedAtUtc);
    const endMs = entry.endedAtUtc ? Date.parse(entry.endedAtUtc) : nowMs;
    const seconds = Number.isNaN(startMs) || Number.isNaN(endMs)
      ? 0
      : Math.max(0, Math.floor((endMs - startMs) / 1000));
    if (entry.category === "downtime") {
      downtimeSeconds += seconds;
      downtimeEvents += 1;
    } else {
      productiveSeconds += seconds;
    }
  }
  return { productiveSeconds, downtimeSeconds, downtimeEvents };
}

function closeOpenCategory(entries: RunTimeEntry[], category: RunTimeEntry["category"], atUtc: string): void {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (!entry.endedAtUtc && entry.category === category) {
      entry.endedAtUtc = atUtc;
      return;
    }
  }
}

function closeAnyOpenTimeEntry(entries: RunTimeEntry[], atUtc: string): void {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (!entries[i].endedAtUtc) {
      entries[i].endedAtUtc = atUtc;
      return;
    }
  }
}

function startProductivePeriod(entries: RunTimeEntry[], atUtc: string, reason?: string | null): void {
  if (entries.some((e) => !e.endedAtUtc && e.category === "productive")) return;
  entries.push({
    id: randomId(),
    category: "productive",
    startedAtUtc: atUtc,
    endedAtUtc: null,
    reason: reason ?? "Resumed",
  });
}

function startDowntimePeriod(entries: RunTimeEntry[], atUtc: string, reason?: string | null): void {
  if (entries.some((e) => !e.endedAtUtc && e.category === "downtime")) return;
  entries.push({
    id: randomId(),
    category: "downtime",
    startedAtUtc: atUtc,
    endedAtUtc: null,
    reason: reason ?? "Paused",
  });
}

/** Mirror server TrackTimeEntry logic for offline replay. */
function applyOfflineTimeEntryAction(
  run: OfflineRun,
  action: "StartProductive" | "ResumeProductive" | "StartDowntime" | "StopDowntime" | "StopAll",
  reason: string | undefined,
  startedAtUtc: string,
  endedAtUtc: string,
): OfflineRun {
  const entries = parseTimeEntries(run.timeTrackingJson ?? "[]");
  const normalized = action.trim().toLowerCase();

  switch (normalized) {
    case "startproductive":
    case "resumeproductive":
      closeOpenCategory(entries, "downtime", endedAtUtc);
      startProductivePeriod(entries, startedAtUtc, reason);
      break;
    case "startdowntime":
    case "stopproductive":
      closeOpenCategory(entries, "productive", endedAtUtc);
      startDowntimePeriod(entries, startedAtUtc, reason);
      break;
    case "stopdowntime":
      closeOpenCategory(entries, "downtime", endedAtUtc);
      break;
    case "stopall":
    case "pause":
      closeAnyOpenTimeEntry(entries, endedAtUtc);
      break;
    default:
      throw new Error(`Unknown time entry action: ${action}`);
  }

  const now = new Date().toISOString();
  const metrics = recomputeTimeMetrics(entries, now);
  const status =
    normalized === "stopall" || normalized === "pause"
      ? ("Paused" as const)
      : normalized === "startproductive" || normalized === "resumeproductive"
        ? ("InProgress" as const)
        : run.status;

  return {
    ...run,
    timeTrackingJson: serializeTimeEntries(entries),
    productiveSeconds: metrics.productiveSeconds,
    downtimeSeconds: metrics.downtimeSeconds,
    downtimeEvents: metrics.downtimeEvents,
    status,
    updatedAt: now,
    lastLocalSavedAt: now,
    dirty: true,
    localStatus: "PendingSync",
    syncError: undefined,
  };
}

async function enqueueTimeEntry(
  runId: string,
  body: Record<string, unknown>,
  optimisticPatch: Record<string, unknown>,
): Promise<void> {
  const dependsOnRunCreate = await resolvePendingRunCreateOpId(runId);

  // Each time-entry action is a distinct, dated event that must reach the server in order —
  // collapsing a sequence into "just the latest" (the old behavior here) silently discards the
  // earlier ones, undercounting time relative to what actually happened. Chain to whatever
  // time-entry action is still pending for this run so they always flush in order, and so a
  // failed/conflicted earlier entry blocks later ones instead of racing ahead.
  const dependsOnPriorTimeEntry = (await syncQueue.listByEntityId(runId))
    .filter((op) => op.opType === "TIME_ENTRY" && op.status !== "uploading")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]?.id;

  await syncQueue.enqueue({
    opType: "TIME_ENTRY",
    url: `/asset-workflow-runs/${runId}/time-entry`,
    method: "POST",
    entityType: "workflow-run",
    entityId: runId,
    body,
    optimisticPatch,
    dependsOnOpId: dependsOnPriorTimeEntry ?? dependsOnRunCreate,
  });
}

async function resolvePendingRunCreateOpId(runId: string): Promise<string | undefined> {
  if (!runId.startsWith("offline-run-")) return undefined;
  const create = (await syncQueue.listByEntityId(runId))
    .find((op) => op.opType === "RUN_CREATE" && op.status !== "uploading");
  return create?.id;
}

function isOfflineNetworkError(error: unknown): boolean {
  if (shouldSkipRunMutation()) return true;
  if (!error || typeof error !== "object") return !navigator.onLine;
  const candidate = error as { code?: string; message?: string; response?: unknown };
  if (candidate.response) return false;
  return (
    candidate.code === "ECONNABORTED" ||
    candidate.code === "ERR_NETWORK" ||
    candidate.message === "Network Error" ||
    !navigator.onLine
  );
}

async function resolveProjectId(assetId: string, runId?: string): Promise<string> {
  const assetRecord = await entityGetAsset(assetId);
  if (assetRecord?.projectId) return assetRecord.projectId;
  if (runId) {
    const cachedRun = await offlineStore.getRun(runId);
    if (cachedRun?.projectId) return cachedRun.projectId;
  }
  return "";
}

async function resolveRunId(runId: string): Promise<string> {
  return await offlineStore.getMappedId("workflow-run", runId) ?? runId;
}

async function getCachedRun(runId: string): Promise<OfflineRun | null> {
  const direct = await offlineStore.getRun(runId);
  if (direct) return direct;
  const mappedId = await resolveRunId(runId);
  if (mappedId !== runId) {
    return await offlineStore.getRun(mappedId);
  }
  return null;
}

function buildRunSnapshot(config: { id: string; name: string; version: number; stepsJson: string; mediaJson: string; featureSelectionsJson: string }): string {
  return JSON.stringify({
    id: config.id,
    name: config.name,
    version: config.version,
    stepsJson: config.stepsJson,
    mediaJson: config.mediaJson,
    featureSelectionsJson: config.featureSelectionsJson,
    snapshotAt: new Date().toISOString(),
  });
}

function buildInitialTimeTracking(now: string): string {
  const entries: RunTimeEntry[] = [{
    id: randomId(),
    category: "productive",
    startedAtUtc: now,
    endedAtUtc: null,
    reason: "Run started",
  }];
  return JSON.stringify(entries);
}

function toOfflineRun(run: AssetWorkflowRun, projectId: string, overrides: Partial<OfflineRun> = {}): OfflineRun {
  const now = new Date().toISOString();
  return {
    ...run,
    projectId,
    serverRunId: run.id,
    localRunId: overrides.localRunId ?? run.id,
    localStatus: overrides.localStatus ?? "Synced",
    lastLocalSavedAt: overrides.lastLocalSavedAt ?? now,
    dirty: overrides.dirty ?? false,
    syncError: overrides.syncError,
    ...overrides,
  };
}

async function cacheServerRun(run: AssetWorkflowRun): Promise<AssetWorkflowRun> {
  const projectId = await resolveProjectId(run.assetId, run.id);
  const existing = await offlineStore.getRun(run.id);
  if (existing?.dirty) {
    // Local data is newer (pending sync) - merge server metadata but keep local payload intact
    await offlineStore.saveRun({
      ...toOfflineRun(run, projectId),
      stepResultsJson: existing.stepResultsJson,
      issuesJson: existing.issuesJson,
      status: existing.status,
      timeTrackingJson: existing.timeTrackingJson,
      productiveSeconds: existing.productiveSeconds,
      downtimeSeconds: existing.downtimeSeconds,
      dirty: true,
      localStatus: existing.localStatus,
      syncError: existing.syncError,
      lastLocalSavedAt: existing.lastLocalSavedAt,
    });
    return run;
  }
  await offlineStore.saveRun(toOfflineRun(run, projectId));
  return run;
}

async function cacheServerRuns(runs: AssetWorkflowRun[]): Promise<AssetWorkflowRun[]> {
  await Promise.all(runs.map((run) => cacheServerRun(run)));
  return runs;
}

function refreshRunsInBackground(
  scope: { type: "project"; id: string } | { type: "asset"; id: string },
  endpoint: string,
): void {
  if (shouldSkipBlockingNetworkRead()) return;
  api.get<AssetWorkflowRun[]>(endpoint)
    .then(async (res) => {
      const runs = await cacheServerRuns(res.data);
      window.dispatchEvent(new CustomEvent("workflow-runs-cache-updated", {
        detail: scope.type === "project"
          ? { projectId: scope.id, runs }
          : { assetId: scope.id, runs },
      }));
    })
    .catch(() => {
      window.dispatchEvent(new Event("api-serving-cache"));
    });
}

function refreshRunByIdInBackground(resolvedId: string): void {
  if (shouldSkipBlockingNetworkRead()) return;
  api.get<AssetWorkflowRun>(`/asset-workflow-runs/${resolvedId}`)
    .then(async (res) => {
      await cacheServerRun(res.data);
      window.dispatchEvent(new CustomEvent("workflow-runs-cache-updated", {
        detail: { assetId: res.data.assetId, runs: [res.data] },
      }));
    })
    .catch(() => {
      window.dispatchEvent(new Event("api-serving-cache"));
    });
}

// Signal that a run was updated LOCALLY (offline write path). The Assets page's
// workflow-runs-cache-updated listener refreshes its runsMap from this, so
// status/features/actions update offline WITHOUT a network round-trip. This is
// the offline counterpart to refreshRuns*InBackground, which only dispatch after
// a successful network GET (they early-return when offline) - so without this,
// offline pause/issue/missing-photo writes persisted locally but the UI never
// re-rendered until the app went back online.
function signalLocalRunUpdate(run: AssetWorkflowRun): void {
  window.dispatchEvent(new CustomEvent("workflow-runs-cache-updated", {
    detail: { assetId: run.assetId, runs: [run], mergeById: true },
  }));
}

function invalidateWebRunReadCaches(assetId?: string): void {
  if (assetId) {
    invalidateWebCache(`/asset-workflow-runs/by-asset/${assetId}`);
    invalidateWebCache(`/project-assets/${assetId}`);
  }
  invalidateWebCacheByPrefix("/asset-workflow-runs/by-asset/");
  invalidateWebCacheByPrefix("/asset-workflow-runs/by-project/");
  invalidateWebCacheByPrefix("/project-assets/by-product/");
  invalidateWebCacheByPrefix("/project-assets/by-project/");
}

/** Surgical invalidation after a single-run text capture edit — avoids project-wide refetch. */
function invalidateWebRunDetailCaches(runId: string, assetId?: string): void {
  invalidateWebCache(`/asset-workflow-runs/${runId}`);
  if (assetId) {
    invalidateWebCache(`/asset-workflow-runs/by-asset/${assetId}`);
  }
}

function parseRunIssues(issuesJson: string | undefined): RunIssue[] {
  if (!issuesJson) return [];
  try {
    const parsed = JSON.parse(issuesJson) as RunIssue[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function assertNoBlockingIssuesForComplete(issuesJson: string): void {
  const blockingCount = parseRunIssues(issuesJson)
    .filter((issue) => issue.isBlocking && !issue.resolved).length;
  if (blockingCount > 0) {
    throw new Error(`Cannot complete: ${blockingCount} blocking issue(s) must be resolved first.`);
  }
}

/** Matches server finalized signature check (AssetWorkflowRunsController). */
export function isRunSignatureFinalized(
  run: Pick<AssetWorkflowRun, "signatureStatus" | "customerSignedAt">,
): boolean {
  return !!run.customerSignedAt
    || run.signatureStatus === "Signed"
    || run.signatureStatus === "Declined"
    || run.signatureStatus === "WaivedCustomer";
}

/** Workspace summary / asset-level signature status (no run timestamps available). */
export function isAssetSignatureStatusFinalized(signatureStatus?: string | null): boolean {
  const value = (signatureStatus ?? "").trim();
  return value === "Signed" || value === "Declined" || value === "WaivedCustomer";
}

export function deriveOfflineAssetStatusFromRun(
  run: Pick<AssetWorkflowRun, "status" | "isLocked" | "issuesJson" | "signatureStatus" | "customerSignedAt" | "installerSignedAt">,
): ProjectAssetStatus {
  const hasOpenBlockingIssue = parseRunIssues(run.issuesJson)
    .some((issue) => issue.isBlocking && !issue.resolved);

  if (!run.isLocked) {
    if (run.status === "Paused") return "Paused";
    if (hasOpenBlockingIssue) return "Issue";
    return "InProgress";
  }

  if (isRunSignatureFinalized(run)) return "Complete";

  // Trust signature timestamps over stale signatureStatus (e.g. PendingInstaller after installer signed).
  if (run.installerSignedAt && run.customerSignedAt) return "Complete";
  if (run.installerSignedAt && !run.customerSignedAt) return "Pending";

  if (run.signatureStatus === "PendingInstaller") return "Pending";
  if (run.signatureStatus === "PendingCustomer" && !run.customerSignedAt) return "Pending";
  return "Complete";
}


type CachedAssetWithDerivedState = ProjectAsset & {
  hasOpenIssues?: boolean;
  signatureStatus?: string;
  latestActivityAt?: string;
  completedAt?: string;
};

function deriveOfflineWorkflowSummaryFromRun(
  run: AssetWorkflowRun,
  existingSummary?: ProjectAssetWorkflowSummary,
): ProjectAssetWorkflowSummary {
  const totalSteps = parseWorkflowStepsFromSnapshot(run.workflowSnapshotJson ?? "").length;
  const { completedSteps } = getWorkflowStepCompletion(run);
  const allStepsDone = runHasCompletedAllSteps(run);
  const missingItems = allStepsDone ? countMissingWorkflowItems(run) : 0;
  const hasOpenIssues = parseRunIssues(run.issuesJson).some((issue) => !issue.resolved);
  const hasWorkflow = totalSteps > 0 || existingSummary?.hasWorkflow === true;

  let evidenceStatus: ProjectAssetWorkflowSummary["evidenceStatus"] = "None";
  if (hasWorkflow) {
    if (!run.isLocked && run.status === "Paused") evidenceStatus = "Paused";
    else if (!run.isLocked) evidenceStatus = "Running";
    else if (missingItems > 0) evidenceStatus = "MissingData";
    else evidenceStatus = "Complete";
  }

  return {
    hasWorkflow,
    evidenceStatus,
    requiredItems: totalSteps,
    completedItems: completedSteps,
    missingItems,
    latestRunId: run.id,
    latestRunStatus: run.status,
    latestRunLocked: run.isLocked,
    signatureStatus: run.signatureStatus,
    hasOpenIssues,
    latestRunStartedAt: run.startedAt,
    latestRunCompletedAt: run.completedAt,
    totalInventoryFeatures: existingSummary?.totalInventoryFeatures,
    completedInventoryFeatures: existingSummary?.completedInventoryFeatures,
  };
}

export async function syncOfflineAssetWorkflowStateFromRun(
  run: AssetWorkflowRun,
  statusOverride?: ProjectAssetStatus,
): Promise<void> {
  if (!isMobileNativePlatform()) return;
  try {
    const existing = await entityGetAsset(run.assetId);
    if (!existing) return;
    const data = (existing.data as CachedAssetWithDerivedState | null) ?? null;
    if (!data) return;

    const workflowSummary = deriveOfflineWorkflowSummaryFromRun(run, data.workflowSummary);
    let nextStatus = statusOverride ?? deriveOfflineAssetStatusFromRun(run);
    // A stale run snapshot must not regress a locally Complete asset back to Pending
    // (e.g. dual-signed CC-0007 after an unrelated offline write).
    if (data.status === "Complete" && nextStatus === "Pending") {
      nextStatus = "Complete";
    }
    const localRunState = run as Partial<{ dirty: boolean; localStatus: string }>;
    const keepAssetDirty = localRunState.dirty === true
      || (!!localRunState.localStatus && localRunState.localStatus !== "Synced");
    const updated: CachedAssetWithDerivedState = {
      ...data,
      status: nextStatus,
      updatedAt: run.updatedAt ?? data.updatedAt,
      workflowSummary,
      hasOpenIssues: workflowSummary.hasOpenIssues,
      signatureStatus: run.signatureStatus,
      latestActivityAt: run.updatedAt ?? data.updatedAt,
      completedAt: run.completedAt ?? data.completedAt,
    };

    await entityPutAsset({
      id: existing.id,
      productId: existing.productId,
      projectId: existing.projectId,
      data: updated,
      dirty: keepAssetDirty,
    });
    window.dispatchEvent(new CustomEvent("repo:assets:updated", {
      detail: {
        assetId: existing.id,
        productId: existing.productId,
        projectId: existing.projectId,
      },
    }));
  } catch {
    // non-fatal
  }
}
async function listPendingSignaturesLocalImpl(userId?: string): Promise<PendingSignatureRecord[]> {
  const [runs, assets, projects] = await Promise.all([
    entityGetAllWorkflowRuns(),
    entityGetAllAssets(),
    entityGetAllProjects(),
  ]);
  const assetById = new Map((assets as ProjectAsset[]).map((asset) => [asset.id, asset]));
  const projectById = new Map((projects as Project[]).map((project) => [project.id, project]));
  const records: PendingSignatureRecord[] = [];
  for (const run of runs as AssetWorkflowRun[]) {
    if (!run.isLocked) continue;
    if (isRunSignatureFinalized(run)) continue;
    if (run.signatureStatus !== "PendingInstaller" && run.signatureStatus !== "PendingCustomer") continue;
    const asset = assetById.get(run.assetId);
    if (!asset) continue;
    if (userId && asset.assignedUserId !== userId) continue;
    const project = projectById.get(asset.projectId);
    records.push({
      runId: run.id,
      assetId: run.assetId,
      assetTag: asset.assetTag,
      assetName: asset.assetName ?? "",
      projectId: asset.projectId,
      jobNumber: project?.jobNumber ?? "",
      customerName: project?.customerName ?? "",
      completedAt: run.completedAt ?? "",
      completedBy: run.completedByName ?? "",
      signatureStatus: run.signatureStatus,
    });
  }
  return records;
}

async function enqueueRunMutation(
  runId: string,
  input: {
    opType: "RUN_UPDATE" | "RUN_COMPLETE" | "RUN_ABANDON" | "STEP_RESULTS" | "ISSUE_UPDATE";
    method: "PUT" | "POST" | "PATCH";
    url: string;
    body: Record<string, unknown>;
    optimisticPatch: Record<string, unknown>;
    dependsOnOpId?: string;
  },
): Promise<void> {
  const dependsOnOpId = input.dependsOnOpId ?? await resolvePendingRunCreateOpId(runId);
  const existing = (await syncQueue.listByEntityId(runId))
    .filter((op) => op.opType === input.opType && op.url === input.url && op.method === input.method)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  if (existing && existing.status !== "uploading") {
    await syncQueue.updateQueuedOp(existing.id, {
      body: input.body,
      optimisticPatch: input.optimisticPatch,
      dependsOnOpId: dependsOnOpId ?? existing.dependsOnOpId,
    });
    return;
  }

  await syncQueue.enqueue({
    opType: input.opType,
    url: input.url,
    method: input.method,
    entityType: "workflow-run",
    entityId: runId,
    body: input.body,
    optimisticPatch: input.optimisticPatch,
    dependsOnOpId,
  });
}

// -- Pure derivation helpers --------------------------------------------------

/** Derive {id, assetId, projectId, data} records for the issues store from a
 *  run's issuesJson. Only unresolved issues are included. Enriches with run/asset
 *  context. jobNumber/customerName require a project lookup and are left blank;
 *  the background refresh in IssueRepository corrects them on the next sync. */
async function deriveOpenIssuesFromRun(run: AssetWorkflowRun): Promise<Array<{
  id: string; assetId: string; projectId: string; data: unknown;
}>> {
  let issues: RunIssue[] = [];
  try { issues = JSON.parse(run.issuesJson ?? "[]"); } catch { /* empty */ }

  const assetRecord = await entityGetAsset(run.assetId);
  const projectId = assetRecord?.projectId ?? "";
  const asset = (assetRecord?.data as ProjectAsset | null) ?? null;
  let jobNumber = "";
  let customerName = "";
  if (projectId) {
    const projects = await entityGetAllProjects() as Project[];
    const project = projects.find((p) => p.id === projectId);
    jobNumber = project?.jobNumber ?? "";
    customerName = project?.customerName ?? "";
  }

  return issues
    .filter((i) => !i.resolved)
    .map((i) => ({
      id: i.id,
      assetId: run.assetId,
      projectId,
      data: {
        issueId: i.id,
        description: i.description,
        issueType: i.issueType,
        severity: i.severity,
        isBlocking: i.isBlocking,
        reportedAt: i.reportedAt,
        createdBy: i.createdBy ?? null,
        stepTitle: i.stepTitle ?? null,
        runId: run.id,
        assetId: run.assetId,
        assetTag: asset?.assetTag ?? "",
        assetName: asset?.assetName ?? "",
        assetLocation: asset?.location ?? "",
        projectId,
        jobNumber,
        customerName,
        source: "run" as const,
      } satisfies OpenIssueRecord,
    }));
}

function sortClosedIssues(records: ClosedIssueRecord[]): ClosedIssueRecord[] {
  return [...records].sort((a, b) => {
    const aTime = a.resolvedAt ? Date.parse(a.resolvedAt) : 0;
    const bTime = b.resolvedAt ? Date.parse(b.resolvedAt) : 0;
    return bTime - aTime;
  });
}

async function deriveClosedIssuesLocally(): Promise<ClosedIssueRecord[]> {
  const [runs, assets, projects] = await Promise.all([
    entityGetAllWorkflowRuns(),
    entityGetAllAssets(),
    entityGetAllProjects(),
  ]);

  const assetById = new Map((assets as ProjectAsset[]).map((asset) => [asset.id, asset]));
  const projectById = new Map((projects as Project[]).map((project) => [project.id, project]));
  const records: ClosedIssueRecord[] = [];

  for (const run of runs as AssetWorkflowRun[]) {
    let issues: RunIssue[] = [];
    try {
      issues = JSON.parse(run.issuesJson ?? "[]") as RunIssue[];
    } catch {
      issues = [];
    }

    const asset = assetById.get(run.assetId);
    const projectId = asset?.projectId ?? "";
    const project = projectById.get(projectId);

    for (const issue of issues) {
      if (!issue.resolved) continue;
      records.push({
        issueId: issue.id,
        description: issue.description,
        issueType: issue.issueType,
        severity: issue.severity,
        isBlocking: issue.isBlocking,
        reportedAt: issue.reportedAt,
        createdBy: issue.createdBy ?? null,
        stepTitle: issue.stepTitle ?? null,
        runId: run.id,
        assetId: run.assetId,
        assetTag: asset?.assetTag ?? "",
        assetName: asset?.assetName ?? "",
        assetLocation: asset?.location ?? "",
        projectId,
        jobNumber: project?.jobNumber ?? "",
        customerName: project?.customerName ?? "",
        source: "run",
        resolvedAt: issue.resolvedAt ?? null,
        resolvedBy: issue.resolvedBy ?? null,
        resolutionNote: issue.resolutionNote ?? issue.resolvedNote ?? null,
      });
    }
  }

  return sortClosedIssues(records);
}

/**
 * After an offline write that changes a run's effective state, also update the
 * parent asset's `status` field in IndexedDB and dispatch `repo:assets:updated`
 * so the assets page / dashboard reflect the new state immediately.
 *
 * Without this, `computeAction` in workflowDisplayState.ts reads `asset.status`
 * (which stays at its pre-write value) instead of the freshly-saved run state,
 * and shows the wrong action button / sub-label until the next server refresh
 * (e.g. on reconnect).
 *
 * Best-effort: never throws. Asset updates are non-fatal - the run itself is
 * the source of truth and will reconcile with the server on next sync.
 */
export async function applyOfflineAssetStatusUpdate(
  assetId: string,
  newStatus: ProjectAssetStatus,
): Promise<void> {
  try {
    const existing = await entityGetAsset(assetId);
    if (!existing) return;
    const data = (existing.data as ProjectAsset | null) ?? null;
    if (!data) return;
    if (data.status === newStatus) return;
    const updated: ProjectAsset = { ...data, status: newStatus };
    await entityPutAsset({
      id: existing.id,
      productId: existing.productId,
      projectId: existing.projectId,
      data: updated,
      dirty: true,
    });
    window.dispatchEvent(new CustomEvent("repo:assets:updated", {
      detail: {
        assetId,
        productId: existing.productId,
        projectId: existing.projectId,
      },
    }));
  } catch {
    // non-fatal
  }
}

export const assetWorkflowRunService = {
  /** IndexedDB runs for an asset - native only; no network. */
  async listLocalByAsset(assetId: string): Promise<AssetWorkflowRun[]> {
    if (!isMobileNativePlatform()) return [];
    return offlineStore.listRunsByAsset(assetId);
  },

  async listLatestByProject(projectId: string): Promise<AssetWorkflowRun[]> {
    if (!isMobileNativePlatform()) {
      return webCachedGet(`/asset-workflow-runs/by-project/${projectId}`, async () => {
        const res = await api.get<AssetWorkflowRun[]>(`/asset-workflow-runs/by-project/${projectId}`);
        return res.data;
      }, { ttlMs: 5_000 });
    }

    const cachedRuns = await offlineStore.listRunsByProject(projectId);
    if (cachedRuns.length > 0) {
      refreshRunsInBackground({ type: "project", id: projectId }, `/asset-workflow-runs/by-project/${projectId}`);
      return cachedRuns;
    }

    if (shouldSkipBlockingNetworkRead()) {
      return cachedRuns;
    }

    try {
      const res = await api.get<AssetWorkflowRun[]>(`/asset-workflow-runs/by-project/${projectId}`);
      const runs = res.data;
      return await cacheServerRuns(runs);
    } catch {
      return await offlineStore.listRunsByProject(projectId);
    }
  },

  /** Slim latest-run rows for a project page — no StepResultsJson blobs (web perf). */
  async listRunSummariesByProject(projectId: string, assetIds?: string[]): Promise<AssetWorkflowRun[]> {
    const params = assetIds?.length ? { assetIds: assetIds.join(",") } : undefined;
    const cacheKey = `/asset-workflow-runs/by-project/${projectId}/runs-summary${params?.assetIds ? `?${params.assetIds}` : ""}`;
    const summaries = await webCachedGet(cacheKey, async () => {
      const res = await api.get<AssetWorkflowRunSummary[]>(
        `/asset-workflow-runs/by-project/${projectId}/runs-summary`,
        { params },
      );
      return res.data;
    }, { ttlMs: 5_000 });
    return summaries.map(runSummaryToPlaceholderRun);
  },

  /** Batch slim runs for multiple projects — one request instead of N fan-out calls (web perf F2). */
  async listRunSummariesByProjects(projectIds: string[]): Promise<AssetWorkflowRun[]> {
    const ids = [...new Set(projectIds.filter(Boolean))];
    if (ids.length === 0) return [];
    if (ids.length === 1) return this.listRunSummariesByProject(ids[0]);
    const sorted = ids.slice().sort();
    const cacheKey = `/asset-workflow-runs/by-projects/runs-summary?${sorted.join(",")}`;
    const summaries = await webCachedGet(cacheKey, async () => {
      const res = await api.get<AssetWorkflowRunSummary[]>(
        "/asset-workflow-runs/by-projects/runs-summary",
        { params: { projectIds: sorted.join(",") } },
      );
      return res.data;
    }, { ttlMs: 5_000 });
    return summaries.map(runSummaryToPlaceholderRun);
  },

  /** Full run blobs for capture editing — scoped to visible assets only. */
  async loadRunDetailsForAssets(projectId: string, assetIds: string[]): Promise<AssetWorkflowRun[]> {
    if (assetIds.length === 0) return [];
    const res = await api.get<AssetWorkflowRun[]>(
      `/asset-workflow-runs/by-project/${projectId}/runs-detail`,
      { params: { assetIds: assetIds.join(",") } },
    );
    return res.data;
  },

  async listByAsset(assetId: string): Promise<AssetWorkflowRun[]> {
    if (!isMobileNativePlatform()) {
      // Shorter TTL than the default - this feeds run-state decisions (e.g.
      // "Continue Run" vs "Start Run") that should stay close to live.
      return webCachedGet(
        `/asset-workflow-runs/by-asset/${assetId}`,
        async () => {
          const res = await api.get<AssetWorkflowRun[]>(`/asset-workflow-runs/by-asset/${assetId}`);
          return res.data;
        },
        { ttlMs: 8_000 }
      );
    }

    const cachedRuns = await offlineStore.listRunsByAsset(assetId);
    if (cachedRuns.length > 0) {
      refreshRunsInBackground({ type: "asset", id: assetId }, `/asset-workflow-runs/by-asset/${assetId}`);
      return cachedRuns;
    }

    if (shouldSkipBlockingNetworkRead()) {
      return cachedRuns;
    }

    try {
      const res = await api.get<AssetWorkflowRun[]>(`/asset-workflow-runs/by-asset/${assetId}`);
      const runs = res.data;
      return await cacheServerRuns(runs);
    } catch {
      return await offlineStore.listRunsByAsset(assetId);
    }
  },

  async listByAssetFresh(assetId: string): Promise<AssetWorkflowRun[]> {
    if (!isMobileNativePlatform()) {
      const res = await api.get<AssetWorkflowRun[]>(`/asset-workflow-runs/by-asset/${assetId}`);
      return res.data;
    }

    // CONTRACT: "Fresh" means authoritative. Callers use this exactly when a
    // stale answer is harmful (resume-vs-start decisions, verifying a save,
    // priming the bootstrap cache). A previous perf pass made this return the
    // local cache whenever it was non-empty and only refreshed in the
    // background, which silently turned every caller back into a cache read —
    // on an online phone that means run-state decisions were made from stale
    // runs.
    //
    // But awaiting unconditionally is also wrong on a phone: on site wifi with
    // no route to the server, every call would block for the full 10 s API
    // timeout. boundedFreshRead waits only a short slice for the authoritative
    // answer, then serves cache and lets the request finish in the background.
    // Device-level offline short-circuits to cache with no network attempt.
    return await boundedFreshRead(
      async () => {
        const res = await api.get<AssetWorkflowRun[]>(`/asset-workflow-runs/by-asset/${assetId}`);
        return await cacheServerRuns(res.data);
      },
      () => offlineStore.listRunsByAsset(assetId),
    );
  },

  async getById(id: string): Promise<AssetWorkflowRun | null> {
    if (!isMobileNativePlatform()) {
      try {
        return await webCachedGet(`/asset-workflow-runs/${id}`, async () => {
          const res = await api.get<AssetWorkflowRun>(`/asset-workflow-runs/${id}`);
          return res.data;
        });
      } catch {
        return null;
      }
    }

    const resolvedId = await resolveRunId(id);
    const cached = await getCachedRun(id);
    if (cached) {
      refreshRunByIdInBackground(resolvedId);
      return cached;
    }

    if (shouldSkipBlockingNetworkRead()) {
      return null;
    }

    try {
      const res = await api.get<AssetWorkflowRun>(`/asset-workflow-runs/${resolvedId}`);
      return await cacheServerRun(res.data);
    } catch {
      return await getCachedRun(id);
    }
  },

  /** Local IndexedDB only — used on the critical runner open path. */
  async getByIdLocalFirst(id: string): Promise<AssetWorkflowRun | null> {
    if (!isMobileNativePlatform()) {
      return this.getById(id);
    }
    return getCachedRun(id);
  },

  /**
   * Authoritative read for background reconcile — waits briefly for network,
   * unlike getById() which returns cache immediately when present.
   */
  async getByIdFresh(id: string): Promise<AssetWorkflowRun | null> {
    if (!isMobileNativePlatform()) {
      try {
        const res = await api.get<AssetWorkflowRun>(`/asset-workflow-runs/${id}`);
        return res.data;
      } catch {
        return null;
      }
    }

    if (shouldSkipBlockingNetworkRead()) {
      return getCachedRun(id);
    }

    const resolvedId = await resolveRunId(id);
    return await boundedFreshRead(
      async () => {
        const res = await api.get<AssetWorkflowRun>(`/asset-workflow-runs/${resolvedId}`);
        return await cacheServerRun(res.data);
      },
      async () => (await getCachedRun(id)) ?? null,
      { timeoutMs: BOUNDED_FRESH_TIMEOUT_MS },
    );
  },

  /** Fire-and-forget authoritative refresh for an asset's runs. */
  refreshByAssetInBackground(assetId: string): void {
    refreshRunsInBackground({ type: "asset", id: assetId }, `/asset-workflow-runs/by-asset/${assetId}`);
  },

  async startRun(assetId: string, workflowConfigId: string, technicianUserId?: string): Promise<AssetWorkflowRun> {
    const startedAtUtc = new Date().toISOString();
    const initialTimeTrackingJson = buildInitialTimeTracking(startedAtUtc);
    const body = {
      assetId,
      workflowConfigId,
      technicianUserId: technicianUserId ?? null,
      startedAtUtc,
      timeTrackingJson: initialTimeTrackingJson,
    };

    if (!isMobileNativePlatform()) {
      const res = await api.post<AssetWorkflowRun>("/asset-workflow-runs", body);
      invalidateWebCache(`/asset-workflow-runs/by-asset/${assetId}`);
      invalidateWebRunReadCaches(assetId);
      return res.data;
    }

    try {
      if (shouldSkipRunMutation()) throw new Error("skip-network-offline");
      const res = await api.post<AssetWorkflowRun>("/asset-workflow-runs", body);
      const updatedRun = await cacheServerRun(res.data);
      signalLocalRunUpdate(updatedRun);
      await syncOfflineAssetWorkflowStateFromRun(updatedRun, deriveOfflineAssetStatusFromRun(updatedRun));
      return updatedRun;
    } catch (error) {
      if (!isOfflineNetworkError(error)) throw error;

      const existingRunId = await offlineStore.getPreviousRunRef(assetId, workflowConfigId);
      if (existingRunId) {
        const cachedExisting = await getCachedRun(existingRunId);
        // Return ANY existing run (locked or not) so we never silently create
        // a duplicate when an asset already has a Complete/locked run. The UI
        // routes the user to Run Details / Re-run in that case (via the
        // asset.status = "Complete" cascade from applyOfflineAssetStatusUpdate).
        if (cachedExisting) return cachedExisting;
      }

      const config = await workflowConfigService.getById(workflowConfigId);
      if (!config) throw error;

      const localRunId = `offline-run-${randomId()}`;
      const projectId = await resolveProjectId(assetId);
      const existingRuns = await offlineStore.listRunsByAsset(assetId);
      const offlineRun: OfflineRun = {
        id: localRunId,
        assetId,
        workflowConfigId,
        workflowVersion: config.version,
        workflowSnapshotJson: buildRunSnapshot(config),
        status: "InProgress",
        isLocked: false,
        technicianUserId,
        stepResultsJson: "[]",
        issuesJson: "[]",
        timeTrackingJson: initialTimeTrackingJson,
        productiveSeconds: 0,
        downtimeSeconds: 0,
        downtimeEvents: 0,
        runNumber: existingRuns.filter((run) => run.workflowConfigId === workflowConfigId).length + 1,
        completedByName: undefined,
        signatureStatus: "None",
        installerSignedAt: undefined,
        customerSignedAt: undefined,
        startedAt: startedAtUtc,
        completedAt: undefined,
        createdAt: startedAtUtc,
        updatedAt: startedAtUtc,
        projectId,
        localRunId,
        serverRunId: undefined,
        localStatus: "PendingSync",
        lastLocalSavedAt: startedAtUtc,
        dirty: true,
        syncError: undefined,
      };

      await offlineStore.saveRun(offlineRun);
      signalLocalRunUpdate(offlineRun);
      await syncOfflineAssetWorkflowStateFromRun(offlineRun, deriveOfflineAssetStatusFromRun(offlineRun));
      // Update the parent asset's status so the dashboard / asset page reflect
      // the new InProgress state immediately, instead of waiting for the next
      // server refresh (which won't happen until the device reconnects).
      await applyOfflineAssetStatusUpdate(assetId, "InProgress");
      await syncQueue.enqueue({
        opType: "RUN_CREATE",
        url: "/asset-workflow-runs",
        method: "POST",
        entityType: "workflow-run",
        entityId: localRunId,
        body,
        optimisticPatch: {
          status: "InProgress",
          isLocked: false,
          startedAt: startedAtUtc,
          updatedAt: startedAtUtc,
        },
      });
      return offlineRun;
    }
  },

  async saveProgress(runId: string, stepResultsJson: string, issuesJson?: string, status?: string): Promise<AssetWorkflowRun> {
    if (!isMobileNativePlatform()) {
      const requestBody = await mediaStore.resolveUploadPayload({
        stepResultsJson,
        issuesJson: issuesJson ?? null,
        status: status ?? null,
      });
      const res = await api.put<AssetWorkflowRun>(`/asset-workflow-runs/${runId}`, requestBody, {
        timeout: RUN_MUTATION_TIMEOUT_MS,
      });
      invalidateWebCache(`/asset-workflow-runs/${runId}`);
      invalidateWebRunReadCaches(res.data.assetId);
      return res.data;
    }

    const resolvedRunId = await resolveRunId(runId);
    const body = {
      stepResultsJson,
      issuesJson: issuesJson ?? null,
      status: status ?? null,
    };
    try {
      if (shouldSkipRunMutation()) throw new Error("skip-network-offline");
      const requestBody = await mediaStore.resolveUploadPayload(body);
      const res = await api.put<AssetWorkflowRun>(`/asset-workflow-runs/${resolvedRunId}`, requestBody, {
        timeout: RUN_MUTATION_TIMEOUT_MS,
      });
      const updatedRun = await cacheServerRun(res.data);
      signalLocalRunUpdate(updatedRun);
      await syncOfflineAssetWorkflowStateFromRun(updatedRun, deriveOfflineAssetStatusFromRun(updatedRun));
      return updatedRun;
    } catch (error) {
      if (!isOfflineNetworkError(error)) throw error;

      const cachedRun = await getCachedRun(runId);
      if (!cachedRun) throw error;

      const now = new Date().toISOString();
      const offlineRun: OfflineRun = {
        ...cachedRun,
        stepResultsJson,
        issuesJson: issuesJson ?? cachedRun.issuesJson,
        status: (status as AssetWorkflowRun["status"] | undefined) ?? cachedRun.status,
        updatedAt: now,
        lastLocalSavedAt: now,
        dirty: true,
        localStatus: "PendingSync",
        syncError: undefined,
      };

      await offlineStore.saveRun(offlineRun);
      signalLocalRunUpdate(offlineRun);
      await syncOfflineAssetWorkflowStateFromRun(offlineRun, deriveOfflineAssetStatusFromRun(offlineRun));
      // Sync issues store so Issues Board reflects any issue changes from progress saves.
      // Fix: must call this even when openRecords is empty - entityReplaceIssuesForAsset
      // correctly removes stale closed entries, unlike the old entityPutIssues-only call.
      const openRecords = await deriveOpenIssuesFromRun(offlineRun);
      await entityReplaceIssuesForAsset(offlineRun.assetId, openRecords);
      window.dispatchEvent(new Event("repo:issues:updated"));
      await enqueueRunMutation(resolvedRunId, {
        opType: "RUN_UPDATE",
        method: "PUT",
        url: `/asset-workflow-runs/${resolvedRunId}`,
        body,
        optimisticPatch: {
          stepResultsJson,
          issuesJson: issuesJson ?? cachedRun.issuesJson,
          status: status ?? cachedRun.status,
          updatedAt: now,
        },
      });
      return offlineRun;
    }
  },

  /** Discard all captured progress, photos, issues, and time entries for an in-progress run. */
  async abandonRun(runId: string): Promise<AssetWorkflowRun> {
    if (!isMobileNativePlatform()) {
      const res = await api.post<AssetWorkflowRun>(`/asset-workflow-runs/${runId}/abandon`, {}, {
        timeout: RUN_MUTATION_TIMEOUT_MS,
      });
      invalidateWebCache(`/asset-workflow-runs/${runId}`);
      invalidateWebRunReadCaches(res.data.assetId);
      return res.data;
    }

    const resolvedRunId = await resolveRunId(runId);
    try {
      if (shouldSkipRunMutation()) throw new Error("skip-network-offline");
      const res = await api.post<AssetWorkflowRun>(`/asset-workflow-runs/${resolvedRunId}/abandon`, {}, {
        timeout: RUN_MUTATION_TIMEOUT_MS,
      });
      await syncQueue.removeByEntityId(resolvedRunId);
      await syncQueue.removeByEntityId(runId);
      const updatedRun = await cacheServerRun(res.data);
      signalLocalRunUpdate(updatedRun);
      await syncOfflineAssetWorkflowStateFromRun(updatedRun, deriveOfflineAssetStatusFromRun(updatedRun));
      return updatedRun;
    } catch (error) {
      if (!isOfflineNetworkError(error)) throw error;

      const cachedRun = await getCachedRun(runId);
      if (!cachedRun) throw error;

      const now = new Date().toISOString();
      const offlineRun: OfflineRun = {
        ...cachedRun,
        stepResultsJson: "[]",
        issuesJson: "[]",
        timeTrackingJson: "[]",
        productiveSeconds: 0,
        downtimeSeconds: 0,
        downtimeEvents: 0,
        status: "InProgress",
        updatedAt: now,
        lastLocalSavedAt: now,
        dirty: true,
        localStatus: "PendingSync",
        syncError: undefined,
      };

      await offlineStore.saveRun(offlineRun);
      await syncQueue.removeByEntityId(resolvedRunId);
      await syncQueue.removeByEntityId(runId);
      signalLocalRunUpdate(offlineRun);
      await syncOfflineAssetWorkflowStateFromRun(offlineRun, deriveOfflineAssetStatusFromRun(offlineRun));
      await entityReplaceIssuesForAsset(offlineRun.assetId, []);
      window.dispatchEvent(new Event("repo:issues:updated"));
      await enqueueRunMutation(resolvedRunId, {
        opType: "RUN_ABANDON",
        method: "POST",
        url: `/asset-workflow-runs/${resolvedRunId}/abandon`,
        body: {},
        optimisticPatch: {
          stepResultsJson: "[]",
          issuesJson: "[]",
          timeTrackingJson: "[]",
          productiveSeconds: 0,
          downtimeSeconds: 0,
          downtimeEvents: 0,
          status: "InProgress",
          updatedAt: now,
        },
      });
      return offlineRun;
    }
  },

  async completeRun(runId: string, stepResultsJson: string, issuesJson: string, completedByName?: string, bomActualJson?: string): Promise<AssetWorkflowRun> {
    if (!isMobileNativePlatform()) {
      const body = {
        stepResultsJson,
        issuesJson,
        completedByName: completedByName ?? null,
        bomActualJson: bomActualJson ?? null,
      };
      // Web sends inline base64 — no native media:// refs to resolve.
      const requestBody = body;
      const res = await api.post<AssetWorkflowRun>(`/asset-workflow-runs/${runId}/complete`, requestBody, {
        timeout: RUN_MUTATION_TIMEOUT_MS,
      });
      // Completing a run also changes the asset's own status server-side
      // (see AssetWorkflowRunsController.CompleteRun) - invalidate both so
      // the very next read of either is guaranteed live, not a stale
      // pre-completion snapshot.
      invalidateWebCache(`/asset-workflow-runs/${runId}`);
      invalidateWebRunReadCaches(res.data.assetId);
      return res.data;
    }

    const resolvedRunId = await resolveRunId(runId);
    const body = {
      stepResultsJson,
      issuesJson,
      completedByName: completedByName ?? null,
      bomActualJson: bomActualJson ?? null,
    };
    try {
      if (shouldSkipRunMutation()) throw new Error("skip-network-offline");
      const requestBody = await mediaStore.resolveUploadPayload(body);
      const res = await api.post<AssetWorkflowRun>(`/asset-workflow-runs/${resolvedRunId}/complete`, requestBody, {
        timeout: RUN_MUTATION_TIMEOUT_MS,
      });
      const cachedRun = await cacheServerRun(res.data);
      signalLocalRunUpdate(cachedRun);
      await syncOfflineAssetWorkflowStateFromRun(cachedRun, "Pending");
      // Fix: the server's /complete response only contains the run, but completing
      // a run also changes the asset's own status server-side (e.g. to "Pending"
      // awaiting signature). Without this refetch, the locally cached asset stays
      // stuck on its pre-completion status (usually "InProgress"), which causes
      // the asset list to show the wrong action button ("Continue Run" instead of
      // "Installer Sign-off") until some unrelated full refresh happens to overwrite it.
      try {
        const assetRes = await api.get<{ id: string; productId: string; projectId: string; status: string }>(
          `/project-assets/${res.data.assetId}`
        );
        await entityPutAsset({
          id: assetRes.data.id,
          productId: assetRes.data.productId,
          projectId: assetRes.data.projectId,
          data: assetRes.data,
          dirty: false,
        });
      } catch {
        // Non-fatal - the run itself completed successfully. The asset will
        // self-correct on its next normal refresh if this refetch fails.
      }
      return cachedRun;
    } catch (error) {
      if (!isOfflineNetworkError(error)) throw error;

      const cachedRun = await getCachedRun(runId);
      if (!cachedRun) throw error;

      assertNoBlockingIssuesForComplete(issuesJson);

      const now = new Date().toISOString();

      // Mirror what the server's CompleteRun does (AssetWorkflowRunsController.cs:807-808) —
      // close out whatever time segment was left open and recompute the totals — so an
      // offline-completed run doesn't stay stuck at its initial productiveSeconds: 0 just
      // because the run never happened to pause/resume during the session.
      const timeEntries = parseTimeEntries(cachedRun.timeTrackingJson ?? "[]");
      closeAnyOpenTimeEntry(timeEntries, now);
      const timeMetrics = recomputeTimeMetrics(timeEntries, now);

      const offlineRun: OfflineRun = {
        ...cachedRun,
        stepResultsJson,
        issuesJson,
        completedByName,
        bomActualJson: bomActualJson ?? cachedRun.bomActualJson,
        status: "Complete",
        isLocked: true,
        timeTrackingJson: serializeTimeEntries(timeEntries),
        productiveSeconds: timeMetrics.productiveSeconds,
        downtimeSeconds: timeMetrics.downtimeSeconds,
        downtimeEvents: timeMetrics.downtimeEvents,
        // Fix: the server always sets this to "PendingInstaller" on completion
        // (see AssetWorkflowRunsController.CompleteRun). The offline fallback
        // previously never set it, so the run stayed on whatever signatureStatus
        // it had before completing - meaning the installer signature screen
        // never appeared until after reconnecting and re-syncing.
        signatureStatus: "PendingInstaller",
        completedAt: now,
        updatedAt: now,
        lastLocalSavedAt: now,
        dirty: true,
        localStatus: "PendingSync",
        syncError: undefined,
      };

      await offlineStore.saveRun(offlineRun);
      signalLocalRunUpdate(offlineRun);
      await syncOfflineAssetWorkflowStateFromRun(offlineRun, deriveOfflineAssetStatusFromRun(offlineRun));
      // Update the parent asset so the dashboard reflects "Pending" (awaiting
      // installer signature) immediately, instead of waiting for reconnect.
      await applyOfflineAssetStatusUpdate(offlineRun.assetId, "Pending");
      // Sync issues store so Issues Board reflects any issue changes from completion.
      const openRecords = await deriveOpenIssuesFromRun(offlineRun);
      await entityReplaceIssuesForAsset(offlineRun.assetId, openRecords);
      window.dispatchEvent(new Event("repo:issues:updated"));

      // Must not sync ahead of a still-pending time-entry action for this run — otherwise the
      // server closes out whatever segment it currently has open (possibly just the initial
      // "Run started" entry, if a pause/resume action hasn't landed yet) at the completion
      // instant, folding real downtime into productive time. Same chaining pattern already used
      // in enqueueTimeEntry() above.
      const dependsOnPriorTimeEntry = (await syncQueue.listByEntityId(resolvedRunId))
        .filter((op) => op.opType === "TIME_ENTRY" && op.status !== "uploading")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]?.id;

      await enqueueRunMutation(resolvedRunId, {
        opType: "RUN_COMPLETE",
        method: "POST",
        url: `/asset-workflow-runs/${resolvedRunId}/complete`,
        // Send the real completion instant so the server closes the final time segment at
        // that moment instead of at sync time (which would inflate the last segment).
        body: { ...body, completedAtUtc: now },
        optimisticPatch: {
          stepResultsJson,
          issuesJson,
          status: "Complete",
          isLocked: true,
          completedAt: now,
          updatedAt: now,
          bomActualJson: bomActualJson ?? cachedRun.bomActualJson,
        },
        dependsOnOpId: dependsOnPriorTimeEntry,
      });
      return offlineRun;
    }
  },

  async reopen(runId: string): Promise<AssetWorkflowRun> {
    const res = await api.post<AssetWorkflowRun>(`/asset-workflow-runs/${runId}/reopen`);
    return res.data;
  },

  /** Patch issues only - works on locked and in-progress runs. */
  async patchIssues(runId: string, issuesJson: string): Promise<AssetWorkflowRun> {
    if (!isMobileNativePlatform()) {
      const requestBody = await mediaStore.resolveUploadPayload({ issuesJson });
      const res = await api.patch<AssetWorkflowRun>(`/asset-workflow-runs/${runId}/issues`, requestBody);
      invalidateWebCache(`/asset-workflow-runs/${runId}`);
      invalidateWebRunReadCaches(res.data.assetId);
      window.dispatchEvent(new Event("notifications:run-state-changed"));
      window.dispatchEvent(new Event("notifications:refresh"));
      return res.data;
    }

    const resolvedRunId = await resolveRunId(runId);
    const body = { issuesJson };
    try {
      if (shouldSkipRunMutation()) throw new Error("skip-network-offline");
      const requestBody = await mediaStore.resolveUploadPayload(body);
      const res = await api.patch<AssetWorkflowRun>(`/asset-workflow-runs/${resolvedRunId}/issues`, requestBody);
      const updatedRun = await cacheServerRun(res.data);
      signalLocalRunUpdate(updatedRun);
      await syncOfflineAssetWorkflowStateFromRun(updatedRun, deriveOfflineAssetStatusFromRun(updatedRun));
      // Sync issues store so Issues Board reflects the change immediately,
      // without waiting for IssueRepository's own background refresh.
      const openRecords = await deriveOpenIssuesFromRun(updatedRun);
      await entityReplaceIssuesForAsset(updatedRun.assetId, openRecords);
      window.dispatchEvent(new Event("repo:issues:updated"));
      window.dispatchEvent(new Event("notifications:run-state-changed"));
      window.dispatchEvent(new Event("notifications:refresh"));
      return updatedRun;
    } catch (error) {
      if (!isOfflineNetworkError(error)) throw error;

      const cachedRun = await getCachedRun(runId);
      if (!cachedRun) throw error;

      const persistedIssuesJson = await mediaStore.persistIssueMediaInJson(issuesJson, resolvedRunId);
      const now = new Date().toISOString();
      const offlineRun: OfflineRun = {
        ...cachedRun,
        issuesJson: persistedIssuesJson,
        updatedAt: now,
        lastLocalSavedAt: now,
        dirty: true,
        localStatus: "PendingSync",
        syncError: undefined,
      };

      await offlineStore.saveRun(offlineRun);
      signalLocalRunUpdate(offlineRun);
      await syncOfflineAssetWorkflowStateFromRun(offlineRun, deriveOfflineAssetStatusFromRun(offlineRun));
      // Sync issues store so Issues Board reflects the change immediately, offline.
      const openRecords = await deriveOpenIssuesFromRun(offlineRun);
      await entityReplaceIssuesForAsset(offlineRun.assetId, openRecords);
      await applyOfflineAssetStatusUpdate(
        offlineRun.assetId,
        deriveOfflineAssetStatusFromRun(offlineRun),
      );
      await enqueueRunMutation(resolvedRunId, {
        opType: "ISSUE_UPDATE",
        method: "PATCH",
        url: `/asset-workflow-runs/${resolvedRunId}/issues`,
        body: { issuesJson: persistedIssuesJson },
        optimisticPatch: { issuesJson: persistedIssuesJson, updatedAt: now },
      });
      window.dispatchEvent(new Event("repo:issues:updated"));
      window.dispatchEvent(new Event("notifications:run-state-changed"));
      window.dispatchEvent(new Event("notifications:refresh"));
      return offlineRun;
    }
  },

  /**
   * After resolving a blocking issue, call this to auto-lock the run if no
   * blocking issues remain and the run is still in-progress.
   * Returns the updated run if it was auto-completed, null otherwise.
   */
  async tryAutoComplete(runId: string, completedByName?: string): Promise<AssetWorkflowRun | null> {
    const run = await this.getById(runId);
    if (!run || run.status !== "InProgress") return null;
    let issues: Array<{ isBlocking: boolean; resolved: boolean }> = [];
    try { issues = JSON.parse(run.issuesJson ?? "[]"); } catch { /* empty */ }
    const stillBlocking = issues.some((i) => i.isBlocking && !i.resolved);
    if (stillBlocking) return null;
    return await this.completeRun(runId, run.stepResultsJson ?? "[]", run.issuesJson ?? "[]", completedByName, run.bomActualJson);
  },

  /** Patch one text capture cell — small payload, no inbox/dashboard refresh (web). */
  async patchCaptureCell(
    runId: string,
    binding: { stepId: string; inputId: string; iterationIndex?: number },
    value: string,
    amendedByName?: string,
  ): Promise<AssetWorkflowRun> {
    if (!isMobileNativePlatform()) {
      const body = {
        stepId: binding.stepId,
        inputId: binding.inputId,
        iterationIndex: binding.iterationIndex ?? null,
        value,
        amendedByName: amendedByName ?? null,
      };
      const res = await api.patch<AssetWorkflowRun>(`/asset-workflow-runs/${runId}/capture-cell`, body, {
        timeout: RUN_MUTATION_TIMEOUT_MS,
      });
      invalidateWebRunDetailCaches(runId, res.data.assetId);
      return res.data;
    }

    const resolvedRunId = await resolveRunId(runId);
    const cachedRun = await getCachedRun(runId);
    if (!cachedRun) {
      throw new Error("Run not found in offline cache");
    }
    const { patchCaptureCellValue } = await import("../utils/captureTableEdit");
    const stepResultsJson = patchCaptureCellValue(cachedRun.stepResultsJson, binding, value);
    return this.patchStepResults(resolvedRunId, stepResultsJson, amendedByName, true);
  },

  /** Patch step results on a locked/complete run - used to add missing photos after completion. */
  async patchStepResults(runId: string, stepResultsJson: string, amendedByName?: string, captureDataAmend = false): Promise<AssetWorkflowRun> {
    if (!isMobileNativePlatform()) {
      const requestBody = await mediaStore.resolveUploadPayload({
        stepResultsJson,
        amendedByName: amendedByName ?? null,
        amendedAt: new Date().toISOString(),
        captureDataAmend,
      });
      const res = await api.patch<AssetWorkflowRun>(`/asset-workflow-runs/${runId}/step-results`, requestBody, {
        timeout: RUN_MUTATION_TIMEOUT_MS,
      });
      invalidateWebCache(`/asset-workflow-runs/${runId}`);
      if (captureDataAmend) {
        invalidateWebRunDetailCaches(runId, res.data.assetId);
      } else {
        invalidateWebRunReadCaches(res.data.assetId);
      }
      if (!captureDataAmend) {
        window.dispatchEvent(new Event("notifications:run-state-changed"));
        window.dispatchEvent(new Event("notifications:refresh"));
      }
      return res.data;
    }

    const resolvedRunId = await resolveRunId(runId);
    const amendedAt = new Date().toISOString();
    const body = {
      stepResultsJson,
      amendedByName: amendedByName ?? null,
      amendedAt,
      captureDataAmend,
    };
    try {
      if (shouldSkipRunMutation()) throw new Error("skip-network-offline");
      const requestBody = await mediaStore.resolveUploadPayload(body);
      const res = await api.patch<AssetWorkflowRun>(`/asset-workflow-runs/${resolvedRunId}/step-results`, requestBody, {
        timeout: RUN_MUTATION_TIMEOUT_MS,
      });
      const updatedRun = await cacheServerRun(res.data);
      signalLocalRunUpdate(updatedRun);
      await syncOfflineAssetWorkflowStateFromRun(updatedRun, deriveOfflineAssetStatusFromRun(updatedRun));
      if (!captureDataAmend) {
        window.dispatchEvent(new Event("notifications:run-state-changed"));
        window.dispatchEvent(new Event("notifications:refresh"));
      }
      return updatedRun;
    } catch (error) {
      if (!isOfflineNetworkError(error)) throw error;

      // Offline: persist the amended step results locally and queue the PATCH.
      // Media (base64 photos) in stepResultsJson is resolved by the sync engine's
      // generic replay path (mediaStore.resolveUploadPayload at send time), so
      // photos survive the queue and upload on reconnect - matching the rest of
      // the run lifecycle instead of failing outright.
      const cachedRun = await getCachedRun(runId);
      if (!cachedRun) throw error;

      const now = new Date().toISOString();
      const offlineRun: OfflineRun = {
        ...cachedRun,
        stepResultsJson,
        updatedAt: now,
        lastLocalSavedAt: now,
        dirty: true,
        localStatus: "PendingSync",
        syncError: undefined,
      };
      await offlineStore.saveRun(offlineRun);
      signalLocalRunUpdate(offlineRun);
      await syncOfflineAssetWorkflowStateFromRun(offlineRun, deriveOfflineAssetStatusFromRun(offlineRun));

      await enqueueRunMutation(resolvedRunId, {
        opType: "STEP_RESULTS",
        method: "PATCH",
        url: `/asset-workflow-runs/${resolvedRunId}/step-results`,
        body,
        optimisticPatch: {
          stepResultsJson,
          updatedAt: now,
        },
      });
      if (!captureDataAmend) {
        window.dispatchEvent(new Event("notifications:run-state-changed"));
        window.dispatchEvent(new Event("notifications:refresh"));
      }
      return offlineRun;
    }
  },

  async uploadStepMedia(
    runId: string,
    uploads: Array<{ stepId: string; inputId: string; file: File }>,
    amendedByName?: string,
  ): Promise<AssetWorkflowRun> {
    const resolvedRunId = await resolveRunId(runId);
    const amendedAt = new Date().toISOString();
    const formData = new FormData();
    formData.append(
      "itemsJson",
      JSON.stringify(uploads.map(({ stepId, inputId }) => ({ stepId, inputId }))),
    );
    formData.append("amendedAt", amendedAt);
    if (amendedByName) {
      formData.append("amendedByName", amendedByName);
    }
    for (const upload of uploads) {
      formData.append("files", upload.file, upload.file.name);
    }

    if (!isMobileNativePlatform()) {
      const res = await api.post<AssetWorkflowRun>(`/asset-workflow-runs/${runId}/step-media`, formData, {
        timeout: RUN_MUTATION_TIMEOUT_MS,
      });
      invalidateWebCache(`/asset-workflow-runs/${runId}`);
      invalidateWebRunReadCaches(res.data.assetId);
      window.dispatchEvent(new Event("notifications:run-state-changed"));
      window.dispatchEvent(new Event("notifications:refresh"));
      return res.data;
    }

    if (shouldSkipBlockingFetch()) {
      throw new Error("skip-network-offline");
    }

    const res = await api.post<AssetWorkflowRun>(`/asset-workflow-runs/${resolvedRunId}/step-media`, formData, {
      timeout: RUN_MUTATION_TIMEOUT_MS,
    });
    const updatedRun = await cacheServerRun(res.data);
    signalLocalRunUpdate(updatedRun);
      await syncOfflineAssetWorkflowStateFromRun(updatedRun, deriveOfflineAssetStatusFromRun(updatedRun));
    window.dispatchEvent(new Event("notifications:run-state-changed"));
    window.dispatchEvent(new Event("notifications:refresh"));
    return updatedRun;
  },

  /** Replace the full time-entries array and recompute metrics. Works on locked runs. */
  async patchTimeEntries(runId: string, timeEntriesJson: string): Promise<AssetWorkflowRun> {
    if (!isMobileNativePlatform()) {
      const res = await api.patch<AssetWorkflowRun>(`/asset-workflow-runs/${runId}/time-entries`, { timeEntriesJson });
      invalidateWebCache(`/asset-workflow-runs/${runId}`);
      invalidateWebRunReadCaches(res.data.assetId);
      return res.data;
    }

    const resolvedRunId = await resolveRunId(runId);
    const res = await api.patch<AssetWorkflowRun>(`/asset-workflow-runs/${resolvedRunId}/time-entries`, { timeEntriesJson });
    const updatedRun = await cacheServerRun(res.data);
    signalLocalRunUpdate(updatedRun);
      await syncOfflineAssetWorkflowStateFromRun(updatedRun, deriveOfflineAssetStatusFromRun(updatedRun));
    return updatedRun;
  },

  /** Mark customer signature as waived - run stays complete but skips customer sign-off. */
  async waiveCustomerSignature(runId: string): Promise<AssetWorkflowRun> {
    if (!isMobileNativePlatform()) {
      const res = await api.post<AssetWorkflowRun>(`/asset-workflow-runs/${runId}/waive-customer-signature`);
      invalidateWebCache(`/asset-workflow-runs/${runId}`);
      invalidateWebRunReadCaches(res.data.assetId);
      window.dispatchEvent(new Event("notifications:run-state-changed"));
      window.dispatchEvent(new Event("notifications:refresh"));
      return res.data;
    }

    const resolvedRunId = await resolveRunId(runId);
    const res = await api.post<AssetWorkflowRun>(`/asset-workflow-runs/${resolvedRunId}/waive-customer-signature`);
    const updatedRun = await cacheServerRun(res.data);
    signalLocalRunUpdate(updatedRun);
      await syncOfflineAssetWorkflowStateFromRun(updatedRun, deriveOfflineAssetStatusFromRun(updatedRun));
    window.dispatchEvent(new Event("notifications:run-state-changed"));
    window.dispatchEvent(new Event("notifications:refresh"));
    return updatedRun;
  },

  async trackTimeEntry(
    runId: string,
    action: "StartProductive" | "ResumeProductive" | "StartDowntime" | "StopDowntime" | "StopAll",
    reason?: string,
    startedAtUtc?: string,
    endedAtUtc?: string
  ): Promise<AssetWorkflowRun> {
    const body = {
      action,
      reason: reason ?? null,
      startedAtUtc: startedAtUtc ?? null,
      endedAtUtc: endedAtUtc ?? null,
    };

    if (!isMobileNativePlatform()) {
      const res = await api.post<AssetWorkflowRun>(`/asset-workflow-runs/${runId}/time-entry`, body);
      invalidateWebCache(`/asset-workflow-runs/${runId}`);
      invalidateWebRunReadCaches(res.data.assetId);
      return res.data;
    }

    const resolvedRunId = await resolveRunId(runId);
    try {
      if (shouldSkipRunMutation()) throw new Error("skip-network-offline");
      const res = await api.post<AssetWorkflowRun>(`/asset-workflow-runs/${resolvedRunId}/time-entry`, body);
      const updatedRun = await cacheServerRun(res.data);
      signalLocalRunUpdate(updatedRun);
      await syncOfflineAssetWorkflowStateFromRun(updatedRun, deriveOfflineAssetStatusFromRun(updatedRun));
      return updatedRun;
    } catch (error) {
      if (!isOfflineNetworkError(error)) throw error;

      const cachedRun = await getCachedRun(runId);
      if (!cachedRun) throw error;

      const now = new Date().toISOString();
      const startAt = startedAtUtc && !Number.isNaN(Date.parse(startedAtUtc)) ? startedAtUtc : now;
      const endAt = endedAtUtc && !Number.isNaN(Date.parse(endedAtUtc)) ? endedAtUtc : now;

      const offlineRun = applyOfflineTimeEntryAction(
        cachedRun,
        action,
        reason,
        startAt,
        endAt,
      );

      await offlineStore.saveRun(offlineRun);
      signalLocalRunUpdate(offlineRun);
      await syncOfflineAssetWorkflowStateFromRun(offlineRun, deriveOfflineAssetStatusFromRun(offlineRun));
      // Queue the REAL offline event timestamps (startAt/endAt), not the caller's nulls. When this
      // replays on reconnect the server parses them (ParseUtcOr) instead of falling back to
      // DateTime.UtcNow = the sync moment. Sending null made every replayed entry land at ~sync
      // time, collapsing all offline productive/downtime durations to ~0 — the "time resets to
      // zero after sync" bug. The web path is unaffected because online, now IS the event time.
      await enqueueTimeEntry(
        resolvedRunId,
        { ...body, startedAtUtc: startAt, endedAtUtc: endAt },
        {
          timeTrackingJson: offlineRun.timeTrackingJson,
          productiveSeconds: offlineRun.productiveSeconds,
          downtimeSeconds: offlineRun.downtimeSeconds,
          downtimeEvents: offlineRun.downtimeEvents,
          status: offlineRun.status,
          updatedAt: offlineRun.updatedAt,
        },
      );
      return offlineRun;
    }
  },

  async listPendingSignaturesLocal(userId?: string): Promise<PendingSignatureRecord[]> {
    if (!isMobileNativePlatform()) return [];
    try {
      return await listPendingSignaturesLocalImpl(userId);
    } catch {
      return [];
    }
  },

  async listPendingSignatures(userId?: string): Promise<PendingSignatureRecord[]> {
    try {
      const res = await api.get<PendingSignatureRecord[]>("/asset-workflow-runs/pending-signatures", {
        params: userId ? { userId } : undefined,
      });
      return res.data;
    } catch {
      if (!isMobileNativePlatform()) return [];
      try {
        return await listPendingSignaturesLocalImpl(userId);
      } catch {
        return [];
      }
    }
  },

  async listOpenIssues(userId?: string): Promise<OpenIssueRecord[]> {
    try { return await IssueRepository.getAll(userId); }
    catch { return []; }
  },

  async listClosedIssues(): Promise<ClosedIssueRecord[]> {
    if (!isMobileNativePlatform()) {
      try {
        const res = await api.get<ClosedIssueRecord[]>("/asset-workflow-runs/resolved-issues");
        return sortClosedIssues(res.data);
      } catch {
        return [];
      }
    }

    try {
      const local = await deriveClosedIssuesLocally();
      const cached = await offlineStore.getCache<ClosedIssueRecord[]>(CLOSED_ISSUES_CACHE_KEY);

      if (!shouldSkipBlockingFetch()) {
        api.get<ClosedIssueRecord[]>("/asset-workflow-runs/resolved-issues")
          .then(async (res) => {
            await offlineStore.saveCache(CLOSED_ISSUES_CACHE_KEY, sortClosedIssues(res.data));
            window.dispatchEvent(new Event("repo:closed-issues:updated"));
          })
          .catch(() => {
            window.dispatchEvent(new Event("repo:issues:fetch-failed"));
          });
      }

      if (local.length > 0) return local;
      if (cached && cached.length > 0) return sortClosedIssues(cached);
      if (shouldSkipBlockingFetch()) return [];

      const res = await api.get<ClosedIssueRecord[]>("/asset-workflow-runs/resolved-issues");
      const sorted = sortClosedIssues(res.data);
      await offlineStore.saveCache(CLOSED_ISSUES_CACHE_KEY, sorted);
      return sorted;
    } catch {
      return [];
    }
  },
};
