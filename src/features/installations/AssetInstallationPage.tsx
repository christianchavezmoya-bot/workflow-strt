import React, { useEffect, useMemo, useState } from "react";
import {
  AddOutlined,
  ArticleOutlined,
  CheckCircleOutlined,
  DeleteOutline,
  EditOutlined,
  ErrorOutlined,
  ExpandLessOutlined,
  ExpandMoreOutlined,
  HourglassEmptyOutlined,
  PlayArrowOutlined,
  RefreshOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { fetchProducts } from "../../store/productsSlice";
import { fetchProjects } from "../../store/projectSlice";
import { fetchUsers } from "../../store/usersSlice";
import { demoProducts } from "../../data/demo";
import { projectAssetService } from "../../services/projectAssetService";
import { productConfigService, type ProductConfig } from "../../services/productConfigService";
import { workflowTemplateService } from "../../services/workflowTemplateService";
import type { ProjectAsset, ProjectAssetStatus } from "../../types/projectAsset";
import type { StepInput, Workflow } from "../../types/workflow";
import WorkOrderRunner from "../workInstructions/WorkOrderRunner";

// ------------------------------------------------------------------
// Status helpers
// ------------------------------------------------------------------

const STATUS_COLORS: Record<ProjectAssetStatus, "default" | "primary" | "success" | "error" | "warning"> = {
  NotStarted: "default",
  InProgress: "primary",
  Complete: "success",
  Issue: "error",
};

const STATUS_LABELS: Record<ProjectAssetStatus, string> = {
  NotStarted: "Not Started",
  InProgress: "In Progress",
  Complete: "Complete",
  Issue: "Issue",
};

// ------------------------------------------------------------------
// Health tracking
// ------------------------------------------------------------------

interface AssetHealth {
  total: number;
  notStarted: number;
  inProgress: number;
  complete: number;
  issue: number;
  noWorkflow: number;
}

function computeHealth(list: ProjectAsset[]): AssetHealth {
  return {
    total: list.length,
    notStarted: list.filter((a) => a.status === "NotStarted").length,
    inProgress: list.filter((a) => a.status === "InProgress").length,
    complete: list.filter((a) => a.status === "Complete").length,
    issue: list.filter((a) => a.status === "Issue").length,
    noWorkflow: list.filter((a) => !a.workflowTemplateId).length,
  };
}

function tabDotColor(h: AssetHealth | undefined): string | null {
  if (!h || h.total === 0) return null;
  if (h.issue > 0) return "error.main";
  if (h.complete === h.total) return "success.main";
  return "warning.main";
}

// ------------------------------------------------------------------
// Asset form
// ------------------------------------------------------------------

interface AssetForm {
  projectId: string;
  configId: string;
  assetTag: string;
  serialNumber: string;
  location: string;
  assignedUserId: string;
  notes: string;
  featureValues: Record<string, string>;
}

const emptyForm = (): AssetForm => ({
  projectId: "",
  configId: "",
  assetTag: "",
  serialNumber: "",
  location: "",
  assignedUserId: "",
  notes: "",
  featureValues: {},
});

// ------------------------------------------------------------------
// Report generator
// ------------------------------------------------------------------

type FeatureDef = {
  id: string;
  name: string;
  valueType: string;
  subProperties?: { id: string; name: string }[];
};

function generateAssetReport(
  asset: ProjectAsset,
  cfg: ProductConfig | null | undefined,
  proj: { jobNumber: string; customerName: string } | undefined,
  tech: { fullName: string } | undefined,
  productName: string,
  features: FeatureDef[],
) {
  let fv: Record<string, string> = {};
  try { fv = JSON.parse(asset.featureValuesJson || "{}"); } catch {}

  const featureRows = features.map((feat, i) => {
    const raw = fv[feat.id];
    let displayVal = raw || "—";
    if (feat.valueType === "component" && feat.subProperties?.length && raw) {
      try {
        const sub: Record<string, string> = JSON.parse(raw);
        const parts = feat.subProperties
          .filter((sp) => sub[sp.id])
          .map((sp) => `${sp.name}: ${sub[sp.id]}`);
        displayVal = parts.length ? parts.join(", ") : "—";
      } catch {}
    }
    const bg = i % 2 === 0 ? "#f9f9f9" : "#fff";
    return `<tr style="background:${bg}">
      <td style="padding:5px 12px 5px 0;color:#555;font-size:12px;width:40%;font-weight:500">${feat.name}</td>
      <td style="padding:5px 0;font-size:12px">${displayVal}</td>
    </tr>`;
  }).join("");

  const html = `<html><head><title>Asset Report — ${asset.assetTag}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:32px;color:#1a1a1a}
      h2{margin:0;font-size:20px}h3{margin:4px 0 20px;color:#555;font-size:14px;font-weight:normal}
      table{width:100%;border-collapse:collapse}
      @media print{body{padding:0}}
    </style></head><body>
    <h2>Asset Installation Report</h2>
    <h3>Asset Tag: ${asset.assetTag}</h3>
    <div style="background:#1a73e8;color:#fff;padding:12px 16px;border-radius:6px 6px 0 0">
      <strong style="font-size:13px">${productName}</strong>
      ${cfg ? ` &nbsp;·&nbsp; ${cfg.name}` : ""}
      ${cfg?.configType ? ` &nbsp;·&nbsp; ${cfg.configType}` : ""}
    </div>
    <table style="border:1px solid #ddd;border-top:none;margin-bottom:20px">
      <tr><td style="padding:5px 12px 5px 8px;color:#555;font-size:12px;font-weight:500;border-bottom:1px solid #eee;width:40%">Serial Number</td><td style="font-size:12px;padding:5px 8px;border-bottom:1px solid #eee">${asset.serialNumber || "—"}</td></tr>
      <tr style="background:#f9f9f9"><td style="padding:5px 12px 5px 8px;color:#555;font-size:12px;font-weight:500;border-bottom:1px solid #eee">Project</td><td style="font-size:12px;padding:5px 8px;border-bottom:1px solid #eee">${proj ? `${proj.jobNumber} — ${proj.customerName}` : "—"}</td></tr>
      <tr><td style="padding:5px 12px 5px 8px;color:#555;font-size:12px;font-weight:500;border-bottom:1px solid #eee">Location</td><td style="font-size:12px;padding:5px 8px;border-bottom:1px solid #eee">${asset.location || "—"}</td></tr>
      <tr style="background:#f9f9f9"><td style="padding:5px 12px 5px 8px;color:#555;font-size:12px;font-weight:500;border-bottom:1px solid #eee">Assigned Technician</td><td style="font-size:12px;padding:5px 8px;border-bottom:1px solid #eee">${tech?.fullName || "—"}</td></tr>
      <tr><td style="padding:5px 12px 5px 8px;color:#555;font-size:12px;font-weight:500;${asset.notes ? "border-bottom:1px solid #eee" : ""}">Status</td><td style="font-size:12px;padding:5px 8px;${asset.notes ? "border-bottom:1px solid #eee" : ""}">${STATUS_LABELS[asset.status as ProjectAssetStatus] || asset.status}</td></tr>
      ${asset.notes ? `<tr style="background:#f9f9f9"><td style="padding:5px 12px 5px 8px;color:#555;font-size:12px;font-weight:500">Notes</td><td style="font-size:12px;padding:5px 8px">${asset.notes}</td></tr>` : ""}
    </table>
    ${featureRows ? `<h4 style="margin:20px 0 8px;font-size:13px">Feature Values</h4><table style="border:1px solid #ddd">${featureRows}</table>` : ""}
  </body></html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

const AssetInstallationPage = () => {
  const dispatch = useAppDispatch();
  const productsState = useAppSelector((s) => s.products);
  const projects = useAppSelector((s) => s.projects.items);
  const users = useAppSelector((s) => s.users.items);

  const [tab, setTab] = useState(0);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectAssetStatus | "All">("All");
  const [search, setSearch] = useState("");

  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [configs, setConfigs] = useState<ProductConfig[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [healthMap, setHealthMap] = useState<Record<string, AssetHealth>>({});

  const [expandedAssetId, setExpandedAssetId] = useState<string | null>(null);

  // Add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<AssetForm>(emptyForm());
  const [addError, setAddError] = useState<string | null>(null);
  const [addSaving, setAddSaving] = useState(false);
  const [configFeatureInputs, setConfigFeatureInputs] = useState<StepInput[]>([]);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editAsset, setEditAsset] = useState<ProjectAsset | null>(null);
  const [editForm, setEditForm] = useState<AssetForm>(emptyForm());
  const [editStatus, setEditStatus] = useState<ProjectAssetStatus>("NotStarted");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Delete
  const [deleteAsset, setDeleteAsset] = useState<ProjectAsset | null>(null);
  const [deletingAsset, setDeletingAsset] = useState(false);

  // Work order runner
  const [runnerOpen, setRunnerOpen] = useState(false);
  const [runnerAsset, setRunnerAsset] = useState<ProjectAsset | null>(null);
  const [runnerWorkflow, setRunnerWorkflow] = useState<Workflow | null>(null);
  const [runnerLoading, setRunnerLoading] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchProducts());
    dispatch(fetchProjects());
    dispatch(fetchUsers());
  }, [dispatch]);

  const products = useMemo(
    () => (productsState.items.length ? productsState.items : demoProducts),
    [productsState.items],
  );

  useEffect(() => {
    if (tab >= products.length) setTab(Math.max(0, products.length - 1));
  }, [tab, products.length]);

  const activeProduct = products[tab];
  const activeFeatures = useMemo(() => (activeProduct?.features ?? []) as FeatureDef[], [activeProduct]);

  useEffect(() => {
    if (!activeProduct?.id) { setAssets([]); setConfigs([]); return; }
    setLoadingAssets(true);
    Promise.all([
      projectAssetService.listByProduct(activeProduct.id),
      productConfigService.listByProduct(activeProduct.id),
    ]).then(([a, c]) => {
      setAssets(a);
      setConfigs(c);
      setHealthMap((prev) => ({ ...prev, [activeProduct.id]: computeHealth(a) }));
    }).finally(() => setLoadingAssets(false));
  }, [activeProduct?.id]);

  const refreshAssets = () => {
    if (!activeProduct?.id) return;
    projectAssetService.listByProduct(activeProduct.id).then((a) => {
      setAssets(a);
      setHealthMap((prev) => ({ ...prev, [activeProduct.id]: computeHealth(a) }));
    });
  };

  const selectedAddConfig = useMemo(
    () => configs.find((c) => c.id === addForm.configId) ?? null,
    [configs, addForm.configId],
  );

  useEffect(() => {
    if (!selectedAddConfig?.workflowTemplateId) { setConfigFeatureInputs([]); return; }
    workflowTemplateService.getById(selectedAddConfig.workflowTemplateId).then((wf) => {
      if (!wf) { setConfigFeatureInputs([]); return; }
      const seen = new Set<string>();
      const inputs: StepInput[] = [];
      for (const step of wf.steps) {
        for (const inp of step.inputs ?? []) {
          if (inp.featureId && !seen.has(inp.featureId)) {
            seen.add(inp.featureId);
            inputs.push(inp);
          }
        }
      }
      setConfigFeatureInputs(inputs);
    });
  }, [selectedAddConfig?.workflowTemplateId]);

  const visibleAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((a) => {
      if (selectedProjectId && a.projectId !== selectedProjectId) return false;
      if (statusFilter !== "All" && a.status !== statusFilter) return false;
      if (q && !([a.assetTag, a.serialNumber, a.location].some((f) => f?.toLowerCase().includes(q)))) return false;
      return true;
    });
  }, [assets, selectedProjectId, statusFilter, search]);

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const configMap = useMemo(() => new Map(configs.map((c) => [c.id, c])), [configs]);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  // ------------------------------------------------------------------
  // Add asset
  // ------------------------------------------------------------------

  function openAdd() {
    setAddForm(emptyForm());
    setAddError(null);
    setConfigFeatureInputs([]);
    setAddOpen(true);
  }

  async function saveAsset() {
    if (!activeProduct) return;
    const tag = addForm.assetTag.trim();
    if (!tag) { setAddError("Asset tag is required."); return; }
    if (!addForm.projectId) { setAddError("Select a project."); return; }
    setAddSaving(true);
    setAddError(null);
    try {
      await projectAssetService.create({
        projectId: addForm.projectId,
        productId: activeProduct.id,
        productConfigId: addForm.configId || undefined,
        workflowTemplateId: selectedAddConfig?.workflowTemplateId || undefined,
        assetTag: tag,
        serialNumber: addForm.serialNumber.trim() || undefined,
        location: addForm.location.trim() || undefined,
        assignedUserId: addForm.assignedUserId || undefined,
        notes: addForm.notes.trim() || undefined,
        featureValuesJson: Object.keys(addForm.featureValues).length
          ? JSON.stringify(addForm.featureValues)
          : undefined,
      });
      setAddOpen(false);
      refreshAssets();
    } catch {
      setAddError("Failed to create asset. Check your connection.");
    } finally {
      setAddSaving(false);
    }
  }

  // ------------------------------------------------------------------
  // Edit asset
  // ------------------------------------------------------------------

  function openEditAsset(asset: ProjectAsset) {
    let fv: Record<string, string> = {};
    try { fv = JSON.parse(asset.featureValuesJson || "{}"); } catch {}
    setEditAsset(asset);
    setEditForm({
      projectId: asset.projectId,
      configId: asset.productConfigId ?? "",
      assetTag: asset.assetTag,
      serialNumber: asset.serialNumber ?? "",
      location: asset.location ?? "",
      assignedUserId: asset.assignedUserId ?? "",
      notes: asset.notes ?? "",
      featureValues: fv,
    });
    setEditStatus(asset.status as ProjectAssetStatus);
    setEditError(null);
    setEditOpen(true);
  }

  async function saveEditAsset() {
    if (!editAsset) return;
    const tag = editForm.assetTag.trim();
    if (!tag) { setEditError("Asset tag is required."); return; }
    setEditSaving(true);
    setEditError(null);
    try {
      const updated = await projectAssetService.update(editAsset.id, {
        assetTag: tag,
        serialNumber: editForm.serialNumber.trim() || undefined,
        location: editForm.location.trim() || undefined,
        assignedUserId: editForm.assignedUserId || undefined,
        notes: editForm.notes.trim() || undefined,
        productConfigId: editForm.configId || undefined,
        status: editStatus,
        featureValuesJson: Object.keys(editForm.featureValues).length
          ? JSON.stringify(editForm.featureValues)
          : undefined,
      });
      setAssets((prev) => prev.map((a) => (a.id === editAsset.id ? updated : a)));
      setEditOpen(false);
      setEditAsset(null);
    } catch {
      setEditError("Failed to update asset.");
    } finally {
      setEditSaving(false);
    }
  }

  // ------------------------------------------------------------------
  // Delete asset
  // ------------------------------------------------------------------

  async function confirmDeleteAsset() {
    if (!deleteAsset) return;
    setDeletingAsset(true);
    try {
      await projectAssetService.remove(deleteAsset.id);
      setAssets((prev) => prev.filter((a) => a.id !== deleteAsset.id));
      setDeleteAsset(null);
    } catch {
      alert("Failed to delete asset.");
    } finally {
      setDeletingAsset(false);
    }
  }

  // ------------------------------------------------------------------
  // Work order runner
  // ------------------------------------------------------------------

  async function handleStartWorkOrder(asset: ProjectAsset) {
    if (!asset.workflowTemplateId) {
      alert("This asset has no workflow template linked. Assign a configuration with a workflow first.");
      return;
    }
    setRunnerLoading(asset.id);
    try {
      const wf = await workflowTemplateService.getById(asset.workflowTemplateId);
      if (!wf) { alert("Workflow template not found."); return; }
      setRunnerAsset(asset);
      setRunnerWorkflow(wf);
      setRunnerOpen(true);
    } catch {
      alert("Failed to load workflow.");
    } finally {
      setRunnerLoading(null);
    }
  }

  async function handleWorkOrderComplete(capturedValues: Record<string, string>) {
    // Sync captured feature values back to the asset record
    if (runnerAsset && Object.keys(capturedValues).length > 0) {
      let existing: Record<string, string> = {};
      try { existing = JSON.parse(runnerAsset.featureValuesJson || "{}"); } catch {}
      const merged = { ...existing, ...capturedValues };
      projectAssetService.update(runnerAsset.id, { featureValuesJson: JSON.stringify(merged) }).catch(console.warn);
    }
    refreshAssets();
  }

  function actionButton(asset: ProjectAsset) {
    const loading = runnerLoading === asset.id;
    if (!asset.workflowTemplateId) {
      return <Typography variant="caption" color="text.secondary">No workflow</Typography>;
    }
    if (asset.status === "NotStarted") {
      return (
        <Button size="small" variant="outlined" color="success"
          startIcon={loading ? <CircularProgress size={12} /> : <PlayArrowOutlined />}
          disabled={loading} onClick={() => handleStartWorkOrder(asset)}>
          Start
        </Button>
      );
    }
    if (asset.status === "InProgress") {
      return (
        <Button size="small" variant="contained" color="primary"
          startIcon={loading ? <CircularProgress size={12} /> : <PlayArrowOutlined />}
          disabled={loading} onClick={() => handleStartWorkOrder(asset)}>
          Continue
        </Button>
      );
    }
    if (asset.status === "Complete") {
      return (
        <Button size="small" variant="text" color="inherit" startIcon={<CheckCircleOutlined />}
          onClick={() => handleStartWorkOrder(asset)}>
          View
        </Button>
      );
    }
    return (
      <Button size="small" variant="outlined" color="error" startIcon={<ErrorOutlined />}
        onClick={() => handleStartWorkOrder(asset)}>
        Review
      </Button>
    );
  }

  // ------------------------------------------------------------------
  // Feature values display (expandable row)
  // ------------------------------------------------------------------

  function featureCompletenessChip(asset: ProjectAsset) {
    let fv: Record<string, string> = {};
    try { fv = JSON.parse(asset.featureValuesJson || "{}"); } catch {}
    const total = activeFeatures.length;

    if (total === 0) {
      const entries = Object.entries(fv).filter(([, v]) => {
        if (!v) return false;
        try { return Object.values(JSON.parse(v) as Record<string, string>).some(Boolean); } catch {}
        return true;
      });
      if (!entries.length) return <Typography variant="caption" color="text.disabled">—</Typography>;
      return <Chip size="small" label={`${entries.length} field${entries.length !== 1 ? "s" : ""}`} variant="outlined" />;
    }

    const filled = activeFeatures.filter((feat) => {
      const raw = fv[feat.id];
      if (!raw) return false;
      if (feat.valueType === "component") {
        try { return Object.values(JSON.parse(raw) as Record<string, string>).some(Boolean); } catch {}
        return false;
      }
      return true;
    }).length;

    const color = filled === total ? "success" : filled > 0 ? "warning" : "default";
    return (
      <Tooltip title={`${filled} of ${total} features filled`}>
        <Chip size="small" label={`${filled}/${total}`}
          color={color as "success" | "warning" | "default"}
          variant={filled === total ? "filled" : "outlined"} />
      </Tooltip>
    );
  }

  function renderFeatureExpandedRow(asset: ProjectAsset) {
    let fv: Record<string, string> = {};
    try { fv = JSON.parse(asset.featureValuesJson || "{}"); } catch {}

    if (activeFeatures.length === 0) {
      const entries = Object.entries(fv);
      if (!entries.length) {
        return <Typography variant="caption" color="text.secondary">No feature data recorded.</Typography>;
      }
      return (
        <Stack spacing={0.5}>
          {entries.map(([k, v]) => (
            <Stack key={k} direction="row" spacing={2}>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 120 }}>{k.slice(0, 20)}</Typography>
              <Typography variant="caption">{v}</Typography>
            </Stack>
          ))}
        </Stack>
      );
    }

    return (
      <Table size="small" sx={{ maxWidth: 680 }}>
        <TableHead>
          <TableRow sx={{ bgcolor: "rgba(255,255,255,0.06)" }}>
            <TableCell sx={{ fontWeight: 700, fontSize: 12, py: 0.75, width: "35%", color: "text.primary" }}>Feature</TableCell>
            <TableCell sx={{ fontWeight: 700, fontSize: 12, py: 0.75, color: "text.primary" }}>Value</TableCell>
            <TableCell sx={{ fontWeight: 700, fontSize: 12, py: 0.75, width: 60, color: "text.primary" }}>Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {activeFeatures.flatMap((feat) => {
            const raw = fv[feat.id];
            const isComponent = feat.valueType === "component" && (feat.subProperties ?? []).length > 0;
            let displayVal = "—";
            let filled = !!raw;

            if (raw && isComponent) {
              try {
                const sub: Record<string, string> = JSON.parse(raw);
                const parts = (feat.subProperties ?? []).map((sp) => sub[sp.id] ? `${sp.name}: ${sub[sp.id]}` : null).filter(Boolean);
                displayVal = parts.length ? `${parts.length} sub-field${parts.length !== 1 ? "s" : ""} filled` : "—";
                filled = parts.length > 0;
              } catch { filled = false; }
            } else if (raw) {
              displayVal = raw;
            }

            const parentRow = (
              <TableRow key={feat.id}>
                <TableCell sx={{ fontSize: 13, fontWeight: 600, py: 0.75, color: "text.primary" }}>{feat.name}</TableCell>
                <TableCell sx={{ fontSize: 13, py: 0.75, color: filled ? "text.primary" : "text.secondary", fontStyle: filled ? "normal" : "italic" }}>
                  {isComponent ? displayVal : (filled ? displayVal : "Not filled")}
                </TableCell>
                <TableCell sx={{ py: 0.75 }}>
                  <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: filled ? "success.main" : "grey.300" }} />
                </TableCell>
              </TableRow>
            );

            const subRows = isComponent && raw
              ? (() => {
                  try {
                    const sub: Record<string, string> = JSON.parse(raw);
                    return (feat.subProperties ?? []).map((sp) => (
                      <TableRow key={`${feat.id}-${sp.id}`} sx={{ bgcolor: "rgba(255,255,255,0.03)" }}>
                        <TableCell sx={{ fontSize: 12, pl: 3.5, color: "text.secondary", py: 0.5 }}>
                          ↳ {sp.name}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12, py: 0.5 }}>{sub[sp.id] || "—"}</TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: sub[sp.id] ? "success.main" : "grey.300" }} />
                        </TableCell>
                      </TableRow>
                    ));
                  } catch { return []; }
                })()
              : [];

            return [parentRow, ...subRows];
          })}
        </TableBody>
      </Table>
    );
  }

  // ------------------------------------------------------------------
  // Shared feature input renderer (add / edit dialogs)
  // ------------------------------------------------------------------

  function renderFeatureInputs(
    featureInputs: StepInput[],
    formValues: Record<string, string>,
    onChange: (featureId: string, val: string) => void,
  ) {
    if (!featureInputs.length) return null;
    return (
      <>
        <Divider><Typography variant="caption" color="text.secondary">Feature values (from configuration)</Typography></Divider>
        {featureInputs.map((fi) => {
          if (fi.type === "component" && fi.subFields?.length) {
            const compVals = (() => {
              try { return JSON.parse(formValues[fi.featureId!] || "{}") as Record<string, string>; }
              catch { return {} as Record<string, string>; }
            })();
            return (
              <Box key={fi.featureId}>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>{fi.label}</Typography>
                <Stack spacing={1} sx={{ pl: 1 }}>
                  {fi.subFields.map((sf) => (
                    <TextField key={sf.id} size="small" fullWidth label={sf.name}
                      value={compVals[sf.id] ?? ""}
                      onChange={(e) => {
                        const cur = (() => { try { return JSON.parse(formValues[fi.featureId!] || "{}") as Record<string, string>; } catch { return {}; } })();
                        onChange(fi.featureId!, JSON.stringify({ ...cur, [sf.id]: e.target.value }));
                      }}
                    />
                  ))}
                </Stack>
              </Box>
            );
          }
          return (
            <TextField key={fi.featureId} size="small" fullWidth label={fi.label}
              value={formValues[fi.featureId!] ?? ""}
              onChange={(e) => onChange(fi.featureId!, e.target.value)}
            />
          );
        })}
      </>
    );
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  const activeHealth = activeProduct ? healthMap[activeProduct.id] : undefined;

  return (
    <Stack spacing={3}>
      {/* Header */}
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems="center" gap={2}>
        <Box>
          <Typography variant="h5" sx={{ fontFamily: "Sora" }}>Installation Assets</Typography>
          <Typography variant="body2" color="text.secondary">
            Track assets across projects — start work orders, record status, and monitor progress.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" startIcon={<RefreshOutlined />} onClick={refreshAssets}>Refresh</Button>
          <Button variant="contained" startIcon={<AddOutlined />} onClick={openAdd} disabled={!activeProduct}>Add asset</Button>
        </Stack>
      </Stack>

      {/* Product tabs with health dots */}
      <Paper className="glass-card" sx={{ p: 1.5 }}>
        <Tabs value={tab} onChange={(_, next) => setTab(next)} variant="scrollable" allowScrollButtonsMobile scrollButtons="auto">
          {products.map((p) => {
            const h = healthMap[p.id];
            const dotColor = tabDotColor(h);
            return (
              <Tab
                key={p.id}
                label={
                  <Stack direction="row" alignItems="center" spacing={0.75}>
                    <span>{p.name}</span>
                    {dotColor && <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: dotColor, flexShrink: 0 }} />}
                    {h && h.total > 0 && <Typography variant="caption" sx={{ opacity: 0.65 }}>{h.total}</Typography>}
                  </Stack>
                }
              />
            );
          })}
        </Tabs>
      </Paper>

      {/* Health summary bar */}
      {!loadingAssets && activeHealth && activeHealth.total > 0 && (
        <Paper className="glass-card" sx={{ px: 2.5, py: 1.5 }}>
          <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} spacing={1.5} flexWrap="wrap" useFlexGap>
            <Typography variant="caption" color="text.secondary" fontWeight={700}
              sx={{ textTransform: "uppercase", letterSpacing: 0.5, flexShrink: 0 }}>
              {activeProduct?.name} health
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {activeHealth.notStarted > 0 && (
                <Chip size="small" label={`${activeHealth.notStarted} Not Started`} />
              )}
              {activeHealth.inProgress > 0 && (
                <Chip size="small" label={`${activeHealth.inProgress} In Progress`} color="primary" />
              )}
              {activeHealth.complete > 0 && (
                <Chip size="small" label={`${activeHealth.complete} Complete`} color="success" />
              )}
              {activeHealth.issue > 0 && (
                <Chip size="small" label={`${activeHealth.issue} Issue`} color="error" />
              )}
              {activeHealth.noWorkflow > 0 && (
                <Tooltip title="These assets have no workflow linked and cannot be worked on.">
                  <Chip size="small" label={`${activeHealth.noWorkflow} No Workflow`} color="warning" variant="outlined" />
                </Tooltip>
              )}
            </Stack>
            <Box sx={{ flex: 1, minWidth: 100 }}>
              <LinearProgress
                variant="determinate"
                value={activeHealth.total > 0 ? (activeHealth.complete / activeHealth.total) * 100 : 0}
                color={activeHealth.issue > 0 ? "error" : "success"}
                sx={{ height: 6, borderRadius: 1 }}
              />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
              {activeHealth.total > 0 ? Math.round((activeHealth.complete / activeHealth.total) * 100) : 0}% complete
            </Typography>
          </Stack>
        </Paper>
      )}

      {/* Filters */}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} flexWrap="wrap" useFlexGap>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>Project</InputLabel>
          <Select label="Project" value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
            <MenuItem value="">All projects</MenuItem>
            {projects.map((p) => <MenuItem key={p.id} value={p.id}>{p.jobNumber} — {p.customerName}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Status</InputLabel>
          <Select label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ProjectAssetStatus | "All")}>
            <MenuItem value="All">All statuses</MenuItem>
            <MenuItem value="NotStarted">Not Started</MenuItem>
            <MenuItem value="InProgress">In Progress</MenuItem>
            <MenuItem value="Complete">Complete</MenuItem>
            <MenuItem value="Issue">Issue</MenuItem>
          </Select>
        </FormControl>
        <TextField size="small" label="Search asset tag / serial / location"
          value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 260 }} />
      </Stack>

      {/* Asset table */}
      <Paper className="glass-card" sx={{ overflow: "hidden" }}>
        {loadingAssets ? (
          <Stack alignItems="center" justifyContent="center" sx={{ p: 6 }}>
            <CircularProgress size={32} />
          </Stack>
        ) : visibleAssets.length === 0 ? (
          <Box sx={{ p: 3 }}>
            <Alert severity="info">
              {assets.length === 0
                ? `No assets added for ${activeProduct?.name ?? "this product"} yet. Click "Add asset" to get started.`
                : "No assets match the current filters."}
            </Alert>
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 36, px: 1 }} />
                <TableCell><Typography variant="caption" fontWeight={700}>Asset Tag</Typography></TableCell>
                <TableCell><Typography variant="caption" fontWeight={700}>Serial #</Typography></TableCell>
                <TableCell><Typography variant="caption" fontWeight={700}>Config Type</Typography></TableCell>
                <TableCell><Typography variant="caption" fontWeight={700}>Project</Typography></TableCell>
                <TableCell><Typography variant="caption" fontWeight={700}>Location</Typography></TableCell>
                <TableCell><Typography variant="caption" fontWeight={700}>Assigned Tech</Typography></TableCell>
                <TableCell><Typography variant="caption" fontWeight={700}>Features</Typography></TableCell>
                <TableCell><Typography variant="caption" fontWeight={700}>Status</Typography></TableCell>
                <TableCell align="right"><Typography variant="caption" fontWeight={700}>Actions</Typography></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleAssets.flatMap((asset) => {
                const cfg = asset.productConfigId ? configMap.get(asset.productConfigId) : null;
                const proj = projectMap.get(asset.projectId);
                const tech = asset.assignedUserId ? userMap.get(asset.assignedUserId) : null;
                const isExpanded = expandedAssetId === asset.id;
                const hasIssue = asset.status === "Issue";

                return [
                  <TableRow
                    key={asset.id}
                    hover
                    sx={{ bgcolor: hasIssue ? "rgba(211,47,47,0.04)" : undefined }}
                  >
                    <TableCell sx={{ px: 1 }}>
                      <IconButton size="small" onClick={() => setExpandedAssetId(isExpanded ? null : asset.id)}>
                        {isExpanded ? <ExpandLessOutlined fontSize="small" /> : <ExpandMoreOutlined fontSize="small" />}
                      </IconButton>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={0.75}>
                        {hasIssue && <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "error.main", flexShrink: 0 }} />}
                        <Typography variant="body2" fontWeight={600}>{asset.assetTag}</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{asset.serialNumber || "—"}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{cfg?.configType || "—"}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {proj ? proj.jobNumber : asset.projectId.slice(0, 8)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{asset.location || "—"}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">{tech ? tech.fullName : "—"}</Typography>
                    </TableCell>
                    <TableCell>{featureCompletenessChip(asset)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={STATUS_LABELS[asset.status as ProjectAssetStatus] ?? asset.status}
                        color={STATUS_COLORS[asset.status as ProjectAssetStatus] ?? "default"}
                        icon={
                          asset.status === "InProgress" ? <HourglassEmptyOutlined sx={{ fontSize: "0.9rem !important" }} /> :
                          asset.status === "Complete" ? <CheckCircleOutlined sx={{ fontSize: "0.9rem !important" }} /> :
                          asset.status === "Issue" ? <ErrorOutlined sx={{ fontSize: "0.9rem !important" }} /> :
                          undefined
                        }
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.25} justifyContent="flex-end" alignItems="center">
                        {actionButton(asset)}
                        <Tooltip title="Generate report">
                          <IconButton size="small"
                            onClick={() => generateAssetReport(asset, cfg, proj, tech ?? undefined, activeProduct?.name ?? "", activeFeatures)}>
                            <ArticleOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit asset">
                          <IconButton size="small" onClick={() => openEditAsset(asset)}>
                            <EditOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete asset">
                          <IconButton size="small" color="error" onClick={() => setDeleteAsset(asset)}>
                            <DeleteOutline fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>,

                  // Expandable feature detail row
                  <TableRow key={`${asset.id}-detail`}>
                    <TableCell colSpan={10} sx={{ py: 0 }}>
                      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                        <Box sx={{ px: 3, py: 2, bgcolor: "rgba(45,212,191,0.05)", borderBottom: "1px solid", borderColor: "divider" }}>
                          <Typography variant="caption" fontWeight={700} color="text.secondary"
                            sx={{ textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 1.5 }}>
                            Feature Values &amp; Sub-Dependencies
                          </Typography>
                          {renderFeatureExpandedRow(asset)}
                          {asset.notes && (
                            <Box sx={{ mt: 1.5 }}>
                              <Typography variant="caption" color="text.secondary" fontWeight={600}>Notes: </Typography>
                              <Typography variant="caption">{asset.notes}</Typography>
                            </Box>
                          )}
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>,
                ];
              })}
            </TableBody>
          </Table>
        )}
      </Paper>

      {/* Add asset dialog */}
      <Dialog open={addOpen} onClose={() => !addSaving && setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add asset</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl size="small" fullWidth required>
              <InputLabel>Project *</InputLabel>
              <Select
                label="Project *"
                value={addForm.projectId}
                onChange={(e) => {
                  const projId = e.target.value;
                  const proj = projects.find((p) => p.id === projId);
                  setAddForm((p) => ({
                    ...p,
                    projectId: projId,
                    // Auto-fill location from site if currently empty
                    location: p.location || proj?.siteName || "",
                  }));
                }}
              >
                {projects.map((proj) => (
                  <MenuItem key={proj.id} value={proj.id}>
                    {proj.jobNumber} — {proj.customerName}
                    {proj.siteName ? ` (${proj.siteName})` : ""}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel>Configuration (asset type)</InputLabel>
              <Select
                label="Configuration (asset type)"
                value={addForm.configId}
                onChange={(e) => setAddForm((p) => ({ ...p, configId: e.target.value }))}
              >
                <MenuItem value="">(None)</MenuItem>
                {configs.map((cfg) => (
                  <MenuItem key={cfg.id} value={cfg.id}>
                    {cfg.name}
                    {cfg.configType ? ` — ${cfg.configType}` : ""}
                    {cfg.workflowTemplateId ? " ✓" : " (no workflow)"}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {selectedAddConfig && !selectedAddConfig.workflowTemplateId && (
              <Alert severity="warning" sx={{ fontSize: 12 }}>
                This configuration has no workflow linked. Open the Builder in Work Instructions to add one.
              </Alert>
            )}

            <TextField label="Asset Tag *" size="small" fullWidth required
              value={addForm.assetTag}
              onChange={(e) => setAddForm((p) => ({ ...p, assetTag: e.target.value }))}
              placeholder="e.g. VEH-001" />
            <TextField label="Serial Number" size="small" fullWidth
              value={addForm.serialNumber}
              onChange={(e) => setAddForm((p) => ({ ...p, serialNumber: e.target.value }))} />
            <TextField
              label="Location" size="small" fullWidth
              value={addForm.location}
              onChange={(e) => setAddForm((p) => ({ ...p, location: e.target.value }))}
              placeholder="Auto-filled from project site"
              helperText={
                addForm.projectId && projects.find((p) => p.id === addForm.projectId)?.siteName
                  ? `Site: ${projects.find((p) => p.id === addForm.projectId)?.siteName}`
                  : undefined
              }
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Assigned Technician</InputLabel>
              <Select label="Assigned Technician" value={addForm.assignedUserId}
                onChange={(e) => setAddForm((p) => ({ ...p, assignedUserId: e.target.value }))}>
                <MenuItem value="">(Unassigned)</MenuItem>
                {users.filter((u) => u.isActive).map((u) => (
                  <MenuItem key={u.id} value={u.id}>{u.fullName}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField label="Notes" size="small" fullWidth multiline rows={2}
              value={addForm.notes}
              onChange={(e) => setAddForm((p) => ({ ...p, notes: e.target.value }))} />

            {renderFeatureInputs(configFeatureInputs, addForm.featureValues, (fid, val) =>
              setAddForm((p) => ({ ...p, featureValues: { ...p.featureValues, [fid]: val } }))
            )}
            {addError && <Alert severity="error" sx={{ fontSize: 12 }}>{addError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)} disabled={addSaving}>Cancel</Button>
          <Button variant="contained" onClick={saveAsset} disabled={addSaving}
            startIcon={addSaving ? <CircularProgress size={14} /> : undefined}>
            {addSaving ? "Saving…" : "Add asset"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit asset dialog */}
      <Dialog open={editOpen} onClose={() => !editSaving && setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Asset — {editAsset?.assetTag}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Asset Tag *" size="small" fullWidth required
              value={editForm.assetTag}
              onChange={(e) => setEditForm((p) => ({ ...p, assetTag: e.target.value }))} />
            <TextField label="Serial Number" size="small" fullWidth
              value={editForm.serialNumber}
              onChange={(e) => setEditForm((p) => ({ ...p, serialNumber: e.target.value }))} />
            <TextField label="Location" size="small" fullWidth
              value={editForm.location}
              onChange={(e) => setEditForm((p) => ({ ...p, location: e.target.value }))} />
            <FormControl size="small" fullWidth>
              <InputLabel>Assigned Technician</InputLabel>
              <Select label="Assigned Technician" value={editForm.assignedUserId}
                onChange={(e) => setEditForm((p) => ({ ...p, assignedUserId: e.target.value }))}>
                <MenuItem value="">(Unassigned)</MenuItem>
                {users.filter((u) => u.isActive).map((u) => (
                  <MenuItem key={u.id} value={u.id}>{u.fullName}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField label="Notes" size="small" fullWidth multiline rows={2}
              value={editForm.notes}
              onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))} />
            <FormControl size="small" fullWidth>
              <InputLabel>Status</InputLabel>
              <Select label="Status" value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as ProjectAssetStatus)}>
                <MenuItem value="NotStarted">Not Started</MenuItem>
                <MenuItem value="InProgress">In Progress</MenuItem>
                <MenuItem value="Complete">Complete</MenuItem>
                <MenuItem value="Issue">Issue</MenuItem>
              </Select>
            </FormControl>
            {editError && <Alert severity="error" sx={{ fontSize: 12 }}>{editError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)} disabled={editSaving}>Cancel</Button>
          <Button variant="contained" onClick={saveEditAsset} disabled={editSaving}
            startIcon={editSaving ? <CircularProgress size={14} /> : undefined}>
            {editSaving ? "Saving…" : "Save changes"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={Boolean(deleteAsset)} onClose={() => !deletingAsset && setDeleteAsset(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Asset?</DialogTitle>
        <DialogContent>
          <Typography>Delete asset <strong>{deleteAsset?.assetTag}</strong>? This cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteAsset(null)} disabled={deletingAsset}>Cancel</Button>
          <Button variant="contained" color="error" onClick={confirmDeleteAsset} disabled={deletingAsset}
            startIcon={deletingAsset ? <CircularProgress size={14} /> : undefined}>
            {deletingAsset ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Work order runner */}
      {runnerOpen && runnerWorkflow && runnerAsset && activeProduct && (
        <WorkOrderRunner
          open={runnerOpen}
          onClose={() => { setRunnerOpen(false); setRunnerAsset(null); setRunnerWorkflow(null); }}
          workflow={runnerWorkflow}
          productId={activeProduct.id}
          productName={activeProduct.name}
          projectAssetId={runnerAsset.id}
          onComplete={handleWorkOrderComplete}
        />
      )}
    </Stack>
  );
};

export default AssetInstallationPage;
