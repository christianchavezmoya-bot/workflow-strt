import { Box, Button, FormControl, MenuItem, Select, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../../services/authService";
import { useAuth } from "../../hooks/useAuth";

const ProfileWizard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName || "");
  const [office, setOffice] = useState(user?.office || "USA");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }
    setLoading(true);
    try {
      const updated = await authService.updateProfile({ fullName: fullName.trim(), office });
      localStorage.setItem("auth_user", JSON.stringify(updated));
      navigate("/");
    } catch {
      setError("Unable to save profile.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" sx={{ fontFamily: "Sora" }}>
          Profile setup
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Confirm your details to finish onboarding.
        </Typography>
      </Box>

      <Box className="glass-card" sx={{ padding: 3, maxWidth: 520 }}>
        <Stack spacing={2}>
          <TextField
            label="Full name"
            fullWidth
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
          <FormControl fullWidth>
            <Select value={office} onChange={(event) => setOffice(event.target.value)}>
              {["USA", "Australia", "South Africa"].map((value) => (
                <MenuItem key={value} value={value}>
                  {value}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {error && (
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          )}
          <Button variant="contained" onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Save profile"}
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
};

export default ProfileWizard;
