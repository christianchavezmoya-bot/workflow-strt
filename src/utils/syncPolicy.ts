export const API_LARGE_PAYLOAD_WARNING_BYTES = 1 * 1024 * 1024;
export const RUN_MUTATION_TIMEOUT_MS = 60_000;
/** Extended budget for large run payloads (embedded photos in stepResultsJson). */
export const RUN_LARGE_PAYLOAD_TIMEOUT_MS = 120_000;
export const RUN_LARGE_PAYLOAD_THRESHOLD_BYTES = 400_000;
/** Short connect budget for background sync GETs (not UI-critical path). */
export const API_CONNECT_TIMEOUT_MS = 5_000;

export function getSyncOpTimeoutMs(opType?: string | null, payloadBytes?: number | null): number {
  const isRunMutation = opType === "RUN_CREATE"
    || opType === "RUN_UPDATE"
    || opType === "RUN_COMPLETE"
    || opType === "STEP_RESULTS"
    || opType === "TIME_ENTRY"
    || opType === "SIGNATURE_SUBMIT";

  if (isRunMutation) {
    if (payloadBytes != null && payloadBytes >= RUN_LARGE_PAYLOAD_THRESHOLD_BYTES) {
      return RUN_LARGE_PAYLOAD_TIMEOUT_MS;
    }
    return RUN_MUTATION_TIMEOUT_MS;
  }

  return 10_000;
}
