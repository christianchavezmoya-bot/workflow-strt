import { useState } from "react";
import { Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { FingerprintOutlined, WifiOffOutlined } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { promptBiometric } from "../services/biometricAuth";
import { secureGet, secureClearAuth } from "../services/secureStorage";

interface Props {
  onUnlocked: () => void;
}

const BiometricLockScreen = ({ onUnlocked }: Props) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storedUser = secureGet("auth_user");
  const userName = (() => {
    try { return storedUser ? (JSON.parse(storedUser) as { fullName?: string }).fullName : null; }
    catch { return null; }
  })();

  const lastLoginTs = secureGet("last_online_login");
  const lastLoginLabel = lastLoginTs
    ? new Date(parseInt(lastLoginTs, 10)).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;

  const handleUnlock = async () => {
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

        {/* Offline indicator */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{
          px: 2, py: 0.75, borderRadius: 999,
          bgcolor: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}>
          <WifiOffOutlined sx={{ fontSize: 15, color: "text.secondary" }} />
          <Typography variant="caption" color="text.secondary">Offline mode</Typography>
        </Stack>

        {/* Face ID icon */}
        <Box sx={{
          width: 88, height: 88, borderRadius: "50%",
          bgcolor: "rgba(45,212,191,0.12)",
          border: "2px solid rgba(45,212,191,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <FingerprintOutlined sx={{ fontSize: 44, color: "primary.main" }} />
        </Box>

        {/* Welcome back */}
        <Stack spacing={0.5} alignItems="center">
          <Typography variant="h6" fontWeight={700} sx={{ fontFamily: "Sora" }}>
            {userName ? `Welcome back, ${userName.split(" ")[0]}` : "Welcome back"}
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            The server is unreachable. Use Face ID to open with your saved session.
          </Typography>
          {lastLoginLabel && (
            <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5 }}>
              Last online: {lastLoginLabel}
            </Typography>
          )}
        </Stack>

        {/* Error */}
        {error && (
          <Typography variant="caption" color="error.main" textAlign="center">
            {error}
          </Typography>
        )}

        {/* Unlock button */}
        <Button
          variant="contained"
          size="large"
          fullWidth
          disabled={loading}
          onClick={handleUnlock}
          startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <FingerprintOutlined />}
          sx={{ borderRadius: 2, py: 1.5, fontWeight: 700 }}
        >
          {loading ? "Verifying…" : "Unlock with Face ID"}
        </Button>

        {/* Sign out link */}
        <Button
          variant="text"
          size="small"
          color="inherit"
          onClick={handleSignOut}
          sx={{ color: "text.disabled", fontSize: "0.75rem" }}
        >
          Sign out and use different account
        </Button>

      </Stack>
    </Box>
  );
};

export default BiometricLockScreen;
