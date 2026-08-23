import { describe, expect, it, vi } from "vitest";

vi.mock("./platform", () => ({
  isMobileNativePlatform: vi.fn(),
}));

import { isMobileNativePlatform } from "./platform";
import {
  nativeBellShouldPoll,
  notificationPollingUsesVisibilityChange,
} from "./notificationInboxPolling";

describe("notificationPollingUsesVisibilityChange", () => {
  it("returns true on web (desktop browser)", () => {
    vi.mocked(isMobileNativePlatform).mockReturnValue(false);
    expect(notificationPollingUsesVisibilityChange()).toBe(true);
  });

  it("returns false on native Capacitor (use appStateChange instead)", () => {
    vi.mocked(isMobileNativePlatform).mockReturnValue(true);
    expect(notificationPollingUsesVisibilityChange()).toBe(false);
  });
});

describe("nativeBellShouldPoll", () => {
  it("polls when device is online", () => {
    expect(nativeBellShouldPoll(true)).toBe(true);
  });

  it("does not poll when device is offline", () => {
    expect(nativeBellShouldPoll(false)).toBe(false);
  });
});
