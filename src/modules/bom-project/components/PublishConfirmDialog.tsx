/**
 * PublishConfirmDialog.tsx
 * Shown before a "publish" commit. Summarises what will be created and
 * asks the user to explicitly accept the integration before live records
 * are written.
 */
import { useState } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Stack, Divider, Alert, Chip, Box,
  FormControlLabel, Checkbox,
} from "@mui/material";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import DevicesOtherOutlinedIcon from "@mui/icons-material/DevicesOtherOutlined";
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";
import type { DraftProject } from "../types/projectDraft";

interface Props {
  open: boolean;
  draft: DraftProject;
  customerName: string;
  jobNumber: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function PublishConfirmDialog({
  open, draft, customerName, jobNumber, onConfirm, onCancel,
}: Props) {
  const [accepted, setAccepted] = useState(false);

  // Reset checkbox each time dialog opens
  const handleEnter = () => setAccepted(false);

  const assetCount = draft.assets.length;
  const componentCount = draft.assets.reduce((s, a) => s + a.components.length, 0);
  const workflowCount = draft.assets.filter((a) => a.workflowTemplateCandidate).length;
  const inventoryCount = draft.assets.reduce(
    (s, a) => s + a.components.filter((c) => c.inventoryTracked).length,
    0
  );

  return (
    <Dialog open={open} maxWidth="sm" fullWidth TransitionProps={{ onEnter: handleEnter }}>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <WarningAmberOutlinedIcon color="warning" />
          <Typography variant="h6" fontWeight={700}>Confirm Integration</Typography>
        </Stack>
      </DialogTitle>

      <DialogContent>
        <Alert severity="warning" sx={{ mb: 3 }}>
          This will write <strong>live records</strong> to the system. Once published,
          the project and its assets will be immediately visible to all users.
          This action cannot be automatically undone.
        </Alert>

        {/* What will be created */}
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          What will be created
        </Typography>
        <Stack spacing={1.5} sx={{ mb: 2 }}>
          <SummaryRow
            icon={<FolderOpenOutlinedIcon fontSize="small" color="primary" />}
            label="Project"
            value={draft.projectName}
            sub={customerName ? `Customer: ${customerName}` : undefined}
          />
          {jobNumber && (
            <SummaryRow
              icon={<Box sx={{ width: 20 }} />}
              label="Job Number"
              value={jobNumber}
            />
          )}
          <SummaryRow
            icon={<DevicesOtherOutlinedIcon fontSize="small" color="action" />}
            label="Assets"
            value={`${assetCount} asset${assetCount !== 1 ? "s" : ""}`}
          />
          <SummaryRow
            icon={<BuildOutlinedIcon fontSize="small" color="action" />}
            label="Components / Consumables"
            value={`${componentCount} item${componentCount !== 1 ? "s" : ""}`}
            sub={inventoryCount > 0 ? `${inventoryCount} inventory-tracked` : undefined}
          />
          {workflowCount > 0 && (
            <SummaryRow
              icon={<Box sx={{ width: 20 }} />}
              label="Workflow Assignments"
              value={`${workflowCount}`}
            />
          )}
        </Stack>

        <Divider sx={{ my: 2 }} />

        {/* Systems touched */}
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          Systems that will be updated
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip label="Projects" size="small" color="primary" variant="outlined" />
          <Chip label="Project Assets" size="small" color="primary" variant="outlined" />
          {workflowCount > 0 && (
            <Chip label="Workflow Assignments" size="small" color="primary" variant="outlined" />
          )}
          <Chip label="BOM Import Run (status → published)" size="small" variant="outlined" />
        </Stack>

        <Divider sx={{ my: 2.5 }} />

        {/* Explicit acceptance gate */}
        <Box
          sx={{
            p: 1.5,
            borderRadius: 1,
            border: "1px solid",
            borderColor: accepted ? "success.main" : "divider",
            bgcolor: accepted ? "success.50" : "background.paper",
            transition: "border-color 0.2s, background-color 0.2s",
          }}
        >
          <FormControlLabel
            control={
              <Checkbox
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                color="success"
              />
            }
            label={
              <Typography variant="body2">
                I understand that this will create <strong>live project records</strong> visible
                to all users and I accept responsibility for this integration.
              </Typography>
            }
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={onCancel} color="inherit">
          Cancel — go back and review
        </Button>
        <Button
          variant="contained"
          color="success"
          onClick={onConfirm}
          disabled={!accepted}
        >
          Accept & Publish
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function SummaryRow({
  icon, label, value, sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Stack direction="row" alignItems="flex-start" spacing={1}>
      <Box sx={{ mt: 0.25 }}>{icon}</Box>
      <Box sx={{ flex: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="baseline">
          <Typography variant="body2" color="text.secondary">{label}</Typography>
          <Typography variant="body2" fontWeight={600}>{value}</Typography>
        </Stack>
        {sub && (
          <Typography variant="caption" color="text.secondary">{sub}</Typography>
        )}
      </Box>
    </Stack>
  );
}
