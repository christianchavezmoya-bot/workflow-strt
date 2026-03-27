import {
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
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../../services/authService";
import { secureGet, secureSet } from "../../services/secureStorage";
import { recordOnlineLogin } from "../../services/biometricAuth";
import strataLogo from "../../assets/strata_transparent.png";

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
      <Box component="img" src={strataLogo} alt="Kinet" sx={{ height: { xs: 72, sm: 56 }, borderRadius: "12px" }} />
      <Typography variant="h5" fontWeight={700} sx={{ fontFamily: "Sora", display: { xs: "block", sm: "none" } }}>
        Kinet
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

  // 2FA state
  const [twoFactorStep, setTwoFactorStep] = useState(false);
  const [twoFactorToken, setTwoFactorToken] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);

  const handleLoginSuccess = async (result: { token?: string; user?: unknown; isFirstLogin: boolean; trustedDeviceToken?: string; passwordExpired?: boolean }) => {
    await secureSet("auth_token", result.token!);
    await secureSet("auth_user", JSON.stringify(result.user));
    if (result.trustedDeviceToken) {
      await secureSet("trusted_device_token", result.trustedDeviceToken);
    }
    await recordOnlineLogin(); // stamp last online login for offline grace period
    navigate(result.isFirstLogin || result.passwordExpired ? "/profile" : "/");
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
      const result = await authService.verify2fa(twoFactorToken, totpCode, rememberDevice);
      await handleLoginSuccess(result);
    } catch (err: any) {
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
      handleLoginSuccess(result);
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
        <Box>
          <Typography variant="h5" fontWeight={700} sx={{ fontFamily: "Sora" }}>
            Welcome back
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Sign in to manage projects and installations.
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

        <Button variant="contained" size="large" fullWidth onClick={handleSubmit} disabled={loading}
          sx={{ py: 1.5, fontSize: "1rem" }}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>

        <Typography variant="caption" color="text.secondary" textAlign="center">
          First time? You'll be guided through profile setup.
        </Typography>
      </Stack>
    </PageWrapper>
  );
};

export default Login;
