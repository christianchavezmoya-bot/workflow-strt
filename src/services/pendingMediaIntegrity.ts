/**
 * Verify stored media refs referenced by queued sync actions still exist on disk.
 */
import { Directory, Filesystem } from "@capacitor/filesystem";
import { isMobileNativePlatform } from "../utils/platform";
import { pendingGetAll, type PendingAction } from "./localDB";
import { mediaStore } from "./mediaStore";

export interface PendingMediaIntegrityRow {
  actionId: string;
  opType?: string;
  entityId: string;
  presentPaths: string[];
  missingPaths: string[];
}

function collectMediaRefs(value: unknown, refs: Set<string>): void {
  if (typeof value === "string") {
    if (mediaStore.isStoredMediaValue(value)) {
      const raw = value.slice("offline-media-ref:".length);
      const parts = raw.split("|");
      const path = parts[2] ? decodeURIComponent(parts[2]) : "";
      if (path) refs.add(path);
    }
    if (value.includes("stepResultsJson") || value.startsWith("[") || value.startsWith("{")) {
      try {
        collectMediaRefs(JSON.parse(value), refs);
      } catch {
        // ignore
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectMediaRefs(item, refs));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) => collectMediaRefs(item, refs));
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await Filesystem.stat({ path, directory: Directory.Data });
    return true;
  } catch {
    return false;
  }
}

export async function checkPendingMediaIntegrity(action?: PendingAction): Promise<PendingMediaIntegrityRow[]> {
  if (!isMobileNativePlatform()) return [];
  const actions = action ? [action] : await pendingGetAll();
  const rows: PendingMediaIntegrityRow[] = [];

  for (const pending of actions) {
    const refs = new Set<string>();
    collectMediaRefs(pending.body, refs);
    if (refs.size === 0) continue;

    const presentPaths: string[] = [];
    const missingPaths: string[] = [];
    await Promise.all(
      [...refs].map(async (path) => {
        if (await fileExists(path)) presentPaths.push(path);
        else missingPaths.push(path);
      }),
    );

    if (missingPaths.length > 0 || action) {
      rows.push({
        actionId: pending.id,
        opType: pending.opType,
        entityId: pending.entityId,
        presentPaths,
        missingPaths,
      });
    }
  }

  return rows;
}
