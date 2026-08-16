/**
 * Turns a fault into a sanitized payload, sends it, and keeps it if sending fails.
 *
 * Everything mechanical is captured automatically — platform, versions, route, connectivity,
 * sync state, recent API calls — so the user only has to supply what the app cannot know:
 * what they were doing and what they expected. See docs/BUG_TRIAGE.md.
 */
import pkg from "../../../package.json";
import { isMobileNativePlatform } from "../../utils/platform";
import { getServerReachable } from "../connectivityMonitor";
import { isManualOfflineModeActive } from "../offlineModeState";
import { buildSyncSupportBundle } from "../syncSupportBundleService";
import { getDB, type PendingFaultReportRecord } from "../localDB";
import { getBreadcrumbs } from "./breadcrumbs";
import { generateFaultReferenceCode } from "./referenceCode";
import { dispatchToSinks } from "./sinks";
import type { FaultReportDraft, FaultReportPayload, FaultReportResult } from "./types";

const PENDING_STORE = "fault_reports_pending";
const MAX_PENDING = 20;
const MAX_STACK_CHARS = 20_000;

function isOffline(): boolean {
  if (isManualOfflineModeActive()) return true;
  if (getServerReachable() === false) return true;
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function currentRoute(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.hash}`.slice(0, 300);
}

/**
 * Diagnostics are best-effort: a crash may have left the app in a state where building the
 * bundle also throws, and losing the whole report to that would be worse than losing detail.
 */
async function safeDiagnosticsJson(): Promise<string | undefined> {
  try {
    return JSON.stringify(await buildSyncSupportBundle());
  } catch {
    return undefined;
  }
}

export async function buildFaultReportPayload(draft: FaultReportDraft): Promise<FaultReportPayload> {
  return {
    kind: draft.kind,
    severity: draft.severity,
    title: draft.title.slice(0, 200),
    description: draft.description,
    platform: isMobileNativePlatform() ? "native" : "web",
    appVersion: pkg.version,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    routePath: currentRoute(),
    errorName: draft.error?.name,
    errorMessage: draft.error?.message,
    errorStack: draft.error?.stack?.slice(0, MAX_STACK_CHARS),
    traceId: draft.traceId,
    breadcrumbsJson: JSON.stringify(getBreadcrumbs()),
    diagnosticsJson: await safeDiagnosticsJson(),
    wasOffline: isOffline(),
    occurredAtUtc: draft.occurredAt ?? new Date().toISOString(),
    clientReferenceCode: draft.referenceCode ?? generateFaultReferenceCode(),
  };
}

async function queuePending(payload: FaultReportPayload): Promise<void> {
  try {
    const db = await getDB();
    const record: PendingFaultReportRecord = {
      id: payload.clientReferenceCode,
      referenceCode: payload.clientReferenceCode,
      queuedAt: new Date().toISOString(),
      attempts: 1,
      payload,
    };
    await db.put(PENDING_STORE, record);

    // Keep the newest — a crash loop offline should not fill the device.
    const all = await db.getAll(PENDING_STORE);
    if (all.length > MAX_PENDING) {
      const oldest = all
        .sort((a, b) => new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime())
        .slice(0, all.length - MAX_PENDING);
      await Promise.all(oldest.map((row) => db.delete(PENDING_STORE, row.id)));
    }
  } catch {
    // Nothing more we can do — the user still has the reference code.
  }
}

/**
 * Submits a fault. Always resolves with a reference code, even when offline or when the
 * server rejects it, so the user is never left with nothing to quote.
 */
export async function submitFaultReport(draft: FaultReportDraft): Promise<FaultReportResult> {
  const payload = await buildFaultReportPayload(draft);

  if (isOffline()) {
    await queuePending(payload);
    return { referenceCode: payload.clientReferenceCode, delivered: false };
  }

  try {
    const delivered = await dispatchToSinks(payload);
    if (!delivered) await queuePending(payload);
    return { referenceCode: payload.clientReferenceCode, delivered };
  } catch {
    await queuePending(payload);
    return { referenceCode: payload.clientReferenceCode, delivered: false };
  }
}

export async function pendingFaultReportCount(): Promise<number> {
  try {
    const db = await getDB();
    return (await db.getAll(PENDING_STORE)).length;
  } catch {
    return 0;
  }
}

/** Sends anything queued earlier. Safe to call repeatedly; returns how many got through. */
export async function flushPendingFaultReports(): Promise<number> {
  if (isOffline()) return 0;

  let db: Awaited<ReturnType<typeof getDB>>;
  let queued: PendingFaultReportRecord[];
  try {
    db = await getDB();
    queued = await db.getAll(PENDING_STORE);
  } catch {
    return 0;
  }

  let sent = 0;
  for (const row of queued) {
    try {
      const delivered = await dispatchToSinks(row.payload as FaultReportPayload);
      if (delivered) {
        await db.delete(PENDING_STORE, row.id);
        sent += 1;
      } else {
        await db.put(PENDING_STORE, { ...row, attempts: row.attempts + 1 });
      }
    } catch (err) {
      await db.put(PENDING_STORE, {
        ...row,
        attempts: row.attempts + 1,
        lastError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return sent;
}
