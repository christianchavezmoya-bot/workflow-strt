import { useEffect, useState } from "react";
import {
  Box, Button, Collapse, IconButton, Stack, Alert, Paper, Divider, CircularProgress,
  TextField, Typography, Chip, Grid, Autocomplete,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import ExpandLessOutlinedIcon from "@mui/icons-material/ExpandLessOutlined";
import { useNavigate, useParams } from "react-router-dom";
import BomStepHeader from "../components/BomStepHeader";
import PublishConfirmDialog from "../components/PublishConfirmDialog";
import { useBomProject } from "../store/BomProjectContext";
import { validateImport } from "../services/bomValidationService";
import { commitDraft, type PublishDetails } from "../services/bomCommitService";
import { bomApiService } from "../services/bomApiService";
import { siteService } from "../../../services/siteService";
import { customerService } from "../../../services/customerService";
import { useAuth } from "../../../hooks/useAuth";
import type { Site } from "../../../types/site";
import type { Customer } from "../../../types/customer";

export default function BomCommitPage() {
  const { id } = useParams<{ id: string }>();
  const { state, dispatch } = useBomProject();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [projectName, setProjectName] = useState(state.draftProject?.projectName ?? "");
  const [customerName, setCustomerName] = useState(state.draftProject?.customerName ?? "");
  const [jobNumber, setJobNumber] = useState(`BOM-${(id ?? "").slice(0, 8).toUpperCase()}`);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");

  const [validating, setValidating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warningsExpanded, setWarningsExpanded] = useState(false);

  const [sites, setSites] = useState<Site[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  useEffect(() => {
    Promise.all([siteService.getSites(), customerService.getCustomers()])
      .then(([s, c]) => { setSites(s); setCustomers(c); })
      .catch(() => { /* non-blocking — user can still type manually */ });
  }, []);

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
      await commitDraft(id ?? "", updatedDraft, validation, "publish", details);
      navigate("/projects");
    } catch (e) {
      setError(String(e));
    } finally {
      setCommitting(false);
    }
  };

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
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1.5}>
          <Typography variant="subtitle2" fontWeight={700}>
            What will be created
          </Typography>
          {state.selectedProduct && (
            <Chip
              label={`Product: ${state.selectedProduct.name}`}
              size="small"
              color="primary"
              variant="outlined"
            />
          )}
        </Stack>
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
        <Box sx={{ mb: 2.5 }}>
          <Alert
            severity={isBlocking ? "error" : validation.warnings.length > 0 ? "warning" : "success"}
            icon={isBlocking ? <ErrorOutlineOutlinedIcon /> : <CheckCircleOutlineIcon />}
            action={
              !isBlocking && validation.warnings.length > 0 ? (
                <IconButton size="small" onClick={() => setWarningsExpanded((v) => !v)}>
                  {warningsExpanded ? <ExpandLessOutlinedIcon fontSize="small" /> : <ExpandMoreOutlinedIcon fontSize="small" />}
                </IconButton>
              ) : undefined
            }
          >
            {isBlocking
              ? `${validation.errors.length} error(s) must be resolved before creating the project. Go back and fix them.`
              : validation.warnings.length > 0
                ? `Ready to create — ${validation.warnings.length} warning(s) noted. Click to review.`
                : "Validation passed — ready to create the project."}
          </Alert>
          {!isBlocking && validation.warnings.length > 0 && (
            <Collapse in={warningsExpanded}>
              <Paper variant="outlined" sx={{ mt: 0.5, px: 2, py: 1.5, borderColor: "warning.dark", background: "rgba(237,108,2,0.05)" }}>
                <Stack spacing={0.75}>
                  {validation.warnings.map((w) => (
                    <Stack key={w.id} direction="row" spacing={1} alignItems="flex-start">
                      <Typography variant="caption" color="warning.main" sx={{ mt: "1px", flexShrink: 0 }}>⚠</Typography>
                      <Box>
                        <Typography variant="caption" display="block">{w.message}</Typography>
                        {w.suggestion && (
                          <Typography variant="caption" color="text.disabled" display="block">{w.suggestion}</Typography>
                        )}
                      </Box>
                    </Stack>
                  ))}
                </Stack>
              </Paper>
            </Collapse>
          )}
        </Box>
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
            InputLabelProps={{ shrink: true }}
          />
          <Stack direction="row" spacing={1.5}>
            <Autocomplete
              fullWidth
              size="small"
              freeSolo
              options={sites.map((s) => {
                const cust = customers.find((c) => c.id === s.customerId);
                return {
                  label: `${s.name} — ${cust?.name ?? s.customerId}`,
                  customerName: cust?.name ?? "",
                  siteId: s.id,
                  customerId: cust?.customerId ?? "",   // external business code (matches project.customerId)
                  customerEntityId: s.customerId,       // UUID (customer.id)
                };
              })}
              getOptionLabel={(o) => typeof o === "string" ? o : o.label}
              inputValue={customerName}
              onInputChange={(_, val) => setCustomerName(val)}
              onChange={(_, val) => {
                if (val && typeof val !== "string") {
                  setCustomerName(val.customerName);
                  setSelectedSiteId(val.siteId);
                  setSelectedCustomerId(val.customerId);
                } else {
                  setSelectedSiteId("");
                  setSelectedCustomerId("");
                }
              }}
              renderInput={(params) => (
                <TextField {...params} label="Site — Customer" placeholder="Search sites…" InputLabelProps={{ ...params.InputLabelProps, shrink: true }} />
              )}
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
          void runCommit({
            customerName,
            jobNumber,
            office: user.office || "",
            siteId: selectedSiteId || undefined,
            customerId: selectedCustomerId || undefined,
            productId: state.selectedProduct?.id,
            normalizedRows: state.normalizedRows,
            classifications: state.classifications,
          });
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </Box>
  );
}
