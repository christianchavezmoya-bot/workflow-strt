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
  PersonOutlined,
  PlayArrowOutlined,
  PublishOutlined,
  QrCodeScannerOutlined,
  RemoveOutlined,
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
import type { CaptureField, CaptureFieldType, Decision, MediaItem, StepInput, StepInputType, StepType, Workflow, WorkflowStep } from "../../types/workflow";
import { STEP_TYPE_LABELS } from "../../types/workflow";
import type { ProductFeatureDefinition } from "../../types/product";
import type { FeatureSelection } from "../../services/productConfigService";
import { workflowConfigService } from "../../services/workflowConfigService";
import { usePermissions } from "../../hooks/usePermissions";
import { workflowTypeService } from "../../services/workflowTypeService";
import QRUploadButton from "../../components/QRUploadButton";
import type { WorkflowConfig } from "../../types/workflowConfig";
import { workflowConfigFeatureService } from "../../services/workflowConfigFeatureService";
import type { WorkflowConfigFeature } from "../../types/workflowConfigFeature";
import { featureDependencyService } from "../../services/featureDependencyService";
import type { FeatureDependency } from "../../types/featureDependency";
import { featureService } from "../../services/featureService";
import type { Feature } from "../../types/feature";
import { isMobileNativePlatform } from "../../utils/platform";
import { randomId } from "../../utils/randomId";
import { markWorkflowOpenTap } from "../../utils/workflowOpenPerf";
import { loadWorkflowOpenPayload } from "../../services/workflowOpenService";
import type { WorkflowType } from "../../types/workflowType";
import WorkOrderRunner from "./WorkOrderRunner";

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

const uid = () => randomId();

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

function defaultLabelForInput(type: StepInputType, workflowTypeName?: string): string {
  switch (type) {
    case "text": return "Text response";
    case "number": return "Numeric value";
    case "choice": return "Select one";
    case "checkbox": return "Confirm";
    case "photo": return "Upload photo";
    case "video": return "Upload video";
    case "signature": return "Signature";
    case "note": return "Note";
    case "user-select": {
      const name = (workflowTypeName ?? "").toLowerCase();
      if (name.includes("install")) return "Installed By";
      if (name.includes("inspect")) return "Inspected By";
      return "Team Member";
    }
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
  workflowTypeId: string;
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
  /** Called when user clicks "New Work Instruction" from inside the builder. */
  onNewConfig?: () => void;
}

// ─── MobileStepStrip ───────────────────────────────────────────────────────

interface MobileStepStripProps {
  stepsSorted: WorkflowStep[];
  selectedStepId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
}

function MobileStepStrip({ stepsSorted, selectedStepId, onSelect, onAdd }: MobileStepStripProps) {
  return (
    <Paper className="glass-card" sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ overflowX: "auto", pb: 0.25 }}>
        {stepsSorted.map((step) => {
          const isSelected = step.id === selectedStepId;
          return (
            <Box
              key={step.id}
              onClick={() => onSelect(step.id)}
              sx={{
                width: 38, height: 38, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                bgcolor: isSelected ? "primary.main" : "action.selected",
                color: isSelected ? "primary.contrastText" : "text.primary",
                cursor: "pointer", fontWeight: 700, fontSize: 13, flexShrink: 0,
                border: "2px solid",
                borderColor: isSelected ? "primary.main" : "divider",
                transition: "background-color 0.15s",
                userSelect: "none",
              }}
            >
              {step.order}
            </Box>
          );
        })}
        <Tooltip title="Add step">
          <IconButton
            size="small"
            onClick={onAdd}
            sx={{
              width: 38, height: 38,
              border: "2px dashed", borderColor: "primary.main",
              color: "primary.main", borderRadius: "50%", flexShrink: 0,
            }}
          >
            <AddOutlined sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Stack>
    </Paper>
  );
}

// ───────────────────────────────────────────────────────────────────────────

const WorkflowBuilder = ({ productId, productName, productFeatures = [], initialConfigId, configName, onConfigSaved, onConfigPublished, onNewConfig }: WorkflowBuilderProps) => {
  // Publishing is a separate Tier-2 right from building: a role may be allowed to draft a
  // workflow without being allowed to release it to the field. Entry into the builder is
  // gated on `build` by WorkInstructions; this gates the release action itself.
  const can = usePermissions();
  const canPublishWorkflow = !!can.workInstructionsBuilder?.publish;
  const [workflow, setWorkflow] = useState<Workflow>(() => createDefaultWorkflow(productId, productName));
  const [runnerOpen, setRunnerOpen] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<WorkflowConfig | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justLoadedRef = useRef(true); // prevents save from firing on load-triggered state changes
  const importedRef = useRef(false);  // blocks async API load from overwriting a user import
  const productFeaturesRef = useRef<ProductFeatureDefinition[]>(productFeatures);
  productFeaturesRef.current = productFeatures;

  // Feature library entries (with captureFields) for the active product
  const [libFeatures, setLibFeatures] = useState<Feature[]>([]);
  const libFeaturesRef = useRef<Feature[]>([]);
  libFeaturesRef.current = libFeatures;

  // Feature DEPENDENCIES for the active product's features.
  //
  // This is the real model for "what data do we capture about this feature" — a
  // dependency like "Serial Number" / "Firmware" becomes one capture field. Previously
  // buildAutoSteps() never received these (it only got Feature.captureFields, which is an
  // empty-by-default hand-maintained list, and ProductFeatureDefinition.subProperties), so
  // an inventory feature WITH dependencies but WITHOUT captureFields generated a Data
  // Collection step with ZERO capture fields — no text boxes to record serial/firmware.
  const [libFeatureDeps, setLibFeatureDeps] = useState<Record<string, FeatureDependency[]>>({});
  const libFeatureDepsRef = useRef<Record<string, FeatureDependency[]>>({});
  libFeatureDepsRef.current = libFeatureDeps;

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    featureService.getByProduct(productId).then(async (feats) => {
      if (cancelled) return;
      setLibFeatures(feats);
      const lists = await Promise.all(
        feats.map((f) =>
          featureDependencyService.getByFeature(f.id).catch(() => [] as FeatureDependency[]),
        ),
      );
      if (cancelled) return;
      const map: Record<string, FeatureDependency[]> = {};
      feats.forEach((f, i) => { map[f.id] = lists[i] ?? []; });
      setLibFeatureDeps(map);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [productId]);

  useEffect(() => {
    workflowTypeService.list().then(setWorkflowTypes).catch(() => {});
  }, []);

  // Feature selections — managed in the builder (not just the publish dialog)
  const [featureSelections, setFeatureSelections] = useState<FeatureSelection[]>(() =>
    productFeatures.map((f) => ({ featureId: f.id, included: false, activeCount: 0 }))
  );
  const featureSelectionsRef = useRef<FeatureSelection[]>(featureSelections);
  featureSelectionsRef.current = featureSelections;
  const featureSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setFeatureSelections((prev) => {
      if (productFeatures.length === 0) return prev;
      const prevMap = new Map(prev.map((sel) => [sel.featureId, sel]));
      const merged = productFeatures.map((feature) => prevMap.get(feature.id) ?? { featureId: feature.id, included: false, activeCount: 0 });
      const unchanged =
        merged.length === prev.length &&
        merged.every((sel, idx) => {
          const current = prev[idx];
          return current && current.featureId === sel.featureId && current.included === sel.included && current.activeCount === sel.activeCount;
        });
      return unchanged ? prev : merged;
    });
  }, [productFeatures]);

  const [publishSaving, setPublishSaving] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishForm, setPublishForm] = useState<PublishForm>({ name: "", configType: "", workflowTypeId: "", notes: "", featureSelections: [] });
  const [workflowTypes, setWorkflowTypes] = useState<WorkflowType[]>([]);
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
          // Restore feature selections
          let parsedSels: FeatureSelection[] = [];
          try {
            const sels = JSON.parse(cfg.featureSelectionsJson) as FeatureSelection[];
            parsedSels = sels;
            const selMap = new Map(sels.map((s) => [s.featureId, s]));
            setFeatureSelections(productFeatures.map((f) =>
              selMap.get(f.id) ?? { featureId: f.id, included: false, activeCount: 0 }
            ));
          } catch {}
          // Auto-populate steps when config is brand new (empty)
          if (wf.steps.length === 0 && parsedSels.some((s) => s.activeCount > 0)) {
            const autoSteps = buildAutoSteps(parsedSels, productFeaturesRef.current, libFeaturesRef.current, libFeatureDepsRef.current);
            wf = { ...wf, steps: enforceSequentialNextSteps(normalizeOrders(autoSteps)) };
          }
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
  const isMobile = isMobileNativePlatform();

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

  // Debounced save for feature selections (separate from workflow steps)
  useEffect(() => {
    const activeConfigId = resolvedConfigIdRef.current ?? initialConfigId;
    if (!activeConfigId) return;
    if (currentConfig?.status === "Published" || currentConfig?.status === "Archived") return;
    if (featureSaveTimerRef.current) clearTimeout(featureSaveTimerRef.current);
    featureSaveTimerRef.current = setTimeout(async () => {
      try {
        await workflowConfigService.update(activeConfigId, {
          featureSelectionsJson: JSON.stringify(featureSelections),
        });
      } catch { /* silent */ }
    }, 800);
    return () => { if (featureSaveTimerRef.current) clearTimeout(featureSaveTimerRef.current); };
  }, [featureSelections]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedStep = useMemo(
    () => workflow.steps.find((s) => s.id === selectedStepId) || null,
    [workflow.steps, selectedStepId]
  );

  const reachable = useMemo(() => computeReachability(workflow), [workflow]);

  // Step type confirm dialog state
  const [stepTypeConfirm, setStepTypeConfirm] = useState<{
    stepId: string; type: StepType; featureId: string; unitIndex: number;
  } | null>(null);

  // Generic confirm dialog
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);

  function getTemplateFeatureDeps(featureId: string) {
    const libDeps = libFeatureDepsRef.current[featureId] ?? [];
    if (libDeps.length > 0) {
      return libDeps.map((dep) => ({
        id: dep.id,
        name: dep.name,
        valueType: "text",
        isInventory: dep.isInventory,
        unit: dep.unit,
      }));
    }
    return productFeatures.find((feature) => feature.id === featureId)?.subProperties ?? [];
  }

  // Build a step patch from a type template
  function buildStepTemplate(type: StepType, featureId: string, unitIndex: number, selectedDepIds?: string[]): Partial<WorkflowStep> {
    const feat = productFeatures.find((f) => f.id === featureId);
    const featName = feat?.name ?? "Unit";
    const allDeps = getTemplateFeatureDeps(featureId);
    const deps = selectedDepIds ? allDeps.filter((d) => selectedDepIds.includes(d.id)) : allDeps;
    const u = uid;
    const mkCheck = (label: string, fid?: string): StepInput =>
      ({ id: u(), type: "checkbox", label, required: true, ...(fid ? { featureId: fid } : {}) });

    switch (type) {
      case "preparation":
        return {
          stepType: type, stepFeatureId: undefined, stepUnitIndex: undefined,
          title: "Preparation & Permits",
          description: "Verify site readiness and obtain all required permits before commencing work. Inspect the work area for hazards, confirm access arrangements, document pre-existing conditions with photographs, and ensure all tools and materials are on site and accounted for.",
          inputs: [
            mkCheck("Work area is clear and safe"),
            mkCheck("Permits and authorizations obtained"),
            { id: u(), type: "photo", label: "Pre-installation site photo", required: true },
            mkCheck("Tools and materials verified on site"),
          ],
          captureFields: [],
        };

      case "installation":
        return {
          stepType: type, stepFeatureId: featureId || undefined, stepUnitIndex: unitIndex,
          title: featureId ? `${featName} ${unitIndex} — Installation` : "Installation",
          description: featureId
            ? `Install ${featName} ${unitIndex} per manufacturer specifications and project drawings. Follow safe work practices and applicable torque specifications. Verify all mechanical and electrical connections are secure. Record any deviations from the installation plan before proceeding.`
            : "Install equipment per manufacturer specifications and project drawings. Follow safe work practices and applicable torque specifications. Verify all mechanical and electrical connections are secure. Record any deviations before proceeding.",
          inputs: [
            ...deps.map((dep) => mkCheck(`${dep.name} installed and connected`, featureId || undefined)),
            mkCheck(featureId ? `${featName} ${unitIndex} — Installation complete and verified` : "Installation complete and verified"),
          ],
          captureFields: [],
        };

      case "data-collection":
        return {
          stepType: type, stepFeatureId: featureId || undefined, stepUnitIndex: unitIndex,
          title: featureId ? `${featName} ${unitIndex} — Data Collection` : "Data Collection",
          description: featureId
            ? `Record all required technical data for ${featName} ${unitIndex}. Capture serial numbers, model numbers, firmware versions and measured values. Photograph the installed unit showing nameplate and installed condition. Ensure all fields are completed accurately as this forms the as-built record.`
            : "Record all required technical data for the installed equipment. Capture serial numbers, model numbers, firmware versions and measured values. Photograph installed units and ensure all fields are completed accurately as this forms the as-built record.",
          inputs: [
            { id: u(), type: "photo", label: featureId ? `${featName} ${unitIndex} — Installed unit photograph` : "Installed unit photograph", required: true, featureId: featureId || undefined },
          ],
          captureFields: deps.map((dep) => ({
            id: u(),
            key: labelToKey(featureId ? `${featName}_${unitIndex}_${dep.name}` : dep.name),
            label: dep.name,
            type: ((dep.valueType as string) === "number" ? "number" : (dep.valueType as string) === "date" ? "date" : "text") as CaptureFieldType,
            required: true,
            featureId: featureId || undefined,
          })),
        };

      case "test-acceptance":
        return {
          stepType: type, stepFeatureId: undefined, stepUnitIndex: undefined,
          title: "Test & Acceptance",
          description: "Perform functional testing of all installed equipment per the acceptance test procedure. Verify each unit operates within specified parameters. Record test results and note any deficiencies. All items must pass before proceeding to final inspection.",
          inputs: [
            mkCheck("All installed equipment — Functional test passed"),
            mkCheck("System operates within specified parameters"),
            mkCheck("Test results documented"),
          ],
          captureFields: [],
        };

      case "final-inspection": {
        const boxes: StepInput[] = [];
        featureSelections.filter((s) => s.activeCount > 0).forEach((sel) => {
          const f = productFeatures.find((pf) => pf.id === sel.featureId);
          if (!f) return;
          for (let i = 1; i <= sel.activeCount; i++)
            boxes.push(mkCheck(`${f.name} ${i} — Final inspection passed`));
        });
        if (boxes.length === 0) boxes.push(mkCheck("All equipment — Final inspection passed"));
        return {
          stepType: type, stepFeatureId: undefined, stepUnitIndex: undefined,
          title: "Final Inspection",
          description: "Conduct a comprehensive final inspection of all installed equipment and the surrounding work area. Verify all units are correctly labelled, secured and connected. Confirm the site is clean, all temporary works are removed and the installation meets the required quality standards.",
          inputs: boxes, captureFields: [],
        };
      }

      case "return-to-service":
        return {
          stepType: type, stepFeatureId: undefined, stepUnitIndex: undefined,
          title: "Return to Service",
          description: "Complete all documentation and formally return the asset to operational service. Notify relevant stakeholders of completion, hand over as-built records and operational instructions. Confirm the system is live and operating normally before closing out the work order.",
          inputs: [
            mkCheck("All documentation completed"),
            mkCheck("Stakeholders notified of completion"),
            mkCheck("System confirmed operational"),
            mkCheck("Work order ready to close"),
          ],
          captureFields: [],
        };

      default: // custom
        return { stepType: "custom" };
    }
  }

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
    const activeTypeName = workflowTypes.find((t) => t.id === (workflow.workflowTypeId ?? publishForm.workflowTypeId))?.name;
    updateWorkflow((wf) => {
      const step = wf.steps.find((s) => s.id === stepId);
      if (!step) return wf;
      step.inputs = step.inputs || [];
      step.inputs.push({
        id: uid(),
        type,
        label: label ?? defaultLabelForInput(type, activeTypeName),
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

  // Capture fields
  function addCaptureField(stepId: string) {
    updateWorkflow((wf) => {
      const step = wf.steps.find((s) => s.id === stepId);
      if (!step) return wf;
      step.captureFields = step.captureFields || [];
      step.captureFields.push({
        id: uid(),
        key: "",
        label: "",
        type: "text",
        required: false,
      });
      return wf;
    });
  }

  function updateCaptureField(stepId: string, fieldId: string, patch: Partial<CaptureField>) {
    updateWorkflow((wf) => {
      const step = wf.steps.find((s) => s.id === stepId);
      if (!step) return wf;
      step.captureFields = (step.captureFields || []).map((f) => (f.id === fieldId ? { ...f, ...patch } : f));
      return wf;
    });
  }

  function deleteCaptureField(stepId: string, fieldId: string) {
    updateWorkflow((wf) => {
      const step = wf.steps.find((s) => s.id === stepId);
      if (!step) return wf;
      step.captureFields = (step.captureFields || []).filter((f) => f.id !== fieldId);
      return wf;
    });
  }

  function addCaptureFieldsFromFeatures(stepId: string, features: ProductFeatureDefinition[]) {
    updateWorkflow((wf) => {
      const step = wf.steps.find((s) => s.id === stepId);
      if (!step) return wf;
      step.captureFields = step.captureFields || [];
      const existingKeys = new Set(step.captureFields.map((f) => f.key));
      features.forEach((feat) => {
        const key = labelToKey(feat.name);
        if (existingKeys.has(key)) return;
        const type: CaptureFieldType =
          feat.valueType === "number" ? "number" :
          feat.valueType === "date"   ? "date"   : "text";
        step.captureFields!.push({ id: uid(), key, label: feat.name, type, required: false, featureId: feat.id });
        existingKeys.add(key);
      });
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
    setPublishForm({
      name: currentConfig?.name ?? workflow.name,
      configType: currentConfig?.configType ?? "",
      workflowTypeId:
        currentConfig?.workflowTypeId ??
        workflow.workflowTypeId ??
        workflowTypes.find((type) => type.name === currentConfig?.configType)?.id ??
        "",
      notes: currentConfig?.notes ?? "",
      featureSelections, // already managed in builder state
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
      const selectedWorkflowType = workflowTypes.find((type) => type.id === publishForm.workflowTypeId);
      await workflowConfigService.update(cfgId, {
        name: publishForm.name.trim() || undefined,
        configType: (selectedWorkflowType?.name ?? publishForm.configType.trim()) || undefined,
        workflowTypeId: publishForm.workflowTypeId || undefined,
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

  async function handlePreviewRun() {
    const configId = currentConfig?.id ?? workflow.id;
    markWorkflowOpenTap("builder-preview", configId);
    if (currentConfig?.id) {
      const payload = await loadWorkflowOpenPayload(currentConfig.id, null, {
        configFromMemory: currentConfig,
        previewOnly: true,
      });
      if (payload) {
        setRunnerOpen(true);
        return;
      }
    }
    setRunnerOpen(true);
  }

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
          {onNewConfig && (
            <Button size="small" variant="outlined" startIcon={<AddOutlined />} onClick={onNewConfig}>
              New Work Instruction
            </Button>
          )}
          <Button
            size="small"
            variant="contained"
            color="success"
            startIcon={<PlayArrowOutlined />}
            onClick={() => { void handlePreviewRun(); }}
            disabled={stepsSorted.length === 0}
          >
            Run
          </Button>
          {canPublishWorkflow && currentConfig?.status !== "Published" && currentConfig?.status !== "Archived" && (
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
                setConfirmDialog({
                  message: "Reset to blank workflow? This will remove all current steps.",
                  onConfirm: () => {
                    importedRef.current = true;
                    setWorkflow(createDefaultWorkflow(productId, productName));
                  },
                });
              }}
            >
              Reset
            </Button>
          </Tooltip>
        </Stack>
      </Stack>

      {/* 3-column layout */}
      <Grid container spacing={2}>
        {/* Left: feature qty panel + step list */}
        <Grid item xs={12} md={3}>
          {productFeatures.length > 0 && (
            <Paper className="glass-card" sx={{ p: 1.5, mb: 1.5 }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary"
                sx={{ textTransform: "uppercase", letterSpacing: 0.8, display: "block", mb: 1 }}>
                Installed Features
              </Typography>
              <Stack spacing={0.75}>
                {productFeatures.map((feat) => {
                  const sel = featureSelections.find((s) => s.featureId === feat.id)
                    ?? { featureId: feat.id, included: false, activeCount: 0 };
                  return (
                    <Stack key={feat.id} direction="row" alignItems="center" spacing={1}>
                      <Typography variant="body2" sx={{ flexGrow: 1, fontSize: 13 }}>{feat.name}</Typography>
                      <Stack direction="row" alignItems="center" spacing={0.25}
                        sx={{ border: 1, borderColor: sel.activeCount > 0 ? "primary.main" : "divider", borderRadius: 1, px: 0.5, py: 0.25 }}>
                        <IconButton size="small" disabled={isReadOnly || sel.activeCount <= 0}
                          onClick={() => { const n = Math.max(0, sel.activeCount - 1); setFeatureSelections((p) => p.map((s) => s.featureId === feat.id ? { ...s, activeCount: n, included: n > 0 } : s)); }}
                          sx={{ p: 0.25 }}>
                          <RemoveOutlined sx={{ fontSize: 13 }} />
                        </IconButton>
                        <Typography variant="body2" fontWeight={700}
                          color={sel.activeCount > 0 ? "primary.main" : "text.disabled"}
                          sx={{ minWidth: 18, textAlign: "center", fontSize: 13 }}>
                          {sel.activeCount}
                        </Typography>
                        <IconButton size="small" disabled={isReadOnly}
                          onClick={() => setFeatureSelections((p) => p.map((s) => s.featureId === feat.id ? { ...s, activeCount: s.activeCount + 1, included: true } : s))}
                          sx={{ p: 0.25 }}>
                          <AddOutlined sx={{ fontSize: 13 }} />
                        </IconButton>
                      </Stack>
                    </Stack>
                  );
                })}
              </Stack>
              {!isReadOnly && (
                <Button
                  size="small"
                  variant="contained"
                  fullWidth
                  sx={{ mt: 1.5 }}
                  disabled={!featureSelections.some((s) => s.activeCount > 0)}
                  onClick={() => {
                    const hasSteps = workflow.steps.length > 0;
                    if (!hasSteps) {
                      const autoSteps = buildAutoSteps(featureSelections, productFeaturesRef.current, libFeaturesRef.current, libFeatureDepsRef.current);
                      importedRef.current = true;
                      updateWorkflow((wf) => { wf.steps = autoSteps; return wf; });
                      importedRef.current = false;
                      return;
                    }
                    setConfirmDialog({
                      message: "This will replace all current steps with a new auto-generated workflow. Continue?",
                      onConfirm: () => {
                        const autoSteps = buildAutoSteps(featureSelections, productFeaturesRef.current, libFeaturesRef.current, libFeatureDepsRef.current);
                        importedRef.current = true;
                        updateWorkflow((wf) => { wf.steps = autoSteps; return wf; });
                        importedRef.current = false;
                      },
                    });
                  }}
                >
                  {workflow.steps.length > 0 ? "Regenerate Workflow" : "Create Workflow"}
                </Button>
              )}
            </Paper>
          )}
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
        {isMobile && (
          <Grid item xs={12}>
            <MobileStepStrip
              stepsSorted={stepsSorted}
              selectedStepId={selectedStepId}
              onSelect={setSelectedStepId}
              onAdd={addStep}
            />
          </Grid>
        )}

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
              featureSelections={featureSelections}
              onApplyStepTemplate={(type, featureId, unitIndex, selectedDepIds) => {
                const step = workflow.steps.find((s) => s.id === selectedStep.id);
                const hasContent = step && (
                  (step.inputs?.length ?? 0) > 0 ||
                  (step.captureFields?.length ?? 0) > 0 ||
                  (step.title && step.title !== `Step ${step.order}`)
                );
                if (hasContent && type !== "custom") {
                  setStepTypeConfirm({ stepId: selectedStep.id, type, featureId: featureId ?? "", unitIndex: unitIndex ?? 1 });
                } else {
                  updateStep(selectedStep.id, buildStepTemplate(type, featureId ?? "", unitIndex ?? 1, selectedDepIds));
                }
              }}
              onStepChange={(patch) => updateStep(selectedStep.id, patch)}
              onAddDecision={() => addDecision(selectedStep.id)}
              onUpdateDecision={(dId, patch) => updateDecision(selectedStep.id, dId, patch)}
              onDeleteDecision={(dId) => deleteDecision(selectedStep.id, dId)}
              onAddInput={(type) => addInput(selectedStep.id, type)}
              onAddFeatureInput={(feat) => addInput(selectedStep.id, feat.type, feat.options, feat.featureId, feat.label, feat.subFields)}
              onUpdateInput={(iId, patch) => updateInput(selectedStep.id, iId, patch)}
              onDeleteInput={(iId) => deleteInput(selectedStep.id, iId)}
              onAddCaptureField={() => addCaptureField(selectedStep.id)}
              onUpdateCaptureField={(fId, patch) => updateCaptureField(selectedStep.id, fId, patch)}
              onDeleteCaptureField={(fId) => deleteCaptureField(selectedStep.id, fId)}
              libFeatures={libFeatures}
              depsByFeature={libFeatureDeps}
              onAddCaptureFieldsFromLib={(fieldNames) => {
                updateWorkflow((wf) => {
                  const s = wf.steps.find((x) => x.id === selectedStep.id);
                  if (!s) return wf;
                  s.captureFields = s.captureFields || [];
                  const existingKeys = new Set(s.captureFields.map((f) => f.key));
                  fieldNames.forEach((name) => {
                    const key = labelToKey(name);
                    if (existingKeys.has(key)) return;
                    s.captureFields!.push({ id: uid(), key, label: name, type: "text", required: true, featureId: s.stepFeatureId });
                    existingKeys.add(key);
                  });
                  return wf;
                });
              }}
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

        {/* Right: worker preview + BOM */}
        <Grid item xs={12} md={4}>
          <RightPanel
            workflow={workflow}
            stepsSorted={stepsSorted}
            selectedStepId={selectedStepId}
            onSelectStep={setSelectedStepId}
            isReadOnly={isReadOnly}
            onWorkflowUpdate={(wf) => { justLoadedRef.current = true; setWorkflow(wf); }}
            productFeatures={productFeatures}
            featureSelections={featureSelections}
            onFeatureSelectionsChange={setFeatureSelections}
            configId={currentConfig?.id ?? null}
          />
        </Grid>
      </Grid>

      <WorkOrderRunner
        open={runnerOpen}
        onClose={() => setRunnerOpen(false)}
        workflow={workflow}
        productId={productId}
        productName={productName}
        productFeatures={productFeatures}
        featureSelections={featureSelections}
      />

      {/* Step type overwrite confirmation dialog */}
      <Dialog open={!!stepTypeConfirm} onClose={() => setStepTypeConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Replace step content?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This will replace the current title, description, inputs and capture fields with the
            <strong> {stepTypeConfirm ? STEP_TYPE_LABELS[stepTypeConfirm.type] : ""}</strong> template.
            Your existing content will be lost.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStepTypeConfirm(null)}>Cancel</Button>
          <Button variant="contained" color="warning"
            onClick={() => {
              if (stepTypeConfirm) {
                updateStep(stepTypeConfirm.stepId, buildStepTemplate(stepTypeConfirm.type, stepTypeConfirm.featureId, stepTypeConfirm.unitIndex));
              }
              setStepTypeConfirm(null);
            }}>
            Replace
          </Button>
        </DialogActions>
      </Dialog>

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
            <FormControl fullWidth>
              <InputLabel shrink>Workflow Type</InputLabel>
              <Select
                label="Workflow Type"
                value={publishForm.workflowTypeId}
                onChange={(e) => {
                  const workflowTypeId = e.target.value;
                  const selected = workflowTypes.find((type) => type.id === workflowTypeId);
                  setPublishForm((p) => ({
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
            <Box>
              <Typography variant="body2" color="text.secondary">
                Product: <strong>{productName}</strong>
              </Typography>
            </Box>
            {productFeatures.length > 0 && (
              <Alert severity="info" sx={{ fontSize: 12 }}>
                Feature quantities are configured in the <strong>Features</strong> tab of the builder.
              </Alert>
            )}
            <TextField
              label="Description"
              value={publishForm.notes}
              onChange={(e) => setPublishForm((p) => ({ ...p, notes: e.target.value }))}
              fullWidth
              multiline
              rows={2}
              placeholder="Optional description or notes"
              InputLabelProps={{ shrink: true }}
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

      {/* Generic confirm dialog (replaces window.confirm) */}
      {confirmDialog && (
        <Dialog open onClose={() => setConfirmDialog(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Warning</DialogTitle>
          <DialogContent>
            <Typography variant="body2">{confirmDialog.message}</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmDialog(null)}>Cancel</Button>
            <Button
              variant="contained"
              color="warning"
              onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}
            >
              Continue
            </Button>
          </DialogActions>
        </Dialog>
      )}

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
// OptionsField — local string state so commas can be typed mid-word
// ------------------------------------------------------------------

function OptionsField({ options, onCommit }: { options: string[]; onCommit: (opts: string[]) => void }) {
  const [raw, setRaw] = React.useState((options || []).join(", "));
  React.useEffect(() => {
    setRaw((options || []).join(", "));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.join(",")]);
  return (
    <TextField
      label="Options (comma-separated)"
      size="small"
      fullWidth
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={() => onCommit(raw.split(",").map((x) => x.trim()).filter(Boolean))}
      placeholder="Option A, Option B, Option C"
      InputLabelProps={{ shrink: true }}
    />
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
  featureSelections?: FeatureSelection[];
  onApplyStepTemplate: (type: StepType, featureId?: string, unitIndex?: number, selectedDepIds?: string[]) => void;
  onStepChange: (patch: Partial<WorkflowStep>) => void;
  onAddDecision: () => void;
  onUpdateDecision: (id: string, patch: Partial<Decision>) => void;
  onDeleteDecision: (id: string) => void;
  onAddInput: (type: StepInputType) => void;
  onAddFeatureInput: (feat: { type: StepInputType; options?: string[]; featureId: string; label: string; subFields?: { id: string; name: string }[] }) => void;
  onUpdateInput: (id: string, patch: Partial<StepInput>) => void;
  onDeleteInput: (id: string) => void;
  onAddCaptureField: () => void;
  onUpdateCaptureField: (id: string, patch: Partial<CaptureField>) => void;
  onDeleteCaptureField: (id: string) => void;
  onAddCaptureFieldsFromLib: (fieldNames: string[]) => void;
  libFeatures: Feature[];
  depsByFeature?: Record<string, FeatureDependency[]>;
  onWorkflowUpdate: (wf: Workflow) => void;
}

function StepEditorPanel({
  step,
  stepsSorted,
  workflow,
  templateId,
  ensureConfigId,
  productFeatures,
  featureSelections,
  onApplyStepTemplate,
  onStepChange,
  onAddDecision,
  onUpdateDecision,
  onDeleteDecision,
  onAddInput,
  onAddFeatureInput,
  onUpdateInput,
  onDeleteInput,
  onAddCaptureField,
  onUpdateCaptureField,
  onDeleteCaptureField,
  onAddCaptureFieldsFromLib,
  libFeatures,
  depsByFeature,
  onWorkflowUpdate,
}: StepEditorPanelProps) {
  const [editorTab, setEditorTab] = useState(0);
  const [showReportText, setShowReportText] = useState(false);
  // Pending step type selection (before applying)
  const [pendingType, setPendingType] = useState<StepType | "">("");
  const [pendingFeatureId, setPendingFeatureId] = useState("");
  const [pendingUnit, setPendingUnit] = useState(1);

  // Reset pending when switching steps
  useEffect(() => { setPendingType(""); setPendingFeatureId(""); setPendingUnit(1); setSelectedDepIds(new Set()); }, [step.id]);

  useEffect(() => {
    setShowReportText(step.overrideInReport);
  }, [step.id, step.overrideInReport]);

  const includedFeatures = (featureSelections ?? [])
    .filter((s) => s.activeCount > 0)
    .map((s) => {
      const feat = productFeatures.find((f) => f.id === s.featureId);
      return feat ? { id: feat.id, name: feat.name, qty: s.activeCount } : null;
    })
    .filter(Boolean) as { id: string; name: string; qty: number }[];

  const needsFeaturePicker = pendingType === "installation" || pendingType === "data-collection";
  const maxUnits = includedFeatures.find((f) => f.id === pendingFeatureId)?.qty ?? 1;

  // For data-collection: which deps to include.
  // Memoized: this array is an effect dependency below, and a fresh identity on
  // every render would re-run that effect on every render — which, because the
  // effect also stores a brand-new Set, re-rendered forever. That render loop
  // starved React Router's (startTransition-wrapped) location update, so the
  // sidebar could no longer navigate away from the builder.
  const [selectedDepIds, setSelectedDepIds] = useState<Set<string>>(new Set());
  const pendingFeatureDeps = useMemo(
    () => (pendingType === "data-collection" && pendingFeatureId
      ? ((depsByFeature?.[pendingFeatureId] ?? []).length > 0
          ? (depsByFeature?.[pendingFeatureId] ?? []).map((dep) => ({
              id: dep.id,
              name: dep.name,
              valueType: "text",
              isInventory: dep.isInventory,
              unit: dep.unit,
            }))
          : (productFeatures.find((f) => f.id === pendingFeatureId)?.subProperties ?? []))
      : []),
    [pendingType, pendingFeatureId, depsByFeature, productFeatures],
  );

  // When feature changes in data-collection mode, select all deps by default.
  // Only replaces the Set when the membership actually differs — setState with a
  // new Set of identical contents is never an identity bail-out for React.
  useEffect(() => {
    const next = pendingType === "data-collection" && pendingFeatureId
      ? pendingFeatureDeps.map((d) => d.id)
      : [];
    setSelectedDepIds((prev) => {
      if (prev.size === next.length && next.every((id) => prev.has(id))) return prev;
      return new Set(next);
    });
  }, [pendingType, pendingFeatureId, pendingFeatureDeps]);

  function handleApply() {
    if (!pendingType) return;
    const depIds = pendingType === "data-collection" && pendingFeatureDeps.length > 0
      ? Array.from(selectedDepIds)
      : undefined;
    onApplyStepTemplate(pendingType as StepType, pendingFeatureId || undefined, pendingUnit, depIds);
    setPendingType("");
    setSelectedDepIds(new Set());
  }

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

        {/* Step type selector */}
        <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "action.hover" }}>
          <Stack spacing={1}>
            <Stack direction="row" alignItems="center" spacing={1}>
              {step.stepType && step.stepType !== "custom" && (
                <Chip size="small" color="primary" label={STEP_TYPE_LABELS[step.stepType]} sx={{ fontWeight: 600 }} />
              )}
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel shrink>Apply step template</InputLabel>
                <Select
                  label="Apply step template"
                  value={pendingType}
                  onChange={(e) => {
                    const t = e.target.value as StepType | "";
                    setPendingType(t);
                    setPendingFeatureId("");
                    setPendingUnit(1);
                  }}
                >
                  <MenuItem value=""><em>— choose type —</em></MenuItem>
                  {(Object.keys(STEP_TYPE_LABELS) as StepType[]).map((t) => (
                    <MenuItem key={t} value={t}>{STEP_TYPE_LABELS[t]}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
            {needsFeaturePicker && (
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <InputLabel shrink>Feature</InputLabel>
                  <Select label="Feature" value={pendingFeatureId} onChange={(e) => { setPendingFeatureId(e.target.value); setPendingUnit(1); }}>
                    <MenuItem value=""><em>No feature</em></MenuItem>
                    {includedFeatures.map((f) => (
                      <MenuItem key={f.id} value={f.id}>{f.name} ×{f.qty}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {pendingFeatureId && (
                  <FormControl size="small" sx={{ minWidth: 80 }}>
                    <InputLabel shrink>Unit #</InputLabel>
                    <Select label="Unit #" value={pendingUnit} onChange={(e) => setPendingUnit(Number(e.target.value))}>
                      {Array.from({ length: maxUnits }, (_, i) => i + 1).map((n) => (
                        <MenuItem key={n} value={n}>{n}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              </Stack>
            )}
            {/* Dep selector for data-collection steps */}
            {pendingType === "data-collection" && pendingFeatureId && pendingFeatureDeps.length > 0 && (
              <Stack spacing={0.5}>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  Select fields to collect:
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={0.5} useFlexGap>
                  {pendingFeatureDeps.map((dep) => {
                    const checked = selectedDepIds.has(dep.id);
                    return (
                      <Chip
                        key={dep.id}
                        label={dep.name}
                        size="small"
                        color={checked ? "primary" : "default"}
                        variant={checked ? "filled" : "outlined"}
                        onClick={() => setSelectedDepIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(dep.id)) next.delete(dep.id);
                          else next.add(dep.id);
                          return next;
                        })}
                        sx={{ cursor: "pointer" }}
                      />
                    );
                  })}
                </Stack>
                <Typography variant="caption" color="text.disabled">
                  {selectedDepIds.size} of {pendingFeatureDeps.length} selected — click to toggle
                </Typography>
              </Stack>
            )}
            {pendingType && (
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="contained" onClick={handleApply}
                  disabled={needsFeaturePicker && !pendingFeatureId && includedFeatures.length > 0}>
                  Apply template
                </Button>
                <Button size="small" onClick={() => { setPendingType(""); setSelectedDepIds(new Set()); }}>Cancel</Button>
              </Stack>
            )}
          </Stack>
        </Paper>

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
            <Tab label="Capture" />
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
              featureSelections={featureSelections}
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

          <TabPanel value={editorTab} index={3}>
            <CaptureFieldsSection
              step={step}
              productFeatures={productFeatures}
              featureSelections={featureSelections}
              libFeatures={libFeatures}
              depsByFeature={depsByFeature}
              onAddCaptureField={onAddCaptureField}
              onUpdateCaptureField={onUpdateCaptureField}
              onDeleteCaptureField={onDeleteCaptureField}
              onAddCaptureFieldsFromLib={onAddCaptureFieldsFromLib}
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
  { type: "user-select", label: "User select (project team)" },
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
  featureSelections,
  onAddInput,
  onAddFeatureInput,
  onUpdateInput,
  onDeleteInput,
}: {
  step: WorkflowStep;
  productFeatures: ProductFeatureDefinition[];
  featureSelections?: FeatureSelection[];
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
                    {inp.featureId && (() => {
                      const feat = productFeatures.find((f) => f.id === inp.featureId);
                      const sel = (featureSelections ?? []).find((s) => s.featureId === inp.featureId);
                      const qty = sel?.activeCount ?? 0;
                      return (
                        <Chip
                          size="small"
                          color={qty > 0 ? "primary" : "default"}
                          variant="outlined"
                          label={qty > 0 ? `${feat?.name ?? "Feature"} ×${qty}` : (feat?.name ?? "Feature")}
                          sx={{ height: 18, fontSize: 10 }}
                        />
                      );
                    })()}
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
                  <OptionsField
                    options={inp.options || []}
                    onCommit={(opts) => onUpdateInput(inp.id, { options: opts })}
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
            {false && productFeatures.length > 0 && (
              <>
                {productFeatures.map((feat) => {
                  const alreadyAdded = usedFeatureIds.has(feat.id);
                  const checked = selectedFeatIds.has(feat.id);
                  return (
                    <Stack key={feat.id} direction="row" spacing={0.5} alignItems="center" sx={{ opacity: alreadyAdded ? 0.5 : 1 }}>
                      <Checkbox size="small" disabled={alreadyAdded} checked={checked}
                        onChange={(e) => { setSelectedFeatIds((prev) => { const next = new Set(prev); if (e.target.checked) next.add(feat.id); else next.delete(feat.id); return next; }); }}
                        sx={{ p: 0.5 }} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" noWrap>{feat.name}</Typography>
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
// CaptureFieldsSection
// ------------------------------------------------------------------

/** Convert a human label to a camelCase machine key, e.g. "Serial Number" → "serialNumber" */
function labelToKey(label: string): string {
  const words = label.trim().replace(/[^a-zA-Z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "field";
  return words[0].toLowerCase() + words.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
}

/** Build the full standard step set from feature selections. Called when a new config is opened empty. */
function captureTypeForValueType(valueType?: string): CaptureFieldType {
  const v = (valueType ?? "").trim().toLowerCase();
  if (v === "number") return "number" as CaptureFieldType;
  if (v === "date") return "date" as CaptureFieldType;
  return "text" as CaptureFieldType;
}

function buildAutoSteps(
  featureSelections: FeatureSelection[],
  productFeatures: ProductFeatureDefinition[],
  libFeatures: Feature[] = [],
  depsByFeature: Record<string, FeatureDependency[]> = {},
): WorkflowStep[] {
  const u = uid;
  const mkCheck = (label: string, fid?: string): StepInput =>
    ({ id: u(), type: "checkbox", label, required: true, ...(fid ? { featureId: fid } : {}) });

  const libMap = new Map(libFeatures.map((f) => [f.id, f]));

  const steps: WorkflowStep[] = [];
  let order = 1;

  const base: Omit<WorkflowStep, "id" | "order" | "title" | "description" | "inputs" | "captureFields" | "stepType" | "stepFeatureId" | "stepUnitIndex"> = {
    overrideInReport: false, overrideReportText: "", includeDescriptionInReport: true,
    mediaIds: [], decisionsEnabled: false, decisions: [], nextStepId: null,
  };

  const activeFeatures = featureSelections
    .filter((s) => s.activeCount > 0)
    .flatMap((s) => {
      const feat = productFeatures.find((f) => f.id === s.featureId);
      return feat ? [{ sel: s, feat }] : [];
    });

  // 1 — Preparation & Permits
  steps.push({
    ...base, id: u(), order: order++,
    stepType: "preparation",
    title: "Preparation & Permits",
    description: "Verify site readiness and obtain all required permits before commencing work. Inspect the work area for hazards, confirm access arrangements, document pre-existing conditions with photographs, and ensure all tools and materials are on site and accounted for.",
    inputs: [
      mkCheck("Work area is clear and safe"),
      mkCheck("Permits and authorizations obtained"),
      { id: u(), type: "photo", label: "Pre-installation site photo", required: true },
      mkCheck("Tools and materials verified on site"),
    ],
    captureFields: [],
  });

  // 2 — Installation steps (one per feature × unit)
  for (const { sel, feat } of activeFeatures) {
    for (let unit = 1; unit <= sel.activeCount; unit++) {
      const deps = feat.subProperties ?? [];
      steps.push({
        ...base, id: u(), order: order++,
        stepType: "installation", stepFeatureId: feat.id, stepUnitIndex: unit,
        title: `${feat.name} ${unit} — Installation`,
        description: `Install ${feat.name} unit ${unit} per manufacturer specifications and project drawings. Follow safe work practices and applicable torque specifications. Verify all mechanical and electrical connections are secure. Record any deviations from the installation plan before proceeding.`,
        inputs: [
          ...deps.map((dep) => mkCheck(`${dep.name} installed and connected`, feat.id)),
          mkCheck(`${feat.name} ${unit} — Installation complete and verified`),
          { id: u(), type: "photo", label: `${feat.name} ${unit} — Installation photo`, required: true },
        ],
        captureFields: [],
      });
    }
  }

  // 3 — Data Collection steps (one per feature × unit)
  //
  // Capture fields come from the feature's DEPENDENCIES first — that is the real model for
  // "what do we record about this feature" (Serial Number, Firmware, MAC Address…). The two
  // legacy sources are kept as fallbacks for products configured the old way.
  //
  // Rule (per product owner):
  //   inventory feature WITH dependencies  -> one TEXT capture field per dependency
  //   inventory feature WITHOUT dependencies -> tick box only, no capture fields
  for (const { sel, feat } of activeFeatures) {
    for (let unit = 1; unit <= sel.activeCount; unit++) {
      const libFeat = libMap.get(feat.id);
      const deps = depsByFeature[feat.id] ?? [];

      // Dependency-typed capture fields (honour each dependency's valueType).
      const depCaptureFields = deps
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
        .map((dep) => ({
          id: u(),
          key: labelToKey(`${feat.name}_${unit}_${dep.name}`),
          label: dep.name,
          type: captureTypeForValueType((dep as unknown as { valueType?: string }).valueType),
          required: true,
          featureId: feat.id,
        }));

      // Fallbacks for products that never defined dependencies.
      const fallbackNames: string[] = libFeat?.captureFields && libFeat.captureFields.length > 0
        ? libFeat.captureFields
        : (feat.subProperties ?? []).map((d) => d.name);

      const captureFields = depCaptureFields.length > 0
        ? depCaptureFields
        : fallbackNames.map((fieldName) => ({
            id: u(),
            key: labelToKey(`${feat.name}_${unit}_${fieldName}`),
            label: fieldName,
            type: "text" as CaptureFieldType,
            required: true,
            featureId: feat.id,
          }));

      // No capture fields at all (inventory feature with no dependencies and no legacy
      // capture config) -> a tick box to confirm, rather than an empty data step.
      const confirmTick = captureFields.length === 0
        ? [mkCheck(`${feat.name} ${unit} — Data recorded / nothing to capture`, feat.id)]
        : [];

      steps.push({
        ...base, id: u(), order: order++,
        stepType: "data-collection", stepFeatureId: feat.id, stepUnitIndex: unit,
        title: `${feat.name} ${unit} — Data Collection`,
        description: `Record all required technical data for ${feat.name} ${unit}. Capture serial numbers, model numbers, firmware versions and measured values. Photograph the installed unit showing nameplate and installed condition. Ensure all fields are completed accurately as this forms the as-built record.`,
        inputs: [
          { id: u(), type: "photo", label: `${feat.name} ${unit} — Installed unit photograph`, required: true },
          ...confirmTick,
        ],
        captureFields,
      });
    }
  }

  // 4 — Test & Acceptance (global, not per feature)
  steps.push({
    ...base, id: u(), order: order++,
    stepType: "test-acceptance",
    title: "Test & Acceptance",
    description: "Perform functional testing of all installed equipment per the acceptance test procedure. Verify each unit operates within specified parameters. Record test results and note any deficiencies. All items must pass before proceeding to final inspection.",
    inputs: [
      mkCheck("All installed equipment — Functional test passed"),
      mkCheck("System operates within specified parameters"),
      mkCheck("Test results documented"),
      { id: u(), type: "photo", label: "Test results / readings photo", required: true },
    ],
    captureFields: [],
  });

  // 5 — Final Inspection
  const inspBoxes: StepInput[] = activeFeatures.flatMap(({ sel, feat }) =>
    Array.from({ length: sel.activeCount }, (_, i) => mkCheck(`${feat.name} ${i + 1} — Final inspection passed`))
  );
  if (inspBoxes.length === 0) inspBoxes.push(mkCheck("All equipment — Final inspection passed"));
  steps.push({
    ...base, id: u(), order: order++,
    stepType: "final-inspection",
    title: "Final Inspection",
    description: "Conduct a comprehensive final inspection of all installed equipment and the surrounding work area. Verify all units are correctly labelled, secured and connected. Confirm the site is clean, all temporary works are removed and the installation meets the required quality standards.",
    inputs: [...inspBoxes, { id: u(), type: "photo", label: "Final inspection photo", required: true }], captureFields: [],
  });

  // 6 — Return to Service
  steps.push({
    ...base, id: u(), order: order++,
    stepType: "return-to-service",
    title: "Return to Service",
    description: "Complete all documentation and formally return the asset to operational service. Notify relevant stakeholders of completion, hand over as-built records and operational instructions. Confirm the system is live and operating normally before closing out the work order.",
    inputs: [
      mkCheck("All documentation completed"),
      mkCheck("Stakeholders notified of completion"),
      mkCheck("System confirmed operational"),
      mkCheck("Work order ready to close"),
      { id: u(), type: "photo", label: "Site handover / completion photo", required: true },
    ],
    captureFields: [],
  });

  return steps;
}

const CAPTURE_FIELD_TYPES: { type: CaptureFieldType; label: string }[] = [
  { type: "text", label: "Text" },
  { type: "number", label: "Number" },
  { type: "scan", label: "Scan / QR" },
  { type: "date", label: "Date" },
];

function CaptureFieldsSection({
  step,
  productFeatures,
  featureSelections,
  libFeatures = [],
  onAddCaptureField,
  onUpdateCaptureField,
  onDeleteCaptureField,
  onAddCaptureFieldsFromLib,
  depsByFeature = {},
}: {
  step: WorkflowStep;
  productFeatures: ProductFeatureDefinition[];
  featureSelections?: FeatureSelection[];
  libFeatures?: Feature[];
  onAddCaptureField: () => void;
  onUpdateCaptureField: (id: string, patch: Partial<CaptureField>) => void;
  onDeleteCaptureField: (id: string) => void;
  onAddCaptureFieldsFromLib?: (fieldNames: string[]) => void;
  depsByFeature?: Record<string, FeatureDependency[]>;
}) {
  const fields = step.captureFields || [];

  // Quick-add chips. A feature's capture fields come from its DEPENDENCIES (the real model)
  // and fall back to the legacy Feature.captureFields list. Previously this required
  // captureFields to be non-empty, so inventory features that had dependencies but no
  // hand-maintained captureFields never appeared here at all.
  const captureNamesForFeature = (f: Feature): string[] => {
    const deps = depsByFeature[f.id] ?? [];
    if (deps.length > 0) {
      return deps
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
        .map((d) => d.name);
    }
    return f.captureFields ?? [];
  };
  const inventoryLibFeatures = libFeatures.filter(
    (f) => f.isInventory && captureNamesForFeature(f).length > 0,
  );

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={0.75}>
        <Typography variant="body2" color="text.secondary">
          Structured data captured into the as-built document.
        </Typography>
        <Stack direction="row" spacing={0.75}>
          <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={onAddCaptureField}>
            Add field
          </Button>
        </Stack>
      </Stack>

      {/* Quick-add from feature library */}
      {inventoryLibFeatures.length > 0 && (
        <Stack spacing={0.75}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            Add capture fields from inventory features:
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={0.75}>
            {inventoryLibFeatures.map((f) => (
              <Chip
                key={f.id}
                label={f.name}
                size="small"
                color="primary"
                variant="outlined"
                clickable
                onClick={() => onAddCaptureFieldsFromLib?.(captureNamesForFeature(f))}
                title={`Add: ${captureNamesForFeature(f).join(", ")}`}
              />
            ))}
          </Stack>
          <Typography variant="caption" color="text.disabled">
            Tap a feature to add its capture fields (serial, firmware, etc.) to this step.
          </Typography>
        </Stack>
      )}

      {fields.length === 0 ? (
        <Alert severity="info" sx={{ fontSize: 12 }}>
          No capture fields yet. Use the quick-add above or add fields manually.
        </Alert>
      ) : (
        <Stack spacing={1.5}>
          {fields.map((field) => (
            <Paper key={field.id} variant="outlined" sx={{ p: 1.5 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <Chip label={field.type.toUpperCase()} size="small" variant="outlined" color="secondary" />
                    {field.featureId && (() => {
                      const feat = productFeatures.find((f) => f.id === field.featureId);
                      const sel = (featureSelections ?? []).find((s) => s.featureId === field.featureId);
                      const qty = sel?.activeCount ?? 0;
                      return (
                        <Chip
                          size="small"
                          color={qty > 0 ? "primary" : "default"}
                          variant="outlined"
                          label={qty > 0 ? `${feat?.name ?? "Feature"} ×${qty}` : (feat?.name ?? "Feature")}
                          sx={{ height: 18, fontSize: 10 }}
                        />
                      );
                    })()}
                  </Stack>
                  <Tooltip title="Delete field">
                    <IconButton size="small" color="error" onClick={() => onDeleteCaptureField(field.id)}>
                      <DeleteOutline fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                  <TextField
                    label="Label"
                    size="small"
                    fullWidth
                    autoFocus
                    value={field.label}
                    onChange={(e) => {
                      const newLabel = e.target.value;
                      // Auto-sync key from label as long as key matches the previous auto-derived value
                      const autoKey = labelToKey(field.label);
                      const keyIsAuto = field.key === "" || field.key === autoKey;
                      onUpdateCaptureField(field.id, {
                        label: newLabel,
                        ...(keyIsAuto ? { key: labelToKey(newLabel) } : {}),
                      });
                    }}
                    placeholder="e.g. Serial Number"
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    label="Key (auto)"
                    size="small"
                    sx={{ minWidth: 160 }}
                    value={field.key}
                    onChange={(e) => onUpdateCaptureField(field.id, { key: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") })}
                    placeholder="serialNumber"
                    helperText="Auto-generated · edit to override"
                    InputLabelProps={{ shrink: true }}
                  />
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel shrink>Type</InputLabel>
                    <Select
                      label="Type"
                      value={field.type}
                      onChange={(e) => onUpdateCaptureField(field.id, { type: e.target.value as CaptureFieldType })}
                    >
                      {CAPTURE_FIELD_TYPES.map(({ type, label }) => (
                        <MenuItem key={type} value={type}>{label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField
                    label="Unit (optional)"
                    size="small"
                    sx={{ width: 110 }}
                    value={field.unit || ""}
                    onChange={(e) => onUpdateCaptureField(field.id, { unit: e.target.value || undefined })}
                    placeholder="dBm, V, °C"
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    label="Hint (optional)"
                    size="small"
                    fullWidth
                    value={field.hint || ""}
                    onChange={(e) => onUpdateCaptureField(field.id, { hint: e.target.value || undefined })}
                    placeholder="Placeholder hint for the technician"
                    InputLabelProps={{ shrink: true }}
                  />
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ flexShrink: 0 }}>
                    <Switch
                      size="small"
                      checked={field.required}
                      onChange={(e) => onUpdateCaptureField(field.id, { required: e.target.checked })}
                    />
                    <Typography variant="caption" sx={{ whiteSpace: "nowrap" }}>
                      {field.required ? "Required" : "Optional"}
                    </Typography>
                  </Stack>
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
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

function WorkerPreviewPanel({
  workflow,
  stepsSorted,
  selectedStepId,
  onSelectStep,
}: {
  workflow: Workflow;
  stepsSorted: WorkflowStep[];
  selectedStepId: string | null;
  onSelectStep: (stepId: string | null) => void;
}) {
  const [history, setHistory] = useState<string[]>([]);
  const currentStepId = selectedStepId && workflow.steps.some((s) => s.id === selectedStepId)
    ? selectedStepId
    : (stepsSorted[0]?.id || null);
  const step = stepsSorted.find((s) => s.id === currentStepId) || null;

  function goTo(stepId: string | null) {
    if (!stepId) return;
    setHistory((prev) => (currentStepId ? [...prev, currentStepId] : prev));
    onSelectStep(stepId);
  }

  function goBack() {
    setHistory((prev) => {
      if (!prev.length) return prev;
      onSelectStep(prev[prev.length - 1]);
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
                onClick={() => {
                  setHistory([]);
                  onSelectStep(stepsSorted[0]?.id || null);
                }}
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
// RightPanel — Preview tab + BOM tab
// ------------------------------------------------------------------

const uid2 = () => randomId();

function RightPanel({ workflow, stepsSorted, selectedStepId, onSelectStep, isReadOnly, onWorkflowUpdate, productFeatures, featureSelections, onFeatureSelectionsChange, configId }: {
  workflow: Workflow;
  stepsSorted: WorkflowStep[];
  selectedStepId: string | null;
  onSelectStep: (stepId: string | null) => void;
  isReadOnly: boolean;
  onWorkflowUpdate: (wf: Workflow) => void;
  productFeatures?: ProductFeatureDefinition[];
  featureSelections?: FeatureSelection[];
  onFeatureSelectionsChange?: (sels: FeatureSelection[]) => void;
  /** Active WorkflowConfig id — enables BOM step inclusion management. */
  configId?: string | null;
}) {
  const [tab, setTab] = React.useState(0);
  const features = productFeatures ?? [];
  const sels = featureSelections ?? [];
  const includedCount = sels.filter((s) => s.activeCount > 0).length;

  // ── BOM Step Inclusion state ───────────────────────────────────────────────
  const [configFeatures, setConfigFeatures] = React.useState<WorkflowConfigFeature[]>([]);
  const [cfLoading, setCfLoading] = React.useState(false);
  const [featureDeps, setFeatureDeps] = React.useState<Record<string, FeatureDependency[]>>({});
  const [depsLoadingMap, setDepsLoadingMap] = React.useState<Record<string, boolean>>({});
  const [cfSaving, setCfSaving] = React.useState<Record<string, boolean>>({});

  // Load WorkflowConfigFeature rows when Features tab opens with a configId
  React.useEffect(() => {
    if (tab !== 2 || !configId) return;
    setCfLoading(true);
    workflowConfigFeatureService.getByConfig(configId)
      .then((data) => { setConfigFeatures(data); })
      .catch(() => {})
      .finally(() => setCfLoading(false));
  }, [tab, configId]);

  async function ensureFeatureDeps(featureId: string) {
    if (featureDeps[featureId] !== undefined || depsLoadingMap[featureId]) return;
    setDepsLoadingMap((prev) => ({ ...prev, [featureId]: true }));
    try {
      const data = await featureDependencyService.getByFeature(featureId);
      setFeatureDeps((prev) => ({ ...prev, [featureId]: data }));
    } catch { /* ignore */ } finally {
      setDepsLoadingMap((prev) => ({ ...prev, [featureId]: false }));
    }
  }

  async function syncConfigFeature(featureId: string, qty: number, inclusionsJson?: string) {
    if (!configId || isReadOnly) return;
    const existing = configFeatures.find((cf) => cf.featureId === featureId);
    try {
      const result = await workflowConfigFeatureService.upsert({
        workflowConfigId: configId,
        featureId,
        quantity: qty,
        inclusionsJson: inclusionsJson ?? existing?.inclusionsJson ?? "{}",
        sortOrder: existing?.sortOrder ?? 0,
      });
      setConfigFeatures((prev) => {
        const idx = prev.findIndex((cf) => cf.featureId === featureId);
        return idx >= 0 ? prev.map((cf, i) => (i === idx ? result : cf)) : [...prev, result];
      });
    } catch { /* ignore */ }
  }

  async function toggleInclusion(featureId: string, depId: string, included: boolean) {
    if (!configId || isReadOnly) return;
    const existing = configFeatures.find((cf) => cf.featureId === featureId);
    const inclusions: Record<string, boolean> = existing?.inclusionsJson
      ? JSON.parse(existing.inclusionsJson)
      : {};
    inclusions[depId] = included;
    const inclusionsJson = JSON.stringify(inclusions);
    const qty = existing?.quantity ?? (sels.find((s) => s.featureId === featureId)?.activeCount ?? 1);
    setCfSaving((prev) => ({ ...prev, [featureId]: true }));
    try {
      await syncConfigFeature(featureId, qty, inclusionsJson);
    } finally {
      setCfSaving((prev) => ({ ...prev, [featureId]: false }));
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  function updateSel(featureId: string, patch: Partial<FeatureSelection>) {
    onFeatureSelectionsChange?.(sels.map((s) => s.featureId === featureId ? { ...s, ...patch } : s));
    // Also sync qty to WorkflowConfigFeature table
    if (patch.activeCount !== undefined && configId && !isReadOnly) {
      void syncConfigFeature(featureId, patch.activeCount);
      if (patch.activeCount > 0) void ensureFeatureDeps(featureId);
    }
  }

  function updateBom(fn: (items: import("../../types/workflow").BomItem[]) => import("../../types/workflow").BomItem[]) {
    const next = JSON.parse(JSON.stringify(workflow)) as Workflow;
    next.bomItems = fn(next.bomItems ?? []);
    onWorkflowUpdate(next);
  }

  const bomItems = workflow.bomItems ?? [];

  return (
    <Stack spacing={0}>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ mb: 1 }}>
        <Tab label="Preview" />
        <Tab label={`BOM${bomItems.length ? ` (${bomItems.length})` : ""}`} />
        {features.length > 0 && <Tab label={`Features${includedCount > 0 ? ` (${includedCount})` : ""}`} />}
      </Tabs>

      {tab === 0 && (
        <WorkerPreviewPanel
          workflow={workflow}
          stepsSorted={stepsSorted}
          selectedStepId={selectedStepId}
          onSelectStep={onSelectStep}
        />
      )}

      {tab === 1 && (
        <Paper className="glass-card" sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">
                Expected parts for this workflow.
              </Typography>
              {!isReadOnly && (
                <Button size="small" variant="contained" startIcon={<AddOutlined />}
                  onClick={() => updateBom((items) => [...items, {
                    id: uid2(), description: "", partNumber: "", isInventory: false,
                    expectedQty: 1, unitOfMeasure: "ea", notes: "",
                  }])}>
                  Add item
                </Button>
              )}
            </Stack>

            {bomItems.length === 0 ? (
              <Alert severity="info" sx={{ fontSize: 12 }}>
                No BOM items yet. Add inventory parts (tracked by serial) or consumables (tracked by qty).
              </Alert>
            ) : (
              <Stack spacing={1.5}>
                {bomItems.map((item) => (
                  <Paper key={item.id} variant="outlined" sx={{ p: 1.5 }}>
                    <Stack spacing={1.5}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Chip
                          label={item.isInventory ? "Inventory" : "Consumable"}
                          size="small"
                          color={item.isInventory ? "primary" : "default"}
                          variant="outlined"
                        />
                        {!isReadOnly && (
                          <IconButton size="small" color="error"
                            onClick={() => updateBom((items) => items.filter((i) => i.id !== item.id))}>
                            <DeleteOutline fontSize="small" />
                          </IconButton>
                        )}
                      </Stack>
                      <TextField
                        label="Description"
                        size="small"
                        fullWidth
                        disabled={isReadOnly}
                        value={item.description}
                        onChange={(e) => updateBom((items) => items.map((i) => i.id === item.id ? { ...i, description: e.target.value } : i))}
                        placeholder="e.g. IP Camera, BNC Cable"
                        InputLabelProps={{ shrink: true }}
                      />
                      <Stack direction="row" spacing={1}>
                        <TextField
                          label="Part No."
                          size="small"
                          sx={{ flex: 1 }}
                          disabled={isReadOnly}
                          value={item.partNumber || ""}
                          onChange={(e) => updateBom((items) => items.map((i) => i.id === item.id ? { ...i, partNumber: e.target.value } : i))}
                          placeholder="SKU / part number"
                          InputLabelProps={{ shrink: true }}
                        />
                        <TextField
                          label="Qty"
                          size="small"
                          type="number"
                          sx={{ width: 70 }}
                          disabled={isReadOnly}
                          value={item.expectedQty}
                          onChange={(e) => updateBom((items) => items.map((i) => i.id === item.id ? { ...i, expectedQty: Number(e.target.value) || 1 } : i))}
                        />
                        <TextField
                          label="UOM"
                          size="small"
                          sx={{ width: 70 }}
                          disabled={isReadOnly}
                          value={item.unitOfMeasure}
                          onChange={(e) => updateBom((items) => items.map((i) => i.id === item.id ? { ...i, unitOfMeasure: e.target.value } : i))}
                          placeholder="ea"
                          InputLabelProps={{ shrink: true }}
                        />
                      </Stack>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Switch
                          size="small"
                          disabled={isReadOnly}
                          checked={item.isInventory}
                          onChange={(e) => updateBom((items) => items.map((i) => i.id === item.id ? { ...i, isInventory: e.target.checked } : i))}
                        />
                        <Typography variant="caption">
                          {item.isInventory ? "Tracked — capture serial per unit" : "Consumable — confirm qty only"}
                        </Typography>
                      </Stack>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}
          </Stack>
        </Paper>
      )}

      {tab === 2 && features.length > 0 && (
        <Paper className="glass-card" sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">
                Set quantities and choose which dependencies generate steps on publish.
              </Typography>
              {cfLoading && <CircularProgress size={14} />}
            </Stack>
            <Stack spacing={1}>
              {features.map((feat) => {
                const sel = sels.find((s) => s.featureId === feat.id) ?? { featureId: feat.id, included: false, activeCount: 0 };
                const cfRow = configFeatures.find((cf) => cf.featureId === feat.id);
                const inclusions: Record<string, boolean> = cfRow?.inclusionsJson
                  ? (() => { try { return JSON.parse(cfRow.inclusionsJson); } catch { return {}; } })()
                  : {};
                const deps = featureDeps[feat.id];
                const includedDepCount = deps ? deps.filter((d) => inclusions[d.id]).length : 0;

                return (
                  <Paper
                    key={feat.id}
                    variant="outlined"
                    sx={{ p: 1.5, borderColor: sel.activeCount > 0 ? "primary.main" : "divider", opacity: sel.activeCount === 0 ? 0.6 : 1 }}
                  >
                    <Stack direction="row" alignItems="center" spacing={1.5}>
                      <Typography variant="body2" sx={{ flexGrow: 1 }}>{feat.name}</Typography>
                      {/* Qty stepper — 0 = not included in this config */}
                      <Stack direction="row" alignItems="center" spacing={0.5}
                        sx={{ border: 1, borderColor: sel.activeCount > 0 ? "primary.main" : "divider", borderRadius: 1, px: 0.5, py: 0.25, flexShrink: 0 }}>
                        <IconButton
                          size="small"
                          disabled={isReadOnly || sel.activeCount <= 0}
                          onClick={() => {
                            const next = Math.max(0, sel.activeCount - 1);
                            updateSel(feat.id, { activeCount: next, included: next > 0 });
                          }}
                          sx={{ p: 0.25 }}
                        >
                          <RemoveOutlined sx={{ fontSize: 14 }} />
                        </IconButton>
                        <Typography
                          variant="body2"
                          fontWeight={600}
                          color={sel.activeCount > 0 ? "primary" : "text.disabled"}
                          sx={{ minWidth: 20, textAlign: "center" }}
                        >
                          {sel.activeCount}
                        </Typography>
                        <IconButton
                          size="small"
                          disabled={isReadOnly}
                          onClick={() => {
                            updateSel(feat.id, { activeCount: sel.activeCount + 1, included: true });
                            void ensureFeatureDeps(feat.id);
                          }}
                          sx={{ p: 0.25 }}
                        >
                          <AddOutlined sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Stack>
                    </Stack>

                    {/* Sub-properties chips (backward compat) */}
                    {sel.activeCount > 0 && feat.subProperties && feat.subProperties.length > 0 && (
                      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1, pl: 0.5 }}>
                        {feat.subProperties.map((sp) => (
                          <Chip
                            key={sp.id}
                            size="small"
                            label={`${sp.name}${sp.unit ? ` (${sp.unit})` : ""}`}
                            color={sp.isInventory ? "primary" : "default"}
                            variant="outlined"
                            sx={{ fontSize: 10 }}
                          />
                        ))}
                      </Stack>
                    )}

                    {/* BOM step inclusion panel — only when qty > 0 and configId present */}
                    {sel.activeCount > 0 && configId && (
                      <Stack spacing={0.75} sx={{ mt: 1.5, pl: 0.5 }}>
                        <Stack direction="row" alignItems="center" justifyContent="space-between">
                          <Typography variant="caption" fontWeight={700} color="text.secondary">
                            BOM STEPS ON PUBLISH
                          </Typography>
                          {cfSaving[feat.id] && <CircularProgress size={12} />}
                        </Stack>

                        {depsLoadingMap[feat.id] ? (
                          <CircularProgress size={14} />
                        ) : !deps ? (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ cursor: "pointer", textDecoration: "underline" }}
                            onClick={() => ensureFeatureDeps(feat.id)}
                          >
                            Load dependencies…
                          </Typography>
                        ) : deps.length === 0 ? (
                          <Typography variant="caption" color="text.secondary">
                            No dependencies defined. Go to Settings → Features to add them.
                          </Typography>
                        ) : (
                          <>
                            <Stack spacing={0.5}>
                              {deps.map((dep) => (
                                <Stack key={dep.id} direction="row" alignItems="center" spacing={1}>
                                  <Checkbox
                                    size="small"
                                    disabled={isReadOnly}
                                    checked={!!inclusions[dep.id]}
                                    onChange={(e) => toggleInclusion(feat.id, dep.id, e.target.checked)}
                                    sx={{ p: 0.25 }}
                                  />
                                  <Typography variant="caption" sx={{ flexGrow: 1 }}>{dep.name}</Typography>
                                  <Chip
                                    size="small"
                                    label={dep.isInventory ? "Inventory" : "Non-inv."}
                                    color={dep.isInventory ? "primary" : "default"}
                                    variant="outlined"
                                    sx={{ fontSize: 9, height: 18 }}
                                  />
                                </Stack>
                              ))}
                            </Stack>
                            {includedDepCount > 0 && (
                              <Alert severity="success" sx={{ fontSize: 11, py: 0.25, mt: 0.5 }}>
                                Will generate {includedDepCount} BOM step{includedDepCount > 1 ? "s" : ""} on publish.
                              </Alert>
                            )}
                          </>
                        )}
                      </Stack>
                    )}
                  </Paper>
                );
              })}
            </Stack>
          </Stack>
        </Paper>
      )}
    </Stack>
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
          <QRUploadButton
            docType="workflow-media"
            linkedTo={templateId ?? "new"}
            label="Phone"
            onUploaded={() => {}}
            onUploadedWithData={async (_docId, dataUrl) => {
              const cfgId = await ensureConfigId();
              if (!cfgId) { return; }
              // Convert base64 dataUrl to File
              const [meta, b64] = dataUrl.split(",");
              const mime = meta.match(/:(.*?);/)?.[1] ?? "image/jpeg";
              const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
              const file = new File([bytes], "phone-upload", { type: mime });
              setUploading(true);
              try {
                const updatedConfig = await workflowConfigService.uploadMedia(cfgId, file);
                const updatedMedia = (() => { try { return JSON.parse(updatedConfig.mediaJson); } catch { return []; } })();
                onWorkflowUpdate({ ...workflow, media: updatedMedia });
              } catch {
                setUploadError("Upload failed.");
              } finally {
                setUploading(false);
              }
            }}
            disabled={uploading}
          />
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
  if (inp.type === "user-select") return (
    <Stack direction="row" spacing={1} alignItems="center">
      <PersonOutlined fontSize="small" color="action" />
      <Typography variant="caption" color="text.secondary">Select from project team</Typography>
    </Stack>
  );
  return <Typography variant="caption" color="text.secondary">Unsupported input type</Typography>;
}

export default WorkflowBuilder;

