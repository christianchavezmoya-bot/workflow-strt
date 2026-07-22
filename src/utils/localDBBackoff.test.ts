import { describe, expect, it } from "vitest";
import { calcNextRetryAt } from "../services/localDB";

describe("calcNextRetryAt", () => {
  it("returns a future ISO timestamp with extended backoff steps", () => {
    const now = Date.now();
    const next = new Date(calcNextRetryAt(0)).getTime();
    expect(next).toBeGreaterThan(now + 4_000);
    expect(next).toBeLessThan(now + 6_500);
  });

  it("uses longer delays for higher retry counts", () => {
    const low = new Date(calcNextRetryAt(0)).getTime();
    const high = new Date(calcNextRetryAt(6)).getTime();
    expect(high - Date.now()).toBeGreaterThan(low - Date.now());
  });
});
