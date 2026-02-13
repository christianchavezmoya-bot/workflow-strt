import {
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography
} from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../../services/authService";
import { UserRole } from "../../types/user";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("Local Tester");
  const [role, setRole] = useState<UserRole>("Project Manager");
  const [office, setOffice] = useState<"USA" | "Australia" | "South Africa">("USA");
  const [localMode, setLocalMode] = useState(true);
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

  const handleLoginSuccess = (result: { token?: string; user?: unknown; isFirstLogin: boolean; trustedDeviceToken?: string; passwordExpired?: boolean }) => {
    localStorage.setItem("auth_token", result.token!);
    localStorage.setItem("auth_user", JSON.stringify(result.user));
    localStorage.removeItem("local_auth_user");
    if (result.trustedDeviceToken) {
      localStorage.setItem("trusted_device_token", result.trustedDeviceToken);
    }
    if (result.isFirstLogin || result.passwordExpired) {
      navigate("/profile");
    } else {
      navigate("/");
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      if (localMode) {
        const localUser = {
          id: "local-user",
          email: email || "local@commtrac.test",
          fullName,
          role,
          office,
          isActive: true,
          isFirstLogin: false
        };
        localStorage.setItem("auth_token", "local");
        localStorage.setItem("local_auth_user", JSON.stringify(localUser));
        localStorage.removeItem("auth_user");
        navigate("/");
        return;
      }
      const trustedDeviceToken = localStorage.getItem("trusted_device_token") || undefined;
      const result = await authService.login({ email, password, trustedDeviceToken });

      if (result.requires2fa && result.twoFactorToken) {
        setTwoFactorToken(result.twoFactorToken);
        setTwoFactorStep(true);
        return;
      }

      handleLoginSuccess(result);
    } catch (err: any) {
      if (err?.response?.status === 429) {
        setError("Too many failed login attempts. Please wait 15 minutes and try again.");
      } else {
        setError("Unable to sign in. Check credentials or API availability.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2fa = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await authService.verify2fa(twoFactorToken, totpCode, rememberDevice);
      handleLoginSuccess(result);
    } catch (err: any) {
      if (err?.response?.status === 429) {
        setError("Too many failed attempts. Please wait 15 minutes and try again.");
      } else {
        setError("Invalid verification code. Please try again.");
      }
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
      if (err?.response?.status === 429) {
        setError("Too many failed attempts. Please wait 15 minutes and try again.");
      } else {
        setError("Invalid recovery code. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setResetSent(false);
    if (!email) {
      setError("Enter your email first.");
      return;
    }
    try {
      await authService.forgotPassword({ email });
      setResetSent(true);
    } catch {
      setError("Unable to send reset email.");
    }
  };

  // 2FA verification step
  if (twoFactorStep) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 4
        }}
      >
        <Box className="glass-card" sx={{ padding: 4, width: 420 }}>
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="h4" sx={{ fontFamily: "Sora" }}>
                Two-factor authentication
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {recoveryMode
                  ? "Enter one of your recovery codes to sign in."
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
                  autoFocus
                />
                <Button
                  variant="contained"
                  size="large"
                  onClick={handleVerify2fa}
                  disabled={loading || totpCode.length !== 6}
                >
                  {loading ? "Verifying..." : "Verify"}
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
                  autoFocus
                />
                <Button
                  variant="contained"
                  size="large"
                  onClick={handleRecoveryCode}
                  disabled={loading || recoveryCode.length < 8}
                >
                  {loading ? "Verifying..." : "Use recovery code"}
                </Button>
                <Button variant="text" size="small" onClick={() => { setRecoveryMode(false); setError(null); }}>
                  Back to authenticator code
                </Button>
              </>
            )}

            <FormControlLabel
              control={
                <Checkbox
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                  size="small"
                />
              }
              label="Remember this device for 30 days"
              slotProps={{ typography: { variant: "body2" } }}
            />

            {error && (
              <Typography variant="body2" color="error">
                {error}
              </Typography>
            )}

            <Button
              variant="text"
              size="small"
              onClick={() => {
                setTwoFactorStep(false);
                setTotpCode("");
                setRecoveryCode("");
                setRecoveryMode(false);
                setRememberDevice(false);
                setError(null);
              }}
            >
              Back to sign in
            </Button>
          </Stack>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 4
      }}
    >
      <Box className="glass-card" sx={{ padding: 4, width: 420 }}>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="h4" sx={{ fontFamily: "Sora" }}>
              Welcome back
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Sign in to manage projects and installations.
            </Typography>
          </Box>
          <FormControlLabel
            control={
              <Switch checked={localMode} onChange={(event) => setLocalMode(event.target.checked)} />
            }
            label="Local test mode (no backend required)"
          />
          {localMode && (
            <Stack spacing={2}>
              <TextField
                label="Full name"
                fullWidth
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
              />
              <FormControl fullWidth>
                <Select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
                  {["Admin", "Project Manager", "Engineer", "Viewer"].map((value) => (
                    <MenuItem key={value} value={value}>
                      {value}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <Select value={office} onChange={(event) => setOffice(event.target.value as typeof office)}>
                  {["USA", "Australia", "South Africa"].map((value) => (
                    <MenuItem key={value} value={value}>
                      {value}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
          )}
          <TextField
            label="Email"
            type="email"
            fullWidth
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {!localMode && (
            <>
              <TextField
                label="Password"
                type={showPassword ? "text" : "password"}
                fullWidth
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                        aria-label="toggle password visibility"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
              <Button variant="text" onClick={handleForgotPassword} sx={{ alignSelf: "flex-start" }}>
                Forgot password?
              </Button>
            </>
          )}
          {error && (
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          )}
          {resetSent && (
            <Typography variant="body2" color="success.main">
              Reset link sent. Check your email.
            </Typography>
          )}
          <Button variant="contained" size="large" onClick={handleSubmit} disabled={loading}>
            {loading ? "Signing in..." : localMode ? "Enter local workspace" : "Sign in"}
          </Button>
          <Typography variant="caption" color="text.secondary">
            First time logging in? You will be guided through profile setup.
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
};

export default Login;
