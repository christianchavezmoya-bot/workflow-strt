import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDashboardProjectScope } from "./useDashboardProjectScope";

/**
 * Regression coverage for the native Admin dashboard showing 0 projects.
 *
 * useAuth boots as role="Viewer" (defaultUser) and resolves the real user in an
 * effect, so an Admin's first render always has isAdmin=false and the scope state
 * initializes to "mine". The one-shot correction repairs that once the real role
 * lands. It used to be skipped on native (`if (isNativePlatform || ...) return`),
 * which left native Admin/PM filtering the project list by project-manager
 * ownership — 0 projects on the dashboard while the Projects page had data.
 *
 * This hook is platform-independent by construction (it takes no platform input),
 * so these tests hold for web and native alike — that is the fix.
 */

type Props = Parameters<typeof useDashboardProjectScope>[0];

/** First render as useAuth actually boots: unauthenticated Viewer, no id. */
const bootingAsViewer: Props = {
  isAuthenticated: false,
  isAdmin: false,
  canViewAllProjects: false,
  userId: "",
};

const resolvedAdmin: Props = {
  isAuthenticated: true,
  isAdmin: true,
  canViewAllProjects: true,
  userId: "user-admin",
};

describe("useDashboardProjectScope", () => {
  it("corrects Admin to 'all' after auth resolves from the temporary Viewer state", async () => {
    const { result, rerender } = renderHook((props: Props) => useDashboardProjectScope(props), {
      initialProps: bootingAsViewer,
    });

    // The exact state that produced the bug: initializer ran while role was Viewer.
    expect(result.current.dashboardProjectScope).toBe("mine");

    rerender(resolvedAdmin);

    await waitFor(() => {
      expect(result.current.dashboardProjectScope).toBe("all");
    });
  });

  it("keeps Admin on 'all' when the real role is known on the very first render", () => {
    const { result } = renderHook((props: Props) => useDashboardProjectScope(props), {
      initialProps: resolvedAdmin,
    });

    expect(result.current.dashboardProjectScope).toBe("all");
  });

  it("leaves non-admin roles (installer) on 'mine' and never corrects them", async () => {
    const installer: Props = {
      isAuthenticated: true,
      isAdmin: false,
      canViewAllProjects: false,
      userId: "user-installer",
    };

    const { result, rerender } = renderHook((props: Props) => useDashboardProjectScope(props), {
      initialProps: bootingAsViewer,
    });

    rerender(installer);
    rerender(installer);

    expect(result.current.dashboardProjectScope).toBe("mine");
  });

  it("does not correct a manager whose role cannot view all projects", async () => {
    const restrictedManager: Props = {
      isAuthenticated: true,
      isAdmin: true,
      canViewAllProjects: false,
      userId: "user-restricted",
    };

    const { result, rerender } = renderHook((props: Props) => useDashboardProjectScope(props), {
      initialProps: bootingAsViewer,
    });

    rerender(restrictedManager);

    expect(result.current.dashboardProjectScope).toBe("mine");
  });

  it("respects a manual switch back to 'mine' and never re-corrects it", async () => {
    const { result, rerender } = renderHook((props: Props) => useDashboardProjectScope(props), {
      initialProps: bootingAsViewer,
    });

    rerender(resolvedAdmin);
    await waitFor(() => {
      expect(result.current.dashboardProjectScope).toBe("all");
    });

    // User taps "My Projects".
    act(() => {
      result.current.setDashboardProjectScope("mine");
    });
    expect(result.current.dashboardProjectScope).toBe("mine");

    // Re-renders (navigating away and back, prop churn) must not undo the choice.
    rerender(resolvedAdmin);
    rerender(resolvedAdmin);
    rerender(resolvedAdmin);

    expect(result.current.dashboardProjectScope).toBe("mine");
  });

  it("re-arms the one-shot correction when a different user signs in", async () => {
    const { result, rerender } = renderHook((props: Props) => useDashboardProjectScope(props), {
      initialProps: bootingAsViewer,
    });

    rerender(resolvedAdmin);
    await waitFor(() => {
      expect(result.current.dashboardProjectScope).toBe("all");
    });

    act(() => {
      result.current.setDashboardProjectScope("mine");
    });
    expect(result.current.dashboardProjectScope).toBe("mine");

    // Logout → sign in as a different admin: that user gets their own correction.
    rerender(bootingAsViewer);
    rerender({ ...resolvedAdmin, userId: "user-admin-2" });

    await waitFor(() => {
      expect(result.current.dashboardProjectScope).toBe("all");
    });
  });

  it("issues no network requests", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { result, rerender } = renderHook((props: Props) => useDashboardProjectScope(props), {
      initialProps: bootingAsViewer,
    });

    rerender(resolvedAdmin);
    await waitFor(() => {
      expect(result.current.dashboardProjectScope).toBe("all");
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("settles without oscillating once corrected", async () => {
    const { result, rerender } = renderHook((props: Props) => useDashboardProjectScope(props), {
      initialProps: bootingAsViewer,
    });

    rerender(resolvedAdmin);
    await waitFor(() => {
      expect(result.current.dashboardProjectScope).toBe("all");
    });

    // The correction effect depends on dashboardProjectScope, so a stable value
    // here proves it reaches a fixed point rather than re-firing each pass.
    for (let i = 0; i < 5; i++) rerender(resolvedAdmin);
    expect(result.current.dashboardProjectScope).toBe("all");
  });
});
