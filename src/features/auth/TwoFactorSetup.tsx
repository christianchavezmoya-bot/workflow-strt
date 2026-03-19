import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { ContentCopy } from "@mui/icons-material";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { authService } from "../../services/authService";

interface TwoFactorSetupProps {
  open: boolean;
  onClose: () => void;
  onEnabled: () => void;
}

type Step = "setup" | "verify" | "recovery" | "done";

const TwoFactorSetup = ({ open, onClose, onEnabled }: TwoFactorSetupProps) => {
  const [step, setStep] = useState<Step>("setup");
  const [secret, setSecret] = useState("");
  const [qrCodeUri, setQrCodeUri] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSetup = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await authService.setup2fa();
      setSecret(result.secret);
      setQrCodeUri(result.qrCodeUri);
      setStep("verify");
    } catch {
      setError("Failed to initialize 2FA setup.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await authService.confirm2fa(code);
      setRecoveryCodes(result.codes);
      setStep("recovery");
    } catch {
      setError("Invalid code. Make sure your authenticator is synced and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCodes = () => {
    navigator.clipboard.writeText(recoveryCodes.join("\n"));
  };

  const handleDone = () => {
    onEnabled();
    setStep("setup");
    setSecret("");
    setQrCodeUri("");
    setCode("");
    setRecoveryCodes([]);
    setError(null);
    onClose();
  };

  const handleCancel = () => {
    setStep("setup");
    setSecret("");
    setQrCodeUri("");
    setCode("");
    setRecoveryCodes([]);
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={step === "recovery" ? undefined : handleCancel} maxWidth="sm" fullWidth>
      <DialogTitle>
        {step === "setup" && "Enable Two-Factor Authentication"}
        {step === "verify" && "Scan QR Code"}
        {step === "recovery" && "Save Recovery Codes"}
        {step === "done" && "2FA Enabled"}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {step === "setup" && (
            <>
              <Typography variant="body2">
                Two-factor authentication adds an extra layer of security to your account.
                You will need an authenticator app like Google Authenticator, Microsoft Authenticator, or Authy.
              </Typography>
              <Button variant="contained" onClick={handleSetup} disabled={loading}>
                {loading ? "Setting up..." : "Get started"}
              </Button>
            </>
          )}

          {step === "verify" && (
            <>
              <Typography variant="body2">
                Scan this QR code with your authenticator app, then enter the 6-digit code below to verify.
              </Typography>
              <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                <QRCodeSVG value={qrCodeUri} size={200} />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all", textAlign: "center" }}>
                Manual entry key: <strong>{secret}</strong>
              </Typography>
              <TextField
                label="Verification code"
                fullWidth
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputProps={{ maxLength: 6, inputMode: "numeric" }}
                autoFocus
              />
            </>
          )}

          {step === "recovery" && (
            <>
              <Typography variant="body2" color="warning.main" fontWeight="bold">
                Save these recovery codes in a safe place. Each code can only be used once.
                If you lose access to your authenticator app, these codes are the only way to sign in.
              </Typography>
              <Box
                sx={{
                  bgcolor: "background.paper",
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  p: 2,
                  fontFamily: "monospace",
                  fontSize: 14
                }}
              >
                {recoveryCodes.map((c, i) => (
                  <Typography key={i} variant="body2" sx={{ fontFamily: "monospace" }}>
                    {c}
                  </Typography>
                ))}
              </Box>
              <Button
                variant="outlined"
                startIcon={<ContentCopy />}
                onClick={handleCopyCodes}
                size="small"
              >
                Copy all codes
              </Button>
            </>
          )}

          {error && (
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {step === "setup" && (
          <Button onClick={handleCancel}>Cancel</Button>
        )}
        {step === "verify" && (
          <>
            <Button onClick={handleCancel}>Cancel</Button>
            <Button variant="contained" onClick={handleVerify} disabled={loading || code.length !== 6}>
              {loading ? "Verifying..." : "Verify & Enable"}
            </Button>
          </>
        )}
        {step === "recovery" && (
          <Button variant="contained" onClick={handleDone}>
            I have saved my codes
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default TwoFactorSetup;
