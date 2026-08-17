import { ExpandLessOutlined, ExpandMoreOutlined } from "@mui/icons-material";
import {
  Box,
  Chip,
  Collapse,
  Divider,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import type { AssetHealth } from "./assetInstallationPageLogic";

type TimeRollup = {
  productive: number;
  downtime: number;
  downtimeEvents: number;
};

type Props = {
  productName?: string;
  health: AssetHealth;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  timeRollup: TimeRollup;
};

function formatRunDur(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds || 0);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function AssetInstallationHealthSummaryBar({
  productName,
  health,
  expanded,
  onExpandedChange,
  timeRollup,
}: Props) {
  const completionPct = health.total > 0
    ? Math.round(((health.complete + health.closed) / health.total) * 100)
    : 0;

  return (
    <Paper className="glass-card" sx={{ px: 2.5, py: 1.5 }}>
      <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap>
        <Typography variant="caption" color="text.secondary" fontWeight={700}
          sx={{ textTransform: "uppercase", letterSpacing: 0.5, flexShrink: 0 }}>
          {productName ?? "All projects"} health
        </Typography>
        {!expanded && (
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            {health.complete > 0 && <Chip size="small" label={`${health.complete} Complete`} color="success" sx={{ height: 18, fontSize: 10 }} />}
            {health.closed > 0 && <Chip size="small" label={`${health.closed} Closed`} color="info" sx={{ height: 18, fontSize: 10 }} />}
            {health.inProgress > 0 && <Chip size="small" label={`${health.inProgress} In Progress`} color="primary" sx={{ height: 18, fontSize: 10 }} />}
            {health.paused > 0 && <Chip size="small" label={`${health.paused} Paused`} color="warning" sx={{ height: 18, fontSize: 10 }} />}
            {health.pending > 0 && <Chip size="small" label={`${health.pending} Pending`} color="warning" sx={{ height: 18, fontSize: 10 }} />}
            {health.issue > 0 && <Chip size="small" label={`${health.issue} Issue`} color="error" sx={{ height: 18, fontSize: 10 }} />}
            <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>
              {completionPct}%
            </Typography>
          </Stack>
        )}
        <Box sx={{ flex: 1 }} />
        <Tooltip title={expanded ? "Minimize health panel" : "Expand health panel"}>
          <IconButton size="small" onClick={() => onExpandedChange(!expanded)} sx={{ p: 0.25 }}>
            {expanded ? <ExpandLessOutlined sx={{ fontSize: 18 }} /> : <ExpandMoreOutlined sx={{ fontSize: 18 }} />}
          </IconButton>
        </Tooltip>
      </Stack>
      <Collapse in={expanded}>
        <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {health.notStarted > 0 && (
              <Chip size="small" label={`${health.notStarted} Not Started`} />
            )}
            {health.inProgress > 0 && (
              <Chip size="small" label={`${health.inProgress} In Progress`} color="primary" />
            )}
            {health.paused > 0 && (
              <Chip size="small" label={`${health.paused} Paused`} color="warning" />
            )}
            {health.pending > 0 && (
              <Chip size="small" label={`${health.pending} Pending`} color="warning" />
            )}
            {health.complete > 0 && (
              <Chip size="small" label={`${health.complete} Complete`} color="success" />
            )}
            {health.closed > 0 && (
              <Chip size="small" label={`${health.closed} Closed`} color="info" />
            )}
            {health.issue > 0 && (
              <Chip size="small" label={`${health.issue} Issue`} color="error" />
            )}
            {health.noWorkflow > 0 && (
              <Tooltip title="These assets have no workflow linked and cannot be worked on.">
                <Chip size="small" label={`${health.noWorkflow} No Workflow`} color="warning" variant="outlined" />
              </Tooltip>
            )}
          </Stack>
          <Box sx={{ flex: 1, minWidth: 100 }}>
            <LinearProgress
              variant="determinate"
              value={health.total > 0 ? ((health.complete + health.closed) / health.total) * 100 : 0}
              color={health.issue > 0 ? "error" : "success"}
              sx={{ height: 6, borderRadius: 1 }}
            />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
            {completionPct}% field work complete
          </Typography>
          {(timeRollup.productive > 0 || timeRollup.downtime > 0) && (
            <>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
              <Tooltip title="Total productive time across all visible assets">
                <Chip size="small" color="success" variant="outlined"
                  label={`Productive ${formatRunDur(timeRollup.productive)}`}
                  sx={{ fontSize: 10, height: 20 }} />
              </Tooltip>
              {timeRollup.downtime > 0 && (
                <Tooltip title={`${timeRollup.downtimeEvents} downtime event${timeRollup.downtimeEvents !== 1 ? "s" : ""} across all visible assets`}>
                  <Chip size="small" color="warning" variant="outlined"
                    label={`Downtime ${formatRunDur(timeRollup.downtime)}`}
                    sx={{ fontSize: 10, height: 20 }} />
                </Tooltip>
              )}
            </>
          )}
        </Stack>
      </Collapse>
    </Paper>
  );
}
