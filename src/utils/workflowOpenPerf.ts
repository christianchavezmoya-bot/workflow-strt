import { markOfflinePerf, startWorkflowLocalReadSpan } from "./offlinePerf";

/** Mark user tap before config/run load (covers full perceived open time). */
export function markWorkflowOpenTap(source: string, configId?: string): void {
  const detail = configId ? `${source}:${configId}` : source;
  markOfflinePerf("navigation_start", detail);
}

export { startWorkflowLocalReadSpan };
