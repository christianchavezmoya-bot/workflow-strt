import { DrawOutlined } from "@mui/icons-material";
import {
  Alert,
  Button,
  Checkbox,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { ChangeEvent, MutableRefObject } from "react";
import SignaturePad from "../../components/ui/SignaturePad";
import { renderAssetIdentifier } from "./workOrderRunnerUi";

export type InstallerSignOutcome = "Completed" | "Conditional";

export interface WorkOrderRunnerInstallerSignStageProps {
  assetTag?: string;
  stepsCount: number;
  instName: string;
  onInstNameChange: (value: string) => void;
  instOutcome: InstallerSignOutcome;
  onInstOutcomeChange: (value: InstallerSignOutcome) => void;
  instNotes: string;
  onInstNotesChange: (value: string) => void;
  instConsent: boolean;
  onInstConsentChange: (checked: boolean) => void;
  instError: string | null;
  instSaving: boolean;
  instPadOnChange: MutableRefObject<(dataUrl: string | null) => void>;
  onClose: () => void;
  onSign: () => void;
}

export default function WorkOrderRunnerInstallerSignStage({
  assetTag,
  stepsCount,
  instName,
  onInstNameChange,
  instOutcome,
  onInstOutcomeChange,
  instNotes,
  onInstNotesChange,
  instConsent,
  onInstConsentChange,
  instError,
  instSaving,
  instPadOnChange,
  onClose,
  onSign,
}: WorkOrderRunnerInstallerSignStageProps) {
  return (
    <>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <DrawOutlined color="primary" />
          <Typography variant="subtitle1" fontWeight={600}>
            Field sign-off
          </Typography>
        </Stack>
        {renderAssetIdentifier(assetTag)}
        <Typography variant="caption" color="text.secondary">
          Step {stepsCount + 1} of {stepsCount + 2} - sign to confirm workflow completion
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Your name *"
            size="small"
            fullWidth
            value={instName}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onInstNameChange(e.target.value)}
          />
          <Stack direction="row" spacing={1}>
            <BoxLikeOutcomeSelect value={instOutcome} onChange={onInstOutcomeChange} />
          </Stack>
          <SignaturePad label="Draw your signature below (optional)" onChange={instPadOnChange.current} height={140} />
          <TextField
            label="Notes (optional)"
            size="small"
            fullWidth
            multiline
            minRows={2}
            value={instNotes}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onInstNotesChange(e.target.value)}
          />
          <Alert severity="info" sx={{ fontSize: 12 }}>
            Signing confirms that all recorded time entries and captured field data are correct. After you sign, you
            will not be able to edit time or field captures. Project Managers and Admins may still make corrections
            until customer sign-off.
          </Alert>
          <FormControlLabel
            control={
              <Checkbox checked={instConsent} onChange={(e) => onInstConsentChange(e.target.checked)} size="small" />
            }
            label={
              <Typography variant="body2" sx={{ fontSize: 12 }}>
                I confirm all recorded time and captured field data are correct, and I understand I cannot edit them
                after signing.
              </Typography>
            }
          />
          {instError && (
            <Alert severity="error" sx={{ fontSize: 12 }}>
              {instError}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Skip & close</Button>
        <Button
          variant="contained"
          onClick={onSign}
          disabled={instSaving || !instName.trim() || !instConsent}
          startIcon={instSaving ? <CircularProgress size={14} /> : undefined}
        >
          {instSaving ? "Signing..." : "Sign & continue"}
        </Button>
      </DialogActions>
    </>
  );
}

function BoxLikeOutcomeSelect({
  value,
  onChange,
}: {
  value: InstallerSignOutcome;
  onChange: (value: InstallerSignOutcome) => void;
}) {
  return (
    <Stack sx={{ flex: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
        Outcome
      </Typography>
      <Select size="small" fullWidth value={value} onChange={(e) => onChange(e.target.value as InstallerSignOutcome)}>
        <MenuItem value="Completed">Completed - work done as specified</MenuItem>
        <MenuItem value="Conditional">Conditional - completed with conditions</MenuItem>
      </Select>
    </Stack>
  );
}
