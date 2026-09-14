import type { MediaItem, Workflow } from "../types/workflow";
import type { WorkflowConfig } from "../types/workflowConfig";

type CachedWorkflowShell = {
  workflow: Workflow;
  configId: string;
  cachedAt: number;
};

const MAX_ENTRIES = 12;
const cache = new Map<string, CachedWorkflowShell>();

export function getCachedWorkflowShell(configId: string): Workflow | null {
  const hit = cache.get(configId);
  if (!hit) return null;
  cache.delete(configId);
  cache.set(configId, hit);
  return hit.workflow;
}

export function setCachedWorkflowShell(configId: string, workflow: Workflow): void {
  cache.set(configId, { workflow, configId, cachedAt: Date.now() });
  if (cache.size <= MAX_ENTRIES) return;
  const oldest = cache.keys().next().value;
  if (oldest) cache.delete(oldest);
}

export function parseWorkflowFromConfig(cfg: WorkflowConfig): Workflow | null {
  try {
    const parsed = JSON.parse(cfg.stepsJson);
    if (parsed?.steps) return parsed as Workflow;
    if (Array.isArray(parsed)) {
      return {
        id: cfg.id,
        name: cfg.name,
        productId: cfg.productId,
        createdAt: Date.now(),
        steps: parsed,
        media: [],
      };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Reconcile the workflow shell's media with the config's current media.
 *
 * The config's mediaJson is the authoritative source for each item's
 * current `url` — configMediaCache.hydrateConfig() keeps it up to date
 * with locally hydrated offline URLs (e.g. the native local-media-server
 * URL on iOS), while the workflow shell can carry a stale persisted url
 * (from stepsJson, or from a shell cached before hydration completed).
 * Reconciling by stable media `id` means a hydrated url is applied even
 * when the workflow shell already has a non-empty media array, which a
 * blanket "already has media, skip" guard previously prevented — see the
 * PR #355 offline-video investigation.
 *
 * - Matched by id: keep the workflow item's own structure/metadata, take
 *   the url from the config item.
 * - Workflow-only item (no config match): preserved unchanged.
 * - Config-only item (no workflow match): included — same fallback
 *   behavior as before for a workflow with no media array.
 * - Never mutates `wf` or `wf.media`; returns `wf` unchanged (same
 *   reference) when nothing actually changed.
 */
export function mergeWorkflowConfigMedia(wf: Workflow, cfg: { mediaJson?: string }): Workflow {
  let cfgMedia: MediaItem[];
  try {
    const parsed = JSON.parse(cfg.mediaJson || "[]");
    cfgMedia = Array.isArray(parsed) ? parsed : [];
  } catch {
    cfgMedia = [];
  }
  if (cfgMedia.length === 0) return wf;

  const cfgById = new Map(cfgMedia.map((item) => [item.id, item]));
  const seenIds = new Set<string>();
  let changed = false;

  const reconciled: MediaItem[] = (wf.media ?? []).map((wfItem) => {
    seenIds.add(wfItem.id);
    const cfgItem = cfgById.get(wfItem.id);
    if (cfgItem && cfgItem.url !== wfItem.url) {
      changed = true;
      return { ...wfItem, url: cfgItem.url };
    }
    return wfItem;
  });

  for (const cfgItem of cfgMedia) {
    if (!seenIds.has(cfgItem.id)) {
      reconciled.push(cfgItem);
      changed = true;
    }
  }

  return changed ? { ...wf, media: reconciled } : wf;
}

export function _clearWorkflowOpenCacheForTests(): void {
  cache.clear();
}
