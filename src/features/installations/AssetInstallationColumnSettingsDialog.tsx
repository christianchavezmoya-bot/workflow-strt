import { DragIndicatorOutlined } from "@mui/icons-material";
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import {
  CONFIGURABLE_COLUMNS,
  reorderColumnIds,
  toggleColumnHidden,
} from "./assetInstallationPageLogic";

type Props = {
  open: boolean;
  order: string[];
  hidden: string[];
  onClose: () => void;
  onApply: () => void;
  onOrderChange: (order: string[]) => void;
  onHiddenChange: (hidden: string[]) => void;
};

export default function AssetInstallationColumnSettingsDialog({
  open,
  order,
  hidden,
  onClose,
  onApply,
  onOrderChange,
  onHiddenChange,
}: Props) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Column Settings</DialogTitle>
      <DialogContent>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
          Check to show a column. Drag rows to reorder - top of the list = leftmost in the table.
        </Typography>
        <Stack spacing={0.75}>
          {order.map((id, idx) => {
            const col = CONFIGURABLE_COLUMNS.find((c) => c.id === id);
            if (!col) return null;
            const isHidden = hidden.includes(id);
            return (
              <Stack
                key={id}
                direction="row"
                alignItems="center"
                spacing={0.5}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", String(idx))}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const fromIdx = Number(e.dataTransfer.getData("text/plain"));
                  onOrderChange(reorderColumnIds(order, fromIdx, idx));
                }}
                sx={{
                  px: 1,
                  py: 0.5,
                  borderRadius: 1,
                  border: "1px solid",
                  borderColor: "divider",
                  bgcolor: isHidden ? "action.disabledBackground" : "action.hover",
                  cursor: "grab",
                  "&:active": { cursor: "grabbing" },
                }}
              >
                <DragIndicatorOutlined fontSize="small" sx={{ color: "text.disabled", flexShrink: 0 }} />
                <Checkbox
                  size="small"
                  checked={!isHidden}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onHiddenChange(toggleColumnHidden(hidden, id, e.target.checked))}
                />
                <Typography variant="body2" sx={{ flex: 1, opacity: isHidden ? 0.45 : 1, userSelect: "none" }}>
                  {col.label}
                </Typography>
              </Stack>
            );
          })}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={onApply}>
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
}
