import { describe, expect, it, vi } from "vitest";

vi.mock("./platform", () => ({
  isMobileNativePlatform: vi.fn(),
}));

import { isMobileNativePlatform } from "./platform";
import { notificationPollingUsesVisibilityChange } from "./notificationInboxPolling";

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
