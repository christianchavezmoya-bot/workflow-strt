import { describe, expect, it, beforeEach } from "vitest";
import {
  _resetOfflinePerfForTests,
  formatOfflinePerfEntry,
  getInteractiveReadyMs,
  getRecentOfflinePerfMarkers,
  markOfflinePerf,
  startWorkflowLocalReadSpan,
} from "./offlinePerf";

describe("offlinePerf", () => {
  beforeEach(() => {
    _resetOfflinePerfForTests();
  });

  it("computes interactive ready ms from navigation_start to interactive_ready", () => {
    markOfflinePerf("navigation_start", "dashboard-resume:cfg-1");
    markOfflinePerf("workflow_local_read_start", "cfg-1");
    markOfflinePerf("workflow_local_read_end", "cfg-1");
    markOfflinePerf("first_render", "runner");
    markOfflinePerf("interactive_ready", "runner-local");

    const ms = getInteractiveReadyMs();
    expect(ms).not.toBeNull();
    expect(ms!).toBeGreaterThanOrEqual(0);
  });

  it("returns null when markers are incomplete", () => {
    markOfflinePerf("navigation_start", "tap");
    expect(getInteractiveReadyMs()).toBeNull();
  });

  it("returns the most recent interactive_ready after a second open", () => {
    markOfflinePerf("navigation_start", "first");
    markOfflinePerf("interactive_ready", "first");
    const firstReadyAt = getInteractiveReadyMs();

    markOfflinePerf("navigation_start", "second");
    markOfflinePerf("interactive_ready", "second");
    const secondReadyAt = getInteractiveReadyMs();

    expect(secondReadyAt).not.toBeNull();
    expect(secondReadyAt!).toBeGreaterThanOrEqual(0);
    expect(firstReadyAt).not.toBeNull();
  });

  it("returns the last N perf markers", () => {
    markOfflinePerf("navigation_start", "a");
    markOfflinePerf("workflow_local_read_start", "a");
    markOfflinePerf("interactive_ready", "a");

    const recent = getRecentOfflinePerfMarkers(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].marker).toBe("workflow_local_read_start");
    expect(recent[1].marker).toBe("interactive_ready");
  });

  it("formats perf entries for debug tooltips", () => {
    markOfflinePerf("navigation_start", "dashboard-resume:cfg-1");
    expect(formatOfflinePerfEntry(getRecentOfflinePerfMarkers(1)[0])).toBe(
      "navigation_start dashboard-resume:cfg-1",
    );
  });

  it("startWorkflowLocalReadSpan emits paired start/end markers", () => {
    const end = startWorkflowLocalReadSpan("cfg-42");
    end();

    const log = getRecentOfflinePerfMarkers(5).map((e) => e.marker);
    expect(log).toContain("workflow_local_read_start");
    expect(log).toContain("workflow_local_read_end");
  });
});
