import { useEffect, useState, useCallback } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import AppRoutes from "./routes";
import { brandSettingsService } from "../services/brandSettingsService";
import { getLaunchAuthMode, BiometricCheckResult } from "../services/biometricAuth";
import { initSecureStorage, secureGet, secureRemove } from "../services/secureStorage";
import BiometricLockScreen from "../components/BiometricLockScreen";
import Login from "../features/auth/Login";

const App = () => {
  const [authState, setAuthState] = useState<BiometricCheckResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [justAuthenticated, setJustAuthenticated] = useState(false);

  // Function to re-check auth state (called after login success)
  const refreshAuthState = useCallback(() => {
    // Check if user just authenticated (skip biometric screen)
    const justAuth = secureGet("just_authenticated");
    if (justAuth === "true") {
      console.log("[App] User just authenticated, skipping biometric screen");
      setJustAuthenticated(true);
      // Clear the flag so it doesn't persist
      secureRemove("just_authenticated");
      return;
    }
    
    const mode = getLaunchAuthMode();
    console.log("[App] Refreshed auth mode:", mode);
    setAuthState(mode);
  }, []);

  // Listen for storage changes (login success from Login component)
  useEffect(() => {
    const handleStorageChange = () => {
      console.log("[App] Storage change detected, refreshing auth state");
      refreshAuthState();
    };
    
    window.addEventListener("storage", handleStorageChange);
    // Also listen for custom event from Login component
    window.addEventListener("auth-change", handleStorageChange);
    
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("auth-change", handleStorageChange);
    };
  }, [refreshAuthState]);

  useEffect(() => {
    brandSettingsService.get().then((s) => {
      if (s.appName) document.title = s.appName;
    }).catch(() => {});

    // Initialize secure storage first, then determine auth mode
    const init = async () => {
      try {
        // Initialize secure storage (load from Keychain into memory)
        console.log("[App] Initializing secure storage...");
        await initSecureStorage();
        console.log("[App] Secure storage initialized");
        
        // Debug: Check what we have in storage
        const token = secureGet("auth_token");
        const user = secureGet("auth_user");
        const lastLogin = secureGet("last_online_login");
        console.log("[App] Storage contents:", { 
          hasToken: !!token, 
          hasUser: !!user, 
          lastLogin: lastLogin ? new Date(parseInt(lastLogin)).toISOString() : null 
        });
        
        const mode = getLaunchAuthMode();
        console.log("[App] Auth mode:", mode);
        setAuthState(mode);
      } catch (error) {
        console.error("[App] Auth init error:", error);
        // Still try to check auth mode - cache might have data
        const mode = getLaunchAuthMode();
        console.log("[App] Fallback auth mode:", mode);
        setAuthState(mode);
      } finally {
        setLoading(false);
      }
    };
    
    init();
  }, []);

  // Still loading - show loading indicator
  if (loading) {
    return (
      <Box sx={{ 
        minHeight: "100vh", 
        display: "flex", 
        flexDirection: "column",
        alignItems: "center", 
        justifyContent: "center",
        bgcolor: "background.default",
        gap: 2
      }}>
        <CircularProgress />
        <Typography variant="body2" color="text.secondary">Loading...</Typography>
      </Box>
    );
  }

  // Show error state
  if (initError) {
    console.log("[App] Init error, showing login");
  }

  // If user just authenticated, skip biometric and go straight to app
  if (justAuthenticated) {
    console.log("[App] Just authenticated, showing app routes");
    return <AppRoutes />;
  }

  // Show biometric/PIN lock screen if needed
  if (authState === "biometric-needed" || authState === "pin-needed") {
    return <BiometricLockScreen onUnlocked={() => setAuthState("not-native")} authMode={authState} />;
  }

  // No session or grace expired - show login
  if (authState === "no-session" || authState === "grace-expired") {
    return <Login />;
  }

  // "not-native" (web) or other states - show normal app routes
  return <AppRoutes />;
};

export default App;
