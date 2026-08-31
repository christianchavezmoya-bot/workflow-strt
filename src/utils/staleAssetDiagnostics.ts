/**
 * Read-only trace of stale-asset-id reconciliation and fetch attempts.
 *
 * Does not change reconcileKnownMissingAssetIds()/getById()/verifyAssetExistsOnline()
 * behavior in any way — call sites compute and record a trace entry around the
 * existing, unmodified logic so a support bundle can show exactly what happened
 * to a specific id: was it known-missing before a workspace response, did that
 * response contain it (and where), did reconciliation un-mark it, and what was
 * the known-missing state at the exact moment a GET was about to fire for it.
 */
import offlineStore from "../services/offlineStore";
import { isMobileNativePlatform } from "./platform";

const RECONCILE_CACHE_KEY = "stale-asset-reconcile-trace";
const FETCH_CACHE_KEY = "stale-asset-fetch-trace";
const MAX_RECONCILE_PASSES = 10;
const MAX_FETCH_ENTRIES = 100;

export type WorkspaceSection = "currentInstalls" | "currentInspections" | "installHistory" | "inspectionHistory";

export interface StaleAssetReconcileIdTrace {
  assetId: string;
  knownMissingBefore: boolean;
  presentInWorkspace: boolean;
  workspaceSection?: WorkspaceSection;
  tombstoneRemoved: boolean;
  knownMissingAfter: boolean;
}

export interface StaleAssetReconcilePass {
  ts: string;
  source: "dashboardWorkspace" | "dashboardWorkspaceOfflineFirst";
  /** Only ids that were known-missing immediately before this pass — the interesting subset. */
  entries: StaleAssetReconcileIdTrace[];
  removedIds: string[];
}

export interface StaleAssetFetchAttempt {
  ts: string;
  assetId: string;
  knownMissingAtCallTime: boolean;
  source: "getById" | "verifyAssetExistsOnline";
}

async function appendCapped<T>(key: string, entry: T, max: number): Promise<void> {
  if (!isMobileNativePlatform()) return;
  try {
    const existing = (await offlineStore.getCache<T[]>(key)) ?? [];
    const next = [...existing, entry].slice(-max);
    await offlineStore.saveCache<T[]>(key, next);
  } catch { /* ignore */ }
}

/**
 * Build the per-id trace for a reconciliation pass. Pure — does not mark/unmark
 * anything itself. Call BEFORE invoking the real reconcileKnownMissingAssetIds(),
 * using the same knownMissing snapshot and workspace data it will use.
 */
export function buildReconcileTrace(
  knownMissingBeforeIds: Iterable<string>,
  workspace: Record<WorkspaceSection, Array<{ id: string }>>,
): StaleAssetReconcileIdTrace[] {
  const sections: WorkspaceSection[] = ["currentInstalls", "currentInspections", "installHistory", "inspectionHistory"];
  const sectionOf = new Map<string, WorkspaceSection>();
  for (const section of sections) {
    for (const item of workspace[section] ?? []) {
      if (item?.id && !sectionOf.has(item.id)) sectionOf.set(item.id, section);
    }
  }

  return [...knownMissingBeforeIds].map((assetId) => {
    const workspaceSection = sectionOf.get(assetId);
    return {
      assetId,
      knownMissingBefore: true,
      presentInWorkspace: workspaceSection !== undefined,
      workspaceSection,
      tombstoneRemoved: false, // filled in by recordReconcilePass once the real call runs
      knownMissingAfter: false, // filled in by recordReconcilePass
    };
  });
}

/** Call AFTER the real (unmodified) reconcileKnownMissingAssetIds() has run. */
export async function recordReconcilePass(
  source: StaleAssetReconcilePass["source"],
  preTrace: StaleAssetReconcileIdTrace[],
  isKnownMissingNow: (id: string) => boolean,
): Promise<void> {
  if (!isMobileNativePlatform() || preTrace.length === 0) return;
  const entries = preTrace.map((entry) => {
    const knownMissingAfter = isKnownMissingNow(entry.assetId);
    return { ...entry, knownMissingAfter, tombstoneRemoved: entry.knownMissingBefore && !knownMissingAfter };
  });
  const removedIds = entries.filter((e) => e.tombstoneRemoved).map((e) => e.assetId);
  await appendCapped<StaleAssetReconcilePass>(RECONCILE_CACHE_KEY, {
    ts: new Date().toISOString(),
    source,
    entries,
    removedIds,
  }, MAX_RECONCILE_PASSES);
}

export async function recordFetchAttempt(
  assetId: string,
  knownMissingAtCallTime: boolean,
  source: StaleAssetFetchAttempt["source"],
): Promise<void> {
  await appendCapped<StaleAssetFetchAttempt>(FETCH_CACHE_KEY, {
    ts: new Date().toISOString(),
    assetId,
    knownMissingAtCallTime,
    source,
  }, MAX_FETCH_ENTRIES);
}

export async function getStaleAssetReconcileTrace(): Promise<StaleAssetReconcilePass[]> {
  try {
    return (await offlineStore.getCache<StaleAssetReconcilePass[]>(RECONCILE_CACHE_KEY)) ?? [];
  } catch { return []; }
}

export async function getStaleAssetFetchTrace(): Promise<StaleAssetFetchAttempt[]> {
  try {
    return (await offlineStore.getCache<StaleAssetFetchAttempt[]>(FETCH_CACHE_KEY)) ?? [];
  } catch { return []; }
}
