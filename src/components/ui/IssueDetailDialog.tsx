import { useEffect, useState } from "react";
import {
  Alert,
  Avatar,
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
  Tooltip,
  Typography,
} from "@mui/material";
import {
  CheckCircleOutlined,
  ErrorOutlined,
} from "@mui/icons-material";
import type { AssetIssue, IssueComment } from "../../types/projectAsset";
import type { RunIssue } from "../../types/assetWorkflowRun";
import MediaCapture from "./MediaCapture";
import IssueTimeline from "./IssueTimeline";

type AnyIssue = AssetIssue | RunIssue;

interface Props {
  open: boolean;
  issue: AnyIssue;
  currentUser: string;
  readOnly?: boolean;
  onClose: () => void;
  onSave: (updated: AnyIssue) => void | Promise<void>;
}

const SEVERITY_COLOR: Record<string, "error" | "warning" | "default"> = {
  high: "error",
  medium: "warning",
  low: "default",
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function initials(name: string) {
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export default function IssueDetailDialog({ open, issue, currentUser, readOnly = false, onClose, onSave }: Props) {
  const [commentText, setCommentText] = useState("");
  const [resolutionNote, setResolutionNote] = useState(issue.resolutionNote ?? "");
  const [resolutionError, setResolutionError] = useState(false);
  const [reportMedia, setReportMedia] = useState<string[]>(issue.reportMedia ?? []);
  const [resolutionMedia, setResolutionMedia] = useState<string[]>(issue.resolutionMedia ?? []);
  const [savingComment, setSavingComment] = useState(false);
  const [savingResolution, setSavingResolution] = useState(false);

  const comments: IssueComment[] = issue.comments ?? [];

  useEffect(() => {
    setCommentText("");
    setResolutionNote(issue.resolutionNote ?? "");
    setResolutionError(false);
    setReportMedia(issue.reportMedia ?? []);
    setResolutionMedia(issue.resolutionMedia ?? []);
    setSavingComment(false);
    setSavingResolution(false);
  }, [issue]);

  async function handleAddComment() {
    const text = commentText.trim();
    if (!text || savingComment) return;
    const newComment: IssueComment = {
      id: crypto.randomUUID(),
      text,
      author: currentUser,
      createdAt: new Date().toISOString(),
    };
    setSavingComment(true);
    try {
      await onSave({ ...issue, reportMedia, comments: [...comments, newComment] });
      setCommentText("");
    } finally {
      setSavingComment(false);
    }
  }

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
              Reported {formatDate(issue.reportedAt)}
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
                Closed by {issue.resolvedBy ?? "Unknown"} · {issue.resolvedAt ? formatDate(issue.resolvedAt) : ""}
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

        {/* Report media — capture when opening / viewing an open issue */}
        {!issue.resolved && !readOnly && (
          <Box sx={{ px: 2.5, pt: 2 }}>
            <MediaCapture
              media={reportMedia}
              onChange={setReportMedia}
              label="Attach Photo / Video (optional)"
              qrDocType="issue-photo"
              qrLinkedTo={issue.id}
            />
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
                <MediaCapture
                  media={resolutionMedia}
                  onChange={setResolutionMedia}
                  label="Resolution Evidence — Photo / Video (optional)"
                  qrDocType="issue-photo"
                  qrLinkedTo={issue.id}
                />
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

        {/* Comments thread */}
        <Box sx={{ px: 2.5, pt: issue.resolved ? 2 : 0.5, pb: 1 }}>
          <Typography variant="caption" fontWeight={700} sx={{ textTransform: "uppercase", letterSpacing: 0.8, color: "text.secondary" }}>
            Comments
          </Typography>
          <Box
            sx={{
              mt: 1,
              maxHeight: 260,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 1.25,
            }}
          >
            {comments.length === 0 ? (
              <Typography variant="body2" color="text.disabled" sx={{ fontStyle: "italic" }}>
                No comments yet.
              </Typography>
            ) : (
              comments.map((c) => (
                <Stack key={c.id} direction="row" spacing={1.25} alignItems="flex-start">
                  <Tooltip title={c.author}>
                    <Avatar
                      sx={{
                        width: 28,
                        height: 28,
                        fontSize: "0.7rem",
                        bgcolor: "#2dd4bf",
                        color: "#0b1d24",
                        flexShrink: 0,
                        mt: 0.25,
                      }}
                    >
                      {initials(c.author)}
                    </Avatar>
                  </Tooltip>
                  <Box sx={{ flex: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Typography variant="caption" fontWeight={700}>
                        {c.author}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatDate(c.createdAt)}
                      </Typography>
                    </Stack>
                    <Typography variant="body2" sx={{ mt: 0.25, whiteSpace: "pre-wrap" }}>
                      {c.text}
                    </Typography>
                  </Box>
                </Stack>
              ))
            )}
          </Box>
        </Box>

        {/* Add comment form */}
        {!readOnly && !issue.resolved && (
          <Box sx={{ px: 2.5, pb: 2 }}>
            <Stack spacing={1}>
              <TextField
                multiline
                minRows={2}
                size="small"
                fullWidth
                placeholder="Add a comment or follow-up action…"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void handleAddComment();
                }}
              />
              <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={!commentText.trim() || savingComment}
                  onClick={() => void handleAddComment()}
                >
                  {savingComment ? "Saving..." : "Add Comment"}
                </Button>
              </Box>
            </Stack>
          </Box>
        )}

        {/* Reopen hint for read-only resolved issues */}
        {issue.resolved && !readOnly && (
          <Box sx={{ px: 2.5, pb: 2 }}>
            <Alert severity="info" icon={<ErrorOutlined />} sx={{ fontSize: "0.78rem" }}>
              This issue is closed. Add a comment above if further follow-up is needed.
            </Alert>
          </Box>
        )}

        {/* Activity timeline */}
        <Box sx={{ px: 2.5, pb: 2.5 }}>
          <IssueTimeline issue={issue} />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 2.5, py: 1.5 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
