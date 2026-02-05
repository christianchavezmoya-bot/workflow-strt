import {
  Box,
  Button,
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
      const result = await authService.login({ email, password });
      localStorage.setItem("auth_token", result.token);
      localStorage.setItem("auth_user", JSON.stringify(result.user));
      localStorage.removeItem("local_auth_user");
      if (result.isFirstLogin) {
        navigate("/profile");
      } else {
        navigate("/");
      }
    } catch (err) {
      setError("Unable to sign in. Check credentials or API availability.");
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
