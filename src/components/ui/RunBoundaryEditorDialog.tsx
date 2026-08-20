import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs, { type Dayjs } from "dayjs";
import TimeWheelPicker, { applyMinutesInZoneToUtcIso, utcIsoToMinutesInZone } from "./TimeWheelPicker";
import { formatInstant, zoneAbbreviation } from "../../utils/datetime";
import { nativeDialogActionsSx, nativeDialogPaperSx, nativeDialogSx, nativeDatePickerPopperSlotProps } from "../../utils/nativeDialogInsets";

interface Props {
  open: boolean;
  kind: "start" | "finish";
  iso: string;
  timeZoneId?: string | null;
  onClose: () => void;
  onSave: (iso: string) => void;
}

export default function RunBoundaryEditorDialog({
  open,
  kind,
  iso,
  timeZoneId,
  onClose,
  onSave,
}: Props) {
  const [dateValue, setDateValue] = useState<Dayjs | null>(null);
  const [minutes, setMinutes] = useState(0);

  useEffect(() => {
    if (!open || !iso) return;
    const parsed = dayjs(iso);
    setDateValue(parsed.isValid() ? parsed : dayjs());
    setMinutes(utcIsoToMinutesInZone(iso, timeZoneId));
  }, [open, iso, timeZoneId]);

  const handleSave = () => {
    if (!dateValue) return;
    const baseIso = `${dateValue.format("YYYY-MM-DD")}T12:00:00.000Z`;
    onSave(applyMinutesInZoneToUtcIso(baseIso, minutes, timeZoneId));
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      sx={nativeDialogSx()}
      PaperProps={{ sx: nativeDialogPaperSx() }}
    >
      <DialogTitle sx={{ pb: 0.5 }}>
        Edit run {kind}
        {timeZoneId && (
          <Typography variant="caption" color="text.secondary" display="block">
            {zoneAbbreviation(timeZoneId)}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <DatePicker
              value={dateValue}
              onChange={setDateValue}
              slotProps={{
                textField: {
                  size: "small",
                  fullWidth: true,
                  InputLabelProps: { shrink: true },
                },
                popper: nativeDatePickerPopperSlotProps(),
              }}
            />
            <TimeWheelPicker label="Time" valueMinutes={minutes} onChange={setMinutes} />
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
              {formatInstant(iso, timeZoneId, { withZone: true })}
            </Typography>
          </Stack>
        </LocalizationProvider>
      </DialogContent>
      <DialogActions sx={nativeDialogActionsSx()}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave}>Apply</Button>
      </DialogActions>
    </Dialog>
  );
}
