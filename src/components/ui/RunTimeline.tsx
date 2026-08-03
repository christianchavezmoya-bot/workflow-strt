import { Box, Stack, Typography, Divider, Tooltip } from "@mui/material";
import type { RunTimeEntry } from "../../types/assetWorkflowRun";
import { buildTimelineModel, formatDuration } from "../../utils/timelineModel";
import { formatInstant } from "../../utils/datetime";

interface Props {
  entries: RunTimeEntry[];
  /** IANA timezone id (project site) for wall-clock labels; matches report behaviour. */
  timeZoneId?: string | null;
  /** Now, for closing any open entry. Defaults to current time. */
  nowIso?: string;
}

const COLORS = {
  productive: "#2e9b5e",
  downtime: "#d79b24",
  break: "#c2ccd6",
};

/**
 * Read-only visual timeline (Model B): proportional productive/downtime segments;
 * pauses shown as labelled breaks between work sessions, not proportional blocks.
 * Editing is done via the existing TimeEntriesEditorDialog (gated by the Phase 1
 * permission ladder) - this component is display only.
 */
export default function RunTimeline({ entries, timeZoneId, nowIso }: Props) {
  const now = nowIso ?? new Date().toISOString();
  const model = buildTimelineModel(entries, now);

  if (model.items.length === 0) {
    return (
      <Typography variant="body2" color="text.disabled" sx={{ fontStyle: "italic", py: 1 }}>
        No time recorded yet.
      </Typography>
    );
  }

  const zone = timeZoneId ?? undefined;

  return (
    <Stack spacing={1.25}>
      <Stack direction="row" flexWrap="wrap" useFlexGap spacing={2}>
        <HeaderStat label="Start" value={formatInstant(model.firstStartUtc, zone, { withZone: false })} />
        <HeaderStat label="Finish" value={formatInstant(model.lastEndUtc, zone, { withZone: false })} />
        <HeaderStat label="Active" value={formatDuration(model.activeSeconds)} />
        <HeaderStat label="Elapsed" value={formatDuration(model.elapsedSeconds)} muted />
      </Stack>

      <Box
        sx={{
          display: "flex",
          alignItems: "stretch",
          width: "100%",
          height: 28,
          borderRadius: 1,
          overflow: "hidden",
          border: "1px solid",
          borderColor: "divider",
          bgcolor: "background.default",
        }}
      >
        {model.items.map((it, idx) => {
          if (it.kind === "break") {
            const multiDay =
              new Date(it.startUtc).toDateString() !== new Date(it.endUtc).toDateString();
            return (
              <Tooltip
                key={idx}
                title={`Paused ${formatDuration(it.seconds)}${multiDay ? " (resumed next day)" : ""}`}
              >
                <Box
                  sx={{
                    width: 6,
                    flex: "0 0 6px",
                    bgcolor: COLORS.break,
                    borderLeft: "1px dashed",
                    borderRight: "1px dashed",
                    borderColor: "background.paper",
                  }}
                />
              </Tooltip>
            );
          }
          const pct = Math.max(it.fraction * 100, 1.5);
          return (
            <Tooltip
              key={idx}
              title={`${it.kind === "productive" ? "Productive" : "Downtime"} - ${formatDuration(it.seconds)}${
                it.reason ? ` - ${it.reason}` : ""
              }`}
            >
              <Box
                sx={{
                  width: `${pct}%`,
                  flex: `1 1 ${pct}%`,
                  bgcolor: it.kind === "productive" ? COLORS.productive : COLORS.downtime,
                  minWidth: 3,
                }}
              />
            </Tooltip>
          );
        })}
      </Box>

      <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1.5} alignItems="center">
        <LegendDot color={COLORS.productive} label={`Productive ${formatDuration(model.productiveSeconds)}`} />
        <LegendDot color={COLORS.downtime} label={`Downtime ${formatDuration(model.downtimeSeconds)}`} />
        {model.breakSeconds > 0 && (
          <LegendDot color={COLORS.break} label={`Paused ${formatDuration(model.breakSeconds)}`} />
        )}
      </Stack>

      {model.hasMultiDayBreak && (
        <>
          <Divider />
          <Typography variant="caption" color="text.secondary">
            This run spans more than one day. Paused periods between work sessions are shown as
            breaks and are not counted as active time.
          </Typography>
        </>
      )}
    </Stack>
  );
}

function HeaderStat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1 }}>
        {label}
      </Typography>
      <Typography variant="body2" color={muted ? "text.secondary" : "text.primary"} sx={{ fontWeight: 600 }}>
        {value || "-"}
      </Typography>
    </Box>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: color, flex: "0 0 auto" }} />
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  );
}