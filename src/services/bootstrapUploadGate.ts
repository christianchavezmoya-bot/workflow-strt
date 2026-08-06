/**
 * Ensures outbound sync (upload queue) drains before server→phone bootstrap
 * prefetch, so large GET storms don't compete with signature/run POSTs on reconnect.
 */

import { pendingGetAll } from "./localDB";
import { isSyncFlushing } from "../utils/syncFlushLock";

const DEFAULT_MAX_WAIT_MS = 5 * 60_000;
const POLL_MS = 2_000;

/** Pending ops that still need upload (excludes user-flagged conflicts). */
export async function pendingActiveUploadCount(): Promise<number> {
  const all = await pendingGetAll();
  return all.filter((action) => !action.conflictDetected).length;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Wait until the upload queue is idle: no flush in flight and no active pending ops.
 * Requests a sync flush when work is queued. Resolves after maxWaitMs even if work
 * remains (conflicts/backoff) so bootstrap is not blocked forever.
 */
export async function waitForActiveUploadDrain(maxWaitMs = DEFAULT_MAX_WAIT_MS): Promise<void> {
  const deadline = Date.now() + maxWaitMs;

  const drainOnce = async (): Promise<boolean> => {
    const active = await pendingActiveUploadCount();
    if (active === 0 && !isSyncFlushing()) return true;
    if (active > 0 && !isSyncFlushing()) {
      window.dispatchEvent(new Event("sync-request-flush-now"));
    }
    return false;
  };

  if (await drainOnce()) return;

  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener("sync-engine:flush-complete", onFlushComplete);
      window.clearInterval(pollId);
      window.clearTimeout(timeoutId);
      resolve();
    };

    const onFlushComplete = () => {
      void drainOnce().then((done) => { if (done) finish(); });
    };

    window.addEventListener("sync-engine:flush-complete", onFlushComplete);

    const pollId = window.setInterval(() => {
      void drainOnce().then((done) => { if (done) finish(); });
    }, POLL_MS);

    const timeoutId = window.setTimeout(finish, Math.max(0, deadline - Date.now()));
  });
}
