import { CheckCircleOutlined, ReportProblemOutlined } from "@mui/icons-material";
import { Box, Button, Chip, Paper, Stack, TextField, Typography } from "@mui/material";
import type { ReactNode } from "react";
import MediaCapture from "../../components/ui/MediaCapture";
import type { AssetWorkflowRun, RunIssue } from "../../types/assetWorkflowRun";
import type { AssetIssue, ProjectAsset } from "../../types/projectAsset";
import { randomId } from "../../utils/randomId";

type RunIssueWithMeta = RunIssue & { runId: string };

export type AssetInstallationIssuesPanelProps = {
  asset: ProjectAsset;
  runs: AssetWorkflowRun[];
  currentUserName: string;
  inlineCommentTexts: Record<string, string>;
  inlineCorrectiveTexts: Record<string, string>;
  inlineReportMedia: Record<string, string[]>;
  inlineResolutionMedia: Record<string, string[]>;
  inlineSaving: boolean;
  onCommentTextChange: (issueId: string, text: string) => void;
  onCorrectiveTextChange: (issueId: string, text: string) => void;
  onReportMediaChange: (issueId: string, media: string[]) => void;
  onResolutionMediaChange: (issueId: string, media: string[]) => void;
  onClearCommentText: (issueId: string) => void;
  onClearCorrectiveText: (issueId: string) => void;
  onClearResolutionMedia: (issueId: string) => void;
  onSaveAssetIssue: (asset: ProjectAsset, issue: AssetIssue) => void;
  onSaveRunIssue: (runId: string, assetId: string, issue: RunIssue) => void;
  onOpenAddIssue: (asset: ProjectAsset) => void;
};

function renderIssueCard(
  issue: AssetIssue | RunIssue,
  props: AssetInstallationIssuesPanelProps,
  onSaveComment: (updated: AssetIssue | RunIssue) => void,
  onCloseIssue: (note: string, media?: string[]) => void,
  isRunIssue?: boolean,
): ReactNode {
  const comments = issue.comments ?? [];
  const commentVal = props.inlineCommentTexts[issue.id] ?? "";
  const correctiveVal = props.inlineCorrectiveTexts[issue.id] ?? "";
  const reportMediaVal = props.inlineReportMedia[issue.id] ?? [];
  const resolutionMediaVal = props.inlineResolutionMedia[issue.id] ?? [];

  return (
    <Paper
      key={issue.id}
      variant="outlined"
      sx={{
        p: 1.5,
        bgcolor: issue.resolved ? "rgba(255,255,255,0.02)" : "rgba(244,67,54,0.03)",
        borderColor: issue.resolved ? "divider" : "error.dark",
        opacity: issue.resolved ? 0.65 : 1,
      }}
    >
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="flex-start">
        <Box sx={{ flex: "0 0 28%", minWidth: 0 }}>
          <Typography
            variant="caption"
            fontWeight={700}
            color="text.secondary"
            sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}
            display="block"
            mb={0.5}
          >
            Issue Description
          </Typography>
          <Typography
            variant="caption"
            display="block"
            sx={{ mb: 0.5, textDecoration: issue.resolved ? "line-through" : "none" }}
          >
            {issue.description}
          </Typography>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap mb={0.5}>
            <Chip size="small" label={issue.severity.toUpperCase()} variant="outlined" sx={{ fontSize: 9, height: 16 }} />
            <Chip
              size="small"
              label={issue.isBlocking ? "Blocking" : "Observation"}
              color={issue.isBlocking ? "error" : "warning"}
              sx={{ fontSize: 9, height: 16 }}
            />
            {isRunIssue && (
              <Chip size="small" label="Workflow" sx={{ fontSize: 9, height: 16, "& .MuiChip-label": { px: 0.5 } }} />
            )}
            {issue.resolved && <Chip size="small" label="Resolved" color="success" sx={{ fontSize: 9, height: 16 }} />}
          </Stack>
          {issue.stepTitle && (
            <Typography variant="caption" color="text.secondary" display="block">
              Step: {issue.stepTitle}
            </Typography>
          )}
          <Typography variant="caption" color="text.disabled" display="block">
            {"createdBy" in issue && issue.createdBy ? `${issue.createdBy} | ` : ""}
            {new Date(issue.reportedAt).toLocaleString()}
          </Typography>
          {!issue.resolved && (
            <Box sx={{ mt: 1 }}>
              <MediaCapture
                media={reportMediaVal}
                onChange={(m) => props.onReportMediaChange(issue.id, m)}
                label="Attach Photo / Video"
                qrDocType="issue-photo"
                qrLinkedTo={issue.id}
              />
            </Box>
          )}
          {issue.resolved && (issue.reportMedia ?? []).length > 0 && (
            <Box sx={{ mt: 0.75 }}>
              <MediaCapture media={issue.reportMedia ?? []} onChange={() => {}} label="Reported Media" disabled />
            </Box>
          )}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="caption"
            fontWeight={700}
            color="text.secondary"
            sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}
            display="block"
            mb={0.5}
          >
            Comments
          </Typography>
          {comments.length === 0 ? (
            <Typography variant="caption" color="text.disabled" display="block" mb={0.75}>
              No comments yet.
            </Typography>
          ) : (
            <Stack spacing={0.75} sx={{ maxHeight: 120, overflowY: "auto", mb: 0.75 }}>
              {comments.map((c) => (
                <Box key={c.id} sx={{ p: 0.5, borderRadius: 0.5, bgcolor: "rgba(255,255,255,0.04)" }}>
                  <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
                    <Typography variant="caption" fontWeight={700}>
                      {c.author}
                    </Typography>
                    <Typography variant="caption" color="text.disabled">
                      {new Date(c.createdAt).toLocaleString()}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" display="block">
                    {c.text}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}
          {!issue.resolved && (
            <>
              <TextField
                size="small"
                fullWidth
                multiline
                rows={2}
                placeholder="Add a comment..."
                value={commentVal}
                onChange={(e) => props.onCommentTextChange(issue.id, e.target.value)}
                sx={{ fontSize: 11, mb: 0.5 }}
              />
              <Button
                size="small"
                variant="outlined"
                disabled={!commentVal.trim() || props.inlineSaving}
                onClick={() => {
                  const text = commentVal.trim();
                  if (!text) return;
                  const newComment = {
                    id: randomId(),
                    text,
                    author: props.currentUserName,
                    createdAt: new Date().toISOString(),
                  };
                  onSaveComment({
                    ...issue,
                    reportMedia: props.inlineReportMedia[issue.id]?.length
                      ? props.inlineReportMedia[issue.id]
                      : issue.reportMedia,
                    comments: [...(issue.comments ?? []), newComment],
                  });
                  props.onClearCommentText(issue.id);
                }}
                sx={{ fontSize: 11 }}
              >
                Save Comment
              </Button>
            </>
          )}
        </Box>

        <Box sx={{ flex: "0 0 28%", minWidth: 0 }}>
          <Typography
            variant="caption"
            fontWeight={700}
            color="text.secondary"
            sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}
            display="block"
            mb={0.5}
          >
            Corrective Action
          </Typography>
          {issue.resolved ? (
            <Typography variant="caption" display="block" sx={{ fontStyle: "italic", color: "text.secondary" }}>
              {issue.resolutionNote ?? "-"}
            </Typography>
          ) : (
            <>
              <TextField
                size="small"
                fullWidth
                multiline
                rows={3}
                placeholder="Describe corrective action taken..."
                value={correctiveVal}
                onChange={(e) => props.onCorrectiveTextChange(issue.id, e.target.value)}
                sx={{ fontSize: 11, mb: 0.75 }}
              />
              <Box sx={{ mb: 0.75 }}>
                <MediaCapture
                  media={resolutionMediaVal}
                  onChange={(m) => props.onResolutionMediaChange(issue.id, m)}
                  label="Resolution Evidence"
                  qrDocType="issue-photo"
                  qrLinkedTo={issue.id}
                />
              </Box>
              <Button
                size="small"
                variant="contained"
                color="success"
                fullWidth
                disabled={!correctiveVal.trim() || props.inlineSaving}
                startIcon={<CheckCircleOutlined sx={{ fontSize: "0.85rem !important" }} />}
                onClick={() => {
                  onCloseIssue(
                    correctiveVal.trim(),
                    resolutionMediaVal.length > 0 ? resolutionMediaVal : undefined,
                  );
                  props.onClearCorrectiveText(issue.id);
                  props.onClearResolutionMedia(issue.id);
                }}
                sx={{ fontSize: 11, py: 0.25 }}
              >
                Close Issue
              </Button>
            </>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}

export default function AssetInstallationIssuesPanel(props: AssetInstallationIssuesPanelProps) {
  const { asset, runs, onOpenAddIssue } = props;

  let issues: AssetIssue[] = [];
  try {
    issues = JSON.parse(asset.issuesJson || "[]");
  } catch {
    /* ignore */
  }

  const runIssuesWithMeta: RunIssueWithMeta[] = [];
  for (const run of runs) {
    try {
      const ri = JSON.parse(run.issuesJson || "[]") as RunIssue[];
      runIssuesWithMeta.push(...ri.map((i) => ({ ...i, runId: run.id })));
    } catch {
      /* ignore */
    }
  }

  const openCount =
    issues.filter((i) => !i.resolved).length + runIssuesWithMeta.filter((i) => !i.resolved).length;
  const totalCount = issues.length + runIssuesWithMeta.length;

  return (
    <Box sx={{ mt: 1.5 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={0.75}>
        <Typography
          variant="caption"
          fontWeight={700}
          color="text.secondary"
          sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          Issues {totalCount > 0 && `(${openCount} open)`}
        </Typography>
        <Button
          size="small"
          variant="outlined"
          color="error"
          startIcon={<ReportProblemOutlined fontSize="small" />}
          sx={{ fontSize: 11, py: 0.25 }}
          onClick={() => onOpenAddIssue(asset)}
        >
          Add issue
        </Button>
      </Stack>
      {totalCount === 0 ? (
        <Typography variant="caption" color="text.disabled">
          No issues recorded.
        </Typography>
      ) : (
        <Stack spacing={1}>
          {issues.map((issue) =>
            renderIssueCard(
              issue,
              props,
              (updated) => props.onSaveAssetIssue(asset, updated as AssetIssue),
              (note, media) =>
                props.onSaveAssetIssue(asset, {
                  ...issue,
                  resolved: true,
                  resolutionNote: note,
                  resolutionMedia: media,
                  resolvedAt: new Date().toISOString(),
                  resolvedBy: props.currentUserName,
                }),
            ),
          )}
          {runIssuesWithMeta.map((issue) =>
            renderIssueCard(
              issue,
              props,
              (updated) => props.onSaveRunIssue(issue.runId, asset.id, updated as RunIssue),
              (note, media) =>
                props.onSaveRunIssue(issue.runId, asset.id, {
                  ...issue,
                  resolved: true,
                  resolutionNote: note,
                  resolutionMedia: media,
                  resolvedAt: new Date().toISOString(),
                  resolvedBy: props.currentUserName,
                }),
              true,
            ),
          )}
        </Stack>
      )}
    </Box>
  );
}
