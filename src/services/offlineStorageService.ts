/**
 * offlineStorageService — read-side aggregation for the Manage Offline Storage screen.
 *
 * Deliberately never walks the Filesystem: every byte figure here comes from the storage
 * manifest (IndexedDB, populated at write time — see mediaStore.ts/configMediaCache.ts) or from
 * measuring an already-fetched entity record's own JSON size. "Used by N-Go" and the category
 * breakdown are therefore O(number of local records), not O(number of files on disk).
 */

import {
  droppedActionsGetAll,
  entityGetAllProjects,
  entityGetIssueRecordsByProject,
  entityGetProjectRecord,
  entityGetWorkflowRunRecordsByProject,
  pendingCount,
  storageManifestGetByCategory,
  storageManifestGetByIssue,
  storageManifestGetByProject,
  storageManifestGetByWorkflowRun,
  type StorageManifestCategory,
} from "./localDB";
import { checkProjectDiscardEligibility, type DiscardEligibility } from "./projectDiscardService";
import { computeNGoBudgetBytes, computeStorageHealth, type StorageHealthResult } from "../utils/storageHealth";
import { readDeviceStorage, type DeviceStorageReading } from "./deviceStorageCapability";
import type { Project } from "../types/project";

const ALL_CATEGORIES: StorageManifestCategory[] = ["CAPTURED_MEDIA", "CONFIG_MEDIA", "DOCUMENT", "REPORT", "OTHER"];

export interface CategoryBreakdown {
  category: StorageManifestCategory;
  count: number;
  bytes: number;
}

/** Byte length of a JSON-serializable value, using actual UTF-8 bytes (never `.length`, which
 *  counts UTF-16 code units and undercounts any non-ASCII content). */
function jsonByteSize(value: unknown): number {
  if (value == null) return 0;
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return 0;
  }
}

/**
 * Manifest byte/count totals grouped by category. Five indexed queries (one per category) —
 * never a full `storage_manifest` table scan.
 */
export async function getStorageBreakdown(): Promise<{ byCategory: CategoryBreakdown[]; manifestTotalBytes: number }> {
  const results = await Promise.all(
    ALL_CATEGORIES.map(async (category) => {
      const entries = await storageManifestGetByCategory(category);
      return { category, count: entries.length, bytes: entries.reduce((sum, e) => sum + e.sizeBytes, 0) };
    }),
  );
  return { byCategory: results, manifestTotalBytes: results.reduce((sum, r) => sum + r.bytes, 0) };
}

export interface ProjectStorageSummary {
  projectId: string;
  name: string;
  status: string;
  /** Workflow run + issue JSON size for this project, plus every manifest entry attributed to
   *  its runs/issues/the project directly. A best-effort estimate — see the audit's "Other
   *  Cache" finding for what this necessarily excludes (unattributable flat-cache entries). */
  estimatedBytes: number;
  /** Real field, not invented: the project record's own last-sync timestamp. There is no
   *  "last opened on this device" tracking today — never label this "Last used." */
  lastSyncedAt: string | null;
  closedAtUtc: string | null;
  discardEligibility: DiscardEligibility;
}

async function estimateProjectBytes(projectId: string): Promise<number> {
  const [runs, issues, directManifest] = await Promise.all([
    entityGetWorkflowRunRecordsByProject(projectId),
    entityGetIssueRecordsByProject(projectId),
    storageManifestGetByProject(projectId),
  ]);

  let bytes = 0;
  const seenManifestIds = new Set<string>();
  const addManifest = (entries: { id: string; sizeBytes: number }[]) => {
    for (const e of entries) {
      if (seenManifestIds.has(e.id)) continue;
      seenManifestIds.add(e.id);
      bytes += e.sizeBytes;
    }
  };
  addManifest(directManifest);

  for (const run of runs) {
    bytes += jsonByteSize(run.data);
    addManifest(await storageManifestGetByWorkflowRun(run.id));
  }
  for (const issue of issues) {
    bytes += jsonByteSize(issue.data);
    addManifest(await storageManifestGetByIssue(issue.id));
  }
  return bytes;
}

/** One summary row per locally-cached project. Bounded by the number of LOCAL projects/runs/
 *  issues, never a filesystem walk. */
export async function getProjectStorageSummaries(): Promise<ProjectStorageSummary[]> {
  const projects = (await entityGetAllProjects()) as Project[];
  return Promise.all(
    projects.map(async (project) => {
      const [record, estimatedBytes, discard] = await Promise.all([
        entityGetProjectRecord(project.id),
        estimateProjectBytes(project.id),
        checkProjectDiscardEligibility(project.id),
      ]);
      return {
        projectId: project.id,
        name: project.jobNumber || project.customerName || project.id,
        status: project.status,
        estimatedBytes,
        lastSyncedAt: record?.syncedAt ?? null,
        closedAtUtc: project.closedAtUtc ?? null,
        discardEligibility: discard.eligibility,
      };
    }),
  );
}

export interface OfflineStorageOverview {
  nGoUsageBytes: number;
  nGoBudgetBytes: number;
  health: StorageHealthResult;
  device: DeviceStorageReading;
  offlineProjectCount: number;
  pendingSyncOperations: number;
  droppedSyncOperations: number;
  breakdown: CategoryBreakdown[];
}

/** Top-of-screen summary. */
export async function getOfflineStorageOverview(): Promise<OfflineStorageOverview> {
  const [breakdown, device, projects, pending, dropped] = await Promise.all([
    getStorageBreakdown(),
    readDeviceStorage(),
    entityGetAllProjects(),
    pendingCount(),
    droppedActionsGetAll(),
  ]);

  const nGoUsageBytes = breakdown.manifestTotalBytes;
  const nGoBudgetBytes = computeNGoBudgetBytes(device.totalBytes);
  const health = computeStorageHealth({
    nGoUsageBytes,
    nGoBudgetBytes,
    deviceFreeBytes: device.freeBytes,
    deviceTotalBytes: device.totalBytes,
  });

  return {
    nGoUsageBytes,
    nGoBudgetBytes,
    health,
    device,
    offlineProjectCount: projects.length,
    pendingSyncOperations: pending,
    droppedSyncOperations: dropped.length,
    breakdown: breakdown.byCategory,
  };
}
