import { CheckCircleOutlined, QrCodeScannerOutlined } from "@mui/icons-material";
import type { Dispatch, SetStateAction } from "react";
import {
  Button,
  Chip,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import type { Feature } from "../../types/feature";
import type { BomActualItem, Workflow } from "../../types/workflow";
import { renderAssetIdentifier } from "./workOrderRunnerUi";

export interface WorkOrderRunnerBomStageProps {
  assetTag?: string;
  workflow: Workflow;
  libConsumableFeatures: Feature[];
  bomActual: BomActualItem[];
  setBomActual: Dispatch<SetStateAction<BomActualItem[]>>;
  saving: boolean;
  onBack: () => void;
  onContinue: () => void;
}

export default function WorkOrderRunnerBomStage({
  assetTag,
  workflow,
  libConsumableFeatures,
  bomActual,
  setBomActual,
  saving,
  onBack,
  onContinue,
}: WorkOrderRunnerBomStageProps) {
  const inventoryItems = (workflow.bomItems ?? []).filter((i) => i.isInventory);
  const hasConsumables =
    (workflow.bomItems ?? []).some((i) => !i.isInventory) || libConsumableFeatures.length > 0;

  return (
    <>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <CheckCircleOutlined color="primary" />
          <Typography variant="subtitle1" fontWeight={600}>Confirm Inventory Parts</Typography>
        </Stack>
        {renderAssetIdentifier(assetTag)}
        <Typography variant="caption" color="text.secondary">
          Enter serial numbers and quantities for tracked components.
          {hasConsumables && " Consumables will be confirmed in the next step."}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {inventoryItems.map((item) => {
            const actual = bomActual.find((a) => a.bomItemId === item.id);
            if (!actual) return null;
            return (
              <Paper key={item.id} variant="outlined" sx={{ p: 1.5 }}>
                <Stack spacing={1.5}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Chip label="Inventory" size="small" color="primary" variant="outlined" />
                    <Typography variant="body2" fontWeight={600}>{item.description}</Typography>
                    {item.partNumber && (
                      <Typography variant="caption" color="text.secondary">- {item.partNumber}</Typography>
                    )}
                  </Stack>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <TextField
                      label="Actual qty"
                      size="small"
                      type="number"
                      sx={{ width: 100 }}
                      value={actual.actualQty}
                      onChange={(e) => {
                        const qty = Math.max(0, Number(e.target.value) || 0);
                        setBomActual((prev) => prev.map((a) => a.bomItemId !== item.id ? a : {
                          ...a,
                          actualQty: qty,
                          unitCaptures: Array.from({ length: qty }, (_, i) =>
                            a.unitCaptures?.[i] ?? Object.fromEntries((item.captureFields ?? ["Serial No"]).map((f) => [f, ""]))),
                        }));
                      }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      of {item.expectedQty} {item.unitOfMeasure} expected
                    </Typography>
                  </Stack>
                  {(actual.unitCaptures ?? []).map((fields, unitIdx) => (
                    <Stack key={unitIdx} spacing={0.75} sx={{ pl: 1, borderLeft: "2px solid", borderColor: "divider" }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        Unit {unitIdx + 1}
                      </Typography>
                      {(item.captureFields ?? ["Serial No"]).map((fieldName) => (
                        <Stack key={fieldName} direction="row" spacing={1} alignItems="center">
                          {fieldName.toLowerCase().includes("serial") && (
                            <Tooltip title="Scan barcode / QR">
                              <IconButton size="small"><QrCodeScannerOutlined fontSize="small" /></IconButton>
                            </Tooltip>
                          )}
                          <TextField
                            label={fieldName}
                            size="small"
                            fullWidth
                            placeholder={`Enter ${fieldName}`}
                            InputLabelProps={{ shrink: true }}
                            value={fields[fieldName] ?? ""}
                            onChange={(e) => setBomActual((prev) => prev.map((a) => {
                              if (a.bomItemId !== item.id) return a;
                              const caps = [...(a.unitCaptures ?? [])];
                              caps[unitIdx] = { ...caps[unitIdx], [fieldName]: e.target.value };
                              return { ...a, unitCaptures: caps };
                            }))}
                          />
                        </Stack>
                      ))}
                    </Stack>
                  ))}
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onBack} disabled={saving}>Back</Button>
        <Button
          variant="contained"
          onClick={onContinue}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={14} /> : undefined}
        >
          {saving ? "Saving..." : hasConsumables ? "Next: Consumables ->" : "Complete & sign"}
        </Button>
      </DialogActions>
    </>
  );
}
