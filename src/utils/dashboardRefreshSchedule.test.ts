import { describe, expect, it } from "vitest";
import {
  INITIAL_DASHBOARD_REFRESH_DEFER_STATE,
  flushHiddenDeferredRefresh,
  flushRunnerDeferredRefresh,
  requestDashboardRefresh,
} from "./dashboardRefreshSchedule";

describe("requestDashboardRefresh", () => {
  it("defers while WorkOrderRunner is open and remembers scope", () => {
    const result = requestDashboardRefresh(INITIAL_DASHBOARD_REFRESH_DEFER_STATE, {
      scope: "light",
      runnerOpen: true,
      documentHidden: false,
    });
    expect(result.schedule).toBe(false);
    expect(result.next.deferForRunner).toBe(true);
    expect(result.next.pendingScope).toBe("light");
  });

  it("upgrades deferred scope to full when a full refresh is requested during a run", () => {
    const deferred = requestDashboardRefresh(INITIAL_DASHBOARD_REFRESH_DEFER_STATE, {
      scope: "light",
      runnerOpen: true,
      documentHidden: false,
    }).next;

    const result = requestDashboardRefresh(deferred, {
      scope: "full",
      runnerOpen: true,
      documentHidden: false,
    });

    expect(result.schedule).toBe(false);
    expect(result.next.pendingScope).toBe("full");
  });

  it("schedules immediately when runner is closed", () => {
    const result = requestDashboardRefresh(INITIAL_DASHBOARD_REFRESH_DEFER_STATE, {
      scope: "light",
      runnerOpen: false,
      documentHidden: false,
    });
    expect(result.schedule).toBe(true);
    expect(result.scopeToRun).toBe("light");
  });
});

describe("flushRunnerDeferredRefresh", () => {
  it("runs the accumulated scope once when the runner closes", () => {
    const deferred = requestDashboardRefresh(INITIAL_DASHBOARD_REFRESH_DEFER_STATE, {
      scope: "light",
      runnerOpen: true,
      documentHidden: false,
    }).next;

    const flush = flushRunnerDeferredRefresh(deferred);
    expect(flush.schedule).toBe(true);
    expect(flush.scopeToRun).toBe("light");
    expect(flush.next.deferForRunner).toBe(false);
  });
});

describe("flushHiddenDeferredRefresh", () => {
  it("runs when the tab becomes visible again", () => {
    const hidden = requestDashboardRefresh(INITIAL_DASHBOARD_REFRESH_DEFER_STATE, {
      scope: "full",
      runnerOpen: false,
      documentHidden: true,
    }).next;

    const flush = flushHiddenDeferredRefresh(hidden);
    expect(flush.schedule).toBe(true);
    expect(flush.scopeToRun).toBe("full");
    expect(flush.next.deferForHidden).toBe(false);
  });
});
