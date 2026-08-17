import {
  Box,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";

function formatRunDur(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds || 0);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

type Props = {
  runs: AssetWorkflowRun[];
};

export default function AssetInstallationTimeTrackingPanel({ runs }: Props) {
  if (runs.length === 0) return null;

  const totalProductive = runs.reduce((s, r) => s + (r.productiveSeconds ?? 0), 0);
  const totalDowntime = runs.reduce((s, r) => s + (r.downtimeSeconds ?? 0), 0);
  const totalDtEvents = runs.reduce((s, r) => s + (r.downtimeEvents ?? 0), 0);
  if (totalProductive === 0 && totalDowntime === 0) return null;

  const allDowntimeEntries: Array<{
    runNumber: number;
    reason: string | null;
    startedAtUtc: string;
    endedAtUtc?: string | null;
    durationSecs: number;
  }> = [];
  for (const run of runs) {
    let entries: Array<{
      id: string;
      category: string;
      startedAtUtc: string;
      endedAtUtc?: string | null;
      reason?: string | null;
    }> = [];
    try {
      entries = JSON.parse(run.timeTrackingJson ?? "[]");
    } catch {
      /* ignore */
    }
    for (const e of entries) {
      if (e.category !== "downtime") continue;
      const endMs = e.endedAtUtc
        ? new Date(e.endedAtUtc).getTime()
        : run.completedAt
          ? new Date(run.completedAt).getTime()
          : null;
      const durSecs = endMs
        ? Math.max(0, Math.floor((endMs - new Date(e.startedAtUtc).getTime()) / 1000))
        : 0;
      allDowntimeEntries.push({
        runNumber: run.runNumber ?? 1,
        reason: e.reason ?? null,
        startedAtUtc: e.startedAtUtc,
        endedAtUtc: e.endedAtUtc,
        durationSecs: durSecs,
      });
    }
  }

  return (
    <Box>
      <Typography
        variant="caption"
        fontWeight={700}
        color="text.secondary"
        sx={{ textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 1 }}
      >
        Time Tracking
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mb={allDowntimeEntries.length > 0 ? 1.25 : 0}>
        <Chip
          size="small"
          color="success"
          variant="outlined"
          label={`Productive ${formatRunDur(totalProductive)}`}
          sx={{ height: 20, fontSize: 10 }}
        />
        <Chip
          size="small"
          color={totalDowntime > 0 ? "warning" : "default"}
          variant="outlined"
          label={`Downtime ${formatRunDur(totalDowntime)}`}
          sx={{ height: 20, fontSize: 10 }}
        />
        {totalDtEvents > 0 && (
          <Chip
            size="small"
            variant="outlined"
            label={`${totalDtEvents} downtime event${totalDtEvents !== 1 ? "s" : ""}`}
            sx={{ height: 20, fontSize: 10 }}
          />
        )}
        <Chip
          size="small"
          variant="outlined"
          label={`${runs.length} run${runs.length !== 1 ? "s" : ""} total`}
          sx={{ height: 20, fontSize: 10 }}
        />
      </Stack>

      {allDowntimeEntries.length > 0 && (
        <Table size="small" sx={{ maxWidth: 600, minWidth: 650 }}>
          <TableHead>
            <TableRow sx={{ bgcolor: "rgba(255,255,255,0.03)" }}>
              <TableCell sx={{ fontSize: 10, py: 0.4, fontWeight: 700, color: "text.secondary", width: 40 }}>
                Run
              </TableCell>
              <TableCell sx={{ fontSize: 10, py: 0.4, fontWeight: 700, color: "text.secondary" }}>Reason</TableCell>
              <TableCell sx={{ fontSize: 10, py: 0.4, fontWeight: 700, color: "text.secondary", width: 60 }}>
                Started
              </TableCell>
              <TableCell sx={{ fontSize: 10, py: 0.4, fontWeight: 700, color: "text.secondary", width: 55 }}>
                Duration
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {allDowntimeEntries.map((e, i) => (
              <TableRow key={i}>
                <TableCell sx={{ fontSize: 11, py: 0.5, color: "text.disabled" }}>#{e.runNumber}</TableCell>
                <TableCell sx={{ fontSize: 11, py: 0.5 }}>
                  {e.reason || (
                    <Typography component="span" variant="caption" color="text.disabled">
                      -
                    </Typography>
                  )}
                </TableCell>
                <TableCell sx={{ fontSize: 11, py: 0.5, color: "text.secondary", whiteSpace: "nowrap" }}>
                  {new Date(e.startedAtUtc).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                </TableCell>
                <TableCell sx={{ fontSize: 11, py: 0.5, color: "warning.main", whiteSpace: "nowrap" }}>
                  {e.durationSecs > 0 ? formatRunDur(e.durationSecs) : "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  );
}
