import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
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

  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes interactive ready ms from navigation_start to interactive_ready", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    markOfflinePerf("navigation_start", "dashboard-resume:cfg-1");
    vi.setSystemTime(1050);
    markOfflinePerf("workflow_local_read_start", "cfg-1");
    vi.setSystemTime(1060);
    markOfflinePerf("workflow_local_read_end", "cfg-1");
    vi.setSystemTime(1070);
    markOfflinePerf("first_render", "runner");
    vi.setSystemTime(1100);
    markOfflinePerf("interactive_ready", "runner-local");

    expect(getInteractiveReadyMs()).toBe(100);
  });

  it("returns null when markers are incomplete", () => {
    markOfflinePerf("navigation_start", "tap");
    expect(getInteractiveReadyMs()).toBeNull();
  });

  it("returns the most recent open pair after a second open", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    markOfflinePerf("navigation_start", "first");
    vi.setSystemTime(1200);
    markOfflinePerf("interactive_ready", "first");

    vi.setSystemTime(5000);
    markOfflinePerf("navigation_start", "second");
    vi.setSystemTime(5100);
    markOfflinePerf("interactive_ready", "second");

    expect(getInteractiveReadyMs()).toBe(100);
  });

  it("does not accumulate wall time across unrelated opens", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    markOfflinePerf("navigation_start", "old");
    vi.setSystemTime(373_182);
    markOfflinePerf("navigation_start", "new");
    vi.setSystemTime(373_282);
    markOfflinePerf("interactive_ready", "new");

    expect(getInteractiveReadyMs()).toBe(100);
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
