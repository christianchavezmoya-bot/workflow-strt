import { useState } from "react";
import {
  Box, Typography, Button, Stack, Alert, Paper, Divider,
  FormControlLabel, Radio, RadioGroup, CircularProgress,
  TextField, Collapse,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { useNavigate, useParams } from "react-router-dom";
import { useBomProject } from "../store/BomProjectContext";
import { commitDraft, type CommitMode, type PublishDetails } from "../services/bomCommitService";
import CommitSummary from "../components/CommitSummary";
import PublishConfirmDialog from "../components/PublishConfirmDialog";
import type { CommitResult } from "../services/bomCommitService";

export default function BomCommitPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useBomProject();
  const navigate = useNavigate();

  const [mode, setMode] = useState<CommitMode>("preview");
  const [projectName, setProjectName] = useState(
    state.draftProject?.projectName ?? ""
  );
  const [customerName, setCustomerName] = useState(state.draftProject?.customerName ?? "");
  const [jobNumber, setJobNumber] = useState(
    `BOM-${(id ?? "").slice(0, 8).toUpperCase()}`
  );

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);

  // Guard: session lost on refresh
  if (!state.draftProject) {
    return (
      <Box sx={{ textAlign: "center", py: 6 }}>
        <Alert severity="warning" sx={{ mb: 2, maxWidth: 480, mx: "auto" }}>
          Session data not found. Please start from the dashboard and complete all previous steps first.
        </Alert>
        <Button variant="outlined" onClick={() => navigate("/admin/bom-project")}>
          Back to Dashboard
        </Button>
      </Box>
    );
  }

  const handlePublishClick = () => {
    // For publish mode, open the confirm dialog first
    if (mode === "publish") {
      setConfirmOpen(true);
    } else {
      void runCommit();
    }
  };

  const runCommit = async (details?: PublishDetails) => {
    if (!state.draftProject || !state.validationResult) return;
    setCommitting(true);
    setError(null);
    try {
      const updatedDraft = { ...state.draftProject, projectName };
      const res = await commitDraft(
        id ?? "",
        updatedDraft,
        state.validationResult,
        mode,
        details
      );
      setResult(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setCommitting(false);
    }
  };

  const handleConfirmAccept = () => {
    setConfirmOpen(false);
    void runCommit({ customerName, jobNumber, office: "" });
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
                  No records written. Shows exactly what would be created.
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
                  Saves to BOM module staging tables only. No live project created.
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
                  Creates a live project and assets. You will be asked to confirm before anything is written.
                </Typography>
              </Box>
            }
          />
        </RadioGroup>

        {/* Extra fields — only shown in publish mode */}
        <Collapse in={mode === "publish"}>
          <Divider sx={{ mt: 2, mb: 2 }} />
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            Project Details
          </Typography>
          <Stack spacing={1.5}>
            <TextField
              fullWidth
              size="small"
              label="Customer Name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Acme Corp"
            />
            <TextField
              fullWidth
              size="small"
              label="Job Number"
              value={jobNumber}
              onChange={(e) => setJobNumber(e.target.value)}
              placeholder="e.g. BOM-A1B2C3D4"
              helperText="Auto-generated from the import run ID — edit if needed."
            />
          </Stack>
        </Collapse>
      </Paper>

      <Stack direction="row" justifyContent="flex-end" spacing={1}>
        <Button onClick={() => navigate(-1)}>Back</Button>
        <Button
          variant="contained"
          color={mode === "publish" ? "success" : "primary"}
          onClick={handlePublishClick}
          disabled={committing || !projectName.trim()}
          startIcon={committing ? <CircularProgress size={16} /> : <CheckCircleOutlineIcon />}
        >
          {committing
            ? "Processing…"
            : mode === "publish"
            ? "Publish Project…"
            : mode === "draft"
            ? "Save Draft"
            : "Run Preview"}
        </Button>
      </Stack>

      {/* Confirmation dialog — only shown before publish */}
      {state.draftProject && (
        <PublishConfirmDialog
          open={confirmOpen}
          draft={{ ...state.draftProject, projectName }}
          customerName={customerName}
          jobNumber={jobNumber}
          onConfirm={handleConfirmAccept}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </Box>
  );
}
