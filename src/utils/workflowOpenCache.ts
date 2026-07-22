import type { Workflow } from "../types/workflow";
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

export function _clearWorkflowOpenCacheForTests(): void {
  cache.clear();
}
