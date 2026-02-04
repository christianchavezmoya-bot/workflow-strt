import { Box, Button, Stack, TextField, Typography } from "@mui/material";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authService } from "../../services/authService";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleReset = async () => {
    setError(null);
    setMessage(null);
    if (!token) {
      setError("Missing reset token.");
      return;
    }
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await authService.resetPassword({ token, newPassword: password });
      setMessage("Password updated. You can now sign in.");
      setTimeout(() => navigate("/login"), 1200);
    } catch {
      setError("Unable to reset password. The link may be expired.");
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
              Reset password
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Create a new password to access Commtrac.
            </Typography>
          </Box>
          <TextField
            label="New password"
            type="password"
            fullWidth
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <TextField
            label="Confirm password"
            type="password"
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
            {loading ? "Updating..." : "Update password"}
          </Button>
        </Stack>
      </Box>
    </Box>
  );
};

export default ResetPassword;
