import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/app", () => ({
  App: { addListener: vi.fn(async () => ({ remove: vi.fn() })) },
}));

vi.mock("@capacitor/network", () => ({
  Network: {
    getStatus: vi.fn(async () => ({ connected: true, connectionType: "wifi" })),
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
  },
}));

vi.mock("../utils/platform", () => ({
  isMobileNativePlatform: vi.fn(() => true),
}));

vi.mock("./networkService", () => ({
  isServerReachable: vi.fn(async () => false),
}));

vi.mock("./offlineModeState", () => ({
  isManualOfflineModeActive: vi.fn(() => false),
}));

import { isServerReachable } from "./networkService";
import {
  _resetConnectivityMonitorForTests,
  startConnectivityMonitor,
} from "./connectivityMonitor";

describe("health ping unreachable tagging", () => {
  beforeEach(() => {
    _resetConnectivityMonitorForTests();
    vi.mocked(isServerReachable).mockResolvedValue(false);
  });

  afterEach(() => {
    _resetConnectivityMonitorForTests();
  });

  it("tags health-ping failures as timeouts so busy LAN does not flip amber offline", async () => {
    const events: CustomEvent<{ isTimeout?: boolean; source?: string }>[] = [];
    const onUnreachable = (event: Event) => {
      events.push(event as CustomEvent<{ isTimeout?: boolean; source?: string }>);
    };
    window.addEventListener("api-server-unreachable", onUnreachable);
    try {
      startConnectivityMonitor();
      await vi.waitFor(() => {
        expect(events.length).toBeGreaterThan(0);
      });
      expect(events[0].detail?.isTimeout).toBe(true);
      expect(events[0].detail?.source).toBe("health-ping");
    } finally {
      window.removeEventListener("api-server-unreachable", onUnreachable);
    }
  });
});
