import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigation, useSearchParams } from "react-router-dom";
import {
  AddOutlined,
  ArticleOutlined,
  ArrowBackOutlined,
  ArchiveOutlined,
  BuildOutlined,
  ContentCopyOutlined,
  DeleteOutline,
  DownloadOutlined,
  FormatListBulletedOutlined,
  PublishOutlined,
  RemoveOutlined,
  SearchOutlined,
  SettingsOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
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
  Select,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { demoProducts } from "../../data/demo";
import type { FeatureSelection } from "../../services/productConfigService";
import { workflowConfigService } from "../../services/workflowConfigService";
import { featureService } from "../../services/featureService";
import { workflowTypeService } from "../../services/workflowTypeService";
import { usePermissions } from "../../hooks/usePermissions";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { fetchProducts } from "../../store/productsSlice";
import type { Feature } from "../../types/feature";
import type { ProductFeatureDefinition } from "../../types/product";
import type { Workflow } from "../../types/workflow";
import type { WorkflowConfig } from "../../types/workflowConfig";
import type { WorkflowType } from "../../types/workflowType";
import { escapeHtml, openPrintWindow } from "../../utils/printWindow";
import WorkflowBuilder from "./WorkflowBuilder";

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

type WorkflowFeatureDefinition = ProductFeatureDefinition & { isInventory?: boolean };

function toWorkflowFeatureDefinition(
  feature: Feature,
  legacy?: ProductFeatureDefinition,
): WorkflowFeatureDefinition {
  return {
    id: feature.id,
    name: feature.name,
    valueType: (feature.valueType || legacy?.valueType || "text") as ProductFeatureDefinition["valueType"],
    options: feature.options ?? legacy?.options,
    // Keep legacy sub-properties only as a compatibility fallback. Builder capture data
    // comes from Feature Dependencies, but older draft behavior still expects this shape.
    subProperties: legacy?.subProperties ?? feature.subProperties?.map((subProperty) => ({
      id: subProperty.id,
      name: subProperty.name,
      valueType: "text" as const,
      isInventory: subProperty.isInventory,
      unit: subProperty.unit,
    })),
    isInventory: feature.isInventory ?? false,
  };
}

function printPdf(cfg: WorkflowConfig, productName: string) {
  const workflow = parseSteps(cfg);
  const steps = workflow?.steps ? [...workflow.steps].sort((a, b) => a.order - b.order) : [];
  const stepsHtml = steps
    .map(
      (step) => `
      <div style="margin-bottom:16px">
        <div style="font-size:14px;font-weight:600;margin-bottom:4px;padding-bottom:3px;border-bottom:1px solid #ddd">${escapeHtml(step.title)}</div>
        ${step.description ? `<p style="margin:0 0 6px;font-size:12px;color:#666">${escapeHtml(step.description)}</p>` : ""}
        ${
          step.inputs.length
            ? `<table style="width:100%;border-collapse:collapse">
                ${step.inputs
                  .map(
                    (inp) =>
                      `<tr>
                        <td style="padding:3px 10px 3px 0;color:#555;font-size:12px;width:40%">${escapeHtml(inp.label)}</td>
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

  const html = `<html><head><title>Work Instruction - ${escapeHtml(cfg.name)}</title>
    <style>body{font-family:Arial,sans-serif;padding:30px;color:#1a1a1a}@media print{body{padding:0}}</style>
    </head><body>
    <h2 style="margin:0 0 4px">Work Instruction: ${escapeHtml(cfg.name)}</h2>
    <p style="margin:0 0 16px;font-size:13px;color:#666">
      Product: ${escapeHtml(productName)}&nbsp;|&nbsp;
      Configuration Type: ${escapeHtml(cfg.configType ?? "-")}&nbsp;|&nbsp;
      Status: ${escapeHtml(cfg.status)}&nbsp;|&nbsp;v${escapeHtml(cfg.version)}
    </p>
    ${cfg.notes ? `<p style="margin:0 0 12px;font-size:12px;color:#555;font-style:italic">${escapeHtml(cfg.notes)}</p>` : ""}
    ${cfg.createdBy ? `<p style="margin:0 0 12px;font-size:12px;color:#888">Created by: ${escapeHtml(cfg.createdBy)} on ${escapeHtml(formatDate(cfg.createdAt))}</p>` : ""}
    <hr style="margin:14px 0">
    ${stepsHtml || "<p>No workflow steps defined.</p>"}
    </body></html>`;

  if (!openPrintWindow(html, true)) {
    console.warn("[WorkInstructions] Print popup was blocked -- allow popups for this site to print.");
  }
}

// â”€â”€â”€ Status chip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function StatusChip({ status }: { status: string }) {
  const color =
    status === "Published" ? "success"
    : status === "Archived" ? "default"
    : "warning";
  return <Chip size="small" label={status} color={color as "success" | "default" | "warning"} />;
}

// â”€â”€â”€ Preview dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface PreviewProps {
  open: boolean;
  cfg: WorkflowConfig;
  productName: string;
  onClose: () => void;
}

function PreviewDialog({ open, cfg, productName, onClose }: PreviewProps) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"));
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
      fullScreen={isPhone}
      maxWidth="xl"
      fullWidth
      PaperProps={{
        sx: {
          height: isPhone ? "100%" : "92vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRadius: isPhone ? 0 : 4,
          background: "linear-gradient(180deg, rgba(8,18,24,0.98), rgba(8,14,19,0.99))",
          border: "1px solid rgba(45,212,191,0.18)",
        },
      }}
    >
      <Box
        sx={{
          px: { xs: 1.5, sm: 3 },
          py: { xs: 1.5, sm: 2.5 },
          flexShrink: 0,
          background: "linear-gradient(135deg, rgba(13,148,136,0.2), rgba(15,23,42,0.25))",
          borderBottom: "1px solid rgba(148,163,184,0.14)",
        }}
      >
        <Stack direction={isPhone ? "column" : "row"} justifyContent="space-between" alignItems={isPhone ? "stretch" : "flex-start"} spacing={1.5}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" fontWeight={700} sx={{ fontFamily: "Sora", color: "#f8fafc" }}>
              {cfg.name}
            </Typography>
            <Stack direction="row" spacing={0} flexWrap="wrap" useFlexGap sx={{ mt: 0.5, gap: "4px 16px" }}>
              <Typography variant="caption" sx={{ color: "rgba(226,232,240,0.82)" }}>Product: {productName}</Typography>
              {cfg.configType && (
                <Typography variant="caption" sx={{ color: "rgba(226,232,240,0.82)" }}>Type: {cfg.configType}</Typography>
              )}
              {cfg.createdBy && (
                <Typography variant="caption" sx={{ color: "rgba(226,232,240,0.82)" }}>By: {cfg.createdBy}</Typography>
              )}
              <Typography variant="caption" sx={{ color: "rgba(226,232,240,0.62)" }}>{formatDate(cfg.createdAt)}</Typography>
            </Stack>
            {cfg.notes && (
              <Typography variant="caption" fontStyle="italic" sx={{ color: "rgba(226,232,240,0.68)", mt: 0.75, display: "block" }}>
                {cfg.notes}
              </Typography>
            )}
          </Box>
          <Stack alignItems={isPhone ? "flex-start" : "flex-end"} spacing={0.75} sx={{ flexShrink: 0 }}>
            <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
              <StatusChip status={cfg.status} />
              <Chip
                size="small"
                label={`v${cfg.version}`}
                variant="outlined"
                sx={{ color: "#e2e8f0", borderColor: "rgba(255,255,255,0.3)" }}
              />
            </Stack>
            {steps.length > 0 && (
              <Typography variant="caption" sx={{ color: "rgba(226,232,240,0.62)" }}>
                {steps.length} step{steps.length === 1 ? "" : "s"}
              </Typography>
            )}
          </Stack>
        </Stack>
      </Box>

      <Box sx={{ display: "flex", flexDirection: isPhone ? "column" : "row", flex: 1, overflow: "hidden" }}>
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
            <Box
              sx={{
                width: isPhone ? "100%" : 220,
                flexShrink: 0,
                borderRight: isPhone ? "none" : "1px solid",
                borderBottom: isPhone ? "1px solid" : "none",
                borderColor: "rgba(148,163,184,0.14)",
                overflowX: isPhone ? "auto" : "hidden",
                overflowY: isPhone ? "hidden" : "auto",
                bgcolor: isPhone ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.03)",
              }}
            >
              <Box sx={{ px: 1.5, pt: 1.25, pb: isPhone ? 0.75 : 1 }}>
                <Typography
                  variant="caption"
                  fontWeight={700}
                  sx={{ color: "rgba(226,232,240,0.62)", textTransform: "uppercase", letterSpacing: 0.6 }}
                >
                  Steps
                </Typography>
              </Box>
              {isPhone ? (
                <Stack direction="row" spacing={1} sx={{ px: 1.5, pb: 1.25, overflowX: "auto" }}>
                  {steps.map((step, idx) => (
                    <Box
                      key={step.id}
                      onClick={() => setActiveStep(idx)}
                      sx={{
                        minWidth: 140,
                        px: 1.25,
                        py: 1,
                        cursor: "pointer",
                        borderRadius: 2.5,
                        border: "1px solid",
                        borderColor: activeStep === idx ? "rgba(45,212,191,0.44)" : "rgba(148,163,184,0.16)",
                        bgcolor: activeStep === idx ? "rgba(45,212,191,0.12)" : "rgba(255,255,255,0.02)",
                      }}
                    >
                      <Typography variant="caption" sx={{ color: activeStep === idx ? "#99f6e4" : "rgba(226,232,240,0.58)", fontWeight: 700 }}>
                        {String(step.order).padStart(2, "0")}
                      </Typography>
                      <Typography variant="body2" fontWeight={600} sx={{ color: "#f8fafc" }} className="line-clamp-2">
                        {step.title || "(Untitled)"}
                      </Typography>
                      {(step.inputs ?? []).length > 0 && (
                        <Typography variant="caption" sx={{ color: "rgba(226,232,240,0.58)" }}>
                          {step.inputs.length} input{step.inputs.length === 1 ? "" : "s"}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Stack>
              ) : (
                <>
                  <Divider />
                  {steps.map((step, idx) => (
                    <Box
                      key={step.id}
                      onClick={() => setActiveStep(idx)}
                      sx={{
                        px: 1.5,
                        py: 1.25,
                        cursor: "pointer",
                        bgcolor: activeStep === idx ? "rgba(45,212,191,0.16)" : "transparent",
                        color: activeStep === idx ? "#f8fafc" : "text.primary",
                        "&:hover": { bgcolor: activeStep === idx ? "rgba(45,212,191,0.22)" : "rgba(255,255,255,0.04)" },
                        borderBottom: "1px solid",
                        borderColor: "rgba(148,163,184,0.14)",
                        transition: "background-color 0.15s",
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{ color: activeStep === idx ? "#99f6e4" : "rgba(226,232,240,0.58)", display: "block", fontWeight: 700, lineHeight: 1.2 }}
                      >
                        {String(step.order).padStart(2, "0")}
                      </Typography>
                      <Typography variant="body2" fontWeight={activeStep === idx ? 600 : 400} noWrap sx={{ color: activeStep === idx ? "#f8fafc" : "#e2e8f0" }}>
                        {step.title || "(Untitled)"}
                      </Typography>
                      {(step.inputs ?? []).length > 0 && (
                        <Typography variant="caption" sx={{ color: "rgba(226,232,240,0.58)" }}>
                          {step.inputs.length} input{step.inputs.length === 1 ? "" : "s"}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </>
              )}
            </Box>

            <Box sx={{ flex: 1, overflowY: "auto", p: { xs: 1.5, sm: 3.5 } }}>
              {currentStep && (
                <Stack spacing={3}>
                  <Box>
                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                      <Box
                        sx={{
                          width: 34,
                          height: 34,
                          borderRadius: "50%",
                          bgcolor: "rgba(45,212,191,0.18)",
                          color: "#99f6e4",
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
                      <Typography variant="h6" fontWeight={600} sx={{ color: "#f8fafc" }}>
                        {currentStep.title || "(Untitled step)"}
                      </Typography>
                    </Stack>
                    {currentStep.description && (
                      <Typography variant="body2" sx={{ color: "rgba(226,232,240,0.72)", pl: { xs: 0, sm: "50px" } }}>
                        {currentStep.description}
                      </Typography>
                    )}
                  </Box>

                  <Divider sx={{ borderColor: "rgba(148,163,184,0.14)" }} />

                  {(currentStep.inputs ?? []).length === 0 ? (
                    <Typography variant="body2" sx={{ color: "rgba(226,232,240,0.46)" }} fontStyle="italic">
                      No input fields for this step.
                    </Typography>
                  ) : (
                    <Stack spacing={0}>
                      <Typography
                        variant="caption"
                        fontWeight={700}
                        sx={{ color: "rgba(153,246,228,0.84)", textTransform: "uppercase", letterSpacing: 0.6, mb: 1.5, display: "block" }}
                      >
                        Input Fields
                      </Typography>
                      {currentStep.inputs.map((inp, i) => (
                        <Box
                          key={inp.id}
                          sx={{
                            display: "grid",
                            gridTemplateColumns: { xs: "1fr", sm: "230px 1fr" },
                            gap: 2,
                            alignItems: "center",
                            py: 1.5,
                            px: 1.5,
                            bgcolor: i % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent",
                            borderRadius: 2,
                          }}
                        >
                          <Box>
                            <Typography variant="body2" fontWeight={500} sx={{ color: "#f8fafc" }}>
                              {inp.label}
                              {inp.required && (
                                <Typography component="span" variant="caption" color="error.main" sx={{ ml: 0.5 }}>
                                  *
                                </Typography>
                              )}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{ color: "rgba(226,232,240,0.54)", textTransform: "uppercase", letterSpacing: 0.4 }}
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
                              borderColor: "rgba(148,163,184,0.36)",
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
                        fontWeight={700}
                        sx={{ color: "rgba(153,246,228,0.84)", textTransform: "uppercase", letterSpacing: 0.6, display: "block", mb: 1 }}
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

                  <Stack direction="row" spacing={1} alignItems="center" pt={1} flexWrap="wrap" useFlexGap>
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
                    <Typography variant="caption" sx={{ ml: 1, color: "rgba(226,232,240,0.62)" }}>
                      Step {activeStep + 1} of {steps.length}
                    </Typography>
                  </Stack>
                </Stack>
              )}
            </Box>
          </>
        )}
      </Box>

      <Divider sx={{ borderColor: "rgba(148,163,184,0.14)" }} />
      <DialogActions sx={{ px: { xs: 1.5, sm: 3 }, py: 1.5 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// â”€â”€â”€ Config form state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface ConfigFormState {
  name: string;
  configType: string;
  workflowTypeId: string;
  notes: string;
  featureSelections: FeatureSelection[];
}

type WorkInstructionSortKey = "name" | "configType" | "createdBy" | "dateCreated" | "status";

const emptyConfigForm = (): ConfigFormState => ({
  name: "",
  configType: "",
  workflowTypeId: "",
  notes: "",
  featureSelections: [],
});

// â”€â”€â”€ WorkInstructions component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const WorkInstructions = () => {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"));
  const can = usePermissions();
  const dispatch = useAppDispatch();
  const productsState = useAppSelector((state) => state.products);
  const location = useLocation();
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isActiveRoute = location.pathname.startsWith("/work-instructions");
  const urlBackfillDoneRef = useRef(false);

  const safeSetSearchParams = useCallback((params: Record<string, string>) => {
    if (!isActiveRoute || navigation.state !== "idle") return;
    setSearchParams(params, { replace: true });
  }, [isActiveRoute, navigation.state, setSearchParams]);

  const [tab, setTab] = useState(0);
  const [viewMode, setViewMode] = useState<"instructions" | "builder">("instructions");

  const [configs, setConfigs] = useState<WorkflowConfig[]>([]);
  const [workflowTypes, setWorkflowTypes] = useState<WorkflowType[]>([]);
  const [configSearch, setConfigSearch] = useState("");
  const [sortBy, setSortBy] = useState<WorkInstructionSortKey>("dateCreated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

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
  // Archive. The backend has always supported POST /workflow-configs/{id}/archive, and
  // workflowConfigService.archive() existed — but nothing ever called it, so the app told
  // users to "archive it instead of deleting" while offering no way to do so.
  // Archived configs are hidden from the list by default (they stay retrievable via the
  // toggle) and are already excluded from asset assignment, which only offers Published.
  const [archiveConfig, setArchiveConfig] = useState<WorkflowConfig | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);

  const [settingsMenu, setSettingsMenu] = useState<HTMLElement | null>(null);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);

  useEffect(() => {
    dispatch(fetchProducts());
    workflowTypeService.list().then(setWorkflowTypes).catch(() => {});
  }, [dispatch]);

  const products = useMemo(
    () => (productsState.items.length ? productsState.items : demoProducts),
    [productsState.items],
  );
  const productIdsKey = useMemo(() => products.map((p) => p.id).join("|"), [products]);

  useEffect(() => {
    if (tab >= products.length) setTab(Math.max(0, products.length - 1));
  }, [tab, products.length]);

  // Restore active product tab + view mode from URL (priority) or sessionStorage (fallback).
  // Read-only — do not rewrite the URL here; that races with sidebar navigation away from
  // this page when the products list refreshes (e.g. Projects page mount fetching products).
  useEffect(() => {
    if (!isActiveRoute || products.length === 0) return;

    const productIdFromUrl = searchParams.get("product");
    const viewFromUrl = searchParams.get("view");
    const configIdFromUrl = searchParams.get("config");

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
    if (configIdFromUrl) setSelectedConfigId(configIdFromUrl);
  }, [isActiveRoute, products.length, productIdsKey, searchParams]);

  // One-time URL backfill so Favorites capture product/view — only when params are missing.
  useEffect(() => {
    if (!isActiveRoute || products.length === 0 || urlBackfillDoneRef.current) return;
    if (navigation.state !== "idle") return;
    if (searchParams.has("product") && searchParams.has("view")) {
      urlBackfillDoneRef.current = true;
      return;
    }

    urlBackfillDoneRef.current = true;
    const productIdFromUrl = searchParams.get("product");
    const viewFromUrl = searchParams.get("view");
    const configIdFromUrl = searchParams.get("config");

    let resolvedTabIdx = 0;
    if (productIdFromUrl) {
      const idx = products.findIndex((p) => p.id === productIdFromUrl);
      if (idx >= 0) resolvedTabIdx = idx;
    }

    const resolvedView: "instructions" | "builder" =
      viewFromUrl === "builder" ? "builder" : "instructions";

    const productId = products[resolvedTabIdx]?.id;
    const params: Record<string, string> = {};
    if (productId) params.product = productId;
    params.view = resolvedView;
    if (configIdFromUrl) params.config = configIdFromUrl;
    safeSetSearchParams(params);
  }, [isActiveRoute, products.length, productIdsKey, searchParams, safeSetSearchParams, navigation.state]);

  const activeProduct = products[tab];
  const [workflowFeatures, setWorkflowFeatures] = useState<WorkflowFeatureDefinition[]>([]);

  useEffect(() => {
    const productId = activeProduct?.id;
    if (!productId) {
      setWorkflowFeatures([]);
      return;
    }

    let cancelled = false;
    const legacyById = new Map((activeProduct?.features ?? []).map((feature) => [feature.id, feature]));

    featureService.getByProduct(productId).then((libFeatures) => {
      if (cancelled) return;
      setWorkflowFeatures(libFeatures.map((feature) => toWorkflowFeatureDefinition(feature, legacyById.get(feature.id))));
    }).catch(() => {
      if (cancelled) return;
      setWorkflowFeatures(
        (activeProduct?.features ?? []).map((feature) => ({
          ...feature,
          isInventory: (feature as { isInventory?: boolean }).isInventory ?? false,
        })),
      );
    });

    return () => { cancelled = true; };
  }, [activeProduct]);

  // Builder feature selection is sourced from the Features library. Only inventory
  // features are installable units; non-inventory items flow through dependencies/BOM.
  const inventoryFeatures = useMemo(
    () => workflowFeatures.filter((feature) => feature.isInventory),
    [workflowFeatures],
  );

  useEffect(() => {
    setSelectedConfigId(null);
  }, [activeProduct?.id]);

  // workflowConfigService.listByProduct is local-first, so when the cache exists
  // the data is available essentially instantly. Showing a spinner here caused a
  // brief but unnecessary flash of empty state on every product tab switch. We
  // let the empty-state UI ("No work instructions yet…") stand in for the rare
  // first-ever-load case instead of blocking the render with a misleading
  // loading indicator.
  const loadConfigs = useCallback(async (productId: string) => {
    const data = await workflowConfigService.listByProduct(productId);
    setConfigs(data);
  }, []);

  useEffect(() => {
    if (!activeProduct?.id) { setConfigs([]); return; }
    loadConfigs(activeProduct.id);
  }, [activeProduct?.id, loadConfigs]);

  useEffect(() => {
    const configIdFromUrl = searchParams.get("config");
    if (!configIdFromUrl) return;
    if (!configs.some((cfg) => cfg.id === configIdFromUrl)) return;
    setSelectedConfigId((current) => (current === configIdFromUrl ? current : configIdFromUrl));
    setViewMode("builder");
  }, [configs, searchParams]);

  const selectedConfig = useMemo(
    () => configs.find((c) => c.id === selectedConfigId) ?? null,
    [configs, selectedConfigId],
  );

  // Roles with viewScope="own" see only Published configs (Option B).
  const canViewAllWI = (can.workInstructionsBuilder?.viewScope ?? "own") === "all";

  // Drives the "Show archived (N)" toggle — only worth showing if any exist.
  const archivedCount = useMemo(
    () => configs.filter((c) => c.status === "Archived").length,
    [configs],
  );
  const publishedCount = useMemo(
    () => configs.filter((c) => c.status === "Published").length,
    [configs],
  );
  const draftCount = useMemo(
    () => configs.filter((c) => c.status === "Draft").length,
    [configs],
  );

  const filteredConfigs = useMemo(() => {
    const q = configSearch.trim().toLowerCase();
    const scopeFiltered = canViewAllWI ? configs : configs.filter((c) => c.status === "Published");
    // Archived configs are hidden by default — "archive" should get a workflow out of the
    // working list without destroying it. They remain reachable via the "Show archived"
    // toggle. (Users restricted to Published already never see them.)
    const archiveFiltered = showArchived
      ? scopeFiltered
      : scopeFiltered.filter((c) => c.status !== "Archived");
    const filtered = !q ? archiveFiltered : archiveFiltered.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.configType ?? "").toLowerCase().includes(q) ||
        (c.notes ?? "").toLowerCase().includes(q) ||
        (c.createdBy ?? "").toLowerCase().includes(q),
    );

    const getSortValue = (config: WorkflowConfig) => {
      switch (sortBy) {
        case "name": return (config.name ?? "").toLowerCase();
        case "configType": return (config.configType ?? "").toLowerCase();
        case "createdBy": return (config.createdBy ?? "").toLowerCase();
        case "status": return (config.status ?? "").toLowerCase();
        case "dateCreated":
        default:
          return Date.parse(config.createdAt) || 0;
      }
    };

    const multiplier = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const aVal = getSortValue(a);
      const bVal = getSortValue(b);
      if (aVal < bVal) return -1 * multiplier;
      if (aVal > bVal) return 1 * multiplier;
      return 0;
    });
  }, [canViewAllWI, configs, configSearch, sortBy, sortDir, showArchived]);

  // â”€â”€â”€ Config CRUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function openNewConfig() {
    setEditingConfig(null);
    setConfigForm({
      ...emptyConfigForm(),
      featureSelections: inventoryFeatures.map((f) => ({ featureId: f.id, included: false, activeCount: 0 })),
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
      workflowTypeId:
        cfg.workflowTypeId ??
        workflowTypes.find((type) => type.name === cfg.configType)?.id ??
        "",
      notes: cfg.notes ?? "",
      featureSelections: inventoryFeatures.map(
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
      const selectedWorkflowType = workflowTypes.find((type) => type.id === configForm.workflowTypeId);
      const payload = {
        name,
        productId: activeProduct.id,
        notes: configForm.notes.trim() || undefined,
        configType: (selectedWorkflowType?.name ?? configForm.configType.trim()) || undefined,
        workflowTypeId: configForm.workflowTypeId || undefined,
        featureSelectionsJson: JSON.stringify(configForm.featureSelections),
      };
      if (editingConfig) {
        const updated = await workflowConfigService.update(editingConfig.id, payload);
        setConfigs((prev) => prev.map((c) => (c.id === editingConfig.id ? updated : c)));
      } else {
        const created = await workflowConfigService.create(payload);
        setConfigs((prev) => [created, ...prev]);
        closeConfigDialog();
        openBuilder(created);
        return;
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
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      alert(msg ?? "Delete failed. If this workflow has existing runs, archive it instead of deleting.");
    } finally {
      setDeleting(false);
    }
  }

  async function confirmArchive() {
    if (!archiveConfig) return;
    setArchiving(true);
    try {
      const updated = await workflowConfigService.archive(archiveConfig.id);
      // Update in place rather than removing: the config still exists, it's just Archived.
      // The list filter hides it unless "Show archived" is on.
      setConfigs((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      if (selectedConfigId === archiveConfig.id) setSelectedConfigId(null);
      setArchiveConfig(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      alert(msg ?? "Archive failed. Please try again.");
    } finally {
      setArchiving(false);
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
    const params: Record<string, string> = { view: "builder", config: cfg.id };
    if (activeProduct?.id) params.product = activeProduct.id;
    safeSetSearchParams(params);
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
    const params: Record<string, string> = { view: "instructions" };
    if (activeProduct?.id) params.product = activeProduct.id;
    safeSetSearchParams(params);
  }

  // ─── Render ───

  return (
    <Stack spacing={3}>
      <Box className="glass-card" sx={{ p: { xs: 1.5, sm: 2 }, background: "linear-gradient(135deg, rgba(8,18,24,0.98), rgba(12,28,36,0.94))" }}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems="center" gap={2}>
        <Box>
          <Typography variant="h5" sx={{ fontFamily: "Sora" }}>
            Workflows
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Create and manage workflows by product.
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
                safeSetSearchParams(params);
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
      <Box
        sx={{
          mt: 1.75,
          display: "grid",
          gridTemplateColumns: { xs: "repeat(3, minmax(0, 1fr))", sm: "repeat(3, minmax(0, 1fr))" },
          gap: 1,
        }}
      >
        <Box sx={{ borderRadius: 2.5, p: 1.25, bgcolor: "rgba(45,212,191,0.08)", border: "1px solid rgba(45,212,191,0.18)" }}>
          <Typography variant="caption" sx={{ color: "rgba(153,246,228,0.84)", textTransform: "uppercase", letterSpacing: 0.8 }}>
            Published
          </Typography>
          <Typography variant="h6" sx={{ mt: 0.25 }}>{publishedCount}</Typography>
        </Box>
        <Box sx={{ borderRadius: 2.5, p: 1.25, bgcolor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)" }}>
          <Typography variant="caption" sx={{ color: "rgba(253,224,71,0.88)", textTransform: "uppercase", letterSpacing: 0.8 }}>
            Drafts
          </Typography>
          <Typography variant="h6" sx={{ mt: 0.25 }}>{draftCount}</Typography>
        </Box>
        <Box sx={{ borderRadius: 2.5, p: 1.25, bgcolor: "rgba(148,163,184,0.08)", border: "1px solid rgba(148,163,184,0.18)" }}>
          <Typography variant="caption" sx={{ color: "rgba(226,232,240,0.82)", textTransform: "uppercase", letterSpacing: 0.8 }}>
            Archived
          </Typography>
          <Typography variant="h6" sx={{ mt: 0.25 }}>{archivedCount}</Typography>
        </Box>
      </Box>
      </Box>

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
            safeSetSearchParams(params);
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

      {/* â”€â”€ Instructions table view â”€â”€ */}
      {viewMode === "instructions" && (
        <Paper className="glass-card" sx={{ p: 2.5 }}>
          {!activeProduct ? (
            <Typography color="text.secondary">
              No products found. Create a product in Admin to generate tabs here.
            </Typography>
          ) : (
            <Stack spacing={2}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Stack direction={{ xs: "column", md: "row" }} spacing={1} alignItems={{ md: "center" }} sx={{ width: "100%" }}>
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
                    sx={{ maxWidth: 360, width: "100%" }}
                  />
                  <FormControl size="small" sx={{ minWidth: 170 }}>
                    <InputLabel shrink>Sort By</InputLabel>
                    <Select label="Sort By" value={sortBy} onChange={(e) => setSortBy(e.target.value as WorkInstructionSortKey)}>
                      <MenuItem value="dateCreated">Date Created</MenuItem>
                      <MenuItem value="name">Name</MenuItem>
                      <MenuItem value="configType">Configuration Type</MenuItem>
                      <MenuItem value="createdBy">Created By</MenuItem>
                      <MenuItem value="status">Status</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControl size="small" sx={{ minWidth: 150 }}>
                    <InputLabel shrink>Order</InputLabel>
                    <Select label="Order" value={sortDir} onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}>
                      <MenuItem value="asc">Ascending</MenuItem>
                      <MenuItem value="desc">Descending</MenuItem>
                    </Select>
                  </FormControl>
                  {/* Archived configs are hidden by default; this reveals them. Only shown
                      to users who can actually see non-Published configs. */}
                  {canViewAllWI && archivedCount > 0 && (
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={showArchived}
                          onChange={(e) => setShowArchived(e.target.checked)}
                        />
                      }
                      label={<Typography variant="body2">Show archived ({archivedCount})</Typography>}
                      sx={{ whiteSpace: "nowrap" }}
                    />
                  )}
                </Stack>
                {can.editForms && (
                  <Button variant="contained" size="small" onClick={openNewConfig}>
                    + New Work Instruction
                  </Button>
                )}
              </Stack>

              {filteredConfigs.length === 0 ? (
                <Alert severity="info">
                  {configs.length === 0
                    ? `No work instructions yet for ${activeProduct.name}. Click "+ New Work Instruction" to create one.`
                    : "No work instructions match the search."}
                </Alert>
              ) : isPhone ? (
                <Stack spacing={1.25}>
                  {filteredConfigs.map((cfg) => (
                    <Box
                      key={cfg.id}
                      sx={{
                        p: 1.5,
                        borderRadius: 3,
                        border: "1px solid rgba(148,163,184,0.12)",
                        background: "linear-gradient(180deg, rgba(10,18,24,0.94), rgba(8,14,19,0.98))",
                      }}
                    >
                      <Stack spacing={1.1}>
                        <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography variant="body1" fontWeight={700} className="line-clamp-2">
                              {cfg.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" className="line-clamp-2">
                              {cfg.notes || cfg.configType || "No description"}
                            </Typography>
                          </Box>
                          <Stack alignItems="flex-end" spacing={0.5}>
                            <StatusChip status={cfg.status} />
                            <Chip size="small" label={`v${cfg.version}`} variant="outlined" />
                          </Stack>
                        </Stack>

                        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 0.75 }}>
                          <Box sx={{ borderRadius: 2, p: 1, bgcolor: "rgba(255,255,255,0.03)" }}>
                            <Typography variant="caption" color="text.secondary">Type</Typography>
                            <Typography variant="body2" fontWeight={600} className="line-clamp-1">
                              {cfg.configType || "—"}
                            </Typography>
                          </Box>
                          <Box sx={{ borderRadius: 2, p: 1, bgcolor: "rgba(255,255,255,0.03)" }}>
                            <Typography variant="caption" color="text.secondary">By</Typography>
                            <Typography variant="body2" fontWeight={600} className="line-clamp-1">
                              {cfg.createdBy || "—"}
                            </Typography>
                          </Box>
                          <Box sx={{ borderRadius: 2, p: 1, bgcolor: "rgba(255,255,255,0.03)" }}>
                            <Typography variant="caption" color="text.secondary">Date</Typography>
                            <Typography variant="body2" fontWeight={600}>
                              {formatDate(cfg.createdAt)}
                            </Typography>
                          </Box>
                        </Box>

                        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                          <Button size="small" variant="contained" onClick={() => setPreviewConfig(cfg)}>
                            Preview
                          </Button>
                          {!can.viewOnly && (
                            <Button size="small" variant="outlined" onClick={(e) => setExportMenu({ el: e.currentTarget, cfg })}>
                              Export
                            </Button>
                          )}
                          {can.editForms && (
                            <Button size="small" variant="outlined" onClick={() => openBuilder(cfg)}>
                              Builder
                            </Button>
                          )}
                          {can.editForms && cfg.status === "Draft" && (
                            <Button size="small" variant="outlined" onClick={() => openEditConfig(cfg)}>
                              Details
                            </Button>
                          )}
                          {can.editForms && cfg.status !== "Archived" && (
                            <Button size="small" variant="outlined" onClick={() => setArchiveConfig(cfg)}>
                              Archive
                            </Button>
                          )}
                        </Stack>
                      </Stack>
                    </Box>
                  ))}
                </Stack>
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
                            {/* Archive — the alternative the delete error tells users to use.
                                Hidden for configs that are already Archived. A config with
                                runs cannot be deleted (the server refuses, to avoid
                                orphaning run history), so this is the correct way to retire
                                a workflow: it stays in the database and out of the working
                                list, and the assign dialog only offers Published configs so
                                it can no longer be assigned to new assets. */}
                            {can.editForms && cfg.status !== "Archived" && (
                              <Tooltip title="Archive (retire this workflow)">
                                <IconButton size="small" onClick={() => setArchiveConfig(cfg)}>
                                  <ArchiveOutlined fontSize="small" />
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

      {/* â”€â”€ Builder view â”€â”€ */}
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
            productFeatures={inventoryFeatures}
            initialConfigId={selectedConfig?.id ?? null}
            configName={selectedConfig?.name}
            onConfigSaved={handleConfigSaved}
            onConfigPublished={handleConfigPublished}
            onNewConfig={openNewConfig}
          />
        </Stack>
      )}

      {/* Settings menu */}
      <Menu anchorEl={settingsMenu} open={settingsMenuOpen} onClose={() => setSettingsMenuOpen(false)}>
        <MenuItem onClick={() => setSettingsMenuOpen(false)}>Workflows</MenuItem>
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
              InputLabelProps={{ shrink: true }}
            />
            <FormControl fullWidth>
              <InputLabel shrink>Workflow Type</InputLabel>
              <Select
                label="Workflow Type"
                value={configForm.workflowTypeId}
                onChange={(e) => {
                  const workflowTypeId = e.target.value;
                  const selected = workflowTypes.find((type) => type.id === workflowTypeId);
                  setConfigForm((p) => ({
                    ...p,
                    workflowTypeId,
                    configType: selected?.name ?? p.configType,
                  }));
                }}
              >
                <MenuItem value="">Unspecified</MenuItem>
                {workflowTypes.map((type) => (
                  <MenuItem key={type.id} value={type.id}>{type.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Description"
              value={configForm.notes}
              onChange={(e) => setConfigForm((p) => ({ ...p, notes: e.target.value }))}
              fullWidth
              multiline
              rows={2}
              placeholder="Optional description or notes"
              InputLabelProps={{ shrink: true }}
            />
            {inventoryFeatures.length > 0 && (
              <Stack spacing={1}>
                <Typography variant="subtitle2">Installed Features</Typography>
                <Typography variant="caption" color="text.secondary">
                  Set how many of each feature are installed. 0 = not included.
                </Typography>
                {inventoryFeatures.map((feat) => {
                  const sel = configForm.featureSelections.find((s) => s.featureId === feat.id);
                  const count = sel?.activeCount ?? 0;
                  const setCount = (n: number) =>
                    setConfigForm((p) => ({
                      ...p,
                      featureSelections: p.featureSelections.map((s) =>
                        s.featureId === feat.id ? { ...s, activeCount: Math.max(0, n), included: n > 0 } : s,
                      ),
                    }));
                  return (
                    <Stack key={feat.id} direction="row" alignItems="center" spacing={1}>
                      <Typography variant="body2" sx={{ flex: 1 }}>{feat.name}</Typography>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <IconButton size="small" onClick={() => setCount(count - 1)} disabled={count === 0}>
                          <RemoveOutlined fontSize="small" />
                        </IconButton>
                        <Typography variant="body2" sx={{ minWidth: 24, textAlign: "center", color: count > 0 ? "primary.main" : "text.disabled", fontWeight: 600 }}>
                          {count}
                        </Typography>
                        <IconButton size="small" onClick={() => setCount(count + 1)}>
                          <AddOutlined fontSize="small" />
                        </IconButton>
                      </Stack>
                    </Stack>
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
              This instruction is <strong>Published</strong> and may be assigned to assets. Deleting it will fail if any workflow runs reference it — use <strong>Archive</strong> instead to retire it without losing run history.
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

      <Dialog
        open={Boolean(archiveConfig)}
        onClose={() => !archiving && setArchiveConfig(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Archive Work Instruction?</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 1.5 }}>
            Archiving keeps the workflow and all its run history, but retires it: it can no longer be assigned to new assets, and it's hidden from this list unless you tick <strong>Show archived</strong>. Existing runs are unaffected.
          </Alert>
          <Typography>
            Archive <strong>{archiveConfig?.name}</strong>?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setArchiveConfig(null)} disabled={archiving}>Cancel</Button>
          <Button variant="contained" onClick={confirmArchive} disabled={archiving}>
            {archiving ? "Archiving…" : "Archive"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default WorkInstructions;
