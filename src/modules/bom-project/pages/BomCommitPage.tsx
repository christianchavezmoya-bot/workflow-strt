import { useState } from "react";
import {
  Box, Typography, Button, Stack, Alert, Paper, Divider,
  FormControlLabel, Radio, RadioGroup, CircularProgress,
  TextField,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { useNavigate, useParams } from "react-router-dom";
import { useBomProject } from "../store/BomProjectContext";
import { commitDraft, type CommitMode } from "../services/bomCommitService";
import CommitSummary from "../components/CommitSummary";
import type { CommitResult } from "../services/bomCommitService";

export default function BomCommitPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useBomProject();
  const navigate = useNavigate();

  const [mode, setMode] = useState<CommitMode>("preview");
  const [projectName, setProjectName] = useState(
    state.draftProject?.projectName ?? ""
  );
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);

  const handleCommit = async () => {
    if (!state.draftProject || !state.validationResult) return;
    setCommitting(true);
    setError(null);
    try {
      const updatedDraft = { ...state.draftProject, projectName };
      const res = await commitDraft(id ?? "", updatedDraft, state.validationResult, mode);
      setResult(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setCommitting(false);
    }
  };

  if (result) {
    return (
      <Box maxWidth={600} mx="auto" mt={4}>
        <CommitSummary result={result} />
        <Stack direction="row" justifyContent="flex-end" spacing={1} mt={3}>
          {result.publishedProjectId && (
            <Button variant="contained" onClick={() => navigate(`/projects/${result.publishedProjectId}`)}>
              View Project
            </Button>
          )}
          <Button onClick={() => navigate("/admin/bom-project")}>Back to Dashboard</Button>
        </Stack>
      </Box>
    );
  }

  return (
    <Box maxWidth={600} mx="auto">
      <Typography variant="h5" fontWeight={700} gutterBottom>Commit Import</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Choose how to commit the draft. Preview is always safe — no live records are written.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>Project Name</Typography>
        <TextField
          fullWidth
          size="small"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="Enter project name…"
          sx={{ mb: 2 }}
        />

        <Divider sx={{ mb: 2 }} />

        <Typography variant="subtitle2" fontWeight={600} gutterBottom>Commit Mode</Typography>
        <RadioGroup value={mode} onChange={(e) => setMode(e.target.value as CommitMode)}>
          <FormControlLabel
            value="preview"
            control={<Radio />}
            label={
              <Box>
                <Typography variant="body2" fontWeight={500}>Preview Only</Typography>
                <Typography variant="caption" color="text.secondary">
                  No records written. Shows what would be created.
                </Typography>
              </Box>
            }
          />
          <FormControlLabel
            value="draft"
            control={<Radio />}
            label={
              <Box>
                <Typography variant="body2" fontWeight={500}>Save Draft</Typography>
                <Typography variant="caption" color="text.secondary">
                  Saves to BOM module staging tables. No live project created.
                </Typography>
              </Box>
            }
          />
          <FormControlLabel
            value="publish"
            control={<Radio />}
            disabled={!!state.validationResult?.isBlockingPublish}
            label={
              <Box>
                <Typography variant="body2" fontWeight={500}>
                  Publish
                  {state.validationResult?.isBlockingPublish && (
                    <Typography component="span" variant="caption" color="error.main" sx={{ ml: 1 }}>
                      (blocked — resolve errors first)
                    </Typography>
                  )}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Creates live project, assets, and workflow assignments.
                </Typography>
              </Box>
            }
          />
        </RadioGroup>
      </Paper>

      <Stack direction="row" justifyContent="flex-end" spacing={1}>
        <Button onClick={() => navigate(-1)}>Back</Button>
        <Button
          variant="contained"
          color={mode === "publish" ? "success" : "primary"}
          onClick={handleCommit}
          disabled={committing || !projectName.trim()}
          startIcon={committing ? <CircularProgress size={16} /> : <CheckCircleOutlineIcon />}
        >
          {committing ? "Processing…" : mode === "publish" ? "Publish Project" : mode === "draft" ? "Save Draft" : "Run Preview"}
        </Button>
      </Stack>
    </Box>
  );
}
