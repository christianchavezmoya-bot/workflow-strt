import { useEffect, useState, useCallback, useRef } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import { App as CapApp } from "@capacitor/app";
import AppRoutes from "./routes";
import { brandSettingsService } from "../services/brandSettingsService";
import {
  getLaunchAuthModeAsync,
  canEnterAppWithStoredSession,
  BiometricCheckResult,
} from "../services/biometricAuth";
import { initSecureStorage, secureGet, secureRemove } from "../services/secureStorage";
import BiometricLockScreen from "../components/BiometricLockScreen";
import Login from "../features/auth/Login";
import { isMobileNativePlatform } from "../utils/platform";
import { isAuthTokenExpired } from "../utils/authToken";

const App = () => {
  const [authState, setAuthState] = useState<BiometricCheckResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [justAuthenticated, setJustAuthenticated] = useState(false);
  const justAuthenticatedRef = useRef(false);
  justAuthenticatedRef.current = justAuthenticated;

  const applyAuthMode = useCallback((mode: BiometricCheckResult) => {
    console.log("[App] Auth mode:", mode);
    setAuthState(mode);
    if (mode === "session-unlocked" || mode === "not-native") {
      setJustAuthenticated(false);
    }
  }, []);

  // Function to re-check auth state (called after login success)
  const refreshAuthState = useCallback(async () => {
    const justAuth = secureGet("just_authenticated");
    if (justAuth === "true") {
      console.log("[App] User just authenticated, skipping biometric screen");
      setJustAuthenticated(true);
      setAuthState("session-unlocked");
      secureRemove("just_authenticated");
      return;
    }

    const mode = await getLaunchAuthModeAsync();
    console.log("[App] Refreshed auth mode:", mode);
    applyAuthMode(mode);
  }, [applyAuthMode]);

  const handleBiometricUnlocked = useCallback(async () => {
    const allowed = await canEnterAppWithStoredSession();
    if (!allowed) {
      console.log("[App] Biometric unlock rejected — session invalid, showing Login");
      applyAuthMode("no-session");
      return;
    }
    applyAuthMode("session-unlocked");
  }, [applyAuthMode]);

  // Listen for storage changes (login success from Login component)
  useEffect(() => {
    const handleStorageChange = () => {
      console.log("[App] Storage change detected, refreshing auth state");
      void refreshAuthState();
    };

    const handleAuthError = () => {
      console.log("[App] Auth error — switching to login/biometric gate");
      setJustAuthenticated(false);
      void refreshAuthState();
    };
    
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("auth-change", handleStorageChange);
    window.addEventListener("api-auth-error", handleAuthError);
    
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("auth-change", handleStorageChange);
      window.removeEventListener("api-auth-error", handleAuthError);
    };
  }, [refreshAuthState]);

  useEffect(() => {
    brandSettingsService.get().then((s) => {
      if (s.appName) document.title = s.appName;
    }).catch(() => {});

    const init = async () => {
      try {
        console.log("[App] Initializing secure storage...");
        await initSecureStorage();
        console.log("[App] Secure storage initialized");

        const token = secureGet("auth_token");
        const user = secureGet("auth_user");
        const lastLogin = secureGet("last_online_login");
        console.log("[App] Storage contents:", {
          hasToken: !!token,
          hasUser: !!user,
          lastLogin: lastLogin ? new Date(parseInt(lastLogin, 10)).toISOString() : null,
        });

        const mode = await getLaunchAuthModeAsync();
        applyAuthMode(mode);
      } catch (error) {
        console.error("[App] Auth init error:", error);
        applyAuthMode("no-session");
      } finally {
        setLoading(false);
      }
    };
    
    void init();
  }, [applyAuthMode]);

  // Re-check auth when native app returns to foreground (JWT may have expired while backgrounded).
  useEffect(() => {
    if (!isMobileNativePlatform()) return;
    let handle: { remove: () => void } | undefined;
    void CapApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive || justAuthenticatedRef.current) return;
      const token = secureGet("auth_token");
      if (!token || !isAuthTokenExpired(token)) return;
      void refreshAuthState();
    }).then((listener) => {
      handle = listener;
    });
    return () => {
      handle?.remove();
    };
  }, [refreshAuthState]);

  // Periodic JWT expiry check while app is in use (online, native).
  useEffect(() => {
    if (!isMobileNativePlatform()) return;
    const interval = window.setInterval(() => {
      if (justAuthenticatedRef.current) return;
      const token = secureGet("auth_token");
      if (!token || !isAuthTokenExpired(token)) return;
      void refreshAuthState();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [refreshAuthState]);

  if (loading) {
    return (
      <Box sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
        gap: 2,
      }}>
        <CircularProgress />
        <Typography variant="body2" color="text.secondary">Loading...</Typography>
      </Box>
    );
  }

  // Fresh login — skip biometric gate
  if (justAuthenticated || authState === "session-unlocked") {
    return <AppRoutes />;
  }

  if (authState === "biometric-needed" || authState === "pin-needed") {
    return (
      <BiometricLockScreen
        onUnlocked={() => { void handleBiometricUnlocked(); }}
        authMode={authState}
      />
    );
  }

  // No session, grace expired, or unresolved init — always show Login on native
  if (
    authState === "no-session"
    || authState === "grace-expired"
    || (isMobileNativePlatform() && authState === null)
  ) {
    return <Login />;
  }

  // Web browser — no biometric gate
  return <AppRoutes />;
};

export default App;
