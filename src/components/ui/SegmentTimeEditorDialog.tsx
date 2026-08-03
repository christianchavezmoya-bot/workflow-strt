import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import type { RunTimeEntry } from "../../types/assetWorkflowRun";
import { formatInstant, zoneAbbreviation } from "../../utils/datetime";
import TimeWheelPicker, { applyMinutesInZoneToUtcIso, utcIsoToMinutesInZone } from "./TimeWheelPicker";

interface Props {
  open: boolean;
  entry: RunTimeEntry | null;
  timeZoneId?: string | null;
  nowIso: string;
  onClose: () => void;
  onSave: (updated: RunTimeEntry) => void;
}

export default function SegmentTimeEditorDialog({
  open,
  entry,
  timeZoneId,
  nowIso,
  onClose,
  onSave,
}: Props) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"));
  const [startMinutes, setStartMinutes] = useState(0);
  const [endMinutes, setEndMinutes] = useState(0);

  useEffect(() => {
    if (!entry || !open) return;
    setStartMinutes(utcIsoToMinutesInZone(entry.startedAtUtc, timeZoneId));
    const endIso = entry.endedAtUtc ?? nowIso;
    setEndMinutes(utcIsoToMinutesInZone(endIso, timeZoneId));
  }, [entry, open, nowIso, timeZoneId]);

  if (!entry) return null;

  const handleSave = () => {
    const startIso = applyMinutesInZoneToUtcIso(entry.startedAtUtc, startMinutes, timeZoneId);
    let endIso = applyMinutesInZoneToUtcIso(entry.startedAtUtc, endMinutes, timeZoneId);
    if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
      endIso = applyMinutesInZoneToUtcIso(entry.startedAtUtc, endMinutes + 24 * 60, timeZoneId);
    }
    onSave({ ...entry, startedAtUtc: startIso, endedAtUtc: endIso });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth fullScreen={isPhone}>
      <DialogTitle sx={{ pb: 0.5 }}>
        Edit segment
        {timeZoneId && (
          <Typography variant="caption" color="text.secondary" display="block">
            {zoneAbbreviation(timeZoneId)} · {entry.category === "productive" ? "Productive" : "Downtime"}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent>
        <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
          <TimeWheelPicker label="Start" valueMinutes={startMinutes} onChange={setStartMinutes} />
          <TimeWheelPicker label="End" valueMinutes={endMinutes} onChange={setEndMinutes} />
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2, textAlign: "center" }}>
          {formatInstant(entry.startedAtUtc, timeZoneId, { withZone: true })} →{" "}
          {formatInstant(entry.endedAtUtc ?? nowIso, timeZoneId, { withZone: true })}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave}>Apply</Button>
      </DialogActions>
    </Dialog>
  );
}
