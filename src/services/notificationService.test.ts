import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("./connectivityMonitor", () => ({
  shouldSkipBlockingFetch: vi.fn(() => false),
}));

vi.mock("../utils/platform", () => ({
  isMobileNativePlatform: vi.fn(() => true),
}));

vi.mock("./localDB", () => ({
  cacheGet: vi.fn(),
  cachePut: vi.fn(),
}));

import api from "./api";
import { cacheGet, cachePut } from "./localDB";
import { shouldSkipBlockingFetch } from "./connectivityMonitor";
import { isMobileNativePlatform } from "../utils/platform";
import { notificationService } from "./notificationService";

describe("notificationService.list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isMobileNativePlatform).mockReturnValue(true);
    vi.mocked(shouldSkipBlockingFetch).mockReturnValue(false);
  });

  it("returns cached notifications when offline on native", async () => {
    vi.mocked(shouldSkipBlockingFetch).mockReturnValue(true);
    vi.mocked(cacheGet).mockResolvedValue([
      { id: "n1", title: "Cached", isRead: false, eventType: "workflow-assigned", severity: "info", createdAt: "2026-01-01T00:00:00Z" },
    ]);

    const items = await notificationService.list(true, 50);

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("n1");
    expect(api.get).not.toHaveBeenCalled();
  });

  it("fetches and caches notifications when online on native", async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);
    vi.mocked(api.get).mockResolvedValue({
      data: [{ id: "n2", title: "Live", isRead: true, eventType: "workflow-completed", severity: "success", createdAt: "2026-01-02T00:00:00Z" }],
    });

    const items = await notificationService.list(true, 50);

    expect(items[0].id).toBe("n2");
    expect(cachePut).toHaveBeenCalled();
  });
});
