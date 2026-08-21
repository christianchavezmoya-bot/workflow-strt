/**
 * Detect and recover from stale Vite/webpack lazy chunks after a deploy while a tab
 * stayed open. The browser still references old hashed filenames that no longer exist.
 */

const RELOAD_AT_KEY = "commtrac:chunk-reload-at";
/** Prevent reload loops when the failure is not deploy-related. */
const RELOAD_COOLDOWN_MS = 30_000;

function errorText(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  const message = String(error ?? "");
  return { name: "", message };
}

/** True when a dynamic import failed because the hashed chunk is missing or stale. */
export function isStaleChunkError(error: unknown): boolean {
  const { name, message } = errorText(error);
  if (name === "ChunkLoadError") return true;
  if (/Failed to fetch dynamically imported module/i.test(message)) return true;
  if (/Importing a module script failed/i.test(message)) return true;
  if (/Loading chunk [\d]+ failed/i.test(message)) return true;
  if (/error loading dynamically imported module/i.test(message)) return true;
  return false;
}

/** Whether a guarded reload has not been attempted recently in this tab. */
export function canAttemptChunkReload(): boolean {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(RELOAD_AT_KEY);
    if (!raw) return true;
    const at = Number(raw);
    if (!Number.isFinite(at)) return true;
    return Date.now() - at > RELOAD_COOLDOWN_MS;
  } catch {
    return false;
  }
}

/**
 * Record a reload attempt and refresh the page. Returns true when reload was
 * initiated; false when the cooldown guard blocked it.
 */
export function attemptChunkReload(): boolean {
  if (!canAttemptChunkReload()) return false;
  try {
    sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** Call after a successful boot so the next deploy can auto-reload once. */
export function clearChunkReloadFlag(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(RELOAD_AT_KEY);
  } catch {
    // Non-fatal — worst case the user sees the update screen once after reload.
  }
}
