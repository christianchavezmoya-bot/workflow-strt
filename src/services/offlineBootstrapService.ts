import { isMobileNativePlatform } from "../utils/platform";
import { secureGet } from "./secureStorage";
import { syncMetaGet, syncMetaSet, CACHE_SOFT_LIMIT_MS } from "./localDB";
import { projectService } from "./projectService";
import { projectAssetService } from "./projectAssetService";
import { assetWorkflowAssignmentService } from "./assetWorkflowAssignmentService";
import { assetWorkflowRunService } from "./assetWorkflowRunService";
import { workflowConfigService } from "./workflowConfigService";
import { workflowTypeService } from "./workflowTypeService";
import { workflowTemplateService } from "./workflowTemplateService";
import { productConfigService } from "./productConfigService";
import { productService } from "./productService";
import { featureService } from "./featureService";
import { userService } from "./userService";
import { brandSettingsService } from "./brandSettingsService";
import { configMediaCache } from "./configMediaCache";
import { documentService } from "./documentService";
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
 */

export type BootstrapScope = "assigned" | "all";

export interface BootstrapProgress {
  phase: string;
  done: number;
  total: number;
}

export interface BootstrapRunOptions {
  /** "all" (default) caches every project asset; "assigned" limits deep workflow prefetch. */
  scope?: BootstrapScope;
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

function assetsForDeepCache(allAssets: ProjectAsset[], scope: BootstrapScope, userId: string | null): ProjectAsset[] {
  if (scope === "all") return allAssets;
  return allAssets.filter((a) =>
    (userId && a.assignedUserId === userId) ||
    a.status === "InProgress" ||
    a.status === "Paused" ||
    a.status === "Pending"
  );
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
   * Full download pass — call when the device comes back online so every asset,
   * assignment, run, and workflow config is on the phone even if never visited.
   */
  async runOnReconnect(): Promise<void> {
    return this.run({ scope: "all" });
  },

  /**
   * Prefetch offline data. Fire-and-forget — never blocks the UI.
   * Default scope is "all" so the entire accessible project catalog is cached.
   */
  async run(options?: BootstrapRunOptions): Promise<void> {
    if (!isMobileNativePlatform()) return;
    if (_running) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    const scope = options?.scope ?? "all";
    const userId = currentUserId();

    _running = true;
    emit("bootstrap:started", { scope });

    try {
      // ── Phase 1: shared reference data ────────────────────────────────────
      emit("bootstrap:progress", { phase: "reference", done: 0, total: 1 } satisfies BootstrapProgress);
      await Promise.allSettled([
        workflowTypeService.list(),
        userService.getUsers(),
        productService.getProducts(),
        brandSettingsService.get(),
        featureService.getAll(),
        // Warm the document index so Tips/Documents can browse offline without
        // forcing a full file-library download during bootstrap.
        documentService.refreshDocumentsCache({ prefetchFiles: false }),
        workflowConfigService.getAll("Published").catch(() => []),
      ]);

      // ── Phase 2: projects ─────────────────────────────────────────────────
      emit("bootstrap:progress", { phase: "projects", done: 0, total: 1 } satisfies BootstrapProgress);
      const projectsResp = await projectService.getProjects();
      const projects = projectsResp.items ?? [];

      // ── Phase 3: assets per project (full list cache) ─────────────────────
      const allAssets: ProjectAsset[] = [];
      let projDone = 0;
      await runPool(projects, 4, async (project) => {
        const assets = await projectAssetService.listByProject(project.id).catch(() => []);
        allAssets.push(...assets);
        projDone++;
        emit("bootstrap:progress", { phase: "assets", done: projDone, total: projects.length } satisfies BootstrapProgress);
      });

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
        emit("bootstrap:progress", { phase: "configs", done: prodDone, total: productIds.length } satisfies BootstrapProgress);
      });

      // ── Phase 5: workflow configs linked directly on assets + legacy templates
      const linkedConfigIds = [...new Set(allAssets.map((a) => a.productConfigId).filter(Boolean) as string[])];
      let cfgDone = 0;
      await runPool(linkedConfigIds, 6, async (configId) => {
        await workflowConfigService.getById(configId).catch(() => null);
        cfgDone++;
        emit("bootstrap:progress", { phase: "linked-configs", done: cfgDone, total: linkedConfigIds.length } satisfies BootstrapProgress);
      });

      const templateIds = [...new Set(allAssets.map((a) => a.workflowTemplateId).filter(Boolean) as string[])];
      await runPool(templateIds, 4, async (templateId) => {
        await workflowTemplateService.getById(templateId).catch(() => null);
      });

      // ── Phase 6: per-asset assignments + full run history (network refresh) ─
      let assetDone = 0;
      await runPool(deepAssets, 4, async (asset) => {
        await Promise.allSettled([
          assetWorkflowAssignmentService.listByAsset(asset.id),
          assetWorkflowRunService.listByAssetFresh(asset.id),
        ]);
        assetDone++;
        emit("bootstrap:progress", { phase: "workflows", done: assetDone, total: deepAssets.length } satisfies BootstrapProgress);
      });

      // ── Phase 7: workflow-config reference media ──────────────────────────
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
      await runPool(relevantConfigs, 3, async (cfg) => {
        await configMediaCache.prefetchConfig(cfg).catch(() => {});
        mediaDone++;
        emit("bootstrap:progress", { phase: "media", done: mediaDone, total: relevantConfigs.length } satisfies BootstrapProgress);
      });

      await syncMetaSet(BOOTSTRAP_META_KEY);
      emit("bootstrap:complete", {
        scope,
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
