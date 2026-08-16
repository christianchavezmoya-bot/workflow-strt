import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { CheckCircleOutlined, ContentCopyOutlined } from "@mui/icons-material";
import { useState } from "react";
import { submitFaultReport, type FaultSeverity } from "../../services/faultReporting";

/**
 * Impact in the user's own words, mapped to triage severity (docs/BUG_TRIAGE.md).
 * Field users should never have to know what "S1" means.
 */
const IMPACT_OPTIONS: { value: FaultSeverity; label: string; hint: string }[] = [
  { value: "S0", label: "I lost work", hint: "Something I completed has gone or is wrong" },
  { value: "S1", label: "I can't carry on", hint: "Blocked — can't sign in, open or finish a job" },
  { value: "S2", label: "Something's broken", hint: "I found a way around it for now" },
  { value: "S3", label: "Minor problem", hint: "Looks wrong but isn't stopping me" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  /** Prefills the summary — e.g. the error the boundary caught. */
  initialTitle?: string;
  /** Reuses the code already shown to the user after a crash. */
  referenceCode?: string;
}

export default function ReportProblemDialog({ open, onClose, initialTitle, referenceCode }: Props) {
  const [title, setTitle] = useState(initialTitle ?? "");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<FaultSeverity>("S2");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ code: string; delivered: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setTitle(initialTitle ?? "");
    setDescription("");
    setSeverity("S2");
    setResult(null);
    setCopied(false);
  };

  const handleClose = () => {
    onClose();
    // Leave the finished state visible until the dialog is actually gone.
    window.setTimeout(reset, 200);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const submitted = await submitFaultReport({
        kind: "user-report",
        severity,
        title: title.trim() || "Problem reported from the app",
        description: description.trim() || undefined,
        referenceCode,
      });
      setResult({ code: submitted.referenceCode, delivered: submitted.delivered });
    } finally {
      setSubmitting(false);
    }
  };

  const copyCode = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.code);
      setCopied(true);
    } catch {
      // Clipboard unavailable — the code is on screen to read anyway.
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{result ? "Thanks — that's been logged" : "Report a problem"}</DialogTitle>

      {result ? (
        <DialogContent>
          <Stack spacing={2}>
            <Alert
              severity={result.delivered ? "success" : "info"}
              icon={result.delivered ? <CheckCircleOutlined /> : undefined}
            >
              {result.delivered
                ? "Your report was sent, along with the technical details we need to look into it."
                : "You're offline, so the report is saved on this device and will send itself once you're back on the network."}
            </Alert>

            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Your reference — quote this if you call or email about it:
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h5" sx={{ fontFamily: "monospace", letterSpacing: 1 }}>
                  {result.code}
                </Typography>
                <Button size="small" startIcon={<ContentCopyOutlined />} onClick={copyCode}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
      ) : (
        <DialogContent>
          <Stack spacing={2.5}>
            <Typography variant="body2" color="text.secondary">
              We automatically include your app version, device, screen, and recent activity — so
              just describe what happened in your own words.
            </Typography>

            <TextField
              label="What went wrong?"
              placeholder="e.g. Photo wouldn't attach to step 4"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              fullWidth
              autoFocus
            />

            <TextField
              label="What were you doing, and what did you expect?"
              placeholder={"e.g. I tapped Add photo on the Chambers install, took the picture,\nand it went back to the step with no photo. I expected it to be attached."}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              multiline
              minRows={4}
            />

            <FormControl>
              <FormLabel>How much is this affecting you?</FormLabel>
              <RadioGroup value={severity} onChange={(e) => setSeverity(e.target.value as FaultSeverity)}>
                {IMPACT_OPTIONS.map((opt) => (
                  <FormControlLabel
                    key={opt.value}
                    value={opt.value}
                    control={<Radio size="small" />}
                    label={
                      <Box>
                        <Typography variant="body2">{opt.label}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {opt.hint}
                        </Typography>
                      </Box>
                    }
                  />
                ))}
              </RadioGroup>
            </FormControl>
          </Stack>
        </DialogContent>
      )}

      <DialogActions>
        {result ? (
          <Button variant="contained" onClick={handleClose}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={submitting}
              startIcon={submitting ? <CircularProgress size={16} /> : undefined}
            >
              {submitting ? "Sending…" : "Send report"}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
