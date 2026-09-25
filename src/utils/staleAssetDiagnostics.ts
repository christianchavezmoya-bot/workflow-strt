/**
 * Bounded, best-effort tracing for the known-missing-asset guard
 * (staleAssetIds.ts) and its reconciliation/fetch call sites in
 * projectAssetService.ts.
 *
 * OBSERVABILITY ONLY: every function here is called strictly AROUND the
 * real, unmodified reconcile/fetch logic — buildReconcileTrace runs before
 * reconcileKnownMissingAssetIds(), recordReconcilePass runs after it — and
 * none of this changes which ids end up known-missing, which GETs are
 * skipped, or any other reconciliation/fetch decision. All writes are
 * capped and swallow their own errors so a diagnostics failure can never
 * affect asset/dashboard behavior.
 */
import offlineStore from "../services/offlineStore";
import { isMobileNativePlatform } from "./platform";
import { isKnownMissingAssetId } from "./staleAssetIds";
import type { DashboardWorkspace, DashboardWorkspaceAssetItem } from "../services/projectAssetService";

export type WorkspaceSection =
  | "currentInstalls"
  | "currentInspections"
  | "installHistory"
  | "inspectionHistory";

const WORKSPACE_SECTIONS: WorkspaceSection[] = [
  "currentInstalls",
  "currentInspections",
  "installHistory",
  "inspectionHistory",
];

const RECONCILE_TRACE_CACHE_KEY = "stale-asset-reconcile-trace";
const FETCH_TRACE_CACHE_KEY = "stale-asset-fetch-trace";
const MAX_RECONCILE_PASSES = 10;
const MAX_FETCH_ENTRIES = 100;

export interface StaleAssetReconcileIdTrace {
  assetId: string;
  knownMissingBefore: boolean;
  presentInWorkspace: boolean;
  workspaceSection?: WorkspaceSection;
  knownMissingAfter: boolean;
  /** True when this pass cleared the known-missing marker (asset reappeared). */
  markerCleared: boolean;
}

export interface StaleAssetReconcilePass {
  timestamp: string;
  /** Call site that triggered the reconcile, e.g. "dashboardWorkspace". */
  source: string;
  ids: StaleAssetReconcileIdTrace[];
}

export interface StaleAssetFetchAttempt {
  timestamp: string;
  assetId: string;
  knownMissingAtCallTime: boolean;
  /** Call site, e.g. "getById" | "verifyAssetExistsOnline". */
  source: string;
}

/** Pre-computed half of a reconcile trace, built before the real reconcile call runs. */
export interface StaleAssetReconcilePreTraceEntry {
  assetId: string;
  presentInWorkspace: boolean;
  workspaceSection?: WorkspaceSection;
}

async function appendCapped<T>(key: string, entry: T, max: number): Promise<void> {
  if (!isMobileNativePlatform()) return;
  try {
    const existing = (await offlineStore.getCache<T[]>(key)) ?? [];
    const next = [...existing, entry].slice(-max);
    await offlineStore.saveCache(key, next);
  } catch { /* ignore */ }
}

function sectionOf(workspace: DashboardWorkspace, assetId: string): WorkspaceSection | undefined {
  return WORKSPACE_SECTIONS.find((section) =>
    workspace[section].some((item: DashboardWorkspaceAssetItem) => item.id === assetId),
  );
}

/**
 * Pure. Computes, for every currently-known-missing id, whether it appears in
 * a freshly fetched workspace and in which section — BEFORE the real
 * reconcileKnownMissingAssetIds() call runs. Ids that aren't already
 * known-missing are irrelevant to the guard and are not traced.
 */
export function buildReconcileTrace(
  knownMissingBeforeIds: string[],
  workspace: DashboardWorkspace,
): StaleAssetReconcilePreTraceEntry[] {
  return knownMissingBeforeIds.map((assetId) => {
    const workspaceSection = sectionOf(workspace, assetId);
    return { assetId, presentInWorkspace: workspaceSection !== undefined, workspaceSection };
  });
}

/**
 * Record one reconciliation pass. Call AFTER the real, unmodified
 * reconcileKnownMissingAssetIds() has already run for this pass — preTrace
 * must have been built beforehand from buildReconcileTrace().
 */
export async function recordReconcilePass(
  source: string,
  preTrace: StaleAssetReconcilePreTraceEntry[],
  isKnownMissingNow: (id: string) => boolean = isKnownMissingAssetId,
): Promise<void> {
  if (preTrace.length === 0) return;
  const ids: StaleAssetReconcileIdTrace[] = preTrace.map((entry) => {
    const knownMissingAfter = isKnownMissingNow(entry.assetId);
    return {
      assetId: entry.assetId,
      knownMissingBefore: true,
      presentInWorkspace: entry.presentInWorkspace,
      workspaceSection: entry.workspaceSection,
      knownMissingAfter,
      markerCleared: !knownMissingAfter,
    };
  });
  await appendCapped<StaleAssetReconcilePass>(
    RECONCILE_TRACE_CACHE_KEY,
    { timestamp: new Date().toISOString(), source, ids },
    MAX_RECONCILE_PASSES,
  );
}

/**
 * Record one GET /project-assets/{id}-equivalent fetch attempt. Only ever
 * called alongside the real fetch — never replaces it, never affects
 * timeout/retry/caching. Captures no request/response content.
 */
export async function recordFetchAttempt(
  assetId: string,
  knownMissingAtCallTime: boolean,
  source: string,
): Promise<void> {
  await appendCapped<StaleAssetFetchAttempt>(
    FETCH_TRACE_CACHE_KEY,
    { timestamp: new Date().toISOString(), assetId, knownMissingAtCallTime, source },
    MAX_FETCH_ENTRIES,
  );
}

export async function getStaleAssetReconcileTrace(): Promise<StaleAssetReconcilePass[]> {
  if (!isMobileNativePlatform()) return [];
  try {
    return (await offlineStore.getCache<StaleAssetReconcilePass[]>(RECONCILE_TRACE_CACHE_KEY)) ?? [];
  } catch {
    return [];
  }
}

export async function getStaleAssetFetchTrace(): Promise<StaleAssetFetchAttempt[]> {
  if (!isMobileNativePlatform()) return [];
  try {
    return (await offlineStore.getCache<StaleAssetFetchAttempt[]>(FETCH_TRACE_CACHE_KEY)) ?? [];
  } catch {
    return [];
  }
}
