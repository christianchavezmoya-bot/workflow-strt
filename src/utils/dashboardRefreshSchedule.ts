import type { DashboardLiveRefreshScope } from "./dashboardRefreshStagger";

export type DashboardRefreshDeferState = {
  pendingScope: DashboardLiveRefreshScope;
  deferForRunner: boolean;
  deferForHidden: boolean;
};

export const INITIAL_DASHBOARD_REFRESH_DEFER_STATE: DashboardRefreshDeferState = {
  pendingScope: "light",
  deferForRunner: false,
  deferForHidden: false,
};

function mergeScope(current: DashboardLiveRefreshScope, incoming: DashboardLiveRefreshScope): DashboardLiveRefreshScope {
  return incoming === "full" || current === "full" ? "full" : "light";
}

/** Decide whether a dashboard refresh should run now or be deferred. */
export function requestDashboardRefresh(
  state: DashboardRefreshDeferState,
  opts: { scope: DashboardLiveRefreshScope; runnerOpen: boolean; documentHidden: boolean },
): { next: DashboardRefreshDeferState; schedule: boolean; scopeToRun?: DashboardLiveRefreshScope } {
  const pendingScope = mergeScope(state.pendingScope, opts.scope);

  if (opts.documentHidden) {
    return {
      next: { pendingScope, deferForRunner: state.deferForRunner, deferForHidden: true },
      schedule: false,
    };
  }

  if (opts.runnerOpen) {
    return {
      next: { pendingScope, deferForRunner: true, deferForHidden: state.deferForHidden },
      schedule: false,
    };
  }

  return {
    next: INITIAL_DASHBOARD_REFRESH_DEFER_STATE,
    schedule: true,
    scopeToRun: pendingScope,
  };
}

/** Flush a refresh that was deferred while WorkOrderRunner was open. */
export function flushRunnerDeferredRefresh(state: DashboardRefreshDeferState): {
  next: DashboardRefreshDeferState;
  schedule: boolean;
  scopeToRun?: DashboardLiveRefreshScope;
} {
  if (!state.deferForRunner) {
    return { next: state, schedule: false };
  }

  return {
    next: { ...INITIAL_DASHBOARD_REFRESH_DEFER_STATE, deferForHidden: state.deferForHidden },
    schedule: true,
    scopeToRun: state.pendingScope,
  };
}

/** Flush a refresh that was deferred while the browser tab was hidden. */
export function flushHiddenDeferredRefresh(state: DashboardRefreshDeferState): {
  next: DashboardRefreshDeferState;
  schedule: boolean;
  scopeToRun?: DashboardLiveRefreshScope;
} {
  if (!state.deferForHidden) {
    return { next: state, schedule: false };
  }

  return {
    next: { ...state, deferForHidden: false },
    schedule: true,
    scopeToRun: state.pendingScope,
  };
}
