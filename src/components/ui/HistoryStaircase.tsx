import { Box, Chip, Divider, Stack, Tooltip, Typography } from "@mui/material";
import { FlagOutlined, HelpOutlineOutlined } from "@mui/icons-material";
import {
  statusesPresent,
  styleFor,
  type StaircaseRow,
  type StaircaseView,
} from "../../utils/historyStaircase";
import { formatInstant } from "../../utils/datetime";

/**
 * Staircase view of a fault's lifecycle: the opening row sits at the left, and each later event
 * steps one level to the right so the indentation shows that it followed from the event above.
 * Later rows carry only time, action and status — static context appears once, above the rows.
 *
 * Vocabulary-neutral: the caller supplies statuses, palette and legend, so the same layout serves
 * app fault reports and asset maintenance faults.
 */

const INDENT_STEP = 28;
const INDENT_STEP_XS = 14;

function StatusChip({ view, status, inferred }: { view: StaircaseView; status: string; inferred?: boolean }) {
  const style = styleFor(view, status);
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
    <Tooltip title="Inferred — this predates per-update status being recorded.">
      <span>{chip}</span>
    </Tooltip>
  );
}

/**
 * Ties a row back to the one above it, mirroring the └── in the layout. Once indentation reaches
 * its cap consecutive rows share a depth, so a straight line is drawn rather than an elbow that
 * would point into empty space.
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

function HistoryRowView({
  view,
  row,
  isRoot,
  sameDepthAsPrevious,
  timeZoneId,
}: {
  view: StaircaseView;
  row: StaircaseRow;
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
              <StatusChip view={view} status={row.status} inferred={row.statusInferred} />
            </Stack>

            {row.label && (
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  mt: 0.25,
                  color: "text.disabled",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  fontSize: "0.62rem",
                }}
              >
                {row.label}
              </Typography>
            )}

            <Typography
              variant="body2"
              sx={{
                mt: 0.25,
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

function ContextChips({ view }: { view: StaircaseView }) {
  if (view.context.meta.length === 0) return null;

  return (
    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 1.25 }}>
      {view.context.meta.map((item) => (
        <Chip
          key={`${item.label}-${item.value}`}
          size="small"
          variant="outlined"
          label={`${item.label}: ${item.value}`}
          sx={{ height: 20, fontSize: "0.66rem", borderColor: "rgba(255,255,255,0.16)" }}
        />
      ))}
    </Stack>
  );
}

function Legend({ view }: { view: StaircaseView }) {
  const statuses = statusesPresent(view);
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
                bgcolor: styleFor(view, status).color,
                flexShrink: 0,
              }}
            />
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              <strong>{status}</strong>
              {view.meanings[status] ? ` — ${view.meanings[status]}` : ""}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

interface Props {
  view: StaircaseView;
  timeZoneId?: string | null;
  heading?: string;
  showLegend?: boolean;
  showContext?: boolean;
}

export default function HistoryStaircase({
  view,
  timeZoneId,
  heading = "Fault history",
  showLegend = true,
  showContext = true,
}: Props) {
  if (view.rows.length === 0) return null;

  const anyInferred = view.rows.some((r) => r.statusInferred);

  return (
    <Box>
      <Divider sx={{ mb: 1.5 }}>
        <Typography
          variant="caption"
          sx={{ color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.8 }}
        >
          {heading}
        </Typography>
      </Divider>

      {showContext && <ContextChips view={view} />}

      <Box sx={{ overflowX: "auto" }}>
        {view.rows.map((row, index) => (
          <HistoryRowView
            key={row.id}
            view={view}
            row={row}
            isRoot={index === 0}
            sameDepthAsPrevious={index > 0 && view.rows[index - 1].depth === row.depth}
            timeZoneId={timeZoneId}
          />
        ))}
      </Box>

      {showLegend && <Legend view={view} />}

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
