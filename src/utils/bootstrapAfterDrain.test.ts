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
  inferBootstrapMode: vi.fn(() => "full" as const),
}));

vi.mock("../services/syncDeltaService", () => ({
  tryApplySyncDelta: vi.fn(async () => false),
}));

import offlineBootstrapService from "../services/offlineBootstrapService";
import { getServerReachable, subscribeServerReachable } from "../services/connectivityMonitor";
import { inferBootstrapMode } from "./bootstrapFreshness";
import { tryApplySyncDelta } from "../services/syncDeltaService";
import { scheduleBootstrapAfterUploadDrain, resetBootstrapCoordinatorForTests } from "./bootstrapAfterDrain";

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

describe("scheduleBootstrapAfterUploadDrain", () => {
  beforeEach(() => {
    resetBootstrapCoordinatorForTests();
    vi.mocked(getServerReachable).mockReturnValue(null);
    vi.mocked(subscribeServerReachable).mockReset();
    vi.mocked(offlineBootstrapService.runAfterUploadDrain).mockReset();
    vi.mocked(inferBootstrapMode).mockReturnValue("full");
    vi.mocked(tryApplySyncDelta).mockResolvedValue(false);
  });

  it("does not start bootstrap until /health confirms reachable", () => {
    scheduleBootstrapAfterUploadDrain("all");

    expect(offlineBootstrapService.runAfterUploadDrain).not.toHaveBeenCalled();
    expect(subscribeServerReachable).toHaveBeenCalled();
  });

  it("starts bootstrap immediately when server is confirmed reachable", async () => {
    vi.mocked(getServerReachable).mockReturnValue(true);

    scheduleBootstrapAfterUploadDrain("all", 0, false, "first-login");
    await flushAsyncWork();

    expect(offlineBootstrapService.runAfterUploadDrain).toHaveBeenCalledWith({
      scope: "all",
      force: false,
      mode: "full",
    });
  });

  it("passes light mode for reconnect triggers", async () => {
    vi.mocked(getServerReachable).mockReturnValue(true);
    vi.mocked(inferBootstrapMode).mockReturnValue("light");

    scheduleBootstrapAfterUploadDrain("assigned", 0, false, "reconnect");
    await flushAsyncWork();

    expect(offlineBootstrapService.runAfterUploadDrain).toHaveBeenCalledWith({
      scope: "assigned",
      force: false,
      mode: "light",
    });
  });
});
