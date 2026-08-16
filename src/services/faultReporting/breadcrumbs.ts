/**
 * In-memory trail of where the user has been and what they did, so a report answers
 * "steps to reproduce" without the user having to remember them.
 *
 * Deliberately not persisted: it is only useful for the session that produced the fault,
 * and keeping it in memory avoids writing user activity to disk.
 */
import type { FaultBreadcrumb } from "./types";

const MAX_BREADCRUMBS = 40;

let trail: FaultBreadcrumb[] = [];

/** Query strings can carry ids and tokens — keep the path only. */
function sanitizeRoute(path: string): string {
  const [withoutQuery] = path.split("?");
  return withoutQuery.slice(0, 200);
}

export function recordRouteBreadcrumb(path: string): void {
  const label = sanitizeRoute(path);
  const last = trail[trail.length - 1];
  if (last?.type === "route" && last.label === label) return;
  push({ ts: new Date().toISOString(), type: "route", label });
}

/** For deliberate actions worth seeing in a report, e.g. "completed run". */
export function recordActionBreadcrumb(label: string): void {
  push({ ts: new Date().toISOString(), type: "action", label: label.slice(0, 120) });
}

function push(entry: FaultBreadcrumb): void {
  trail.push(entry);
  if (trail.length > MAX_BREADCRUMBS) {
    trail = trail.slice(-MAX_BREADCRUMBS);
  }
}

export function getBreadcrumbs(): FaultBreadcrumb[] {
  return [...trail];
}

export function clearBreadcrumbs(): void {
  trail = [];
}
