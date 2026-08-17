import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  CheckCircleOutlined,
  PrintOutlined,
} from "@mui/icons-material";
import type { AssetIssue } from "../../types/projectAsset";
import type { RunIssue } from "../../types/assetWorkflowRun";
import MediaCapture from "./MediaCapture";
import HistoryStaircase from "./HistoryStaircase";
import { formatInstant } from "../../utils/datetime";
import { buildIssueHistory, type IssueHistoryContext } from "../../utils/issueHistory";
import { openHistoryReport } from "../../utils/generateHistoryReport";

type AnyIssue = AssetIssue | RunIssue;

interface Props {
  open: boolean;
  issue: AnyIssue;
  currentUser: string;
  timeZoneId?: string | null;
  readOnly?: boolean;
  hideComments?: boolean;
  hideResolutionMedia?: boolean;
  /** Static context for the root row of the history and the printed report. */
  historyContext?: IssueHistoryContext;
  onClose: () => void;
  onSave: (updated: AnyIssue) => void | Promise<void>;
}

const SEVERITY_COLOR: Record<string, "error" | "warning" | "default"> = {
  high: "error",
  medium: "warning",
  low: "default",
};

function formatIssueDate(iso: string, timeZoneId?: string | null) {
  return formatInstant(iso, timeZoneId, { withZone: false }) || iso;
}


export default function IssueDetailDialog({
  open,
  issue,
  currentUser,
  timeZoneId,
  readOnly = false,
  hideResolutionMedia = false,
  historyContext,
  onClose,
  onSave,
}: Props) {
  const [resolutionNote, setResolutionNote] = useState(issue.resolutionNote ?? "");
  const [resolutionError, setResolutionError] = useState(false);
  const [reportMedia, setReportMedia] = useState<string[]>(issue.reportMedia ?? []);
  const [resolutionMedia, setResolutionMedia] = useState<string[]>(issue.resolutionMedia ?? []);
  const [savingResolution, setSavingResolution] = useState(false);


  useEffect(() => {
    setResolutionNote(issue.resolutionNote ?? "");
    setResolutionError(false);
    setReportMedia(issue.reportMedia ?? []);
    setResolutionMedia(issue.resolutionMedia ?? []);
    setSavingResolution(false);
  }, [issue]);


  // Rebuilt from the issue itself, so the staircase and the printed report never diverge.
  const history = buildIssueHistory(issue, historyContext);

  async function handleCloseIssue() {
    const note = resolutionNote.trim();
    if (!note || savingResolution) {
      setResolutionError(true);
      return;
    }
    setResolutionError(false);
    setSavingResolution(true);
    try {
      await onSave({
        ...issue,
        reportMedia,
        resolved: true,
        resolutionNote: note,
        resolutionMedia,
        resolvedAt: new Date().toISOString(),
        resolvedBy: currentUser,
      });
    } finally {
      setSavingResolution(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          background: "linear-gradient(180deg, rgba(9,20,24,0.985) 0%, rgba(15,28,33,0.985) 100%)",
          border: "1px solid rgba(45,212,191,0.18)",
          borderRadius: 3,
          boxShadow: "0 28px 80px rgba(0,0,0,0.55)",
          overflow: "hidden",
        },
      }}
    >
      <DialogTitle sx={{ pb: 1.25, background: "linear-gradient(180deg, rgba(8,16,20,0.88) 0%, rgba(8,16,20,0.32) 100%)" }}>
        <Stack spacing={0.75}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Chip
              size="small"
              label={issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1)}
              color={SEVERITY_COLOR[issue.severity]}
            />
            <Chip
              size="small"
              label={issue.isBlocking ? "Blocking" : "Observation"}
              color={issue.isBlocking ? "error" : "warning"}
              variant="outlined"
            />
            {issue.resolved && (
              <Chip size="small" label="Closed" color="success" icon={<CheckCircleOutlined />} />
            )}
          </Stack>
          <Typography variant="h6" fontWeight={700}>
            {issue.description}
          </Typography>
          <Stack direction="row" spacing={1.5} flexWrap="wrap">
            <Typography variant="caption" color="text.secondary">
              Reported {formatIssueDate(issue.reportedAt, timeZoneId)}
            </Typography>
            {issue.stepTitle && (
              <Typography variant="caption" color="text.secondary">
                · Step: <em>{issue.stepTitle}</em>
              </Typography>
            )}
          </Stack>
        </Stack>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0, background: "transparent", borderColor: "rgba(255,255,255,0.08)" }}>
        {/* Closed banner */}
        {issue.resolved && (
          <Box sx={{ px: 2.5, pt: 2 }}>
            <Alert severity="success" icon={<CheckCircleOutlined />}>
              <Typography variant="body2" fontWeight={600}>
                Closed by {issue.resolvedBy ?? "Unknown"} · {issue.resolvedAt ? formatIssueDate(issue.resolvedAt, timeZoneId) : ""}
              </Typography>
              {issue.resolutionNote && (
                <Typography variant="body2" sx={{ mt: 0.5, fontStyle: "italic" }}>
                  "{issue.resolutionNote}"
                </Typography>
              )}
            </Alert>
            {/* Resolution media (read-only thumbnails) */}
            {(issue.resolutionMedia ?? []).length > 0 && (
              <Box sx={{ mt: 1.5 }}>
                <MediaCapture
                  media={issue.resolutionMedia ?? []}
                  onChange={() => {}}
                  label="Resolution Evidence"
                  disabled
                />
              </Box>
            )}
            {/* Report media (read-only thumbnails) */}
            {(issue.reportMedia ?? []).length > 0 && (
              <Box sx={{ mt: 1.5 }}>
                <MediaCapture
                  media={issue.reportMedia ?? []}
                  onChange={() => {}}
                  label="Reported Media"
                  disabled
                />
              </Box>
            )}
          </Box>
        )}

        {/* Close issue section */}
        {!issue.resolved && !readOnly && (
          <Box sx={{ px: 2.5, pt: 2, pb: 2 }}>
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                border: "1px solid rgba(46,125,50,0.35)",
                background: "linear-gradient(180deg, rgba(14,38,30,0.52) 0%, rgba(12,24,22,0.55) 100%)",
              }}
            >
              <Stack spacing={1.5}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                  <Typography variant="subtitle1" fontWeight={800} color="success.light" sx={{ letterSpacing: 0.2 }}>
                    Resolution
                  </Typography>
                  <Chip
                    label="Required to close"
                    size="small"
                    color="success"
                    variant="outlined"
                    sx={{ height: 20, fontSize: "0.68rem", fontWeight: 700 }}
                  />
                </Stack>
                <TextField
                  multiline
                  minRows={2}
                  size="small"
                  fullWidth
                  label="What action was taken? (required)"
                  value={resolutionNote}
                  onChange={(e) => { setResolutionNote(e.target.value); setResolutionError(false); }}
                  error={resolutionError}
                  helperText={resolutionError ? "Resolution note is required to close this issue." : undefined}
                />
                {!hideResolutionMedia && (
                  <MediaCapture
                    media={resolutionMedia}
                    onChange={setResolutionMedia}
                    label="Resolution Evidence — Photo / Video (optional)"
                    qrDocType="issue-photo"
                    qrLinkedTo={issue.id}
                  />
                )}
                <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<CheckCircleOutlined />}
                    disabled={savingResolution}
                    onClick={handleCloseIssue}
                  >
                    {savingResolution ? "Saving..." : "Close Issue"}
                  </Button>
                </Box>
              </Stack>
            </Box>
          </Box>
        )}

        {/* Fault history — staircase view */}
        <Box sx={{ px: 2.5, pb: 2.5 }}>
          <HistoryStaircase view={history} timeZoneId={timeZoneId} />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 2.5, py: 1.5 }}>
        <Button
          startIcon={<PrintOutlined />}
          onClick={() => openHistoryReport({ view: history, timeZoneId, documentLabel: "Fault history" })}
        >
          Print / export
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
