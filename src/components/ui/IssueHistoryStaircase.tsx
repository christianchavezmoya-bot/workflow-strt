import { Box, Chip, Divider, Stack, Tooltip, Typography } from "@mui/material";
import { FlagOutlined, HelpOutlineOutlined } from "@mui/icons-material";
import type { IssueEventStatus } from "../../types/projectAsset";
import {
  ISSUE_STATUS_MEANING,
  type IssueHistory,
  type IssueHistoryRow,
} from "../../utils/issueHistory";
import { formatInstant } from "../../utils/datetime";

/**
 * Staircase view of a fault's lifecycle: the original report sits at the left, and each later
 * event steps one level to the right so the indentation shows that it followed from the event
 * above. Later rows carry only time, action and status — asset and location appear once, on the
 * root row, and are never repeated.
 */

/** Each level of indentation, in px. Narrower on mobile — see INDENT_STEP_XS. */
const INDENT_STEP = 28;
const INDENT_STEP_XS = 14;

const STATUS_STYLE: Record<IssueEventStatus, { color: string; bg: string; border: string }> = {
  Open: { color: "#ff7a7a", bg: "rgba(244,67,54,0.14)", border: "rgba(244,67,54,0.42)" },
  "In Progress": { color: "#e8b34a", bg: "rgba(215,155,36,0.14)", border: "rgba(215,155,36,0.42)" },
  "Pending Verification": { color: "#7cc4ff", bg: "rgba(58,161,255,0.14)", border: "rgba(58,161,255,0.42)" },
  Closed: { color: "#6ede9a", bg: "rgba(46,155,94,0.16)", border: "rgba(46,155,94,0.45)" },
};

function StatusChip({ status, inferred }: { status: IssueEventStatus; inferred: boolean }) {
  const style = STATUS_STYLE[status];
  const chip = (
    <Chip
      size="small"
      label={inferred ? `${status} *` : status}
      sx={{
        height: 22,
        fontSize: "0.7rem",
        fontWeight: 700,
        color: style.color,
        bgcolor: style.bg,
        border: `1px solid ${style.border}`,
      }}
    />
  );

  if (!inferred) return chip;

  return (
    <Tooltip title="Recorded before per-update status existed — shown as In Progress because work was underway.">
      <span>{chip}</span>
    </Tooltip>
  );
}

/**
 * The elbow that ties a row back to the one above it, mirroring the └── in the spec.
 * Once indentation reaches its cap, consecutive rows share a depth, so a straight vertical
 * connector is drawn instead of an elbow that would point into empty space.
 */
function Connector({ straight }: { straight: boolean }) {
  const line = "2px solid rgba(45,212,191,0.35)";
  if (straight) {
    return (
      <Box
        aria-hidden
        sx={{ position: "absolute", left: 10, top: -10, width: 0, height: 12, borderLeft: line }}
      />
    );
  }

  return (
    <Box
      aria-hidden
      sx={{
        position: "absolute",
        left: { xs: -INDENT_STEP_XS, md: -INDENT_STEP },
        top: -10,
        width: { xs: INDENT_STEP_XS, md: INDENT_STEP },
        height: 28,
        borderLeft: line,
        borderBottom: line,
        borderBottomLeftRadius: 8,
      }}
    />
  );
}

function HistoryRow({
  row,
  isRoot,
  sameDepthAsPrevious,
  timeZoneId,
}: {
  row: IssueHistoryRow;
  isRoot: boolean;
  sameDepthAsPrevious: boolean;
  timeZoneId?: string | null;
}) {
  const when = formatInstant(row.at, timeZoneId, { withZone: false }) || row.at;

  return (
    <Box
      sx={{
        position: "relative",
        ml: {
          xs: `${row.depth * INDENT_STEP_XS}px`,
          md: `${row.depth * INDENT_STEP}px`,
        },
        mb: 1,
      }}
    >
      {!isRoot && <Connector straight={sameDepthAsPrevious} />}

      <Box
        sx={{
          p: 1.25,
          borderRadius: 2,
          border: isRoot ? "1px solid rgba(45,212,191,0.32)" : "1px solid rgba(255,255,255,0.09)",
          background: isRoot
            ? "linear-gradient(180deg, rgba(12,38,42,0.72) 0%, rgba(10,26,31,0.72) 100%)"
            : "rgba(255,255,255,0.025)",
        }}
      >
        <Stack direction="row" spacing={1.25} alignItems="flex-start">
          {isRoot && (
            <Box
              sx={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                flexShrink: 0,
                bgcolor: "rgba(45,212,191,0.16)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FlagOutlined sx={{ fontSize: 15, color: "#2dd4bf" }} />
            </Box>
          )}

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="caption" sx={{ color: "text.disabled", whiteSpace: "nowrap" }}>
                {when}
              </Typography>
              {row.author && (
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  · {row.author}
                </Typography>
              )}
              <Box sx={{ flex: 1 }} />
              <StatusChip status={row.status} inferred={row.statusInferred} />
            </Stack>

            <Typography
              variant="body2"
              sx={{
                mt: 0.5,
                fontWeight: isRoot ? 600 : 500,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {row.action || "—"}
            </Typography>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}

function ContextLine({ history }: { history: IssueHistory }) {
  const { context } = history;
  const parts = [
    context.faultId,
    context.assetLabel,
    context.projectLabel,
    context.location,
  ].filter(Boolean) as string[];

  if (parts.length === 0) return null;

  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
      {parts.map((part, i) => (
        <Chip
          key={`${part}-${i}`}
          size="small"
          label={part}
          variant="outlined"
          sx={{ height: 20, fontSize: "0.68rem", borderColor: "rgba(255,255,255,0.16)" }}
        />
      ))}
    </Stack>
  );
}

function Legend({ statuses }: { statuses: IssueEventStatus[] }) {
  if (statuses.length === 0) return null;

  return (
    <Box sx={{ mt: 1.5, pt: 1.5, borderTop: "1px dashed rgba(255,255,255,0.1)" }}>
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        {statuses.map((status) => (
          <Stack key={status} direction="row" spacing={0.75} alignItems="center">
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                bgcolor: STATUS_STYLE[status].color,
                flexShrink: 0,
              }}
            />
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              <strong>{status}</strong> — {ISSUE_STATUS_MEANING[status]}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

interface Props {
  history: IssueHistory;
  timeZoneId?: string | null;
  /** Hidden on narrow screens where the legend costs more than it explains. */
  showLegend?: boolean;
  showContext?: boolean;
}

export default function IssueHistoryStaircase({
  history,
  timeZoneId,
  showLegend = true,
  showContext = true,
}: Props) {
  if (history.rows.length === 0) return null;

  // Only explain the statuses actually present, in lifecycle order.
  const present = history.rows.map((r) => r.status);
  const statusesUsed = (["Open", "In Progress", "Pending Verification", "Closed"] as IssueEventStatus[])
    .filter((s) => present.includes(s));

  const anyInferred = history.rows.some((r) => r.statusInferred);

  return (
    <Box>
      <Divider sx={{ mb: 1.5 }}>
        <Typography
          variant="caption"
          sx={{ color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.8 }}
        >
          Fault history
        </Typography>
      </Divider>

      {showContext && <ContextLine history={history} />}

      <Box sx={{ overflowX: "auto" }}>
        {history.rows.map((row, index) => (
          <HistoryRow
            key={row.id}
            row={row}
            isRoot={index === 0}
            sameDepthAsPrevious={index > 0 && history.rows[index - 1].depth === row.depth}
            timeZoneId={timeZoneId}
          />
        ))}
      </Box>

      {showLegend && <Legend statuses={statusesUsed} />}

      {anyInferred && (
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 1 }}>
          <HelpOutlineOutlined sx={{ fontSize: 13, color: "text.disabled" }} />
          <Typography variant="caption" color="text.disabled">
            * status inferred — recorded before updates carried their own status
          </Typography>
        </Stack>
      )}
    </Box>
  );
}
