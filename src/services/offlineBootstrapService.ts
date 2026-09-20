import { isMobileNativePlatform } from "../utils/platform";
import { isOfflineModeActive } from "./offlineModeState";
import { getNativeNetworkConnected, isServerConfirmedReachable } from "./connectivityMonitor";
import { secureGet } from "./secureStorage";
import { waitForActiveUploadDrain } from "./bootstrapUploadGate";
import { syncMetaGet, syncMetaSet, CACHE_SOFT_LIMIT_MS } from "./localDB";
import { projectService } from "./projectService";
import { projectAssetService } from "./projectAssetService";
import { assetWorkflowRunService } from "./assetWorkflowRunService";
import { assetDocumentLinkService } from "./assetDocumentLinkService";
import { workflowConfigService } from "./workflowConfigService";
import { workflowTypeService } from "./workflowTypeService";
import { workflowTemplateService } from "./workflowTemplateService";
import { productConfigService } from "./productConfigService";
import { productService } from "./productService";
import { featureService } from "./featureService";
import { userService } from "./userService";
import { brandSettingsService } from "./brandSettingsService";
import { configMediaCache } from "./configMediaCache";
import {
  documentService,
  prefetchAssetLinkedDocuments,
  prefetchLibraryDocuments,
  type AssetDocumentPrefetchLink,
} from "./documentService";
import { WorkflowAssignmentRepository } from "../repositories/WorkflowAssignmentRepository";
import { getBootstrapPrefetchLimits } from "../utils/syncPolicy";
import type { BootstrapReason } from "../utils/bootstrapFreshness";
import { waitForBackgroundWorkSlot } from "../utils/nativeReconnectCoordinator";
import { createRunGeneration } from "../utils/runGeneration";
import { runWithWatchdog } from "../utils/runWithWatchdog";
import offlineStore from "./offlineStore";
import type { ProjectAsset } from "../types/projectAsset";
import type { User } from "../types/user";
import type { WorkflowConfig } from "../types/workflowConfig";

/**
 * offlineBootstrapService — silent, background prefetch of everything needed
 * to work fully offline on the native phone app.
 *
 * Runs after login and whenever the device reconnects (full sync) or on
 * foreground when the last bootstrap is stale (~4h). Warms IndexedDB and
 * the filesystem via each domain service's own caching read path — including
 * assets/workflows the user never opened in the UI while online.
 *
 * Bounded by a hard watchdog (BOOTSTRAP_HARD_TIMEOUT_MS): a single native
 * network call inside a phase below can hang indefinitely on iOS without
 * honoring its own timeout (see the same caveat documented in
 * networkService.ts's health ping). Rather than trusting every call in this
 * file to time out correctly, the whole run is wrapped by runWithWatchdog,
 * which tracks a monotonically increasing runId (see runGeneration.ts) and
 * force-ends it — synchronously, without waiting for the hung call — once
 * BOOTSTRAP_HARD_TIMEOUT_MS elapses. Any result the abandoned run's promise
 * chain eventually produces after that is a "late result": it is detected
 * via the runId check and never applied to completion state or re-emitted,
 * so a stale run can never corrupt or race with a newer one.
 */

export type BootstrapScope = "assigned" | "all";

export type BootstrapMode = "full" | "light";

export interface BootstrapProgress {
  phase: string;
  done: number;
  total: number;
}

export interface BootstrapRunOptions {
  /** "all" (default) caches every project asset; "assigned" limits deep workflow prefetch. */
  scope?: BootstrapScope;
  /** User Sync Now — skip prefetch byte/file caps and cooldowns. */
  force?: boolean;
  /** light skips heavy document/media prefetch (routine reconnect). */
  mode?: BootstrapMode;
  /** Why this bootstrap was scheduled — forwarded to bootstrap:started for foreground session gating. */
  reason?: BootstrapReason;
}

export interface BootstrapSummary {
  completedAt: string;
  scope: BootstrapScope;
  projects: number;
  assets: number;
  deepAssets: number;
  products: number;
  configs: number;
  documentFilesPrefetched?: number;
  documentPrefetchSkipped?: number;
  libraryDocumentFilesPrefetched?: number;
  libraryDocumentPrefetchSkipped?: number;
}

export interface BootstrapStatus {
  lastCompletedAt: Date | null;
  isStale: boolean;
  isRunning: boolean;
  summary: BootstrapSummary | null;
  readyForOffline: boolean;
}

const BOOTSTRAP_META_KEY = "bootstrap";
const BOOTSTRAP_SUMMARY_CACHE_KEY = "bootstrap-summary";
const REFRESH_STALE_MS = CACHE_SOFT_LIMIT_MS; // 4h — re-run bootstrap on foreground if older

/**
 * Hard ceiling on a single bootstrap attempt. Long enough for a legitimate
 * first, fully-uncached pull on a large catalog; finite so the sync UI can
 * never hang forever regardless of what a single native network call does.
 * Tune from real-device telemetry (see logBootstrap) rather than guessing.
 */
export const BOOTSTRAP_HARD_TIMEOUT_MS = 180_000;

const generation = createRunGeneration();
let _lastCompletedAtMs: number | null = null;

function emit(name: string, detail?: unknown): void {
  logBootstrap(name, detail);
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch { /* ignore */ }
}

/**
 * Structured, PII-free client-side logging for bootstrap runs — runId,
 * timestamps, reason, scope, phase, duration, timeout/completion/error.
 * Never logs tokens, credentials, or any payload contents (only counts).
 */
function logBootstrap(event: string, fields?: unknown): void {
  if (!event.startsWith("bootstrap:") && !event.startsWith("bootstrap-")) return;
  // eslint-disable-next-line no-console
  console.info(`[offlineBootstrap] ${event}`, fields);
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("Bootstrap aborted (timed out)", "AbortError");
  }
}

/** Bootstrap may download hundreds of assets — require confirmed /health ping on native. */
function canRunBootstrap(): boolean {
  if (isOfflineModeActive()) return false;
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  if (isMobileNativePlatform()) {
    if (getNativeNetworkConnected() === false) return false;
    if (!isServerConfirmedReachable()) return false;
  }
  return true;
}

/** Run an async task over items with a bounded concurrency pool. */
async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  if (items.length === 0) return;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        await fn(items[index]);
      } catch { /* individual failures are non-fatal */ }
    }
  });
  await Promise.all(workers);
}

function currentUserId(): string | null {
  try {
    const raw = secureGet("auth_user");
    if (!raw) return null;
    const user = JSON.parse(raw) as User;
    return user?.id ?? null;
  } catch {
    return null;
  }
}

/** Deep-cache filter: assigned user + active field statuses. Exported for tests. */
export function assetsForDeepCache(allAssets: ProjectAsset[], scope: BootstrapScope, userId: string | null): ProjectAsset[] {
  if (scope === "all") return allAssets;
  return allAssets.filter((a) =>
    (userId && a.assignedUserId === userId) ||
    a.status === "InProgress" ||
    a.status === "Paused" ||
    a.status === "Pending"
  );
}

async function saveBootstrapSummary(summary: BootstrapSummary): Promise<void> {
  await offlineStore.saveCache(BOOTSTRAP_SUMMARY_CACHE_KEY, summary);
}

interface RunPhasesParams {
  runId: number;
  scope: BootstrapScope;
  force: boolean;
  mode: BootstrapMode;
  signal: AbortSignal;
}

/**
 * The actual 9-phase download pass. Pure data-fetching — no generation/
 * timeout bookkeeping here, that all lives in run() below via
 * runWithWatchdog. Only checks `signal` between phase boundaries to stop
 * *starting* new network work once the run has been abandoned; it cannot
 * interrupt a request already in flight (see the module doc comment and
 * the CANCELLATION note in run() below).
 */
async function runBootstrapPhases(params: RunPhasesParams): Promise<BootstrapSummary> {
  const { runId, scope, force, mode, signal } = params;
  const light = mode === "light" && !force;
  const prefetchLimits = getBootstrapPrefetchLimits(force);
  const userId = currentUserId();

  // ── Phase 1: shared reference data ────────────────────────────────────
  emit("bootstrap:progress", { runId, phase: "reference", done: 0, total: 1 } satisfies BootstrapProgress & { runId: number });
  await Promise.allSettled([
    workflowTypeService.list(),
    userService.getUsers(),
    productService.getProducts(),
    brandSettingsService.get(),
    featureService.getAll(),
    workflowConfigService.getAll("Published").catch(() => []),
  ]);
  emit("bootstrap:progress", { runId, phase: "reference", done: 1, total: 1 } satisfies BootstrapProgress & { runId: number });
  throwIfAborted(signal);

  // ── Phase 1b: Documents library + Tips & Tricks file blobs ─────────────
  emit("bootstrap:progress", { runId, phase: "library-documents", done: 0, total: 1 } satisfies BootstrapProgress & { runId: number });
  const libraryDocs = await documentService.refreshDocumentsCache({ prefetchFiles: false }).catch(() => []);
  let libraryPrefetch = { prefetched: 0, skipped: 0 };
  if (!light) {
    libraryPrefetch = await prefetchLibraryDocuments(libraryDocs, {
      maxTotalBytes: prefetchLimits.libraryMaxTotalBytes,
      maxFiles: prefetchLimits.libraryMaxFiles,
      onProgress: (done, total) => {
        emit("bootstrap:progress", { runId, phase: "library-documents", done, total } satisfies BootstrapProgress & { runId: number });
      },
    });
  }
  emit("bootstrap:progress", { runId, phase: "library-documents", done: 1, total: 1 } satisfies BootstrapProgress & { runId: number });
  throwIfAborted(signal);

  // ── Phase 2: projects ─────────────────────────────────────────────────
  emit("bootstrap:progress", { runId, phase: "projects", done: 0, total: 1 } satisfies BootstrapProgress & { runId: number });
  const projectsResp = await projectService.getProjects();
  const projects = projectsResp.items ?? [];
  emit("bootstrap:progress", { runId, phase: "projects", done: 1, total: 1 } satisfies BootstrapProgress & { runId: number });
  throwIfAborted(signal);

  // ── Phase 3: assets per project (full list cache) ─────────────────────
  const allAssets: ProjectAsset[] = [];
  let projDone = 0;
  await runPool(projects, 4, async (project) => {
    const assets = await projectAssetService.listByProject(project.id).catch(() => []);
    allAssets.push(...assets);
    projDone++;
    emit("bootstrap:progress", { runId, phase: "assets", done: projDone, total: projects.length } satisfies BootstrapProgress & { runId: number });
  });
  throwIfAborted(signal);

  const deepAssets = assetsForDeepCache(allAssets, scope, userId);
  const productIds = [...new Set(allAssets.map((a) => a.productId).filter(Boolean))];

  // ── Phase 4: product-level templates, configs, features ───────────────
  const configsByProduct = new Map<string, WorkflowConfig[]>();
  let prodDone = 0;
  await runPool(productIds, 4, async (productId) => {
    await Promise.allSettled([
      productConfigService.listByProduct(productId),
      featureService.getByProduct(productId),
    ]);
    const configs = await workflowConfigService.listByProduct(productId).catch(() => [] as WorkflowConfig[]);
    configsByProduct.set(productId, configs);
    prodDone++;
    emit("bootstrap:progress", { runId, phase: "configs", done: prodDone, total: productIds.length } satisfies BootstrapProgress & { runId: number });
  });
  throwIfAborted(signal);

  // ── Phase 5: workflow configs linked directly on assets + legacy templates
  const linkedConfigIds = [...new Set(allAssets.map((a) => a.productConfigId).filter(Boolean) as string[])];
  let cfgDone = 0;
  await runPool(linkedConfigIds, 6, async (configId) => {
    await workflowConfigService.getById(configId).catch(() => null);
    cfgDone++;
    emit("bootstrap:progress", { runId, phase: "linked-configs", done: cfgDone, total: linkedConfigIds.length } satisfies BootstrapProgress & { runId: number });
  });

  const templateIds = [...new Set(allAssets.map((a) => a.workflowTemplateId).filter(Boolean) as string[])];
  await runPool(templateIds, 4, async (templateId) => {
    await workflowTemplateService.getById(templateId).catch(() => null);
  });
  throwIfAborted(signal);

  // ── Phase 6: per-asset assignments + full run history (network refresh) ─
  let assetDone = 0;
  const assetPrefetchConcurrency = light ? 2 : 4;
  await runPool(deepAssets, assetPrefetchConcurrency, async (asset) => {
    if (!(await waitForBackgroundWorkSlot())) return;
    await Promise.allSettled([
      WorkflowAssignmentRepository.prefetchFromNetwork(asset.id),
      assetWorkflowRunService.prefetchFromNetwork(asset.id),
    ]);
    assetDone++;
    emit("bootstrap:progress", { runId, phase: "workflows", done: assetDone, total: deepAssets.length } satisfies BootstrapProgress & { runId: number });
  });
  throwIfAborted(signal);

  // ── Phase 7: open + closed issues (issues board + attention widgets) ───
  emit("bootstrap:progress", { runId, phase: "issues", done: 0, total: 2 } satisfies BootstrapProgress & { runId: number });
  await Promise.allSettled([
    assetWorkflowRunService.listOpenIssues(),
    assetWorkflowRunService.listClosedIssues(),
  ]);
  await syncMetaSet("issues").catch(() => {});
  emit("bootstrap:progress", { runId, phase: "issues", done: 2, total: 2 } satisfies BootstrapProgress & { runId: number });
  throwIfAborted(signal);

  // ── Phase 8: asset document link metadata + bounded file prefetch ───────
  const docLinks: AssetDocumentPrefetchLink[] = [];
  let docMetaDone = 0;
  await runPool(deepAssets, 4, async (asset) => {
    const links = await assetDocumentLinkService.listByAsset(asset.id).catch(() => []);
    for (const link of links) {
      docLinks.push({ document: link.document });
    }
    docMetaDone++;
    emit("bootstrap:progress", { runId, phase: "asset-documents", done: docMetaDone, total: deepAssets.length } satisfies BootstrapProgress & { runId: number });
  });

  emit("bootstrap:progress", { runId, phase: "document-files", done: 0, total: Math.max(docLinks.length, 1) } satisfies BootstrapProgress & { runId: number });
  let docPrefetch = { prefetched: 0, skipped: docLinks.length };
  if (!light && docLinks.length > 0) {
    docPrefetch = await prefetchAssetLinkedDocuments(docLinks, {
      maxTotalBytes: prefetchLimits.maxTotalBytes,
      maxFiles: prefetchLimits.maxFiles,
      onProgress: (done, total) => {
        emit("bootstrap:progress", { runId, phase: "document-files", done, total } satisfies BootstrapProgress & { runId: number });
      },
    });
  }
  emit("bootstrap:progress", {
    runId,
    phase: "document-files",
    done: docPrefetch.prefetched + docPrefetch.skipped,
    total: Math.max(docLinks.length, 1),
  } satisfies BootstrapProgress & { runId: number });
  throwIfAborted(signal);

  // ── Phase 9: workflow-config reference media ──────────────────────────
  const relevantConfigs: WorkflowConfig[] = [];
  const seenConfig = new Set<string>();
  for (const productId of productIds) {
    for (const cfg of configsByProduct.get(productId) ?? []) {
      if (cfg.status === "Published" && !seenConfig.has(cfg.id)) {
        seenConfig.add(cfg.id);
        relevantConfigs.push(cfg);
      }
    }
  }
  for (const configId of linkedConfigIds) {
    if (seenConfig.has(configId)) continue;
    const cfg = await workflowConfigService.getById(configId).catch(() => null);
    if (cfg?.status === "Published") {
      seenConfig.add(configId);
      relevantConfigs.push(cfg);
    }
  }

  let mediaDone = 0;
  if (!light) {
    await runPool(relevantConfigs, 3, async (cfg) => {
      await configMediaCache.prefetchConfig(cfg).catch(() => {});
      mediaDone++;
      emit("bootstrap:progress", { runId, phase: "media", done: mediaDone, total: relevantConfigs.length } satisfies BootstrapProgress & { runId: number });
    });
  }

  return {
    completedAt: new Date().toISOString(),
    scope,
    projects: projects.length,
    assets: allAssets.length,
    deepAssets: deepAssets.length,
    products: productIds.length,
    configs: relevantConfigs.length,
    documentFilesPrefetched: docPrefetch.prefetched,
    documentPrefetchSkipped: docPrefetch.skipped,
    libraryDocumentFilesPrefetched: libraryPrefetch.prefetched,
    libraryDocumentPrefetchSkipped: libraryPrefetch.skipped,
  };
}

export const offlineBootstrapService = {
  /** Whether a bootstrap pass is currently executing. */
  isRunning(): boolean {
    return generation.isRunning();
  },

  /** In-memory completion time of the last successful pass this session, or null. */
  getLastCompletedAtMs(): number | null {
    return _lastCompletedAtMs;
  },

  /** True when the last completed bootstrap is older than the refresh window. */
  async isStale(): Promise<boolean> {
    const last = await syncMetaGet(BOOTSTRAP_META_KEY);
    if (!last) return true;
    return Date.now() - new Date(last).getTime() > REFRESH_STALE_MS;
  },

  async getStatus(): Promise<BootstrapStatus> {
    const [lastRaw, summary, isStale] = await Promise.all([
      syncMetaGet(BOOTSTRAP_META_KEY),
      offlineStore.getCache<BootstrapSummary>(BOOTSTRAP_SUMMARY_CACHE_KEY),
      this.isStale(),
    ]);
    const lastCompletedAt = lastRaw ? new Date(lastRaw) : null;
    return {
      lastCompletedAt,
      isStale,
      isRunning: generation.isRunning(),
      summary,
      readyForOffline: !!lastCompletedAt && !isStale && !generation.isRunning(),
    };
  },

  /** User-triggered retry (e.g. missing config on first open, or after a timeout). */
  async retry(options?: BootstrapRunOptions): Promise<void> {
    return this.run(options ?? { scope: "assigned" });
  },

  /**
   * Full download pass — call when the device comes back online so every asset,
   * assignment, run, and workflow config is on the phone even if never visited.
   */
  async runOnReconnect(): Promise<void> {
    return this.runAfterUploadDrain({ scope: "all" });
  },

  /**
   * Waits for the outbound upload queue to drain, then runs bootstrap.
   * Use on reconnect / Sync Now so POSTs are not competing with prefetch GETs.
   */
  async runAfterUploadDrain(options?: BootstrapRunOptions): Promise<void> {
    if (!isMobileNativePlatform()) return;
    if (generation.isRunning()) return;
    if (!canRunBootstrap()) return;
    await waitForActiveUploadDrain();
    if (generation.isRunning()) return;
    return this.run(options);
  },

  /**
   * Prefetch offline data. Fire-and-forget — never blocks the UI.
   * Default scope is "all" so the entire accessible project catalog is cached.
   *
   * Bounded by BOOTSTRAP_HARD_TIMEOUT_MS via runWithWatchdog: if the phases
   * below don't settle within that window (a hung native network call, most
   * likely on the very first, fully-uncached pass), the run is force-ended
   * immediately — isRunning()/readyForOffline reflect that right away,
   * independent of whether the underlying phases ever actually finish.
   *
   * CANCELLATION: an AbortController is created per run and aborted on
   * timeout, and passed through to runBootstrapPhases, which checks it
   * between phase boundaries to stop starting new network work once
   * abandoned. It is NOT threaded into the individual domain-service calls
   * within each phase (projectService, projectAssetService, etc.) — none of
   * those currently accept an AbortSignal, and retrofitting every one of
   * them is out of scope here. This means a request already in flight when
   * the timeout fires is not guaranteed to actually stop; correctness does
   * not depend on it stopping. It depends entirely on the runId/generation
   * check in runWithWatchdog, which is why a late result from an abandoned
   * run can never update completion state or emit bootstrap:complete.
   */
  async run(options?: BootstrapRunOptions): Promise<void> {
    if (!isMobileNativePlatform()) return;
    if (generation.isRunning()) return;
    if (!canRunBootstrap()) return;

    const scope = options?.scope ?? "all";
    const force = options?.force ?? false;
    const mode = options?.mode ?? (force ? "full" : "full");
    const reason = options?.reason;

    const runId = runWithWatchdog(
      generation,
      (signal, activeRunId) => runBootstrapPhases({ runId: activeRunId, scope, force, mode, signal }),
      BOOTSTRAP_HARD_TIMEOUT_MS,
      (settledRunId, outcome, durationMs) => {
        if (outcome.kind === "timeout") {
          logBootstrap("bootstrap:timeout", { runId: settledRunId, reason, scope, durationMs, timeoutMs: BOOTSTRAP_HARD_TIMEOUT_MS });
          emit("bootstrap:error", { runId: settledRunId, message: "Bootstrap timed out", timedOut: true });
          return;
        }
        if (outcome.kind === "error") {
          emit("bootstrap:error", { runId: settledRunId, message: (outcome.error as Error)?.message });
          return;
        }
        void (async () => {
          const summary = outcome.value;
          await saveBootstrapSummary(summary);
          await syncMetaSet(BOOTSTRAP_META_KEY);
          _lastCompletedAtMs = Date.now();
          emit("bootstrap:complete", { runId: settledRunId, durationMs, ...summary });
        })().catch((persistErr: unknown) => {
          // The phases themselves already succeeded; only the local
          // completion-metadata write failed (e.g. IndexedDB error). Surface
          // it as a bootstrap error rather than an unhandled rejection —
          // the next scheduled attempt will simply try again.
          emit("bootstrap:error", { runId: settledRunId, message: (persistErr as Error)?.message ?? "Failed to persist bootstrap completion" });
        });
      },
      (lateRunId, outcome, durationMs) => {
        logBootstrap("bootstrap:late-result-ignored", { runId: lateRunId, reason, scope, outcome: outcome.kind, durationMs });
      },
    );

    emit("bootstrap:started", { runId, scope, reason });
  },
};

export default offlineBootstrapService;
