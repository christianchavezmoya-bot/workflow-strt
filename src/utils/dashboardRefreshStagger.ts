/**
 * Stagger dashboard live-refresh GETs so SQLite is not hit by every heavy
 * endpoint in the same tick (open + workspace + workload + attention).
 */

export type DashboardLiveRefreshScope = "light" | "full";

export type DashboardLiveRefreshTasks = {
  workspace: () => Promise<unknown>;
  attention?: () => Promise<unknown>;
  listOpen?: () => Promise<unknown>;
  activeSummary?: () => Promise<unknown>;
  workload?: () => Promise<unknown>;
};

function delayedTask(delayMs: number, fn: () => Promise<unknown>): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      void fn().finally(() => resolve());
    }, delayMs);
  });
}

/** Start workspace immediately; defer heavier reads by 400–1200 ms. Light scope skips open/summary/workload. */
export async function runStaggeredDashboardLiveRefresh(
  tasks: DashboardLiveRefreshTasks,
  scope: DashboardLiveRefreshScope = "full",
): Promise<void> {
  const flights: Promise<void>[] = [
    tasks.workspace().then(() => undefined).catch(() => undefined),
  ];
  if (tasks.attention) flights.push(delayedTask(400, tasks.attention));
  if (scope === "full") {
    if (tasks.listOpen) flights.push(delayedTask(800, tasks.listOpen));
    if (tasks.activeSummary) flights.push(delayedTask(1000, tasks.activeSummary));
    if (tasks.workload) flights.push(delayedTask(1200, tasks.workload));
  }
  await Promise.all(flights);
}
