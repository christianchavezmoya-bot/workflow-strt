import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./useAuth";

const OFFICE_VIEW_ROLES = ["Project Manager", "Engineer", "Installer", "Supervisor"];
const SESSION_KEY = "work_scope";

export type WorkScope = "my-work" | "office";

export const useWorkScope = () => {
  const { user } = useAuth();
  const [workScope, setWorkScopeState] = useState<WorkScope>(
    () => (sessionStorage.getItem(SESSION_KEY) as WorkScope) ?? "my-work"
  );

  // Listen for cross-component scope changes
  useEffect(() => {
    const handler = () => {
      setWorkScopeState((sessionStorage.getItem(SESSION_KEY) as WorkScope) ?? "my-work");
    };
    window.addEventListener("work-scope-changed", handler);
    return () => window.removeEventListener("work-scope-changed", handler);
  }, []);

  const canUseOfficeView = OFFICE_VIEW_ROLES.includes(user?.role ?? "");

  const setWorkScope = useCallback((scope: WorkScope) => {
    sessionStorage.setItem(SESSION_KEY, scope);
    setWorkScopeState(scope);
    window.dispatchEvent(new Event("work-scope-changed"));
  }, []);

  return {
    workScope,
    setWorkScope,
    canUseOfficeView,
    isMyWork: workScope === "my-work",
    isOfficeView: workScope === "office",
  };
};
