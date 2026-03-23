import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, LinearProgress, MenuItem, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { ContentCopy } from "@mui/icons-material";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService, Session, LoginHistoryEntry } from "../../services/authService";
import { useAuth } from "../../hooks/useAuth";
import TwoFactorSetup from "../auth/TwoFactorSetup";
import PasswordField from "../../components/ui/PasswordField";

const ProfileWizard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName || "");
  const [office, setOffice] = useState(user?.office || "USA");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 2FA state
  const [setup2faOpen, setSetup2faOpen] = useState(false);
  const [firstLogin2faPromptOpen, setFirstLogin2faPromptOpen] = useState(false);
  const [is2faEnabled, setIs2faEnabled] = useState(user?.is2faEnabled ?? false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableLoading, setDisableLoading] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);
  const [showDisable, setShowDisable] = useState(false);

  // Change password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  // Sessions state
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  // Login history state
  const [loginHistory, setLoginHistory] = useState<LoginHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Regenerate recovery codes state
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenPassword, setRegenPassword] = useState("");
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [regenCodes, setRegenCodes] = useState<string[] | null>(null);

  // Always sync name + office from backend on mount so the profile reflects
  // what an admin set in Users — not just the cached localStorage value.
  useEffect(() => {
    authService.getProfile().then((fresh) => {
      setFullName(fresh.fullName || "");
      setOffice(fresh.office || "");
      // Keep localStorage in sync
      const stored = localStorage.getItem("auth_user");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          localStorage.setItem("auth_user", JSON.stringify({ ...parsed, fullName: fresh.fullName, office: fresh.office }));
          window.dispatchEvent(new Event("auth-user-updated"));
        } catch { /* ignore */ }
      }
    }).catch(() => { /* offline — keep cached values */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isFirstLoginWithout2fa = !!user?.isFirstLogin && !is2faEnabled;

  const markFirstLogin2faPromptDismissed = () => {
    if (!user?.id) return;
    sessionStorage.setItem(`first_login_2fa_prompt_dismissed:${user.id}`, "1");
  };

  const isFirstLogin2faPromptDismissed = () => {
    if (!user?.id) return false;
    return sessionStorage.getItem(`first_login_2fa_prompt_dismissed:${user.id}`) === "1";
  };

  const notifyAuthUserUpdated = () => {
    window.dispatchEvent(new Event("auth-user-updated"));
  };

  const updateCachedUser = (updates: Partial<ReturnType<typeof JSON.parse>>) => {
    const stored = localStorage.getItem("auth_user");
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      const merged = { ...parsed, ...updates };
      localStorage.setItem("auth_user", JSON.stringify(merged));
      notifyAuthUserUpdated();
    } catch {
      // ignore malformed cached auth_user
    }
  };

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
      notifyAuthUserUpdated();
      navigate("/");
    } catch {
      setError("Unable to save profile.");
    } finally {
      setLoading(false);
    }
  };

  const handleDisable2fa = async () => {
    setDisableLoading(true);
    setDisableError(null);
    try {
      await authService.disable2fa(disablePassword);
      setIs2faEnabled(false);
      setShowDisable(false);
      setDisablePassword("");
      updateCachedUser({ is2faEnabled: false });
    } catch {
      setDisableError("Incorrect password.");
    } finally {
      setDisableLoading(false);
    }
  };

  const handleRegenerateCodes = async () => {
    setRegenLoading(true);
    setRegenError(null);
    try {
      const result = await authService.regenerateCodes(regenPassword);
      setRegenCodes(result.codes);
      setRegenPassword("");
    } catch {
      setRegenError("Incorrect password.");
    } finally {
      setRegenLoading(false);
    }
  };

  const closeRegenDialog = () => {
    setRegenOpen(false);
    setRegenPassword("");
    setRegenError(null);
    setRegenCodes(null);
  };

  const loadSessions = async () => {
    setSessionsLoading(true);
    try {
      const data = await authService.getSessions();
      setSessions(data);
      setSessionsLoaded(true);
    } catch { /* ignore */ }
    setSessionsLoading(false);
  };

  const handleRevokeSession = async (id: string) => {
    try {
      await authService.revokeSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch { /* ignore */ }
  };

  const handleRevokeAll = async () => {
    try {
      await authService.revokeAllSessions();
      setSessions((prev) => prev.filter((s) => s.isCurrent));
    } catch { /* ignore */ }
  };

  const loadLoginHistory = async () => {
    setHistoryLoading(true);
    try {
      const data = await authService.getLoginHistory();
      setLoginHistory(data);
      setHistoryLoaded(true);
    } catch { /* ignore */ }
    setHistoryLoading(false);
  };

  const handleChangePassword = async () => {
    setPwError(null);
    setPwSuccess(false);
    if (newPassword !== confirmPassword) {
      setPwError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setPwError("Password must be at least 8 characters.");
      return;
    }
    setPwLoading(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      setPwSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPwError(err?.response?.data?.message || "Unable to change password.");
    } finally {
      setPwLoading(false);
    }
  };

  // First-time users: invite them to enable 2FA once per browser session.
  useEffect(() => {
    if (isFirstLoginWithout2fa && !isFirstLogin2faPromptDismissed()) {
      setFirstLogin2faPromptOpen(true);
    }
  }, [isFirstLoginWithout2fa]);

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
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.75 }}>
              Country
            </Typography>
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

      {/* Two-Factor Authentication Section */}
      <Box className="glass-card" sx={{ padding: 3, maxWidth: 520 }}>
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="subtitle1" fontWeight="bold">
                Two-factor authentication
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Add an extra layer of security to your account.
              </Typography>
            </Box>
            <Chip
              label={is2faEnabled ? "Enabled" : "Disabled"}
              color={is2faEnabled ? "success" : "default"}
              size="small"
            />
          </Stack>

          {!is2faEnabled ? (
            <Button variant="outlined" onClick={() => setSetup2faOpen(true)}>
              Enable 2FA
            </Button>
          ) : (
            <Stack spacing={1}>
              {user?.recoveryCodesRemaining !== undefined && (
                <Typography variant="body2" color={user.recoveryCodesRemaining <= 2 ? "warning.main" : "text.secondary"}>
                  {user.recoveryCodesRemaining} recovery code{user.recoveryCodesRemaining !== 1 ? "s" : ""} remaining
                </Typography>
              )}
              <Stack direction="row" spacing={1}>
                <Button variant="outlined" onClick={() => setRegenOpen(true)}>
                  Regenerate recovery codes
                </Button>
                {!showDisable && (
                  <Button variant="outlined" color="error" onClick={() => setShowDisable(true)}>
                    Disable 2FA
                  </Button>
                )}
              </Stack>
              {showDisable && (
                <Stack spacing={1}>
                  <PasswordField
                    label="Enter your password to disable 2FA"
                    fullWidth
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    size="small"
                  />
                  {disableError && (
                    <Typography variant="body2" color="error">
                      {disableError}
                    </Typography>
                  )}
                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="contained"
                      color="error"
                      size="small"
                      onClick={handleDisable2fa}
                      disabled={disableLoading || !disablePassword}
                    >
                      {disableLoading ? "Disabling..." : "Confirm disable"}
                    </Button>
                    <Button
                      size="small"
                      onClick={() => { setShowDisable(false); setDisablePassword(""); setDisableError(null); }}
                    >
                      Cancel
                    </Button>
                  </Stack>
                </Stack>
              )}
            </Stack>
          )}
        </Stack>
      </Box>

      {/* Change Password Section */}
      <Box className="glass-card" sx={{ padding: 3, maxWidth: 520 }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="subtitle1" fontWeight="bold">
              Change password
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Must be at least 8 characters with uppercase, lowercase, number, and special character.
            </Typography>
          </Box>
          <PasswordField
            label="Current password"
            fullWidth
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            size="small"
          />
          <PasswordField
            label="New password"
            fullWidth
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            size="small"
          />
          {newPassword && (() => {
            const checks = [
              { label: "8+ characters", pass: newPassword.length >= 8 },
              { label: "Uppercase", pass: /[A-Z]/.test(newPassword) },
              { label: "Lowercase", pass: /[a-z]/.test(newPassword) },
              { label: "Number", pass: /\d/.test(newPassword) },
              { label: "Special char", pass: /[^A-Za-z0-9]/.test(newPassword) },
            ];
            const passed = checks.filter((c) => c.pass).length;
            const strength = (passed / checks.length) * 100;
            return (
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
                      {c.pass ? "\u2713" : "\u2717"} {c.label}
                    </Typography>
                  ))}
                </Stack>
              </Box>
            );
          })()}
          <PasswordField
            label="Confirm new password"
            fullWidth
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            size="small"
          />
          {pwError && (
            <Typography variant="body2" color="error">
              {pwError}
            </Typography>
          )}
          {pwSuccess && (
            <Typography variant="body2" color="success.main">
              Password changed successfully.
            </Typography>
          )}
          <Button
            variant="contained"
            onClick={handleChangePassword}
            disabled={pwLoading || !currentPassword || !newPassword || !confirmPassword}
          >
            {pwLoading ? "Changing..." : "Change password"}
          </Button>
        </Stack>
      </Box>

      {/* Password Expiry Warning */}
      {user?.passwordExpired && (
        <Alert severity="warning" sx={{ maxWidth: 520 }}>
          Your password has expired. Please change it above to continue using the app.
        </Alert>
      )}

      {/* Active Sessions Section */}
      <Box className="glass-card" sx={{ padding: 3, maxWidth: 520 }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="subtitle1" fontWeight="bold">
              Active sessions
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Manage your active sign-in sessions across devices.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" size="small" onClick={loadSessions} disabled={sessionsLoading}>
              {sessionsLoading ? "Loading..." : sessionsLoaded ? "Refresh" : "Load sessions"}
            </Button>
            {sessionsLoaded && sessions.length > 1 && (
              <Button variant="outlined" color="error" size="small" onClick={handleRevokeAll}>
                Revoke all other sessions
              </Button>
            )}
          </Stack>
          {sessionsLoaded && sessions.length > 0 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>IP</TableCell>
                  <TableCell>Device</TableCell>
                  <TableCell>Last active</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{s.ipAddress}</TableCell>
                    <TableCell sx={{ fontSize: "0.75rem", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.userAgent.length > 60 ? s.userAgent.slice(0, 60) + "..." : s.userAgent}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: "0.8rem" }}>
                      {new Date(s.lastActiveAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {s.isCurrent ? (
                        <Chip label="Current" size="small" color="success" />
                      ) : (
                        <Button size="small" color="error" onClick={() => handleRevokeSession(s.id)}>
                          Revoke
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {sessionsLoaded && sessions.length === 0 && (
            <Typography variant="body2" color="text.secondary">No active sessions found.</Typography>
          )}
        </Stack>
      </Box>

      {/* Login History Section */}
      <Box className="glass-card" sx={{ padding: 3, maxWidth: 520 }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="subtitle1" fontWeight="bold">
              Recent sign-in activity
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Your recent login and security events.
            </Typography>
          </Box>
          <Button variant="outlined" size="small" onClick={loadLoginHistory} disabled={historyLoading} sx={{ alignSelf: "flex-start" }}>
            {historyLoading ? "Loading..." : historyLoaded ? "Refresh" : "Load history"}
          </Button>
          {historyLoaded && loginHistory.length > 0 && (
            <>
              <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Time</TableCell>
                    <TableCell>Event</TableCell>
                    <TableCell>Details</TableCell>
                    <TableCell>IP</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loginHistory.map((entry, i) => (
                    <TableRow key={i}>
                      <TableCell sx={{ whiteSpace: "nowrap", fontSize: "0.8rem" }}>
                        {new Date(entry.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: "monospace",
                            fontSize: "0.8rem",
                            color: entry.action.includes("failed") ? "error.main" : "success.main"
                          }}
                        >
                          {entry.action}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ fontSize: "0.8rem" }}>{entry.details || "\u2014"}</TableCell>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{entry.ipAddress || "\u2014"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
          {historyLoaded && loginHistory.length === 0 && (
            <Typography variant="body2" color="text.secondary">No recent activity.</Typography>
          )}
        </Stack>
      </Box>

      <TwoFactorSetup
        open={setup2faOpen}
        onClose={() => setSetup2faOpen(false)}
        onEnabled={() => {
          setIs2faEnabled(true);
          updateCachedUser({ is2faEnabled: true });
          setFirstLogin2faPromptOpen(false);
          markFirstLogin2faPromptDismissed();
        }}
      />

      <Dialog open={firstLogin2faPromptOpen} onClose={undefined} maxWidth="sm" fullWidth>
        <DialogTitle>Increase your account security</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            We recommend enabling two-factor authentication (2FA) now to better protect your account.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setFirstLogin2faPromptOpen(false);
              markFirstLogin2faPromptDismissed();
            }}
          >
            Not now
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setFirstLogin2faPromptOpen(false);
              setSetup2faOpen(true);
            }}
          >
            Enable 2FA
          </Button>
        </DialogActions>
      </Dialog>

      {/* Regenerate Recovery Codes Dialog */}
      <Dialog open={regenOpen} onClose={regenCodes ? undefined : closeRegenDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{regenCodes ? "New recovery codes" : "Regenerate recovery codes"}</DialogTitle>
        <DialogContent>
          {!regenCodes ? (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                This will invalidate all your existing recovery codes and generate new ones. Enter your password to confirm.
              </Typography>
              <PasswordField
                label="Password"
                fullWidth
                value={regenPassword}
                onChange={(e) => setRegenPassword(e.target.value)}
                size="small"
                autoFocus
              />
              {regenError && (
                <Typography variant="body2" color="error">
                  {regenError}
                </Typography>
              )}
            </Stack>
          ) : (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Typography variant="body2" color="warning.main" fontWeight="bold">
                Save these codes in a safe place. They will not be shown again.
              </Typography>
              <Box sx={{ backgroundColor: "rgba(0,0,0,0.05)", borderRadius: 1, p: 2 }}>
                {regenCodes.map((code, i) => (
                  <Typography key={i} variant="body2" sx={{ fontFamily: "monospace", lineHeight: 2 }}>
                    {code}
                  </Typography>
                ))}
              </Box>
              <Button
                size="small"
                startIcon={<ContentCopy />}
                onClick={() => navigator.clipboard.writeText(regenCodes.join("\n"))}
              >
                Copy all codes
              </Button>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          {!regenCodes ? (
            <>
              <Button onClick={closeRegenDialog}>Cancel</Button>
              <Button
                variant="contained"
                onClick={handleRegenerateCodes}
                disabled={regenLoading || !regenPassword}
              >
                {regenLoading ? "Generating..." : "Regenerate"}
              </Button>
            </>
          ) : (
            <Button variant="contained" onClick={closeRegenDialog}>
              I have saved my codes
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default ProfileWizard;
