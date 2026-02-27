import React, { useEffect, useMemo, useState } from "react";
import {
  AddOutlined,
  ArchiveOutlined,
  ArticleOutlined,
  AssignmentOutlined,
  CheckBoxOutlineBlankOutlined,
  CheckBoxOutlined,
  CheckCircleOutlined,
  DeleteOutline,
  EditOutlined,
  ErrorOutlined,
  ExpandLessOutlined,
  ExpandMoreOutlined,
  FileUploadOutlined,
  HistoryOutlined,
  HourglassEmptyOutlined,
  DragIndicatorOutlined,
  PlayArrowOutlined,
  RefreshOutlined,
  ReportProblemOutlined,
  ViewColumnOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Checkbox,
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
  ListItemIcon,
  ListItemText,
  Menu,
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
import { workflowConfigService } from "../../services/workflowConfigService";
import { assetWorkflowAssignmentService } from "../../services/assetWorkflowAssignmentService";
import { assetWorkflowRunService } from "../../services/assetWorkflowRunService";
import { workflowTypeService } from "../../services/workflowTypeService";
import type { AssetIssue, ProjectAsset, ProjectAssetStatus } from "../../types/projectAsset";
import type { WorkflowConfig } from "../../types/workflowConfig";
import type { WorkflowAssignment, WorkflowType } from "../../types/workflowType";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";
import type { StepInput, Workflow } from "../../types/workflow";
import WorkOrderRunner from "../workInstructions/WorkOrderRunner";
import AssetWorkflowRunHistoryDialog from "./AssetWorkflowRunHistoryDialog";

// ------------------------------------------------------------------
// Column configuration
// ------------------------------------------------------------------

interface ColumnDef {
  id: string;
  label: string;
}

const CONFIGURABLE_COLUMNS: ColumnDef[] = [
  { id: "assetName",     label: "Asset Name" },
  { id: "serialNumber",  label: "Serial #" },
  { id: "assetModel",    label: "Asset Model" },
  { id: "manufacturer",  label: "Manufacturer" },
  { id: "configType",    label: "Config Type" },
  { id: "project",       label: "Project" },
  { id: "siteName",      label: "Site Name" },
  { id: "location",      label: "Location" },
  { id: "assignedTech",  label: "Assigned Tech" },
  { id: "features",      label: "Features" },
  { id: "status",        label: "Status" },
];

const DEFAULT_COL_ORDER = CONFIGURABLE_COLUMNS.map((c) => c.id);
const LS_COL_KEY = "asset_installation_columns_v1";
const ARCHIVE_COL_IDS = ["serialNumber", "assetModel", "manufacturer", "project", "siteName", "configType", "status"];

function loadColumnConfig(): { order: string[]; hidden: string[] } {
  try {
    const raw = localStorage.getItem(LS_COL_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { order: DEFAULT_COL_ORDER, hidden: [] };
}

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
  assetName: string;
  serialNumber: string;
  assetModel: string;
  manufacturer: string;
  location: string;
  assignedUserId: string;
  notes: string;
  featureValues: Record<string, string>;
}

const emptyForm = (): AssetForm => ({
  projectId: "",
  configId: "",
  assetTag: "",
  assetName: "",
  serialNumber: "",
  assetModel: "",
  manufacturer: "",
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
  const [runnerWorkflowConfigId, setRunnerWorkflowConfigId] = useState<string | undefined>(undefined);

  // Context menu (right-click on assignment run button)
  const [contextMenuAnchor, setContextMenuAnchor] = useState<HTMLElement | null>(null);
  const [contextMenuAsset, setContextMenuAsset] = useState<ProjectAsset | null>(null);
  const [contextMenuAssignment, setContextMenuAssignment] = useState<WorkflowAssignment | null>(null);

  // Column settings
  const [colConfig, setColConfig] = useState(loadColumnConfig);
  const [colSettingsOpen, setColSettingsOpen] = useState(false);
  const [settingsOrder, setSettingsOrder] = useState<string[]>([]);
  const [settingsHidden, setSettingsHidden] = useState<string[]>([]);

  // Archive view
  const [archiveMode, setArchiveMode] = useState(false);

  // Issues
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [issueDialogAsset, setIssueDialogAsset] = useState<ProjectAsset | null>(null);
  const [issueForm, setIssueForm] = useState<{ description: string; severity: "low" | "medium" | "high" }>({ description: "", severity: "medium" });

  // Workflow assignments + runs (keyed by assetId)
  const [assignmentsMap, setAssignmentsMap] = useState<Record<string, WorkflowAssignment[]>>({});
  const [runsMap, setRunsMap] = useState<Record<string, AssetWorkflowRun[]>>({});
  const [workflowTypes, setWorkflowTypes] = useState<WorkflowType[]>([]);
  const [workflowConfigs, setWorkflowConfigs] = useState<WorkflowConfig[]>([]);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignDialogAsset, setAssignDialogAsset] = useState<ProjectAsset | null>(null);
  const [assignForm, setAssignForm] = useState({ workflowTypeId: "", workflowConfigId: "" });
  const [assignSaving, setAssignSaving] = useState(false);
  const [runHistoryAsset, setRunHistoryAsset] = useState<ProjectAsset | null>(null);
  const [runHistoryAssignment, setRunHistoryAssignment] = useState<WorkflowAssignment | null>(null);

  // Column filters
  const [colFilters, setColFilters] = useState<Record<string, string>>({});

  // CSV import
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvImporting, setCsvImporting] = useState(false);

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
      if (archiveMode) {
        if (a.status !== "Complete") return false;
      } else {
        if (selectedProjectId && a.projectId !== selectedProjectId) return false;
        if (statusFilter !== "All" && a.status !== statusFilter) return false;
      }
      if (q && !([a.assetTag, a.serialNumber, a.location, a.assetModel, a.manufacturer].some((f) => f?.toLowerCase().includes(q)))) return false;
      return true;
    });
  }, [assets, selectedProjectId, statusFilter, search, archiveMode]);

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const configMap = useMemo(() => new Map(configs.map((c) => [c.id, c])), [configs]);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const visibleColumns = useMemo(() => {
    if (archiveMode) {
      return ARCHIVE_COL_IDS
        .map((id) => CONFIGURABLE_COLUMNS.find((c) => c.id === id))
        .filter((c): c is ColumnDef => !!c);
    }
    const hiddenSet = new Set(colConfig.hidden);
    return colConfig.order
      .map((id) => CONFIGURABLE_COLUMNS.find((c) => c.id === id))
      .filter((c): c is ColumnDef => !!c && !hiddenSet.has(c.id));
  }, [colConfig, archiveMode]);

  // ------------------------------------------------------------------
  // Add asset
  // ------------------------------------------------------------------

  function openAdd() {
    setAddForm({ ...emptyForm(), projectId: selectedProjectId || "" });
    setAddError(null);
    setConfigFeatureInputs([]);
    setAddOpen(true);
  }

  function openColumnSettings() {
    setSettingsOrder(colConfig.order);
    setSettingsHidden(colConfig.hidden);
    setColSettingsOpen(true);
  }

  function applyColumnSettings() {
    const next = { order: settingsOrder, hidden: settingsHidden };
    setColConfig(next);
    try { localStorage.setItem(LS_COL_KEY, JSON.stringify(next)); } catch {}
    setColSettingsOpen(false);
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
        assetName: addForm.assetName.trim() || undefined,
        serialNumber: addForm.serialNumber.trim() || undefined,
        assetModel: addForm.assetModel.trim() || undefined,
        manufacturer: addForm.manufacturer.trim() || undefined,
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
      assetName: asset.assetName ?? "",
      serialNumber: asset.serialNumber ?? "",
      assetModel: asset.assetModel ?? "",
      manufacturer: asset.manufacturer ?? "",
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
    // Check for blocking issues when changing to Complete
    if (editStatus === "Complete" && editAsset.status !== "Complete") {
      let issues: AssetIssue[] = [];
      try { issues = JSON.parse(editAsset.issuesJson || "[]"); } catch {}
      const blockingOpen = issues.filter((i) => i.isBlocking && !i.resolved);
      if (blockingOpen.length > 0) {
        setEditError(`Cannot set to Complete — ${blockingOpen.length} blocking issue${blockingOpen.length === 1 ? "" : "s"} must be resolved first.`);
        return;
      }
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const updated = await projectAssetService.update(editAsset.id, {
        assetTag: tag,
        assetName: editForm.assetName.trim() || undefined,
        serialNumber: editForm.serialNumber.trim() || undefined,
        assetModel: editForm.assetModel.trim() || undefined,
        manufacturer: editForm.manufacturer.trim() || undefined,
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

  // ------------------------------------------------------------------
  // Issues
  // ------------------------------------------------------------------

  async function handleFlagIssue(info: { description: string; severity: "low" | "medium" | "high"; stepId?: string; stepTitle?: string }) {
    if (!runnerAsset) return;
    let issues: AssetIssue[] = [];
    try { issues = JSON.parse(runnerAsset.issuesJson || "[]"); } catch {}
    const newIssue: AssetIssue = {
      id: crypto.randomUUID(),
      ...info,
      issueType: "observation",
      isBlocking: false,
      reportedAt: new Date().toISOString(),
      resolved: false,
    };
    issues.push(newIssue);
    try {
      const updated = await projectAssetService.update(runnerAsset.id, {
        issuesJson: JSON.stringify(issues),
        status: "Issue",
      });
      setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setRunnerAsset(updated);
    } catch { console.warn("Failed to save issue"); }
  }

  async function handleAddIssue() {
    if (!issueDialogAsset || !issueForm.description.trim()) return;
    let issues: AssetIssue[] = [];
    try { issues = JSON.parse(issueDialogAsset.issuesJson || "[]"); } catch {}
    const newIssue: AssetIssue = {
      id: crypto.randomUUID(),
      description: issueForm.description.trim(),
      severity: issueForm.severity,
      issueType: "observation",
      isBlocking: false,
      reportedAt: new Date().toISOString(),
      resolved: false,
    };
    issues.push(newIssue);
    try {
      const updated = await projectAssetService.update(issueDialogAsset.id, { issuesJson: JSON.stringify(issues) });
      setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch { console.warn("Failed to add issue"); }
    setIssueDialogOpen(false);
    setIssueDialogAsset(null);
    setIssueForm({ description: "", severity: "medium" });
  }

  async function handleToggleIssueResolved(asset: ProjectAsset, issueId: string) {
    let issues: AssetIssue[] = [];
    try { issues = JSON.parse(asset.issuesJson || "[]"); } catch {}
    issues = issues.map((i) => i.id === issueId ? { ...i, resolved: !i.resolved } : i);
    try {
      const updated = await projectAssetService.update(asset.id, { issuesJson: JSON.stringify(issues) });
      setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch { console.warn("Failed to update issue"); }
  }

  // ------------------------------------------------------------------
  // Workflow assignment helpers
  // ------------------------------------------------------------------

  async function loadAssignmentsForAsset(assetId: string) {
    try {
      const [assignments, runs] = await Promise.all([
        assetWorkflowAssignmentService.listByAsset(assetId),
        assetWorkflowRunService.listByAsset(assetId),
      ]);
      setAssignmentsMap((prev) => ({ ...prev, [assetId]: assignments }));
      setRunsMap((prev) => ({ ...prev, [assetId]: runs }));
    } catch { console.warn("[AssetInstallationPage] loadAssignmentsForAsset failed"); }
  }

  async function openAssignDialog(asset: ProjectAsset) {
    setAssignDialogAsset(asset);
    setAssignForm({ workflowTypeId: "", workflowConfigId: "" });
    setAssignDialogOpen(true);
    // Load workflow types + published configs for this product
    try {
      const [types, cfgs] = await Promise.all([
        workflowTypeService.list(),
        workflowConfigService.listByProduct(asset.productId, "Published"),
      ]);
      setWorkflowTypes(types);
      setWorkflowConfigs(cfgs);
    } catch { console.warn("[AssetInstallationPage] failed to load workflow types/configs"); }
  }

  async function saveAssignment() {
    if (!assignDialogAsset || !assignForm.workflowTypeId || !assignForm.workflowConfigId) return;
    setAssignSaving(true);
    try {
      await assetWorkflowAssignmentService.create(assignDialogAsset.id, assignForm.workflowConfigId, assignForm.workflowTypeId);
      await loadAssignmentsForAsset(assignDialogAsset.id);
      setAssignDialogOpen(false);
    } catch { console.warn("[AssetInstallationPage] saveAssignment failed"); } finally {
      setAssignSaving(false);
    }
  }

  async function removeAssignment(assetId: string, assignmentId: string) {
    try {
      await assetWorkflowAssignmentService.remove(assignmentId);
      await loadAssignmentsForAsset(assetId);
    } catch { console.warn("[AssetInstallationPage] removeAssignment failed"); }
  }

  async function handleStartAssignmentRun(asset: ProjectAsset, assignment: WorkflowAssignment) {
    setRunnerLoading(asset.id);
    try {
      // Load the workflow config to get steps
      const cfg = await workflowConfigService.getById(assignment.workflowConfigId);
      if (!cfg) { alert("Workflow config not found."); return; }
      let wf: Workflow | null = null;
      try {
        const parsed = JSON.parse(cfg.stepsJson);
        if (parsed?.steps) wf = parsed as Workflow;
        else if (Array.isArray(parsed)) wf = { id: cfg.id, name: cfg.name, productId: cfg.productId, createdAt: Date.now(), steps: parsed, media: [] };
      } catch {}
      if (!wf || wf.steps.length === 0) { alert("This workflow has no steps defined."); return; }
      setRunnerAsset(asset);
      setRunnerWorkflow(wf);
      setRunnerWorkflowConfigId(assignment.workflowConfigId);
      setRunnerOpen(true);
    } catch { alert("Failed to load workflow."); } finally {
      setRunnerLoading(null);
    }
  }

  // ------------------------------------------------------------------
  // CSV import helpers
  // ------------------------------------------------------------------

  function parseCSV(text: string): Record<string, string>[] {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];
    const cols = lines[0].split(",").map((c) => c.trim().toLowerCase().replace(/[\s#]+/g, "_").replace(/^"|"$/g, ""));
    return lines.slice(1).map((row) => {
      const vals = row.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
      return Object.fromEntries(cols.map((c, i) => [c, vals[i] ?? ""]));
    }).filter((r) => Object.values(r).some(Boolean));
  }

  async function handleCSVFile(file: File) {
    const text = await file.text();
    const rows = parseCSV(text);
    setCsvRows(rows);
    setCsvImportOpen(true);
  }

  async function importCSV() {
    if (!activeProduct || csvRows.length === 0) return;
    setCsvImporting(true);
    try {
      const configsByType = new Map(workflowConfigs.map((c) => [c.configType?.toLowerCase(), c]));
      const assets = csvRows
        .filter((r) => r.asset_tag || r.assettag)
        .map((r) => ({
          assetTag: r.asset_tag || r.assettag || "",
          assetName: r.asset_name || r.assetname || "",
          serialNumber: r.serial_number || r["serial_#"] || r.serialnumber || "",
          assetModel: r.model || r.asset_model || "",
          manufacturer: r.manufacturer || "",
          productConfigId: (() => {
            const ct = (r.config_type || r.configtype || "").toLowerCase();
            return configsByType.get(ct)?.id;
          })(),
        }));
      await Promise.all(assets.map((a) =>
        projectAssetService.create({
          projectId: selectedProjectId || projects[0]?.id || "",
          productId: activeProduct.id,
          assetTag: a.assetTag,
          assetName: a.assetName || undefined,
          serialNumber: a.serialNumber || undefined,
          assetModel: a.assetModel || undefined,
          manufacturer: a.manufacturer || undefined,
          productConfigId: a.productConfigId,
        }),
      ));
      setCsvImportOpen(false);
      setCsvRows([]);
      refreshAssets();
    } catch { alert("Import failed. Check your CSV and try again."); } finally {
      setCsvImporting(false);
    }
  }

  function issuesBadge(asset: ProjectAsset) {
    let issues: AssetIssue[] = [];
    try { issues = JSON.parse(asset.issuesJson || "[]"); } catch {}
    const openCount = issues.filter((i) => !i.resolved).length;
    if (!openCount) return null;
    return (
      <Tooltip title={`${openCount} open issue${openCount !== 1 ? "s" : ""}`}>
        <Chip
          size="small"
          label={openCount}
          color="error"
          icon={<ReportProblemOutlined sx={{ fontSize: "0.85rem !important" }} />}
          sx={{ height: 20, "& .MuiChip-label": { px: 0.5 } }}
        />
      </Tooltip>
    );
  }

  const SEVERITY_COLOR: Record<"low" | "medium" | "high", string> = {
    low: "#2196f3",
    medium: "#ff9800",
    high: "#f44336",
  };

  function renderIssuesPanel(asset: ProjectAsset) {
    let issues: AssetIssue[] = [];
    try { issues = JSON.parse(asset.issuesJson || "[]"); } catch {}
    return (
      <Box sx={{ mt: 1.5 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={0.75}>
          <Typography variant="caption" fontWeight={700} color="text.secondary"
            sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
            Issues {issues.length > 0 && `(${issues.filter(i => !i.resolved).length} open)`}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            color="error"
            startIcon={<ReportProblemOutlined fontSize="small" />}
            sx={{ fontSize: 11, py: 0.25 }}
            onClick={() => { setIssueDialogAsset(asset); setIssueDialogOpen(true); }}
          >
            Add issue
          </Button>
        </Stack>
        {issues.length === 0 ? (
          <Typography variant="caption" color="text.disabled">No issues recorded.</Typography>
        ) : (
          <Stack spacing={0.5}>
            {issues.map((issue) => (
              <Stack key={issue.id} direction="row" alignItems="flex-start" spacing={1}
                sx={{ p: 0.75, borderRadius: 1, border: "1px solid", borderColor: "divider",
                  bgcolor: issue.resolved ? "rgba(255,255,255,0.02)" : "rgba(244,67,54,0.04)",
                  opacity: issue.resolved ? 0.55 : 1 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: SEVERITY_COLOR[issue.severity], mt: 0.6, flexShrink: 0 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" sx={{ textDecoration: issue.resolved ? "line-through" : "none" }}>
                    {issue.description}
                  </Typography>
                  {issue.stepTitle && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      Step: {issue.stepTitle}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.disabled" display="block">
                    {new Date(issue.reportedAt).toLocaleString()} · {issue.severity}
                  </Typography>
                </Box>
                <Tooltip title={issue.resolved ? "Mark open" : "Mark resolved"}>
                  <IconButton size="small" onClick={() => handleToggleIssueResolved(asset, issue.id)}>
                    {issue.resolved
                      ? <CheckBoxOutlined fontSize="small" color="success" />
                      : <CheckBoxOutlineBlankOutlined fontSize="small" />}
                  </IconButton>
                </Tooltip>
              </Stack>
            ))}
          </Stack>
        )}
      </Box>
    );
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
  // Dynamic column cell renderer
  // ------------------------------------------------------------------

  function renderColumnCell(
    colId: string,
    asset: ProjectAsset,
    cfg: ProductConfig | null | undefined,
    proj: ReturnType<typeof projectMap.get>,
    tech: ReturnType<typeof userMap.get>,
  ) {
    switch (colId) {
      case "assetName":
        return <Typography variant="body2">{asset.assetName || "—"}</Typography>;
      case "serialNumber":
        return <Typography variant="body2" color="text.secondary">{asset.serialNumber || "—"}</Typography>;
      case "assetModel":
        return <Typography variant="body2" color="text.secondary">{asset.assetModel || "—"}</Typography>;
      case "manufacturer":
        return <Typography variant="body2" color="text.secondary">{asset.manufacturer || "—"}</Typography>;
      case "configType":
        return <Typography variant="body2" color="text.secondary">{cfg?.configType || "—"}</Typography>;
      case "project":
        return <Typography variant="body2" color="text.secondary">{proj ? proj.jobNumber : asset.projectId.slice(0, 8)}</Typography>;
      case "siteName":
        return <Typography variant="body2" color="text.secondary">{proj?.siteName || "—"}</Typography>;
      case "location":
        return <Typography variant="body2" color="text.secondary">{asset.location || "—"}</Typography>;
      case "assignedTech":
        return <Typography variant="body2" color="text.secondary">{tech ? tech.fullName : "—"}</Typography>;
      case "features":
        return featureCompletenessChip(asset);
      case "status":
        return (
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
        );
      default:
        return null;
    }
  }

  // ------------------------------------------------------------------
  // Workflow assignments panel (expanded row)
  // ------------------------------------------------------------------

  function renderWorkflowAssignmentsPanel(asset: ProjectAsset) {
    const assignments = assignmentsMap[asset.id] ?? [];
    const runs = runsMap[asset.id] ?? [];
    const runLoading = runnerLoading === asset.id;

    return (
      <Box sx={{ mt: 1.5 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={0.75}>
          <Typography variant="caption" fontWeight={700} color="text.secondary"
            sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
            Workflow Assignments {assignments.length > 0 && `(${assignments.length})`}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            color="primary"
            startIcon={<AssignmentOutlined fontSize="small" />}
            sx={{ fontSize: 11, py: 0.25 }}
            onClick={() => openAssignDialog(asset)}
          >
            Assign workflow
          </Button>
        </Stack>
        {assignments.length === 0 ? (
          <Typography variant="caption" color="text.disabled">
            No workflow assignments. Click "Assign workflow" to add one.
          </Typography>
        ) : (
          <Stack spacing={0.5}>
            {assignments.map((asgn) => {
              const latestRun = runs
                .filter((r) => r.workflowConfigId === asgn.workflowConfigId)
                .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
              return (
                <Stack key={asgn.id} direction="row" alignItems="center" spacing={1}
                  sx={{ p: 0.75, borderRadius: 1, border: "1px solid", borderColor: "divider", bgcolor: "rgba(255,255,255,0.02)" }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="caption" fontWeight={600}>{asgn.workflowTypeName || "Workflow"}</Typography>
                    <Typography variant="caption" color="text.secondary" display="block" noWrap>
                      {asgn.workflowConfigName || asgn.workflowConfigId}
                    </Typography>
                  </Box>
                  {latestRun && (
                    <Chip
                      size="small"
                      label={latestRun.status}
                      color={latestRun.status === "Complete" ? "success" : latestRun.status === "Issue" ? "error" : "primary"}
                      variant={latestRun.isLocked ? "filled" : "outlined"}
                      sx={{ fontSize: 10, height: 18 }}
                    />
                  )}
                  <Tooltip title={latestRun?.status === "Complete" ? "Right-click to re-run or view history" : ""}>
                    <Button
                      size="small"
                      variant={latestRun?.status === "InProgress" ? "contained" : "outlined"}
                      color={latestRun?.status === "Issue" ? "error" : latestRun?.status === "Complete" ? "inherit" : "success"}
                      disabled={runLoading}
                      startIcon={runLoading ? <CircularProgress size={12} /> : <PlayArrowOutlined />}
                      onClick={() => handleStartAssignmentRun(asset, asgn)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenuAnchor(e.currentTarget);
                        setContextMenuAsset(asset);
                        setContextMenuAssignment(asgn);
                      }}
                      sx={{ fontSize: 11, py: 0.25 }}
                    >
                      {!latestRun ? "Start" : latestRun.status === "InProgress" ? "Continue" : latestRun.status === "Complete" ? "View" : "Review"}
                    </Button>
                  </Tooltip>
                  <Tooltip title="Remove assignment">
                    <IconButton size="small" onClick={() => removeAssignment(asset.id, asgn.id)}>
                      <DeleteOutline sx={{ fontSize: "0.9rem" }} />
                    </IconButton>
                  </Tooltip>
                </Stack>
              );
            })}
          </Stack>
        )}
      </Box>
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
        <Stack direction="row" spacing={1} alignItems="center">
          <Button size="small" variant="outlined" startIcon={<RefreshOutlined />} onClick={refreshAssets}>Refresh</Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<FileUploadOutlined />}
            disabled={!activeProduct}
            onClick={() => {
              if (activeProduct) workflowConfigService.listByProduct(activeProduct.id, "Published").then(setWorkflowConfigs);
              setCsvImportOpen(true);
            }}
          >
            Import CSV
          </Button>
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

      {/* Table toolbar */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Tooltip title={archiveMode ? "Exit archive view" : "Show completed assets archive"}>
          <Button
            size="small"
            variant={archiveMode ? "contained" : "outlined"}
            color={archiveMode ? "success" : "inherit"}
            startIcon={<ArchiveOutlined fontSize="small" />}
            onClick={() => setArchiveMode((v) => !v)}
            sx={{ fontSize: 12 }}
          >
            {archiveMode ? "Archive View — Exit" : "Archive"}
          </Button>
        </Tooltip>
        {!archiveMode && (
          <Tooltip title="Column settings">
            <IconButton size="small" onClick={openColumnSettings} sx={{ opacity: 0.7, "&:hover": { opacity: 1 } }}>
              <ViewColumnOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {archiveMode && (
          <Typography variant="caption" color="text.secondary">
            Showing completed assets · read-only view
          </Typography>
        )}
      </Box>

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
                {visibleColumns.map((col) => (
                  <TableCell key={col.id}>
                    <Typography variant="caption" fontWeight={700}>{col.label}</Typography>
                  </TableCell>
                ))}
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
                      <IconButton size="small" onClick={() => {
                        const nextId = isExpanded ? null : asset.id;
                        setExpandedAssetId(nextId);
                        if (nextId && !assignmentsMap[nextId]) loadAssignmentsForAsset(nextId);
                      }}>
                        {isExpanded ? <ExpandLessOutlined fontSize="small" /> : <ExpandMoreOutlined fontSize="small" />}
                      </IconButton>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={0.75}>
                        {hasIssue && <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "error.main", flexShrink: 0 }} />}
                        <Typography variant="body2" fontWeight={600}>{asset.assetTag}</Typography>
                        {issuesBadge(asset)}
                      </Stack>
                    </TableCell>
                    {visibleColumns.map((col) => (
                      <TableCell key={col.id}>
                        {renderColumnCell(col.id, asset, cfg, proj, tech ?? undefined)}
                      </TableCell>
                    ))}
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
                    <TableCell colSpan={3 + visibleColumns.length} sx={{ py: 0 }}>
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
                          <Divider sx={{ my: 1.5 }} />
                          {renderIssuesPanel(asset)}
                          <Divider sx={{ my: 1.5 }} />
                          {renderWorkflowAssignmentsPanel(asset)}
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

            {/* Auto-filled project info */}
            {addForm.projectId && (() => {
              const proj = projects.find((p) => p.id === addForm.projectId);
              if (!proj) return null;
              return (
                <Stack direction="row" spacing={1.5}>
                  <TextField
                    label="Project #" size="small" fullWidth
                    value={proj.jobNumber}
                    InputProps={{ readOnly: true }}
                    sx={{ "& .MuiInputBase-input": { color: "text.secondary" } }}
                  />
                  {proj.siteName && (
                    <TextField
                      label="Site Name" size="small" fullWidth
                      value={proj.siteName}
                      InputProps={{ readOnly: true }}
                      sx={{ "& .MuiInputBase-input": { color: "text.secondary" } }}
                    />
                  )}
                </Stack>
              );
            })()}

            <TextField label="Asset Tag *" size="small" fullWidth required
              value={addForm.assetTag}
              onChange={(e) => setAddForm((p) => ({ ...p, assetTag: e.target.value }))}
              placeholder="e.g. VEH-001" />
            <TextField label="Asset Name" size="small" fullWidth
              value={addForm.assetName}
              onChange={(e) => setAddForm((p) => ({ ...p, assetName: e.target.value }))}
              placeholder="e.g. AGI-10, Shuttle Car, Skid Steer"
              helperText="Equipment type or model name" />
            <TextField label="Serial Number" size="small" fullWidth
              value={addForm.serialNumber}
              onChange={(e) => setAddForm((p) => ({ ...p, serialNumber: e.target.value }))} />
            <TextField label="Asset Model" size="small" fullWidth
              value={addForm.assetModel}
              onChange={(e) => setAddForm((p) => ({ ...p, assetModel: e.target.value }))}
              placeholder="e.g. Axis P3245-V" />
            <TextField label="Manufacturer" size="small" fullWidth
              value={addForm.manufacturer}
              onChange={(e) => setAddForm((p) => ({ ...p, manufacturer: e.target.value }))}
              placeholder="e.g. Axis, Cisco" />
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
            {/* Site name from project (read-only) */}
            {editAsset && (() => {
              const proj = projectMap.get(editAsset.projectId);
              if (!proj?.siteName) return null;
              return (
                <Stack direction="row" spacing={1.5}>
                  <TextField
                    label="Project #" size="small" fullWidth
                    value={proj.jobNumber}
                    InputProps={{ readOnly: true }}
                    sx={{ "& .MuiInputBase-input": { color: "text.secondary" } }}
                  />
                  <TextField
                    label="Site Name" size="small" fullWidth
                    value={proj.siteName}
                    InputProps={{ readOnly: true }}
                    sx={{ "& .MuiInputBase-input": { color: "text.secondary" } }}
                  />
                </Stack>
              );
            })()}

            <TextField label="Asset Tag *" size="small" fullWidth required
              value={editForm.assetTag}
              onChange={(e) => setEditForm((p) => ({ ...p, assetTag: e.target.value }))} />
            <TextField label="Asset Name" size="small" fullWidth
              value={editForm.assetName}
              onChange={(e) => setEditForm((p) => ({ ...p, assetName: e.target.value }))}
              placeholder="e.g. AGI-10, Shuttle Car, Skid Steer" />
            <TextField label="Serial Number" size="small" fullWidth
              value={editForm.serialNumber}
              onChange={(e) => setEditForm((p) => ({ ...p, serialNumber: e.target.value }))} />
            <TextField label="Asset Model" size="small" fullWidth
              value={editForm.assetModel}
              onChange={(e) => setEditForm((p) => ({ ...p, assetModel: e.target.value }))} />
            <TextField label="Manufacturer" size="small" fullWidth
              value={editForm.manufacturer}
              onChange={(e) => setEditForm((p) => ({ ...p, manufacturer: e.target.value }))} />
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

      {/* Add issue dialog */}
      <Dialog open={issueDialogOpen} onClose={() => { setIssueDialogOpen(false); setIssueDialogAsset(null); }} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <ReportProblemOutlined color="error" fontSize="small" />
            <span>Add Issue — {issueDialogAsset?.assetTag}</span>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Description"
              size="small"
              fullWidth
              multiline
              rows={3}
              value={issueForm.description}
              onChange={(e) => setIssueForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Describe the issue…"
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Severity</InputLabel>
              <Select
                label="Severity"
                value={issueForm.severity}
                onChange={(e) => setIssueForm((p) => ({ ...p, severity: e.target.value as "low" | "medium" | "high" }))}
              >
                <MenuItem value="low">Low</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="high">High</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setIssueDialogOpen(false); setIssueDialogAsset(null); }}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleAddIssue} disabled={!issueForm.description.trim()}>
            Add issue
          </Button>
        </DialogActions>
      </Dialog>

      {/* Column settings dialog */}
      <Dialog open={colSettingsOpen} onClose={() => setColSettingsOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Column Settings</DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
            Check to show a column. Drag rows to reorder — top of the list = leftmost in the table.
          </Typography>
          <Stack spacing={0.75}>
            {settingsOrder.map((id, idx) => {
              const col = CONFIGURABLE_COLUMNS.find((c) => c.id === id);
              if (!col) return null;
              const isHidden = settingsHidden.includes(id);
              return (
                <Stack
                  key={id}
                  direction="row"
                  alignItems="center"
                  spacing={0.5}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", String(idx))}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const fromIdx = Number(e.dataTransfer.getData("text/plain"));
                    if (fromIdx === idx) return;
                    const next = [...settingsOrder];
                    const [moved] = next.splice(fromIdx, 1);
                    next.splice(idx, 0, moved);
                    setSettingsOrder(next);
                  }}
                  sx={{
                    px: 1, py: 0.5, borderRadius: 1,
                    border: "1px solid",
                    borderColor: "divider",
                    bgcolor: isHidden ? "action.disabledBackground" : "action.hover",
                    cursor: "grab",
                    "&:active": { cursor: "grabbing" },
                  }}
                >
                  <DragIndicatorOutlined fontSize="small" sx={{ color: "text.disabled", flexShrink: 0 }} />
                  <Checkbox
                    size="small"
                    checked={!isHidden}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      setSettingsHidden((prev) =>
                        e.target.checked ? prev.filter((h) => h !== id) : [...prev, id]
                      )
                    }
                  />
                  <Typography variant="body2" sx={{ flex: 1, opacity: isHidden ? 0.45 : 1, userSelect: "none" }}>
                    {col.label}
                  </Typography>
                </Stack>
              );
            })}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setColSettingsOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={applyColumnSettings}>Apply</Button>
        </DialogActions>
      </Dialog>

      {/* Assign workflow dialog */}
      <Dialog open={assignDialogOpen} onClose={() => !assignSaving && setAssignDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <AssignmentOutlined fontSize="small" />
            <span>Assign Workflow — {assignDialogAsset?.assetTag}</span>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl size="small" fullWidth required>
              <InputLabel>Workflow Type *</InputLabel>
              <Select
                label="Workflow Type *"
                value={assignForm.workflowTypeId}
                onChange={(e) => setAssignForm((p) => ({ ...p, workflowTypeId: e.target.value }))}
              >
                {workflowTypes.map((t) => (
                  <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth required>
              <InputLabel>Workflow Config (Published) *</InputLabel>
              <Select
                label="Workflow Config (Published) *"
                value={assignForm.workflowConfigId}
                onChange={(e) => setAssignForm((p) => ({ ...p, workflowConfigId: e.target.value }))}
              >
                {workflowConfigs.length === 0 && (
                  <MenuItem value="" disabled>No published configs available</MenuItem>
                )}
                {workflowConfigs.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                    {c.configType ? ` — ${c.configType}` : ""}
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>v{c.version}</Typography>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignDialogOpen(false)} disabled={assignSaving}>Cancel</Button>
          <Button
            variant="contained"
            onClick={saveAssignment}
            disabled={assignSaving || !assignForm.workflowTypeId || !assignForm.workflowConfigId}
            startIcon={assignSaving ? <CircularProgress size={14} /> : undefined}
          >
            {assignSaving ? "Saving…" : "Assign"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* CSV import dialog */}
      <Dialog open={csvImportOpen} onClose={() => !csvImporting && setCsvImportOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Stack direction="row" alignItems="center" spacing={1}>
              <FileUploadOutlined fontSize="small" />
              <span>Import Assets from CSV</span>
            </Stack>
            <Tooltip title={
              <Box sx={{ fontSize: 12 }}>
                <strong>Expected columns:</strong><br />
                Asset Tag* (required)<br />
                Asset Name<br />
                Config Type (matched to published configs)<br />
                Serial # / Serial Number<br />
                Model / Asset Model<br />
                Manufacturer
              </Box>
            }>
              <IconButton size="small" sx={{ opacity: 0.6 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>ⓘ</Typography>
              </IconButton>
            </Tooltip>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {csvRows.length === 0 ? (
              <Box
                sx={{
                  border: "2px dashed",
                  borderColor: "divider",
                  borderRadius: 2,
                  p: 4,
                  textAlign: "center",
                  cursor: "pointer",
                  "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" },
                }}
                onClick={() => document.getElementById("csv-upload-input")?.click()}
              >
                <FileUploadOutlined sx={{ fontSize: 40, opacity: 0.4, mb: 1 }} />
                <Typography variant="body2" color="text.secondary">Click to upload a CSV file</Typography>
                <Typography variant="caption" color="text.disabled">or drag and drop</Typography>
                <input
                  id="csv-upload-input"
                  type="file"
                  accept=".csv"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleCSVFile(file);
                    e.target.value = "";
                  }}
                />
              </Box>
            ) : (
              <>
                <Alert severity="info" sx={{ fontSize: 12 }}>
                  {csvRows.filter((r) => r.asset_tag || r.assettag).length} valid rows found.
                  {csvRows.filter((r) => !r.asset_tag && !r.assettag).length > 0 &&
                    ` ${csvRows.filter((r) => !r.asset_tag && !r.assettag).length} rows skipped (missing asset tag).`
                  }
                </Alert>
                <Box sx={{ maxHeight: 320, overflow: "auto" }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell><Typography variant="caption" fontWeight={700}>Asset Tag</Typography></TableCell>
                        <TableCell><Typography variant="caption" fontWeight={700}>Asset Name</Typography></TableCell>
                        <TableCell><Typography variant="caption" fontWeight={700}>Config Type</Typography></TableCell>
                        <TableCell><Typography variant="caption" fontWeight={700}>Serial #</Typography></TableCell>
                        <TableCell><Typography variant="caption" fontWeight={700}>Model</Typography></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {csvRows.map((r, i) => {
                        const tag = r.asset_tag || r.assettag;
                        const valid = !!tag;
                        return (
                          <TableRow key={i} sx={{ opacity: valid ? 1 : 0.4 }}>
                            <TableCell>
                              <Stack direction="row" alignItems="center" spacing={0.5}>
                                <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: valid ? "success.main" : "error.main", flexShrink: 0 }} />
                                <Typography variant="body2">{tag || "(missing)"}</Typography>
                              </Stack>
                            </TableCell>
                            <TableCell><Typography variant="body2">{r.asset_name || r.assetname || "—"}</Typography></TableCell>
                            <TableCell><Typography variant="body2">{r.config_type || r.configtype || "—"}</Typography></TableCell>
                            <TableCell><Typography variant="body2">{r.serial_number || r["serial_#"] || r.serialnumber || "—"}</Typography></TableCell>
                            <TableCell><Typography variant="body2">{r.model || r.asset_model || "—"}</Typography></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Box>
                <Button
                  size="small"
                  variant="text"
                  onClick={() => setCsvRows([])}
                  sx={{ alignSelf: "flex-start", fontSize: 12 }}
                >
                  Clear / upload different file
                </Button>
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setCsvImportOpen(false); setCsvRows([]); }} disabled={csvImporting}>Cancel</Button>
          <Button
            variant="contained"
            onClick={importCSV}
            disabled={csvImporting || csvRows.filter((r) => r.asset_tag || r.assettag).length === 0}
            startIcon={csvImporting ? <CircularProgress size={14} /> : <FileUploadOutlined />}
          >
            {csvImporting ? "Importing…" : `Import ${csvRows.filter((r) => r.asset_tag || r.assettag).length} asset${csvRows.filter((r) => r.asset_tag || r.assettag).length !== 1 ? "s" : ""}`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Run history dialog */}
      {runHistoryAsset && runHistoryAssignment && (
        <AssetWorkflowRunHistoryDialog
          open={Boolean(runHistoryAsset)}
          onClose={() => { setRunHistoryAsset(null); setRunHistoryAssignment(null); }}
          asset={runHistoryAsset}
          assignment={runHistoryAssignment}
        />
      )}

      {/* Right-click context menu on assignment run button */}
      <Menu
        anchorEl={contextMenuAnchor}
        open={Boolean(contextMenuAnchor)}
        onClose={() => setContextMenuAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <MenuItem
          onClick={() => {
            setContextMenuAnchor(null);
            if (contextMenuAsset && contextMenuAssignment) {
              handleStartAssignmentRun(contextMenuAsset, contextMenuAssignment);
            }
          }}
        >
          <ListItemIcon><PlayArrowOutlined fontSize="small" /></ListItemIcon>
          <ListItemText>Re-run workflow</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setContextMenuAnchor(null);
            if (contextMenuAsset && contextMenuAssignment) {
              setRunHistoryAsset(contextMenuAsset);
              setRunHistoryAssignment(contextMenuAssignment);
            }
          }}
        >
          <ListItemIcon><HistoryOutlined fontSize="small" /></ListItemIcon>
          <ListItemText>View run history</ListItemText>
        </MenuItem>
      </Menu>

      {/* Work order runner */}
      {runnerOpen && runnerWorkflow && runnerAsset && activeProduct && (
        <WorkOrderRunner
          open={runnerOpen}
          onClose={() => {
            setRunnerOpen(false);
            setRunnerAsset(null);
            setRunnerWorkflow(null);
            setRunnerWorkflowConfigId(undefined);
          }}
          workflow={runnerWorkflow}
          productId={activeProduct.id}
          productName={activeProduct.name}
          projectAssetId={runnerAsset.id}
          workflowConfigId={runnerWorkflowConfigId}
          onComplete={handleWorkOrderComplete}
        />
      )}
    </Stack>
  );
};

export default AssetInstallationPage;
