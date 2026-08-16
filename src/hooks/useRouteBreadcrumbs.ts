import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { recordRouteBreadcrumb } from "../services/faultReporting";

/**
 * Records each screen the user visits so a fault report can answer "how did you get here?"
 * without relying on the user's memory. Must be used inside the router.
 */
export function useRouteBreadcrumbs(): void {
  const location = useLocation();

  useEffect(() => {
    recordRouteBreadcrumb(location.pathname);
  }, [location.pathname]);
}
