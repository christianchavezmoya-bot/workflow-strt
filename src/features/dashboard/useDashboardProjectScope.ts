import { useEffect, useRef, useState } from "react";
import type { DashboardProjectScope } from "./DashboardProjectStatusGrid";

export type UseDashboardProjectScopeParams = {
  isAuthenticated: boolean;
  isAdmin: boolean;
  canViewAllProjects: boolean;
  userId: string;
};

/**
 * Owns the Dashboard's "My Projects" / "All Projects" scope.
 *
 * useAuth boots as role="Viewer" (defaultUser) and resolves the real user in an
 * effect, so the useState initializer below always runs with isAdmin=false —
 * Admin would otherwise be stuck on "mine" for the whole session, filtering the
 * project list down to projects the Admin personally manages. The one-shot
 * correction repairs that once the real role lands.
 *
 * Platform-independent by design: this correction was originally web-only, which
 * left native Admin/PM dashboards showing 0 projects while the Projects page had
 * data. The one-shot ref keeps a later manual switch to "mine" from being undone.
 */
export function useDashboardProjectScope({
  isAuthenticated,
  isAdmin,
  canViewAllProjects,
  userId,
}: UseDashboardProjectScopeParams) {
  // Admin defaults to "all" (oversight view); every other role defaults to "mine".
  const [dashboardProjectScope, setDashboardProjectScope] = useState<DashboardProjectScope>(
    isAdmin ? "all" : "mine",
  );
  const dashboardProjectScopeCorrected = useRef(false);

  // A different signed-in user gets their own one-shot correction.
  useEffect(() => {
    dashboardProjectScopeCorrected.current = false;
  }, [userId]);

  useEffect(() => {
    if (!isAuthenticated || !isAdmin || !canViewAllProjects) return;
    if (dashboardProjectScopeCorrected.current) return;
    if (dashboardProjectScope === "all") {
      dashboardProjectScopeCorrected.current = true;
      return;
    }
    setDashboardProjectScope("all");
    dashboardProjectScopeCorrected.current = true;
  }, [canViewAllProjects, dashboardProjectScope, isAdmin, isAuthenticated]);

  return {
    dashboardProjectScope,
    setDashboardProjectScope,
    dashboardProjectScopeCorrected,
  };
}
