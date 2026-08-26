import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./platform", () => ({
  isMobileNativePlatform: vi.fn(() => true),
}));

import { isMobileNativePlatform } from "./platform";
import {
  isFirstLoginQuietPending,
  markFirstLoginQuietPending,
  resetPostLoginQuietWindowForTests,
  waitForFirstLoginQuiet,
} from "./postLoginQuietWindow";

describe("postLoginQuietWindow", () => {
  beforeEach(() => {
    resetPostLoginQuietWindowForTests();
    vi.mocked(isMobileNativePlatform).mockReturnValue(true);
  });

  it("is idle by default", () => {
    expect(isFirstLoginQuietPending()).toBe(false);
    return expect(waitForFirstLoginQuiet()).resolves.toBeUndefined();
  });

  it("waits until bootstrap:complete clears the quiet window", async () => {
    vi.useFakeTimers();
    markFirstLoginQuietPending();
    expect(isFirstLoginQuietPending()).toBe(true);

    const pending = waitForFirstLoginQuiet(30_000);
    window.dispatchEvent(new Event("bootstrap:complete"));
    await expect(pending).resolves.toBeUndefined();
    expect(isFirstLoginQuietPending()).toBe(false);
    vi.useRealTimers();
  });

  it("times out when bootstrap never completes", async () => {
    vi.useFakeTimers();
    markFirstLoginQuietPending();

    const pending = waitForFirstLoginQuiet(5_000);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(pending).resolves.toBeUndefined();
    expect(isFirstLoginQuietPending()).toBe(false);
    vi.useRealTimers();
  });

  it("no-ops on web", async () => {
    vi.mocked(isMobileNativePlatform).mockReturnValue(false);
    markFirstLoginQuietPending();
    expect(isFirstLoginQuietPending()).toBe(false);
    await expect(waitForFirstLoginQuiet()).resolves.toBeUndefined();
  });
});
