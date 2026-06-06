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
  const [devRoleOverride, setDevRoleOverride] = useState<string | null>(
    () => localStorage.getItem("dev_role_override")
  );

  const effectiveUser = useMemo(
    () => devRoleOverride ? { ...user, role: devRoleOverride as User["role"] } : user,
    [user, devRoleOverride]
  );

  const memoized = useMemo(() => ({ user: effectiveUser, isAuthenticated }), [effectiveUser, isAuthenticated]);

  useEffect(() => {
    const syncFromStorage = () => {
      const storedBackendUser = secureGet("auth_user");
      const storedLocalUser = secureGet("local_auth_user");
      const token = secureGet("auth_token");

      if (storedBackendUser) {
        try {
          const parsed = JSON.parse(storedBackendUser) as User;
          setUser(parsed);
          setIsAuthenticated(true);
          return true;
        } catch {
          // continue fallback
        }
      }

      if (storedLocalUser) {
        try {
          const parsed = JSON.parse(storedLocalUser) as User;
          setUser(parsed);
          setIsAuthenticated(true);
          return true;
        } catch {
          // continue fallback
        }
      }

      if (token && token !== "local") {
        authService
          .getProfile()
          .then((profile) => {
            setUser(profile);
            setIsAuthenticated(true);
            secureSet("auth_user", JSON.stringify(profile));
          })
          .catch(() => {
            setUser(defaultUser);
            setIsAuthenticated(false);
          });
        return true;
      }

      // Without a persisted session, stay logged out instead of booting into
      // the old demo Project Manager identity (`u-100`).
      setUser(defaultUser);
      setIsAuthenticated(false);
      return true;
    };

    syncFromStorage();

    const onAuthUserUpdated = () => {
      syncFromStorage();
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === "auth_user" || event.key === "local_auth_user" || event.key === "auth_token") {
        syncFromStorage();
      }
    };

    const onDevRoleOverride = (e: Event) => {
      const role = (e as CustomEvent<{ role: string | null }>).detail.role;
      setDevRoleOverride(role);
    };

    window.addEventListener("auth-user-updated", onAuthUserUpdated);
    window.addEventListener("storage", onStorage);
    window.addEventListener("dev-role-override-changed", onDevRoleOverride);
    return () => {
      window.removeEventListener("auth-user-updated", onAuthUserUpdated);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("dev-role-override-changed", onDevRoleOverride);
    };
  }, []);

  return memoized;
};
