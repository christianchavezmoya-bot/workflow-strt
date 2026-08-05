/** Recent successful API response — used to avoid false offline on slow timeouts. */
let lastApiSuccessAt = 0;

export const RECENT_API_SUCCESS_GRACE_MS = 15_000;

export function markApiRequestSuccess(): void {
  lastApiSuccessAt = Date.now();
}

export function getLastApiSuccessAt(): number {
  return lastApiSuccessAt;
}

export function hadRecentApiSuccess(withinMs = RECENT_API_SUCCESS_GRACE_MS): boolean {
  return lastApiSuccessAt > 0 && Date.now() - lastApiSuccessAt < withinMs;
}

/** Test helper */
export function _resetApiReachabilitySignalsForTests(): void {
  lastApiSuccessAt = 0;
}
