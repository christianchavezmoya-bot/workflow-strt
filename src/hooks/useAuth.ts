import { useEffect, useMemo, useState } from "react";
import { authService } from "../services/authService";
import { secureGet, secureSet } from "../services/secureStorage";
import { User } from "../types/user";

const defaultUser: User = {
  id: "",
  email: "",
  fullName: "",
  role: "Viewer",
  office: "",
  isActive: false,
  isFirstLogin: false
};

export const useAuth = () => {
  const [user, setUser] = useState<User>(defaultUser);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [devRoleOverride, setDevRoleOverride] = useState<string | null>(
    () => localStorage.getItem("dev_role_override")
  );

  const effectiveUser = useMemo(
    () => devRoleOverride ? { ...user, role: devRoleOverride as User["role"] } : user,
    [user, devRoleOverride]
  );

  const memoized = useMemo(() => ({ user: effectiveUser, isAuthenticated, authReady }), [effectiveUser, isAuthenticated, authReady]);

  useEffect(() => {
    let cancelled = false;

    const finish = (nextUser: User, authenticated: boolean) => {
      if (cancelled) return;
      setUser(nextUser);
      setIsAuthenticated(authenticated);
      setAuthReady(true);
    };

    const syncFromStorage = async () => {
      const storedBackendUser = secureGet("auth_user");
      const storedLocalUser = secureGet("local_auth_user");
      const token = secureGet("auth_token");

      if (storedBackendUser) {
        try {
          const parsed = JSON.parse(storedBackendUser) as User;
          if (parsed.id) {
            finish(parsed, true);
            return;
          }
        } catch {
          // continue fallback
        }
      }

      if (storedLocalUser) {
        try {
          const parsed = JSON.parse(storedLocalUser) as User;
          if (parsed.id) {
            finish(parsed, true);
            return;
          }
        } catch {
          // continue fallback
        }
      }

      if (token && token !== "local") {
        try {
          const profile = await authService.getProfile();
          if (cancelled) return;
          finish(profile, true);
          await secureSet("auth_user", JSON.stringify(profile));
        } catch {
          finish(defaultUser, false);
        }
        return;
      }

      finish(defaultUser, false);
    };

    void syncFromStorage();

    const onAuthUserUpdated = () => { void syncFromStorage(); };
    const onAuthChange = () => { void syncFromStorage(); };

    const onStorage = (event: StorageEvent) => {
      if (event.key === "auth_user" || event.key === "local_auth_user" || event.key === "auth_token") {
        void syncFromStorage();
      }
    };

    const onDevRoleOverride = (e: Event) => {
      const role = (e as CustomEvent<{ role: string | null }>).detail.role;
      setDevRoleOverride(role);
    };

    window.addEventListener("auth-user-updated", onAuthUserUpdated);
    window.addEventListener("auth-change", onAuthChange);
    window.addEventListener("storage", onStorage);
    window.addEventListener("dev-role-override-changed", onDevRoleOverride);
    return () => {
      cancelled = true;
      window.removeEventListener("auth-user-updated", onAuthUserUpdated);
      window.removeEventListener("auth-change", onAuthChange);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("dev-role-override-changed", onDevRoleOverride);
    };
  }, []);

  return memoized;
};
