import { useEffect, useMemo, useState } from "react";
import { authService } from "../services/authService";
import { secureGet, secureSet } from "../services/secureStorage";
import { User } from "../types/user";

const defaultUser: User = {
  id: "u-100",
  email: "chris.chavez@commtrac.io",
  fullName: "Chris Chavez",
  role: "Project Manager",
  office: "USA",
  isActive: true,
  isFirstLogin: false
};

export const useAuth = () => {
  const [user, setUser] = useState<User>(defaultUser);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const memoized = useMemo(() => ({ user, isAuthenticated }), [user, isAuthenticated]);

  useEffect(() => {
    const syncFromStorage = () => {
      const storedBackendUser = secureGet("auth_user");
      const storedLocalUser = secureGet("local_auth_user");
      const token = secureGet("auth_token");
      const path = window.location.pathname;
      const isPublicRoute =
        path === "/login" ||
        path === "/reset-password" ||
        path.startsWith("/sign/") ||
        path === "/mobile-upload";

      if (token && token !== "local") {
        authService
          .getProfile()
          .then((profile) => {
            setUser(profile);
            setIsAuthenticated(!isPublicRoute);
            secureSet("auth_user", JSON.stringify(profile));
          })
          .catch(() => {
            setUser(defaultUser);
            setIsAuthenticated(false);
            localStorage.removeItem("auth_token");
            localStorage.removeItem("auth_user");
          });
        return true;
      }

      setUser(defaultUser);
      setIsAuthenticated(false);
      return true;
    };

    syncFromStorage();

    const onAuthUserUpdated = () => {
      syncFromStorage();
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === "auth_user" || event.key === "auth_token") {
        syncFromStorage();
      }
    };

    window.addEventListener("auth-user-updated", onAuthUserUpdated);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("auth-user-updated", onAuthUserUpdated);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return memoized;
};
