import { useEffect, useMemo, useState } from "react";
import { authService } from "../services/authService";
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
    const storedBackendUser = localStorage.getItem("auth_user");
    const storedLocalUser = localStorage.getItem("local_auth_user");
    const token = localStorage.getItem("auth_token");

    if (storedBackendUser) {
      try {
        const parsed = JSON.parse(storedBackendUser) as User;
        setUser(parsed);
        setIsAuthenticated(true);
        return;
      } catch {
        // continue fallback
      }
    }

    if (storedLocalUser) {
      try {
        const parsed = JSON.parse(storedLocalUser) as User;
        setUser(parsed);
        setIsAuthenticated(true);
        return;
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
          localStorage.setItem("auth_user", JSON.stringify(profile));
        })
        .catch(() => {
          setUser(defaultUser);
          setIsAuthenticated(false);
        });
      return;
    }

    const storedRole = localStorage.getItem("mock_role");
    const storedOffice = localStorage.getItem("mock_office");
    setUser({
      ...defaultUser,
      role: (storedRole as User["role"]) || defaultUser.role,
      office: (storedOffice as User["office"]) || defaultUser.office
    });
    setIsAuthenticated(true);
  }, []);

  return memoized;
};
