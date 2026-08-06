import { describe, expect, it, vi, beforeEach } from "vitest";
import { pendingActiveUploadCount } from "./bootstrapUploadGate";

vi.mock("./localDB", () => ({
  pendingGetAll: vi.fn(),
}));

vi.mock("../utils/syncFlushLock", () => ({
  isSyncFlushing: vi.fn(() => false),
}));

import { pendingGetAll } from "./localDB";

describe("pendingActiveUploadCount", () => {
  beforeEach(() => {
    vi.mocked(pendingGetAll).mockReset();
  });

  it("excludes conflict-flagged ops from the active upload count", async () => {
    vi.mocked(pendingGetAll).mockResolvedValue([
      { id: "1", conflictDetected: true } as never,
      { id: "2", conflictDetected: false } as never,
    ]);
    expect(await pendingActiveUploadCount()).toBe(1);
  });
});
