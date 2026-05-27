import { useState } from "react";
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

type AnyIssue = AssetIssue | RunIssue;

interface Props {
  open: boolean;
  issue: AnyIssue;
  currentUser: string;
  readOnly?: boolean;
  onClose: () => void;
  onSave: (updated: AnyIssue) => void;
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

  const comments: IssueComment[] = issue.comments ?? [];

  function handleAddComment() {
    const text = commentText.trim();
    if (!text) return;
    const newComment: IssueComment = {
      id: crypto.randomUUID(),
      text,
      author: currentUser,
      createdAt: new Date().toISOString(),
    };
    onSave({ ...issue, reportMedia, comments: [...comments, newComment] });
    setCommentText("");
  }

  function handleCloseIssue() {
    const note = resolutionNote.trim();
    if (!note) {
      setResolutionError(true);
      return;
    }
    setResolutionError(false);
    onSave({
      ...issue,
      reportMedia,
      resolved: true,
      resolutionNote: note,
      resolutionMedia,
      resolvedAt: new Date().toISOString(),
      resolvedBy: currentUser,
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        className: "glass-card",
        sx: { background: "var(--panel)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 3 },
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
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
          <Typography variant="subtitle1" fontWeight={600}>
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

      <DialogContent dividers sx={{ p: 0 }}>
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
              linkedToType="issue-report"
              linkedToId={issue.id}
            />
          </Box>
        )}

        {/* Comments thread */}
        <Box sx={{ px: 2.5, pt: 2, pb: 1 }}>
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
        {!readOnly && (
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
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleAddComment();
                }}
              />
              <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={!commentText.trim()}
                  onClick={handleAddComment}
                >
                  Add Comment
                </Button>
              </Box>
            </Stack>
          </Box>
        )}

        {/* Close issue section */}
        {!issue.resolved && !readOnly && (
          <>
            <Divider>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
                Resolution
              </Typography>
            </Divider>
            <Box sx={{ px: 2.5, pt: 1.5, pb: 2 }}>
              <Stack spacing={1.25}>
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
                  linkedToType="issue-resolution"
                  linkedToId={issue.id}
                />
                <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<CheckCircleOutlined />}
                    onClick={handleCloseIssue}
                  >
                    Close Issue
                  </Button>
                </Box>
              </Stack>
            </Box>
          </>
        )}

        {/* Reopen hint for read-only resolved issues */}
        {issue.resolved && !readOnly && (
          <Box sx={{ px: 2.5, pb: 2 }}>
            <Alert severity="info" icon={<ErrorOutlined />} sx={{ fontSize: "0.78rem" }}>
              This issue is closed. Add a comment above if further follow-up is needed.
            </Alert>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2.5, py: 1.5 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
