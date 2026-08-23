import { describe, expect, it, vi } from "vitest";

vi.mock("./platform", () => ({
  isMobileNativePlatform: vi.fn(),
}));

vi.mock("./postLoginRoute", () => ({
  isDashboardRoute: vi.fn((pathname: string) => pathname === "/"),
}));

import { isMobileNativePlatform } from "./platform";
import {
  nativeNotificationPollingAllowed,
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

describe("nativeNotificationPollingAllowed", () => {
  it("allows polling when app is foreground", () => {
    expect(nativeNotificationPollingAllowed({
      nativeAppActive: true,
      serverReachable: false,
      pathname: "/projects",
    })).toBe(true);
  });

  it("allows polling on dashboard when server is reachable despite spurious background", () => {
    expect(nativeNotificationPollingAllowed({
      nativeAppActive: false,
      serverReachable: true,
      pathname: "/",
    })).toBe(true);
  });

  it("blocks polling when background on non-dashboard routes", () => {
    expect(nativeNotificationPollingAllowed({
      nativeAppActive: false,
      serverReachable: true,
      pathname: "/projects",
    })).toBe(false);
  });
});
