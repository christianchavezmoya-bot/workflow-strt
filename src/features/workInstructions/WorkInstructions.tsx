import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArticleOutlined,
  ArrowBackOutlined,
  BuildOutlined,
  ContentCopyOutlined,
  DeleteOutline,
  DownloadOutlined,
  FormatListBulletedOutlined,
  PublishOutlined,
  SearchOutlined,
  SettingsOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  ListItemIcon,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { demoProducts } from "../../data/demo";
import type { FeatureSelection } from "../../services/productConfigService";
import { workflowConfigService } from "../../services/workflowConfigService";
import { usePermissions } from "../../hooks/usePermissions";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { fetchProducts } from "../../store/productsSlice";
import type { Workflow } from "../../types/workflow";
import type { WorkflowConfig } from "../../types/workflowConfig";
import WorkflowBuilder from "./WorkflowBuilder";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function parseSteps(cfg: WorkflowConfig): Workflow | null {
  try {
    const parsed = JSON.parse(cfg.stepsJson);
    if (parsed && Array.isArray(parsed.steps)) return parsed as Workflow;
    if (Array.isArray(parsed)) {
      return { id: cfg.id, name: cfg.name, productId: cfg.productId, createdAt: Date.now(), steps: parsed, media: [] };
    }
  } catch {}
  return null;
}

function downloadJson(cfg: WorkflowConfig, productName: string) {
  const blob = new Blob(
    [JSON.stringify({ ...cfg, productName }, null, 2)],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `work-instruction-${cfg.name.replace(/\s+/g, "-").toLowerCase()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function printPdf(cfg: WorkflowConfig, productName: string) {
  const workflow = parseSteps(cfg);
  const steps = workflow?.steps ? [...workflow.steps].sort((a, b) => a.order - b.order) : [];
  const stepsHtml = steps
    .map(
      (step) => `
      <div style="margin-bottom:16px">
        <div style="font-size:14px;font-weight:600;margin-bottom:4px;padding-bottom:3px;border-bottom:1px solid #ddd">${step.title}</div>
        ${step.description ? `<p style="margin:0 0 6px;font-size:12px;color:#666">${step.description}</p>` : ""}
        ${
          step.inputs.length
            ? `<table style="width:100%;border-collapse:collapse">
                ${step.inputs
                  .map(
                    (inp) =>
                      `<tr>
                        <td style="padding:3px 10px 3px 0;color:#555;font-size:12px;width:40%">${inp.label}</td>
                        <td style="padding:3px 0;font-size:12px;color:#aaa;font-style:italic">_______________</td>
                       </tr>`,
                  )
                  .join("")}
               </table>`
            : "<p style='color:#aaa;font-size:12px'>No inputs</p>"
        }
      </div>`,
    )
    .join("");

  const html = `<html><head><title>Work Instruction — ${cfg.name}</title>
    <style>body{font-family:Arial,sans-serif;padding:30px;color:#1a1a1a}@media print{body{padding:0}}</style>
    </head><body>
    <h2 style="margin:0 0 4px">Work Instruction: ${cfg.name}</h2>
    <p style="margin:0 0 16px;font-size:13px;color:#666">
      Product: ${productName}&nbsp;|&nbsp;
      Configuration Type: ${cfg.configType ?? "—"}&nbsp;|&nbsp;
      Status: ${cfg.status}&nbsp;|&nbsp;v${cfg.version}
    </p>
    ${cfg.notes ? `<p style="margin:0 0 12px;font-size:12px;color:#555;font-style:italic">${cfg.notes}</p>` : ""}
    ${cfg.createdBy ? `<p style="margin:0 0 12px;font-size:12px;color:#888">Created by: ${cfg.createdBy} on ${formatDate(cfg.createdAt)}</p>` : ""}
    <hr style="margin:14px 0">
    ${stepsHtml || "<p>No workflow steps defined.</p>"}
    </body></html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

// ─── Status chip ──────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: string }) {
  const color =
    status === "Published" ? "success"
    : status === "Archived" ? "default"
    : "warning";
  return <Chip size="small" label={status} color={color as "success" | "default" | "warning"} />;
}

// ─── Preview dialog ────────────────────────────────────────────────────────────

interface PreviewProps {
  open: boolean;
  cfg: WorkflowConfig;
  productName: string;
  onClose: () => void;
}

function PreviewDialog({ open, cfg, productName, onClose }: PreviewProps) {
  const [activeStep, setActiveStep] = useState(0);

  const workflow = useMemo(() => parseSteps(cfg), [cfg]);
  const steps = useMemo(
    () => (workflow?.steps ? [...workflow.steps].sort((a, b) => a.order - b.order) : []),
    [workflow],
  );
  const currentStep = steps[activeStep] ?? null;

  useEffect(() => {
    if (open) setActiveStep(0);
  }, [open, cfg.id]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { height: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" } }}
    >
      {/* ── Colored header band ── */}
      <Box sx={{ bgcolor: "primary.main", color: "primary.contrastText", px: 3, py: 2.5, flexShrink: 0 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" fontWeight={700} sx={{ fontFamily: "Sora" }}>
              {cfg.name}
            </Typography>
            <Stack direction="row" spacing={0} flexWrap="wrap" useFlexGap sx={{ mt: 0.5, gap: "4px 16px" }}>
              <Typography variant="caption" sx={{ opacity: 0.85 }}>Product: {productName}</Typography>
              {cfg.configType && (
                <Typography variant="caption" sx={{ opacity: 0.85 }}>Type: {cfg.configType}</Typography>
              )}
              {cfg.createdBy && (
                <Typography variant="caption" sx={{ opacity: 0.85 }}>By: {cfg.createdBy}</Typography>
              )}
              <Typography variant="caption" sx={{ opacity: 0.75 }}>{formatDate(cfg.createdAt)}</Typography>
            </Stack>
            {cfg.notes && (
              <Typography variant="caption" fontStyle="italic" sx={{ opacity: 0.7, mt: 0.5, display: "block" }}>
                {cfg.notes}
              </Typography>
            )}
          </Box>
          <Stack alignItems="flex-end" spacing={0.75} sx={{ flexShrink: 0 }}>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <StatusChip status={cfg.status} />
              <Chip
                size="small"
                label={`v${cfg.version}`}
                variant="outlined"
                sx={{ color: "primary.contrastText", borderColor: "rgba(255,255,255,0.5)" }}
              />
            </Stack>
            {steps.length > 0 && (
              <Typography variant="caption" sx={{ opacity: 0.7 }}>
                {steps.length} step{steps.length === 1 ? "" : "s"}
              </Typography>
            )}
          </Stack>
        </Stack>
      </Box>

      {/* ── Body ── */}
      <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {!workflow || steps.length === 0 ? (
          <Box sx={{ p: 3, flex: 1 }}>
            <Alert severity="info">
              {!workflow
                ? "No workflow steps defined for this work instruction."
                : "This workflow has no steps defined yet."}
            </Alert>
          </Box>
        ) : (
          <>
            {/* Left sidebar — step list */}
            <Box
              sx={{
                width: 200,
                flexShrink: 0,
                borderRight: "1px solid",
                borderColor: "divider",
                overflowY: "auto",
                bgcolor: "grey.50",
              }}
            >
              <Box sx={{ px: 1.5, pt: 1.5, pb: 1 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  fontWeight={700}
                  sx={{ textTransform: "uppercase", letterSpacing: 0.6 }}
                >
                  Steps
                </Typography>
              </Box>
              <Divider />
              {steps.map((step, idx) => (
                <Box
                  key={step.id}
                  onClick={() => setActiveStep(idx)}
                  sx={{
                    px: 1.5,
                    py: 1.25,
                    cursor: "pointer",
                    bgcolor: activeStep === idx ? "primary.main" : "transparent",
                    color: activeStep === idx ? "primary.contrastText" : "text.primary",
                    "&:hover": { bgcolor: activeStep === idx ? "primary.dark" : "action.hover" },
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    transition: "background-color 0.15s",
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{ opacity: 0.65, display: "block", fontWeight: 700, lineHeight: 1.2 }}
                  >
                    {String(step.order).padStart(2, "0")}
                  </Typography>
                  <Typography variant="body2" fontWeight={activeStep === idx ? 600 : 400} noWrap>
                    {step.title || "(Untitled)"}
                  </Typography>
                  {(step.inputs ?? []).length > 0 && (
                    <Typography variant="caption" sx={{ opacity: 0.6 }}>
                      {step.inputs.length} input{step.inputs.length === 1 ? "" : "s"}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>

            {/* Right — step content */}
            <Box sx={{ flex: 1, overflowY: "auto", p: 3.5 }}>
              {currentStep && (
                <Stack spacing={3}>
                  <Box>
                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                      <Box
                        sx={{
                          width: 34,
                          height: 34,
                          borderRadius: "50%",
                          bgcolor: "primary.main",
                          color: "primary.contrastText",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          fontWeight: 700,
                          fontSize: 14,
                        }}
                      >
                        {currentStep.order}
                      </Box>
                      <Typography variant="h6" fontWeight={600}>
                        {currentStep.title || "(Untitled step)"}
                      </Typography>
                    </Stack>
                    {currentStep.description && (
                      <Typography variant="body2" color="text.secondary" sx={{ pl: "50px" }}>
                        {currentStep.description}
                      </Typography>
                    )}
                  </Box>

                  <Divider />

                  {(currentStep.inputs ?? []).length === 0 ? (
                    <Typography variant="body2" color="text.disabled" fontStyle="italic">
                      No input fields for this step.
                    </Typography>
                  ) : (
                    <Stack spacing={0}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        fontWeight={700}
                        sx={{ textTransform: "uppercase", letterSpacing: 0.6, mb: 1.5, display: "block" }}
                      >
                        Input Fields
                      </Typography>
                      {currentStep.inputs.map((inp, i) => (
                        <Box
                          key={inp.id}
                          sx={{
                            display: "grid",
                            gridTemplateColumns: "230px 1fr",
                            gap: 2,
                            alignItems: "center",
                            py: 1.5,
                            px: 1.5,
                            bgcolor: i % 2 === 0 ? "grey.50" : "transparent",
                            borderRadius: 1,
                          }}
                        >
                          <Box>
                            <Typography variant="body2" fontWeight={500}>
                              {inp.label}
                              {inp.required && (
                                <Typography component="span" variant="caption" color="error.main" sx={{ ml: 0.5 }}>
                                  *
                                </Typography>
                              )}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.disabled"
                              sx={{ textTransform: "uppercase", letterSpacing: 0.4 }}
                            >
                              {inp.type}
                              {inp.type === "choice" && (inp.options ?? []).length > 0
                                ? ` · ${inp.options!.join(" / ")}`
                                : ""}
                            </Typography>
                          </Box>
                          <Box
                            sx={{
                              borderBottom: "1.5px solid",
                              borderColor: "grey.400",
                              minHeight: inp.type === "note" ? 56 : 30,
                            }}
                          />
                        </Box>
                      ))}
                    </Stack>
                  )}

                  {currentStep.decisionsEnabled && (currentStep.decisions ?? []).length > 0 && (
                    <Box>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        fontWeight={700}
                        sx={{ textTransform: "uppercase", letterSpacing: 0.6, display: "block", mb: 1 }}
                      >
                        Decision Options
                      </Typography>
                      <Stack direction="row" flexWrap="wrap" gap={1} useFlexGap>
                        {currentStep.decisions.map((d) => (
                          <Chip key={d.id} label={d.label || "(option)"} variant="outlined" size="small" />
                        ))}
                      </Stack>
                    </Box>
                  )}

                  <Stack direction="row" spacing={1} alignItems="center" pt={1}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setActiveStep((p) => Math.max(0, p - 1))}
                      disabled={activeStep === 0}
                    >
                      ← Previous
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setActiveStep((p) => Math.min(steps.length - 1, p + 1))}
                      disabled={activeStep === steps.length - 1}
                    >
                      Next →
                    </Button>
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                      Step {activeStep + 1} of {steps.length}
                    </Typography>
                  </Stack>
                </Stack>
              )}
            </Box>
          </>
        )}
      </Box>

      <Divider />
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Config form state ────────────────────────────────────────────────────────

interface ConfigFormState {
  name: string;
  configType: string;
  notes: string;
  featureSelections: FeatureSelection[];
}

const emptyConfigForm = (): ConfigFormState => ({
  name: "",
  configType: "",
  notes: "",
  featureSelections: [],
});

// ─── WorkInstructions component ───────────────────────────────────────────────

const WorkInstructions = () => {
  const can = usePermissions();
  const dispatch = useAppDispatch();
  const productsState = useAppSelector((state) => state.products);
  const [searchParams, setSearchParams] = useSearchParams();

  const [tab, setTab] = useState(0);
  const [viewMode, setViewMode] = useState<"instructions" | "builder">("instructions");

  const [configs, setConfigs] = useState<WorkflowConfig[]>([]);
  const [configsLoading, setConfigsLoading] = useState(false);
  const [configSearch, setConfigSearch] = useState("");

  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<WorkflowConfig | null>(null);
  const [configForm, setConfigForm] = useState<ConfigFormState>(emptyConfigForm());
  const [configError, setConfigError] = useState<string | null>(null);
  const [configSaving, setConfigSaving] = useState(false);

  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [previewConfig, setPreviewConfig] = useState<WorkflowConfig | null>(null);
  const [exportMenu, setExportMenu] = useState<{ el: HTMLElement; cfg: WorkflowConfig } | null>(null);
  const [deleteConfig, setDeleteConfig] = useState<WorkflowConfig | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);

  const [settingsMenu, setSettingsMenu] = useState<HTMLElement | null>(null);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);

  useEffect(() => { dispatch(fetchProducts()); }, [dispatch]);

  const products = useMemo(
    () => (productsState.items.length ? productsState.items : demoProducts),
    [productsState.items],
  );

  useEffect(() => {
    if (tab >= products.length) setTab(Math.max(0, products.length - 1));
  }, [tab, products.length]);

  // Restore active product tab + view mode from URL (priority) or sessionStorage (fallback).
  // Always pushes the resolved state back to the URL so Favorites captures the exact sub-page.
  useEffect(() => {
    if (products.length === 0) return;
    const productIdFromUrl = searchParams.get("product");
    const viewFromUrl = searchParams.get("view");

    let resolvedTabIdx = 0;
    if (productIdFromUrl) {
      const idx = products.findIndex((p) => p.id === productIdFromUrl);
      if (idx >= 0) resolvedTabIdx = idx;
    } else {
      try {
        const stored = sessionStorage.getItem("work_instructions_active_product_id");
        if (stored) {
          const idx = products.findIndex((p) => p.id === stored);
          if (idx >= 0) resolvedTabIdx = idx;
        }
      } catch {}
    }

    const resolvedView: "instructions" | "builder" =
      viewFromUrl === "builder" ? "builder" : "instructions";

    setTab(resolvedTabIdx);
    setViewMode(resolvedView);

    const productId = products[resolvedTabIdx]?.id;
    const params: Record<string, string> = {};
    if (productId) params.product = productId;
    params.view = resolvedView;
    setSearchParams(params, { replace: true });
  }, [products]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeProduct = products[tab];
  const activeFeatures = activeProduct?.features ?? [];

  useEffect(() => {
    setSelectedConfigId(null);
  }, [activeProduct?.id]);

  const loadConfigs = useCallback(async (productId: string) => {
    setConfigsLoading(true);
    try {
      const data = await workflowConfigService.listByProduct(productId);
      setConfigs(data);
    } finally {
      setConfigsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeProduct?.id) { setConfigs([]); return; }
    loadConfigs(activeProduct.id);
  }, [activeProduct?.id, loadConfigs]);

  const selectedConfig = useMemo(
    () => configs.find((c) => c.id === selectedConfigId) ?? null,
    [configs, selectedConfigId],
  );

  const filteredConfigs = useMemo(() => {
    const q = configSearch.trim().toLowerCase();
    if (!q) return configs;
    return configs.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.configType ?? "").toLowerCase().includes(q) ||
        (c.notes ?? "").toLowerCase().includes(q) ||
        (c.createdBy ?? "").toLowerCase().includes(q),
    );
  }, [configs, configSearch]);

  // ─── Config CRUD ─────────────────────────────────────────────────────────────

  function openNewConfig() {
    setEditingConfig(null);
    setConfigForm({
      ...emptyConfigForm(),
      featureSelections: activeFeatures.map((f) => ({ featureId: f.id, included: false, activeCount: 0 })),
    });
    setConfigError(null);
    setConfigDialogOpen(true);
  }

  function openEditConfig(cfg: WorkflowConfig) {
    setEditingConfig(cfg);
    let featureSels: FeatureSelection[] = [];
    try {
      featureSels = JSON.parse(cfg.featureSelectionsJson) as FeatureSelection[];
    } catch {}
    const selMap = new Map(featureSels.map((s) => [s.featureId, s]));
    setConfigForm({
      name: cfg.name,
      configType: cfg.configType ?? "",
      notes: cfg.notes ?? "",
      featureSelections: activeFeatures.map(
        (f) => selMap.get(f.id) ?? { featureId: f.id, included: false, activeCount: 0 },
      ),
    });
    setConfigError(null);
    setConfigDialogOpen(true);
  }

  function closeConfigDialog() {
    setConfigDialogOpen(false);
    setEditingConfig(null);
    setConfigError(null);
  }

  async function saveConfig() {
    if (!activeProduct) return;
    const name = configForm.name.trim();
    if (!name) { setConfigError("Name is required."); return; }
    setConfigSaving(true);
    try {
      const payload = {
        name,
        productId: activeProduct.id,
        notes: configForm.notes.trim() || undefined,
        configType: configForm.configType.trim() || undefined,
        featureSelectionsJson: JSON.stringify(configForm.featureSelections),
      };
      if (editingConfig) {
        const updated = await workflowConfigService.update(editingConfig.id, payload);
        setConfigs((prev) => prev.map((c) => (c.id === editingConfig.id ? updated : c)));
      } else {
        const created = await workflowConfigService.create(payload);
        setConfigs((prev) => [created, ...prev]);
      }
      closeConfigDialog();
    } catch {
      setConfigError("Failed to save. Please try again.");
    } finally {
      setConfigSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteConfig) return;
    setDeleting(true);
    try {
      await workflowConfigService.remove(deleteConfig.id, deleteConfig.productId);
      setConfigs((prev) => prev.filter((c) => c.id !== deleteConfig.id));
      if (selectedConfigId === deleteConfig.id) setSelectedConfigId(null);
      setDeleteConfig(null);
    } finally {
      setDeleting(false);
    }
  }

  async function handlePublish(cfg: WorkflowConfig) {
    setPublishingId(cfg.id);
    try {
      const updated = await workflowConfigService.publish(cfg.id);
      setConfigs((prev) => prev.map((c) => (c.id === cfg.id ? updated : c)));
    } catch {
      console.warn("[WorkInstructions] publish failed");
    } finally {
      setPublishingId(null);
    }
  }

  async function handleClone(cfg: WorkflowConfig) {
    setCloningId(cfg.id);
    try {
      const cloned = await workflowConfigService.clone(cfg.id);
      setConfigs((prev) => [cloned, ...prev]);
    } catch {
      console.warn("[WorkInstructions] clone failed");
    } finally {
      setCloningId(null);
    }
  }

  function openBuilder(cfg: WorkflowConfig) {
    setSelectedConfigId(cfg.id);
    setViewMode("builder");
  }

  function handleConfigSaved(updated: WorkflowConfig) {
    setConfigs((prev) => {
      const exists = prev.some((c) => c.id === updated.id);
      return exists ? prev.map((c) => (c.id === updated.id ? updated : c)) : [updated, ...prev];
    });
  }

  function handleConfigPublished(updated: WorkflowConfig) {
    setConfigs((prev) => {
      const exists = prev.some((c) => c.id === updated.id);
      return exists ? prev.map((c) => (c.id === updated.id ? updated : c)) : [updated, ...prev];
    });
    setSelectedConfigId(updated.id);
    setViewMode("instructions");
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <Stack spacing={3}>
      {/* Header */}
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems="center" gap={2}>
        <Box>
          <Typography variant="h5" sx={{ fontFamily: "Sora" }}>
            Work Instructions
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Create and manage work instructions by product.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            size="small"
            onChange={(_, next) => {
              if (next) {
                setViewMode(next);
                const productId = products[tab]?.id;
                const params: Record<string, string> = {};
                if (productId) params.product = productId;
                params.view = next;
                setSearchParams(params, { replace: true });
              }
            }}
          >
            <ToggleButton value="instructions">
              <FormatListBulletedOutlined fontSize="small" sx={{ mr: 0.75 }} />
              Instructions
            </ToggleButton>
            {can.editForms && (
              <ToggleButton value="builder">
                <BuildOutlined fontSize="small" sx={{ mr: 0.75 }} />
                Builder
              </ToggleButton>
            )}
          </ToggleButtonGroup>
          {can.editForms && (
            <IconButton
              size="small"
              onMouseEnter={(e) => { setSettingsMenu(e.currentTarget); setSettingsMenuOpen(true); }}
              onClick={(e) => { setSettingsMenu(e.currentTarget); setSettingsMenuOpen(true); }}
            >
              <SettingsOutlined fontSize="small" />
            </IconButton>
          )}
        </Stack>
      </Stack>

      {/* Product tabs */}
      <Paper className="glass-card" sx={{ p: 1.5 }}>
        <Tabs
          value={tab}
          onChange={(_, next) => {
            setTab(next);
            setViewMode("instructions");
            const productId = products[next]?.id ?? "";
            try { sessionStorage.setItem("work_instructions_active_product_id", productId); } catch {}
            const params: Record<string, string> = {};
            if (productId) params.product = productId;
            params.view = "instructions";
            setSearchParams(params, { replace: true });
          }}
          variant="scrollable"
          allowScrollButtonsMobile
          scrollButtons="auto"
        >
          {products.map((product) => (
            <Tab key={product.id} label={product.name} />
          ))}
        </Tabs>
      </Paper>

      {/* ── Instructions table view ── */}
      {viewMode === "instructions" && (
        <Paper className="glass-card" sx={{ p: 2.5 }}>
          {!activeProduct ? (
            <Typography color="text.secondary">
              No products found. Create a product in Admin to generate tabs here.
            </Typography>
          ) : (
            <Stack spacing={2}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <TextField
                  size="small"
                  placeholder="Search work instructions…"
                  value={configSearch}
                  onChange={(e) => setConfigSearch(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchOutlined fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ maxWidth: 360 }}
                />
                {can.editForms && (
                  <Button variant="contained" size="small" onClick={openNewConfig}>
                    + New Work Instruction
                  </Button>
                )}
              </Stack>

              {configsLoading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                  <CircularProgress size={28} />
                </Box>
              ) : filteredConfigs.length === 0 ? (
                <Alert severity="info">
                  {configs.length === 0
                    ? `No work instructions yet for ${activeProduct.name}. Click "+ New Work Instruction" to create one.`
                    : "No work instructions match the search."}
                </Alert>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Configuration Type</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Product</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Created By</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Date Created</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredConfigs.map((cfg) => (
                      <TableRow key={cfg.id} hover>
                        <TableCell>
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                            <Typography variant="body2" fontWeight={500}>{cfg.name}</Typography>
                            <StatusChip status={cfg.status} />
                            <Chip size="small" label={`v${cfg.version}`} variant="outlined" />
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{cfg.configType || "—"}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{activeProduct.name}</Typography>
                        </TableCell>
                        <TableCell sx={{ maxWidth: 220 }}>
                          <Typography variant="body2" color="text.secondary" noWrap>
                            {cfg.notes || "—"}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{cfg.createdBy || "—"}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{formatDate(cfg.createdAt)}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={0.25} justifyContent="flex-end" alignItems="center">
                            {/* New version — Published/Archived */}
                            {can.editForms && (cfg.status === "Published" || cfg.status === "Archived") && (
                              <Tooltip title="Create new version (Draft)">
                                <span>
                                  <IconButton
                                    size="small"
                                    onClick={() => handleClone(cfg)}
                                    disabled={cloningId === cfg.id}
                                  >
                                    {cloningId === cfg.id
                                      ? <CircularProgress size={14} />
                                      : <ContentCopyOutlined fontSize="small" />}
                                  </IconButton>
                                </span>
                              </Tooltip>
                            )}
                            <Tooltip title="Preview workflow">
                              <IconButton size="small" onClick={() => setPreviewConfig(cfg)}>
                                <ArticleOutlined fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            {!can.viewOnly && (
                              <Tooltip title="Export">
                                <IconButton size="small" onClick={(e) => setExportMenu({ el: e.currentTarget, cfg })}>
                                  <DownloadOutlined fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {can.editForms && (
                              <Tooltip title={cfg.status === "Published" ? "View in Builder (read-only)" : "Open Builder"}>
                                <IconButton size="small" color="primary" onClick={() => openBuilder(cfg)}>
                                  <BuildOutlined fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {can.editForms && cfg.status === "Draft" && (
                              <Tooltip title="Edit details">
                                <IconButton size="small" onClick={() => openEditConfig(cfg)}>
                                  <SettingsOutlined fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {can.editForms && (
                              <Tooltip title="Delete">
                                <IconButton size="small" color="error" onClick={() => setDeleteConfig(cfg)}>
                                  <DeleteOutline fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Stack>
          )}
        </Paper>
      )}

      {/* ── Builder view ── */}
      {viewMode === "builder" && activeProduct && (
        <Stack spacing={2}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Button
              size="small"
              startIcon={<ArrowBackOutlined />}
              onClick={() => setViewMode("instructions")}
            >
              Back to Instructions
            </Button>
            {selectedConfig && (
              <>
                <Typography variant="body2" color="text.secondary">
                  / {selectedConfig.name}
                </Typography>
                <StatusChip status={selectedConfig.status} />
                <Chip size="small" label={`v${selectedConfig.version}`} variant="outlined" />
              </>
            )}
          </Stack>
          <WorkflowBuilder
            productId={activeProduct.id}
            productName={activeProduct.name}
            productFeatures={activeFeatures}
            initialConfigId={selectedConfig?.id ?? null}
            configName={selectedConfig?.name}
            onConfigSaved={handleConfigSaved}
            onConfigPublished={handleConfigPublished}
          />
        </Stack>
      )}

      {/* Settings menu */}
      <Menu anchorEl={settingsMenu} open={settingsMenuOpen} onClose={() => setSettingsMenuOpen(false)}>
        <MenuItem onClick={() => setSettingsMenuOpen(false)}>Work Instructions</MenuItem>
      </Menu>

      {/* Export dropdown */}
      <Menu
        open={Boolean(exportMenu)}
        anchorEl={exportMenu?.el}
        onClose={() => setExportMenu(null)}
      >
        <MenuItem
          onClick={() => {
            if (!exportMenu) return;
            downloadJson(exportMenu.cfg, activeProduct?.name ?? "");
            setExportMenu(null);
          }}
        >
          <ListItemIcon><DownloadOutlined fontSize="small" /></ListItemIcon>
          Download JSON
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (!exportMenu) return;
            printPdf(exportMenu.cfg, activeProduct?.name ?? "");
            setExportMenu(null);
          }}
        >
          <ListItemIcon><ArticleOutlined fontSize="small" /></ListItemIcon>
          Export PDF
        </MenuItem>
      </Menu>

      {/* Preview modal */}
      {previewConfig && (
        <PreviewDialog
          open
          cfg={previewConfig}
          productName={activeProduct?.name ?? ""}
          onClose={() => setPreviewConfig(null)}
        />
      )}

      {/* Work instruction create/edit dialog */}
      <Dialog
        open={configDialogOpen}
        onClose={() => !configSaving && closeConfigDialog()}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{editingConfig ? "Edit Work Instruction" : "New Work Instruction"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {!editingConfig && (
              <Alert severity="info" sx={{ fontSize: "0.8rem" }}>
                New work instructions are created as <strong>Draft</strong>. Use the Builder to add steps, then publish when ready.
              </Alert>
            )}
            <TextField
              label="Work Instruction Name"
              value={configForm.name}
              onChange={(e) => setConfigForm((p) => ({ ...p, name: e.target.value }))}
              fullWidth
              required
              autoFocus
              placeholder="e.g. AIM-100 Front Camera Install"
            />
            <TextField
              label="Configuration Type"
              value={configForm.configType}
              onChange={(e) => setConfigForm((p) => ({ ...p, configType: e.target.value }))}
              fullWidth
              placeholder="e.g. Installation, Maintenance, Inspection"
              helperText="Used to identify this instruction type when assigning to an asset"
            />
            <TextField
              label="Description"
              value={configForm.notes}
              onChange={(e) => setConfigForm((p) => ({ ...p, notes: e.target.value }))}
              fullWidth
              multiline
              rows={2}
              placeholder="Optional description or notes"
            />
            {activeFeatures.length > 0 && (
              <Stack spacing={1}>
                <Typography variant="subtitle2">Feature inclusions</Typography>
                <Typography variant="caption" color="text.secondary">
                  Specify which features are active for this configuration and how many are installed.
                </Typography>
                {activeFeatures.map((feat) => {
                  const sel = configForm.featureSelections.find((s) => s.featureId === feat.id);
                  const included = sel?.included ?? false;
                  const count = sel?.activeCount ?? 0;
                  const update = (patch: Partial<FeatureSelection>) =>
                    setConfigForm((p) => ({
                      ...p,
                      featureSelections: p.featureSelections.map((s) =>
                        s.featureId === feat.id ? { ...s, ...patch } : s,
                      ),
                    }));
                  return (
                    <Paper key={feat.id} variant="outlined" sx={{ p: 1.5 }}>
                      <Stack direction="row" alignItems="center" spacing={2}>
                        <FormControlLabel
                          control={
                            <Switch
                              size="small"
                              checked={included}
                              onChange={(e) => update({ included: e.target.checked })}
                            />
                          }
                          label={<Typography variant="body2">{feat.name}</Typography>}
                          sx={{ flexGrow: 1, m: 0 }}
                        />
                        {included && (
                          <TextField
                            label="Qty"
                            type="number"
                            size="small"
                            value={count}
                            onChange={(e) =>
                              update({ activeCount: Math.max(0, parseInt(e.target.value) || 0) })
                            }
                            inputProps={{ min: 0 }}
                            sx={{ width: 80 }}
                          />
                        )}
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            )}
            {configError && (
              <Typography variant="body2" color="error">{configError}</Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeConfigDialog} disabled={configSaving}>Cancel</Button>
          <Button variant="contained" onClick={saveConfig} disabled={configSaving}>
            {configSaving ? "Saving…" : editingConfig ? "Save Changes" : "Create Draft"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={Boolean(deleteConfig)}
        onClose={() => !deleting && setDeleteConfig(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete Work Instruction?</DialogTitle>
        <DialogContent>
          {deleteConfig?.status === "Published" && (
            <Alert severity="warning" sx={{ mb: 1.5 }}>
              This instruction is <strong>Published</strong> and may be assigned to assets. Deleting it will fail if any workflow runs reference it.
            </Alert>
          )}
          <Typography>
            Delete <strong>{deleteConfig?.name}</strong>? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfig(null)} disabled={deleting}>Cancel</Button>
          <Button variant="contained" color="error" onClick={confirmDelete} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default WorkInstructions;
