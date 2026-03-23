import { Box, Button, LinearProgress, Stack, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authService } from "../../services/authService";
import { brandSettingsService } from "../../services/brandSettingsService";
import PasswordField from "../../components/ui/PasswordField";
import axios from "axios";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);
  const isInvite = searchParams.get("invite") === "true";
  const [appName, setAppName] = useState<string>("Commtrac");

  useEffect(() => {
    brandSettingsService.get().then((s) => {
      if (s.appName) setAppName(s.appName);
    }).catch(() => {});
  }, []);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checks = [
    { label: "8+ characters",  pass: password.length >= 8 },
    { label: "Uppercase",      pass: /[A-Z]/.test(password) },
    { label: "Lowercase",      pass: /[a-z]/.test(password) },
    { label: "Number",         pass: /\d/.test(password) },
    { label: "Special char",   pass: /[^A-Za-z0-9]/.test(password) },
  ];
  const passed  = checks.filter((c) => c.pass).length;
  const strength = (passed / checks.length) * 100;

  const handleReset = async () => {
    setError(null);
    setMessage(null);
    if (!token) {
      setError("Missing reset token. Please use the link from your email.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (passed < checks.length) {
      setError("Password does not meet all requirements below.");
      return;
    }
    setLoading(true);
    try {
      await authService.resetPassword({ token, newPassword: password });
      setMessage("Password updated. You can now sign in.");
      setTimeout(() => navigate("/login"), 1200);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg = err.response?.data?.message;
        if (msg) {
          setError(msg);
        } else if (err.response?.status === 400) {
          setError("This link is invalid or has expired. Please request a new one.");
        } else {
          setError("Unable to reset password. Check your connection and try again.");
        }
      } else {
        setError("Unable to reset password. Check your connection and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

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
              {isInvite ? `Welcome to ${appName}` : "Reset password"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {isInvite
                ? "Your account is ready. Set a password to get started."
                : `Create a new password to access ${appName}.`}
            </Typography>
          </Box>
          <PasswordField
            label="New password"
            fullWidth
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {password && (
            <Box>
              <LinearProgress
                variant="determinate"
                value={strength}
                color={strength <= 40 ? "error" : strength <= 80 ? "warning" : "success"}
                sx={{ height: 6, borderRadius: 3, mb: 0.5 }}
              />
              <Stack direction="row" spacing={1} flexWrap="wrap">
                {checks.map((c) => (
                  <Typography key={c.label} variant="caption" color={c.pass ? "success.main" : "text.disabled"}>
                    {c.pass ? "✓" : "✗"} {c.label}
                  </Typography>
                ))}
              </Stack>
            </Box>
          )}
          <PasswordField
            label="Confirm password"
            fullWidth
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
          {error && (
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          )}
          {message && (
            <Typography variant="body2" color="success.main">
              {message}
            </Typography>
          )}
          <Button variant="contained" size="large" onClick={handleReset} disabled={loading}>
            {loading ? (isInvite ? "Setting up..." : "Updating...") : (isInvite ? "Set password & sign in" : "Update password")}
          </Button>
        </Stack>
      </Box>
    </Box>
  );
};

export default ResetPassword;
