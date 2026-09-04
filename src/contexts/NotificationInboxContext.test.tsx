import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { NotificationInboxProvider } from "./NotificationInboxContext";
import { notificationService } from "../services/notificationService";
import type { AppNotification } from "../types/notification";

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "tech@example.com", fullName: "Test Tech", role: "Installer", office: "", isActive: true, isFirstLogin: false },
    isAuthenticated: true,
    authReady: true,
  }),
}));

vi.mock("../services/connectivityMonitor", () => ({
  shouldSkipBlockingFetch: () => false,
}));

vi.mock("../services/notificationService", () => ({
  notificationService: {
    list: vi.fn(),
    acknowledge: vi.fn(),
  },
}));

const listMock = vi.mocked(notificationService.list);

function emptyNotifications(): AppNotification[] {
  return [];
}

describe("NotificationInboxProvider — api-server-reachable loop regression", () => {
  beforeEach(() => {
    listMock.mockReset();
    listMock.mockResolvedValue(emptyNotifications());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it(
    "does not re-fetch when api-server-reachable fires without a prior failure " +
    "— regression for the self-sustaining loop where every successful axios response " +
    "(including this component's own GET) re-dispatched api-server-reachable, which was " +
    "handled unconditionally and triggered another GET, forever",
    async () => {
      render(
        <MemoryRouter initialEntries={["/projects"]}>
          <NotificationInboxProvider>
            <div>child</div>
          </NotificationInboxProvider>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(listMock).toHaveBeenCalledTimes(1);
      });

      // api-server-reachable fires on EVERY successful axios response in the real app,
      // not just on genuine reconnects. Firing it repeatedly here with no prior failure
      // must not cause additional fetches.
      window.dispatchEvent(new Event("api-server-reachable"));
      window.dispatchEvent(new Event("api-server-reachable"));
      window.dispatchEvent(new Event("api-server-reachable"));

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(listMock).toHaveBeenCalledTimes(1);
    },
  );

  it("does refresh on api-server-reachable after a genuine prior failure (legitimate reconnect)", async () => {
    listMock.mockRejectedValueOnce(new Error("network error"));

    render(
      <MemoryRouter initialEntries={["/projects"]}>
        <NotificationInboxProvider>
          <div>child</div>
        </NotificationInboxProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(1);
    });

    listMock.mockResolvedValue(emptyNotifications());
    window.dispatchEvent(new Event("api-server-reachable"));

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(2);
    });
  });
});
