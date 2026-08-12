import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/platform", () => ({
  isMobileNativePlatform: vi.fn(() => true),
}));

vi.mock("../services/connectivityMonitor", () => ({
  getNativeNetworkConnected: vi.fn(() => true),
  getServerReachable: vi.fn(() => null),
  shouldSkipRunMutation: vi.fn(() => false),
  subscribeServerReachable: vi.fn(() => () => {}),
}));

vi.mock("../services/offlineBootstrapService", () => ({
  default: {
    isRunning: vi.fn(() => false),
    getLastCompletedAtMs: vi.fn(() => null),
    runAfterUploadDrain: vi.fn(),
  },
}));

vi.mock("./bootstrapFreshness", () => ({
  shouldScheduleBootstrap: vi.fn(async () => true),
}));

import offlineBootstrapService from "../services/offlineBootstrapService";
import { getServerReachable, subscribeServerReachable } from "../services/connectivityMonitor";
import { scheduleBootstrapAfterUploadDrain } from "./bootstrapAfterDrain";

describe("scheduleBootstrapAfterUploadDrain", () => {
  beforeEach(() => {
    vi.mocked(getServerReachable).mockReturnValue(null);
    vi.mocked(subscribeServerReachable).mockReset();
    vi.mocked(offlineBootstrapService.runAfterUploadDrain).mockReset();
  });

  it("does not start bootstrap until /health confirms reachable", () => {
    scheduleBootstrapAfterUploadDrain("all");

    expect(offlineBootstrapService.runAfterUploadDrain).not.toHaveBeenCalled();
    expect(subscribeServerReachable).toHaveBeenCalled();
  });

  it("starts bootstrap immediately when server is confirmed reachable", async () => {
    vi.mocked(getServerReachable).mockReturnValue(true);

    scheduleBootstrapAfterUploadDrain("all", 0, false, "first-login");
    await Promise.resolve();

    expect(offlineBootstrapService.runAfterUploadDrain).toHaveBeenCalledWith({ scope: "all", force: false });
  });
});
