import { isMobileNativePlatform } from "../utils/platform";
import { secureGet } from "./secureStorage";
import { syncMetaGet, syncMetaSet, CACHE_SOFT_LIMIT_MS } from "./localDB";
import { projectService } from "./projectService";
import { projectAssetService } from "./projectAssetService";
import { assetWorkflowAssignmentService } from "./assetWorkflowAssignmentService";
import { assetWorkflowRunService } from "./assetWorkflowRunService";
import { workflowConfigService } from "./workflowConfigService";
import { workflowTypeService } from "./workflowTypeService";
import { featureService } from "./featureService";
import { userService } from "./userService";
import { brandSettingsService } from "./brandSettingsService";
import { configMediaCache } from "./configMediaCache";
import type { ProjectAsset } from "../types/projectAsset";
import type { User } from "../types/user";
import type { WorkflowConfig } from "../types/workflowConfig";

/**
 * offlineBootstrapService — silent, background prefetch of everything a
 * technician needs to work fully offline. Runs after a successful online login
 * (and on foreground when the last bootstrap is stale). It reuses each domain
 * service's own offline-caching read path, so simply calling them in the right
 * order warms IndexedDB / the filesystem. Nothing here blocks the UI.
 */

export type BootstrapScope = "assigned" | "all";

export interface BootstrapProgress {
  phase: string;
  done: number;
  total: number;
}

const BOOTSTRAP_META_KEY = "bootstrap";
const REFRESH_STALE_MS = CACHE_SOFT_LIMIT_MS; // 4h — re-run bootstrap on foreground if older

let _running = false;

function emit(name: string, detail?: unknown): void {
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch { /* ignore */ }
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

export const offlineBootstrapService = {
  /** Whether a bootstrap pass is currently executing. */
  isRunning(): boolean {
    return _running;
  },

  /** True when the last completed bootstrap is older than the refresh window. */
  async isStale(): Promise<boolean> {
    const last = await syncMetaGet(BOOTSTRAP_META_KEY);
    if (!last) return true;
    return Date.now() - new Date(last).getTime() > REFRESH_STALE_MS;
  },

  /**
   * Prefetch all data assigned/relevant to the logged-in user. Fire-and-forget:
   * callers should not await the field-work-critical path on this. Always runs
   * when called directly (the stale-gate lives in useOfflineBootstrap).
   */
  async run(options?: { scope?: BootstrapScope }): Promise<void> {
    // Offline caching only applies to the native app; the web build is online-first.
    if (!isMobileNativePlatform()) return;
    if (_running) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    const scope = options?.scope ?? "assigned";
    const userId = currentUserId();

    _running = true;
    emit("bootstrap:started", { scope });

    try {
      // ── Phase 1: shared reference data (small, parallel) ──────────────────
      emit("bootstrap:progress", { phase: "reference", done: 0, total: 1 } satisfies BootstrapProgress);
      await Promise.allSettled([
        workflowTypeService.list(),
        userService.getUsers(),
        brandSettingsService.get(),
        featureService.getAll(),
      ]);

      // ── Phase 2: projects ─────────────────────────────────────────────────
      emit("bootstrap:progress", { phase: "projects", done: 0, total: 1 } satisfies BootstrapProgress);
      const projectsResp = await projectService.getProjects();
      const projects = projectsResp.items ?? [];

      // ── Phase 3: assets per project (warms the assets list cache) ─────────
      const allAssets: ProjectAsset[] = [];
      let projDone = 0;
      await runPool(projects, 4, async (project) => {
        const assets = await projectAssetService.listByProject(project.id).catch(() => []);
        allAssets.push(...assets);
        projDone++;
        emit("bootstrap:progress", { phase: "assets", done: projDone, total: projects.length } satisfies BootstrapProgress);
      });

      // ── Phase 4: determine deep-cache scope ───────────────────────────────
      const deepAssets = scope === "all"
        ? allAssets
        : allAssets.filter((a) =>
            (userId && a.assignedUserId === userId) ||
            a.status === "InProgress" ||
            a.status === "Paused" ||
            a.status === "Pending"
          );

      // ── Phase 5: product-level config + feature caches ────────────────────
      const productIds = [...new Set(deepAssets.map((a) => a.productId).filter(Boolean))];
      const configsByProduct = new Map<string, WorkflowConfig[]>();
      let prodDone = 0;
      await runPool(productIds, 4, async (productId) => {
        const [configs] = await Promise.all([
          workflowConfigService.listByProduct(productId).catch(() => [] as WorkflowConfig[]),
          featureService.getByProduct(productId).catch(() => []),
        ]);
        configsByProduct.set(productId, configs);
        prodDone++;
        emit("bootstrap:progress", { phase: "configs", done: prodDone, total: productIds.length } satisfies BootstrapProgress);
      });

      // ── Phase 6: per-asset assignments + runs ─────────────────────────────
      let assetDone = 0;
      await runPool(deepAssets, 4, async (asset) => {
        await Promise.allSettled([
          assetWorkflowAssignmentService.listByAsset(asset.id),
          assetWorkflowRunService.listByAsset(asset.id),
        ]);
        assetDone++;
        emit("bootstrap:progress", { phase: "workflows", done: assetDone, total: deepAssets.length } satisfies BootstrapProgress);
      });

      // ── Phase 7: download workflow-config reference media ─────────────────
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
      let mediaDone = 0;
      await runPool(relevantConfigs, 3, async (cfg) => {
        await configMediaCache.prefetchConfig(cfg).catch(() => {});
        mediaDone++;
        emit("bootstrap:progress", { phase: "media", done: mediaDone, total: relevantConfigs.length } satisfies BootstrapProgress);
      });

      await syncMetaSet(BOOTSTRAP_META_KEY);
      emit("bootstrap:complete", {
        projects: projects.length,
        assets: allAssets.length,
        deepAssets: deepAssets.length,
        products: productIds.length,
        configs: relevantConfigs.length,
      });
    } catch (err) {
      emit("bootstrap:error", { message: (err as Error)?.message });
    } finally {
      _running = false;
    }
  },
};

export default offlineBootstrapService;
