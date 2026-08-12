import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/localDB", () => ({
  syncMetaGet: vi.fn(),
  syncMetaSet: vi.fn(),
}));

vi.mock("../services/offlineBootstrapService", () => ({
  default: {
    isStale: vi.fn(),
    getLastCompletedAtMs: vi.fn(() => null),
  },
}));

import { syncMetaGet } from "../services/localDB";
import offlineBootstrapService from "../services/offlineBootstrapService";
import {
  hasEverBootstrapped,
  hasServerChangesSinceBootstrap,
  shouldScheduleBootstrap,
} from "./bootstrapFreshness";

describe("bootstrapFreshness", () => {
  beforeEach(() => {
    vi.mocked(syncMetaGet).mockReset();
    vi.mocked(offlineBootstrapService.isStale).mockReset();
    vi.mocked(offlineBootstrapService.getLastCompletedAtMs).mockReturnValue(null);
  });

  it("requires bootstrap on first login when never bootstrapped", async () => {
    vi.mocked(syncMetaGet).mockResolvedValue(null);
    expect(await hasEverBootstrapped()).toBe(false);
    expect(await shouldScheduleBootstrap({ reason: "first-login", scope: "all" })).toBe(true);
  });

  it("skips pull-sync when cache is fresh and no server changes", async () => {
    const now = new Date().toISOString();
    vi.mocked(syncMetaGet).mockImplementation(async (key) => {
      if (key === "bootstrap") return now;
      return null;
    });
    vi.mocked(offlineBootstrapService.isStale).mockResolvedValue(false);

    expect(await hasServerChangesSinceBootstrap()).toBe(false);
    expect(await shouldScheduleBootstrap({ reason: "pull-sync", scope: "assigned" })).toBe(false);
  });

  it("runs pull-sync when server data changed after bootstrap", async () => {
    vi.mocked(syncMetaGet).mockImplementation(async (key) => {
      if (key === "bootstrap") return new Date(Date.now() - 60_000).toISOString();
      if (key === "server-change") return new Date().toISOString();
      return null;
    });
    vi.mocked(offlineBootstrapService.isStale).mockResolvedValue(false);

    expect(await hasServerChangesSinceBootstrap()).toBe(true);
    expect(await shouldScheduleBootstrap({ reason: "pull-sync", scope: "assigned" })).toBe(true);
  });

  it("always runs when force is true", async () => {
    vi.mocked(syncMetaGet).mockResolvedValue(new Date().toISOString());
    vi.mocked(offlineBootstrapService.isStale).mockResolvedValue(false);

    expect(await shouldScheduleBootstrap({
      reason: "pull-sync",
      scope: "all",
      force: true,
    })).toBe(true);
  });
});
