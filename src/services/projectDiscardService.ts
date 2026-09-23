/**
 * projectDiscardService — safety gate and LOCAL-ONLY cascade for "Remove from device."
 *
 * Design correction (owner-approved): storage health and discard eligibility are separate
 * concepts. This module has NO knowledge of storage health/budget — it answers exactly one
 * question, "can this project's local copy be safely removed from THIS device," and if so,
 * performs the removal. Unsynced work never influences a health level; it only ever blocks
 * removal of the specific project it belongs to.
 *
 * CRITICAL, non-negotiable: this module NEVER calls DELETE /projects/{id}/purge, never calls
 * projectService.purgeProject(), and never makes any server request. "Remove from device" is
 * local-only — the server-side project, assets, workflows, issues, results are always left
 * completely untouched. See docs/OFFLINE_STORAGE_MANAGEMENT.md for the full design.
 */

import {
  droppedActionsGetAll,
  entityDeleteAsset,
  entityDeleteProject,
  entityDeleteWorkflowRun,
  entityGetAssetRecordsByProject,
  entityGetIssueRecordsByProject,
  entityGetProjectRecord,
  entityGetWorkflowRunRecordsByProject,
  entityReplaceIssuesForAsset,
  pendingGetAll,
  storageManifestDelete,
  storageManifestGetByAsset,
  storageManifestGetByConfig,
  storageManifestGetByDocument,
  storageManifestGetByIssue,
  storageManifestGetByProject,
  storageManifestGetByWorkflowRun,
  type AssetRecord,
  type DroppedAction,
  type IssueRecord,
  type PendingAction,
  type StorageManifestEntry,
  type WorkflowRunRecord,
} from "./localDB";
import { extractMediaReferencePathsFromJsonField } from "../utils/mediaReferenceExtraction";
import mediaStore from "./mediaStore";

export type DiscardEligibility =
  | "SAFE_TO_REMOVE"
  | "UNSYNCED_CHANGES"
  | "DROPPED_SYNC_ACTIONS"
  | "SHARED_DEPENDENCIES"
  | "OTHER_BLOCKER";

export interface DiscardBlockerCounts {
  /** Dirty/pending/queued workflow-run changes (RUN_*, STEP_RESULTS, CAPTURE_CELL, SIGNATURE_SUBMIT, assignments). */
  workflowChanges: number;
  /** Photos/videos not yet confirmed uploaded — see the module doc comment on why this is a
   *  best-effort count (no per-file upload flag exists; see the audit finding on OfflineMediaRef.uploaded). */
  photosVideosPending: number;
  /** Dirty/pending/queued issue changes. */
  issuesPending: number;
  /** Pending TIME_ENTRY operations. */
  timeTrackingPending: number;
  /** Permanently-failed (dropped) sync operations — gave up retrying, still hold real local data. */
  failedSyncOperations: number;
  /** Anything matched to this project that doesn't fit the named buckets above. */
  otherPendingOperations: number;
}

export interface ProjectDiscardCheckResult {
  projectId: string;
  eligibility: DiscardEligibility;
  blockers: DiscardBlockerCounts;
  /** Pre-built, ready-to-display summary — see Phase 1G's confirmation copy for the full dialog. */
  message: string;
}

const ZERO_BLOCKERS: DiscardBlockerCounts = {
  workflowChanges: 0,
  photosVideosPending: 0,
  issuesPending: 0,
  timeTrackingPending: 0,
  failedSyncOperations: 0,
  otherPendingOperations: 0,
};

const WORKFLOW_OP_TYPES = new Set([
  "RUN_CREATE", "RUN_UPDATE", "RUN_COMPLETE", "RUN_BUNDLE", "RUN_ABANDON",
  "STEP_RESULTS", "CAPTURE_CELL", "SIGNATURE_SUBMIT",
  "WORKFLOW_ASSIGNMENT_CREATE", "WORKFLOW_ASSIGNMENT_DELETE",
]);
const MEDIA_OP_TYPES = new Set([
  "STEP_MEDIA_UPLOAD", "MEDIA_UPLOAD",
  "ASSET_DOCUMENT_LINK_ATTACH", "ASSET_DOCUMENT_LINK_UPLOAD", "ASSET_DOCUMENT_LINK_DETACH",
]);
const ISSUE_OP_TYPES = new Set(["ISSUE_CREATE", "ISSUE_UPDATE", "ISSUE_CLOSE"]);
const TIME_OP_TYPES = new Set(["TIME_ENTRY"]);

function classifyOpType(opType: string | undefined, bucket: DiscardBlockerCounts): void {
  if (opType && WORKFLOW_OP_TYPES.has(opType)) bucket.workflowChanges++;
  else if (opType && MEDIA_OP_TYPES.has(opType)) bucket.photosVideosPending++;
  else if (opType && ISSUE_OP_TYPES.has(opType)) bucket.issuesPending++;
  else if (opType && TIME_OP_TYPES.has(opType)) bucket.timeTrackingPending++;
  else bucket.otherPendingOperations++;
}

/** True when a queue row (pending or dropped) belongs to one of this project's entities.
 *  Mirrors the existing entityId/url/serverEntityId fuzzy-match convention already used by
 *  syncQueue.removeByEntityId/replaceEntityReferences, for consistency with established code. */
function matchesAnyId(
  row: { entityId: string; url?: string; serverEntityId?: string },
  ids: ReadonlySet<string>,
): boolean {
  if (ids.has(row.entityId)) return true;
  if (row.serverEntityId && ids.has(row.serverEntityId)) return true;
  if (row.url) {
    for (const id of ids) {
      if (row.url.includes(id)) return true;
    }
  }
  return false;
}

export interface ProjectDiscardInputs {
  projectId: string;
  projectRecord: { id: string; dirty: boolean } | null;
  assets: Array<{ id: string; dirty: boolean }>;
  workflowRuns: Array<{ id: string; dirty: boolean }>;
  issues: Array<{ id: string; dirty: boolean }>;
  pendingActions: Array<Pick<PendingAction, "entityId" | "url" | "serverEntityId" | "opType">>;
  droppedActions: Array<Pick<DroppedAction, "entityId" | "opType">>;
}

/**
 * Pure evaluation — no I/O, fully unit-testable. Every one of the checks Phase 1E requires:
 * dirty project record, dirty assets/runs/issues, pending_actions, dropped_actions. Time
 * tracking and "pending media" are TIME_ENTRY/*_MEDIA_UPLOAD opType breakdowns within
 * pendingActions, not a separate data source (see useOfflineTimeQueue.ts — it queues through
 * the same unified syncQueue).
 */
export function evaluateProjectDiscardEligibility(inputs: ProjectDiscardInputs): ProjectDiscardCheckResult {
  const { projectId } = inputs;
  const blockers: DiscardBlockerCounts = { ...ZERO_BLOCKERS };

  const projectDirty = inputs.projectRecord?.dirty === true;
  const dirtyAssets = inputs.assets.filter((a) => a.dirty).length;
  const dirtyRuns = inputs.workflowRuns.filter((r) => r.dirty).length;
  const dirtyIssues = inputs.issues.filter((i) => i.dirty).length;

  blockers.workflowChanges += dirtyRuns + (projectDirty ? 1 : 0) + dirtyAssets;
  blockers.issuesPending += dirtyIssues;

  const ids = new Set<string>([
    projectId,
    ...inputs.assets.map((a) => a.id),
    ...inputs.workflowRuns.map((r) => r.id),
    ...inputs.issues.map((i) => i.id),
  ]);

  let droppedCount = 0;
  for (const action of inputs.droppedActions) {
    if (!matchesAnyId({ entityId: action.entityId }, ids)) continue;
    droppedCount++;
  }
  blockers.failedSyncOperations = droppedCount;

  for (const action of inputs.pendingActions) {
    if (!matchesAnyId(action, ids)) continue;
    classifyOpType(action.opType, blockers);
  }

  const totalUnsynced =
    blockers.workflowChanges + blockers.photosVideosPending + blockers.issuesPending +
    blockers.timeTrackingPending + blockers.otherPendingOperations;

  let eligibility: DiscardEligibility;
  if (droppedCount > 0) eligibility = "DROPPED_SYNC_ACTIONS";
  else if (totalUnsynced > 0) eligibility = "UNSYNCED_CHANGES";
  else eligibility = "SAFE_TO_REMOVE";

  return { projectId, eligibility, blockers, message: buildMessage(eligibility, blockers) };
}

function buildMessage(eligibility: DiscardEligibility, b: DiscardBlockerCounts): string {
  if (eligibility === "SAFE_TO_REMOVE") {
    return "This project has no unsynced changes and can be safely removed from this device.";
  }
  const parts: string[] = [];
  if (b.workflowChanges > 0) parts.push(`${b.workflowChanges} workflow change${b.workflowChanges === 1 ? "" : "s"}`);
  if (b.photosVideosPending > 0) parts.push(`${b.photosVideosPending} photo${b.photosVideosPending === 1 ? "" : "s"}/video${b.photosVideosPending === 1 ? "" : "s"}`);
  if (b.issuesPending > 0) parts.push(`${b.issuesPending} issue${b.issuesPending === 1 ? "" : "s"}`);
  if (b.timeTrackingPending > 0) parts.push(`${b.timeTrackingPending} time entr${b.timeTrackingPending === 1 ? "y" : "ies"}`);
  if (b.otherPendingOperations > 0) parts.push(`${b.otherPendingOperations} other change${b.otherPendingOperations === 1 ? "" : "s"}`);
  if (b.failedSyncOperations > 0) parts.push(`${b.failedSyncOperations} failed sync operation${b.failedSyncOperations === 1 ? "" : "s"}`);
  const detail = parts.length > 0 ? ` (${parts.join(", ")})` : "";
  return `This project has unsynced changes and cannot be removed from this device yet${detail}.`;
}

/** Async orchestrator: fetches everything the pure evaluator needs, via indexed queries only —
 *  never a full-table scan (Phase 1I). */
export async function checkProjectDiscardEligibility(projectId: string): Promise<ProjectDiscardCheckResult> {
  const [projectRecord, assets, workflowRuns, issues, pendingActions, droppedActions] = await Promise.all([
    entityGetProjectRecord(projectId),
    entityGetAssetRecordsByProject(projectId),
    entityGetWorkflowRunRecordsByProject(projectId),
    entityGetIssueRecordsByProject(projectId),
    pendingGetAll(),
    droppedActionsGetAll(),
  ]);

  return evaluateProjectDiscardEligibility({
    projectId,
    projectRecord: projectRecord ? { id: projectRecord.id, dirty: projectRecord.dirty } : null,
    assets: assets.map((a) => ({ id: a.id, dirty: a.dirty })),
    workflowRuns: workflowRuns.map((r) => ({ id: r.id, dirty: r.dirty })),
    issues: issues.map((i) => ({ id: i.id, dirty: i.dirty })),
    pendingActions,
    droppedActions,
  });
}

// ── Phase 1F: shared-data-safe local cascade ────────────────────────────────────────────────

export interface ProjectDiscardResult {
  projectId: string;
  removed: boolean;
  eligibility: DiscardEligibility;
  /** Present only when removed === true. */
  deleted?: {
    assets: number;
    workflowRuns: number;
    issues: number;
    mediaFiles: number;
    manifestEntries: number;
  };
  /** Present only when removed === false. */
  blockers?: DiscardBlockerCounts;
  message: string;
}

async function deleteExclusiveMediaFor(manifestEntries: StorageManifestEntry[]): Promise<number> {
  let count = 0;
  for (const entry of manifestEntries) {
    if (entry.shared) continue; // never delete shared content here — see reference-count step below
    if (entry.locationKind !== "filesystem") continue; // web-embedded media has no separate file
    await mediaStore.deleteMedia(entry.path);
    await storageManifestDelete(entry.id);
    count++;
  }
  return count;
}

/** Every distinct manifest entry reachable from this project's runs/issues, by walking their
 *  JSON for stored-media references AND by the direct workflowRunId/issueId/assetId/projectId
 *  attribution recorded at write time (Phase 1B) — the union covers both entries written with
 *  full attribution and any not yet attributed, without assuming either source is complete. */
async function collectProjectMediaManifestEntries(
  projectId: string,
  assets: AssetRecord[],
  runs: WorkflowRunRecord[],
  issues: IssueRecord[],
): Promise<StorageManifestEntry[]> {
  const byId = new Map<string, StorageManifestEntry>();
  const add = (entries: StorageManifestEntry[]) => { for (const e of entries) byId.set(e.id, e); };

  add(await storageManifestGetByProject(projectId));
  for (const a of assets) add(await storageManifestGetByAsset(a.id));
  for (const r of runs) add(await storageManifestGetByWorkflowRun(r.id));
  for (const i of issues) add(await storageManifestGetByIssue(i.id));

  return [...byId.values()];
}

/**
 * Deletes local-only data for `projectId` after confirming sync safety. NEVER calls the server.
 * Project-scoped data (project record, its assets, workflow runs, issues, and their exclusively-
 * owned captured media) is removed unconditionally once safe. Shared resources (config media,
 * documents) are only ever candidates for cleanup via reference-counting against every OTHER
 * locally-cached project — "prefer keeping an unnecessary shared cache item over deleting
 * something another offline project needs" (owner instruction): on any uncertainty, this keeps
 * the shared item rather than guessing.
 */
export async function discardProjectFromDevice(projectId: string): Promise<ProjectDiscardResult> {
  const check = await checkProjectDiscardEligibility(projectId);
  if (check.eligibility !== "SAFE_TO_REMOVE") {
    return { projectId, removed: false, eligibility: check.eligibility, blockers: check.blockers, message: check.message };
  }

  const [assets, runs, issues] = await Promise.all([
    entityGetAssetRecordsByProject(projectId),
    entityGetWorkflowRunRecordsByProject(projectId),
    entityGetIssueRecordsByProject(projectId),
  ]);

  // 1. Media referenced directly inside run/issue JSON (orphan prevention, Phase 1C) — this is
  //    the authoritative extraction, since it reflects exactly what the record actually embeds,
  //    independent of whether every file happened to get a manifest entry.
  const referencedPaths = new Set<string>();
  for (const r of runs) {
    const run = r.data as { stepResultsJson?: string; issuesJson?: string } | undefined;
    for (const p of extractMediaReferencePathsFromJsonField(run?.stepResultsJson, "stepResultsJson")) referencedPaths.add(p);
    for (const p of extractMediaReferencePathsFromJsonField(run?.issuesJson, "issuesJson")) referencedPaths.add(p);
  }
  for (const i of issues) {
    const issue = i.data as { resolutionMedia?: string[] } | undefined;
    for (const p of extractMediaReferencePathsFromJsonField(JSON.stringify(issue ? [issue] : []), "issuesJson")) referencedPaths.add(p);
  }

  // 2. Manifest entries attributed to this project's entities (Phase 1B bookkeeping) — the union
  //    with (1) above, deduplicated by path, so a file is never deleted twice and a manifest-less
  //    legacy file referenced only via JSON is still caught.
  const manifestEntries = await collectProjectMediaManifestEntries(projectId, assets, runs, issues);
  const manifestByPath = new Map(manifestEntries.map((e) => [e.path, e]));

  let mediaFilesDeleted = 0;
  // Exclusive (non-shared) manifest entries: delete file + manifest row.
  mediaFilesDeleted += await deleteExclusiveMediaFor(manifestEntries.filter((e) => !e.shared));
  // Any referenced path with NO manifest entry at all (pre-manifest legacy file) is still this
  // project's exclusively-owned capture — delete the file; there is no manifest row to remove.
  for (const path of referencedPaths) {
    if (manifestByPath.has(path)) continue; // already handled above (or intentionally shared/kept)
    await mediaStore.deleteMedia(path);
    mediaFilesDeleted++;
  }

  // 3. Reference-count shared entries (config media, documents) this project's assets/runs
  //    pointed at, and delete only those with zero remaining references from any OTHER project's
  //    still-cached data. Any lookup failure here is treated conservatively — keep the item.
  const sharedEntries = manifestEntries.filter((e) => e.shared);
  let manifestEntriesDeleted = mediaFilesDeleted; // exclusive entries already counted their own manifest row
  for (const entry of sharedEntries) {
    const stillReferenced = await isSharedEntryStillReferencedElsewhere(entry, projectId);
    if (stillReferenced !== false) continue; // true OR "uncertain" (null) -> keep it, never guess
    await mediaStore.deleteMedia(entry.path);
    await storageManifestDelete(entry.id);
    manifestEntriesDeleted++;
  }

  // 4. Project-scoped entity rows — safe unconditionally now that sync-safety passed.
  await Promise.all(runs.map((r) => entityDeleteWorkflowRun(r.id)));
  await Promise.all(assets.map((a) => entityDeleteAsset(a.id)));
  // Issues have no single-record delete helper today; they are removed via the same
  // replace-by-scope primitive already used elsewhere for this store.
  const issuesByAsset = new Map<string, IssueRecord[]>();
  for (const i of issues) issuesByAsset.set(i.assetId, [...(issuesByAsset.get(i.assetId) ?? []), i]);
  for (const assetId of issuesByAsset.keys()) await entityReplaceIssuesForAsset(assetId, []);
  await entityDeleteProject(projectId);

  return {
    projectId,
    removed: true,
    eligibility: "SAFE_TO_REMOVE",
    deleted: {
      assets: assets.length,
      workflowRuns: runs.length,
      issues: issues.length,
      mediaFiles: mediaFilesDeleted,
      manifestEntries: manifestEntriesDeleted,
    },
    message: "This project's offline copy was removed from this device. It remains available online and can be downloaded again later.",
  };
}

/**
 * true = still referenced elsewhere (keep); false = confirmed no other locally-cached project
 * needs it (safe to delete); null = could not determine confidently (keep — never guess).
 */
async function isSharedEntryStillReferencedElsewhere(
  entry: StorageManifestEntry,
  excludingProjectId: string,
): Promise<boolean | null> {
  try {
    const related = entry.configId
      ? await storageManifestGetByConfig(entry.configId)
      : entry.documentId
        ? await storageManifestGetByDocument(entry.documentId)
        : null;
    if (related == null) return null; // no way to reference-count this entry — keep it
    for (const other of related) {
      if (other.id === entry.id) continue;
      if (other.projectId && other.projectId !== excludingProjectId) return true;
      if (!other.projectId) return true; // an unattributed sibling entry — cannot prove it's unused
    }
    return false;
  } catch {
    return null;
  }
}
