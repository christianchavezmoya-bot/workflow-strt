import { Stack } from "@mui/material";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs, { type Dayjs } from "dayjs";
import TimeWheelPicker, {
  applyMinutesInZoneToUtcIso,
  utcIsoToMinutesInZone,
} from "./TimeWheelPicker";

function fieldWantsTime(...parts: Array<string | undefined>): boolean {
  const combined = parts.filter(Boolean).join(" ").toLowerCase();
  return combined.includes("time") || combined.includes("timestamp") || combined.includes("datetime");
}

function parseStoredDateValue(value: string): Dayjs | null {
  if (!value.trim()) return null;
  const parsed = dayjs(value.length >= 10 ? value.slice(0, 10) : value);
  return parsed.isValid() ? parsed : null;
}

interface WorkflowDateCaptureProps {
  value: string;
  onChange: (next: string) => void;
  label?: string;
  hint?: string;
  fieldKey?: string;
  error?: boolean;
  timeZoneId?: string | null;
}

/** Calendar picker for workflow date fields; adds a time wheel when the label/key implies date+time. */
export default function WorkflowDateCapture({
  value,
  onChange,
  label,
  hint,
  fieldKey,
  error = false,
  timeZoneId,
}: WorkflowDateCaptureProps) {
  const wantsTime = fieldWantsTime(label, fieldKey, hint);
  const dateValue = parseStoredDateValue(value);
  const minutes = value && wantsTime
    ? utcIsoToMinutesInZone(value.includes("T") ? value : `${value}T12:00:00.000Z`, timeZoneId)
    : 12 * 60;

  const emitDateOnly = (nextDate: Dayjs | null) => {
    onChange(nextDate ? nextDate.format("YYYY-MM-DD") : "");
  };

  const emitDateTime = (nextDate: Dayjs | null, nextMinutes: number) => {
    if (!nextDate) {
      onChange("");
      return;
    }
    const baseIso = `${nextDate.format("YYYY-MM-DD")}T12:00:00.000Z`;
    onChange(applyMinutesInZoneToUtcIso(baseIso, nextMinutes, timeZoneId));
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Stack spacing={wantsTime ? 1.5 : 0}>
        <DatePicker
          value={dateValue}
          onChange={(next) => {
            if (wantsTime) emitDateTime(next, minutes);
            else emitDateOnly(next);
          }}
          slotProps={{
            textField: {
              size: "small",
              fullWidth: true,
              error,
              helperText: hint,
              InputLabelProps: { shrink: true },
            },
            field: { clearable: true },
          }}
        />
        {wantsTime && (
          <TimeWheelPicker
            label="Time"
            valueMinutes={minutes}
            onChange={(nextMinutes) => emitDateTime(dateValue ?? dayjs(), nextMinutes)}
          />
        )}
      </Stack>
    </LocalizationProvider>
  );
}

export { fieldWantsTime };
