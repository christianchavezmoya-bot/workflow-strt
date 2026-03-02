import React, { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  AccountTreeOutlined,
  AddOutlined,
  AttachFileOutlined,
  CheckCircleOutlined,
  ContentCopyOutlined,
  DeleteOutline,
  DescriptionOutlined,
  DragIndicatorOutlined,
  DownloadOutlined,
  EditOutlined,
  ImageOutlined,
  PlayArrowOutlined,
  PublishOutlined,
  QrCodeScannerOutlined,
  RestartAltOutlined,
  SwapHorizOutlined,
  UploadOutlined,
  VideocamOutlined,
  WarningOutlined,
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
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import type { Decision, MediaItem, StepInput, StepInputType, Workflow, WorkflowStep } from "../../types/workflow";
import type { ProductFeatureDefinition } from "../../types/product";
import type { FeatureSelection } from "../../services/productConfigService";
import { workflowConfigService } from "../../services/workflowConfigService";
import type { WorkflowConfig } from "../../types/workflowConfig";
import WorkOrderRunner from "./WorkOrderRunner";

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;

function deepCopy<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

const IMAGE_MAX_DIM = 1920;
const IMAGE_JPEG_QUALITY = 0.85;
const VIDEO_MAX_BYTES = 100 * 1024 * 1024; // 100 MB

function resizeImage(file: File, maxDim: number, quality: number): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }) : file),
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objUrl); resolve(file); };
    img.src = objUrl;
  });
}

function normalizeOrders(steps: WorkflowStep[]): WorkflowStep[] {
  const sorted = [...steps].sort((a, b) => a.order - b.order);
  return sorted.map((s, idx) => ({ ...s, order: idx + 1 }));
}

function enforceSequentialNextSteps(steps: WorkflowStep[]): WorkflowStep[] {
  const sorted = [...steps].sort((a, b) => a.order - b.order);
  for (let i = 0; i < sorted.length; i++) {
    const next = sorted[i + 1] || null;
    sorted[i].nextStepId = next ? next.id : null;
  }
  return sorted;
}

function stepLabel(step: WorkflowStep): string {
  return `${String(step.order).padStart(2, "0")} · ${step.title || "(Untitled step)"}`;
}

function computeReachability(workflow: Workflow): Set<string> {
  const steps = [...workflow.steps].sort((a, b) => a.order - b.order);
  const start = steps[0]?.id;
  const graph = new Map<string, string[]>();
  for (const s of steps) {
    const edges: string[] = [];
    if (s.nextStepId) edges.push(s.nextStepId);
    if (s.decisionsEnabled) {
      for (const d of s.decisions) if (d.targetStepId) edges.push(d.targetStepId);
    }
    graph.set(s.id, edges);
  }
  const seen = new Set<string>();
  const q = start ? [start] : [];
  while (q.length) {
    const cur = q.shift();
    if (!cur || seen.has(cur)) continue;
    seen.add(cur);
    for (const nxt of graph.get(cur) || []) if (nxt && !seen.has(nxt)) q.push(nxt);
  }
  return seen;
}

function createDefaultWorkflow(productId: string, productName: string): Workflow {
  return {
    id: uid(),
    name: `${productName} Workflow`,
    productId,
    createdAt: Date.now(),
    steps: [
      {
        id: uid(),
        order: 1,
        title: "Step 1",
        description: "",
        overrideInReport: false,
        overrideReportText: "",
        includeDescriptionInReport: true,
        mediaIds: [],
        decisionsEnabled: false,
        decisions: [],
        inputs: [],
        nextStepId: null,
      },
    ],
    media: [],
  };
}

function defaultLabelForInput(type: StepInputType): string {
  switch (type) {
    case "text": return "Text response";
    case "number": return "Numeric value";
    case "choice": return "Select one";
    case "checkbox": return "Confirm";
    case "photo": return "Upload photo";
    case "video": return "Upload video";
    case "signature": return "Signature";
    case "note": return "Note";
    default: return "Input";
  }
}

// ------------------------------------------------------------------
// TabPanel
// ------------------------------------------------------------------

function TabPanel({ value, index, children }: { value: number; index: number; children: ReactNode }) {
  return value === index ? <Box sx={{ pt: 2 }}>{children}</Box> : null;
}

// ------------------------------------------------------------------
// WorkflowBuilder — main component
// ------------------------------------------------------------------

interface PublishForm {
  name: string;
  configType: string;
  notes: string;
  featureSelections: FeatureSelection[];
}

interface WorkflowBuilderProps {
  productId: string;
  productName: string;
  productFeatures?: ProductFeatureDefinition[];
  /** The WorkflowConfig id to load and save steps into. */
  initialConfigId?: string | null;
  /** Label shown in the toolbar to identify the active configuration. */
  configName?: string;
  /** Called after steps are auto-saved to the config. */
  onConfigSaved?: (config: WorkflowConfig) => void;
  /** Called when user publishes the config from the builder. Navigates back to list. */
  onConfigPublished?: (config: WorkflowConfig) => void;
}

const WorkflowBuilder = ({ productId, productName, productFeatures = [], initialConfigId, configName, onConfigSaved, onConfigPublished }: WorkflowBuilderProps) => {
  const [workflow, setWorkflow] = useState<Workflow>(() => createDefaultWorkflow(productId, productName));
  const [runnerOpen, setRunnerOpen] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<WorkflowConfig | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justLoadedRef = useRef(true); // prevents save from firing on load-triggered state changes
  const importedRef = useRef(false);  // blocks async API load from overwriting a user import

  const [publishSaving, setPublishSaving] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishForm, setPublishForm] = useState<PublishForm>({ name: "", configType: "", notes: "", featureSelections: [] });
  const [pendingImport, setPendingImport] = useState<{ raw: Workflow; normalized: Workflow } | null>(null);
  // Tracks the active config ID — may be set by auto-save when initialConfigId is null
  const [resolvedConfigId, setResolvedConfigId] = useState<string | null>(initialConfigId ?? null);
  const resolvedConfigIdRef = useRef<string | null>(initialConfigId ?? null);

  // Keep resolvedConfigId in sync when the prop changes (e.g. parent selects a different config)
  useEffect(() => {
    setResolvedConfigId(initialConfigId ?? null);
    resolvedConfigIdRef.current = initialConfigId ?? null;
  }, [initialConfigId]);

  // Load workflow from WorkflowConfig
  useEffect(() => {
    justLoadedRef.current = true;
    importedRef.current = false;  // reset import guard on config change
    setCurrentConfig(null);
    setSaveStatus("idle");

    if (!initialConfigId) {
      setWorkflow(createDefaultWorkflow(productId, productName));
      return;
    }

    // Fast restore from localStorage while API loads
    const lsKey = `wf_builder_v3_${initialConfigId}`;
    const lsFallback = (() => {
      try {
        const raw = localStorage.getItem(lsKey);
        if (raw) return JSON.parse(raw) as Workflow;
      } catch {}
      return createDefaultWorkflow(productId, productName);
    })();
    setWorkflow(lsFallback);

    // Authoritative load from API — skip if user already imported a file
    workflowConfigService.getById(initialConfigId)
      .then((cfg) => {
        if (!cfg) return;
        setCurrentConfig(cfg);
        if (importedRef.current) return; // user imported after page load — don't overwrite
        try {
          const parsed = JSON.parse(cfg.stepsJson);
          let wf: Workflow;
          if (parsed && Array.isArray(parsed.steps)) {
            wf = parsed as Workflow;
          } else if (Array.isArray(parsed) && parsed.length > 0) {
            wf = { id: cfg.id, name: cfg.name, productId: cfg.productId, createdAt: Date.now(), steps: parsed, media: [] };
          } else {
            wf = createDefaultWorkflow(productId, productName);
            wf.name = cfg.name;
          }
          // Merge media from mediaJson
          try {
            const media = JSON.parse(cfg.mediaJson);
            if (Array.isArray(media)) wf.media = media;
          } catch {}
          justLoadedRef.current = true;
          setWorkflow(wf);
        } catch {
          // keep LS fallback
        }
      })
      .catch(() => { /* keep LS fallback */ });
  }, [productId, initialConfigId]); // eslint-disable-line react-hooks/exhaustive-deps

  const stepsSorted = useMemo(
    () => [...workflow.steps].sort((a, b) => a.order - b.order),
    [workflow.steps]
  );

  const [selectedStepId, setSelectedStepId] = useState<string | null>(() => stepsSorted[0]?.id || null);

  // Keep selection valid when steps change
  useEffect(() => {
    if (selectedStepId && workflow.steps.some((s) => s.id === selectedStepId)) return;
    setSelectedStepId(stepsSorted[0]?.id || null);
  }, [workflow.steps]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced save to WorkflowConfig (800 ms after last change)
  useEffect(() => {
    if (justLoadedRef.current) {
      justLoadedRef.current = false;
      return;
    }
    const activeConfigId = resolvedConfigIdRef.current ?? initialConfigId;
    if (!activeConfigId) return; // no config to save to
    if (currentConfig?.status === "Published" || currentConfig?.status === "Archived") return; // read-only
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus("idle");
    // persist draft to LS immediately
    try { localStorage.setItem(`wf_builder_v3_${activeConfigId}`, JSON.stringify(workflow)); } catch {}
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const updated = await workflowConfigService.update(activeConfigId, {
          stepsJson: JSON.stringify(workflow),
        });
        setCurrentConfig(updated);
        onConfigSaved?.(updated);
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    }, 800);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [workflow]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedStep = useMemo(
    () => workflow.steps.find((s) => s.id === selectedStepId) || null,
    [workflow.steps, selectedStepId]
  );

  const reachable = useMemo(() => computeReachability(workflow), [workflow]);

  // ------------------------------------------------------------------
  // Workflow mutators
  // ------------------------------------------------------------------

  function updateWorkflow(patchFn: (wf: Workflow) => Workflow) {
    setWorkflow((prev) => {
      const next = patchFn(deepCopy(prev));
      next.steps = enforceSequentialNextSteps(normalizeOrders(next.steps));
      return next;
    });
  }

  function addStep() {
    updateWorkflow((wf) => {
      const after = selectedStepId ? wf.steps.find((s) => s.id === selectedStepId) : null;
      const newStep: WorkflowStep = {
        id: uid(),
        order: wf.steps.length + 1,
        title: "New Step",
        description: "",
        overrideInReport: false,
        overrideReportText: "",
        includeDescriptionInReport: true,
        mediaIds: [],
        decisionsEnabled: false,
        decisions: [],
        inputs: [],
        nextStepId: null,
      };
      if (after) {
        const afterOrder = after.order;
        for (const s of wf.steps) if (s.order > afterOrder) s.order += 1;
        newStep.order = afterOrder + 1;
      }
      wf.steps.push(newStep);
      return wf;
    });
  }

  function duplicateStep(stepId: string) {
    updateWorkflow((wf) => {
      const s = wf.steps.find((x) => x.id === stepId);
      if (!s) return wf;
      const copy: WorkflowStep = deepCopy(s);
      copy.id = uid();
      copy.title = `${s.title || "Step"} (Copy)`;
      copy.order = s.order + 1;
      copy.decisions = (copy.decisions || []).map((d) => ({ ...d, id: uid() }));
      copy.inputs = (copy.inputs || []).map((i) => ({ ...i, id: uid() }));
      for (const other of wf.steps) if (other.order > s.order) other.order += 1;
      wf.steps.push(copy);
      return wf;
    });
  }

  function deleteStep(stepId: string) {
    updateWorkflow((wf) => {
      const idx = wf.steps.findIndex((s) => s.id === stepId);
      if (idx < 0) return wf;
      const removed = wf.steps[idx];
      wf.steps.splice(idx, 1);
      for (const s of wf.steps) {
        if (s.nextStepId === removed.id) s.nextStepId = null;
        if (s.decisionsEnabled) {
          s.decisions = (s.decisions || []).map((d) =>
            d.targetStepId === removed.id ? { ...d, targetStepId: null } : d
          );
        }
      }
      return wf;
    });
  }

  function moveStep(stepId: string, direction: -1 | 1) {
    updateWorkflow((wf) => {
      const sorted = [...wf.steps].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((s) => s.id === stepId);
      if (idx < 0) return wf;
      const j = idx + direction;
      if (j < 0 || j >= sorted.length) return wf;
      const tmp = sorted[idx].order;
      sorted[idx].order = sorted[j].order;
      sorted[j].order = tmp;
      wf.steps = sorted;
      return wf;
    });
  }

  function updateStep(stepId: string, patch: Partial<WorkflowStep>) {
    updateWorkflow((wf) => {
      const s = wf.steps.find((x) => x.id === stepId);
      if (s) Object.assign(s, patch);
      return wf;
    });
  }

  // Decisions
  function addDecision(stepId: string) {
    updateWorkflow((wf) => {
      const step = wf.steps.find((s) => s.id === stepId);
      if (!step) return wf;
      const current = step.decisions || [];
      if (current.length >= 20) return wf;
      current.push({ id: uid(), label: `Option ${current.length + 1}`, targetStepId: null });
      step.decisions = current;
      step.decisionsEnabled = true;
      return wf;
    });
  }

  function updateDecision(stepId: string, decisionId: string, patch: Partial<Decision>) {
    updateWorkflow((wf) => {
      const step = wf.steps.find((s) => s.id === stepId);
      if (!step) return wf;
      step.decisions = (step.decisions || []).map((d) => (d.id === decisionId ? { ...d, ...patch } : d));
      return wf;
    });
  }

  function deleteDecision(stepId: string, decisionId: string) {
    updateWorkflow((wf) => {
      const step = wf.steps.find((s) => s.id === stepId);
      if (!step) return wf;
      step.decisions = (step.decisions || []).filter((d) => d.id !== decisionId);
      if (step.decisions.length === 0) step.decisionsEnabled = false;
      return wf;
    });
  }

  // Inputs
  function addInput(stepId: string, type: StepInputType, options?: string[], featureId?: string, label?: string, subFields?: { id: string; name: string }[]) {
    updateWorkflow((wf) => {
      const step = wf.steps.find((s) => s.id === stepId);
      if (!step) return wf;
      step.inputs = step.inputs || [];
      step.inputs.push({
        id: uid(),
        type,
        label: label ?? defaultLabelForInput(type),
        required: false,
        options: options ?? (type === "choice" ? ["Option A", "Option B"] : undefined),
        featureId,
        subFields: subFields?.length ? subFields : undefined,
      });
      return wf;
    });
  }

  function updateInput(stepId: string, inputId: string, patch: Partial<StepInput>) {
    updateWorkflow((wf) => {
      const step = wf.steps.find((s) => s.id === stepId);
      if (!step) return wf;
      step.inputs = (step.inputs || []).map((i) => (i.id === inputId ? { ...i, ...patch } : i));
      return wf;
    });
  }

  function deleteInput(stepId: string, inputId: string) {
    updateWorkflow((wf) => {
      const step = wf.steps.find((s) => s.id === stepId);
      if (!step) return wf;
      step.inputs = (step.inputs || []).filter((i) => i.id !== inputId);
      return wf;
    });
  }

  // Export / Import
  const importRef = useRef<HTMLInputElement>(null);

  function exportJSON() {
    const blob = new Blob([JSON.stringify(deepCopy(workflow), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(workflow.name || "workflow").replace(/\s+/g, "_").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function normalizeImportedWorkflow(parsed: Workflow, targetProductId: string): Workflow {
    return {
      ...parsed,
      id: uid(),
      productId: targetProductId,
      createdAt: parsed.createdAt || Date.now(),
      name: parsed.name || "Imported Workflow",
      media: Array.isArray(parsed.media) ? parsed.media : [],
      steps: normalizeOrders(
        (parsed.steps || []).map((s, idx) => ({
          id: s.id || uid(),
          order: typeof s.order === "number" ? s.order : idx + 1,
          title: s.title ?? "",
          description: s.description ?? "",
          overrideInReport: !!s.overrideInReport,
          overrideReportText: s.overrideReportText ?? "",
          includeDescriptionInReport: typeof s.includeDescriptionInReport === "boolean" ? s.includeDescriptionInReport : true,
          mediaIds: Array.isArray(s.mediaIds) ? s.mediaIds : [],
          decisionsEnabled: !!s.decisionsEnabled,
          decisions: Array.isArray(s.decisions)
            ? s.decisions.map((d) => ({ id: d.id || uid(), label: d.label ?? "", targetStepId: d.targetStepId ?? null }))
            : [],
          inputs: Array.isArray(s.inputs)
            ? s.inputs.map((i) => ({ id: i.id || uid(), type: (i.type || "text") as StepInputType, label: i.label ?? "", required: !!i.required, options: i.options }))
            : [],
          nextStepId: s.nextStepId ?? null,
        }))
      ),
    };
  }

  async function importJSON(file: File) {
    const raw = JSON.parse(await file.text());
    if (!raw || (typeof raw !== "object" && !Array.isArray(raw))) throw new Error("Invalid workflow file");

    // Resolve steps from multiple possible file formats:
    // 1. Workflow export:   { steps: [...], productId, name, ... }
    // 2. WorkflowConfig:    { stepsJson: "[...]", productId, name, ... }
    // 3. Raw steps array:   [{ id, title, ... }, ...]
    let steps: WorkflowStep[] | null = null;
    const srcProductId: string | undefined = Array.isArray(raw) ? undefined : raw.productId;
    const srcName: string | undefined = Array.isArray(raw) ? undefined : raw.name;

    if (Array.isArray(raw)) {
      steps = raw as WorkflowStep[];
    } else if (typeof raw.stepsJson === "string") {
      // WorkflowConfig format — parse stepsJson string first (may contain full Workflow or steps array)
      try {
        const inner = JSON.parse(raw.stepsJson);
        if (Array.isArray(inner)) steps = inner as WorkflowStep[];
        else if (inner && Array.isArray(inner.steps)) steps = inner.steps as WorkflowStep[];
      } catch {}
    }
    // Fall back to raw.steps if stepsJson wasn't present or yielded nothing
    if (!steps && Array.isArray(raw.steps)) {
      steps = raw.steps as WorkflowStep[];
    }

    if (!steps || steps.length === 0) throw new Error("Invalid workflow file — no steps found");

    const asWorkflow: Workflow = {
      id: raw.id || uid(),
      name: srcName || "Imported Workflow",
      productId: srcProductId || productId,
      createdAt: (raw.createdAt as number) || Date.now(),
      steps,
      media: Array.isArray(raw.media) ? raw.media as MediaItem[] : [],
    };

    // Always show preview dialog so user can confirm before overwriting current steps
    setPendingImport({ raw: asWorkflow, normalized: normalizeImportedWorkflow(asWorkflow, productId) });
  }

  // ------------------------------------------------------------------
  // Auto-create config if needed (for media uploads before first save)
  // ------------------------------------------------------------------

  async function ensureConfigId(): Promise<string | null> {
    if (resolvedConfigIdRef.current) return resolvedConfigIdRef.current;
    try {
      const created = await workflowConfigService.create({
        name: workflow.name || `${productName} Workflow`,
        productId,
        stepsJson: JSON.stringify(workflow),
      });
      resolvedConfigIdRef.current = created.id;
      setResolvedConfigId(created.id);
      setCurrentConfig(created);
      onConfigSaved?.(created);
      return created.id;
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------------
  // Publish WorkflowConfig
  // ------------------------------------------------------------------

  function openPublishDialog() {
    let featureSels: FeatureSelection[] = [];
    if (currentConfig) {
      try { featureSels = JSON.parse(currentConfig.featureSelectionsJson) as FeatureSelection[]; } catch {}
    }
    const selMap = new Map(featureSels.map((s) => [s.featureId, s]));
    setPublishForm({
      name: currentConfig?.name ?? workflow.name,
      configType: currentConfig?.configType ?? "",
      notes: currentConfig?.notes ?? "",
      featureSelections: productFeatures.map(
        (f) => selMap.get(f.id) ?? { featureId: f.id, included: false, activeCount: 0 },
      ),
    });
    setPublishDialogOpen(true);
  }

  async function handleConfirmPublish() {
    let cfgId = resolvedConfigIdRef.current ?? initialConfigId;
    if (!cfgId) {
      cfgId = await ensureConfigId();
      if (!cfgId) return;
    }
    setPublishSaving(true);
    try {
      await workflowConfigService.update(cfgId, {
        name: publishForm.name.trim() || undefined,
        configType: publishForm.configType.trim() || undefined,
        notes: publishForm.notes.trim() || undefined,
        featureSelectionsJson: JSON.stringify(publishForm.featureSelections),
        stepsJson: JSON.stringify(workflow),
      });
      const updated = await workflowConfigService.publish(cfgId);
      setCurrentConfig(updated);
      setPublishDialogOpen(false);
      onConfigPublished?.(updated);
    } catch {
      console.warn("[WorkflowBuilder] publish failed");
    } finally {
      setPublishSaving(false);
    }
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  const isReadOnly = currentConfig?.status === "Published" || currentConfig?.status === "Archived";

  return (
    <Stack spacing={2}>
      {/* Read-only banner for Published/Archived */}
      {isReadOnly && (
        <Alert severity={currentConfig?.status === "Archived" ? "warning" : "info"}>
          This work instruction is <strong>{currentConfig?.status}</strong> and is read-only.
          {currentConfig?.status === "Published" && " Use \"Create new version\" from the instructions list to make changes."}
        </Alert>
      )}
      {!initialConfigId && (
        <Alert severity="info">
          Select a work instruction from the list to start editing, or create a new one.
        </Alert>
      )}
      {/* Toolbar */}
      <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} justifyContent="space-between" spacing={1.5}>
        <Stack spacing={0.5}>
          {configName && (
            <Typography variant="caption" color="primary.main" fontWeight={600}>
              Config: {configName}
            </Typography>
          )}
          <TextField
            size="small"
            label="Workflow name"
            value={workflow.name}
            onChange={(e) => updateWorkflow((wf) => { wf.name = e.target.value; return wf; })}
            sx={{ minWidth: 280 }}
            disabled={isReadOnly}
          />
          <Stack direction="row" alignItems="center" spacing={0.75}>
            {saveStatus === "saving" && <CircularProgress size={11} />}
            {saveStatus === "saved" && <CheckCircleOutlined sx={{ fontSize: 13, color: "success.main" }} />}
            {saveStatus === "error" && <WarningOutlined sx={{ fontSize: 13, color: "warning.main" }} />}
            <Typography variant="caption" color={saveStatus === "error" ? "warning.main" : "text.secondary"}>
              {saveStatus === "saving" ? "Saving…"
                : saveStatus === "saved" ? `Saved · ${stepsSorted.length} step${stepsSorted.length === 1 ? "" : "s"}`
                : saveStatus === "error" ? "Save failed — changes kept locally"
                : `${stepsSorted.length} step${stepsSorted.length === 1 ? "" : "s"}`}
            </Typography>
          </Stack>
        </Stack>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button
            size="small"
            variant="contained"
            color="success"
            startIcon={<PlayArrowOutlined />}
            onClick={() => setRunnerOpen(true)}
            disabled={stepsSorted.length === 0}
          >
            Run
          </Button>
          {currentConfig?.status !== "Published" && currentConfig?.status !== "Archived" && (
            <Button
              size="small"
              variant="contained"
              color="primary"
              startIcon={<PublishOutlined />}
              onClick={openPublishDialog}
              disabled={stepsSorted.length === 0}
            >
              {publishSaving ? "Publishing…" : "Publish"}
            </Button>
          )}
          <Button size="small" variant="outlined" startIcon={<DownloadOutlined />} onClick={exportJSON}>
            Export JSON
          </Button>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json,text/plain"
            style={{ display: "none" }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try { await importJSON(f); } catch (err) { alert(String((err as Error)?.message || err)); } finally { e.target.value = ""; }
            }}
          />
          <Button size="small" variant="outlined" startIcon={<UploadOutlined />} onClick={() => importRef.current?.click()}>
            Import JSON
          </Button>
          <Tooltip title="Clear all steps and reset to blank">
            <Button
              size="small"
              variant="outlined"
              color="warning"
              startIcon={<RestartAltOutlined />}
              onClick={() => {
                if (window.confirm("Reset to blank workflow? This will remove all current steps.")) {
                  importedRef.current = true;
                  setWorkflow(createDefaultWorkflow(productId, productName));
                }
              }}
            >
              Reset
            </Button>
          </Tooltip>
        </Stack>
      </Stack>

      {/* 3-column layout */}
      <Grid container spacing={2}>
        {/* Left: step list */}
        <Grid item xs={12} md={3}>
          <StepListPanel
            stepsSorted={stepsSorted}
            selectedStepId={selectedStepId}
            reachable={reachable}
            onSelect={setSelectedStepId}
            onAdd={addStep}
            onDelete={deleteStep}
            onDuplicate={duplicateStep}
            onMove={moveStep}
          />
        </Grid>

        {/* Middle: step editor */}
        <Grid item xs={12} md={5}>
          {selectedStep ? (
            <StepEditorPanel
              step={selectedStep}
              stepsSorted={stepsSorted}
              workflow={workflow}
              templateId={resolvedConfigId}
              ensureConfigId={ensureConfigId}
              productFeatures={productFeatures}
              onStepChange={(patch) => updateStep(selectedStep.id, patch)}
              onAddDecision={() => addDecision(selectedStep.id)}
              onUpdateDecision={(dId, patch) => updateDecision(selectedStep.id, dId, patch)}
              onDeleteDecision={(dId) => deleteDecision(selectedStep.id, dId)}
              onAddInput={(type) => addInput(selectedStep.id, type)}
              onAddFeatureInput={(feat) => addInput(selectedStep.id, feat.type, feat.options, feat.featureId, feat.label, feat.subFields)}
              onUpdateInput={(iId, patch) => updateInput(selectedStep.id, iId, patch)}
              onDeleteInput={(iId) => deleteInput(selectedStep.id, iId)}
              onWorkflowUpdate={(wf) => { justLoadedRef.current = true; setWorkflow(wf); }}
            />
          ) : (
            <Paper className="glass-card" sx={{ p: 3 }}>
              <Typography variant="body2" color="text.secondary">
                Select a step from the list to begin editing.
              </Typography>
            </Paper>
          )}
        </Grid>

        {/* Right: worker preview */}
        <Grid item xs={12} md={4}>
          <WorkerPreviewPanel workflow={workflow} stepsSorted={stepsSorted} />
        </Grid>
      </Grid>

      <WorkOrderRunner
        open={runnerOpen}
        onClose={() => setRunnerOpen(false)}
        workflow={workflow}
        productId={productId}
        productName={productName}
      />

      {/* Publish dialog */}
      <Dialog
        open={publishDialogOpen}
        onClose={() => !publishSaving && setPublishDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <PublishOutlined color="primary" />
          Publish Work Instruction
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info" sx={{ fontSize: "0.8rem" }}>
              Review and confirm details before publishing. Once published, this work instruction will be <strong>locked</strong> and ready to assign to assets.
            </Alert>
            <TextField
              label="Work Instruction Name"
              value={publishForm.name}
              onChange={(e) => setPublishForm((p) => ({ ...p, name: e.target.value }))}
              fullWidth
              required
              autoFocus
            />
            <TextField
              label="Configuration Type"
              value={publishForm.configType}
              onChange={(e) => setPublishForm((p) => ({ ...p, configType: e.target.value }))}
              fullWidth
              placeholder="e.g. Installation, Maintenance, Inspection"
              helperText="Used to identify this instruction type when assigning to an asset"
            />
            <Box>
              <Typography variant="body2" color="text.secondary">
                Product: <strong>{productName}</strong>
              </Typography>
            </Box>
            {productFeatures.length > 0 && (
              <Stack spacing={1}>
                <Typography variant="subtitle2">Product Feature Inclusions</Typography>
                <Typography variant="caption" color="text.secondary">
                  Specify which features are active for this configuration and how many are installed.
                </Typography>
                {productFeatures.map((feat) => {
                  const sel = publishForm.featureSelections.find((s) => s.featureId === feat.id);
                  const included = sel?.included ?? false;
                  const count = sel?.activeCount ?? 0;
                  const update = (patch: Partial<FeatureSelection>) =>
                    setPublishForm((p) => ({
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
            <TextField
              label="Description"
              value={publishForm.notes}
              onChange={(e) => setPublishForm((p) => ({ ...p, notes: e.target.value }))}
              fullWidth
              multiline
              rows={2}
              placeholder="Optional description or notes"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPublishDialogOpen(false)} disabled={publishSaving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={publishSaving ? <CircularProgress size={14} /> : <PublishOutlined />}
            onClick={handleConfirmPublish}
            disabled={publishSaving || !publishForm.name.trim()}
          >
            {publishSaving ? "Publishing…" : "Confirm & Publish"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Import confirmation dialog */}
      {(() => {
        const isCrossProduct = !!(pendingImport?.raw.productId && pendingImport.raw.productId !== productId);
        return (
      <Dialog open={!!pendingImport} onClose={() => setPendingImport(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {isCrossProduct ? <WarningOutlined color="warning" /> : <UploadOutlined color="primary" />}
          {isCrossProduct ? "Different Product Workflow" : "Import Workflow"}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" gutterBottom>
            <strong>{pendingImport?.raw.name || "Unnamed"}</strong> —{" "}
            <strong>{pendingImport?.normalized.steps.length ?? 0} step{pendingImport?.normalized.steps.length !== 1 ? "s" : ""}</strong>
            {isCrossProduct && " (from a different product)"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {isCrossProduct
              ? `This file was created for a different product. The steps will be copied as a template for ${productName}. Media attachments will not carry over.`
              : "This will replace the current steps with the imported ones."}
          </Typography>
          {isCrossProduct && (
          <Alert severity="info" sx={{ mt: 1.5, fontSize: 12 }}>
            The imported workflow will be treated as a new draft — it won't overwrite the original.
          </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingImport(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (pendingImport) {
                importedRef.current = true;
                setWorkflow(pendingImport.normalized);
              }
              setPendingImport(null);
            }}
          >
            {pendingImport?.raw.productId && pendingImport.raw.productId !== productId
              ? `Use as Template (${pendingImport.normalized.steps.length} steps)`
              : `Load ${pendingImport?.normalized.steps.length ?? 0} steps`}
          </Button>
        </DialogActions>
      </Dialog>
        );
      })()}

    </Stack>
  );
};

// ------------------------------------------------------------------
// StepListPanel
// ------------------------------------------------------------------

interface StepListPanelProps {
  stepsSorted: WorkflowStep[];
  selectedStepId: string | null;
  reachable: Set<string>;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}

function StepListPanel({ stepsSorted, selectedStepId, reachable, onSelect, onAdd, onDelete, onDuplicate, onMove }: StepListPanelProps) {
  return (
    <Paper className="glass-card" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="subtitle1" fontWeight={600}>
            Steps
          </Typography>
          <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={onAdd}>
            Add step
          </Button>
        </Stack>

        <Stack spacing={1}>
          {stepsSorted.map((s) => {
            const isSelected = s.id === selectedStepId;
            const isReachable = reachable.has(s.id);
            return (
              <Paper
                key={s.id}
                variant={isSelected ? "elevation" : "outlined"}
                elevation={isSelected ? 3 : 0}
                onClick={() => onSelect(s.id)}
                sx={{
                  p: 1.5,
                  cursor: "pointer",
                  bgcolor: isSelected ? "primary.main" : undefined,
                  color: isSelected ? "primary.contrastText" : undefined,
                  "&:hover": { bgcolor: isSelected ? "primary.dark" : "action.hover" },
                  transition: "background-color 0.15s",
                }}
              >
                <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                  <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap" useFlexGap>
                      <Typography variant="caption" fontWeight={700} sx={{ opacity: 0.7 }}>
                        {String(s.order).padStart(2, "0")}
                      </Typography>
                      <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 130 }}>
                        {s.title || "(Untitled step)"}
                      </Typography>
                      {!isReachable && stepsSorted.indexOf(s) > 0 && (
                        <Chip label="Unlinked" size="small" color="warning" sx={{ height: 18, fontSize: 10 }} />
                      )}
                    </Stack>
                    <Stack direction="row" spacing={1.5} sx={{ mt: 0.5, opacity: 0.65 }}>
                      <Tooltip title="Inputs">
                        <Typography variant="caption" sx={{ display: "flex", alignItems: "center", gap: 0.3 }}>
                          <DescriptionOutlined sx={{ fontSize: 12 }} />
                          {(s.inputs || []).length}
                        </Typography>
                      </Tooltip>
                      <Tooltip title="Decisions">
                        <Typography variant="caption" sx={{ display: "flex", alignItems: "center", gap: 0.3 }}>
                          <AccountTreeOutlined sx={{ fontSize: 12 }} />
                          {s.decisionsEnabled ? (s.decisions || []).length : 0}
                        </Typography>
                      </Tooltip>
                    </Stack>
                  </Box>
                  <Stack direction="row" spacing={0.25} onClick={(e) => e.stopPropagation()}>
                    <Tooltip title="Move up">
                      <span>
                        <IconButton size="small" disabled={s.order === 1} onClick={() => onMove(s.id, -1)}
                          sx={{ color: isSelected ? "primary.contrastText" : undefined, opacity: s.order === 1 ? 0.3 : 0.7 }}>
                          <DragIndicatorOutlined fontSize="small" sx={{ transform: "rotate(90deg)" }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Duplicate">
                      <IconButton size="small" onClick={() => onDuplicate(s.id)}
                        sx={{ color: isSelected ? "primary.contrastText" : undefined, opacity: 0.7 }}>
                        <ContentCopyOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete step">
                      <IconButton
                        size="small"
                        onClick={() => {
                          if (confirm("Delete this step? Links pointing to it will be cleared.")) onDelete(s.id);
                        }}
                        sx={{ color: isSelected ? "error.light" : "error.main", opacity: 0.8 }}
                      >
                        <DeleteOutline fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Stack>
              </Paper>
            );
          })}
          {stepsSorted.length === 0 && (
            <Alert severity="info" sx={{ fontSize: 12 }}>
              No steps yet. Click "Add step" to begin.
            </Alert>
          )}
        </Stack>

        <Divider />
        <ConnectivityAudit steps={stepsSorted} />
      </Stack>
    </Paper>
  );
}

// ------------------------------------------------------------------
// ConnectivityAudit
// ------------------------------------------------------------------

function ConnectivityAudit({ steps }: { steps: WorkflowStep[] }) {
  const issues = useMemo(() => {
    const ids = new Set(steps.map((s) => s.id));
    const problems: string[] = [];
    for (const s of steps) {
      if (s.nextStepId && !ids.has(s.nextStepId)) {
        problems.push(`Step ${s.order}: "Next" points to a missing step`);
      }
      for (const d of s.decisions || []) {
        if (d.targetStepId && !ids.has(d.targetStepId)) {
          problems.push(`Step ${s.order}: Decision "${d.label}" points to a missing step`);
        }
      }
    }
    return problems;
  }, [steps]);

  if (!issues.length) {
    return (
      <Stack direction="row" spacing={1} alignItems="center">
        <CheckCircleOutlined fontSize="small" color="success" />
        <Typography variant="caption" color="success.main">
          Connectivity looks good.
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={0.5}>
      <Stack direction="row" spacing={0.75} alignItems="center">
        <WarningOutlined fontSize="small" color="warning" />
        <Typography variant="caption" color="warning.main" fontWeight={600}>
          Connectivity warnings
        </Typography>
      </Stack>
      {issues.slice(0, 5).map((msg, idx) => (
        <Typography key={idx} variant="caption" color="text.secondary">
          • {msg}
        </Typography>
      ))}
      {issues.length > 5 && (
        <Typography variant="caption" color="text.secondary">
          …and {issues.length - 5} more
        </Typography>
      )}
    </Stack>
  );
}

// ------------------------------------------------------------------
// StepEditorPanel
// ------------------------------------------------------------------

interface StepEditorPanelProps {
  step: WorkflowStep;
  stepsSorted: WorkflowStep[];
  workflow: Workflow;
  templateId: string | null;
  ensureConfigId: () => Promise<string | null>;
  productFeatures: ProductFeatureDefinition[];
  onStepChange: (patch: Partial<WorkflowStep>) => void;
  onAddDecision: () => void;
  onUpdateDecision: (id: string, patch: Partial<Decision>) => void;
  onDeleteDecision: (id: string) => void;
  onAddInput: (type: StepInputType) => void;
  onAddFeatureInput: (feat: { type: StepInputType; options?: string[]; featureId: string; label: string; subFields?: { id: string; name: string }[] }) => void;
  onUpdateInput: (id: string, patch: Partial<StepInput>) => void;
  onDeleteInput: (id: string) => void;
  onWorkflowUpdate: (wf: Workflow) => void;
}

function StepEditorPanel({
  step,
  stepsSorted,
  workflow,
  templateId,
  ensureConfigId,
  productFeatures,
  onStepChange,
  onAddDecision,
  onUpdateDecision,
  onDeleteDecision,
  onAddInput,
  onAddFeatureInput,
  onUpdateInput,
  onDeleteInput,
  onWorkflowUpdate,
}: StepEditorPanelProps) {
  const [editorTab, setEditorTab] = useState(0);
  const [showReportText, setShowReportText] = useState(false);

  useEffect(() => {
    setShowReportText(step.overrideInReport);
  }, [step.id, step.overrideInReport]);

  return (
    <Paper className="glass-card" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="subtitle1" fontWeight={600}>
            Step Editor
          </Typography>
          <Stack direction="row" spacing={0.75}>
            <Chip label={`Step ${step.order}`} size="small" />
            <Chip label={`ID: ${step.id.slice(0, 8)}…`} size="small" variant="outlined" />
          </Stack>
        </Stack>

        {/* Title */}
        <TextField
          label="Title"
          size="small"
          fullWidth
          value={step.title}
          onChange={(e) => onStepChange({ title: e.target.value })}
        />

        {/* Description with report toggle */}
        <Stack spacing={0.5}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="caption" color="text.secondary">
              {showReportText ? "Report-only description" : "Worker-facing description"}
            </Typography>
            <Tooltip title="Toggle between user-facing and report-only override">
              <Button
                size="small"
                variant="text"
                sx={{ fontSize: 11, minWidth: 0 }}
                onClick={() => {
                  const next = !showReportText;
                  setShowReportText(next);
                  onStepChange({ overrideInReport: next, includeDescriptionInReport: !next });
                }}
              >
                {showReportText ? "user + report view" : "report only"}
              </Button>
            </Tooltip>
          </Stack>
          {!showReportText ? (
            <TextField
              fullWidth
              multiline
              rows={3}
              size="small"
              placeholder="Describe the action to perform…"
              value={step.description}
              onChange={(e) => onStepChange({ description: e.target.value })}
            />
          ) : (
            <TextField
              fullWidth
              multiline
              rows={3}
              size="small"
              placeholder="Report-only description (overrides above in the final report)…"
              value={step.overrideReportText}
              onChange={(e) => onStepChange({ overrideReportText: e.target.value })}
            />
          )}
        </Stack>

        {/* Default next step */}
        <Stack spacing={0.5}>
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <SwapHorizOutlined fontSize="small" color="action" />
            <Typography variant="caption" color="text.secondary">
              Default next step (when no decision is taken)
            </Typography>
          </Stack>
          <FormControl size="small" fullWidth>
            <Select
              value={step.nextStepId || "__none"}
              onChange={(e) => onStepChange({ nextStepId: e.target.value === "__none" ? null : e.target.value })}
            >
              <MenuItem value="__none">(No default next step)</MenuItem>
              {stepsSorted
                .filter((s) => s.id !== step.id)
                .map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {stepLabel(s)}
                  </MenuItem>
                ))}
            </Select>
          </FormControl>
        </Stack>

        {/* Tabs */}
        <Box>
          <Tabs value={editorTab} onChange={(_, v) => setEditorTab(v)} variant="fullWidth">
            <Tab label="Decisions" />
            <Tab label="Inputs" />
            <Tab label="Content" />
          </Tabs>

          <TabPanel value={editorTab} index={0}>
            <DecisionsSection
              step={step}
              stepsSorted={stepsSorted}
              onStepChange={onStepChange}
              onAddDecision={onAddDecision}
              onUpdateDecision={onUpdateDecision}
              onDeleteDecision={onDeleteDecision}
            />
          </TabPanel>

          <TabPanel value={editorTab} index={1}>
            <InputsSection
              step={step}
              productFeatures={productFeatures}
              onAddInput={onAddInput}
              onAddFeatureInput={onAddFeatureInput}
              onUpdateInput={onUpdateInput}
              onDeleteInput={onDeleteInput}
            />
          </TabPanel>

          <TabPanel value={editorTab} index={2}>
            <MediaLibraryPanel
              workflow={workflow}
              step={step}
              templateId={templateId}
              ensureConfigId={ensureConfigId}
              onStepChange={onStepChange}
              onWorkflowUpdate={onWorkflowUpdate}
            />
          </TabPanel>
        </Box>

        {/* Inline report preview */}
        <ReportPreviewInline step={step} />
      </Stack>
    </Paper>
  );
}

// ------------------------------------------------------------------
// DecisionsSection
// ------------------------------------------------------------------

function DecisionsSection({
  step,
  stepsSorted,
  onStepChange,
  onAddDecision,
  onUpdateDecision,
  onDeleteDecision,
}: {
  step: WorkflowStep;
  stepsSorted: WorkflowStep[];
  onStepChange: (patch: Partial<WorkflowStep>) => void;
  onAddDecision: () => void;
  onUpdateDecision: (id: string, patch: Partial<Decision>) => void;
  onDeleteDecision: (id: string) => void;
}) {
  const enabled = step.decisionsEnabled;
  const count = (step.decisions || []).length;

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} useFlexGap>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Switch
            size="small"
            checked={enabled}
            onChange={(e) => onStepChange({ decisionsEnabled: e.target.checked })}
          />
          <Typography variant="body2">Enabled</Typography>
        </Stack>
        <Button
          size="small"
          variant="contained"
          startIcon={<AddOutlined />}
          onClick={onAddDecision}
          disabled={!enabled || count >= 20}
        >
          Add button ({count}/20)
        </Button>
      </Stack>

      {!enabled ? (
        <Alert severity="info" sx={{ fontSize: 12 }}>
          Enable decision pathways to add branching buttons.
        </Alert>
      ) : count === 0 ? (
        <Alert severity="info" sx={{ fontSize: 12 }}>
          No decision buttons yet.
        </Alert>
      ) : (
        <Stack spacing={1.5}>
          {step.decisions.map((d) => (
            <Paper key={d.id} variant="outlined" sx={{ p: 1.5 }}>
              <Stack spacing={1}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
                  <TextField
                    label="Button label"
                    size="small"
                    fullWidth
                    value={d.label}
                    onChange={(e) => onUpdateDecision(d.id, { label: e.target.value })}
                  />
                  <FormControl size="small" sx={{ minWidth: 180 }}>
                    <Select
                      value={d.targetStepId || "__none"}
                      onChange={(e) =>
                        onUpdateDecision(d.id, { targetStepId: e.target.value === "__none" ? null : e.target.value })
                      }
                      displayEmpty
                    >
                      <MenuItem value="__none">(No target step)</MenuItem>
                      {stepsSorted
                        .filter((s) => s.id !== step.id)
                        .map((s) => (
                          <MenuItem key={s.id} value={s.id}>
                            {stepLabel(s)}
                          </MenuItem>
                        ))}
                    </Select>
                  </FormControl>
                  <Tooltip title="Delete decision">
                    <IconButton size="small" color="error" onClick={() => onDeleteDecision(d.id)}>
                      <DeleteOutline fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <AccountTreeOutlined sx={{ fontSize: 12 }} />
                  Tapping "{d.label || "(button)"}" jumps to the selected step.
                </Typography>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

// ------------------------------------------------------------------
// InputsSection
// ------------------------------------------------------------------

const INPUT_TYPES: { type: StepInputType; label: string }[] = [
  { type: "text", label: "Text" },
  { type: "number", label: "Number" },
  { type: "choice", label: "Choice (multiple options)" },
  { type: "checkbox", label: "Checkbox (confirm)" },
  { type: "photo", label: "Photo capture" },
  { type: "video", label: "Video capture" },
  { type: "signature", label: "Signature" },
  { type: "note", label: "Note / free text" },
];

// Map product feature value types to step input types
function featureToInputType(valueType: string): StepInputType {
  switch (valueType) {
    case "number": case "percentage": case "rating": return "number";
    case "tri-state": case "single-select": case "multi-select": return "choice";
    case "date": return "date";
    case "rich-text": return "note";
    case "component": return "component";
    default: return "text";
  }
}

function InputsSection({
  step,
  productFeatures,
  onAddInput,
  onAddFeatureInput,
  onUpdateInput,
  onDeleteInput,
}: {
  step: WorkflowStep;
  productFeatures: ProductFeatureDefinition[];
  onAddInput: (type: StepInputType) => void;
  onAddFeatureInput: (feat: { type: StepInputType; options?: string[]; featureId: string; label: string; subFields?: { id: string; name: string }[] }) => void;
  onUpdateInput: (id: string, patch: Partial<StepInput>) => void;
  onDeleteInput: (id: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedFeatIds, setSelectedFeatIds] = useState<Set<string>>(new Set());
  const usedFeatureIds = new Set((step.inputs || []).map((i) => i.featureId).filter(Boolean) as string[]);

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="body2" color="text.secondary">
          Action prompts for the technician.
        </Typography>
        <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={() => setPickerOpen(true)}>
          Add input
        </Button>
      </Stack>

      {(step.inputs || []).length === 0 ? (
        <Alert severity="info" sx={{ fontSize: 12 }}>
          No user inputs yet.
        </Alert>
      ) : (
        <Stack spacing={1.5}>
          {step.inputs.map((inp) => (
            <Paper key={inp.id} variant="outlined" sx={{ p: 1.5 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <Chip label={inp.type.toUpperCase()} size="small" variant="outlined" />
                    {inp.featureId && (
                      <Chip label="Feature" size="small" color="info" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
                    )}
                  </Stack>
                  <Tooltip title="Delete input">
                    <IconButton size="small" color="error" onClick={() => onDeleteInput(inp.id)}>
                      <DeleteOutline fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
                  <TextField
                    label="Label"
                    size="small"
                    fullWidth
                    value={inp.label}
                    onChange={(e) => onUpdateInput(inp.id, { label: e.target.value })}
                  />
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ flexShrink: 0 }}>
                    <Switch
                      size="small"
                      checked={inp.required}
                      onChange={(e) => onUpdateInput(inp.id, { required: e.target.checked })}
                    />
                    <Typography variant="caption" sx={{ whiteSpace: "nowrap" }}>
                      {inp.required ? "Required" : "Optional"}
                    </Typography>
                  </Stack>
                </Stack>
                {inp.type === "choice" && (
                  <TextField
                    label="Options (comma-separated)"
                    size="small"
                    fullWidth
                    value={(inp.options || []).join(", ")}
                    onChange={(e) =>
                      onUpdateInput(inp.id, {
                        options: e.target.value.split(",").map((x) => x.trim()).filter(Boolean),
                      })
                    }
                    placeholder="Option A, Option B, Option C"
                  />
                )}
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      {/* Input type picker dialog */}
      <Dialog open={pickerOpen} onClose={() => { setPickerOpen(false); setSelectedFeatIds(new Set()); }} maxWidth="xs" fullWidth>
        <DialogTitle>Add an input</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ mt: 1 }}>
            {INPUT_TYPES.map(({ type, label }) => (
              <Button
                key={type}
                variant="outlined"
                fullWidth
                onClick={() => { onAddInput(type); setPickerOpen(false); setSelectedFeatIds(new Set()); }}
                sx={{ justifyContent: "flex-start" }}
              >
                {label}
              </Button>
            ))}
            {productFeatures.length > 0 && (
              <>
                <Divider sx={{ my: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">From product features (select multiple)</Typography>
                </Divider>
                {productFeatures.map((feat) => {
                  const alreadyAdded = usedFeatureIds.has(feat.id);
                  const checked = selectedFeatIds.has(feat.id);
                  return (
                    <Stack key={feat.id} direction="row" spacing={0.5} alignItems="center" sx={{ opacity: alreadyAdded ? 0.5 : 1 }}>
                      <Checkbox
                        size="small"
                        disabled={alreadyAdded}
                        checked={checked}
                        onChange={(e) => {
                          setSelectedFeatIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(feat.id);
                            else next.delete(feat.id);
                            return next;
                          });
                        }}
                        sx={{ p: 0.5 }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" noWrap>{feat.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {feat.valueType}{alreadyAdded ? " · already added" : ""}
                        </Typography>
                      </Box>
                    </Stack>
                  );
                })}
                {selectedFeatIds.size > 0 && (
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => {
                      productFeatures
                        .filter((f) => selectedFeatIds.has(f.id))
                        .forEach((feat) => {
                          const inputType = featureToInputType(feat.valueType);
                          const options =
                            feat.valueType === "tri-state" ? ["Yes", "No", "N/A"] :
                            (feat.valueType === "single-select" || feat.valueType === "multi-select") ? (feat.options ?? []) :
                            undefined;
                          onAddFeatureInput({
                            type: inputType,
                            options,
                            featureId: feat.id,
                            label: feat.name,
                            subFields: feat.subProperties?.map((sf) => ({ id: sf.id, name: sf.name })),
                          });
                        });
                      setSelectedFeatIds(new Set());
                      setPickerOpen(false);
                    }}
                  >
                    Add selected ({selectedFeatIds.size})
                  </Button>
                )}
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setPickerOpen(false); setSelectedFeatIds(new Set()); }}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

// ------------------------------------------------------------------
// ReportPreviewInline
// ------------------------------------------------------------------

function ReportPreviewInline({ step }: { step: WorkflowStep }) {
  const [open, setOpen] = useState(false);

  const desc = step.overrideInReport
    ? step.overrideReportText
    : step.includeDescriptionInReport
    ? step.description
    : "";

  return (
    <Box>
      <Button size="small" variant="text" startIcon={<DescriptionOutlined />} onClick={() => setOpen((p) => !p)}>
        {open ? "Hide report preview" : "Show report preview"}
      </Button>
      {open && (
        <Paper variant="outlined" sx={{ p: 1.5, mt: 1 }}>
          <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
            Report output for this step:
          </Typography>
          <Typography variant="body2" fontWeight={600}>
            {String(step.order).padStart(2, "0")} · {step.title || "(Untitled step)"}
          </Typography>
          {desc && <Typography variant="body2" sx={{ mt: 0.5 }}>{desc}</Typography>}
          {step.overrideInReport && (
            <Chip label="Report override active" size="small" color="primary" sx={{ mt: 0.75 }} />
          )}
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.75 }}>
            Inputs: {(step.inputs || []).length} · Media: {(step.mediaIds || []).length}
          </Typography>
        </Paper>
      )}
    </Box>
  );
}

// ------------------------------------------------------------------
// WorkerPreviewPanel
// ------------------------------------------------------------------

function WorkerPreviewPanel({ workflow, stepsSorted }: { workflow: Workflow; stepsSorted: WorkflowStep[] }) {
  const [currentStepId, setCurrentStepId] = useState<string | null>(() => stepsSorted[0]?.id || null);
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    if (!currentStepId || !workflow.steps.some((s) => s.id === currentStepId)) {
      setCurrentStepId(stepsSorted[0]?.id || null);
      setHistory([]);
    }
  }, [workflow.steps, stepsSorted, currentStepId]);

  const step = stepsSorted.find((s) => s.id === currentStepId) || null;

  function goTo(stepId: string | null) {
    if (!stepId) return;
    setHistory((prev) => (currentStepId ? [...prev, currentStepId] : prev));
    setCurrentStepId(stepId);
  }

  function goBack() {
    setHistory((prev) => {
      if (!prev.length) return prev;
      setCurrentStepId(prev[prev.length - 1]);
      return prev.slice(0, -1);
    });
  }

  return (
    <Paper className="glass-card" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="subtitle1" fontWeight={600}>
            Worker Preview
          </Typography>
          <Chip label="Simulation" size="small" />
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Simulated technician view. Navigate with the buttons below.
        </Typography>

        {!step ? (
          <Alert severity="info" sx={{ fontSize: 12 }}>
            No steps available. Add a step to begin.
          </Alert>
        ) : (
          <Stack spacing={2}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                <Typography variant="subtitle2">
                  {String(step.order).padStart(2, "0")} · {step.title || "(Untitled step)"}
                </Typography>
                {step.decisionsEnabled && <Chip label="Branching" size="small" color="primary" />}
              </Stack>
              {step.description && (
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {step.description}
                </Typography>
              )}
            </Paper>

            {(step.inputs || []).length > 0 && (
              <Stack spacing={1}>
                <Typography variant="caption" fontWeight={600} color="text.secondary">
                  Inputs
                </Typography>
                {step.inputs.map((inp) => (
                  <Paper key={inp.id} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" mb={0.75}>
                      <Typography variant="caption" color="text.secondary">
                        {inp.label || "Input"}
                        {inp.required && (
                          <Typography component="span" variant="caption" color="error" sx={{ ml: 0.5 }}>
                            *
                          </Typography>
                        )}
                      </Typography>
                      <Chip label={inp.type.toUpperCase()} size="small" variant="outlined" />
                    </Stack>
                    <InputPreview inp={inp} />
                  </Paper>
                ))}
              </Stack>
            )}

            {step.decisionsEnabled && (step.decisions || []).length > 0 && (
              <Stack spacing={1}>
                <Typography variant="caption" fontWeight={600} color="text.secondary">
                  Decision buttons
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={1} useFlexGap>
                  {step.decisions.map((d) => (
                    <Button
                      key={d.id}
                      variant="contained"
                      size="small"
                      disabled={!d.targetStepId}
                      onClick={() => goTo(d.targetStepId)}
                    >
                      {d.label || "Decision"}
                    </Button>
                  ))}
                </Stack>
              </Stack>
            )}

            <Stack direction="row" spacing={1} flexWrap="wrap" gap={0.5} useFlexGap>
              <Button variant="outlined" size="small" onClick={goBack} disabled={history.length === 0}>
                Back
              </Button>
              <Button
                variant="contained"
                size="small"
                color="success"
                onClick={() => goTo(step.nextStepId)}
                disabled={!step.nextStepId}
              >
                Next step
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={() => { setHistory([]); setCurrentStepId(stepsSorted[0]?.id || null); }}
              >
                Start over
              </Button>
            </Stack>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

// ------------------------------------------------------------------
// MediaLibraryPanel
// ------------------------------------------------------------------

interface MediaLibraryPanelProps {
  workflow: Workflow;
  step: WorkflowStep;
  templateId: string | null;
  ensureConfigId: () => Promise<string | null>;
  onStepChange: (patch: Partial<WorkflowStep>) => void;
  onWorkflowUpdate: (wf: Workflow) => void;
}

function MediaLibraryPanel({ workflow, step, templateId, ensureConfigId, onStepChange, onWorkflowUpdate }: MediaLibraryPanelProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const media: MediaItem[] = Array.isArray(workflow.media) ? workflow.media : [];
  const attachedIds = new Set(step.mediaIds || []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Auto-create config if not saved yet
    const cfgId = templateId || await ensureConfigId();
    if (!cfgId) { setUploadError("Could not create workflow config. Save the workflow name first."); return; }
    setUploadError(null);

    let fileToUpload = file;
    if (file.type.startsWith("image/")) {
      fileToUpload = await resizeImage(file, IMAGE_MAX_DIM, IMAGE_JPEG_QUALITY);
    } else if (file.type.startsWith("video/")) {
      if (file.size > VIDEO_MAX_BYTES) {
        setUploadError("Video exceeds the 100 MB limit. Please compress it before uploading.");
        e.target.value = "";
        return;
      }
    }

    setUploading(true);
    try {
      const updatedConfig = await workflowConfigService.uploadMedia(cfgId, fileToUpload);
      const updatedMedia = (() => { try { return JSON.parse(updatedConfig.mediaJson); } catch { return []; } })();
      onWorkflowUpdate({ ...workflow, media: updatedMedia });
    } catch {
      setUploadError("Upload failed. Check file size and try again.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleDelete(mediaId: string) {
    const cfgId = templateId || await ensureConfigId();
    if (!cfgId) return;
    try {
      const updatedConfig = await workflowConfigService.deleteMedia(cfgId, mediaId);
      // Also detach from step if attached
      if (attachedIds.has(mediaId)) {
        onStepChange({ mediaIds: (step.mediaIds || []).filter((id) => id !== mediaId) });
      }
      const updatedMedia = (() => { try { return JSON.parse(updatedConfig.mediaJson); } catch { return []; } })();
      onWorkflowUpdate({ ...workflow, media: updatedMedia });
    } catch {
      setUploadError("Delete failed.");
    }
  }

  function toggleAttach(mediaId: string) {
    const current = step.mediaIds || [];
    if (current.includes(mediaId)) {
      onStepChange({ mediaIds: current.filter((id) => id !== mediaId) });
    } else {
      onStepChange({ mediaIds: [...current, mediaId] });
    }
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="body2" color="text.secondary">
          Attach images or videos to this step.{" "}
          <Typography component="span" variant="caption" color="text.disabled">
            Images auto-resized to max {IMAGE_MAX_DIM} px · Videos max 100 MB.
          </Typography>
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          {uploading && <CircularProgress size={14} />}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <Button
            size="small"
            variant="contained"
            startIcon={<UploadOutlined />}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            Upload
          </Button>
        </Stack>
      </Stack>

      {uploadError && (
        <Alert severity="error" sx={{ fontSize: 12 }} onClose={() => setUploadError(null)}>
          {uploadError}
        </Alert>
      )}

      {media.length === 0 ? (
        <Alert severity="info" sx={{ fontSize: 12 }}>
          No media uploaded yet. Use the Upload button to add images or videos.
        </Alert>
      ) : (
        <Stack spacing={1}>
          {media.map((item) => {
            const isAttached = attachedIds.has(item.id);
            return (
              <Paper
                key={item.id}
                variant="outlined"
                sx={{
                  p: 1.25,
                  borderColor: isAttached ? "primary.main" : undefined,
                  bgcolor: isAttached ? "action.selected" : undefined,
                }}
              >
                <Stack direction="row" spacing={1.5} alignItems="center">
                  {/* Thumbnail */}
                  <Box sx={{ width: 48, height: 48, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "action.hover", borderRadius: 1, overflow: "hidden" }}>
                    {item.type === "image" ? (
                      <img src={item.url} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <VideocamOutlined fontSize="small" color="action" />
                    )}
                  </Box>

                  {/* Info */}
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="caption" fontWeight={600} noWrap display="block">{item.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.type.toUpperCase()} · {formatSize(item.size)}
                    </Typography>
                  </Box>

                  {/* Attach toggle */}
                  <Tooltip title={isAttached ? "Detach from step" : "Attach to step"}>
                    <IconButton
                      size="small"
                      color={isAttached ? "primary" : "default"}
                      onClick={() => toggleAttach(item.id)}
                    >
                      <AttachFileOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>

                  {/* Delete */}
                  <Tooltip title="Delete from library">
                    <IconButton size="small" color="error" onClick={() => handleDelete(item.id)}>
                      <DeleteOutline fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}

      {attachedIds.size > 0 && (
        <Typography variant="caption" color="primary.main" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <CheckCircleOutlined sx={{ fontSize: 13 }} />
          {attachedIds.size} item{attachedIds.size === 1 ? "" : "s"} attached to this step
        </Typography>
      )}
    </Stack>
  );
}

function InputPreview({ inp }: { inp: StepInput }) {
  if (inp.type === "text") return <TextField size="small" fullWidth disabled placeholder="Enter text" />;
  if (inp.type === "number") return <TextField size="small" fullWidth disabled type="number" placeholder="Enter a number" />;
  if (inp.type === "note") return <TextField size="small" fullWidth disabled multiline rows={2} placeholder="Enter notes" />;
  if (inp.type === "scan") return (
    <Stack direction="row" spacing={1} alignItems="center">
      <QrCodeScannerOutlined fontSize="small" color="action" />
      <TextField size="small" fullWidth disabled placeholder="Scan or enter value" />
    </Stack>
  );
  if (inp.type === "date") return <TextField size="small" fullWidth disabled type="date" InputLabelProps={{ shrink: true }} />;
  if (inp.type === "checkbox") {
    return (
      <Stack direction="row" alignItems="center" spacing={1}>
        <Switch size="small" disabled />
        <Typography variant="caption">Unchecked</Typography>
      </Stack>
    );
  }
  if (inp.type === "choice") {
    return (
      <Stack direction="row" flexWrap="wrap" gap={0.5} useFlexGap>
        {(inp.options || []).length === 0 ? (
          <Typography variant="caption" color="text.secondary">No options set</Typography>
        ) : (
          inp.options!.map((opt, idx) => <Chip key={idx} label={opt} size="small" variant="outlined" />)
        )}
      </Stack>
    );
  }
  if (inp.type === "photo") return <Button disabled size="small" startIcon={<ImageOutlined />}>Capture photo</Button>;
  if (inp.type === "video") return <Button disabled size="small" startIcon={<VideocamOutlined />}>Capture video</Button>;
  if (inp.type === "signature") return <Button disabled size="small" startIcon={<EditOutlined />}>Capture signature</Button>;
  return <Typography variant="caption" color="text.secondary">Unsupported input type</Typography>;
}

export default WorkflowBuilder;
