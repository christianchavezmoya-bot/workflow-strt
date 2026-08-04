import type {
  DashboardWorkspace,
  DashboardWorkspaceAssetItem,
} from "../services/projectAssetService";

export function dashboardWorkspaceHasRows(data: DashboardWorkspace): boolean {
  return data.currentInstalls.length > 0
    || data.currentInspections.length > 0
    || data.installHistory.length > 0
    || data.inspectionHistory.length > 0;
}

function dashboardWorkspaceItemHasCardSignals(item: DashboardWorkspaceAssetItem): boolean {
  return item.totalSteps > 0
    || item.completedSteps > 0
    || item.missingItems > 0
    || (item.evidenceStatus ?? "").toLowerCase() === "missingdata"
    || Boolean(item.signatureStatus)
    || item.hasOpenIssues;
}

export function mergeDashboardWorkspaceItems(
  previousItems: DashboardWorkspaceAssetItem[],
  nextItems: DashboardWorkspaceAssetItem[],
): DashboardWorkspaceAssetItem[] {
  // Never regress a populated list to empty on a transient/race fetch.
  if (nextItems.length === 0 && previousItems.length > 0) return previousItems;
  if (previousItems.length === 0 || nextItems.length === 0) return nextItems;

  const previousById = new Map(previousItems.map((item) => [item.id, item]));
  return nextItems.map((item) => {
    const previous = previousById.get(item.id);
    if (!previous) return item;
    if (!dashboardWorkspaceItemHasCardSignals(previous) || dashboardWorkspaceItemHasCardSignals(item)) return item;
    return {
      ...item,
      completedSteps: previous.completedSteps,
      totalSteps: previous.totalSteps,
      missingItems: previous.missingItems,
      evidenceStatus: previous.evidenceStatus,
      signatureStatus: previous.signatureStatus,
      hasOpenIssues: previous.hasOpenIssues,
    };
  });
}

export function stabilizeDashboardWorkspace(
  previous: DashboardWorkspace,
  next: DashboardWorkspace,
): DashboardWorkspace {
  return {
    currentInstalls: mergeDashboardWorkspaceItems(previous.currentInstalls, next.currentInstalls),
    currentInspections: mergeDashboardWorkspaceItems(previous.currentInspections, next.currentInspections),
    installHistory: mergeDashboardWorkspaceItems(previous.installHistory, next.installHistory),
    inspectionHistory: mergeDashboardWorkspaceItems(previous.inspectionHistory, next.inspectionHistory),
  };
}

/**
 * Stabilize card signals from the previous snapshot, then dedupe across buckets.
 * Incoming `data` is the tie-breaker for bucket placement when an asset id appears
 * in more than one array. Dedupe is skipped when the incoming workspace is empty so
 * the "never regress to blank on failed fetch" guard in stabilize remains effective.
 */
export function mergeDashboardWorkspace(
  previous: DashboardWorkspace,
  incoming: DashboardWorkspace,
  options?: { stabilize?: boolean },
): DashboardWorkspace {
  const shouldStabilize = options?.stabilize ?? true;
  const merged = shouldStabilize
    ? stabilizeDashboardWorkspace(previous, incoming)
    : incoming;
  if (!dashboardWorkspaceHasRows(incoming)) {
    return merged;
  }
  return dedupeDashboardWorkspace(merged, incoming);
}

/** Collapse duplicate asset ids from a flattened workspace list before local rebucketing. */
export function dedupeDashboardWorkspaceItemsById(
  items: DashboardWorkspaceAssetItem[],
): DashboardWorkspaceAssetItem[] {
  const byId = new Map<string, DashboardWorkspaceAssetItem>();
  for (const item of items) {
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      continue;
    }
    byId.set(item.id, mergeWorkspaceItemCardSignals(
      { ...existing, ...item },
      dashboardWorkspaceItemHasCardSignals(existing) ? existing : item,
    ));
  }
  return [...byId.values()];
}

export function dashboardWorkspaceLayoutEqual(a: DashboardWorkspace, b: DashboardWorkspace): boolean {
  const ids = (rows: DashboardWorkspaceAssetItem[]) => rows.map((row) => row.id).sort().join(",");
  return ids(a.currentInstalls) === ids(b.currentInstalls)
    && ids(a.currentInspections) === ids(b.currentInspections)
    && ids(a.installHistory) === ids(b.installHistory)
    && ids(a.inspectionHistory) === ids(b.inspectionHistory);
}

const WORKSPACE_BUCKETS = [
  "currentInstalls",
  "currentInspections",
  "installHistory",
  "inspectionHistory",
] as const;

type WorkspaceBucket = typeof WORKSPACE_BUCKETS[number];

function findBucketForAssetId(
  id: string,
  workspace: DashboardWorkspace,
): WorkspaceBucket | null {
  for (const bucket of WORKSPACE_BUCKETS) {
    if (workspace[bucket].some((item) => item.id === id)) return bucket;
  }
  return null;
}

function pickWorkspaceItem(
  id: string,
  workspace: DashboardWorkspace,
  preferredBucket?: WorkspaceBucket | null,
): DashboardWorkspaceAssetItem | undefined {
  if (preferredBucket) {
    const preferred = workspace[preferredBucket].find((item) => item.id === id);
    if (preferred) return preferred;
  }
  for (const bucket of WORKSPACE_BUCKETS) {
    const match = workspace[bucket].find((item) => item.id === id);
    if (match) return match;
  }
  return undefined;
}

function mergeWorkspaceItemCardSignals(
  primary: DashboardWorkspaceAssetItem,
  fallback?: DashboardWorkspaceAssetItem,
): DashboardWorkspaceAssetItem {
  if (!fallback) return primary;
  if (!dashboardWorkspaceItemHasCardSignals(fallback) || dashboardWorkspaceItemHasCardSignals(primary)) {
    return primary;
  }
  return {
    ...primary,
    completedSteps: fallback.completedSteps,
    totalSteps: fallback.totalSteps,
    missingItems: fallback.missingItems,
    evidenceStatus: fallback.evidenceStatus,
    signatureStatus: fallback.signatureStatus,
    hasOpenIssues: fallback.hasOpenIssues,
  };
}

function pickRichestWorkspaceItem(
  id: string,
  workspace: DashboardWorkspace,
): DashboardWorkspaceAssetItem | undefined {
  let best: DashboardWorkspaceAssetItem | undefined;
  for (const bucket of WORKSPACE_BUCKETS) {
    const match = workspace[bucket].find((item) => item.id === id);
    if (!match) continue;
    if (!best || (dashboardWorkspaceItemHasCardSignals(match) && !dashboardWorkspaceItemHasCardSignals(best))) {
      best = match;
    }
  }
  return best;
}

/**
 * Ensures each asset id appears in at most one workspace bucket.
 * When `authoritative` is provided (typically the incoming server fetch), its bucket
 * placement wins over stale copies left in the previous snapshot.
 */
export function dedupeDashboardWorkspace(
  workspace: DashboardWorkspace,
  authoritative?: DashboardWorkspace,
): DashboardWorkspace {
  const ids = new Set<string>();
  for (const bucket of WORKSPACE_BUCKETS) {
    for (const item of workspace[bucket]) ids.add(item.id);
  }
  if (authoritative) {
    for (const bucket of WORKSPACE_BUCKETS) {
      for (const item of authoritative[bucket]) ids.add(item.id);
    }
  }

  const empty = (): DashboardWorkspace => ({
    currentInstalls: [],
    currentInspections: [],
    installHistory: [],
    inspectionHistory: [],
  });
  const result = empty();

  for (const id of ids) {
    const authoritativeBucket = authoritative ? findBucketForAssetId(id, authoritative) : null;
    let targetBucket = authoritativeBucket;
    if (!targetBucket) {
      const presentBuckets = WORKSPACE_BUCKETS.filter((bucket) =>
        workspace[bucket].some((item) => item.id === id),
      );
      if (presentBuckets.length === 1) {
        targetBucket = presentBuckets[0];
      } else if (presentBuckets.length > 1) {
        targetBucket = presentBuckets.find((bucket) => bucket === "installHistory" || bucket === "inspectionHistory")
          ?? presentBuckets[0];
      }
    }
    if (!targetBucket) continue;

    const signalSource = pickRichestWorkspaceItem(id, workspace);
    const authoritativeRow = authoritative
      ? pickWorkspaceItem(id, authoritative, authoritativeBucket)
      : undefined;
    const row = mergeWorkspaceItemCardSignals(authoritativeRow ?? signalSource!, signalSource);
    if (row) result[targetBucket].push(row);
  }

  return result;
}
