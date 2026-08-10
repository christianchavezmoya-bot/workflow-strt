import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { EditOutlined } from "@mui/icons-material";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";
import type { ProjectAsset } from "../../types/projectAsset";
import type { ProjectContact } from "../../types/projectContact";
import { projectContactService } from "../../services/projectContactService";
import { signatureService, type CreateTokenPayload } from "../../services/signatureService";
import { resolvePublicFrontendBaseUrl } from "../../services/publicFrontendBase";

type Props = {
  open: boolean;
  asset: ProjectAsset;
  run: AssetWorkflowRun;
  jobNumber?: string;
  onClose: () => void;
  onSent?: () => void;
};

export default function RequestCustomerSignatureDialog({
  open,
  asset,
  run,
  jobNumber,
  onClose,
  onSent,
}: Props) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"));
  const [tokenEmail, setTokenEmail] = useState("");
  const [tokenName, setTokenName] = useState("");
  const [tokenMessage, setTokenMessage] = useState("");
  const [tokenSending, setTokenSending] = useState(false);
  const [tokenLink, setTokenLink] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [tokenWarning, setTokenWarning] = useState<string | null>(null);
  const [projectContacts, setProjectContacts] = useState<ProjectContact[]>([]);
  const [autoContact, setAutoContact] = useState<ProjectContact | null>(null);
  const [tokenEditMode, setTokenEditMode] = useState(false);
  const [tokenSaveAsNew, setTokenSaveAsNew] = useState(false);

  const buildDefaultMessage = () => {
    const assetLabel = asset.assetTag || asset.assetName || "this asset";
    const jobLabel = jobNumber ? ` on job ${jobNumber}` : "";
    return `We are pleased to inform you that field work for asset ${assetLabel}${jobLabel} has been completed. Please use the link below to review the completed workflow documentation and provide your sign-off.`;
  };

  useEffect(() => {
    if (!open) return;
    setTokenLink(null);
    setTokenError(null);
    setTokenWarning(null);
    setTokenEditMode(false);
    setTokenSaveAsNew(false);
    setTokenMessage(buildDefaultMessage());
    void (async () => {
      try {
        const contacts = await projectContactService.listContacts(asset.projectId);
        setProjectContacts(contacts);
        const primary = contacts.find((c) => c.isPrimarySigner) ?? contacts[0] ?? null;
        setAutoContact(primary);
        setTokenEmail(primary?.email ?? "");
        setTokenName(primary?.name ?? "");
      } catch {
        setProjectContacts([]);
        setAutoContact(null);
        setTokenEmail("");
        setTokenName("");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, asset.id, asset.projectId, jobNumber]);

  const handleClose = () => {
    setTokenLink(null);
    setTokenError(null);
    setTokenWarning(null);
    setTokenEditMode(false);
    setTokenSaveAsNew(false);
    onClose();
  };

  const handleCreateToken = async () => {
    setTokenSending(true);
    setTokenError(null);
    setTokenWarning(null);
    try {
      const isUsingAutoContact = !tokenEditMode && autoContact != null;
      const payload: CreateTokenPayload = {
        runId: run.id,
        contactId: isUsingAutoContact ? autoContact!.id : undefined,
        recipientEmail: tokenEmail,
        recipientName: tokenName || undefined,
        expiresInHours: 72,
        customMessage: tokenMessage.trim() || undefined,
      };
      const token = await signatureService.createToken(payload);
      const baseUrl = await resolvePublicFrontendBaseUrl();
      setTokenLink(`${baseUrl}/sign/${token.id}`);

      if (tokenSaveAsNew && tokenEmail.trim()) {
        try {
          await projectContactService.createContact(asset.projectId, {
            name: tokenName || tokenEmail,
            email: tokenEmail,
            phone: "",
            title: "",
            preferredSignMethod: "email",
            isPrimarySigner: false,
            ccReports: false,
            address: "",
          });
        } catch {
          setTokenWarning("Signature email was sent, but the new project contact could not be saved.");
        }
      }

      if (projectContacts.length === 0 && tokenEmail.trim()) {
        try {
          const saved = await projectContactService.createContact(asset.projectId, {
            name: tokenName || tokenEmail,
            email: tokenEmail,
            phone: "",
            title: "",
            preferredSignMethod: "email",
            isPrimarySigner: true,
            ccReports: false,
            address: "",
          });
          setProjectContacts([saved]);
          setAutoContact(saved);
        } catch {
          setTokenWarning("Signature email was sent, but Customer 1 could not be saved to project contacts.");
        }
      }
      onSent?.();
    } catch (error: unknown) {
      const apiMessage = (error as { response?: { data?: { message?: string; detail?: string } } })?.response?.data;
      setTokenError(apiMessage?.message ?? apiMessage?.detail ?? "Customer signature email could not be sent.");
    } finally {
      setTokenSending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullScreen={isPhone}
      maxWidth={isPhone ? false : "sm"}
      fullWidth
    >
      <DialogTitle>Request Customer Signature</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {tokenError && <Alert severity="error">{tokenError}</Alert>}
          {tokenWarning && !tokenError && <Alert severity="warning">{tokenWarning}</Alert>}
          {tokenLink ? (
            <>
              <Alert severity="success">
                Secure link generated and email sent to {tokenEmail} for asset {asset.assetTag || asset.assetName || asset.id}.
              </Alert>
              <Box sx={{ p: 1.5, background: "rgba(0,0,0,0.2)", borderRadius: 1, wordBreak: "break-all" }}>
                <Typography variant="caption" fontFamily="monospace">{tokenLink}</Typography>
              </Box>
              <Button
                variant="outlined"
                onClick={() => { void navigator.clipboard.writeText(tokenLink); }}
                fullWidth={isPhone}
              >
                Copy link
              </Button>
            </>
          ) : (
            <>
              <Typography variant="subtitle2">Recipient</Typography>
              {autoContact && !tokenEditMode ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1,
                  p: 1, borderRadius: 1, background: "rgba(45,212,191,0.08)",
                  border: "1px solid rgba(45,212,191,0.25)" }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight="bold">{tokenName || autoContact.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{tokenEmail || autoContact.email}</Typography>
                  </Box>
                  <Tooltip title="Send to a different person">
                    <IconButton size="small" onClick={() => setTokenEditMode(true)}>
                      <EditOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              ) : (
                <>
                  {projectContacts.length === 0 && (
                    <Alert severity="info" sx={{ py: 0.5, fontSize: "0.8rem" }}>
                      No contacts on file for this project. Enter details below — they will be saved as Customer 1.
                    </Alert>
                  )}
                  <TextField
                    label="Customer name"
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value)}
                    size="small"
                    fullWidth
                  />
                  <TextField
                    label="Customer email *"
                    value={tokenEmail}
                    onChange={(e) => setTokenEmail(e.target.value)}
                    size="small"
                    fullWidth
                    type="email"
                  />
                  {tokenEditMode && autoContact && (
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={tokenSaveAsNew}
                          onChange={(e) => setTokenSaveAsNew(e.target.checked)}
                        />
                      }
                      label={<Typography variant="body2">Save as Customer 2 in project contacts</Typography>}
                    />
                  )}
                </>
              )}

              <Divider />

              <Typography variant="subtitle2">Message to customer</Typography>
              <TextField
                label="Invitation message"
                value={tokenMessage}
                onChange={(e) => setTokenMessage(e.target.value)}
                size="small"
                fullWidth
                multiline
                minRows={4}
                helperText="Included in the email sent to the customer. Leave as default or customise."
              />

              <Typography variant="caption" color="text.disabled">
                A one-time secure link valid for 72 hours will be generated and sent automatically.
              </Typography>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexDirection: isPhone ? "column-reverse" : "row", gap: 1, px: 2, pb: 2 }}>
        <Button onClick={handleClose} fullWidth={isPhone}>
          {tokenLink ? "Done" : "Cancel"}
        </Button>
        {!tokenLink && (
          <Button
            variant="contained"
            onClick={() => { void handleCreateToken(); }}
            disabled={!tokenEmail.trim() || tokenSending}
            fullWidth={isPhone}
          >
            {tokenSending ? <CircularProgress size={18} /> : "Send to customer"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
