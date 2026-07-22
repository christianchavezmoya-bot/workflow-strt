import { shouldSkipBlockingFetch } from "../services/connectivityMonitor";

/** Backoff after consecutive network failures: 30s → 2m → 5m → 15m → 30m */
const CIRCUIT_BACKOFF_MS = [30_000, 120_000, 300_000, 900_000, 1_800_000];

let failureCount = 0;
let openUntilMs = 0;

export function isCircuitOpen(): boolean {
  return Date.now() < openUntilMs;
}

export function getCircuitOpenUntilMs(): number {
  return openUntilMs;
}

export function getCircuitFailureCount(): number {
  return failureCount;
}

/** Trip after a genuine network-level request failure (not HTTP 4xx/5xx). */
export function tripCircuitBreaker(): void {
  const delay = CIRCUIT_BACKOFF_MS[Math.min(failureCount, CIRCUIT_BACKOFF_MS.length - 1)];
  failureCount += 1;
  openUntilMs = Date.now() + delay;
}

export function resetCircuitBreaker(): void {
  failureCount = 0;
  openUntilMs = 0;
}

/**
 * Skip blocking network reads when the device is offline or the circuit is open.
 * Unlike health-ping reachability, the circuit only opens after real request failures.
 */
export function shouldSkipBlockingNetworkRead(): boolean {
  if (shouldSkipBlockingFetch()) return true;
  return isCircuitOpen();
}

/** Test helper */
export function _resetCircuitBreakerForTests(): void {
  resetCircuitBreaker();
}
