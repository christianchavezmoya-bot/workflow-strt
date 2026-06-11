import { Avatar, Box, Divider, Stack, Typography } from "@mui/material";
import {
  CheckCircleOutlined,
  ChatBubbleOutlineOutlined,
  ReportProblemOutlined,
} from "@mui/icons-material";
import type { AssetIssue } from "../../types/projectAsset";
import type { RunIssue } from "../../types/assetWorkflowRun";

type AnyIssue = AssetIssue | RunIssue;

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function initials(name: string) {
  const parts = name.trim().split(" ").filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

interface TimelineRowProps {
  icon: React.ReactNode;
  iconBg: string;
  label: React.ReactNode;
  meta: string;
  note?: string;
  isLast?: boolean;
}

function TimelineRow({ icon, iconBg, label, meta, note, isLast }: TimelineRowProps) {
  return (
    <Stack direction="row" spacing={1.5} alignItems="flex-start">
      {/* Spine */}
      <Stack alignItems="center" sx={{ flexShrink: 0, width: 28 }}>
        <Box
          sx={{
            width: 28, height: 28, borderRadius: "50%",
            bgcolor: iconBg, display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        {!isLast && (
          <Box sx={{ width: 2, flex: 1, minHeight: 12, bgcolor: "rgba(255,255,255,0.08)", mt: 0.5 }} />
        )}
      </Stack>

      {/* Content */}
      <Box sx={{ flex: 1, pb: isLast ? 0 : 1.5 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Box sx={{ flex: 1 }}>{label}</Box>
          <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: "nowrap" }}>
            {meta}
          </Typography>
        </Stack>
        {note && (
          <Typography
            variant="body2"
            sx={{ mt: 0.5, color: "text.secondary", fontStyle: "italic", whiteSpace: "pre-wrap" }}
          >
            {note}
          </Typography>
        )}
      </Box>
    </Stack>
  );
}

interface Props {
  issue: AnyIssue;
}

export default function IssueTimeline({ issue }: Props) {
  const comments = issue.comments ?? [];
  const reporter = ("createdBy" in issue ? issue.createdBy : null) ?? "Unknown";

  type Event =
    | { kind: "reported"; at: string; by: string }
    | { kind: "comment"; at: string; by: string; text: string }
    | { kind: "closed"; at: string; by: string; note: string };

  const events: Event[] = ([
    { kind: "reported" as const, at: issue.reportedAt, by: reporter },
    ...comments.map((c) => ({ kind: "comment" as const, at: c.createdAt, by: c.author, text: c.text })),
    ...(issue.resolved && issue.resolvedAt
      ? [{ kind: "closed" as const, at: issue.resolvedAt, by: issue.resolvedBy ?? "Unknown", note: issue.resolutionNote ?? "" }]
      : []),
  ] as Event[]).sort((a, b) => a.at.localeCompare(b.at));

  if (events.length === 0) return null;

  return (
    <Box>
      <Divider sx={{ mb: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
          Activity
        </Typography>
      </Divider>
      <Stack>
        {events.map((ev, idx) => {
          const isLast = idx === events.length - 1;

          if (ev.kind === "reported") {
            return (
              <TimelineRow
                key={`reported-${ev.at}`}
                icon={<ReportProblemOutlined sx={{ fontSize: 14, color: "#f44336" }} />}
                iconBg="rgba(244,67,54,0.15)"
                label={
                  <Typography variant="caption" fontWeight={600}>
                    Reported by <strong>{ev.by}</strong>
                  </Typography>
                }
                meta={fmt(ev.at)}
                note={issue.description}
                isLast={isLast}
              />
            );
          }

          if (ev.kind === "comment") {
            return (
              <TimelineRow
                key={`comment-${ev.at}-${ev.by}`}
                icon={
                  <Avatar sx={{ width: 20, height: 20, fontSize: "0.6rem", bgcolor: "#2dd4bf", color: "#0b1d24" }}>
                    {initials(ev.by)}
                  </Avatar>
                }
                iconBg="transparent"
                label={
                  <Typography variant="caption" fontWeight={600}>
                    {ev.by} <ChatBubbleOutlineOutlined sx={{ fontSize: 11, verticalAlign: "middle", ml: 0.25, color: "text.disabled" }} />
                  </Typography>
                }
                meta={fmt(ev.at)}
                note={ev.text}
                isLast={isLast}
              />
            );
          }

          // closed
          return (
            <TimelineRow
              key={`closed-${ev.at}`}
              icon={<CheckCircleOutlined sx={{ fontSize: 14, color: "#4caf50" }} />}
              iconBg="rgba(76,175,80,0.15)"
              label={
                <Typography variant="caption" fontWeight={600} color="success.main">
                  Closed by <strong>{ev.by}</strong>
                </Typography>
              }
              meta={fmt(ev.at)}
              note={ev.note || undefined}
              isLast={isLast}
            />
          );
        })}
      </Stack>
    </Box>
  );
}
