import { useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { Box, CircularProgress, Typography } from "@mui/material";
import AppRoutes from "./routes";
import { brandSettingsService } from "../services/brandSettingsService";
import {
  getLaunchAuthModeAsync,
  canEnterAppWithStoredSession,
  requiresOnlineLoginAsync,
  shouldForceLoginNow,
  isOnlineForAuthSync,
  isOfflineGraceValid,
  BiometricCheckResult,
} from "../services/biometricAuth";
import { initSecureStorage, secureGet, secureRemove } from "../services/secureStorage";
import BiometricLockScreen from "../components/BiometricLockScreen";
import Login from "../features/auth/Login";
import { isMobileNativePlatform } from "../utils/platform";
import { isAuthTokenExpired } from "../utils/authToken";
import { useNativeSyncLifecycle } from "../hooks/useNativeSyncLifecycle";
import { useSyncKeepAlive } from "../hooks/useSyncKeepAlive";
import { useRouteBreadcrumbs } from "../hooks/useRouteBreadcrumbs";

// Routes AppRoutes serves without requiring a session — password reset/invite
// links, e-signature links, shared report links, and QR upload links all arrive
// as "cold" opens with no stored token, so they must render through the router
// rather than being short-circuited to the bare Login screen below.
// /mobile-upload is scanned from a phone that has never logged in; its token in
// the query string is the credential, and the API endpoints it calls are
// [AllowAnonymous].
const isPublicDeepLinkPath = (pathname: string) =>
  pathname === "/reset-password"
  || pathname === "/mobile-upload"
  || pathname.startsWith("/sign/")
  || pathname.startsWith("/share/reports/");

const App = () => {
  const location = useLocation();
  const [authState, setAuthState] = useState<BiometricCheckResult | null>(null);
  const [loading, setLoading] = useState(true);
  // Ticks when JWT expiry / connectivity should re-evaluate the render gate.
  const [loginGateTick, setLoginGateTick] = useState(0);

  useNativeSyncLifecycle();
  useSyncKeepAlive();
  useRouteBreadcrumbs();

  const forceLogin = useCallback(() => {
    console.log("[App] Forcing Login — JWT expired while online");
    setAuthState("no-session");
  }, []);

  const applyAuthMode = useCallback((mode: BiometricCheckResult) => {
    console.log("[App] Auth mode:", mode);
    setAuthState(mode);
  }, []);

  const refreshAuthState = useCallback(async () => {
    const justAuth = secureGet("just_authenticated");
    if (justAuth === "true") {
      console.log("[App] User just authenticated, skipping biometric screen");
      secureRemove("just_authenticated");
      setAuthState("session-unlocked");
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

  useEffect(() => {
    const handleStorageChange = () => {
      console.log("[App] Storage change detected, refreshing auth state");
      void refreshAuthState();
    };

    const handleAuthError = () => {
      if (isMobileNativePlatform() && !isOnlineForAuthSync() && isOfflineGraceValid()) {
        console.log("[App] Auth error while offline within grace — keeping cached session");
        return;
      }
      console.log("[App] Auth error — switching to Login");
      forceLogin();
      // Do not call refreshAuthState here — it can revert to biometric-needed when
      // Capacitor Network briefly reports offline, leaving a zombie dashboard.
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("auth-change", handleStorageChange);
    window.addEventListener("api-auth-error", handleAuthError);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("auth-change", handleStorageChange);
      window.removeEventListener("api-auth-error", handleAuthError);
    };
  }, [refreshAuthState, forceLogin]);

  useEffect(() => {
    brandSettingsService.get().then((s) => {
      if (s.appName) document.title = s.appName;
    }).catch(() => {});

    const init = async () => {
      try {
        console.log("[App] Initializing secure storage...");
        await initSecureStorage();
        console.log("[App] Secure storage initialized");

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

  // Enforce Login when JWT expires while the device is online (every 5s + on reachability).
  // Pauses while the app is backgrounded — no need to force login until user returns.
  useEffect(() => {
    if (!isMobileNativePlatform()) return;
    if (authState !== "session-unlocked") return;

    let interval: number | undefined;

    const check = () => {
      if (shouldForceLoginNow()) forceLogin();
      else setLoginGateTick((t) => t + 1);
    };

    const startInterval = () => {
      if (interval !== undefined) return;
      check();
      interval = window.setInterval(() => {
        void requiresOnlineLoginAsync().then((needed) => {
          if (needed) forceLogin();
          else setLoginGateTick((t) => t + 1);
        });
      }, 5_000);
    };

    const stopInterval = () => {
      if (interval !== undefined) {
        window.clearInterval(interval);
        interval = undefined;
      }
    };

    startInterval();

    const onReachable = () => {
      void requiresOnlineLoginAsync().then((needed) => {
        if (needed) forceLogin();
      });
    };

    const onForeground = () => {
      startInterval();
      const token = secureGet("auth_token");
      if (!token || !isAuthTokenExpired(token)) return;
      void requiresOnlineLoginAsync().then((needed) => {
        if (needed) forceLogin();
        else void refreshAuthState();
      });
    };

    const onBackground = () => {
      stopInterval();
    };

    window.addEventListener("api-server-reachable", onReachable);
    window.addEventListener("offline-mode-online", onReachable);
    window.addEventListener("app-foregrounded", onForeground);
    window.addEventListener("app-backgrounded", onBackground);

    return () => {
      stopInterval();
      window.removeEventListener("api-server-reachable", onReachable);
      window.removeEventListener("offline-mode-online", onReachable);
      window.removeEventListener("app-foregrounded", onForeground);
      window.removeEventListener("app-backgrounded", onBackground);
    };
  }, [authState, forceLogin, refreshAuthState]);

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

  // Sync render gate — catches expiry between interval ticks (e.g. right after 401).
  void loginGateTick;
  if (
    authState === "no-session"
    || authState === "grace-expired"
    || (isMobileNativePlatform() && authState === null)
    || shouldForceLoginNow()
  ) {
    // Reset-password/invite, e-signature, and shared-report links must open their
    // own page even with no session — otherwise every cold-opened link lands on
    // the plain Login screen instead of the page the link actually points to.
    if (isPublicDeepLinkPath(location.pathname)) {
      return <AppRoutes />;
    }
    return <Login />;
  }

  if (authState === "session-unlocked" || authState === "not-native") {
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

  return <AppRoutes />;
};

export default App;
