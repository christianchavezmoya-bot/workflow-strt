export const API_LARGE_PAYLOAD_WARNING_BYTES = 1 * 1024 * 1024;
export const RUN_MUTATION_TIMEOUT_MS = 60_000;

export function getSyncOpTimeoutMs(opType?: string | null): number {
  switch (opType) {
    case "RUN_UPDATE":
    case "RUN_COMPLETE":
    case "STEP_RESULTS":
      return RUN_MUTATION_TIMEOUT_MS;
    default:
      return 10_000;
  }
}
