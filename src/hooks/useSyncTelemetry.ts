/**
 * useSyncTelemetry — read-only aggregation of the app's existing sync signals
 * into a per-domain view for the on-screen Sync Telemetry panel.
 *
 * It invents no new tracking: every number comes from a single source of truth
 * that already exists —
 *   • upload backlog  → pendingGetAll() + droppedActionsGetAll() (exact counts)
 *   • download (live) → offlineBootstrapService's bootstrap:progress events
 *   • download (rest) → entityGetAll*() counts + syncMetaGet() freshness
 *   • connectivity    → useSyncEngine (signal / server reachable / syncing)
 *
 * It is event-driven (no polling except a 30s freshness re-tick) and never
 * triggers a network call, queue, or write.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSyncEngine } from "./useSyncEngine";
import {
  pendingGetAll,
  droppedActionsGetAll,
  entityGetAllProjects,
  entityGetAllAssets,
  entityGetAllIssues,
  syncMetaGet,
  type PendingAction,
  type DroppedAction,
} from "../services/localDB";

export type DomainKey = "projects" | "assets" | "issues" | "more";

export interface DomainTelemetry {
  key: DomainKey;
  label: string;
  // ── download (server → phone) ──
  cachedCount: number;
  lastSyncAt: Date | null;
  /** Live hydration percent (0–100) while the bootstrap is working this domain; null at rest. */
  downloadPct: number | null;
  downloadState: "syncing" | "fresh" | "stale" | "none";
  // ── upload (phone → server) ──
  pending: number;
  failed: number;
  uploadState: "sending" | "failed" | "pending" | "synced";
}

export interface SyncTelemetry {
  connectivity: string;
  serverReachable: boolean | null;
  syncing: boolean;
  lastSyncAt: Date | null;
  bootstrapRunning: boolean;
  totalPending: number;
  totalFailed: number;
  conflictCount: number;
  /** Overall upload drain percent while a flush is in progress (0–100); null at rest. */
  uploadDrainPct: number | null;
  domains: DomainTelemetry[];
}

const FRESH_MS = 4 * 60 * 60 * 1000; // 4h — matches the bootstrap refresh window

// entityType (from the pending queue) → which card it counts toward.
function domainForEntityType(entityType?: string): DomainKey {
  switch (entityType) {
    case "project": return "projects";
    case "asset": return "assets";
    case "issue": return "issues";
    default: return "more"; // workflow-run, work-instruction, document, bomImportRun, installation, …
  }
}

// bootstrap phase (from bootstrap:progress) → which card shows the live %.
function domainForPhase(phase?: string): DomainKey | null {
  switch (phase) {
    case "projects": return "projects";
    case "assets": return "assets";
    case "configs":
    case "workflows":
    case "media":
    case "reference": return "more";
    default: return null;
  }
}

function patchTouchesIssues(action: PendingAction): boolean {
  const keys = [
    ...Object.keys(action.optimisticPatch ?? {}),
    ...(action.body && typeof action.body === "object" ? Object.keys(action.body as object) : []),
  ];
  return keys.includes("issuesJson");
}

interface RawCounts {
  cached: Record<DomainKey, number>;
  lastSync: Record<DomainKey, Date | null>;
  pending: Record<DomainKey, number>;
  failed: Record<DomainKey, number>;
}

const EMPTY_COUNTS: RawCounts = {
  cached: { projects: 0, assets: 0, issues: 0, more: 0 },
  lastSync: { projects: null, assets: null, issues: null, more: null },
  pending: { projects: 0, assets: 0, issues: 0, more: 0 },
  failed: { projects: 0, assets: 0, issues: 0, more: 0 },
};

async function loadRawCounts(): Promise<RawCounts> {
  const [pendingRaw, droppedRaw, projects, assets, issues, mProjects, mAssets, mIssues, mMore] =
    await Promise.all([
      pendingGetAll(),
      droppedActionsGetAll(),
      entityGetAllProjects(),
      entityGetAllAssets(),
      entityGetAllIssues(),
      syncMetaGet("projects"),
      syncMetaGet("assets"),
      syncMetaGet("issues"),
      // "more" freshness: use the reference-data sync marker as a proxy.
      syncMetaGet("features"),
    ]);

  const counts: RawCounts = {
    cached: { projects: projects.length, assets: assets.length, issues: issues.length, more: 0 },
    lastSync: {
      projects: mProjects ? new Date(mProjects) : null,
      assets: mAssets ? new Date(mAssets) : null,
      issues: mIssues ? new Date(mIssues) : null,
      more: mMore ? new Date(mMore) : null,
    },
    pending: { projects: 0, assets: 0, issues: 0, more: 0 },
    failed: { projects: 0, assets: 0, issues: 0, more: 0 },
  };

  const bump = (bucket: "pending" | "failed", action: PendingAction | DroppedAction) => {
    const d = domainForEntityType(action.entityType);
    counts[bucket][d] += 1;
    // A queued asset/run change that edits issuesJson also counts as an issues change.
    if ("optimisticPatch" in action && patchTouchesIssues(action as PendingAction)) {
      counts[bucket].issues += 1;
    }
  };

  for (const a of pendingRaw) bump(a.status === "failed" ? "failed" : "pending", a);
  for (const d of droppedRaw) bump("failed", d);

  return counts;
}

export function useSyncTelemetry(): SyncTelemetry {
  const { connectivity, serverReachable, pendingCount, conflictCount, syncing, lastSyncAt } = useSyncEngine();
  const [counts, setCounts] = useState<RawCounts>(EMPTY_COUNTS);
  const [boot, setBoot] = useState<{ running: boolean; phase?: string; done: number; total: number }>({
    running: false, done: 0, total: 0,
  });
  const peakPendingRef = useRef(0);
  const [, tick] = useState(0);

  // Recompute the raw counts whenever anything that could change them fires.
  useEffect(() => {
    let alive = true;
    const reload = () => { void loadRawCounts().then((c) => { if (alive) setCounts(c); }); };
    reload();
    const events = [
      "sync-pending-changed", "sync-conflict-detected",
      "repo:assets:updated", "repo:projects:updated", "repo:issues:updated",
      "bootstrap:complete",
    ];
    events.forEach((e) => window.addEventListener(e, reload));
    return () => { alive = false; events.forEach((e) => window.removeEventListener(e, reload)); };
  }, []);

  // Track live bootstrap (download) progress.
  useEffect(() => {
    const onStart = () => setBoot({ running: true, done: 0, total: 0 });
    const onProgress = (e: Event) => {
      const d = (e as CustomEvent).detail as { phase?: string; done?: number; total?: number };
      setBoot({ running: true, phase: d?.phase, done: d?.done ?? 0, total: d?.total ?? 0 });
    };
    const onEnd = () => setBoot({ running: false, done: 0, total: 0 });
    window.addEventListener("bootstrap:started", onStart);
    window.addEventListener("bootstrap:progress", onProgress);
    window.addEventListener("bootstrap:complete", onEnd);
    window.addEventListener("bootstrap:error", onEnd);
    return () => {
      window.removeEventListener("bootstrap:started", onStart);
      window.removeEventListener("bootstrap:progress", onProgress);
      window.removeEventListener("bootstrap:complete", onEnd);
      window.removeEventListener("bootstrap:error", onEnd);
    };
  }, []);

  // Re-tick every 30s so "fresh/stale" ages stay current with no other activity.
  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Overall upload drain %: remember the peak backlog since it was last empty.
  if (pendingCount > peakPendingRef.current) peakPendingRef.current = pendingCount;
  if (pendingCount === 0) peakPendingRef.current = 0;
  const uploadDrainPct = peakPendingRef.current > 0
    ? Math.round(((peakPendingRef.current - pendingCount) / peakPendingRef.current) * 100)
    : null;

  return useMemo<SyncTelemetry>(() => {
    const now = Date.now();
    const liveDomain = boot.running ? domainForPhase(boot.phase) : null;
    const livePct = boot.total > 0 ? Math.round((boot.done / boot.total) * 100) : null;

    const mk = (key: DomainKey, label: string): DomainTelemetry => {
      const lastSync = counts.lastSync[key];
      const pending = counts.pending[key];
      const failed = counts.failed[key];
      const isLive = liveDomain === key && livePct !== null;
      const fresh = lastSync ? now - lastSync.getTime() < FRESH_MS : false;
      return {
        key, label,
        cachedCount: counts.cached[key],
        lastSyncAt: lastSync,
        downloadPct: isLive ? livePct : null,
        downloadState: isLive ? "syncing" : !lastSync ? "none" : fresh ? "fresh" : "stale",
        pending, failed,
        uploadState: failed > 0 ? "failed" : (syncing && pending > 0) ? "sending" : pending > 0 ? "pending" : "synced",
      };
    };

    const totalFailed = counts.failed.projects + counts.failed.assets + counts.failed.issues + counts.failed.more;

    return {
      connectivity, serverReachable, syncing, lastSyncAt,
      bootstrapRunning: boot.running,
      totalPending: pendingCount,
      totalFailed,
      conflictCount,
      uploadDrainPct,
      domains: [
        mk("projects", "Projects"),
        mk("assets", "Assets"),
        mk("issues", "Issues"),
        mk("more", "More"),
      ],
    };
  }, [counts, boot, connectivity, serverReachable, syncing, lastSyncAt, pendingCount, conflictCount, uploadDrainPct]);
}
