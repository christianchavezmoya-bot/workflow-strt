import { CheckCircleOutlined, DeleteOutlineOutlined } from "@mui/icons-material";
import type { Dispatch, SetStateAction } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { BomActualItem, Workflow } from "../../types/workflow";
import { randomId } from "../../utils/randomId";
import { renderAssetIdentifier } from "./workOrderRunnerUi";

export interface UnlistedConsumable {
  id: string;
  description: string;
  qty: number;
  unit: string;
}

export interface WorkOrderRunnerConsumablesStageProps {
  assetTag?: string;
  workflow: Workflow;
  bomActual: BomActualItem[];
  setBomActual: Dispatch<SetStateAction<BomActualItem[]>>;
  unlistedConsumables: UnlistedConsumable[];
  setUnlistedConsumables: Dispatch<SetStateAction<UnlistedConsumable[]>>;
  saving: boolean;
  onBack: () => void;
  onComplete: (mergedBomActual: BomActualItem[]) => void;
}

export default function WorkOrderRunnerConsumablesStage({
  assetTag,
  workflow,
  bomActual,
  setBomActual,
  unlistedConsumables,
  setUnlistedConsumables,
  saving,
  onBack,
  onComplete,
}: WorkOrderRunnerConsumablesStageProps) {
  const consumableItems = (workflow.bomItems ?? []).filter((i) => !i.isInventory);
  const hasInventory = (workflow.bomItems ?? []).some((i) => i.isInventory);
  const allConfirmedAsPlanned = bomActual
    .filter((a) => !a.isInventory)
    .every((a) => !a.isNA && a.actualQty === a.expectedQty);

  const hasDeviations = bomActual.some((a) => !a.isInventory && (a.isNA || a.actualQty !== a.expectedQty))
    || unlistedConsumables.length > 0;

  return (
    <>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <CheckCircleOutlined color="primary" />
          <Typography variant="subtitle1" fontWeight={600}>Consumables Used</Typography>
        </Stack>
        {renderAssetIdentifier(assetTag)}
        <Typography variant="caption" color="text.secondary">
          Confirm what was used. Tap "Confirm all as planned" if nothing changed.
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          <Button
            variant={allConfirmedAsPlanned && unlistedConsumables.length === 0 ? "contained" : "outlined"}
            color="success"
            size="small"
            onClick={() => {
              setBomActual((prev) => prev.map((a) =>
                a.isInventory ? a : { ...a, actualQty: a.expectedQty, isNA: false },
              ));
              setUnlistedConsumables([]);
            }}
          >
            Confirm all as planned
          </Button>

          {consumableItems.map((item) => {
            const actual = bomActual.find((a) => a.bomItemId === item.id);
            if (!actual) return null;
            const isDifferent = actual.isNA || actual.actualQty !== actual.expectedQty;
            return (
              <Paper
                key={item.id}
                variant="outlined"
                sx={{ p: 1.5, borderColor: isDifferent ? "warning.main" : "divider" }}
              >
                <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                  <Typography variant="body2" fontWeight={600} sx={{ flex: 1, minWidth: 120 }}>
                    {item.description}
                  </Typography>
                  {item.partNumber && (
                    <Typography variant="caption" color="text.secondary">{item.partNumber}</Typography>
                  )}
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={!!actual.isNA}
                        onChange={(e) => setBomActual((prev) => prev.map((a) =>
                          a.bomItemId !== item.id ? a : { ...a, isNA: e.target.checked, actualQty: e.target.checked ? 0 : a.expectedQty },
                        ))}
                      />
                    }
                    label={<Typography variant="caption">N/A</Typography>}
                    sx={{ m: 0 }}
                  />
                  {!actual.isNA && (
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <TextField
                        size="small"
                        type="number"
                        label="Used"
                        InputLabelProps={{ shrink: true }}
                        sx={{ width: 80 }}
                        value={actual.actualQty}
                        onChange={(e) => {
                          const qty = Math.max(0, Number(e.target.value) || 0);
                          setBomActual((prev) => prev.map((a) =>
                            a.bomItemId !== item.id ? a : { ...a, actualQty: qty },
                          ));
                        }}
                      />
                      <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                        / {item.expectedQty} {item.unitOfMeasure}
                      </Typography>
                    </Stack>
                  )}
                  {actual.isNA && (
                    <Typography variant="caption" color="text.secondary" fontStyle="italic">Not used</Typography>
                  )}
                </Stack>
              </Paper>
            );
          })}

          {unlistedConsumables.map((u) => (
            <Paper key={u.id} variant="outlined" sx={{ p: 1.5, borderColor: "warning.main" }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip label="Unlisted" size="small" color="warning" variant="outlined" />
                <TextField
                  size="small"
                  label="Description"
                  InputLabelProps={{ shrink: true }}
                  value={u.description}
                  onChange={(e) => setUnlistedConsumables((prev) => prev.map((x) => x.id !== u.id ? x : { ...x, description: e.target.value }))}
                  sx={{ flex: 1, minWidth: 140 }}
                />
                <TextField
                  size="small"
                  type="number"
                  label="Qty"
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 70 }}
                  value={u.qty}
                  onChange={(e) => setUnlistedConsumables((prev) => prev.map((x) => x.id !== u.id ? x : { ...x, qty: Math.max(0, Number(e.target.value) || 0) }))}
                />
                <TextField
                  size="small"
                  label="Unit"
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 60 }}
                  value={u.unit}
                  onChange={(e) => setUnlistedConsumables((prev) => prev.map((x) => x.id !== u.id ? x : { ...x, unit: e.target.value }))}
                />
                <IconButton size="small" onClick={() => setUnlistedConsumables((prev) => prev.filter((x) => x.id !== u.id))}>
                  <DeleteOutlineOutlined fontSize="small" />
                </IconButton>
              </Stack>
            </Paper>
          ))}

          <Button
            size="small"
            variant="text"
            onClick={() => setUnlistedConsumables((prev) => [
              ...prev,
              { id: randomId(), description: "", qty: 1, unit: "ea" },
            ])}
          >
            + Add unlisted item
          </Button>

          {hasDeviations && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              Deviations noted - PM will be notified on completion.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onBack} disabled={saving}>Back</Button>
        <Button
          variant="contained"
          onClick={() => {
            const unlistedActual: BomActualItem[] = unlistedConsumables
              .filter((u) => u.description.trim())
              .map((u) => ({
                bomItemId: `unlisted-${u.id}`,
                description: u.description,
                isInventory: false,
                isUnlisted: true,
                expectedQty: 0,
                actualQty: u.qty,
                unitOfMeasure: u.unit,
              }));
            const merged = [
              ...bomActual.filter((a) => !a.isUnlisted),
              ...unlistedActual,
            ];
            onComplete(merged);
          }}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={14} /> : undefined}
        >
          {saving ? "Saving..." : "Complete & sign"}
        </Button>
      </DialogActions>
    </>
  );
}
