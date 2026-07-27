import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { Visibility, VisibilityOff, WifiOff, CloudOff } from "@mui/icons-material";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../../services/authService";
import { secureGet, secureSet } from "../../services/secureStorage";
import { recordOnlineLogin } from "../../services/biometricAuth";
import { offlineBootstrapService } from "../../services/offlineBootstrapService";
import { getNetworkStatus, getNetworkMessage, NetworkStatus } from "../../services/networkService";
import strataLogo from "../../assets/strata_transparent.png";
import { APP_NAME } from "../../constants/branding";
import { isMobileNativePlatform } from "../../utils/platform";

// Must be outside Login so it doesn't remount on every keystroke
const PageWrapper = ({ children }: { children: React.ReactNode }) => (
  <Box
    sx={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: { xs: "flex-start", sm: "center" },
      px: { xs: 2, sm: 4 },
      pt: { xs: "env(safe-area-inset-top, 40px)", sm: 0 },
      pb: { xs: 4, sm: 0 },
    }}
  >
    <Stack alignItems="center" spacing={1.5} sx={{ mt: { xs: 6, sm: 0 }, mb: { xs: 4, sm: 0 } }}>
      <Box component="img" src={strataLogo} alt={APP_NAME} sx={{ height: { xs: 72, sm: 56 }, borderRadius: "12px" }} />
      <Typography variant="h5" fontWeight={700} sx={{ fontFamily: "Sora", display: { xs: "block", sm: "none" } }}>
        {APP_NAME}
      </Typography>
    </Stack>
    <Box className="glass-card" sx={{ padding: { xs: 3, sm: 4 }, width: "100%", maxWidth: 420, mt: { xs: 0, sm: 4 } }}>
      {children}
    </Box>
  </Box>
);

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus | null>(null);
  
  // Check if this is a first-time user (no previous session)
  const isFirstTimeUser = !secureGet("auth_user") && !secureGet("auth_token");
  const hadPriorSession = !!secureGet("last_online_login") || !!secureGet("auth_user");

  // Check network and server status
  useEffect(() => {
    const checkNetwork = async () => {
      const status = await getNetworkStatus();
      console.log("[Login] Network status:", status);
      setNetworkStatus(status);
    };
    
    // Check initial status
    checkNetwork();
    
    // Re-check periodically (every 30 seconds)
    const interval = setInterval(checkNetwork, 30000);
    
    // Also re-check when window gains focus
    const handleFocus = () => checkNetwork();
    window.addEventListener("focus", handleFocus);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  // 2FA state
  const [twoFactorStep, setTwoFactorStep] = useState(false);
  const [twoFactorToken, setTwoFactorToken] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);

  const handleLoginSuccess = async (result: { token?: string; user?: unknown; isFirstLogin: boolean; trustedDeviceToken?: string; passwordExpired?: boolean }) => {
    console.log("[Login] handleLoginSuccess called", { 
      hasToken: !!result.token, 
      hasUser: !!result.user,
      isFirstLogin: result.isFirstLogin,
      passwordExpired: result.passwordExpired 
    });
    
    if (!result.token) {
      setError("No token received from server");
      setLoading(false);
      return;
    }
    
    // Set just_authenticated flag FIRST (before any async operations)
    // This ensures the flag is in cache even if storage operations timeout
    await secureSet("just_authenticated", "true");
    console.log("[Login] Set just_authenticated flag");
    
    try {
      // Save all auth data in parallel with timeout protection
      const savePromises = [
        secureSet("auth_token", result.token),
        result.user ? secureSet("auth_user", JSON.stringify(result.user)) : Promise.resolve(),
        result.trustedDeviceToken ? secureSet("trusted_device_token", result.trustedDeviceToken) : Promise.resolve(),
        recordOnlineLogin()
      ];
      
      // Wait for all saves with timeout
      await Promise.race([
        Promise.all(savePromises),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Storage timeout")), 5000))
      ]);
      
      console.log("[Login] All data saved successfully");
      if (isMobileNativePlatform()) {
        localStorage.removeItem("test_mode_original_auth");
      }
    } catch (error) {
      console.warn("[Login] Storage save warning:", error);
      // Continue anyway - cache is updated
    }
    
    // Notify App.tsx that auth state has changed
    window.dispatchEvent(new Event("auth-change"));
    window.dispatchEvent(new Event("auth-user-updated"));

    // Kick off a silent background prefetch of everything assigned to this user
    // so the app is fully usable offline. Fire-and-forget — never blocks login.
    void offlineBootstrapService.run({ scope: "all" });

    console.log("[Login] Login success, navigating to:", result.isFirstLogin || result.passwordExpired ? "/profile" : "/");
    setLoading(false);
    
    // Use setTimeout to ensure state updates propagate
    setTimeout(() => {
      navigate(result.isFirstLogin || result.passwordExpired ? "/profile" : "/");
    }, 100);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const trustedDeviceToken = secureGet("trusted_device_token") || undefined;
      const result = await authService.login({ email, password, trustedDeviceToken });
      if (result.requires2fa && result.twoFactorToken) {
        setTwoFactorToken(result.twoFactorToken);
        setTwoFactorStep(true);
        return;
      }
      await handleLoginSuccess(result);
    } catch (err: any) {
      setError(err?.response?.status === 429
        ? "Too many failed attempts. Please wait 15 minutes and try again."
        : "Unable to sign in. Check credentials or API availability."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2fa = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log("[Login] Verifying 2FA code...");
      const result = await authService.verify2fa(twoFactorToken, totpCode, rememberDevice);
      console.log("[Login] 2FA verify response:", result);
      await handleLoginSuccess(result);
      console.log("[Login] handleLoginSuccess completed");
    } catch (err: any) {
      console.error("[Login] 2FA verify error:", err);
      setError(err?.response?.status === 429
        ? "Too many failed attempts. Please wait 15 minutes and try again."
        : "Invalid verification code. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRecoveryCode = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await authService.useRecoveryCode(twoFactorToken, recoveryCode, rememberDevice);
      await handleLoginSuccess(result);
    } catch (err: any) {
      setError(err?.response?.status === 429
        ? "Too many failed attempts. Please wait 15 minutes and try again."
        : "Invalid recovery code. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setResetSent(false);
    if (!email) { setError("Enter your email first."); return; }
    try {
      await authService.forgotPassword({ email });
      setResetSent(true);
    } catch {
      setError("Unable to send reset email.");
    }
  };

  // ── 2FA step ──────────────────────────────────────────────────────────────
  if (twoFactorStep) {
    return (
      <PageWrapper>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="h5" fontWeight={700} sx={{ fontFamily: "Sora" }}>
              Two-factor auth
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {recoveryMode
                ? "Enter one of your recovery codes."
                : "Enter the 6-digit code from your authenticator app."}
            </Typography>
          </Box>

          {!recoveryMode ? (
            <>
              <TextField
                label="Verification code"
                fullWidth
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputProps={{ maxLength: 6, inputMode: "numeric", autoComplete: "one-time-code" }}
                onKeyDown={(e) => { if (e.key === "Enter" && totpCode.length === 6) handleVerify2fa(); }}
                autoFocus
                size="medium"
              />
              <Button variant="contained" size="large" fullWidth onClick={handleVerify2fa} disabled={loading || totpCode.length !== 6}>
                {loading ? "Verifying…" : "Verify"}
              </Button>
              <Button variant="text" size="small" onClick={() => { setRecoveryMode(true); setError(null); }}>
                Use a recovery code instead
              </Button>
            </>
          ) : (
            <>
              <TextField
                label="Recovery code"
                fullWidth
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value.toUpperCase().slice(0, 8))}
                inputProps={{ maxLength: 8 }}
                onKeyDown={(e) => { if (e.key === "Enter" && recoveryCode.length >= 8) handleRecoveryCode(); }}
                autoFocus
              />
              <Button variant="contained" size="large" fullWidth onClick={handleRecoveryCode} disabled={loading || recoveryCode.length < 8}>
                {loading ? "Verifying…" : "Use recovery code"}
              </Button>
              <Button variant="text" size="small" onClick={() => { setRecoveryMode(false); setError(null); }}>
                Back to authenticator code
              </Button>
            </>
          )}

          <FormControlLabel
            control={<Checkbox checked={rememberDevice} onChange={(e) => setRememberDevice(e.target.checked)} size="small" />}
            label="Remember this device for 30 days"
            slotProps={{ typography: { variant: "body2" } }}
          />

          {error && <Typography variant="body2" color="error">{error}</Typography>}

          <Button variant="text" size="small" onClick={() => {
            setTwoFactorStep(false); setTotpCode(""); setRecoveryCode("");
            setRecoveryMode(false); setRememberDevice(false); setError(null);
          }}>
            Back to sign in
          </Button>
        </Stack>
      </PageWrapper>
    );
  }

  // ── Main login ────────────────────────────────────────────────────────────
  return (
    <PageWrapper>
      <Stack spacing={2.5}>
        {/* Offline: first-time login always needs Wi‑Fi; returning users need online sign-in to refresh an expired server token. */}
        {networkStatus && (
          networkStatus.status === "offline"
          || (isFirstTimeUser && networkStatus.status === "server-unavailable")
        ) && (
          <Alert 
            severity="warning" 
            icon={networkStatus.status === "offline" ? <WifiOff /> : <CloudOff />}
            sx={{ mb: 1 }}
          >
            <Typography variant="body2" fontWeight={600}>
              {getNetworkMessage(networkStatus).title}
            </Typography>
            <Typography variant="caption" sx={{ display: "block", mt: 0.5 }}>
              {networkStatus.status === "offline" && hadPriorSession && !isFirstTimeUser
                ? "Connect to Wi‑Fi to refresh your session and sync. If you only need cached field data, force-quit and reopen the app — Face ID may unlock offline."
                : getNetworkMessage(networkStatus).description}
            </Typography>
          </Alert>
        )}

        <Box>
          <Typography variant="h5" fontWeight={700} sx={{ fontFamily: "Sora" }}>
            {isFirstTimeUser ? `Welcome to ${APP_NAME}` : "Welcome back"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {isFirstTimeUser 
              ? "Sign in to get started. First-time login requires internet connection."
              : "Sign in to manage projects and installations."}
          </Typography>
        </Box>

        <TextField
          label="Email"
          type="email"
          fullWidth
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          inputProps={{ inputMode: "email", autoCapitalize: "none", autoCorrect: "off" }}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          size="medium"
        />

        <TextField
          label="Password"
          type={showPassword ? "text" : "password"}
          fullWidth
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                  {showPassword ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            )
          }}
        />

        <Button variant="text" onClick={handleForgotPassword} sx={{ alignSelf: "flex-start", p: 0 }}>
          Forgot password?
        </Button>

        {error    && <Typography variant="body2" color="error">{error}</Typography>}
        {resetSent && <Typography variant="body2" color="success.main">Reset link sent — check your email.</Typography>}

        <Button variant="contained" size="large" fullWidth onClick={handleSubmit} disabled={loading || (networkStatus?.status === "offline")}
          sx={{ py: 1.5, fontSize: "1rem" }}>
          {loading ? "Signing in…" : networkStatus?.status === "offline" ? "Sign in (Wi‑Fi required)" : "Sign in"}
        </Button>

        {networkStatus?.status === "offline" && !hadPriorSession && (
          <Typography variant="caption" color="text.secondary" textAlign="center">
            After signing out, an internet connection is required to sign in again. Turn on Wi‑Fi or cellular, then tap Sign in.
          </Typography>
        )}

        <Typography variant="caption" color="text.secondary" textAlign="center">
          First time? You'll be guided through profile setup.
        </Typography>
      </Stack>
    </PageWrapper>
  );
};

export default Login;
