import { Box, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { formatCompactWallClock, formatInstant, UTC_ZONE, zoneAbbreviation } from "../../utils/datetime";
import { useOfficeTimeZone } from "../../hooks/useOfficeTimeZone";

type Props = {
  /** Optional project/site zone to show alongside UTC and global office. */
  projectTimeZoneId?: string | null;
  projectLabel?: string;
  /** `compact` fits mobile headers; `inline` sits next to the app title on desktop. */
  variant?: "compact" | "inline";
  /** When true, hide UTC and office clocks and show only the project/site clock. */
  siteOnly?: boolean;
  /** When true, show only the global office clock (native header). */
  officeOnly?: boolean;
};

function ClockChip({ label, value, zoneId }: { label: string; value: string; zoneId?: string }) {
  return (
    <Box
      sx={{
        px: 1,
        py: 0.35,
        borderRadius: 1,
        border: "1px solid rgba(45, 212, 191, 0.25)",
        bgcolor: "rgba(45, 212, 191, 0.06)",
        minWidth: 0,
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", fontSize: "0.62rem", lineHeight: 1.2, letterSpacing: 0.4, textTransform: "uppercase" }}
      >
        {label}
        {zoneId ? ` · ${zoneAbbreviation(zoneId)}` : ""}
      </Typography>
      <Typography
        variant="caption"
        component="time"
        dateTime={value}
        sx={{ display: "block", fontFamily: "monospace", fontWeight: 700, fontSize: "0.72rem", whiteSpace: "nowrap" }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function CompactOfficeClock({ value }: { value: string }) {
  return (
    <Box sx={{ minWidth: 0, lineHeight: 1.1 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          display: "block",
          fontSize: "0.58rem",
          lineHeight: 1.1,
          letterSpacing: 0.3,
          textTransform: "uppercase",
        }}
      >
        Office time
      </Typography>
      <Typography
        variant="caption"
        component="time"
        dateTime={value}
        sx={{
          display: "block",
          fontFamily: "monospace",
          fontWeight: 600,
          fontSize: "0.68rem",
          whiteSpace: "nowrap",
          lineHeight: 1.2,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

export default function DiagnosticClockBar({
  projectTimeZoneId,
  projectLabel = "Project",
  variant = "inline",
  siteOnly = false,
  officeOnly = false,
}: Props) {
  const [now, setNow] = useState(() => new Date());
  const { zone: officeZone } = useOfficeTimeZone();

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const utcText = formatInstant(now, UTC_ZONE, { date: true, time: true, withZone: true });
  const officeText = officeZone
    ? formatInstant(now, officeZone, { date: true, time: true, withZone: true })
    : "—";
  const officeCompactText = officeZone
    ? formatCompactWallClock(now, officeZone)
    : "—";
  const projectText = projectTimeZoneId
    ? formatInstant(now, projectTimeZoneId, { date: true, time: true, withZone: true })
    : null;

  const spacing = variant === "compact" ? 0.5 : 1;
  const direction = variant === "compact" ? "column" : "row";

  if (siteOnly) {
    if (!projectText) return null;
    return (
      <Stack direction={direction} spacing={spacing} alignItems={variant === "compact" ? "flex-start" : "center"} sx={{ minWidth: 0 }}>
        <ClockChip label={projectLabel} value={projectText} zoneId={projectTimeZoneId ?? undefined} />
      </Stack>
    );
  }

  if (officeOnly) {
    return <CompactOfficeClock value={officeCompactText} />;
  }

  return (
    <Stack direction={direction} spacing={spacing} alignItems={variant === "compact" ? "flex-start" : "center"} sx={{ minWidth: 0 }}>
      <ClockChip label="UTC now" value={utcText} zoneId={UTC_ZONE} />
      <ClockChip label="Office" value={officeText} zoneId={officeZone} />
      {projectText && (
        <ClockChip label={projectLabel} value={projectText} zoneId={projectTimeZoneId ?? undefined} />
      )}
    </Stack>
  );
}
