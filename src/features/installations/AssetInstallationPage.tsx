import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  FileDownloadOutlined,
  FileUploadOutlined,
  FolderOutlined,
  HistoryOutlined,
  HourglassEmptyOutlined,
  DragIndicatorOutlined,
  PlayArrowOutlined,
  PrintOutlined,
  RefreshOutlined,
  ReportProblemOutlined,
  ViewColumnOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Badge,
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
  FormControlLabel,
  FormGroup,
  FormLabel,
  IconButton,
  InputLabel,
  LinearProgress,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Popover,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { usePermissions } from "../../hooks/usePermissions";
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
import { brandSettingsService } from "../../services/brandSettingsService";
import { customerService } from "../../services/customerService";
import { assetDocumentLinkService } from "../../services/assetDocumentLinkService";
import { generateWorkflowReport, resolveImageToDataUrl } from "../../utils/generateWorkflowReport";
import {
  generateAssetListReport,
  ALL_PRINT_COLUMNS,
  type PrintRow,
  type GroupByKey,
} from "../../utils/generateAssetListReport";
import type { AssetIssue, ProjectAsset, ProjectAssetStatus } from "../../types/projectAsset";
import type { WorkflowConfig } from "../../types/workflowConfig";
import type { WorkflowAssignment, WorkflowType } from "../../types/workflowType";
import type { AssetWorkflowRun, RunIssue } from "../../types/assetWorkflowRun";
import type { BomItem, StepInput, Workflow } from "../../types/workflow";
import { featureService } from "../../services/featureService";
import { featureDependencyService } from "../../services/featureDependencyService";
import { siteService } from "../../services/siteService";
import type { Site } from "../../types/site";
import WorkOrderRunner from "../workInstructions/WorkOrderRunner";
import AssetWorkflowRunHistoryDialog from "./AssetWorkflowRunHistoryDialog";
import WorkflowRunHistoryDialog from "./WorkflowRunHistoryDialog";
import AssetDocumentsDialog from "./AssetDocumentsDialog";
import IssueDetailDialog from "../../components/ui/IssueDetailDialog";
import MediaCapture from "../../components/ui/MediaCapture";
import QRUploadButton from "../../components/QRUploadButton";

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
    noWorkflow: list.filter((a) => !a.productConfigId && !a.workflowTemplateId).length,
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
// Report generator (type only — the async function lives inside the component)
// ------------------------------------------------------------------

type FeatureDef = {
  id: string;
  name: string;
  valueType: string;
  subProperties?: { id: string; name: string }[];
};

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

const AssetInstallationPage = () => {
  const dispatch = useAppDispatch();
  const { user: currentUser } = useAuth();
  const can = usePermissions();
  const productsState = useAppSelector((s) => s.products);
  const projects = useAppSelector((s) => s.projects.items);
  const users = useAppSelector((s) => s.users.items);
  const [searchParams] = useSearchParams();

  // Stale-load guard: incremented every time activeProduct changes so that
  // results from a superseded fetch (triggered before the tab restoration
  // effect corrects the tab) are silently discarded.
  const assetLoadIdRef = useRef(0);

  const [tab, setTab] = useState(0);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    () => { try { return sessionStorage.getItem("installations_selected_project_id") ?? ""; } catch { return ""; } }
  );
  const [statusFilter, setStatusFilter] = useState<ProjectAssetStatus | "All">("All");
  const [search, setSearch] = useState("");

  const [sites, setSites] = useState<Site[]>([]);
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [configs, setConfigs] = useState<ProductConfig[]>([]);
  const [publishedWfConfigs, setPublishedWfConfigs] = useState<WorkflowConfig[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [healthMap, setHealthMap] = useState<Record<string, AssetHealth>>({});

  const [expandedAssetId, setExpandedAssetId] = useState<string | null>(null);
  const [expandedBomAsgnId, setExpandedBomAsgnId] = useState<string | null>(null);

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

  // Delete (single)
  const [deleteAsset, setDeleteAsset] = useState<ProjectAsset | null>(null);
  const [deletingAsset, setDeletingAsset] = useState(false);

  // Bulk delete
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Work order runner
  const [runnerOpen, setRunnerOpen] = useState(false);
  const [runnerAsset, setRunnerAsset] = useState<ProjectAsset | null>(null);
  // Auto-assign warning dialog
  const [autoAssignConfirm, setAutoAssignConfirm] = useState<{
    asset: ProjectAsset;
    assignment?: WorkflowAssignment;
    reason: "unassigned" | "other";
    otherName?: string;
  } | null>(null);
  const [runnerWorkflow, setRunnerWorkflow] = useState<Workflow | null>(null);
  const [runnerLoading, setRunnerLoading] = useState<string | null>(null);
  const [runnerWorkflowConfigId, setRunnerWorkflowConfigId] = useState<string | undefined>(undefined);
  const [runnerExistingRunId, setRunnerExistingRunId] = useState<string | undefined>(undefined);
  const [runnerFeatureSelections, setRunnerFeatureSelections] = useState<import("../../services/productConfigService").FeatureSelection[] | undefined>(undefined);
  // Tracks paused workflow progress per asset: { done, total, completedTitles }
  const [pausedProgress, setPausedProgress] = useState<Record<string, { done: number; total: number; completedTitles: string[] }>>({});
  // Popover anchor for the paused progress badge
  const [progressPopoverAnchor, setProgressPopoverAnchor] = useState<HTMLElement | null>(null);
  const [progressPopoverAssetId, setProgressPopoverAssetId] = useState<string | null>(null);

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
  const [issueMedia, setIssueMedia] = useState<string[]>([]);
  // Issue detail dialog (comments / close)
  const [issueDetailAsset, setIssueDetailAsset] = useState<ProjectAsset | null>(null);
  const [issueDetailIssueId, setIssueDetailIssueId] = useState<string | null>(null);

  // Inline issue fields in chevron panel — keyed by issueId
  const [inlineCommentTexts, setInlineCommentTexts] = useState<Record<string, string>>({});
  const [inlineCorrectiveTexts, setInlineCorrectiveTexts] = useState<Record<string, string>>({});
  const [inlineSaving, setInlineSaving] = useState(false);
  const [inlineReportMedia,     setInlineReportMedia]     = useState<Record<string, string[]>>({});
  const [inlineResolutionMedia, setInlineResolutionMedia] = useState<Record<string, string[]>>({});

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
  // New run history dialog (with re-run support)
  const [runHistoryOpen, setRunHistoryOpen] = useState(false);
  const [runHistoryConfigId, setRunHistoryConfigId] = useState("");
  const [runHistoryConfigName, setRunHistoryConfigName] = useState("");
  const [runnerPrefillValues, setRunnerPrefillValues] = useState<Record<string, Record<string, string>> | undefined>(undefined);

  // Column filters
  const [colFilters, setColFilters] = useState<Record<string, string>>({});

  // CSV import
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvImporting, setCsvImporting] = useState(false);

  // Bulk selection
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [bulkTechOpen, setBulkTechOpen] = useState(false);
  const [bulkTechId, setBulkTechId] = useState("");
  const [bulkTechSaving, setBulkTechSaving] = useState(false);
  const [bulkWfOpen, setBulkWfOpen] = useState(false);
  const [bulkWfConfigId, setBulkWfConfigId] = useState("");
  const [bulkWfTypeId, setBulkWfTypeId] = useState("");
  const [bulkWfSaving, setBulkWfSaving] = useState(false);
  // Bulk documents
  const [bulkDocsOpen, setBulkDocsOpen] = useState(false);
  const [bulkDocsFile, setBulkDocsFile] = useState<File | null>(null);
  const [bulkDocsType, setBulkDocsType] = useState("Technical");
  const [bulkDocsName, setBulkDocsName] = useState("");
  const [bulkDocsSaving, setBulkDocsSaving] = useState(false);
  const [bulkDocsResult, setBulkDocsResult] = useState<string | null>(null);
  // Print / PDF dialog
  const [printOpen, setPrintOpen]         = useState(false);
  const [printScope, setPrintScope]       = useState<"selection" | "visible" | "custom">("visible");
  const [printTechId, setPrintTechId]     = useState("");
  const [printModel, setPrintModel]       = useState("");
  const [printStatuses, setPrintStatuses] = useState<string[]>(["NotStarted", "InProgress", "Complete", "Issue"]);
  const [printPendingSig, setPrintPendingSig] = useState(false);
  const [printColumns, setPrintColumns]   = useState<(keyof PrintRow)[]>([
    "assetTag", "assetName", "serialNumber", "assetModel", "location",
    "assignedTech", "status", "project", "sigStatus",
  ]);
  const [printGroupBy, setPrintGroupBy]   = useState<GroupByKey>("none");
  const [printGenerating, setPrintGenerating] = useState(false);

  // Override warning — fires before any bulk action when existing data would be affected
  const [bulkWarnOpen, setBulkWarnOpen] = useState(false);
  const [bulkWarnTitle, setBulkWarnTitle] = useState("");
  const [bulkWarnBody, setBulkWarnBody] = useState("");
  const [bulkWarnRows, setBulkWarnRows] = useState<{ assetTag: string; current: string }[]>([]);
  const bulkWarnProceedRef = useRef<(() => void) | null>(null);

  // PDF report
  const [reportGenerating, setReportGenerating] = useState<string | null>(null);
  // Extra context passed into WorkflowRunHistoryDialog for the PDF download
  const [runHistoryProject, setRunHistoryProject] = useState<{ customerName: string; jobNumber: string; siteName?: string } | null>(null);
  const [runHistoryCustomerLogo, setRunHistoryCustomerLogo] = useState<string | null>(null);
  // Asset documents
  const [docsOpen, setDocsOpen] = useState(false);
  const [docsAsset, setDocsAsset] = useState<ProjectAsset | null>(null);
  const [docsCountMap, setDocsCountMap] = useState<Record<string, number>>({});

  useEffect(() => {
    dispatch(fetchProducts());
    dispatch(fetchProjects());
    dispatch(fetchUsers());
    siteService.getSites().then(setSites).catch(() => {});
  }, [dispatch]);

  const products = useMemo(
    () => (productsState.items.length ? productsState.items : demoProducts),
    [productsState.items],
  );

  useEffect(() => {
    if (tab >= products.length) setTab(Math.max(0, products.length - 1));
  }, [tab, products.length]);

  // Restore product tab + project from URL params (priority) or sessionStorage (fallback).
  // Only saves to sessionStorage when a URL param provides a new value (not on SS restore,
  // which avoids the first-render race where tab=0 would overwrite the stored product).
  useEffect(() => {
    if (products.length === 0) return;
    const productIdFromUrl = searchParams.get("product");
    if (productIdFromUrl) {
      const idx = products.findIndex((p) => p.id === productIdFromUrl);
      if (idx >= 0) {
        setTab(idx);
        try { sessionStorage.setItem("installations_active_product_id", productIdFromUrl); } catch {}
      }
    } else {
      try {
        const stored = sessionStorage.getItem("installations_active_product_id");
        if (stored) {
          const idx = products.findIndex((p) => p.id === stored);
          if (idx >= 0) setTab(idx);
        }
      } catch {}
    }
    const projectIdFromUrl = searchParams.get("project");
    if (projectIdFromUrl) {
      setSelectedProjectId(projectIdFromUrl);
      try { sessionStorage.setItem("installations_selected_project_id", projectIdFromUrl); } catch {}
    }
  }, [products]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeProduct = products[tab];
  const activeFeatures = useMemo(() => (activeProduct?.features ?? []) as FeatureDef[], [activeProduct]);

  useEffect(() => {
    if (!activeProduct?.id) { setAssets([]); setConfigs([]); setPublishedWfConfigs([]); return; }
    // Increment the load ID so any in-flight load from a previous product is ignored
    const loadId = ++assetLoadIdRef.current;
    setLoadingAssets(true);
    Promise.all([
      projectAssetService.listByProduct(activeProduct.id),
      productConfigService.listByProduct(activeProduct.id),
      workflowConfigService.listByProduct(activeProduct.id, "Published"),
    ]).then(([a, c, wc]) => {
      if (loadId !== assetLoadIdRef.current) return; // Stale — a newer load is in flight
      setAssets(a);
      setConfigs(c);
      setPublishedWfConfigs(wc);
      setHealthMap((prev) => ({ ...prev, [activeProduct.id]: computeHealth(a) }));
      // Pre-load latest run per asset (for signature status in status chip) — fire-and-forget
      const uniqueProjectIds = [...new Set(a.map(asset => asset.projectId).filter(Boolean))];
      Promise.all(uniqueProjectIds.map(pid => assetWorkflowRunService.listLatestByProject(pid)))
        .then(results => {
          if (loadId !== assetLoadIdRef.current) return;
          const runMap: Record<string, AssetWorkflowRun[]> = {};
          results.flat().forEach(run => {
            if (!runMap[run.assetId]) runMap[run.assetId] = [];
            runMap[run.assetId].push(run);
          });
          setRunsMap(prev => {
            const merged = { ...runMap };
            // Don't overwrite assets that already have full run lists loaded
            Object.keys(prev).forEach(id => { merged[id] = prev[id]; });
            return merged;
          });
        }).catch(() => {/* non-blocking */});
      // Load document counts per asset (fire-and-forget, non-blocking)
      const countMap: Record<string, number> = {};
      Promise.all(a.map(async (asset) => {
        const docs = await assetDocumentLinkService.listByAsset(asset.id).catch(() => []);
        countMap[asset.id] = docs.length;
      })).then(() => {
        if (loadId !== assetLoadIdRef.current) return; // Stale
        setDocsCountMap(countMap);
      });
    }).finally(() => {
      if (loadId === assetLoadIdRef.current) setLoadingAssets(false);
    });
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

  // Projects filtered to those linked to the active product (used in add/edit dialogs)
  const productProjects = useMemo(
    () => projects.filter((p) => p.productIds?.includes(activeProduct?.id ?? "")),
    [projects, activeProduct?.id],
  );

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const configMap = useMemo(() => new Map(configs.map((c) => [c.id, c])), [configs]);
  const wfConfigMap = useMemo(() => new Map(publishedWfConfigs.map((c) => [c.id, c])), [publishedWfConfigs]);
  // For dropdowns: deduplicate by name, keeping only the highest version of each workflow
  const latestPublishedWfConfigs = useMemo(() => {
    const map = new Map<string, WorkflowConfig>();
    for (const wc of publishedWfConfigs) {
      const existing = map.get(wc.name);
      if (!existing || wc.version > existing.version) map.set(wc.name, wc);
    }
    return Array.from(map.values()).sort((a, b) =>
      `${a.configType ?? ""}${a.name}`.localeCompare(`${b.configType ?? ""}${b.name}`)
    );
  }, [publishedWfConfigs]);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  // ── Print scope computation (needs userMap / projectMap / configMap / runsMap) ──
  const printRows = useMemo((): PrintRow[] => {
    let pool = assets;
    if (printScope === "selection") {
      pool = assets.filter((a) => selectedAssetIds.has(a.id));
    } else if (printScope === "visible") {
      pool = visibleAssets;
    } else {
      pool = assets.filter((a) => {
        if (printTechId && a.assignedUserId !== printTechId) return false;
        if (printModel && !(a.assetModel ?? "").toLowerCase().includes(printModel.toLowerCase())) return false;
        if (!printStatuses.includes(a.status)) return false;
        if (printPendingSig) {
          const runs = runsMap[a.id] ?? [];
          if (!runs[0] || runs[0].signatureStatus !== "PendingCustomer") return false;
        }
        return true;
      });
    }
    const statusLabel: Record<string, string> = {
      NotStarted: "Not Started", InProgress: "In Progress", Complete: "Complete", Issue: "Issue",
    };
    return pool.map((a): PrintRow => {
      const tech        = a.assignedUserId ? userMap.get(a.assignedUserId) : undefined;
      const proj        = projectMap.get(a.projectId);
      const runs        = runsMap[a.id] ?? [];
      const latestRun   = runs[0];
      const assignments = assignmentsMap[a.id] ?? [];
      let wfStatus = "—";
      if (assignments.length > 0) {
        const names = assignments.map((x) => x.workflowTypeName || "Workflow").join(", ");
        wfStatus = latestRun
          ? `${latestRun.status === "Complete" ? "Done" : "In Progress"} (${names})`
          : `Assigned (${names})`;
      }
      let sigStatus = "—";
      if (latestRun) {
        const ss = latestRun.signatureStatus ?? "";
        if (ss === "PendingCustomer") sigStatus = "Pending Customer";
        else if (ss === "Signed")     sigStatus = "Signed";
        else if (ss === "Waived")     sigStatus = "Waived";
      }
      return {
        assetTag:     a.assetTag     ?? "",
        assetName:    a.assetName    ?? "",
        serialNumber: a.serialNumber ?? "",
        assetModel:   a.assetModel   ?? "",
        manufacturer: a.manufacturer ?? "",
        location:     a.location     ?? "",
        assignedTech: tech?.fullName ?? "",
        status:       statusLabel[a.status] ?? a.status,
        project:      proj ? `${proj.jobNumber} — ${proj.customerName}` : "",
        siteName:     (proj as unknown as Record<string, unknown>)?.siteName as string ?? "",
        notes:        a.notes        ?? "",
        configType:   a.configLabel  ?? "",
        wfStatus,
        sigStatus,
        _techId:    a.assignedUserId ?? "",
        _statusRaw: a.status,
        _projectId: a.projectId      ?? "",
      };
    });
  }, [
    printScope, assets, visibleAssets, selectedAssetIds,
    printTechId, printModel, printStatuses, printPendingSig,
    userMap, projectMap, runsMap, assignmentsMap,
  ]);

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

  /** Returns "Address, City" for a project's site, or empty string if unavailable */
  function getSiteLocation(siteId?: string): string {
    if (!siteId) return "";
    const site = sites.find((s) => s.id === siteId);
    if (!site) return "";
    const parts = [site.address, site.city].filter(Boolean);
    return parts.join(", ");
  }

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
      location: asset.location || getSiteLocation(projectMap.get(asset.projectId)?.siteId),
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
      setDeleteAsset(null);
      refreshAssets();
    } catch {
      alert("Failed to delete asset.");
    } finally {
      setDeletingAsset(false);
    }
  }

  async function confirmBulkDelete() {
    setBulkDeleting(true);
    const ids = Array.from(selectedAssetIds);
    try {
      await Promise.all(ids.map((id) => projectAssetService.remove(id)));
      setSelectedAssetIds(new Set());
      setBulkDeleteOpen(false);
      refreshAssets();
    } catch {
      alert("One or more assets could not be deleted.");
    } finally {
      setBulkDeleting(false);
    }
  }

  // ------------------------------------------------------------------
  // Work order runner
  // ------------------------------------------------------------------

  function parseFeatureSelectionsForConfig(configId: string | undefined) {
    if (!configId) return undefined;
    const cfg = workflowConfigs.find((c) => c.id === configId);
    if (!cfg?.featureSelectionsJson) return undefined;
    try { return JSON.parse(cfg.featureSelectionsJson) as import("../../services/productConfigService").FeatureSelection[]; } catch { return undefined; }
  }

  /** Build BomItem list from a product's feature dependencies for auto-populating the BOM. */
  async function fetchProductBomItems(productId: string): Promise<BomItem[]> {
    try {
      const productFeatures = await featureService.getByProduct(productId);
      if (productFeatures.length === 0) return [];
      const depLists = await Promise.all(productFeatures.map((f) => featureDependencyService.getByFeature(f.id)));
      const items: BomItem[] = [];
      depLists.forEach((deps, idx) => {
        const feature = productFeatures[idx];
        deps.forEach((dep) => {
          items.push({
            id: `dep-${dep.id}`,
            description: `${feature.name}: ${dep.name}`,
            isInventory: dep.isInventory,
            expectedQty: dep.defaultQty,
            unitOfMeasure: dep.unit || "ea",
            captureFields: dep.isInventory && dep.captureFields.length > 0 ? dep.captureFields : undefined,
          });
        });
      });
      return items;
    } catch {
      return [];
    }
  }

  // Auto-enrich the workflow BOM with product feature dependencies when the runner opens.
  useEffect(() => {
    if (!runnerOpen || !runnerWorkflow || !runnerAsset?.productId) return;
    // Skip if we already injected auto-items to avoid re-fetching on re-renders.
    if (runnerWorkflow.bomItems?.some((b) => b.id.startsWith("dep-"))) return;
    fetchProductBomItems(runnerAsset.productId).then((autoBomItems) => {
      if (autoBomItems.length > 0) {
        setRunnerWorkflow((prev) =>
          prev ? { ...prev, bomItems: [...(prev.bomItems ?? []), ...autoBomItems] } : prev
        );
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runnerOpen, runnerAsset?.productId, runnerWorkflow?.id]);

  async function handleStartWorkOrder(asset: ProjectAsset) {
    setRunnerLoading(asset.id);
    try {
      // New path: productConfigId → WorkflowConfig (published work instruction)
      if (asset.productConfigId) {
        const wfConfig = await workflowConfigService.getById(asset.productConfigId);
        if (!wfConfig) { alert("Work instruction config not found."); return; }
        let wf: Workflow | null = null;
        try { wf = JSON.parse(wfConfig.stepsJson) as Workflow; } catch {}
        if (!wf) { alert("Work instruction has no steps. Open it in Work Instructions and add steps first."); return; }

        // Find the active (non-locked) run so we can resume exactly where we left off
        let existingRunId: string | undefined = undefined;
        if (asset.status === "InProgress") {
          let runs: AssetWorkflowRun[] | undefined = runsMap[asset.id];
          if (!runs) {
            try { runs = await assetWorkflowRunService.listByAsset(asset.id); } catch {}
          }
          let activeRun = runs?.find((r) => r.workflowConfigId === wfConfig.id && !r.isLocked);
          if (!activeRun) {
            // Fallback: find any non-locked InProgress run (e.g. from a re-run of an assignment workflow)
            const candidates = (runs ?? []).filter(r => !r.isLocked && r.status === "InProgress");
            const fallback = candidates.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
            if (fallback && fallback.workflowConfigId !== wfConfig.id) {
              try {
                const activeCfg = await workflowConfigService.getById(fallback.workflowConfigId);
                if (activeCfg) {
                  let activeWf: Workflow | null = null;
                  try {
                    const parsed = JSON.parse(activeCfg.stepsJson);
                    if (parsed?.steps) activeWf = parsed as Workflow;
                    else if (Array.isArray(parsed)) activeWf = { id: activeCfg.id, name: activeCfg.name, productId: activeCfg.productId, createdAt: Date.now(), steps: parsed, media: [] };
                  } catch {}
                  if (activeWf) {
                    setRunnerExistingRunId(fallback.id);
                    setRunnerAsset(asset);
                    setRunnerWorkflow(activeWf);
                    setRunnerWorkflowConfigId(activeCfg.id);
                    setRunnerFeatureSelections(parseFeatureSelectionsForConfig(activeCfg.id));
                    setRunnerOpen(true);
                    return;
                  }
                }
              } catch { /* fall through */ }
            } else if (fallback) {
              activeRun = fallback;
            }
          }
          if (activeRun) existingRunId = activeRun.id;
        }

        setRunnerExistingRunId(existingRunId);
        setRunnerAsset(asset);
        setRunnerWorkflow(wf);
        setRunnerWorkflowConfigId(wfConfig.id);
        setRunnerFeatureSelections(parseFeatureSelectionsForConfig(wfConfig.id));
        setRunnerOpen(true);
        return;
      }
      // Legacy path: workflowTemplateId
      if (asset.workflowTemplateId) {
        const wf = await workflowTemplateService.getById(asset.workflowTemplateId);
        if (!wf) { alert("Workflow template not found."); return; }
        setRunnerExistingRunId(undefined);
        setRunnerAsset(asset);
        setRunnerWorkflow(wf);
        setRunnerWorkflowConfigId(undefined);
        setRunnerOpen(true);
        return;
      }
      alert("This asset has no work instruction assigned. Edit the asset and select a Configuration Type first.");
    } catch {
      alert("Failed to load workflow.");
    } finally {
      setRunnerLoading(null);
    }
  }

  async function handleWorkOrderComplete(capturedValues: Record<string, string>) {
    // Sync captured feature values back to the asset record — await so refreshAssets sees the new values
    if (runnerAsset && Object.keys(capturedValues).length > 0) {
      let existing: Record<string, string> = {};
      try { existing = JSON.parse(runnerAsset.featureValuesJson || "{}"); } catch {}
      const merged = { ...existing, ...capturedValues };
      await projectAssetService.update(runnerAsset.id, { featureValuesJson: JSON.stringify(merged) }).catch(console.warn);
    }
    refreshAssets();
  }

  async function syncPartialFeatureValues(asset: ProjectAsset, capturedValues: Record<string, string>) {
    if (Object.keys(capturedValues).length === 0) return;
    let existing: Record<string, string> = {};
    try { existing = JSON.parse(asset.featureValuesJson || "{}"); } catch {}
    const merged = { ...existing, ...capturedValues };
    await projectAssetService.update(asset.id, { featureValuesJson: JSON.stringify(merged) }).catch(console.warn);
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
      reportMedia: issueMedia.length > 0 ? issueMedia : undefined,
    };
    issues.push(newIssue);
    try {
      const updated = await projectAssetService.update(issueDialogAsset.id, { issuesJson: JSON.stringify(issues) });
      setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch { console.warn("Failed to add issue"); }
    setIssueDialogOpen(false);
    setIssueDialogAsset(null);
    setIssueForm({ description: "", severity: "medium" });
    setIssueMedia([]);
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

  async function handleIssueDetailSave(updatedIssue: AssetIssue) {
    if (!issueDetailAsset) return;
    let issues: AssetIssue[] = [];
    try { issues = JSON.parse(issueDetailAsset.issuesJson || "[]"); } catch {}
    issues = issues.map((i) => i.id === updatedIssue.id ? updatedIssue : i);
    try {
      const updated = await projectAssetService.update(issueDetailAsset.id, { issuesJson: JSON.stringify(issues) });
      setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      // Keep the dialog open with refreshed asset so the user sees the saved state
      setIssueDetailAsset(updated);
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

      // Find the active (non-locked) run so we can resume exactly where we left off
      let existingRunId: string | undefined = undefined;
      let runs: AssetWorkflowRun[] | undefined = runsMap[asset.id];
      if (!runs) {
        try { runs = await assetWorkflowRunService.listByAsset(asset.id); } catch {}
      }
      const activeRun = runs?.find((r) => r.workflowConfigId === assignment.workflowConfigId && !r.isLocked);
      if (activeRun) existingRunId = activeRun.id;

      setRunnerExistingRunId(existingRunId);
      setRunnerAsset(asset);
      setRunnerWorkflow(wf);
      setRunnerWorkflowConfigId(assignment.workflowConfigId);
      setRunnerFeatureSelections(parseFeatureSelectionsForConfig(assignment.workflowConfigId));
      setRunnerOpen(true);
    } catch { alert("Failed to load workflow."); } finally {
      setRunnerLoading(null);
    }
  }

  // ------------------------------------------------------------------
  // Auto-assign check — intercepts start/continue before opening runner
  // ------------------------------------------------------------------

  function checkAssignmentThenStart(asset: ProjectAsset, assignment?: WorkflowAssignment) {
    if (!asset.assignedUserId) {
      // Unassigned — warn and auto-assign
      setAutoAssignConfirm({ asset, assignment, reason: "unassigned" });
      return;
    }
    if (asset.assignedUserId !== currentUser.id) {
      // Assigned to someone else — warn before taking over
      const otherName = users.find((u) => u.id === asset.assignedUserId)?.fullName ?? "another technician";
      setAutoAssignConfirm({ asset, assignment, reason: "other", otherName });
      return;
    }
    // Assigned to me — start directly
    assignment ? handleStartAssignmentRun(asset, assignment) : handleStartWorkOrder(asset);
  }

  async function confirmAutoAssignAndStart() {
    if (!autoAssignConfirm) return;
    const { asset, assignment } = autoAssignConfirm;
    setAutoAssignConfirm(null);
    try {
      // Auto-assign to current user
      await projectAssetService.update(asset.id, { assignedUserId: currentUser.id });
      setAssets((prev) => prev.map((a) => a.id === asset.id ? { ...a, assignedUserId: currentUser.id } : a));
      // Flag for PM dashboard (localStorage — picked up by PM's Needs Attention panel)
      const flags = JSON.parse(localStorage.getItem("pm_auto_assign_flags") ?? "[]");
      flags.push({
        id: `${asset.id}-${Date.now()}`,
        assetId: asset.id,
        assetTag: asset.assetTag || (asset as any).assetName || asset.id,
        jobNumber: (asset as any).jobNumber || "",
        assignedBy: currentUser.fullName,
        assignedAt: new Date().toISOString(),
      });
      localStorage.setItem("pm_auto_assign_flags", JSON.stringify(flags));
      window.dispatchEvent(new Event("pm-auto-assign-flags-changed"));
    } catch {
      // Non-fatal — continue with start even if update fails
    }
    const updated = { ...asset, assignedUserId: currentUser.id };
    assignment ? handleStartAssignmentRun(updated, assignment) : handleStartWorkOrder(updated);
  }

  // ------------------------------------------------------------------
  // Run history + re-run
  // ------------------------------------------------------------------

  async function openRunHistory(asset: ProjectAsset, wfConfigId?: string, wfConfigName?: string) {
    // If a specific config was requested, open immediately
    if (wfConfigId) {
      const cached = wfConfigMap.get(wfConfigId);
      const cfgName = wfConfigName ?? cached?.displayName ?? cached?.name ?? "Workflow";
      setRunHistoryAsset(asset);
      setRunHistoryConfigId(wfConfigId);
      setRunHistoryConfigName(cfgName);
      _openRunHistoryProjectContext(asset);
      setRunHistoryOpen(true);
      return;
    }

    // No config specified — fetch runs from API to find the correct configId
    let assetRuns = runsMap[asset.id];
    if (!assetRuns) {
      try {
        assetRuns = await assetWorkflowRunService.listByAsset(asset.id);
        setRunsMap((prev) => ({ ...prev, [asset.id]: assetRuns! }));
      } catch {
        assetRuns = [];
      }
    }
    const latestRun = [...assetRuns].sort((a, b) =>
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    )[0];
    // Prefer: run's configId > asset.productConfigId > open dialog with no filter (shows all)
    const configId = latestRun?.workflowConfigId ?? asset.productConfigId ?? "";
    const cached = configId ? wfConfigMap.get(configId) : undefined;
    const cfgName = cached?.displayName ?? cached?.name ?? "Run History";
    setRunHistoryAsset(asset);
    setRunHistoryConfigId(configId);
    setRunHistoryConfigName(cfgName);
    _openRunHistoryProjectContext(asset);
    setRunHistoryOpen(true);
  }

  function _openRunHistoryProjectContext(asset: ProjectAsset) {
    const proj = projects.find((p) => p.id === asset.projectId);
    setRunHistoryProject(proj ? { customerName: proj.customerName, jobNumber: proj.jobNumber, siteName: proj.siteName } : null);
    setRunHistoryCustomerLogo(null);
    if (proj?.customerId) {
      customerService.getCustomers()
        .then(async (all) => {
          const rawLogo = all.find((c) => c.customerId === proj.customerId || c.id === proj.customerId)?.logo ?? null;
          const resolved = rawLogo ? await resolveImageToDataUrl(rawLogo) : null;
          setRunHistoryCustomerLogo(resolved);
        })
        .catch(() => setRunHistoryCustomerLogo(null));
    }
  }

  async function handleGeneratePdfReport(asset: ProjectAsset) {
    setReportGenerating(asset.id);
    try {
      // Runs — use cached value or fetch
      let runs = runsMap[asset.id];
      if (!runs) {
        try { runs = await assetWorkflowRunService.listByAsset(asset.id); } catch { runs = []; }
      }

      // Prefer the latest locked (Complete) run; fall back to newest run
      const sorted = [...(runs ?? [])].sort((a, b) => (b.runNumber ?? 0) - (a.runNumber ?? 0));
      const run = sorted.find((r) => r.isLocked) ?? sorted[0] ?? null;

      // Stub run if the asset has never been run
      const effectiveRun: AssetWorkflowRun = run ?? {
        id: "", assetId: asset.id,
        workflowConfigId: asset.productConfigId ?? "",
        workflowVersion: 1, workflowSnapshotJson: "{}",
        status: "InProgress", isLocked: false,
        stepResultsJson: "[]", issuesJson: "[]", timeTrackingJson: "[]",
        productiveSeconds: 0, downtimeSeconds: 0, downtimeEvents: 0,
        runNumber: 1, startedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };

      // Workflow config name
      const configId = effectiveRun.workflowConfigId || asset.productConfigId;
      const wfCfg = configId ? wfConfigMap.get(configId) : null;
      const configName = wfCfg?.displayName ?? wfCfg?.name ?? "Installation Record";

      // Assigned technician
      const tech = users.find((u) => u.id === asset.assignedUserId);

      // Project + customer logo
      const proj = projects.find((p) => p.id === asset.projectId);
      let rawCustomerLogo: string | null = null;
      if (proj?.customerId) {
        try {
          const allCustomers = await customerService.getCustomers();
          rawCustomerLogo = allCustomers.find((c) => c.customerId === proj.customerId || c.id === proj.customerId)?.logo ?? null;
        } catch { /* ignore */ }
      }

      // Business logo + customer logo — resolve data URL regardless of source format
      const brandSettings = await brandSettingsService.get();
      const [bizLogoResolved, custLogoResolved] = await Promise.all([
        brandSettings.logoBase64 ? resolveImageToDataUrl(brandSettings.logoBase64) : Promise.resolve(null),
        rawCustomerLogo ? resolveImageToDataUrl(rawCustomerLogo) : Promise.resolve(null),
      ]);

      await generateWorkflowReport({
        run: effectiveRun,
        asset,
        workflowConfigName: configName,
        businessLogoBase64: bizLogoResolved,
        customerLogoBase64: custLogoResolved,
        customerName: proj?.customerName,
        jobNumber: proj?.jobNumber,
        siteName: proj?.siteName,
        siteLocation: asset.location ?? undefined,
        assignedTechnician: tech?.fullName,
      });
    } catch (err) {
      console.error("[AssetInstallationPage] Report generation failed", err);
      alert("Failed to generate PDF report.");
    } finally {
      setReportGenerating(null);
    }
  }

  async function handleRerun(
    prefillValues: Record<string, Record<string, string>>,
    _latestRun: AssetWorkflowRun
  ) {
    const asset = runHistoryAsset;
    const configId = runHistoryConfigId;
    if (!asset || !configId) return;
    setRunHistoryOpen(false);

    setRunnerLoading(asset.id);
    try {
      const cfg = wfConfigMap.get(configId) ?? await workflowConfigService.getById(configId);
      if (!cfg) { alert("Workflow config not found."); return; }
      let wf: Workflow | null = null;
      try {
        const parsed = JSON.parse(cfg.stepsJson);
        if (parsed?.steps) wf = parsed as Workflow;
        else if (Array.isArray(parsed)) wf = { id: cfg.id, name: cfg.name, productId: cfg.productId, createdAt: Date.now(), steps: parsed, media: [] };
      } catch {}
      if (!wf || wf.steps.length === 0) { alert("This workflow has no steps defined."); return; }

      setRunnerPrefillValues(prefillValues);
      setRunnerExistingRunId(undefined); // fresh run
      setRunnerAsset(asset);
      setRunnerWorkflow(wf);
      setRunnerWorkflowConfigId(configId);
      setRunnerFeatureSelections(parseFeatureSelectionsForConfig(configId));
      setRunnerOpen(true);
      // Optimistically mark asset as InProgress so the Continue button shows if the user pauses
      setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, status: "InProgress" as const } : a));
    } catch { alert("Failed to load workflow."); } finally {
      setRunnerLoading(null);
    }
  }

  async function handleContinueRun(run: AssetWorkflowRun) {
    const asset = runHistoryAsset;
    if (!asset) return;
    setRunHistoryOpen(false);
    setRunnerLoading(asset.id);
    try {
      const cfg = wfConfigMap.get(run.workflowConfigId) ?? await workflowConfigService.getById(run.workflowConfigId);
      if (!cfg) { alert("Workflow config not found."); return; }
      let wf: Workflow | null = null;
      try {
        const parsed = JSON.parse(cfg.stepsJson);
        if (parsed?.steps) wf = parsed as Workflow;
        else if (Array.isArray(parsed)) wf = { id: cfg.id, name: cfg.name, productId: cfg.productId, createdAt: Date.now(), steps: parsed, media: [] };
      } catch {}
      if (!wf || wf.steps.length === 0) { alert("This workflow has no steps defined."); return; }
      setRunnerExistingRunId(run.id);
      setRunnerAsset(asset);
      setRunnerWorkflow(wf);
      setRunnerWorkflowConfigId(run.workflowConfigId);
      setRunnerFeatureSelections(parseFeatureSelectionsForConfig(run.workflowConfigId));
      setRunnerOpen(true);
    } catch { alert("Failed to load workflow."); } finally {
      setRunnerLoading(null);
    }
  }

  // useCallback with [] deps — setDocsCountMap (setState setter) is always stable,
  // so this callback never changes identity and won't destabilize the dialog's
  // reload useCallback, preventing an infinite re-render loop.
  const handleDocsChanged = useCallback((assetId: string, count: number) => {
    setDocsCountMap(prev => ({ ...prev, [assetId]: count }));
  }, []);

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

  function computeAssetHealth(asset: ProjectAsset, runs?: AssetWorkflowRun[]): "green" | "amber" | "red" | null {
    let assetIssuesList: AssetIssue[] = [];
    try { assetIssuesList = JSON.parse(asset.issuesJson || "[]"); } catch {}
    const runIssuesList: RunIssue[] = (runs ?? []).flatMap(r => {
      try { return JSON.parse(r.issuesJson || "[]") as RunIssue[]; } catch { return []; }
    });
    const openIssues = [...assetIssuesList.filter(i => !i.resolved), ...runIssuesList.filter(i => !i.resolved)];
    if (openIssues.some(i => i.severity === "high" || i.isBlocking)) return "red";
    if (openIssues.some(i => i.severity === "medium")) return "amber";
    if (openIssues.length === 0 && asset.status === "Complete") return "green";
    return null; // no open issues → use default status color
  }

  function formatRunDur(totalSeconds: number): string {
    const safe = Math.max(0, totalSeconds || 0);
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  async function saveInlineAssetIssue(asset: ProjectAsset, updatedIssue: AssetIssue) {
    setInlineSaving(true);
    try {
      let issues: AssetIssue[] = [];
      try { issues = JSON.parse(asset.issuesJson || "[]"); } catch {}
      const idx = issues.findIndex(i => i.id === updatedIssue.id);
      if (idx >= 0) issues[idx] = updatedIssue;
      await projectAssetService.patchIssues(asset.id, JSON.stringify(issues)).catch(console.warn);
      refreshAssets();
    } finally { setInlineSaving(false); }
  }

  async function saveInlineRunIssue(runId: string, assetId: string, updatedIssue: RunIssue) {
    setInlineSaving(true);
    try {
      const runs = runsMap[assetId] ?? [];
      const run = runs.find(r => r.id === runId);
      if (!run) return;
      let issues: RunIssue[] = [];
      try { issues = JSON.parse(run.issuesJson || "[]"); } catch {}
      const idx = issues.findIndex(i => i.id === updatedIssue.id);
      if (idx >= 0) issues[idx] = updatedIssue;
      await assetWorkflowRunService.patchIssues(runId, JSON.stringify(issues)).catch(console.warn);
      // Auto-lock run if this was the last blocking issue and run is still in-progress
      await assetWorkflowRunService.tryAutoComplete(runId).catch(() => {});
      await loadAssignmentsForAsset(assetId);
    } finally { setInlineSaving(false); }
  }

  function renderIssuesPanel(asset: ProjectAsset) {
    let issues: AssetIssue[] = [];
    try { issues = JSON.parse(asset.issuesJson || "[]"); } catch {}

    // Collect run issues WITH their runId for targeted patch saves
    const runs = runsMap[asset.id] ?? [];
    const runIssuesWithMeta: Array<RunIssue & { runId: string }> = [];
    for (const run of runs) {
      try {
        const ri = JSON.parse(run.issuesJson || "[]") as RunIssue[];
        runIssuesWithMeta.push(...ri.map(i => ({ ...i, runId: run.id })));
      } catch {}
    }

    const openCount = issues.filter(i => !i.resolved).length + runIssuesWithMeta.filter(i => !i.resolved).length;
    const totalCount = issues.length + runIssuesWithMeta.length;

    function renderIssueCard(
      issue: AssetIssue | RunIssue,
      onSaveComment: (updated: AssetIssue | RunIssue) => void,
      onCloseIssue: (note: string, media?: string[]) => void,
      isRunIssue?: boolean,
    ) {
      const comments = issue.comments ?? [];
      const commentVal = inlineCommentTexts[issue.id] ?? "";
      const correctiveVal = inlineCorrectiveTexts[issue.id] ?? "";
      const reportMediaVal    = inlineReportMedia[issue.id]     ?? [];
      const resolutionMediaVal = inlineResolutionMedia[issue.id] ?? [];
      return (
        <Paper key={issue.id} variant="outlined" sx={{ p: 1.5, bgcolor: issue.resolved ? "rgba(255,255,255,0.02)" : "rgba(244,67,54,0.03)", borderColor: issue.resolved ? "divider" : "error.dark", opacity: issue.resolved ? 0.65 : 1 }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="flex-start">
            {/* Col 1 — Issue Description */}
            <Box sx={{ flex: "0 0 28%", minWidth: 0 }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5 }} display="block" mb={0.5}>
                Issue Description
              </Typography>
              <Typography variant="caption" display="block" sx={{ mb: 0.5, textDecoration: issue.resolved ? "line-through" : "none" }}>
                {issue.description}
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap mb={0.5}>
                <Chip size="small" label={issue.severity.toUpperCase()} variant="outlined" sx={{ fontSize: 9, height: 16 }} />
                <Chip size="small" label={issue.isBlocking ? "Blocking" : "Observation"} color={issue.isBlocking ? "error" : "warning"} sx={{ fontSize: 9, height: 16 }} />
                {isRunIssue && <Chip size="small" label="Workflow" sx={{ fontSize: 9, height: 16, "& .MuiChip-label": { px: 0.5 } }} />}
                {issue.resolved && <Chip size="small" label="Resolved" color="success" sx={{ fontSize: 9, height: 16 }} />}
              </Stack>
              {issue.stepTitle && <Typography variant="caption" color="text.secondary" display="block">Step: {issue.stepTitle}</Typography>}
              <Typography variant="caption" color="text.disabled" display="block">
                {"createdBy" in issue && issue.createdBy ? `${issue.createdBy} · ` : ""}{new Date(issue.reportedAt).toLocaleString()}
              </Typography>
              {!issue.resolved && (
                <Box sx={{ mt: 1 }}>
                  <MediaCapture
                    media={reportMediaVal}
                    onChange={(m) => setInlineReportMedia(prev => ({ ...prev, [issue.id]: m }))}
                    label="Attach Photo / Video"
                    qrDocType="issue-photo"
                    qrLinkedTo={issue.id}
                  />
                </Box>
              )}
              {issue.resolved && (issue.reportMedia ?? []).length > 0 && (
                <Box sx={{ mt: 0.75 }}>
                  <MediaCapture
                    media={issue.reportMedia ?? []}
                    onChange={() => {}}
                    label="Reported Media"
                    disabled
                  />
                </Box>
              )}
            </Box>

            {/* Col 2 — Comments */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5 }} display="block" mb={0.5}>
                Comments
              </Typography>
              {comments.length === 0 ? (
                <Typography variant="caption" color="text.disabled" display="block" mb={0.75}>No comments yet.</Typography>
              ) : (
                <Stack spacing={0.75} sx={{ maxHeight: 120, overflowY: "auto", mb: 0.75 }}>
                  {comments.map(c => (
                    <Box key={c.id} sx={{ p: 0.5, borderRadius: 0.5, bgcolor: "rgba(255,255,255,0.04)" }}>
                      <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
                        <Typography variant="caption" fontWeight={700}>{c.author}</Typography>
                        <Typography variant="caption" color="text.disabled">{new Date(c.createdAt).toLocaleString()}</Typography>
                      </Stack>
                      <Typography variant="caption" display="block">{c.text}</Typography>
                    </Box>
                  ))}
                </Stack>
              )}
              {!issue.resolved && (
                <>
                  <TextField
                    size="small"
                    fullWidth
                    multiline
                    rows={2}
                    placeholder="Add a comment…"
                    value={commentVal}
                    onChange={(e) => setInlineCommentTexts(prev => ({ ...prev, [issue.id]: e.target.value }))}
                    sx={{ fontSize: 11, mb: 0.5 }}
                  />
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={!commentVal.trim() || inlineSaving}
                    onClick={() => {
                      const text = commentVal.trim();
                      if (!text) return;
                      const newComment = { id: crypto.randomUUID(), text, author: currentUser?.fullName ?? "User", createdAt: new Date().toISOString() };
                      onSaveComment({ ...issue, reportMedia: inlineReportMedia[issue.id]?.length ? inlineReportMedia[issue.id] : issue.reportMedia, comments: [...(issue.comments ?? []), newComment] });
                      setInlineCommentTexts(prev => ({ ...prev, [issue.id]: "" }));
                    }}
                    sx={{ fontSize: 11 }}
                  >
                    Save Comment
                  </Button>
                </>
              )}
            </Box>

            {/* Col 3 — Corrective Action */}
            <Box sx={{ flex: "0 0 28%", minWidth: 0 }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5 }} display="block" mb={0.5}>
                Corrective Action
              </Typography>
              {issue.resolved ? (
                <Typography variant="caption" display="block" sx={{ fontStyle: "italic", color: "text.secondary" }}>
                  {issue.resolutionNote ?? "—"}
                </Typography>
              ) : (
                <>
                  <TextField
                    size="small"
                    fullWidth
                    multiline
                    rows={3}
                    placeholder="Describe corrective action taken…"
                    value={correctiveVal}
                    onChange={(e) => setInlineCorrectiveTexts(prev => ({ ...prev, [issue.id]: e.target.value }))}
                    sx={{ fontSize: 11, mb: 0.75 }}
                  />
                  <Box sx={{ mb: 0.75 }}>
                    <MediaCapture
                      media={resolutionMediaVal}
                      onChange={(m) => setInlineResolutionMedia(prev => ({ ...prev, [issue.id]: m }))}
                      label="Resolution Evidence"
                      qrDocType="issue-photo"
                      qrLinkedTo={issue.id}
                    />
                  </Box>
                  <Button
                    size="small"
                    variant="contained"
                    color="success"
                    fullWidth
                    disabled={!correctiveVal.trim() || inlineSaving}
                    startIcon={<CheckCircleOutlined sx={{ fontSize: "0.85rem !important" }} />}
                    onClick={() => {
                      onCloseIssue(correctiveVal.trim(), resolutionMediaVal.length > 0 ? resolutionMediaVal : undefined);
                      setInlineCorrectiveTexts(prev => ({ ...prev, [issue.id]: "" }));
                      setInlineResolutionMedia(prev => ({ ...prev, [issue.id]: [] }));
                    }}
                    sx={{ fontSize: 11, py: 0.25 }}
                  >
                    Close Issue
                  </Button>
                </>
              )}
            </Box>
          </Stack>
        </Paper>
      );
    }

    return (
      <Box sx={{ mt: 1.5 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={0.75}>
          <Typography variant="caption" fontWeight={700} color="text.secondary"
            sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
            Issues {totalCount > 0 && `(${openCount} open)`}
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
        {totalCount === 0 ? (
          <Typography variant="caption" color="text.disabled">No issues recorded.</Typography>
        ) : (
          <Stack spacing={1}>
            {issues.map((issue) => renderIssueCard(
              issue,
              (updated) => saveInlineAssetIssue(asset, updated as AssetIssue),
              (note, media) => saveInlineAssetIssue(asset, { ...issue, resolved: true, resolutionNote: note, resolutionMedia: media, resolvedAt: new Date().toISOString(), resolvedBy: currentUser?.fullName ?? "User" }),
            ))}
            {runIssuesWithMeta.map((issue) => renderIssueCard(
              issue,
              (updated) => saveInlineRunIssue(issue.runId, asset.id, updated as RunIssue),
              (note, media) => saveInlineRunIssue(issue.runId, asset.id, { ...issue, resolved: true, resolutionNote: note, resolutionMedia: media, resolvedAt: new Date().toISOString(), resolvedBy: currentUser?.fullName ?? "User" }),
              true,
            ))}
          </Stack>
        )}
      </Box>
    );
  }

  function actionButton(asset: ProjectAsset) {
    const loading = runnerLoading === asset.id;
    if (!asset.productConfigId && !asset.workflowTemplateId) {
      return <Typography variant="caption" color="text.secondary">No workflow</Typography>;
    }
    const progress = pausedProgress[asset.id];
    const progressBadge = progress ? (
      <Tooltip title="Click to see completed steps">
        <Chip
          size="small"
          label={`${progress.done}/${progress.total} steps`}
          variant="outlined"
          color="warning"
          clickable
          sx={{ fontSize: 10, height: 20 }}
          onClick={(e) => {
            e.stopPropagation();
            setProgressPopoverAnchor(e.currentTarget);
            setProgressPopoverAssetId(asset.id);
          }}
        />
      </Tooltip>
    ) : null;
    if (asset.status === "NotStarted") {
      return (
        <Stack direction="row" spacing={0.5} alignItems="center">
          {progressBadge}
          <Button size="small" variant="outlined" color="success"
            startIcon={loading ? <CircularProgress size={12} /> : <PlayArrowOutlined />}
            disabled={loading} onClick={() => checkAssignmentThenStart(asset)}>
            Start
          </Button>
        </Stack>
      );
    }
    if (asset.status === "InProgress") {
      return (
        <Stack direction="row" spacing={0.5} alignItems="center">
          {progressBadge}
          <Button size="small" variant="contained" color="primary"
            startIcon={loading ? <CircularProgress size={12} /> : <PlayArrowOutlined />}
            disabled={loading} onClick={() => checkAssignmentThenStart(asset)}>
            Continue
          </Button>
        </Stack>
      );
    }
    if (asset.status === "Complete") {
      return (
        <Tooltip title="View run history, download report, or re-run workflow">
          <Button size="small" variant="text" color="inherit" startIcon={<HistoryOutlined />}
            onClick={() => openRunHistory(asset)}>
            View/Edit
          </Button>
        </Tooltip>
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
      <Table size="small" sx={{ maxWidth: 680, minWidth: 650 }}>
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
      case "configType": {
        const cfgType = cfg?.configType
          || (asset.productConfigId ? wfConfigMap.get(asset.productConfigId)?.configType : undefined);
        return <Typography variant="body2" color="text.secondary">{cfgType || "—"}</Typography>;
      }
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
        const status = asset.status as ProjectAssetStatus;
        const baseColor = STATUS_COLORS[status] ?? "default";
        const issueHealth = computeAssetHealth(asset, runsMap[asset.id] ?? []);
        // Check if complete but awaiting customer signature
        const latestRuns = runsMap[asset.id] ?? [];
        const latestLocked = latestRuns.find(r => r.isLocked);
        const awaitingCustomerSig = status === "Complete" && !!latestLocked
          && !latestLocked.customerSignedAt
          && latestLocked.signatureStatus !== "WaivedCustomer";
        const chipColor =
          issueHealth === "red"   ? "error"   :
          issueHealth === "amber" ? "warning" :
          awaitingCustomerSig     ? "warning" :
          issueHealth === "green" ? "success" :
          baseColor;
        const chipLabel =
          awaitingCustomerSig && issueHealth !== "red" && issueHealth !== "amber" ? "Awaiting Signature" :
          STATUS_LABELS[status] ?? asset.status;
        return (
          <Chip
            size="small"
            label={chipLabel}
            color={chipColor}
            icon={
              asset.status === "InProgress" ? <HourglassEmptyOutlined sx={{ fontSize: "0.9rem !important" }} /> :
              asset.status === "Complete" && !awaitingCustomerSig ? <CheckCircleOutlined sx={{ fontSize: "0.9rem !important" }} /> :
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
              const configRuns = runs.filter((r) => r.workflowConfigId === asgn.workflowConfigId);
              const latestRun = configRuns
                .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
              const totalProductive = configRuns.reduce((s, r) => s + (r.productiveSeconds ?? 0), 0);
              const totalDowntime   = configRuns.reduce((s, r) => s + (r.downtimeSeconds   ?? 0), 0);
              return (
                <Stack key={asgn.id} direction="row" alignItems="center" spacing={1}
                  sx={{ p: 0.75, borderRadius: 1, border: "1px solid", borderColor: "divider", bgcolor: "rgba(255,255,255,0.02)" }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="caption" fontWeight={600}>{asgn.workflowTypeName || "Workflow"}</Typography>
                    <Typography variant="caption" color="text.secondary" display="block" noWrap>
                      {asgn.workflowConfigName || asgn.workflowConfigId}
                    </Typography>
                    {configRuns.length > 0 && (
                      <Stack direction="row" spacing={0.5} mt={0.25} useFlexGap flexWrap="wrap">
                        <Chip size="small" label={`Productive ${formatRunDur(totalProductive)}`} color="success" variant="outlined"
                          sx={{ height: 14, fontSize: 9, "& .MuiChip-label": { px: 0.5 } }} />
                        {totalDowntime > 0 && (
                          <Chip size="small" label={`Downtime ${formatRunDur(totalDowntime)}`} color="warning" variant="outlined"
                            sx={{ height: 14, fontSize: 9, "& .MuiChip-label": { px: 0.5 } }} />
                        )}
                        {configRuns.length > 1 && (
                          <Chip size="small" label={`${configRuns.length} runs`} variant="outlined"
                            sx={{ height: 14, fontSize: 9, "& .MuiChip-label": { px: 0.5 } }} />
                        )}
                        {(() => {
                          // Collect all BOM items from completed runs for this assignment
                          const allBom: import("../../types/workflow").BomActualItem[] = [];
                          for (const r of configRuns) {
                            if (!r.bomActualJson) continue;
                            try { allBom.push(...JSON.parse(r.bomActualJson)); } catch { /* ignore */ }
                          }
                          if (allBom.length === 0) return null;
                          const invCount = allBom.filter(b => b.isInventory).reduce((s, b) => s + b.actualQty, 0);
                          const bomKey = `${asgn.id}`;
                          const isBomOpen = expandedBomAsgnId === bomKey;
                          return (
                            <Chip size="small"
                              label={`${allBom.length} part${allBom.length !== 1 ? "s" : ""}${invCount > 0 ? ` · ${invCount} inventory` : ""}`}
                              color="info" variant="outlined" clickable
                              sx={{ height: 14, fontSize: 9, "& .MuiChip-label": { px: 0.5 } }}
                              onClick={(e) => { e.stopPropagation(); setExpandedBomAsgnId(isBomOpen ? null : bomKey); }}
                            />
                          );
                        })()}
                      </Stack>
                    )}
                    {/* BOM expandable detail */}
                    {expandedBomAsgnId === asgn.id && (() => {
                      const allBom: import("../../types/workflow").BomActualItem[] = [];
                      for (const r of configRuns) {
                        if (!r.bomActualJson) continue;
                        try { allBom.push(...JSON.parse(r.bomActualJson)); } catch { /* ignore */ }
                      }
                      return allBom.length === 0 ? null : (
                        <Stack spacing={0.5} sx={{ mt: 0.5, pl: 0.5, borderLeft: "2px solid", borderColor: "info.main" }}>
                          {allBom.map((item, idx) => (
                            <Box key={idx}>
                              <Stack direction="row" spacing={0.75} alignItems="center">
                                <Typography variant="caption" fontWeight={600}>{item.description}</Typography>
                                <Typography variant="caption" color="text.secondary">× {item.actualQty} {item.unitOfMeasure}</Typography>
                              </Stack>
                              {item.isInventory && (item.unitCaptures ?? []).map((fields, i) => (
                                <Typography key={i} variant="caption" color="text.secondary" display="block" sx={{ pl: 1 }}>
                                  u{i + 1}: {Object.entries(fields).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—"}
                                </Typography>
                              ))}
                            </Box>
                          ))}
                        </Stack>
                      );
                    })()}
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
                  {can.modifyData && (
                    <Tooltip title={latestRun?.status === "Complete" ? "View run history, download report, or re-run workflow" : ""}>
                      <Button
                        size="small"
                        variant={latestRun?.status === "InProgress" ? "contained" : "outlined"}
                        color={latestRun?.status === "Issue" ? "error" : latestRun?.status === "Complete" ? "inherit" : "success"}
                        disabled={runLoading}
                        startIcon={runLoading ? <CircularProgress size={12} /> : latestRun?.status === "Complete" ? <HistoryOutlined /> : <PlayArrowOutlined />}
                        onClick={() =>
                          latestRun?.status === "Complete"
                            ? openRunHistory(asset, asgn.workflowConfigId, asgn.workflowConfigName)
                            : checkAssignmentThenStart(asset, asgn)
                        }
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenuAnchor(e.currentTarget);
                          setContextMenuAsset(asset);
                          setContextMenuAssignment(asgn);
                        }}
                        sx={{ fontSize: 11, py: 0.25 }}
                      >
                        {!latestRun ? "Start" : latestRun.status === "InProgress" ? "Continue" : latestRun.status === "Complete" ? "View/Edit" : "Review"}
                      </Button>
                    </Tooltip>
                  )}
                  {can.modifyData && (
                    <Tooltip title="Remove assignment">
                      <IconButton size="small" onClick={() => removeAssignment(asset.id, asgn.id)}>
                        <DeleteOutline sx={{ fontSize: "0.9rem" }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
              );
            })}
          </Stack>
        )}
      </Box>
    );
  }

  // ------------------------------------------------------------------
  // Time tracking summary panel (expanded asset row)
  // ------------------------------------------------------------------

  function renderTimeTrackingPanel(asset: ProjectAsset) {
    const runs = runsMap[asset.id] ?? [];
    if (runs.length === 0) return null;

    const totalProductive = runs.reduce((s, r) => s + (r.productiveSeconds ?? 0), 0);
    const totalDowntime   = runs.reduce((s, r) => s + (r.downtimeSeconds   ?? 0), 0);
    const totalDtEvents   = runs.reduce((s, r) => s + (r.downtimeEvents    ?? 0), 0);
    if (totalProductive === 0 && totalDowntime === 0) return null;

    // Collect all downtime entries across all runs for the breakdown table
    const allDowntimeEntries: Array<{ runNumber: number; reason: string | null; startedAtUtc: string; endedAtUtc?: string | null; durationSecs: number }> = [];
    for (const run of runs) {
      let entries: Array<{ id: string; category: string; startedAtUtc: string; endedAtUtc?: string | null; reason?: string | null }> = [];
      try { entries = JSON.parse(run.timeTrackingJson ?? "[]"); } catch {}
      for (const e of entries) {
        if (e.category !== "downtime") continue;
        const endMs   = e.endedAtUtc ? new Date(e.endedAtUtc).getTime() : (run.completedAt ? new Date(run.completedAt).getTime() : null);
        const durSecs = endMs ? Math.max(0, Math.floor((endMs - new Date(e.startedAtUtc).getTime()) / 1000)) : 0;
        allDowntimeEntries.push({ runNumber: run.runNumber ?? 1, reason: e.reason ?? null, startedAtUtc: e.startedAtUtc, endedAtUtc: e.endedAtUtc, durationSecs: durSecs });
      }
    }

    return (
      <Box>
        <Typography variant="caption" fontWeight={700} color="text.secondary"
          sx={{ textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 1 }}>
          Time Tracking
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mb={allDowntimeEntries.length > 0 ? 1.25 : 0}>
          <Chip size="small" color="success" variant="outlined"
            label={`Productive ${formatRunDur(totalProductive)}`}
            sx={{ height: 20, fontSize: 10 }} />
          <Chip size="small" color={totalDowntime > 0 ? "warning" : "default"} variant="outlined"
            label={`Downtime ${formatRunDur(totalDowntime)}`}
            sx={{ height: 20, fontSize: 10 }} />
          {totalDtEvents > 0 && (
            <Chip size="small" variant="outlined"
              label={`${totalDtEvents} downtime event${totalDtEvents !== 1 ? "s" : ""}`}
              sx={{ height: 20, fontSize: 10 }} />
          )}
          <Chip size="small" variant="outlined"
            label={`${runs.length} run${runs.length !== 1 ? "s" : ""} total`}
            sx={{ height: 20, fontSize: 10 }} />
        </Stack>

        {allDowntimeEntries.length > 0 && (
          <Table size="small" sx={{ maxWidth: 600, minWidth: 650 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: "rgba(255,255,255,0.03)" }}>
                <TableCell sx={{ fontSize: 10, py: 0.4, fontWeight: 700, color: "text.secondary", width: 40 }}>Run</TableCell>
                <TableCell sx={{ fontSize: 10, py: 0.4, fontWeight: 700, color: "text.secondary" }}>Reason</TableCell>
                <TableCell sx={{ fontSize: 10, py: 0.4, fontWeight: 700, color: "text.secondary", width: 60 }}>Started</TableCell>
                <TableCell sx={{ fontSize: 10, py: 0.4, fontWeight: 700, color: "text.secondary", width: 55 }}>Duration</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {allDowntimeEntries.map((e, i) => (
                <TableRow key={i}>
                  <TableCell sx={{ fontSize: 11, py: 0.5, color: "text.disabled" }}>#{e.runNumber}</TableCell>
                  <TableCell sx={{ fontSize: 11, py: 0.5 }}>
                    {e.reason || <Typography component="span" variant="caption" color="text.disabled">—</Typography>}
                  </TableCell>
                  <TableCell sx={{ fontSize: 11, py: 0.5, color: "text.secondary", whiteSpace: "nowrap" }}>
                    {new Date(e.startedAtUtc).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                  <TableCell sx={{ fontSize: 11, py: 0.5, color: "warning.main", whiteSpace: "nowrap" }}>
                    {e.durationSecs > 0 ? formatRunDur(e.durationSecs) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Box>
    );
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  const activeHealth = activeProduct ? healthMap[activeProduct.id] : undefined;

  const activeTimeRollup = useMemo(() => {
    let productive = 0;
    let downtime = 0;
    let downtimeEvents = 0;
    for (const asset of visibleAssets) {
      for (const run of runsMap[asset.id] ?? []) {
        productive      += run.productiveSeconds  ?? 0;
        downtime        += run.downtimeSeconds    ?? 0;
        downtimeEvents  += run.downtimeEvents     ?? 0;
      }
    }
    return { productive, downtime, downtimeEvents };
  }, [visibleAssets, runsMap]);

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
          {can.modifyData && (
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
          )}
          {can.modifyData && (
            <Button variant="contained" startIcon={<AddOutlined />} onClick={openAdd} disabled={!activeProduct}>Add asset</Button>
          )}
        </Stack>
      </Stack>

      {/* Product tabs with health dots */}
      <Paper className="glass-card" sx={{ p: 1.5 }}>
        <Tabs value={tab} onChange={(_, next) => { setTab(next); try { sessionStorage.setItem("installations_active_product_id", products[next]?.id ?? ""); } catch {} }} variant="scrollable" allowScrollButtonsMobile scrollButtons="auto">
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
            {(activeTimeRollup.productive > 0 || activeTimeRollup.downtime > 0) && (
              <>
                <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                <Tooltip title="Total productive time across all visible assets">
                  <Chip size="small" color="success" variant="outlined"
                    label={`Productive ${formatRunDur(activeTimeRollup.productive)}`}
                    sx={{ fontSize: 10, height: 20 }} />
                </Tooltip>
                {activeTimeRollup.downtime > 0 && (
                  <Tooltip title={`${activeTimeRollup.downtimeEvents} downtime event${activeTimeRollup.downtimeEvents !== 1 ? "s" : ""} across all visible assets`}>
                    <Chip size="small" color="warning" variant="outlined"
                      label={`Downtime ${formatRunDur(activeTimeRollup.downtime)}`}
                      sx={{ fontSize: 10, height: 20 }} />
                  </Tooltip>
                )}
              </>
            )}
          </Stack>
        </Paper>
      )}

      {/* Filters */}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} flexWrap="wrap" useFlexGap>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel shrink>Project</InputLabel>
          <Select label="Project" value={selectedProjectId} onChange={(e) => { setSelectedProjectId(e.target.value); try { sessionStorage.setItem("installations_selected_project_id", e.target.value); } catch {} }}>
            <MenuItem value="">All projects</MenuItem>
            {productProjects.map((p) => <MenuItem key={p.id} value={p.id}>{p.jobNumber} — {p.customerName}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel shrink>Status</InputLabel>
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

      {/* Bulk actions toolbar — visible when ≥1 asset is selected */}
      {selectedAssetIds.size > 0 && (
        <Paper className="glass-card" sx={{ px: 2, py: 1, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
          <Typography variant="body2" fontWeight={600}>
            {selectedAssetIds.size} asset{selectedAssetIds.size !== 1 ? "s" : ""} selected
          </Typography>

          {/* Assign workflow */}
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setBulkWfConfigId(""); setBulkWfTypeId("");
              const sel = visibleAssets.filter((a) => selectedAssetIds.has(a.id));
              const withWf = sel.filter((a) =>
                (assignmentsMap[a.id] && assignmentsMap[a.id].length > 0) ||
                a.status === "InProgress" || a.status === "Complete"
              );
              if (withWf.length === 0) { setBulkWfOpen(true); return; }
              setBulkWarnTitle("Some assets already have workflow assignments");
              setBulkWarnBody(
                "These assets already have one or more workflow assignments. Adding a new assignment will not remove existing ones. Assets that are In Progress or Completed may behave unexpectedly with additional assignments."
              );
              setBulkWarnRows(withWf.map((a) => ({
                assetTag: a.assetTag,
                current: assignmentsMap[a.id]?.map((x) => x.workflowTypeName || x.workflowTypeId).join(", ")
                  || a.status,
              })));
              bulkWarnProceedRef.current = () => setBulkWfOpen(true);
              setBulkWarnOpen(true);
            }}
          >
            Assign workflow
          </Button>

          {/* Assign technician */}
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setBulkTechId("");
              const sel = visibleAssets.filter((a) => selectedAssetIds.has(a.id));
              const withTech = sel.filter((a) => !!a.assignedUserId);
              if (withTech.length === 0) { setBulkTechOpen(true); return; }
              setBulkWarnTitle("Some assets already have a technician assigned");
              setBulkWarnBody(
                "These assets already have a technician assigned. Proceeding will replace their current assignment."
              );
              setBulkWarnRows(withTech.map((a) => ({
                assetTag: a.assetTag,
                current: userMap.get(a.assignedUserId!)?.fullName ?? "Unknown",
              })));
              bulkWarnProceedRef.current = () => setBulkTechOpen(true);
              setBulkWarnOpen(true);
            }}
          >
            Assign technician
          </Button>

          {/* Upload documents */}
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setBulkDocsFile(null); setBulkDocsType("Technical"); setBulkDocsName(""); setBulkDocsResult(null);
              const sel = visibleAssets.filter((a) => selectedAssetIds.has(a.id));
              const atLimit = sel.filter((a) => (docsCountMap[a.id] ?? 0) >= 3);
              const withDocs = sel.filter((a) => (docsCountMap[a.id] ?? 0) > 0 && (docsCountMap[a.id] ?? 0) < 3);
              const affected = [
                ...atLimit.map((a) => ({ assetTag: a.assetTag, current: "3/3 docs — will be skipped" })),
                ...withDocs.map((a) => ({ assetTag: a.assetTag, current: `${docsCountMap[a.id]}/3 docs (existing kept)` })),
              ];
              if (affected.length === 0) { setBulkDocsOpen(true); return; }
              setBulkWarnTitle("Some assets already have documents");
              setBulkWarnBody(
                "Assets at the 3-document limit will be skipped. For assets with fewer than 3 documents, existing documents will NOT be deleted — the new document will be added alongside them."
              );
              setBulkWarnRows(affected);
              bulkWarnProceedRef.current = () => setBulkDocsOpen(true);
              setBulkWarnOpen(true);
            }}
          >
            Upload documents
          </Button>

          {/* Export CSV */}
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              const selected = visibleAssets.filter((a) => selectedAssetIds.has(a.id));
              const headers = ["assetTag", "assetName", "serialNumber", "assetModel", "manufacturer", "location", "status"];
              const csv = [
                headers.join(","),
                ...selected.map((a) =>
                  headers.map((h) => `"${String((a as unknown as Record<string, unknown>)[h] ?? "").replace(/"/g, '""')}"`).join(",")
                ),
              ].join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `assets-export-${new Date().toISOString().slice(0, 10)}.csv`;
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export CSV
          </Button>

          {/* Bulk delete */}
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={() => setBulkDeleteOpen(true)}
          >
            Delete selected
          </Button>

          <Button size="small" color="inherit" onClick={() => setSelectedAssetIds(new Set())}>
            Clear
          </Button>
        </Paper>
      )}

      {/* Table toolbar */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Stack direction="row" spacing={1} alignItems="center">
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
          <Tooltip title="Print / Save PDF">
            <Button
              size="small"
              variant="outlined"
              startIcon={<PrintOutlined fontSize="small" />}
              onClick={() => {
                // Pre-scope to selection if any are selected
                setPrintScope(selectedAssetIds.size > 0 ? "selection" : "visible");
                setPrintOpen(true);
              }}
              sx={{ fontSize: 12 }}
            >
              Print / PDF
            </Button>
          </Tooltip>
        </Stack>
        {!archiveMode && can.editFields && (
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
          <Box sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 28, px: 0.5 }}>
                  <Checkbox
                    size="small"
                    indeterminate={selectedAssetIds.size > 0 && selectedAssetIds.size < visibleAssets.length}
                    checked={visibleAssets.length > 0 && selectedAssetIds.size === visibleAssets.length}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedAssetIds(new Set(visibleAssets.map((a) => a.id)));
                      else setSelectedAssetIds(new Set());
                    }}
                  />
                </TableCell>
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
                    sx={{ bgcolor: hasIssue ? "rgba(211,47,47,0.04)" : selectedAssetIds.has(asset.id) ? "rgba(var(--primary-rgb,25,118,210),0.08)" : undefined }}
                  >
                    <TableCell sx={{ px: 0.5 }}>
                      <Checkbox
                        size="small"
                        checked={selectedAssetIds.has(asset.id)}
                        onChange={(e) => {
                          setSelectedAssetIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(asset.id);
                            else next.delete(asset.id);
                            return next;
                          });
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ px: 1 }}>
                      <IconButton size="small" onClick={() => {
                        const nextId = isExpanded ? null : asset.id;
                        setExpandedAssetId(nextId);
                        if (nextId) loadAssignmentsForAsset(nextId);
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
                        {(can.modifyData || asset.status === "Complete") && actionButton(asset)}
                        {!can.viewOnly && (
                          <Tooltip title={`Documents (${docsCountMap[asset.id] ?? 0}/3)`}>
                            <IconButton size="small" onClick={() => { setDocsAsset(asset); setDocsOpen(true); }}>
                              <Badge
                                badgeContent={`${docsCountMap[asset.id] ?? 0}/3`}
                                color={
                                  (docsCountMap[asset.id] ?? 0) === 0 ? "default" :
                                  (docsCountMap[asset.id] ?? 0) === 3 ? "success" : "primary"
                                }
                                sx={{ "& .MuiBadge-badge": { fontSize: 9, minWidth: 28, height: 16 } }}
                              >
                                <FolderOutlined fontSize="small" />
                              </Badge>
                            </IconButton>
                          </Tooltip>
                        )}
                        {!can.viewOnly && (
                          <Tooltip title="Generate PDF report">
                            <span>
                              <IconButton size="small"
                                disabled={reportGenerating === asset.id}
                                onClick={() => handleGeneratePdfReport(asset)}>
                                {reportGenerating === asset.id
                                  ? <CircularProgress size={16} />
                                  : <ArticleOutlined fontSize="small" />}
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                        {can.modifyData && (
                          <Tooltip title="Edit asset">
                            <IconButton size="small" onClick={() => openEditAsset(asset)}>
                              <EditOutlined fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {can.modifyData && (
                          <Tooltip title="Delete asset">
                            <IconButton size="small" color="error" onClick={() => setDeleteAsset(asset)}>
                              <DeleteOutline fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
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
                          {(() => {
                            const timePanel = renderTimeTrackingPanel(asset);
                            return timePanel ? (
                              <>
                                <Divider sx={{ my: 1.5 }} />
                                {timePanel}
                              </>
                            ) : null;
                          })()}
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
          </Box>
        )}
      </Paper>

      {/* Add asset dialog */}
      <Dialog open={addOpen} onClose={() => !addSaving && setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add asset</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl size="small" fullWidth required>
              <InputLabel shrink>Project *</InputLabel>
              <Select
                label="Project *"
                value={addForm.projectId}
                onChange={(e) => {
                  const projId = e.target.value;
                  const proj = productProjects.find((p) => p.id === projId);
                  setAddForm((p) => ({
                    ...p,
                    projectId: projId,
                    location: p.location || getSiteLocation(proj?.siteId) || proj?.siteName || "",
                  }));
                }}
              >
                {productProjects.length === 0 && (
                  <MenuItem disabled value="">
                    No projects linked to {activeProduct?.name ?? "this product"}
                  </MenuItem>
                )}
                {productProjects.map((proj) => (
                  <MenuItem key={proj.id} value={proj.id}>
                    {proj.jobNumber} — {proj.customerName}
                    {proj.siteName ? ` (${proj.siteName})` : ""}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel shrink>Configuration Type</InputLabel>
              <Select
                label="Configuration Type"
                value={addForm.configId}
                onChange={(e) => setAddForm((p) => ({ ...p, configId: e.target.value }))}
              >
                <MenuItem value="">(None)</MenuItem>
                {latestPublishedWfConfigs.map((wc) => (
                  <MenuItem key={wc.id} value={wc.id}>
                    {wc.configType ? `${wc.configType} — ` : ""}{wc.name}{wc.version > 1 ? ` (v${wc.version})` : ""}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {publishedWfConfigs.length === 0 && (
              <Alert severity="info" sx={{ fontSize: 12 }}>
                No published work instructions for {activeProduct?.name ?? "this product"} yet. Publish one in Work Instructions first.
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
              placeholder="e.g. VEH-001"
              InputLabelProps={{ shrink: true }} />
            <TextField label="Asset Name" size="small" fullWidth
              value={addForm.assetName}
              onChange={(e) => setAddForm((p) => ({ ...p, assetName: e.target.value }))}
              placeholder="e.g. AGI-10, Shuttle Car, Skid Steer"
              helperText="Equipment type or model name"
              InputLabelProps={{ shrink: true }} />
            <TextField label="Serial Number" size="small" fullWidth
              value={addForm.serialNumber}
              onChange={(e) => setAddForm((p) => ({ ...p, serialNumber: e.target.value }))} />
            <TextField label="Asset Model" size="small" fullWidth
              value={addForm.assetModel}
              onChange={(e) => setAddForm((p) => ({ ...p, assetModel: e.target.value }))}
              placeholder="e.g. Axis P3245-V"
              InputLabelProps={{ shrink: true }} />
            <TextField label="Manufacturer" size="small" fullWidth
              value={addForm.manufacturer}
              onChange={(e) => setAddForm((p) => ({ ...p, manufacturer: e.target.value }))}
              placeholder="e.g. Axis, Cisco"
              InputLabelProps={{ shrink: true }} />
            <TextField
              label="Location" size="small" fullWidth
              value={addForm.location}
              onChange={(e) => setAddForm((p) => ({ ...p, location: e.target.value }))}
              placeholder="Auto-filled from project site"
              InputLabelProps={{ shrink: true }}
              helperText={
                addForm.projectId && projects.find((p) => p.id === addForm.projectId)?.siteName
                  ? `Site: ${projects.find((p) => p.id === addForm.projectId)?.siteName}`
                  : undefined
              }
            />
            <FormControl size="small" fullWidth>
              <InputLabel shrink>Assigned Technician</InputLabel>
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
              placeholder="e.g. AGI-10, Shuttle Car, Skid Steer"
              InputLabelProps={{ shrink: true }} />
            <FormControl size="small" fullWidth>
              <InputLabel shrink>Configuration Type</InputLabel>
              <Select
                label="Configuration Type"
                value={editForm.configId}
                onChange={(e) => setEditForm((p) => ({ ...p, configId: e.target.value }))}
              >
                <MenuItem value="">(None)</MenuItem>
                {latestPublishedWfConfigs.map((wc) => (
                  <MenuItem key={wc.id} value={wc.id}>
                    {wc.configType ? `${wc.configType} — ` : ""}{wc.name}{wc.version > 1 ? ` (v${wc.version})` : ""}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
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
              <InputLabel shrink>Assigned Technician</InputLabel>
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
              <InputLabel shrink>Status</InputLabel>
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

      {/* Bulk delete confirmation */}
      <Dialog open={bulkDeleteOpen} onClose={() => !bulkDeleting && setBulkDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete {selectedAssetIds.size} Asset{selectedAssetIds.size !== 1 ? "s" : ""}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" gutterBottom>
            You are about to permanently delete <strong>{selectedAssetIds.size}</strong> asset{selectedAssetIds.size !== 1 ? "s" : ""}. This cannot be undone.
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Associated workflow runs, issues, and documents will also be removed.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleting}>Cancel</Button>
          <Button variant="contained" color="error" onClick={confirmBulkDelete} disabled={bulkDeleting}
            startIcon={bulkDeleting ? <CircularProgress size={14} /> : undefined}>
            {bulkDeleting ? "Deleting…" : `Delete ${selectedAssetIds.size}`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add issue dialog */}
      <Dialog open={issueDialogOpen} onClose={() => { setIssueDialogOpen(false); setIssueDialogAsset(null); setIssueMedia([]); }} maxWidth="xs" fullWidth>
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
              InputLabelProps={{ shrink: true }}
            />
            <FormControl size="small" fullWidth>
              <InputLabel shrink>Severity</InputLabel>
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
            <MediaCapture
              media={issueMedia}
              onChange={setIssueMedia}
              label="Attach Photo / Video (optional)"
              qrDocType="issue-photo"
              qrLinkedTo={issueDialogAsset?.id ?? ""}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setIssueDialogOpen(false); setIssueDialogAsset(null); setIssueMedia([]); }}>Cancel</Button>
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
              <InputLabel shrink>Workflow Type *</InputLabel>
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
              <InputLabel shrink>Workflow Config (Published) *</InputLabel>
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
                  <Table size="small" sx={{ minWidth: 650 }}>
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

      {/* Legacy run history dialog (assignment panel history icon) */}
      {runHistoryAsset && runHistoryAssignment && (
        <AssetWorkflowRunHistoryDialog
          open={Boolean(runHistoryAsset && runHistoryAssignment)}
          onClose={() => { setRunHistoryAsset(null); setRunHistoryAssignment(null); }}
          asset={runHistoryAsset}
          assignment={runHistoryAssignment}
        />
      )}

      {/* New run history dialog — View/Edit button → history, re-run, PDF report */}
      {docsOpen && docsAsset && (
        <AssetDocumentsDialog
          open={docsOpen}
          onClose={() => setDocsOpen(false)}
          asset={docsAsset}
          currentUserName={currentUser?.fullName ?? ""}
          onDocsChanged={handleDocsChanged}
          products={products}
        />
      )}

      {runHistoryOpen && runHistoryAsset && (
        <WorkflowRunHistoryDialog
          open={runHistoryOpen}
          onClose={() => { setRunHistoryOpen(false); }}
          asset={runHistoryAsset}
          workflowConfigId={runHistoryConfigId}
          workflowConfigName={runHistoryConfigName}
          currentUserName={currentUser?.fullName ?? ""}
          onRerun={handleRerun}
          onContinue={handleContinueRun}
          project={runHistoryProject ?? undefined}
          customerLogoBase64={runHistoryCustomerLogo}
          assignedTechnician={users.find((u) => u.id === runHistoryAsset?.assignedUserId)?.fullName}
        />
      )}

      {/* Paused progress popover — click badge to see completed steps */}
      <Popover
        open={Boolean(progressPopoverAnchor)}
        anchorEl={progressPopoverAnchor}
        onClose={() => { setProgressPopoverAnchor(null); setProgressPopoverAssetId(null); }}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
        slotProps={{ paper: { sx: { p: 1.5, minWidth: 220, maxWidth: 320 } } }}
      >
        {progressPopoverAssetId && (() => {
          const prog = pausedProgress[progressPopoverAssetId];
          if (!prog) return null;
          return (
            <Box>
              <Typography variant="caption" fontWeight={700} color="text.secondary"
                sx={{ textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 1 }}>
                Progress — {prog.done} of {prog.total} steps
              </Typography>
              <Stack spacing={0.4}>
                {prog.completedTitles.map((title, idx) => (
                  <Stack key={idx} direction="row" alignItems="center" spacing={0.75}>
                    <CheckCircleOutlined sx={{ fontSize: 14, color: "success.main", flexShrink: 0 }} />
                    <Typography variant="caption" noWrap>{title || `Step ${idx + 1}`}</Typography>
                  </Stack>
                ))}
                {prog.done < prog.total && (
                  <Stack direction="row" alignItems="center" spacing={0.75} sx={{ opacity: 0.45 }}>
                    <HourglassEmptyOutlined sx={{ fontSize: 14, flexShrink: 0 }} />
                    <Typography variant="caption">{prog.total - prog.done} step{prog.total - prog.done !== 1 ? "s" : ""} remaining</Typography>
                  </Stack>
                )}
              </Stack>
            </Box>
          );
        })()}
      </Popover>

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
      {/* ── Auto-assign warning dialog ── */}
      <Dialog open={!!autoAssignConfirm} onClose={() => setAutoAssignConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {autoAssignConfirm?.reason === "unassigned" ? "Unassigned asset" : "Asset assigned to someone else"}
        </DialogTitle>
        <DialogContent>
          {autoAssignConfirm?.reason === "unassigned" ? (
            <Typography variant="body2">
              <strong>{autoAssignConfirm.asset.assetTag || autoAssignConfirm.asset.assetName}</strong> has no installer assigned.
              Starting this workflow will assign it to <strong>you ({currentUser.fullName})</strong> and notify the Project Manager.
            </Typography>
          ) : (
            <Typography variant="body2">
              <strong>{autoAssignConfirm?.asset.assetTag || autoAssignConfirm?.asset.assetName}</strong> is currently assigned to <strong>{autoAssignConfirm?.otherName}</strong>.
              Starting this workflow will reassign it to <strong>you ({currentUser.fullName})</strong> and notify the Project Manager.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAutoAssignConfirm(null)}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={confirmAutoAssignAndStart}>
            Assign to me &amp; Start
          </Button>
        </DialogActions>
      </Dialog>

      {runnerOpen && runnerWorkflow && runnerAsset && activeProduct && (
        <WorkOrderRunner
          open={runnerOpen}
          onClose={() => {
            const closedAssetId = runnerAsset?.id;
            setRunnerOpen(false);
            setRunnerAsset(null);
            setRunnerWorkflow(null);
            setRunnerWorkflowConfigId(undefined);
            setRunnerFeatureSelections(undefined);
            setRunnerExistingRunId(undefined);
            setRunnerPrefillValues(undefined);
            refreshAssets();
            if (closedAssetId) loadAssignmentsForAsset(closedAssetId);
          }}
          workflow={runnerWorkflow}
          productId={activeProduct.id}
          productName={activeProduct.name}
          projectAssetId={runnerAsset.id}
          workflowConfigId={runnerWorkflowConfigId}
          existingRunId={runnerExistingRunId}
          prefillValues={runnerPrefillValues}
          currentUserName={currentUser.fullName}
          currentUserId={currentUser.id}
          assetTag={runnerAsset.assetTag || (runnerAsset as any).assetName || ""}
          jobNumber={(runnerAsset as any).jobNumber || ""}
          productFeatures={activeProduct.features}
          featureSelections={runnerFeatureSelections}
          onComplete={(vals) => {
            // Clear paused progress badge on completion
            if (runnerAsset) setPausedProgress((prev) => { const n = { ...prev }; delete n[runnerAsset.id]; return n; });
            handleWorkOrderComplete(vals);
          }}
          onPause={(progress) => {
            if (runnerAsset) {
              // Optimistically mark asset as InProgress so Continue button appears after pause
              setAssets(prev => prev.map(a => a.id === runnerAsset.id ? { ...a, status: "InProgress" as const } : a));
              setPausedProgress((prev) => ({ ...prev, [runnerAsset.id]: progress }));
              // Sync any feature values captured so far so the chevron shows partial data
              syncPartialFeatureValues(runnerAsset, progress.partialFeatureValues);
            }
          }}
        />
      )}

      {/* Issue detail dialog (comments / close) */}
      {issueDetailAsset && issueDetailIssueId && (() => {
        let issues: AssetIssue[] = [];
        try { issues = JSON.parse(issueDetailAsset.issuesJson || "[]"); } catch {}
        const issue = issues.find((i) => i.id === issueDetailIssueId);
        return issue ? (
          <IssueDetailDialog
            open={Boolean(issueDetailIssueId)}
            issue={issue}
            currentUser={currentUser?.fullName ?? currentUser?.email ?? "User"}
            onClose={() => { setIssueDetailIssueId(null); setIssueDetailAsset(null); }}
            onSave={(updated) => handleIssueDetailSave(updated as AssetIssue)}
          />
        ) : null;
      })()}
      {/* Override warning dialog — appears before any destructive bulk action */}
      <Dialog
        open={bulkWarnOpen}
        onClose={() => setBulkWarnOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { border: "1px solid", borderColor: "warning.main" } }}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, color: "warning.main" }}>
          <ReportProblemOutlined fontSize="small" />
          {bulkWarnTitle}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>{bulkWarnBody}</Typography>
          <Box
            sx={{
              maxHeight: 220,
              overflowY: "auto",
              borderRadius: 1,
              border: "1px solid var(--stroke)",
              bgcolor: "rgba(0,0,0,0.04)",
            }}
          >
            <Table size="small" sx={{ minWidth: 650 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, py: 0.5 }}>Asset Tag</TableCell>
                  <TableCell sx={{ fontWeight: 700, py: 0.5 }}>Current state</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {bulkWarnRows.map((row) => (
                  <TableRow key={row.assetTag}>
                    <TableCell sx={{ py: 0.5 }}>{row.assetTag}</TableCell>
                    <TableCell sx={{ py: 0.5, color: "text.secondary" }}>{row.current}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setBulkWarnOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => {
              setBulkWarnOpen(false);
              bulkWarnProceedRef.current?.();
            }}
          >
            Understood — continue
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk: Assign technician dialog */}
      <Dialog open={bulkTechOpen} onClose={() => setBulkTechOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Assign technician to {selectedAssetIds.size} asset{selectedAssetIds.size !== 1 ? "s" : ""}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel shrink>Technician</InputLabel>
            <Select label="Technician" value={bulkTechId} onChange={(e) => setBulkTechId(e.target.value)}>
              <MenuItem value="">(Unassign)</MenuItem>
              {users.filter((u) => u.isActive).map((u) => (
                <MenuItem key={u.id} value={u.id}>{u.fullName}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setBulkTechOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={bulkTechSaving}
            onClick={async () => {
              setBulkTechSaving(true);
              try {
                await Promise.all(
                  [...selectedAssetIds].map((assetId) =>
                    projectAssetService.update(assetId, { assignedUserId: bulkTechId || null } as Parameters<typeof projectAssetService.update>[1])
                  )
                );
                refreshAssets();
                setSelectedAssetIds(new Set());
                setBulkTechOpen(false);
              } finally {
                setBulkTechSaving(false);
              }
            }}
          >
            {bulkTechSaving ? "Saving…" : "Apply"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk: Assign workflow dialog */}
      <Dialog open={bulkWfOpen} onClose={() => setBulkWfOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Assign workflow to {selectedAssetIds.size} asset{selectedAssetIds.size !== 1 ? "s" : ""}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel shrink>Workflow type</InputLabel>
              <Select label="Workflow type" value={bulkWfTypeId} onChange={(e) => setBulkWfTypeId(e.target.value)}>
                {workflowTypes.map((wt) => (
                  <MenuItem key={wt.id} value={wt.id}>{wt.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel shrink>Workflow config</InputLabel>
              <Select label="Workflow config" value={bulkWfConfigId} onChange={(e) => setBulkWfConfigId(e.target.value)}>
                {latestPublishedWfConfigs.map((wc) => (
                  <MenuItem key={wc.id} value={wc.id}>{wc.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setBulkWfOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={bulkWfSaving || !bulkWfTypeId || !bulkWfConfigId}
            onClick={async () => {
              setBulkWfSaving(true);
              try {
                await Promise.all(
                  [...selectedAssetIds].map((assetId) =>
                    assetWorkflowAssignmentService.create(assetId, bulkWfConfigId, bulkWfTypeId)
                  )
                );
                setSelectedAssetIds(new Set());
                setBulkWfOpen(false);
              } finally {
                setBulkWfSaving(false);
              }
            }}
          >
            {bulkWfSaving ? "Saving…" : "Apply"}
          </Button>
        </DialogActions>
      </Dialog>
      {/* ── Print / PDF dialog ─────────────────────────────────────────────── */}
      <Dialog
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ className: "glass-card", sx: { bgcolor: "var(--panel)", border: "1px solid var(--stroke)" } }}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <PrintOutlined fontSize="small" />
          Print / Save PDF
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ pt: 1 }}>

            {/* ── Scope ── */}
            <Box>
              <FormLabel component="legend" sx={{ fontWeight: 700, mb: 1, fontSize: 13 }}>Scope</FormLabel>
              <RadioGroup
                row
                value={printScope}
                onChange={(e) => setPrintScope(e.target.value as typeof printScope)}
              >
                <FormControlLabel
                  value="selection"
                  control={<Radio size="small" />}
                  label={`Current selection (${selectedAssetIds.size})`}
                  disabled={selectedAssetIds.size === 0}
                />
                <FormControlLabel value="visible" control={<Radio size="small" />} label={`All visible (${visibleAssets.length})`} />
                <FormControlLabel value="custom"  control={<Radio size="small" />} label="Custom filter" />
              </RadioGroup>
            </Box>

            {/* ── Custom filters ── */}
            {printScope === "custom" && (
              <Box sx={{ pl: 2, borderLeft: "3px solid var(--stroke)" }}>
                <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Custom filters</Typography>
                <Stack spacing={2}>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <FormControl size="small" sx={{ minWidth: 200 }}>
                      <InputLabel shrink>Technician</InputLabel>
                      <Select label="Technician" value={printTechId} onChange={(e) => setPrintTechId(e.target.value)}>
                        <MenuItem value="">(All technicians)</MenuItem>
                        {users.filter((u) => u.isActive).map((u) => (
                          <MenuItem key={u.id} value={u.id}>{u.fullName}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <TextField
                      size="small"
                      label="Asset model contains"
                      value={printModel}
                      onChange={(e) => setPrintModel(e.target.value)}
                      sx={{ minWidth: 200 }}
                    />
                  </Stack>

                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>Statuses to include</Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {(["NotStarted", "InProgress", "Complete", "Issue"] as const).map((s) => {
                        const labels: Record<string, string> = {
                          NotStarted: "Not Started", InProgress: "In Progress", Complete: "Complete", Issue: "Issue",
                        };
                        const checked = printStatuses.includes(s);
                        return (
                          <FormControlLabel
                            key={s}
                            control={
                              <Checkbox
                                size="small"
                                checked={checked}
                                onChange={() =>
                                  setPrintStatuses((prev) =>
                                    checked ? prev.filter((x) => x !== s) : [...prev, s]
                                  )
                                }
                              />
                            }
                            label={labels[s]}
                          />
                        );
                      })}
                    </Stack>
                  </Box>

                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={printPendingSig}
                        onChange={(e) => setPrintPendingSig(e.target.checked)}
                      />
                    }
                    label="Pending customer signature only"
                  />
                </Stack>
              </Box>
            )}

            {/* ── Column picker ── */}
            <Box>
              <FormLabel component="legend" sx={{ fontWeight: 700, mb: 1, fontSize: 13 }}>Columns to include</FormLabel>
              <FormGroup row>
                {ALL_PRINT_COLUMNS.filter((c) => !c.id.startsWith("_")).map((col) => {
                  const checked = printColumns.includes(col.id);
                  const isAlways = col.id === "assetTag";
                  return (
                    <FormControlLabel
                      key={col.id}
                      control={
                        <Checkbox
                          size="small"
                          checked={checked || isAlways}
                          disabled={isAlways}
                          onChange={() =>
                            setPrintColumns((prev) =>
                              checked ? prev.filter((x) => x !== col.id) : [...prev, col.id]
                            )
                          }
                        />
                      }
                      label={col.label}
                      sx={{ mr: 2, mb: 0.5 }}
                    />
                  );
                })}
              </FormGroup>
            </Box>

            {/* ── Group by ── */}
            <Box>
              <FormLabel component="legend" sx={{ fontWeight: 700, mb: 1, fontSize: 13 }}>Group by</FormLabel>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={printGroupBy}
                onChange={(_, v) => { if (v) setPrintGroupBy(v as GroupByKey); }}
              >
                <ToggleButton value="none">None</ToggleButton>
                <ToggleButton value="technician">Technician</ToggleButton>
                <ToggleButton value="status">Status</ToggleButton>
                <ToggleButton value="project">Project</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* ── Preview count ── */}
            <Alert
              severity={printRows.length === 0 ? "warning" : "info"}
              sx={{ py: 0.5 }}
            >
              {printRows.length === 0
                ? "No assets match the current filters."
                : `${printRows.length} asset${printRows.length !== 1 ? "s" : ""} will be included · ${printColumns.length} column${printColumns.length !== 1 ? "s" : ""} · grouped by ${printGroupBy}`}
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button variant="outlined" onClick={() => setPrintOpen(false)}>Cancel</Button>
          <Button
            variant="outlined"
            startIcon={<FileDownloadOutlined fontSize="small" />}
            disabled={printRows.length === 0 || printGenerating}
            onClick={async () => {
              setPrintGenerating(true);
              try {
                const logoBase64 = await brandSettingsService.get().then((s) => s?.logoBase64 ?? null).catch(() => null);
                await generateAssetListReport({
                  rows: printRows,
                  columns: printColumns.includes("assetTag") ? printColumns : ["assetTag", ...printColumns],
                  groupBy: printGroupBy,
                  meta: {
                    productName: activeProduct?.name ?? "",
                    filterSummary: printScope === "selection"
                      ? `${printRows.length} selected assets`
                      : printScope === "custom"
                      ? [printTechId ? `Tech: ${userMap.get(printTechId)?.fullName}` : "", printModel ? `Model: ${printModel}` : "", printPendingSig ? "Pending Sig" : ""].filter(Boolean).join(" · ")
                      : "All visible assets",
                    exportDate: new Date().toLocaleDateString(),
                    logoBase64,
                  },
                  mode: "download",
                  filename: `assets-${activeProduct?.name ?? "report"}-${new Date().toISOString().slice(0, 10)}.pdf`,
                });
              } finally {
                setPrintGenerating(false);
              }
            }}
          >
            {printGenerating ? "Generating…" : "Download PDF"}
          </Button>
          <Button
            variant="contained"
            startIcon={<PrintOutlined fontSize="small" />}
            disabled={printRows.length === 0 || printGenerating}
            onClick={async () => {
              setPrintGenerating(true);
              try {
                const logoBase64 = await brandSettingsService.get().then((s) => s?.logoBase64 ?? null).catch(() => null);
                await generateAssetListReport({
                  rows: printRows,
                  columns: printColumns.includes("assetTag") ? printColumns : ["assetTag", ...printColumns],
                  groupBy: printGroupBy,
                  meta: {
                    productName: activeProduct?.name ?? "",
                    filterSummary: printScope === "selection"
                      ? `${printRows.length} selected assets`
                      : printScope === "custom"
                      ? [printTechId ? `Tech: ${userMap.get(printTechId)?.fullName}` : "", printModel ? `Model: ${printModel}` : "", printPendingSig ? "Pending Sig" : ""].filter(Boolean).join(" · ")
                      : "All visible assets",
                    exportDate: new Date().toLocaleDateString(),
                    logoBase64,
                  },
                  mode: "print",
                });
              } finally {
                setPrintGenerating(false);
              }
            }}
          >
            {printGenerating ? "Generating…" : "Print"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk: Upload documents dialog */}
      <Dialog open={bulkDocsOpen} onClose={() => setBulkDocsOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Upload document to {selectedAssetIds.size} asset{selectedAssetIds.size !== 1 ? "s" : ""}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info" sx={{ fontSize: 12 }}>
              The same file will be linked to every selected asset. Assets already at 3 documents will be skipped automatically.
            </Alert>
            <Stack direction="row" spacing={1} alignItems="center">
              <Button variant="outlined" component="label" sx={{ justifyContent: "flex-start", textTransform: "none", flex: 1 }}>
                {bulkDocsFile ? bulkDocsFile.name : "Choose file…"}
                <input
                  type="file"
                  hidden
                  accept=".pdf,.xlsx,.xls,.docx,.doc,.json,.png,.jpg,.jpeg"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setBulkDocsFile(f);
                    if (f && !bulkDocsName) setBulkDocsName(f.name.replace(/\.[^.]+$/, ""));
                  }}
                />
              </Button>
              <QRUploadButton
                docType={bulkDocsType}
                linkedTo="bulk"
                label="Phone"
                onUploaded={async (documentId) => {
                  setBulkDocsSaving(true);
                  setBulkDocsResult(null);
                  const ids = [...selectedAssetIds];
                  let uploaded = 0, skipped = 0, failed = 0;
                  await Promise.all(ids.map(async (assetId) => {
                    if ((docsCountMap[assetId] ?? 0) >= 3) { skipped++; return; }
                    try {
                      await assetDocumentLinkService.attach(assetId, documentId, currentUser?.fullName ?? undefined);
                      uploaded++;
                      setDocsCountMap((prev) => ({ ...prev, [assetId]: (prev[assetId] ?? 0) + 1 }));
                    } catch { failed++; }
                  }));
                  setBulkDocsSaving(false);
                  const parts: string[] = [];
                  if (uploaded) parts.push(`${uploaded} uploaded`);
                  if (skipped) parts.push(`${skipped} skipped`);
                  if (failed) parts.push(`${failed} failed`);
                  setBulkDocsResult(`Done — ${parts.join(", ")}.`);
                  if (failed === 0) setSelectedAssetIds(new Set());
                  setBulkDocsOpen(false);
                }}
              />
            </Stack>
            <TextField
              label="Document name"
              size="small"
              fullWidth
              value={bulkDocsName}
              onChange={(e) => setBulkDocsName(e.target.value)}
            />
            <FormControl fullWidth size="small">
              <InputLabel shrink>Type</InputLabel>
              <Select label="Type" value={bulkDocsType} onChange={(e) => setBulkDocsType(e.target.value)}>
                {["Technical", "Drawings", "Procedures", "Authority to Work", "Tips & Tricks", "Tech Bulletins", "Informative", "Other"].map((t) => (
                  <MenuItem key={t} value={t}>{t}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {bulkDocsSaving && <LinearProgress />}
            {bulkDocsResult && (
              <Alert severity={bulkDocsResult.startsWith("Done") ? "success" : "error"} sx={{ fontSize: 12 }}>
                {bulkDocsResult}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setBulkDocsOpen(false)} disabled={bulkDocsSaving}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!bulkDocsFile || bulkDocsSaving}
            onClick={async () => {
              if (!bulkDocsFile) return;
              setBulkDocsSaving(true);
              setBulkDocsResult(null);
              let skipped = 0;
              let failed = 0;
              let uploaded = 0;
              const ids = [...selectedAssetIds];
              await Promise.all(ids.map(async (assetId) => {
                if ((docsCountMap[assetId] ?? 0) >= 3) { skipped++; return; }
                try {
                  await assetDocumentLinkService.uploadAndLink(
                    assetId,
                    bulkDocsFile,
                    bulkDocsType,
                    bulkDocsName || bulkDocsFile.name.replace(/\.[^.]+$/, ""),
                    undefined,
                    undefined,
                    currentUser?.fullName ?? undefined,
                  );
                  uploaded++;
                  setDocsCountMap((prev) => ({ ...prev, [assetId]: (prev[assetId] ?? 0) + 1 }));
                } catch {
                  failed++;
                }
              }));
              setBulkDocsSaving(false);
              const parts: string[] = [];
              if (uploaded) parts.push(`${uploaded} uploaded`);
              if (skipped) parts.push(`${skipped} skipped (at limit)`);
              if (failed)  parts.push(`${failed} failed`);
              setBulkDocsResult(`Done — ${parts.join(", ")}.`);
              if (failed === 0) {
                setSelectedAssetIds(new Set());
              }
            }}
          >
            {bulkDocsSaving ? "Uploading…" : "Upload to all"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default AssetInstallationPage;
