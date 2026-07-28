import { useEffect, useMemo, useState } from "react";
import {
  ContentCopyOutlined,
  EmailOutlined,
  PersonOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { projectContactService } from "../../services/projectContactService";
import {
  assetReportShareService,
  type AssetReportShareRecipient,
} from "../../services/assetReportShareService";
import type { ProjectContact } from "../../types/projectContact";
import type { User } from "../../types/user";
import { blobToBase64 } from "../../utils/blobBase64";
import type { WorkflowReportDownloadItem } from "../../utils/bulkWorkflowReportDownload";
import { workflowReportPdfFileName } from "../../utils/bulkWorkflowReportDownload";

type RecipientTab = "users" | "contacts" | "custom";

export type AssetReportShareDialogProps = {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  jobLabel?: string;
  users: User[];
  reports: WorkflowReportDownloadItem[];
};

function defaultShareMessage(jobLabel?: string, count = 1): string {
  const jobPart = jobLabel ? ` for job ${jobLabel}` : "";
  if (count === 1) {
    return `Please find the attached installation report${jobPart}.`;
  }
  return `Please find ${count} installation reports${jobPart}.`;
}

export function AssetReportShareDialog({
  open,
  onClose,
  projectId,
  jobLabel,
  users,
  reports,
}: AssetReportShareDialogProps) {
  const [tab, setTab] = useState<RecipientTab>("contacts");
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [contacts, setContacts] = useState<ProjectContact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<ProjectContact[]>([]);
  const [customEmail, setCustomEmail] = useState("");
  const [customName, setCustomName] = useState("");
  const [customRecipients, setCustomRecipients] = useState<AssetReportShareRecipient[]>([]);
  const [message, setMessage] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const activeUsers = useMemo(
    () => users.filter((user) => user.isActive && user.email.trim()),
    [users],
  );

  const contactsWithEmail = useMemo(
    () => contacts.filter((contact) => contact.email?.trim()),
    [contacts],
  );

  const recipients = useMemo((): AssetReportShareRecipient[] => {
    const map = new Map<string, AssetReportShareRecipient>();
    for (const user of selectedUsers) {
      map.set(user.email.toLowerCase(), { email: user.email.trim(), name: user.fullName });
    }
    for (const contact of selectedContacts) {
      const email = contact.email?.trim();
      if (!email) continue;
      map.set(email.toLowerCase(), { email, name: contact.name });
    }
    for (const custom of customRecipients) {
      map.set(custom.email.toLowerCase(), custom);
    }
    return [...map.values()];
  }, [selectedUsers, selectedContacts, customRecipients]);

  useEffect(() => {
    if (!open) return;
    setTab(projectId ? "contacts" : "users");
    setSelectedUsers([]);
    setSelectedContacts([]);
    setCustomEmail("");
    setCustomName("");
    setCustomRecipients([]);
    setMessage(defaultShareMessage(jobLabel, reports.length));
    setSendEmail(true);
    setBusy(false);
    setError(null);
    setShareUrl(null);
    setStatusMessage(null);

    if (!projectId) {
      setContacts([]);
      return;
    }

    void projectContactService.listContacts(projectId)
      .then((items) => {
        setContacts(items);
        const primary = items.find((item) => item.isPrimarySigner && item.email?.trim())
          ?? items.find((item) => item.email?.trim())
          ?? null;
        setSelectedContacts(primary ? [primary] : []);
      })
      .catch(() => setContacts([]));
  }, [open, projectId, jobLabel, reports.length]);

  function addCustomRecipient() {
    const email = customEmail.trim();
    if (!email) return;
    setCustomRecipients((prev) => {
      if (prev.some((item) => item.email.toLowerCase() === email.toLowerCase())) return prev;
      return [...prev, { email, name: customName.trim() || undefined }];
    });
    setCustomEmail("");
    setCustomName("");
  }

  async function buildAttachments() {
    return Promise.all(
      reports.map(async (item) => ({
        fileName: workflowReportPdfFileName(item.context),
        contentBase64: await blobToBase64(item.blob),
      })),
    );
  }

  async function handleCreateShare(options: { sendEmail: boolean }) {
    if (reports.length === 0) {
      setError("No reports are ready to share.");
      return null;
    }
    if (options.sendEmail && recipients.length === 0) {
      setError("Choose at least one recipient.");
      return null;
    }

    setBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const attachments = await buildAttachments();
      const response = await assetReportShareService.createShare({
        projectId,
        jobLabel,
        message: message.trim() || undefined,
        recipients,
        attachments,
        sendEmail: options.sendEmail,
        expiresInHours: 168,
      });
      setShareUrl(response.shareUrl);

      if (options.sendEmail) {
        const sent = response.emailResults.filter((item) => item.success).length;
        const failed = response.emailResults.length - sent;
        setStatusMessage(
          failed > 0
            ? `Sent ${sent} email(s). ${failed} failed — check recipient addresses or email settings.`
            : `Sent ${sent} email${sent === 1 ? "" : "s"} successfully.`,
        );
      }
      return response.shareUrl;
    } catch (err) {
      console.error("[AssetReportShareDialog] Share failed", err);
      setError("Failed to create share link or send email.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyLink() {
    const url = shareUrl ?? await handleCreateShare({ sendEmail: false });
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setStatusMessage("Share link copied to clipboard.");
    } catch {
      setStatusMessage("Share link created — copy it from the field below.");
    }
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Email / Share Reports</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="info">
            {reports.length} report{reports.length !== 1 ? "s" : ""} will be shared
            {jobLabel ? ` for job ${jobLabel}` : ""}. Recipients receive a secure download link; single small PDFs may be attached directly.
          </Alert>

          <Tabs value={tab} onChange={(_, value: RecipientTab) => setTab(value)} variant="fullWidth">
            <Tab value="users" label="Users" icon={<PersonOutlined fontSize="small" />} iconPosition="start" />
            <Tab value="contacts" label="Project contacts" disabled={!projectId} />
            <Tab value="custom" label="Custom email" />
          </Tabs>

          {tab === "users" && (
            <Autocomplete
              multiple
              options={activeUsers}
              value={selectedUsers}
              onChange={(_, value) => setSelectedUsers(value)}
              getOptionLabel={(option) => `${option.fullName} (${option.email})`}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => (
                <TextField {...params} label="Commtrac users" placeholder="Select one or more users" />
              )}
            />
          )}

          {tab === "contacts" && (
            <Autocomplete
              multiple
              options={contactsWithEmail}
              value={selectedContacts}
              onChange={(_, value) => setSelectedContacts(value)}
              getOptionLabel={(option) => `${option.name}${option.email ? ` (${option.email})` : ""}`}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              noOptionsText={projectId ? "No project contacts with email" : "Select a project first"}
              renderInput={(params) => (
                <TextField {...params} label="Project customer contacts" placeholder="Select contacts from this project" />
              )}
            />
          )}

          {tab === "custom" && (
            <Stack spacing={1}>
              <TextField
                label="Email address"
                type="email"
                value={customEmail}
                onChange={(event) => setCustomEmail(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCustomRecipient();
                  }
                }}
              />
              <TextField
                label="Recipient name (optional)"
                value={customName}
                onChange={(event) => setCustomName(event.target.value)}
              />
              <Button variant="outlined" onClick={addCustomRecipient} disabled={!customEmail.trim()}>
                Add recipient
              </Button>
              {customRecipients.length > 0 && (
                <Box>
                  {customRecipients.map((recipient) => (
                    <Typography key={recipient.email} variant="body2" color="text.secondary">
                      {recipient.name ? `${recipient.name} — ` : ""}{recipient.email}
                    </Typography>
                  ))}
                </Box>
              )}
            </Stack>
          )}

          <TextField
            label="Message"
            multiline
            minRows={3}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />

          <FormControlLabel
            control={<Switch checked={sendEmail} onChange={(event) => setSendEmail(event.target.checked)} />}
            label="Send email to selected recipients"
          />

          {recipients.length > 0 && (
            <Typography variant="caption" color="text.secondary">
              {recipients.length} recipient{recipients.length !== 1 ? "s" : ""} selected
            </Typography>
          )}

          {shareUrl && (
            <TextField
              label="Share link"
              value={shareUrl}
              fullWidth
              InputProps={{ readOnly: true }}
              helperText="Anyone with this link can download the report ZIP until it expires."
            />
          )}

          {error && <Alert severity="error">{error}</Alert>}
          {statusMessage && <Alert severity={statusMessage.includes("failed") ? "warning" : "success"}>{statusMessage}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Close</Button>
        <Button
          variant="outlined"
          startIcon={busy ? <CircularProgress size={14} /> : <ContentCopyOutlined fontSize="small" />}
          disabled={busy || reports.length === 0}
          onClick={() => void handleCopyLink()}
        >
          Copy share link
        </Button>
        <Button
          variant="contained"
          startIcon={busy ? <CircularProgress size={14} /> : <EmailOutlined fontSize="small" />}
          disabled={busy || reports.length === 0 || (sendEmail && recipients.length === 0)}
          onClick={() => void handleCreateShare({ sendEmail })}
        >
          {sendEmail ? "Send email" : "Create link"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
