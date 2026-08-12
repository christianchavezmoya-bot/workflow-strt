/**
 * Decides when a native field download (bootstrap) is needed vs when live reads suffice.
 */

import { syncMetaGet, syncMetaSet, syncMetaDelete } from "../services/localDB";
import offlineBootstrapService, { type BootstrapScope } from "../services/offlineBootstrapService";
import { getManualDownloadOnly } from "./syncPreferences";

export const BOOTSTRAP_META_KEY = "bootstrap";
export const SERVER_CHANGE_META_KEY = "server-change";

/** Minimum gap between automatic full bootstraps when no server changes detected. */
export const FULL_BOOTSTRAP_COOLDOWN_MS = 15 * 60_000;

/** Assigned-scope reconnect without server changes — wait at least this long. */
export const RECONNECT_ASSIGNED_COOLDOWN_MS = 5 * 60_000;

export type BootstrapReason =
  | "first-login"
  | "reconnect"
  | "stale-foreground"
  | "flush-complete"
  | "sse-fallback"
  | "sync-now"
  | "pull-sync"
  | "readiness-panel";

export type BootstrapMode = "full" | "light";

export type ShouldBootstrapInput = {
  reason: BootstrapReason;
  scope: BootstrapScope;
  force?: boolean;
  mode?: BootstrapMode;
};

async function getMetaMs(key: string): Promise<number | null> {
  const raw = await syncMetaGet(key);
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Record that server-side data may have changed since the last bootstrap. */
export async function markServerDataChanged(): Promise<void> {
  await syncMetaSet(SERVER_CHANGE_META_KEY);
}

/** Clear server-change flag after targeted prefetch or delta sync handled the update. */
export async function clearServerChangeFlag(): Promise<void> {
  await syncMetaDelete(SERVER_CHANGE_META_KEY);
}

export async function hasEverBootstrapped(): Promise<boolean> {
  return (await getMetaMs(BOOTSTRAP_META_KEY)) !== null;
}

export async function getLastBootstrapMs(): Promise<number | null> {
  return getMetaMs(BOOTSTRAP_META_KEY);
}

export async function getLastServerChangeMs(): Promise<number | null> {
  return getMetaMs(SERVER_CHANGE_META_KEY);
}

/** True when a server push/SSE arrived after the last successful bootstrap. */
export async function hasServerChangesSinceBootstrap(): Promise<boolean> {
  const [bootstrapMs, changeMs] = await Promise.all([
    getLastBootstrapMs(),
    getLastServerChangeMs(),
  ]);
  if (bootstrapMs === null) return true;
  if (changeMs === null) return false;
  return changeMs > bootstrapMs;
}

export async function isWithinFullBootstrapCooldown(): Promise<boolean> {
  const lastMs =
    offlineBootstrapService.getLastCompletedAtMs()
    ?? await getLastBootstrapMs();
  if (lastMs === null) return false;
  return Date.now() - lastMs < FULL_BOOTSTRAP_COOLDOWN_MS;
}

export async function isWithinReconnectCooldown(): Promise<boolean> {
  const lastMs =
    offlineBootstrapService.getLastCompletedAtMs()
    ?? await getLastBootstrapMs();
  if (lastMs === null) return false;
  return Date.now() - lastMs < RECONNECT_ASSIGNED_COOLDOWN_MS;
}

export function inferBootstrapMode(
  reason: BootstrapReason,
  scope: BootstrapScope,
  force: boolean,
): BootstrapMode {
  if (force || reason === "sync-now" || reason === "first-login") return "full";
  if (scope === "all") return "full";
  if (reason === "reconnect" || reason === "pull-sync" || reason === "flush-complete" || reason === "sse-fallback") {
    return "light";
  }
  return "full";
}

/**
 * Whether a bootstrap download should run for this trigger.
 * Upload sync is handled separately — this gate is download-only.
 */
export async function shouldScheduleBootstrap(input: ShouldBootstrapInput): Promise<boolean> {
  const { reason, scope, force } = input;
  if (force) return true;

  if (getManualDownloadOnly() && reason !== "sync-now" && reason !== "readiness-panel") {
    return false;
  }

  const [ever, stale, serverChanged, inFullCooldown, inReconnectCooldown] = await Promise.all([
    hasEverBootstrapped(),
    offlineBootstrapService.isStale(),
    hasServerChangesSinceBootstrap(),
    isWithinFullBootstrapCooldown(),
    isWithinReconnectCooldown(),
  ]);

  if (!ever || reason === "first-login") return true;

  if (reason === "sync-now") return true;

  if (reason === "readiness-panel") {
    return stale || serverChanged;
  }

  if (reason === "pull-sync") {
    return stale || serverChanged;
  }

  if (reason === "reconnect" || reason === "flush-complete") {
    if (!serverChanged && !stale) return false;
    if (scope === "assigned" && inReconnectCooldown && !serverChanged && !stale) return false;
    if (scope === "all" && inFullCooldown && !serverChanged && !stale) return false;
    return true;
  }

  if (reason === "stale-foreground") {
    return stale;
  }

  if (reason === "sse-fallback") {
    return serverChanged || stale;
  }

  return false;
}
