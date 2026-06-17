import { useState, useEffect } from "react";
import { Box, Button, CircularProgress, Stack, Typography, TextField, Divider, Alert } from "@mui/material";
import { FingerprintOutlined, WifiOffOutlined, LockOutlined, PinOutlined, WifiOutlined } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { Network } from "@capacitor/network";
import { promptBiometric, verifyPin, isBiometricAvailable, isPinSet } from "../services/biometricAuth";
import { secureGet, secureClearAuth } from "../services/secureStorage";
import { isMobileNativePlatform } from "../utils/platform";

interface Props {
  onUnlocked: () => void;
  authMode?: "biometric-needed" | "pin-needed";
}

const BiometricLockScreen = ({ onUnlocked, authMode: initialAuthMode }: Props) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"biometric" | "pin">(() => 
    initialAuthMode === "pin-needed" ? "pin" : "biometric"
  );
  const [pin, setPin] = useState("");
  const [pinAttempts, setPinAttempts] = useState(0);
  const [biometricAvailable, setBiometricAvailable] = useState(true);
  const [hasPin, setHasPin] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  // Check biometric availability and PIN status on mount
  useEffect(() => {
    const checkAuthOptions = async () => {
      const available = await isBiometricAvailable();
      const pinSet = isPinSet();
      setBiometricAvailable(available);
      setHasPin(pinSet);
      
      // Determine best auth mode
      if (initialAuthMode === "pin-needed" || (!available && pinSet)) {
        setAuthMode("pin");
      } else if (!available && !pinSet) {
        // No biometric and no PIN - user needs to set up or login online
        setError("No unlock method available. Please sign in online.");
      }
    };
    
    checkAuthOptions();
    
    // Check network status using Capacitor Network plugin
    const checkNetwork = async () => {
      try {
        if (isMobileNativePlatform()) {
          const status = await Network.getStatus();
          setIsOffline(!status.connected);
          console.log("[BiometricLockScreen] Network status:", status.connected ? "online" : "offline");
        } else {
          setIsOffline(!navigator.onLine);
        }
      } catch (e) {
        console.warn("[BiometricLockScreen] Network check failed");
        setIsOffline(!navigator.onLine);
      }
    };
    
    checkNetwork();
    
    // Listen for network changes
    const handleNetworkChange = (status: { connected: boolean }) => {
      console.log("[BiometricLockScreen] Network changed:", status.connected ? "online" : "offline");
      setIsOffline(!status.connected);
    };
    
    let listener: { remove: () => void } | undefined;
    
    if (isMobileNativePlatform()) {
      Network.addListener("networkStatusChange", handleNetworkChange).then(l => {
        listener = l;
      });
    } else {
      const handleOnline = () => setIsOffline(false);
      const handleOffline = () => setIsOffline(true);
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }
    
    return () => {
      if (listener) listener.remove();
    };
  }, [initialAuthMode]);

  const storedUser = secureGet("auth_user");
  const noLocalUnlockMethod = !biometricAvailable && !hasPin;
  const userName = (() => {
    try { return storedUser ? (JSON.parse(storedUser) as { fullName?: string }).fullName : null; }
    catch { return null; }
  })();

  const lastLoginTs = secureGet("last_online_login");
  const lastLoginLabel = lastLoginTs
    ? new Date(parseInt(lastLoginTs, 10)).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;

  const handleBiometricUnlock = async () => {
    setLoading(true);
    setError(null);
    try {
      await promptBiometric("Unlock to continue");
      onUnlocked();
    } catch {
      setError("Face ID failed or was cancelled. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handlePinUnlock = async () => {
    if (pin.length < 4) {
      setError("PIN must be at least 4 digits.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const valid = await verifyPin(pin);
      if (valid) {
        onUnlocked();
      } else {
        setPinAttempts(prev => prev + 1);
        if (pinAttempts >= 4) {
          setError("Too many failed attempts. Please sign in online.");
          setTimeout(() => handleSignOut(), 2000);
        } else {
          setError(`Incorrect PIN. ${5 - pinAttempts - 1} attempts remaining.`);
          setPin("");
        }
      }
    } catch {
      setError("PIN verification failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await secureClearAuth();
    navigate("/login", { replace: true });
  };

  return (
    <Box sx={{
      minHeight: "100dvh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      bgcolor: "background.default",
      px: 3,
    }}>
      <Stack spacing={4} alignItems="center" sx={{ maxWidth: 340, width: "100%" }}>

        {/* Online/Offline indicator */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{
          px: 2, py: 0.75, borderRadius: 999,
          bgcolor: isOffline ? "rgba(255,152,0,0.12)" : "rgba(76,175,80,0.12)",
          border: isOffline ? "1px solid rgba(255,152,0,0.35)" : "1px solid rgba(76,175,80,0.35)",
        }}>
          {isOffline ? (
            <>
              <WifiOffOutlined sx={{ fontSize: 15, color: "warning.main" }} />
              <Typography variant="caption" color="warning.main">Offline mode</Typography>
            </>
          ) : (
            <>
              <WifiOutlined sx={{ fontSize: 15, color: "success.main" }} />
              <Typography variant="caption" color="success.main">Online</Typography>
            </>
          )}
        </Stack>

        {/* Icon - Face ID or PIN */}
        <Box sx={{
          width: 88, height: 88, borderRadius: "50%",
          bgcolor: "rgba(45,212,191,0.12)",
          border: "2px solid rgba(45,212,191,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {authMode === "biometric" ? (
            <FingerprintOutlined sx={{ fontSize: 44, color: "primary.main" }} />
          ) : (
            <LockOutlined sx={{ fontSize: 44, color: "primary.main" }} />
          )}
        </Box>

        {/* Welcome back */}
        <Stack spacing={0.5} alignItems="center">
          <Typography variant="h6" fontWeight={700} sx={{ fontFamily: "Sora" }}>
            {userName ? `Welcome back, ${userName.split(" ")[0]}` : "Welcome back"}
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            {noLocalUnlockMethod
              ? "This device no longer has a local unlock method. Sign in online to continue."
              : authMode === "biometric" 
              ? isOffline 
                ? "You're offline. Use Face ID to unlock with your saved session."
                : "Use Face ID to unlock the app."
              : "Enter your PIN to unlock the app."}
          </Typography>
          {lastLoginLabel && (
            <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5 }}>
              Last online: {lastLoginLabel}
            </Typography>
          )}
        </Stack>

        {/* Error */}
        {error && (
          <Alert severity="error" sx={{ width: "100%" }}>
            {error}
          </Alert>
        )}

        {/* Biometric unlock */}
        {authMode === "biometric" && !noLocalUnlockMethod && (
          <>
            <Button
              variant="contained"
              size="large"
              fullWidth
              disabled={loading}
              onClick={handleBiometricUnlock}
              startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <FingerprintOutlined />}
              sx={{ borderRadius: 2, py: 1.5, fontWeight: 700 }}
            >
              {loading ? "Verifying…" : "Unlock with Face ID"}
            </Button>
            
            {/* PIN fallback option - show if PIN is set up */}
            {hasPin && (
              <Button
                variant="text"
                size="small"
                onClick={() => setAuthMode("pin")}
                sx={{ color: "text.secondary", fontSize: "0.8rem" }}
              >
                Use PIN instead
              </Button>
            )}
            
            {/* No PIN set up message */}
          </>
        )}

        {/* PIN unlock */}
        {authMode === "pin" && (
          <>
            <TextField
              label="Enter PIN"
              type="password"
              fullWidth
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputProps={{ maxLength: 6, inputMode: "numeric", style: { textAlign: "center", letterSpacing: "0.5em" } }}
              onKeyDown={(e) => { if (e.key === "Enter" && pin.length >= 4) handlePinUnlock(); }}
              autoFocus
              size="medium"
              placeholder="••••••"
            />
            
            <Button
              variant="contained"
              size="large"
              fullWidth
              disabled={loading || pin.length < 4}
              onClick={handlePinUnlock}
              startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <PinOutlined />}
              sx={{ borderRadius: 2, py: 1.5, fontWeight: 700 }}
            >
              {loading ? "Verifying…" : "Unlock with PIN"}
            </Button>
            
            {/* Back to biometric option */}
            {biometricAvailable && (
              <Button
                variant="text"
                size="small"
                onClick={() => setAuthMode("biometric")}
                sx={{ color: "text.secondary", fontSize: "0.8rem" }}
              >
                Use Face ID instead
              </Button>
            )}
          </>
        )}

        {noLocalUnlockMethod && (
          <Button
            variant="contained"
            size="large"
            fullWidth
            onClick={handleSignOut}
            sx={{ borderRadius: 2, py: 1.5, fontWeight: 700 }}
          >
            Sign out and sign in online
          </Button>
        )}

        <Divider sx={{ width: "100%" }} />

        {/* Sign out link */}
        {!noLocalUnlockMethod && (
          <Button
            variant="text"
            size="small"
            color="inherit"
            onClick={handleSignOut}
            sx={{ color: "text.secondary", fontSize: "0.75rem" }}
          >
            Sign out and use different account
          </Button>
        )}

      </Stack>
    </Box>
  );
};

export default BiometricLockScreen;
