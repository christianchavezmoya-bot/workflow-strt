export const API_LARGE_PAYLOAD_WARNING_BYTES = 1 * 1024 * 1024;
export const RUN_MUTATION_TIMEOUT_MS = 60_000;
/** Extended budget for large run payloads (embedded photos in stepResultsJson). */
export const RUN_LARGE_PAYLOAD_TIMEOUT_MS = 120_000;
export const RUN_LARGE_PAYLOAD_THRESHOLD_BYTES = 400_000;
/** Short connect budget for background sync GETs (not UI-critical path). */
export const API_CONNECT_TIMEOUT_MS = 5_000;

/** Native field sync always pushes phone changes over server state (except signed+closed). */
export const PHONE_WINS_FIELD_SYNC = true;

/** Header sent on sync-engine workflow mutations to request server force-apply. */
export const FIELD_SYNC_FORCE_HEADER = "X-Field-Sync";
export const FIELD_SYNC_FORCE_VALUE = "force";

export function isPhoneWinsFieldSync(): boolean {
  return PHONE_WINS_FIELD_SYNC;
}

export function getSyncOpTimeoutMs(opType?: string | null, payloadBytes?: number | null): number {
  const isRunMutation = opType === "RUN_CREATE"
    || opType === "RUN_UPDATE"
    || opType === "RUN_COMPLETE"
    || opType === "RUN_BUNDLE"
    || opType === "STEP_RESULTS"
    || opType === "STEP_MEDIA_UPLOAD"
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

/** Prefetch limits for bootstrap — uncapped when user forces Sync Now. */
export function getBootstrapPrefetchLimits(force = false): {
  maxTotalBytes: number;
  maxFiles: number;
  libraryMaxTotalBytes: number;
  libraryMaxFiles: number;
} {
  if (force) {
    return {
      maxTotalBytes: Number.MAX_SAFE_INTEGER,
      maxFiles: Number.MAX_SAFE_INTEGER,
      libraryMaxTotalBytes: Number.MAX_SAFE_INTEGER,
      libraryMaxFiles: Number.MAX_SAFE_INTEGER,
    };
  }
  return {
    maxTotalBytes: 50 * 1024 * 1024,
    maxFiles: 30,
    libraryMaxTotalBytes: 100 * 1024 * 1024,
    libraryMaxFiles: 50,
  };
}
