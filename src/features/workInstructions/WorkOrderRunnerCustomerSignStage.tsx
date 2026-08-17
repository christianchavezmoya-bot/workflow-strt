import { DrawOutlined, EmailOutlined } from "@mui/icons-material";
import {
  Alert,
  Button,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { ChangeEvent, MutableRefObject } from "react";
import SignaturePad from "../../components/ui/SignaturePad";
import { renderAssetIdentifier } from "./workOrderRunnerUi";

export type CustomerSignMode = "options" | "sign-now" | "send-link";
export type CustomerSignOutcome = "Completed" | "Conditional" | "Declined";

export interface WorkOrderRunnerCustomerSignStageProps {
  assetTag?: string;
  stepsCount: number;
  custMode: CustomerSignMode;
  onCustModeChange: (mode: CustomerSignMode) => void;
  custName: string;
  onCustNameChange: (value: string) => void;
  custTitle: string;
  onCustTitleChange: (value: string) => void;
  custEmail: string;
  onCustEmailChange: (value: string) => void;
  custOutcome: CustomerSignOutcome;
  onCustOutcomeChange: (value: CustomerSignOutcome) => void;
  custNotes: string;
  onCustNotesChange: (value: string) => void;
  custPadOnChange: MutableRefObject<(dataUrl: string | null) => void>;
  linkSent: boolean;
  linkEmail: string;
  onLinkEmailChange: (value: string) => void;
  linkName: string;
  onLinkNameChange: (value: string) => void;
  linkHours: number;
  onLinkHoursChange: (value: number) => void;
  linkMsg: string;
  onLinkMsgChange: (value: string) => void;
  custError: string | null;
  onClearCustError: () => void;
  custSaving: boolean;
  linkSending: boolean;
  onClose: () => void;
  onWaiveSignature: () => void;
  onSignNow: () => void;
  onSendLink: () => void;
}

export default function WorkOrderRunnerCustomerSignStage({
  assetTag,
  stepsCount,
  custMode,
  onCustModeChange,
  custName,
  onCustNameChange,
  custTitle,
  onCustTitleChange,
  custEmail,
  onCustEmailChange,
  custOutcome,
  onCustOutcomeChange,
  custNotes,
  onCustNotesChange,
  custPadOnChange,
  linkSent,
  linkEmail,
  onLinkEmailChange,
  linkName,
  onLinkNameChange,
  linkHours,
  onLinkHoursChange,
  linkMsg,
  onLinkMsgChange,
  custError,
  onClearCustError,
  custSaving,
  linkSending,
  onClose,
  onWaiveSignature,
  onSignNow,
  onSendLink,
}: WorkOrderRunnerCustomerSignStageProps) {
  return (
    <>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <DrawOutlined color="success" />
          <Typography variant="subtitle1" fontWeight={600}>
            Customer sign-off
          </Typography>
        </Stack>
        {renderAssetIdentifier(assetTag)}
        <Typography variant="caption" color="text.secondary">
          Step {stepsCount + 2} of {stepsCount + 2} - customer approval
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {custMode === "options" && (
            <Stack spacing={1.5}>
              <Button
                fullWidth
                variant="outlined"
                size="large"
                startIcon={<DrawOutlined />}
                onClick={() => onCustModeChange("sign-now")}
                sx={{ justifyContent: "flex-start", textTransform: "none", py: 1.5 }}
              >
                <BoxLikeButtonText
                  title="Sign here now"
                  subtitle="Customer is present - hand them the device to sign"
                />
              </Button>
              <Button
                fullWidth
                variant="outlined"
                size="large"
                startIcon={<EmailOutlined />}
                onClick={() => onCustModeChange("send-link")}
                sx={{ justifyContent: "flex-start", textTransform: "none", py: 1.5 }}
              >
                <BoxLikeButtonText
                  title="Send signature link"
                  subtitle="Email a secure link - run stays pending until customer signs"
                />
              </Button>
              <Button
                fullWidth
                variant="text"
                size="large"
                onClick={onWaiveSignature}
                sx={{ justifyContent: "flex-start", textTransform: "none", color: "text.secondary" }}
              >
                <BoxLikeButtonText
                  title="Skip - no customer signature required"
                  subtitle="Run completes without customer approval"
                  subtitleColor="text.disabled"
                />
              </Button>
            </Stack>
          )}

          {custMode === "sign-now" && (
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1}>
                <TextField
                  label="Customer name *"
                  size="small"
                  fullWidth
                  value={custName}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => onCustNameChange(e.target.value)}
                />
                <TextField
                  label="Title / Role"
                  size="small"
                  fullWidth
                  value={custTitle}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => onCustTitleChange(e.target.value)}
                />
              </Stack>
              <TextField
                label="Email (optional)"
                size="small"
                fullWidth
                value={custEmail}
                onChange={(e: ChangeEvent<HTMLInputElement>) => onCustEmailChange(e.target.value)}
              />
              <Select
                size="small"
                fullWidth
                value={custOutcome}
                onChange={(e) => onCustOutcomeChange(e.target.value as CustomerSignOutcome)}
              >
                <MenuItem value="Completed">Completed - work accepted</MenuItem>
                <MenuItem value="Conditional">Conditional - accepted with conditions</MenuItem>
                <MenuItem value="Declined">Declined - work not accepted</MenuItem>
              </Select>
              <SignaturePad label="Customer signature (optional)" onChange={custPadOnChange.current} height={140} />
              <TextField
                label="Notes (optional)"
                size="small"
                fullWidth
                multiline
                minRows={2}
                value={custNotes}
                onChange={(e: ChangeEvent<HTMLInputElement>) => onCustNotesChange(e.target.value)}
              />
            </Stack>
          )}

          {custMode === "send-link" && !linkSent && (
            <Stack spacing={1.5}>
              <Alert severity="info" sx={{ fontSize: 12 }}>
                The customer will receive a secure link to review and sign the completed workflow documentation.
              </Alert>
              <TextField
                label="Recipient email *"
                size="small"
                fullWidth
                value={linkEmail}
                onChange={(e: ChangeEvent<HTMLInputElement>) => onLinkEmailChange(e.target.value)}
              />
              <TextField
                label="Recipient name"
                size="small"
                fullWidth
                value={linkName}
                onChange={(e: ChangeEvent<HTMLInputElement>) => onLinkNameChange(e.target.value)}
              />
              <TextField
                label="Link expires in (hours)"
                type="number"
                size="small"
                fullWidth
                value={linkHours}
                onChange={(e: ChangeEvent<HTMLInputElement>) => onLinkHoursChange(Number(e.target.value))}
              />
              <TextField
                label="Message to customer (optional)"
                size="small"
                fullWidth
                multiline
                minRows={3}
                value={linkMsg}
                onChange={(e: ChangeEvent<HTMLInputElement>) => onLinkMsgChange(e.target.value)}
              />
            </Stack>
          )}

          {linkSent && (
            <Alert severity="success" sx={{ fontSize: 12 }}>
              Signature link sent to {linkEmail}. The run will update automatically when the customer signs.
            </Alert>
          )}

          {custError && (
            <Alert severity="error" sx={{ fontSize: 12 }}>
              {custError}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {custMode !== "options" && !linkSent && (
          <Button
            onClick={() => {
              onCustModeChange("options");
              onClearCustError();
            }}
          >
            Back
          </Button>
        )}
        <Button onClick={onClose}>{linkSent ? "Close" : "Close without signing"}</Button>
        {custMode === "sign-now" && (
          <Button
            variant="contained"
            onClick={onSignNow}
            disabled={custSaving || !custName.trim()}
            startIcon={custSaving ? <CircularProgress size={14} /> : undefined}
          >
            {custSaving ? "Signing..." : "Confirm signature"}
          </Button>
        )}
        {custMode === "send-link" && !linkSent && (
          <Button
            variant="contained"
            onClick={onSendLink}
            disabled={linkSending || !linkEmail.trim()}
            startIcon={linkSending ? <CircularProgress size={14} /> : <EmailOutlined />}
          >
            {linkSending ? "Sending..." : "Send link"}
          </Button>
        )}
      </DialogActions>
    </>
  );
}

function BoxLikeButtonText({
  title,
  subtitle,
  subtitleColor = "text.secondary",
}: {
  title: string;
  subtitle: string;
  subtitleColor?: "text.secondary" | "text.disabled";
}) {
  return (
    <Stack sx={{ textAlign: "left" }}>
      <Typography variant="body2" fontWeight={600}>
        {title}
      </Typography>
      <Typography variant="caption" color={subtitleColor}>
        {subtitle}
      </Typography>
    </Stack>
  );
}
