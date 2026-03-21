import { useEffect, useState } from "react";
import {
  Box, Button, Stack, Alert, Paper, Divider, CircularProgress,
  TextField, Typography, Chip, Grid,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import { useNavigate, useParams } from "react-router-dom";
import BomStepHeader from "../components/BomStepHeader";
import CommitSummary from "../components/CommitSummary";
import PublishConfirmDialog from "../components/PublishConfirmDialog";
import { useBomProject } from "../store/BomProjectContext";
import { validateImport } from "../services/bomValidationService";
import { commitDraft, type PublishDetails, type CommitResult } from "../services/bomCommitService";
import { bomApiService } from "../services/bomApiService";

export default function BomCommitPage() {
  const { id } = useParams<{ id: string }>();
  const { state, dispatch } = useBomProject();
  const navigate = useNavigate();

  const [projectName, setProjectName] = useState(state.draftProject?.projectName ?? "");
  const [customerName, setCustomerName] = useState(state.draftProject?.customerName ?? "");
  const [jobNumber, setJobNumber] = useState(`BOM-${(id ?? "").slice(0, 8).toUpperCase()}`);

  const [validating, setValidating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);

  // Run validation on mount
  useEffect(() => {
    if (!state.draftProject || !id || state.validationResult) return;
    setValidating(true);
    try {
      const result = validateImport(id, state.normalizedRows, state.classifications, state.draftProject);
      dispatch({ type: "SET_VALIDATION", payload: result });
      void bomApiService.saveValidationResult(id, result);
      void bomApiService.saveDraft(id, state.draftProject);
    } catch { /* non-blocking */ } finally {
      setValidating(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!state.draftProject) {
    return (
      <Box sx={{ textAlign: "center", py: 6 }}>
        <Alert severity="warning" sx={{ mb: 2, maxWidth: 480, mx: "auto" }}>
          Session data not found. Please start from the dashboard and complete all previous steps.
        </Alert>
        <Button variant="outlined" onClick={() => navigate("/admin/bom-project")}>
          Back to Dashboard
        </Button>
      </Box>
    );
  }

  const draft = state.draftProject;
  const validation = state.validationResult;
  const isBlocking = validation?.isBlockingPublish ?? false;

  const totalComponents = draft.assets.reduce((s, a) => s + a.components.length, 0);
  const totalCost = state.normalizedRows.reduce((sum, row) => {
    const qty = row.qty ?? 0;
    const price = (row as unknown as Record<string, unknown>).unitPrice as number | undefined ?? 0;
    return sum + (qty * price);
  }, 0);

  const runCommit = async (details: PublishDetails) => {
    if (!draft || !validation) return;
    setCommitting(true);
    setError(null);
    try {
      const updatedDraft = { ...draft, projectName };
      const res = await commitDraft(id ?? "", updatedDraft, validation, "publish", details);
      setResult(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setCommitting(false);
    }
  };

  // ── Success screen ──────────────────────────────────────────────────────────
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
    <Box maxWidth={760} mx="auto">
      <BomStepHeader
        activeStep={3}
        title="Create Project"
        subtitle="Review the summary below, fill in the project details, then click Create."
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* ── What will be created ── */}
      <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5 }}>
        <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
          What will be created
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={6} sm={3}>
            <Stack alignItems="center" spacing={0.5}>
              <BuildOutlinedIcon sx={{ color: "success.main", fontSize: 28 }} />
              <Typography variant="h5" fontWeight={700} color="success.main">{draft.assets.length}</Typography>
              <Typography variant="caption" color="text.secondary">Assets</Typography>
            </Stack>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Stack alignItems="center" spacing={0.5}>
              <CategoryOutlinedIcon sx={{ color: "primary.main", fontSize: 28 }} />
              <Typography variant="h5" fontWeight={700} color="primary.main">{totalComponents}</Typography>
              <Typography variant="caption" color="text.secondary">Components</Typography>
            </Stack>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Stack alignItems="center" spacing={0.5}>
              <Typography variant="h5" fontWeight={700} color="text.primary">
                {state.normalizedRows.length}
              </Typography>
              <Typography variant="caption" color="text.secondary">BOM Rows</Typography>
            </Stack>
          </Grid>
          {totalCost > 0 && (
            <Grid item xs={6} sm={3}>
              <Stack alignItems="center" spacing={0.5}>
                <Typography variant="h5" fontWeight={700} color="text.primary">
                  ${totalCost.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Typography>
                <Typography variant="caption" color="text.secondary">Est. Total Cost</Typography>
              </Stack>
            </Grid>
          )}
        </Grid>

        {/* Asset list preview */}
        <Divider sx={{ my: 2 }} />
        <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" mb={1}>
          ASSETS TO CREATE
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={0.75}>
          {draft.assets.slice(0, 12).map((a) => (
            <Chip key={a.draftAssetId} label={a.assetName} size="small" color="success" variant="outlined" />
          ))}
          {draft.assets.length > 12 && (
            <Chip label={`+${draft.assets.length - 12} more`} size="small" variant="outlined" />
          )}
        </Stack>
      </Paper>

      {/* ── Validation status ── */}
      {validating ? (
        <Stack direction="row" spacing={1} alignItems="center" mb={2}>
          <CircularProgress size={14} />
          <Typography variant="caption" color="text.secondary">Validating…</Typography>
        </Stack>
      ) : validation && (
        <Alert
          severity={isBlocking ? "error" : validation.warnings.length > 0 ? "warning" : "success"}
          icon={isBlocking ? <ErrorOutlineOutlinedIcon /> : <CheckCircleOutlineIcon />}
          sx={{ mb: 2.5 }}
        >
          {isBlocking
            ? `${validation.errors.length} error(s) must be resolved before creating the project. Go back and fix them.`
            : validation.warnings.length > 0
              ? `Ready to create — ${validation.warnings.length} warning(s) noted.`
              : "Validation passed — ready to create the project."}
        </Alert>
      )}

      {/* ── Project details form ── */}
      <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5 }}>
        <Typography variant="subtitle2" fontWeight={700} mb={2}>Project Details</Typography>
        <Stack spacing={2}>
          <TextField
            fullWidth
            size="small"
            label="Project Name *"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="e.g. Security Upgrade — Brisbane Office"
          />
          <Stack direction="row" spacing={1.5}>
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
              helperText="Auto-generated — edit if needed"
            />
          </Stack>
        </Stack>
      </Paper>

      <Stack direction="row" justifyContent="flex-end" spacing={1}>
        <Button onClick={() => navigate(-1)}>Back</Button>
        <Button
          variant="contained"
          color="success"
          size="large"
          onClick={() => setConfirmOpen(true)}
          disabled={committing || !projectName.trim() || isBlocking || validating}
          startIcon={committing ? <CircularProgress size={16} /> : <CheckCircleOutlineIcon />}
        >
          {committing ? "Creating Project…" : "Create Project"}
        </Button>
      </Stack>

      <PublishConfirmDialog
        open={confirmOpen}
        draft={{ ...draft, projectName }}
        customerName={customerName}
        jobNumber={jobNumber}
        onConfirm={() => {
          setConfirmOpen(false);
          void runCommit({ customerName, jobNumber, office: "" });
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </Box>
  );
}
