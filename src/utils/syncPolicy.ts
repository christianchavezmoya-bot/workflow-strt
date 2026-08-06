export const API_LARGE_PAYLOAD_WARNING_BYTES = 1 * 1024 * 1024;
export const RUN_MUTATION_TIMEOUT_MS = 60_000;
/** Short connect budget for background sync GETs (not UI-critical path). */
export const API_CONNECT_TIMEOUT_MS = 5_000;

export function getSyncOpTimeoutMs(opType?: string | null): number {
  switch (opType) {
    case "RUN_CREATE":
    case "RUN_UPDATE":
    case "RUN_COMPLETE":
    case "STEP_RESULTS":
    case "TIME_ENTRY":
    case "SIGNATURE_SUBMIT":
      return RUN_MUTATION_TIMEOUT_MS;
    default:
      return 10_000;
  }
}
