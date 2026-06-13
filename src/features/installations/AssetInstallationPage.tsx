import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AddOutlined,
  ArchiveOutlined,
  ArticleOutlined,
  AssignmentOutlined,
  CheckBoxOutlineBlankOutlined,
  CheckBoxOutlined,
  CheckCircleOutlined,
  DeleteForeverOutlined,
  DeleteOutline,
  DrawOutlined,
  EditOutlined,
  ErrorOutlined,
  ExpandLessOutlined,
  ExpandMoreOutlined,
  FileDownloadOutlined,
  FileUploadOutlined,
  FolderOutlined,
  HistoryOutlined,
  HourglassEmptyOutlined,
  InfoOutlined,
  PhotoCameraOutlined,
  DragIndicatorOutlined,
  PlayArrowOutlined,
  PrintOutlined,
  RefreshOutlined,
  ReportProblemOutlined,
  RestoreOutlined,
  SearchOutlined,
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
  InputAdornment,
  InputLabel,
  LinearProgress,
  List,
  ListItem,
  ListItemButton,
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
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Snackbar,
  Tooltip,
  Typography,
} from "@mui/material";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { useComplexView } from "../../contexts/ComplexViewContext";
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
import { entityGetAssetCacheAgeMs, CACHE_SOFT_LIMIT_MS, CACHE_HARD_LIMIT_MS } from "../../services/localDB";
import { generateWorkflowReport, resolveImageToDataUrl } from "../../utils/generateWorkflowReport";
import { countMissingWorkflowItems, runHasCompletedAllSteps } from "../../utils/workflowCompleteness";
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
import AssetInspectionDialog from "./AssetInspectionDialog";
import PhotoUploadDialog, { type MissingMediaFlag } from "../dashboard/PhotoUploadDialog";
import IssueDetailDialog from "../../components/ui/IssueDetailDialog";
import MediaCapture from "../../components/ui/MediaCapture";
import QRUploadButton from "../../components/QRUploadButton";
import InspectionImportDialog from "../projects/InspectionImportDialog";

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
  Paused: "warning",
  Pending: "warning",
  Complete: "success",
  Issue: "error",
};

const STATUS_LABELS: Record<ProjectAssetStatus, string> = {
  NotStarted: "Not Started",
  InProgress: "In Progress",
  Paused: "Paused",
  Pending: "Pending",
  Complete: "Complete",
  Issue: "Issue",
};

/** Time-ago helper for mobile sync timestamp display */
function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

function projectHasInspection(workflowMode?: string | null) {
  return workflowMode === "INSPECTION_ONLY" || workflowMode === "MIXED";
}

function isInspectionConfigType(configType?: string | null): boolean {
  const n = (configType ?? "").trim().toLowerCase();
  return n === "inspection" || n === "wftype-inspection";
}

function isInspectionWorkflowType(typeName?: string | null): boolean {
  return (typeName ?? "").trim().toLowerCase().includes("inspection");
}

function workflowTypeMismatchMessage(typeName: string | undefined, configType: string | null | undefined): string | null {
  const typeIsInspection = isInspectionWorkflowType(typeName);
  const configIsInspection = isInspectionConfigType(configType);
  if (typeIsInspection && !configIsInspection)
    return `The selected workflow config is an installation/generic type but the workflow type is "${typeName}". Using an inspection workflow type with a non-inspection config may produce unexpected results.`;
  if (!typeIsInspection && configIsInspection)
    return `The selected workflow config is an inspection type but the workflow type is "${typeName}". Inspection configs should only be used with an Inspection workflow type.`;
  return null;
}

// ------------------------------------------------------------------
// Health tracking
// ------------------------------------------------------------------

interface AssetHealth {
  total: number;
  notStarted: number;
  inProgress: number;
  paused: number;
  pending: number;
  complete: number;
  issue: number;
  noWorkflow: number;
}

function computeHealth(list: ProjectAsset[]): AssetHealth {
  return {
    total: list.length,
    notStarted: list.filter((a) => a.status === "NotStarted").length,
    inProgress: list.filter((a) => a.status === "InProgress").length,
    paused: list.filter((a) => a.status === "Paused").length,
    pending: list.filter((a) => a.status === "Pending").length,
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type AssetAttentionSummary = {
  paused: boolean;
  blockingIssueCount: number;
  highObservationCount: number;
  openIssueCount: number;
  missingMediaCount: number;
  needsMissingMediaRepair: boolean;
  awaitingInstallerSig: boolean;
  awaitingCustomerSig: boolean;
  latestRun: AssetWorkflowRun | null;
  latestLockedRun: AssetWorkflowRun | null;
};

type AssetPrimaryAction =
  | { label: string; tooltip: string; color: "success" | "warning" | "error" | "info" | "inherit"; icon: React.ReactElement; onClick: () => void; variant?: "contained" | "outlined" | "text" }
  | null;

function nextDraftConfigNumber(configs: WorkflowConfig[], productName: string) {
  const pattern = new RegExp(`^${escapeRegExp(productName)}\\s+Config\\s+(\\d+)$`, "i");
  const maxMatch = configs.reduce((max, cfg) => {
    const match = cfg.name.match(pattern);
    if (!match) return max;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
  }, 0);
  return maxMatch + 1;
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
// Report generator (type only â€" the async function lives inside the component)
// ------------------------------------------------------------------

type FeatureDef = {
  id: string;
  name: string;
  valueType: string;
  subProperties?: { id: string; name: string }[];
  isInventory?: boolean;
};

type AssignmentEventFlag = {
  id: string;
  assetId: string;
  assetTag: string;
  jobNumber: string;
  assignedAt: string;
  eventType: "manager-assigned" | "self-assigned" | "takeover";
  actorName: string;
  targetName: string;
  previousAssigneeName?: string;
};

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

const AssetInstallationPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const can = usePermissions();
  const { complexViewActive } = useComplexView();
  const isNativePlatform = Capacitor.isNativePlatform();
  const showComplexControls = complexViewActive && isNativePlatform;
  const showAdvancedAssetActions = !isNativePlatform || showComplexControls;
  const productsState = useAppSelector((s) => s.products);
  const projects = useAppSelector((s) => s.projects.items);
  const users = useAppSelector((s) => s.users.items);
  const [searchParams] = useSearchParams();
  const canEditAssetStatus = can.installationAssets?.editScope === "all";
  const canViewInstallationAssets = !!can.installationAssets?.view;
  const canEditInstallationAssets = !!can.installationAssets?.edit;
  const canDeleteInstallationAssets = !!can.installationAssets?.delete;
  const canRunAssetWorkflow = !!can.installationAssets?.runWorkflow;
  const deepLinkHandledRef = useRef<string | null>(null);

  // Stale-load guard: incremented every time activeProduct changes so that
  // results from a superseded fetch (triggered before the tab restoration
  // effect corrects the tab) are silently discarded.
  const assetLoadIdRef = useRef(0);
  const lastRefreshTsRef = useRef(0);
  const isRefreshingRef = useRef(false);   // in-flight guard — prevents concurrent refreshAssets calls
  const serverWasOfflineRef = useRef(false); // tracks offline→online transition for api-server-reachable

  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    () => { try { return sessionStorage.getItem("installations_selected_project_id") ?? ""; } catch { return ""; } }
  );
  const [statusFilter, setStatusFilter] = useState<ProjectAssetStatus | "All">("All");
  const [search, setSearch] = useState("");
  const [healthExpanded, setHealthExpanded] = useState(true);
  const [assetSearchOpen, setAssetSearchOpen] = useState(false);
  const [assetSearchQuery, setAssetSearchQuery] = useState("");
  const [statusMenuAnchor, setStatusMenuAnchor] = useState<HTMLElement | null>(null);
  const [statusMenuAsset, setStatusMenuAsset] = useState<ProjectAsset | null>(null);

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
  const [purgeAsset, setPurgeAsset] = useState<ProjectAsset | null>(null);
  const [purgingAsset, setPurgingAsset] = useState(false);

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
  const [issueDetailRunId, setIssueDetailRunId] = useState<string | null>(null);

  // Inline issue fields in chevron panel â€" keyed by issueId
  const [inlineCommentTexts, setInlineCommentTexts] = useState<Record<string, string>>({});
  const [inlineCorrectiveTexts, setInlineCorrectiveTexts] = useState<Record<string, string>>({});
  const [inlineSaving, setInlineSaving] = useState(false);
  const [inlineSaveError, setInlineSaveError] = useState<string | null>(null);
  const [inlineReportMedia,     setInlineReportMedia]     = useState<Record<string, string[]>>({});
  const [inlineResolutionMedia, setInlineResolutionMedia] = useState<Record<string, string[]>>({});

  // Workflow assignments + runs (keyed by assetId)
  const [assignmentsMap, setAssignmentsMap] = useState<Record<string, WorkflowAssignment[]>>({});
  const [runsMap, setRunsMap] = useState<Record<string, AssetWorkflowRun[]>>({});
  const [workflowTypes, setWorkflowTypes] = useState<WorkflowType[]>([]);
  const [workflowConfigs, setWorkflowConfigs] = useState<WorkflowConfig[]>([]);
  const [creatingWorkflowDraft, setCreatingWorkflowDraft] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignDialogAsset, setAssignDialogAsset] = useState<ProjectAsset | null>(null);
  const [assignForm, setAssignForm] = useState({ workflowTypeId: "", workflowConfigId: "" });
  const [assignSaving, setAssignSaving] = useState(false);
  const [inspectionDialogAsset, setInspectionDialogAsset] = useState<ProjectAsset | null>(null);
  const [runHistoryAsset, setRunHistoryAsset] = useState<ProjectAsset | null>(null);
  const [runHistoryAssignment, setRunHistoryAssignment] = useState<WorkflowAssignment | null>(null);
  // New run history dialog (with re-run support)
  const [runHistoryOpen, setRunHistoryOpen] = useState(false);
  const [runHistoryConfigId, setRunHistoryConfigId] = useState("");
  const [runHistoryConfigName, setRunHistoryConfigName] = useState("");
  // False when the run was created synthetically from a JSON import (no point re-running)
  const [runHistoryAllowRerun, setRunHistoryAllowRerun] = useState(true);
  const [photoUploadTarget, setPhotoUploadTarget] = useState<MissingMediaFlag | null>(null);
  // Workflow type mismatch confirmation
  const [wfMismatchConfirm, setWfMismatchConfirm] = useState<{
    asset: ProjectAsset;
    assignment: WorkflowAssignment;
    message: string;
  } | null>(null);
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
  const [printStatuses, setPrintStatuses] = useState<string[]>(["NotStarted", "InProgress", "Paused", "Pending", "Complete", "Issue"]);
  const [printPendingSig, setPrintPendingSig] = useState(false);
  const [printColumns, setPrintColumns]   = useState<(keyof PrintRow)[]>([
    "assetTag", "assetName", "serialNumber", "assetModel", "location",
    "assignedTech", "status", "project", "sigStatus",
  ]);
  const [printGroupBy, setPrintGroupBy]   = useState<GroupByKey>("none");
  const [printGenerating, setPrintGenerating] = useState(false);

  // Override warning â€" fires before any bulk action when existing data would be affected
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
  // Inspection import dialog (per-asset popup)
  const [importDialogAsset, setImportDialogAsset] = useState<ProjectAsset | null>(null);

  // Asset documents
  const [docsOpen, setDocsOpen] = useState(false);
  const [docsAsset, setDocsAsset] = useState<ProjectAsset | null>(null);
  const [docsCountMap, setDocsCountMap] = useState<Record<string, number>>({});

  // Last-fetched timestamp for mobile "Last updated" label (Fix 4)
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  // Cache age warning: "soft" = data is old, "hard" = data is very old
  const [cacheStale, setCacheStale] = useState<"soft" | "hard" | null>(null);
  const [serverReachable, setServerReachable] = useState<boolean | null>(null); // null = unknown (first load)

  useEffect(() => {
    if (!productsState.items.length) dispatch(fetchProducts());
    if (!projects.length) dispatch(fetchProjects());
    if (!users.length) dispatch(fetchUsers());
    siteService.getSites().then(setSites).catch(() => {});
  }, [dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  const products = useMemo(
    () => (productsState.items.length ? productsState.items : demoProducts),
    [productsState.items],
  );

  // Restore selected project from URL params (priority) or sessionStorage (fallback).
  useEffect(() => {
    const projectIdFromUrl = searchParams.get("project");
    if (projectIdFromUrl) {
      setSelectedProjectId(projectIdFromUrl);
      try { sessionStorage.setItem("installations_selected_project_id", projectIdFromUrl); } catch {}
    }
  }, [searchParams]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );
  const activeProduct = useMemo(() => {
    const projectProductId = selectedProject?.productIds?.[0];
    if (projectProductId) {
      return products.find((p) => p.id === projectProductId);
    }
    const productIdFromUrl = searchParams.get("product");
    if (productIdFromUrl) {
      return products.find((p) => p.id === productIdFromUrl);
    }
    return undefined;
  }, [products, searchParams, selectedProject]);

  const arrivalBanner = useMemo(() => {
    const assetIdFromUrl = searchParams.get("asset");
    const actionFromUrl = searchParams.get("action");
    if (!assetIdFromUrl || !actionFromUrl) return null;
    const asset = assets.find((item) => item.id === assetIdFromUrl);
    const assetLabel = asset?.assetTag || asset?.assetName || "this asset";

    if (actionFromUrl === "issue") {
      return {
        severity: "warning" as const,
        message: `You opened ${assetLabel} from an attention item to review and resolve an issue.`,
      };
    }
    if (actionFromUrl === "signature") {
      return {
        severity: "info" as const,
        message: `You opened ${assetLabel} from an attention item to complete sign-off.`,
      };
    }
    if (actionFromUrl === "photos") {
      return {
        severity: "warning" as const,
        message: `You opened ${assetLabel} from an attention item to add missing photos or videos.`,
      };
    }
    if (actionFromUrl === "history") {
      return {
        severity: "info" as const,
        message: `You opened ${assetLabel} from an attention item to review run details.`,
      };
    }
    return null;
  }, [assets, searchParams]);

  useEffect(() => {
    const assetIdFromUrl = searchParams.get("asset");
    const actionFromUrl = searchParams.get("action");
    if (!assetIdFromUrl || !actionFromUrl) {
      deepLinkHandledRef.current = null;
      return;
    }

    const issueIdFromUrl = searchParams.get("issue");
    const issueSourceFromUrl = searchParams.get("issueSource");
    const runIdFromUrl = searchParams.get("run");
    const key = `${assetIdFromUrl}|${actionFromUrl}|${runIdFromUrl ?? ""}|${issueIdFromUrl ?? ""}|${issueSourceFromUrl ?? ""}`;
    if (deepLinkHandledRef.current === key) return;

    const asset = assets.find((item) => item.id === assetIdFromUrl);
    if (!asset) return;

    setExpandedAssetId(asset.id);

    const runs = runsMap[asset.id];
    const needsRuns = actionFromUrl === "photos" || actionFromUrl === "signature" || actionFromUrl === "history" || issueSourceFromUrl === "run";
    if (needsRuns && !runs) {
      void loadAssignmentsForAsset(asset.id);
      return;
    }

    const targetRun = runIdFromUrl
      ? (runs ?? []).find((run) => run.id === runIdFromUrl) ?? null
      : (runs ?? []).slice().sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0] ?? null;

    if (actionFromUrl === "issue" && issueIdFromUrl) {
      if (issueSourceFromUrl === "asset") {
        setIssueDetailAsset(asset);
        setIssueDetailIssueId(issueIdFromUrl);
        setIssueDetailRunId(null);
        deepLinkHandledRef.current = key;
        return;
      }

      if (issueSourceFromUrl === "run" && targetRun) {
        let runIssues: RunIssue[] = [];
        try { runIssues = JSON.parse(targetRun.issuesJson || "[]"); } catch {}
        const matchingIssue = runIssues.find((issue) => issue.id === issueIdFromUrl);
        if (matchingIssue) {
          setIssueDetailAsset(asset);
          setIssueDetailIssueId(issueIdFromUrl);
          setIssueDetailRunId(targetRun.id);
          deepLinkHandledRef.current = key;
          return;
        }
      }
    }

    if (actionFromUrl === "photos") {
      const photoRun = targetRun ?? (runs ?? []).find((run) => run.isLocked) ?? null;
      if (!photoRun) return;
      openMissingMediaDialog(asset, photoRun);
      deepLinkHandledRef.current = key;
      return;
    }

    if (actionFromUrl === "signature" || actionFromUrl === "history" || (actionFromUrl === "issue" && issueSourceFromUrl === "run")) {
      void openRunHistory(asset, targetRun?.workflowConfigId);
      deepLinkHandledRef.current = key;
    }
  }, [assets, runsMap, searchParams]);
  const selectedProjectHasInspection = projectHasInspection(selectedProject?.workflowMode);
  const canCreateWorkflow = can.modifyData && !!activeProduct?.id;

  const openWorkflowBuilderForProduct = useCallback(async () => {
    if (!activeProduct?.id) return;
    setCreatingWorkflowDraft(true);
    try {
      const existingConfigs = await workflowConfigService.listByProduct(activeProduct.id);
      const nextNumber = nextDraftConfigNumber(existingConfigs, activeProduct.name);
      const created = await workflowConfigService.create({
        name: `${activeProduct.name} Config ${nextNumber}`,
        productId: activeProduct.id,
        configType: "Version 1",
        featureSelectionsJson: JSON.stringify(
          (activeProduct.features ?? [])
            .map((feature) => ({
              featureId: feature.id,
              included: false,
              activeCount: 0,
            }))
        ),
      });
      navigate(`/work-instructions?product=${encodeURIComponent(activeProduct.id)}&view=builder&config=${encodeURIComponent(created.id)}`);
    } finally {
      setCreatingWorkflowDraft(false);
    }
  }, [activeProduct, navigate]);
  const activeFeatures = useMemo(() => (activeProduct?.features ?? []) as FeatureDef[], [activeProduct]);
  const requestedWorkflowType = searchParams.get("workflowType");
  const resolveRequestedWorkflowTypeId = useCallback((types: WorkflowType[]) => {
    if (!requestedWorkflowType) return "";
    const normalized = requestedWorkflowType.trim().toLowerCase();
    return types.find((type) =>
      type.id.trim().toLowerCase() === normalized ||
      type.name.trim().toLowerCase() === normalized
    )?.id ?? "";
  }, [requestedWorkflowType]);

  useEffect(() => {
    if (products.length === 0) { setAssets([]); setConfigs([]); setPublishedWfConfigs([]); return; }
    // Increment the load ID so any in-flight load from a previous product is ignored
    const loadId = ++assetLoadIdRef.current;
    setLoadingAssets(true);
    const assetPromise = selectedProjectId
      ? projectAssetService.listByProject(selectedProjectId, archiveMode)
      : Promise.all(products.map((p) => projectAssetService.listByProduct(p.id, archiveMode)))
          .then((groups) => groups.flat());
    const configPromise = activeProduct?.id ? productConfigService.listByProduct(activeProduct.id) : Promise.resolve([]);
    const workflowPromise = activeProduct?.id ? workflowConfigService.listByProduct(activeProduct.id, "Published") : Promise.resolve([]);
    Promise.all([assetPromise, configPromise, workflowPromise]).then(([a, c, wc]) => {
      if (loadId !== assetLoadIdRef.current) return; // Stale — a newer load is in flight
      setAssets(a);
      setLastFetchedAt(new Date());
      setConfigs(c);
      setPublishedWfConfigs(wc);
      if (activeProduct?.id) {
        setHealthMap((prev) => ({ ...prev, [activeProduct.id]: computeHealth(a) }));
      }
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
            // Only preserve entries that were fully loaded via loadAssignmentsForAsset
            // (those have ALL runs, not just the latest). Batch load always wins otherwise.
            Object.keys(prev).forEach(id => {
              if (prev[id].length > 1) merged[id] = prev[id];
            });
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
  }, [activeProduct?.id, archiveMode, products, selectedProjectId]);

  const refreshAssets = useCallback(async () => {
    // Collapse concurrent calls — only one refresh runs at a time.
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    try {
      const refreshPromise = selectedProjectId
        ? projectAssetService.listByProject(selectedProjectId, archiveMode)
        : Promise.all(products.map((p) => projectAssetService.listByProduct(p.id, archiveMode))).then((groups) => groups.flat());
      const a = await refreshPromise;
      setAssets(a);
      lastRefreshTsRef.current = Date.now();    setLastFetchedAt(new Date());
      if (activeProduct?.id) {
        setHealthMap((prev) => ({ ...prev, [activeProduct.id]: computeHealth(a) }));
      }
      // Re-load runs so signature chips stay current — fire-and-forget, non-blocking.
      const projectIds = [...new Set(a.map((asset) => asset.projectId).filter(Boolean))];
      void Promise.all(projectIds.map((pid) => assetWorkflowRunService.listLatestByProject(pid)))
        .then((results) => {
          const runMap: Record<string, AssetWorkflowRun[]> = {};
          results.flat().forEach((run) => {
            if (!runMap[run.assetId]) runMap[run.assetId] = [];
            runMap[run.assetId].push(run);
          });
          setRunsMap((prev) => {
            const merged = { ...runMap };
            Object.keys(prev).forEach((id) => { if (prev[id].length > 1) merged[id] = prev[id]; });
            return merged;
          });
        })
        .catch(() => {/* non-blocking */});
    } finally {
      isRefreshingRef.current = false;
    }
  }, [selectedProjectId, archiveMode, products, activeProduct?.id]);

  // Fix 1 — Listen for background refresh event from AssetRepository.
  // IMPORTANT: must read from local IndexedDB only here — calling refreshAssets() would
  // trigger another network fetch, which fires repo:assets:updated again → infinite loop.
  useEffect(() => {
    const handler = async (e: Event) => {
      const { productId, projectId } = (e as CustomEvent<{ productId?: string; projectId?: string }>).detail;
      const productIds = new Set(products.map((p) => p.id));
      if (
        (productId && productIds.has(productId)) ||
        (projectId && projectId === selectedProjectId) ||
        (!productId && !projectId)
      ) {
        const a = selectedProjectId
          ? await projectAssetService.listLocalByProject(selectedProjectId, archiveMode)
          : (await Promise.all(products.map((p) => projectAssetService.listLocalByProduct(p.id, archiveMode)))).flat();
        setAssets(a);
        setLastFetchedAt(new Date());
        setServerReachable(true);
      }
    };
    window.addEventListener("repo:assets:updated", handler as EventListener);
    return () => window.removeEventListener("repo:assets:updated", handler as EventListener);
  }, [products, selectedProjectId, archiveMode]);

  // Mark server as unreachable when background fetch fails
  useEffect(() => {
    const handler = () => {
      setServerReachable(false);
      serverWasOfflineRef.current = true;
    };
    window.addEventListener("repo:assets:fetch-failed", handler);
    return () => window.removeEventListener("repo:assets:fetch-failed", handler);
  }, []);

  // Track when the server goes offline so api-server-reachable knows it's a recovery event.
  // Without this gate, api-server-reachable fires on EVERY successful response, creating
  // a self-sustaining refresh loop that floods the server with requests.
  useEffect(() => {
    const markOffline = () => { serverWasOfflineRef.current = true; };
    window.addEventListener("api-serving-cache", markOffline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("api-serving-cache", markOffline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);

  // Fix 6b — Re-fetch ONLY when server comes back after being offline (not on every response).
  useEffect(() => {
    const handler = () => {
      if (!serverWasOfflineRef.current) return;
      serverWasOfflineRef.current = false;
      void refreshAssets();
    };
    window.addEventListener("api-server-reachable", handler);
    return () => window.removeEventListener("api-server-reachable", handler);
  }, [refreshAssets]);

  // Fix 9 — Real-time server push: re-fetch when SSE notifies this product/project changed
  useEffect(() => {
    const handler = (e: Event) => {
      const { productId, projectId } = (e as CustomEvent<{ productId?: string; projectId?: string }>).detail ?? {};
      const productIds = new Set(products.map((p) => p.id));
      if (
        (productId && productIds.has(productId)) ||
        (projectId && projectId === selectedProjectId) ||
        (!productId && !projectId)
      ) {
        void refreshAssets();
      }
    };
    window.addEventListener("sse:assets:updated", handler as EventListener);
    return () => window.removeEventListener("sse:assets:updated", handler as EventListener);
  }, [refreshAssets, products, selectedProjectId]);

  // Fix 6 — Background poll every 90s while page is visible (mobile only)
  useEffect(() => {
    if (!isNativePlatform) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshAssets();
      }
    }, 90_000);
    return () => window.clearInterval(id);
  }, [isNativePlatform, refreshAssets]);

  // Fix 7 — Cache age limit: only warn when server is confirmed unreachable AND cache is old (mobile only)
  useEffect(() => {
    if (!isNativePlatform || products.length === 0) return;
    if (serverReachable === null) return;  // still loading — don't judge yet
    if (serverReachable === true) { setCacheStale(null); return; }  // server is up — no banner needed
    // serverReachable === false: server is down — check how old the local data actually is
    const check = async () => {
      const key   = selectedProjectId ?? products[0]?.id;
      const by    = selectedProjectId ? "by_project" : "by_product";
      const ageMs = await entityGetAssetCacheAgeMs(key, by);
      if (ageMs >= CACHE_HARD_LIMIT_MS) setCacheStale("hard");
      else if (ageMs >= CACHE_SOFT_LIMIT_MS) setCacheStale("soft");
      else setCacheStale(null);
    };
    void check();
  }, [isNativePlatform, products, selectedProjectId, serverReachable]);

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

  // Scope: roles with viewScope="own" see only projects/assets they manage.
  const canViewAllAssets = (can.installationAssets?.viewScope ?? "own") === "all";

  // Compute project IDs the user can access:
  //   - Projects where they are the project manager (matched by full name)
  //   - Projects where they are listed as a team member (matched by user ID)
  // Returns null when canViewAllAssets=true (no restriction needed) OR when the user
  // has no matching projects (signals that assignment-based fallback should apply).
  const ownedProjectIds = useMemo((): Set<string> | null => {
    if (canViewAllAssets) return null;
    const myName = (currentUser.fullName ?? "").trim().toLowerCase();
    const owned = new Set(
      projects.filter((p) =>
        String(p.projectManager ?? "").trim().toLowerCase() === myName ||
        (p.teamMemberIds?.includes(currentUser.id) ?? false)
      ).map((p) => p.id)
    );
    // Return null (not an empty Set) so downstream null-checks correctly trigger the assignment fallback.
    return owned.size > 0 ? owned : null;
  }, [canViewAllAssets, currentUser.fullName, currentUser.id, projects]);

  // Assignment-scoped: viewScope is "own" AND the user has no owned/team projects.
  // These users (e.g. Installer, Technician) see only assets directly assigned to them.
  // No role names are hardcoded — the scope type is derived entirely from permission config + project data.
  const isAssignmentScoped = !canViewAllAssets && ownedProjectIds === null;

  const visibleAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((a) => {
      if (archiveMode) {
        if (!a.isDeleted) return false;
      } else {
        if (a.isDeleted) return false;
        if (selectedProjectId && a.projectId !== selectedProjectId) return false;
        // Scope restriction always applies, regardless of whether a project is pre-selected
        if (isAssignmentScoped && a.assignedUserId !== currentUser.id) return false;
        if (ownedProjectIds && !ownedProjectIds.has(a.projectId)) return false;
        if (statusFilter !== "All" && a.status !== statusFilter) return false;
      }
      if (q && !([a.assetTag, a.serialNumber, a.location, a.assetModel, a.manufacturer].some((f) => f?.toLowerCase().includes(q)))) return false;
      return true;
    });
  }, [assets, ownedProjectIds, isAssignmentScoped, currentUser.id, selectedProjectId, statusFilter, search, archiveMode]);

  // Projects filtered to those linked to the active product (used in add/edit dialogs and the project selector).
  // Also filtered to owned projects when the role's viewScope is "own".
  const productProjects = useMemo(
    () => {
      const byProduct = activeProduct?.id
        ? projects.filter((p) => p.productIds?.includes(activeProduct.id))
        : projects;
      return ownedProjectIds ? byProduct.filter((p) => ownedProjectIds.has(p.id)) : byProduct;
    },
    [projects, activeProduct?.id, ownedProjectIds],
  );

  const canEditAssetFromWebTable = useMemo(() => (asset: ProjectAsset) => {
    if (can.installationAssets?.editScope === "all") return true;
    if (can.installationAssets?.editScope !== "own") return false;
    if (ownedProjectIds?.has(asset.projectId)) return true;
    return isAssignmentScoped && asset.assignedUserId === currentUser.id;
  }, [can.installationAssets?.editScope, currentUser.id, isAssignmentScoped, ownedProjectIds]);

  const canManageAssetDocuments = can.documents.view || can.documents.upload || can.documents.delete;

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
  const selectedAssignWorkflowType = useMemo(
    () => workflowTypes.find((type) => type.id === assignForm.workflowTypeId) ?? null,
    [workflowTypes, assignForm.workflowTypeId],
  );
  const filteredAssignWorkflowConfigs = useMemo(() => {
    if (!selectedAssignWorkflowType) return workflowConfigs;
    return workflowConfigs.filter((config) =>
      config.workflowTypeId === selectedAssignWorkflowType.id ||
      config.configType === selectedAssignWorkflowType.name
    );
  }, [workflowConfigs, selectedAssignWorkflowType]);
  const selectedBulkWorkflowType = useMemo(
    () => workflowTypes.find((type) => type.id === bulkWfTypeId) ?? null,
    [workflowTypes, bulkWfTypeId],
  );
  const filteredBulkWorkflowConfigs = useMemo(() => {
    if (!selectedBulkWorkflowType) return latestPublishedWfConfigs;
    return latestPublishedWfConfigs.filter((config) =>
      config.workflowTypeId === selectedBulkWorkflowType.id ||
      config.configType === selectedBulkWorkflowType.name
    );
  }, [latestPublishedWfConfigs, selectedBulkWorkflowType]);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  // â"€â"€ Print scope computation (needs userMap / projectMap / configMap / runsMap) â"€â"€
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
      NotStarted: "Not Started", InProgress: "In Progress", Paused: "Paused", Pending: "Pending", Complete: "Complete", Issue: "Issue",
    };
    return pool.map((a): PrintRow => {
      const tech        = a.assignedUserId ? userMap.get(a.assignedUserId) : undefined;
      const proj        = projectMap.get(a.projectId);
      const runs        = runsMap[a.id] ?? [];
      const latestRun   = runs[0];
      const assignments = assignmentsMap[a.id] ?? [];
      let wfStatus = "-";
      if (assignments.length > 0) {
        const names = assignments.map((x) => x.workflowTypeName || "Workflow").join(", ");
        wfStatus = latestRun
          ? `${latestRun.status === "Complete" ? "Done" : "In Progress"} (${names})`
          : `Assigned (${names})`;
      }
      let sigStatus = "-";
      if (latestRun) {
        const ss = latestRun.signatureStatus ?? "";
        if (ss === "PendingCustomer")     sigStatus = "Pending Customer";
        else if (ss === "PendingInstaller") sigStatus = "Pending Installer";
        else if (ss === "Signed")           sigStatus = "Signed";
        else if (ss === "WaivedCustomer")   sigStatus = "Waived";
        else if (ss === "Declined")         sigStatus = "Declined";
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
        project:      proj ? `${proj.jobNumber} - ${proj.customerName}` : "",
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
        setEditError(`Cannot set to Complete - ${blockingOpen.length} blocking issue${blockingOpen.length === 1 ? "" : "s"} must be resolved first.`);
        return;
      }
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const previousAssignedUserId = editAsset.assignedUserId ?? "";
      const updated = await projectAssetService.update(editAsset.id, {
        assetTag: tag,
        assetName: editForm.assetName.trim() || undefined,
        serialNumber: editForm.serialNumber.trim() || undefined,
        assetModel: editForm.assetModel.trim() || undefined,
        manufacturer: editForm.manufacturer.trim() || undefined,
        location: editForm.location.trim() || undefined,
        assignedUserId: editForm.assignedUserId || undefined,
        notes: editForm.notes.trim() || undefined,
        productConfigId: editForm.configId,
        status: canEditAssetStatus ? editStatus : undefined,
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

  async function confirmRestoreAsset(asset: ProjectAsset) {
    setDeletingAsset(true);
    try {
      await projectAssetService.restore(asset.id);
      refreshAssets();
    } catch {
      alert("Failed to restore asset.");
    } finally {
      setDeletingAsset(false);
    }
  }

  async function confirmPurgeAsset() {
    if (!purgeAsset) return;
    setPurgingAsset(true);
    try {
      await projectAssetService.purge(purgeAsset.id);
      setPurgeAsset(null);
      refreshAssets();
    } catch {
      alert("Failed to permanently delete asset.");
    } finally {
      setPurgingAsset(false);
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
      // New path: productConfigId â†' WorkflowConfig (published work instruction)
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
    // Sync captured feature values back to the asset record â€" await so refreshAssets sees the new values
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
      const requestedWorkflowTypeId = resolveRequestedWorkflowTypeId(types);
      const matchingConfigs = requestedWorkflowTypeId
        ? cfgs.filter((config) =>
            config.workflowTypeId === requestedWorkflowTypeId ||
            config.configType?.trim().toLowerCase() === requestedWorkflowType?.trim().toLowerCase()
          )
        : [];
      setAssignForm({
        workflowTypeId: requestedWorkflowTypeId,
        workflowConfigId: matchingConfigs.length === 1 ? matchingConfigs[0].id : "",
      });
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

  async function _doStartAssignmentRun(asset: ProjectAsset, assignment: WorkflowAssignment) {
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

  async function handleStartAssignmentRun(asset: ProjectAsset, assignment: WorkflowAssignment) {
    // Workflow type / config type mismatch guard — warn before proceeding
    const matchedType = workflowTypes.find((t) => t.id === assignment.workflowTypeId);
    const matchedCfg = wfConfigMap.get(assignment.workflowConfigId) ?? workflowConfigs.find((c) => c.id === assignment.workflowConfigId);
    const mismatchMsg = workflowTypeMismatchMessage(matchedType?.name, matchedCfg?.configType);
    if (mismatchMsg) {
      setWfMismatchConfirm({ asset, assignment, message: mismatchMsg });
      return;
    }
    await _doStartAssignmentRun(asset, assignment);
  }

  // ------------------------------------------------------------------
  // Auto-assign check â€" intercepts start/continue before opening runner
  // ------------------------------------------------------------------

  function checkAssignmentThenStart(asset: ProjectAsset, assignment?: WorkflowAssignment) {
    if (!asset.assignedUserId) {
      // Unassigned â€" warn and auto-assign
      setAutoAssignConfirm({ asset, assignment, reason: "unassigned" });
      return;
    }
    if (asset.assignedUserId !== currentUser.id) {
      // Assigned to someone else â€" warn before taking over
      const otherName = users.find((u) => u.id === asset.assignedUserId)?.fullName ?? "another user";
      setAutoAssignConfirm({ asset, assignment, reason: "other", otherName });
      return;
    }
    // Assigned to me â€" start directly
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
    } catch {
      // Non-fatal â€" continue with start even if update fails
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
      setRunHistoryAllowRerun(true);
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

    // Disable Re-run for inspection-only assets where the run was auto-created from a JSON import:
    // detection = assignments were actually loaded AND are empty (undefined = not yet loaded → assume
    // there may be assignments, so err on the side of allowing Re-run).
    const explicitAssignments = assignmentsMap[asset.id]; // undefined = not loaded yet
    const assignmentsLoaded = explicitAssignments !== undefined;
    const hasExplicitAssignment = assignmentsLoaded && explicitAssignments.length > 0;
    const proj = projects.find((p) => p.id === asset.projectId);
    const isInspectionOnly = proj?.workflowMode === "INSPECTION_ONLY";
    const isSyntheticRun = isInspectionOnly && assignmentsLoaded && !hasExplicitAssignment && !!latestRun;

    setRunHistoryAsset(asset);
    setRunHistoryConfigId(configId);
    setRunHistoryConfigName(cfgName);
    setRunHistoryAllowRerun(!isSyntheticRun);
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
      // Runs â€" use cached value or fetch
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
      const cfgType = (wfCfg?.configType ?? "").trim().toLowerCase();
      const docType = cfgType === "inspection" || cfgType === "wftype-inspection" ? "inspection" as const : "installation" as const;

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

      // Business logo + customer logo â€" resolve data URL regardless of source format
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
        documentType: docType,
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

  // useCallback with [] deps â€" setDocsCountMap (setState setter) is always stable,
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
    if (openIssues.some(i => i.severity === "high" || (i.isBlocking && i.severity !== "medium" && i.severity !== "low"))) return "red";
    if (openIssues.some(i => i.severity === "medium")) return "amber";
    if (openIssues.length === 0 && asset.status === "Complete") return "green";
    return null; // no open issues â†' use default status color
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
      await projectAssetService.patchIssues(asset.id, JSON.stringify(issues));
      await refreshAssets().catch(() => {});
    } catch {
      setInlineSaveError("Could not save — server unreachable. Check your connection.");
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
      await assetWorkflowRunService.patchIssues(runId, JSON.stringify(issues));
      await Promise.all([
        loadAssignmentsForAsset(assetId).catch(() => {}),
        refreshAssets().catch(() => {}),
      ]);
    } catch {
      setInlineSaveError("Could not save — server unreachable. Check your connection.");
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
            {/* Col 1 â€" Issue Description */}
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
                {"createdBy" in issue && issue.createdBy ? `${issue.createdBy} | ` : ""}{new Date(issue.reportedAt).toLocaleString()}
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

            {/* Col 2 â€" Comments */}
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
                    placeholder="Add a comment..."
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

            {/* Col 3 â€" Corrective Action */}
            <Box sx={{ flex: "0 0 28%", minWidth: 0 }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5 }} display="block" mb={0.5}>
                Corrective Action
              </Typography>
              {issue.resolved ? (
                <Typography variant="caption" display="block" sx={{ fontStyle: "italic", color: "text.secondary" }}>
                  {issue.resolutionNote ?? "-"}
                </Typography>
              ) : (
                <>
                  <TextField
                    size="small"
                    fullWidth
                    multiline
                    rows={3}
                    placeholder="Describe corrective action taken..."
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

  function getSortedRuns(assetId: string): AssetWorkflowRun[] {
    return [...(runsMap[assetId] ?? [])].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  function getAssetAttentionSummary(asset: ProjectAsset): AssetAttentionSummary {
    const sortedRuns = getSortedRuns(asset.id);
    const latestRun = sortedRuns[0] ?? null;
    const latestLockedRun = sortedRuns.find((run) => run.isLocked) ?? null;
    const latestRunMissingMediaCount = latestRun ? countMissingWorkflowItems(latestRun) : 0;
    const needsMissingMediaRepair = Boolean(
      latestRun
      && runHasCompletedAllSteps(latestRun)
      && latestRunMissingMediaCount > 0
    );
    const paused = Boolean(pausedProgress[asset.id])
      || latestRun?.status === "Paused"
      || asset.workflowSummary?.evidenceStatus === "Paused";

    let assetIssues: AssetIssue[] = [];
    try { assetIssues = JSON.parse(asset.issuesJson || "[]"); } catch {}
    const runIssues = sortedRuns.flatMap((run) => {
      try { return JSON.parse(run.issuesJson || "[]") as RunIssue[]; } catch { return []; }
    });
    const openIssues = [...assetIssues, ...runIssues].filter((issue) => !issue.resolved);
    const blockingIssueCount = openIssues.filter((issue) => issue.isBlocking).length;
    const highObservationCount = openIssues.filter((issue) => !issue.isBlocking && issue.issueType === "observation" && issue.severity === "high").length;

    return {
      paused,
      blockingIssueCount,
      highObservationCount,
      openIssueCount: openIssues.length,
      missingMediaCount: latestRunMissingMediaCount,
      needsMissingMediaRepair,
      awaitingInstallerSig: Boolean(latestLockedRun?.isLocked && latestLockedRun.signatureStatus === "PendingInstaller"),
      awaitingCustomerSig: Boolean(
        latestLockedRun?.isLocked
        && latestLockedRun.signatureStatus === "PendingCustomer"
        && !latestLockedRun.customerSignedAt
      ),
      latestRun,
      latestLockedRun,
    };
  }

  function getWorkflowNameForRun(run: AssetWorkflowRun | null, asset: ProjectAsset): string {
    if (!run) return asset.assetTag || asset.assetName || "Workflow";
    try {
      const snapshot = JSON.parse(run.workflowSnapshotJson ?? "{}");
      if (typeof snapshot?.name === "string" && snapshot.name.trim()) return snapshot.name;
    } catch { /* ignore */ }
    const assignment = (assignmentsMap[asset.id] ?? []).find((item) => item.workflowConfigId === run.workflowConfigId);
    return assignment?.workflowConfigName || asset.assetTag || asset.assetName || "Workflow";
  }

  function openMissingMediaDialog(asset: ProjectAsset, run: AssetWorkflowRun | null) {
    if (!run) return;
    setPhotoUploadTarget({
      id: `asset-${asset.id}-${run.id}`,
      runId: run.id,
      assetId: asset.id,
      assetTag: asset.assetTag || asset.assetName || asset.id,
      jobNumber: projectMap.get(asset.projectId)?.jobNumber ?? "",
      workflowName: getWorkflowNameForRun(run, asset),
      technicianUserId: asset.assignedUserId ?? "",
      technicianName: users.find((user) => user.id === asset.assignedUserId)?.fullName ?? "",
      completedAt: run.completedAt ?? run.updatedAt ?? run.startedAt,
      missingSteps: [],
      totalExpected: 0,
      totalCaptured: 0,
    });
  }

  function getPrimaryAction(asset: ProjectAsset, projectWorkflowMode?: string | null): AssetPrimaryAction {
    const loading = runnerLoading === asset.id;
    const assignments = assignmentsMap[asset.id];
    const summary = getAssetAttentionSummary(asset);
    const latestRun = summary.latestRun;
    const inspectionEnabled = projectHasInspection(projectWorkflowMode);
    const hasAssignments = assignments !== undefined
      ? (assignments.length > 0 || !!asset.productConfigId || !!asset.workflowTemplateId || !!latestRun || !!asset.workflowSummary?.hasWorkflow)
      : (asset.workflowSummary?.hasWorkflow ?? (!!asset.productConfigId || !!asset.workflowTemplateId));
    const canViewCompletedRun = asset.status === "Complete"
      || (asset.workflowSummary?.latestRunStatus === "Complete" && !asset.workflowSummary?.hasOpenIssues);
    const openImportDialog = () => setImportDialogAsset(asset);

    if (inspectionEnabled && asset.status === "Complete" && !latestRun && !hasAssignments) {
      return {
        label: "Run Details",
        tooltip: "View or edit linked external inspection JSON",
        color: "inherit",
        icon: <HistoryOutlined />,
        onClick: openImportDialog,
        variant: "text",
      };
    }
    if (!hasAssignments) {
      if (inspectionEnabled) {
        return {
          label: "Upload JSON",
          tooltip: "Upload external inspection JSON for this asset",
          color: "info",
          icon: <FileUploadOutlined />,
          onClick: openImportDialog,
          variant: "outlined",
        };
      }
      return null;
    }
    if (summary.paused) {
      return {
        label: "Resume Run",
        tooltip: "Resume the paused workflow run",
        color: "success",
        icon: loading ? <CircularProgress size={12} /> : <PlayArrowOutlined />,
        onClick: () => checkAssignmentThenStart(asset),
        variant: "outlined",
      };
    }
    if (summary.needsMissingMediaRepair && summary.latestRun) {
      return {
        label: "Add Missing Photos",
        tooltip: "Open the missing media repair flow for this run",
        color: "warning",
        icon: <PhotoCameraOutlined />,
        onClick: () => openMissingMediaDialog(asset, summary.latestRun),
        variant: "outlined",
      };
    }
    if (asset.status === "InProgress") {
      return {
        label: "Continue Run",
        tooltip: "Continue workflow",
        color: "success",
        icon: loading ? <CircularProgress size={12} /> : <PlayArrowOutlined />,
        onClick: () => checkAssignmentThenStart(asset),
        variant: "outlined",
      };
    }
    if (summary.blockingIssueCount > 0) {
      return {
        label: summary.blockingIssueCount === 1 ? "Resolve Blocking Issue" : `Resolve ${summary.blockingIssueCount} Blocking Issues`,
        tooltip: "Open this asset to review and close blocking issues",
        color: "error",
        icon: <ReportProblemOutlined />,
        onClick: () => summary.latestRun ? openRunHistory(asset) : handleStartWorkOrder(asset),
        variant: "outlined",
      };
    }
    if (summary.missingMediaCount > 0 && summary.latestRun) {
      return {
        label: "Add Missing Photos",
        tooltip: "Open the missing media repair flow for this run",
        color: "warning",
        icon: <PhotoCameraOutlined />,
        onClick: () => openMissingMediaDialog(asset, summary.latestRun),
        variant: "outlined",
      };
    }
    if (summary.awaitingInstallerSig || summary.awaitingCustomerSig) {
      return {
        label: "Complete Sign-off",
        tooltip: "Open run history to complete installer or customer signatures",
        color: "warning",
        icon: <DrawOutlined />,
        onClick: () => openRunHistory(asset),
        variant: "outlined",
      };
    }
    if (summary.highObservationCount > 0) {
      return {
        label: summary.highObservationCount === 1 ? "Review High Observation" : `Review ${summary.highObservationCount} High Observations`,
        tooltip: "Review high-severity observation issues for this asset",
        color: "warning",
        icon: <InfoOutlined />,
        onClick: () => summary.latestRun ? openRunHistory(asset) : handleStartWorkOrder(asset),
        variant: "outlined",
      };
    }
    if (asset.status === "NotStarted") {
      return {
        label: "Start Run",
        tooltip: "Start workflow",
        color: "success",
        icon: loading ? <CircularProgress size={12} /> : <PlayArrowOutlined />,
        onClick: () => checkAssignmentThenStart(asset),
        variant: "outlined",
      };
    }
    if (canViewCompletedRun) {
      return {
        label: "Run Details",
        tooltip: "View run history, download report, or re-run workflow",
        color: "inherit",
        icon: <HistoryOutlined />,
        onClick: () => openRunHistory(asset),
        variant: "text",
      };
    }
    return {
      label: summary.openIssueCount > 0 ? "Review Issues" : "Review Run",
      tooltip: "Open run details to review this asset",
      color: "error",
      icon: <ErrorOutlined />,
      onClick: () => handleStartWorkOrder(asset),
      variant: "outlined",
    };
  }

  function actionButton(asset: ProjectAsset, projectWorkflowMode?: string | null) {
    const primaryAction = getPrimaryAction(asset, projectWorkflowMode);
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
    if (!primaryAction) return <Typography variant="caption" color="text.secondary">No workflow</Typography>;
    return (
      <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
        {progressBadge}
        <Tooltip title={primaryAction.tooltip}>
          <Button
            size="small"
            variant={primaryAction.variant ?? "outlined"}
            color={primaryAction.color}
            startIcon={primaryAction.icon}
            onClick={primaryAction.onClick}
          >
            {primaryAction.label}
          </Button>
        </Tooltip>
      </Stack>
    );
  }

  // ------------------------------------------------------------------
  // Feature values display (expandable row)
  // ------------------------------------------------------------------

  function featureCompletenessChip(asset: ProjectAsset) {
    let fv: Record<string, string> = {};
    try { fv = JSON.parse(asset.featureValuesJson || "{}"); } catch {}
    const inventoryFeatures = activeFeatures.filter((feat) => feat.isInventory);
    const workflowInventoryTotal = asset.workflowSummary?.totalInventoryFeatures ?? 0;
    const workflowInventoryCompleted = asset.workflowSummary?.completedInventoryFeatures ?? 0;
    const fallbackFilled = inventoryFeatures.filter((feat) => {
      const raw = fv[feat.id];
      if (!raw) return false;
      if (feat.valueType === "component") {
        try { return Object.values(JSON.parse(raw) as Record<string, string>).some(Boolean); } catch {}
        return false;
      }
      return true;
    }).length;

    const total = workflowInventoryTotal > 0 ? workflowInventoryTotal : inventoryFeatures.length;
    const filled = workflowInventoryTotal > 0 ? Math.min(workflowInventoryCompleted, workflowInventoryTotal) : fallbackFilled;

    const latestRun = [...(runsMap[asset.id] ?? [])]
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
    const paused = Boolean(pausedProgress[asset.id]);

    let evidenceLabel = "Pending";
    let evidenceTitle = "Workflow pending";
    let evidenceColor: "warning" | "success" | "error" | "primary" = "warning";

    if (paused || latestRun?.status === "Paused" || asset.workflowSummary?.evidenceStatus === "Paused") {
      evidenceLabel = "Paused";
      evidenceTitle = "Workflow paused";
    } else if (asset.status === "InProgress" || latestRun?.status === "InProgress") {
      evidenceLabel = "Running";
      evidenceTitle = "Workflow running";
      evidenceColor = "primary";
    } else if (asset.workflowSummary?.hasWorkflow) {
      if (asset.workflowSummary.evidenceStatus === "Running") {
        evidenceLabel = "Running";
        evidenceTitle = "Workflow running";
        evidenceColor = "primary";
      } else if (asset.workflowSummary.evidenceStatus === "Complete") {
        evidenceLabel = "Done";
        evidenceTitle = "Evidence complete";
        evidenceColor = "success";
      } else if (asset.workflowSummary.evidenceStatus === "MissingData") {
        evidenceLabel = "Missing";
        evidenceTitle = "Missing data";
        evidenceColor = "error";
      }
    } else if (latestRun) {
      if (!latestRun.isLocked) {
        evidenceLabel = "Running";
        evidenceTitle = "Workflow running";
        evidenceColor = "primary";
      } else {
        const missingCount = countMissingWorkflowItems(latestRun);
        if (missingCount > 0) {
          evidenceLabel = "Missing";
          evidenceTitle = "Missing data";
          evidenceColor = "error";
        } else {
          evidenceLabel = "Done";
          evidenceTitle = "Evidence complete";
          evidenceColor = "success";
        }
      }
    }

    const inventoryColor = total > 0 && filled === total ? "success" : filled > 0 ? "warning" : "default";
    const inventoryVariant = total > 0 ? "filled" : "outlined";
    return (
      <Tooltip title={`${total === 0 ? "No inventory features selected on this workflow." : `Inventory features ${filled}/${total}.`} ${evidenceTitle}.`}>
        <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
          <Chip size="small" label={`${filled}/${total} inv`}
            color={inventoryColor as "success" | "warning" | "default"}
            variant={inventoryVariant} />
          <Chip size="small" label={evidenceLabel} color={evidenceColor} variant="outlined" />
        </Stack>
      </Tooltip>
    );
  }

  function renderFeatureExpandedRow(asset: ProjectAsset) {
    let fv: Record<string, string> = {};
    try { fv = JSON.parse(asset.featureValuesJson || "{}"); } catch {}
    const inventoryFeatures = activeFeatures.filter((feat) => feat.isInventory);

    if (inventoryFeatures.length === 0) {
      const entries = Object.entries(fv);
      if (!entries.length) {
        return <Typography variant="caption" color="text.secondary">No inventory feature data recorded.</Typography>;
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
          {inventoryFeatures.flatMap((feat) => {
            const raw = fv[feat.id];
            const isComponent = feat.valueType === "component" && (feat.subProperties ?? []).length > 0;
            let displayVal = "-";
            let filled = !!raw;

            if (raw && isComponent) {
              try {
                const sub: Record<string, string> = JSON.parse(raw);
                const parts = (feat.subProperties ?? []).map((sp) => sub[sp.id] ? `${sp.name}: ${sub[sp.id]}` : null).filter(Boolean);
                displayVal = parts.length ? `${parts.length} sub-field${parts.length !== 1 ? "s" : ""} filled` : "-";
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
                          {"->"} {sp.name}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12, py: 0.5 }}>{sub[sp.id] || "-"}</TableCell>
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
        return <Typography variant="body2">{asset.assetName || "-"}</Typography>;
      case "serialNumber":
        return <Typography variant="body2" color="text.secondary">{asset.serialNumber || "-"}</Typography>;
      case "assetModel":
        return <Typography variant="body2" color="text.secondary">{asset.assetModel || "-"}</Typography>;
      case "manufacturer":
        return <Typography variant="body2" color="text.secondary">{asset.manufacturer || "-"}</Typography>;
      case "configType": {
        const cfgType = cfg?.configType
          || (asset.productConfigId ? wfConfigMap.get(asset.productConfigId)?.configType : undefined);
        return <Typography variant="body2" color="text.secondary">{cfgType || "-"}</Typography>;
      }
      case "project":
        return <Typography variant="body2" color="text.secondary">{proj ? proj.jobNumber : asset.projectId.slice(0, 8)}</Typography>;
      case "siteName":
        return <Typography variant="body2" color="text.secondary">{proj?.siteName || "-"}</Typography>;
      case "location":
        return <Typography variant="body2" color="text.secondary">{asset.location || "-"}</Typography>;
      case "assignedTech":
        return <Typography variant="body2" color="text.secondary">{tech ? tech.fullName : "-"}</Typography>;
      case "features":
        return featureCompletenessChip(asset);
      case "status":
        const status = asset.status as ProjectAssetStatus;
        const baseColor = STATUS_COLORS[status] ?? "default";
        const issueHealth = computeAssetHealth(asset, runsMap[asset.id] ?? []);
        // Check if complete but awaiting customer signature
        const latestRuns = runsMap[asset.id] ?? [];
        const latestLocked = [...latestRuns].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).find(r => r.isLocked);
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
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              sx={{ fontSize: 11, py: 0.25 }}
              onClick={() => setInspectionDialogAsset(asset)}
            >
              Inspections
            </Button>
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
                              label={`${allBom.length} part${allBom.length !== 1 ? "s" : ""}${invCount > 0 ? ` | ${invCount} inventory` : ""}`}
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
                                <Typography variant="caption" color="text.secondary">x {item.actualQty} {item.unitOfMeasure}</Typography>
                              </Stack>
                              {item.isInventory && (item.unitCaptures ?? []).map((fields, i) => (
                                <Typography key={i} variant="caption" color="text.secondary" display="block" sx={{ pl: 1 }}>
                                  u{i + 1}: {Object.entries(fields).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" | ") || "-"}
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
                    <Tooltip title={latestRun?.status === "Complete" ? "View run history, download report, or re-run workflow" : latestRun?.status === "Issue" ? "Open run to review and resolve open issues" : ""}>
                      <Button
                        size="small"
                        variant={latestRun?.status === "InProgress" ? "contained" : "outlined"}
                        color={latestRun?.status === "Issue" ? "error" : latestRun?.status === "Complete" ? "inherit" : "success"}
                        disabled={runLoading}
                        startIcon={runLoading ? <CircularProgress size={12} /> : latestRun?.status === "Complete" ? <HistoryOutlined /> : <PlayArrowOutlined />}
                        onClick={() =>
                          latestRun?.status === "Complete" || latestRun?.status === "Issue"
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
                    {e.reason || <Typography component="span" variant="caption" color="text.disabled">-</Typography>}
                  </TableCell>
                  <TableCell sx={{ fontSize: 11, py: 0.5, color: "text.secondary", whiteSpace: "nowrap" }}>
                    {new Date(e.startedAtUtc).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                  <TableCell sx={{ fontSize: 11, py: 0.5, color: "warning.main", whiteSpace: "nowrap" }}>
                    {e.durationSecs > 0 ? formatRunDur(e.durationSecs) : "-"}
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

  const activeHealth = useMemo(
    () => activeProduct ? healthMap[activeProduct.id] : computeHealth(assets),
    [activeProduct, assets, healthMap]
  );

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
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="h5" sx={{ fontFamily: "Sora" }}>Project Assets</Typography>
          {activeProduct?.name && <Chip size="small" color="primary" variant="outlined" label={activeProduct.name} />}
          <Tooltip title={
            selectedProject
              ? selectedProjectHasInspection
                ? `Track project assets for ${selectedProject.jobNumber} - manage installation and inspection workflows from one workspace.`
                : `Track assets for ${selectedProject.jobNumber} - start work orders, record status, and monitor progress.`
              : "Track assets across all projects - start work orders, record status, and monitor progress."
          }>
            <InfoOutlined sx={{ fontSize: 16, color: "text.secondary", cursor: "pointer" }} />
          </Tooltip>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={refreshAssets}>
              <RefreshOutlined sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          {selectedProjectHasInspection && selectedProject && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => navigate(`/projects/${selectedProject.id}`)}
            >
              Inspection Assets
            </Button>
          )}
          {showAdvancedAssetActions && can.modifyData && (
            <Tooltip title={activeProduct?.id ? `Open the workflow builder for ${activeProduct.name}` : "Select a project with a product to create a workflow"}>
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AssignmentOutlined />}
                  disabled={!canCreateWorkflow || creatingWorkflowDraft}
                  onClick={() => { void openWorkflowBuilderForProduct(); }}
                >
                  {creatingWorkflowDraft ? "Creating Draft..." : "Create Workflow"}
                </Button>
              </span>
            </Tooltip>
          )}
          {showAdvancedAssetActions && can.modifyData && (
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
          {showAdvancedAssetActions && can.modifyData && (
            <Button variant="contained" startIcon={<AddOutlined />} onClick={openAdd} disabled={!activeProduct}>Add asset</Button>
          )}
        </Stack>
      </Stack>

      {arrivalBanner && (
        <Alert severity={arrivalBanner.severity} sx={{ mt: 0.5 }}>
          {arrivalBanner.message}
        </Alert>
      )}

      {/* Health summary bar */}
      {!loadingAssets && activeHealth && activeHealth.total > 0 && (
        <Paper className="glass-card" sx={{ px: 2.5, py: 1.5 }}>
          {/* Header row — always visible */}
          <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap" useFlexGap>
            <Typography variant="caption" color="text.secondary" fontWeight={700}
              sx={{ textTransform: "uppercase", letterSpacing: 0.5, flexShrink: 0 }}>
              {activeProduct?.name ?? "All projects"} health
            </Typography>
            {/* Collapsed summary chips */}
            {!healthExpanded && (
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                {activeHealth.complete > 0 && <Chip size="small" label={`${activeHealth.complete} Complete`} color="success" sx={{ height: 18, fontSize: 10 }} />}
                {activeHealth.inProgress > 0 && <Chip size="small" label={`${activeHealth.inProgress} In Progress`} color="primary" sx={{ height: 18, fontSize: 10 }} />}
                {activeHealth.paused > 0 && <Chip size="small" label={`${activeHealth.paused} Paused`} color="warning" sx={{ height: 18, fontSize: 10 }} />}
                {activeHealth.pending > 0 && <Chip size="small" label={`${activeHealth.pending} Pending`} color="warning" sx={{ height: 18, fontSize: 10 }} />}
                {activeHealth.issue > 0 && <Chip size="small" label={`${activeHealth.issue} Issue`} color="error" sx={{ height: 18, fontSize: 10 }} />}
                <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>
                  {activeHealth.total > 0 ? Math.round((activeHealth.complete / activeHealth.total) * 100) : 0}%
                </Typography>
              </Stack>
            )}
            <Box sx={{ flex: 1 }} />
            <Tooltip title={healthExpanded ? "Minimize health panel" : "Expand health panel"}>
              <IconButton size="small" onClick={() => setHealthExpanded(v => !v)} sx={{ p: 0.25 }}>
                {healthExpanded ? <ExpandLessOutlined sx={{ fontSize: 18 }} /> : <ExpandMoreOutlined sx={{ fontSize: 18 }} />}
              </IconButton>
            </Tooltip>
          </Stack>
          {/* Collapsible content */}
          <Collapse in={healthExpanded}>
            <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {activeHealth.notStarted > 0 && (
                  <Chip size="small" label={`${activeHealth.notStarted} Not Started`} />
                )}
                {activeHealth.inProgress > 0 && (
                  <Chip size="small" label={`${activeHealth.inProgress} In Progress`} color="primary" />
                )}
                {activeHealth.paused > 0 && (
                  <Chip size="small" label={`${activeHealth.paused} Paused`} color="warning" />
                )}
                {activeHealth.pending > 0 && (
                  <Chip size="small" label={`${activeHealth.pending} Pending`} color="warning" />
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
          </Collapse>
        </Paper>
      )}

      {/* Filters */}
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        <FormControl size="small" sx={{ flex: 1, minWidth: 150 }}>
          <InputLabel shrink>Project</InputLabel>
          <Select label="Project" value={productProjects.length > 0 ? selectedProjectId : ""} onChange={(e) => { setSelectedProjectId(e.target.value); try { sessionStorage.setItem("installations_selected_project_id", e.target.value); } catch {} }}>
            <MenuItem value="">All projects</MenuItem>
            {productProjects.map((p) => <MenuItem key={p.id} value={p.id}>{p.jobNumber} - {p.customerName}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel shrink>Status</InputLabel>
          <Select label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ProjectAssetStatus | "All")}>
            <MenuItem value="All">All statuses</MenuItem>
            <MenuItem value="NotStarted">Not Started</MenuItem>
            <MenuItem value="InProgress">In Progress</MenuItem>
            <MenuItem value="Paused">Paused</MenuItem>
            <MenuItem value="Pending">Pending</MenuItem>
            <MenuItem value="Complete">Complete</MenuItem>
            <MenuItem value="Issue">Issue</MenuItem>
          </Select>
        </FormControl>
        <Tooltip title="Search by asset tag, serial number, or installer">
          <IconButton
            size="small"
            onClick={() => { setAssetSearchQuery(""); setAssetSearchOpen(true); }}
            sx={{
              border: "1px solid",
              borderColor: search ? "primary.main" : "divider",
              borderRadius: 1,
              color: search ? "primary.main" : "text.secondary",
              p: 0.75,
            }}
          >
            <SearchOutlined sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* Scope indicator — shown when user sees a filtered subset of assets */}
      {!canViewAllAssets && !archiveMode && (
        <Alert severity="info" sx={{ py: 0.5, fontSize: "0.78rem" }}>
          {isAssignmentScoped
            ? "Showing only assets assigned to you."
            : "Showing only assets in your managed projects."}
        </Alert>
      )}

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
              setBulkWfConfigId("");
              setBulkWfTypeId(resolveRequestedWorkflowTypeId(workflowTypes));
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

          {/* Assign user */}
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setBulkTechId("");
              const sel = visibleAssets.filter((a) => selectedAssetIds.has(a.id));
              const withTech = sel.filter((a) => !!a.assignedUserId);
              if (withTech.length === 0) { setBulkTechOpen(true); return; }
              setBulkWarnTitle("Some assets already have a user assigned");
              setBulkWarnBody(
                "These assets already have a user assigned. Proceeding will replace their current assignment."
              );
              setBulkWarnRows(withTech.map((a) => ({
                assetTag: a.assetTag,
                current: userMap.get(a.assignedUserId!)?.fullName ?? "Unknown",
              })));
              bulkWarnProceedRef.current = () => setBulkTechOpen(true);
              setBulkWarnOpen(true);
            }}
          >
            Assign user
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
                ...atLimit.map((a) => ({ assetTag: a.assetTag, current: "3/3 docs - will be skipped" })),
                ...withDocs.map((a) => ({ assetTag: a.assetTag, current: `${docsCountMap[a.id]}/3 docs (existing kept)` })),
              ];
              if (affected.length === 0) { setBulkDocsOpen(true); return; }
              setBulkWarnTitle("Some assets already have documents");
              setBulkWarnBody(
                "Assets at the 3-document limit will be skipped. For assets with fewer than 3 documents, existing documents will NOT be deleted - the new document will be added alongside them."
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

          {!archiveMode && (
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={() => setBulkDeleteOpen(true)}
            >
              Archive selected
            </Button>
          )}

          <Button size="small" color="inherit" onClick={() => setSelectedAssetIds(new Set())}>
            Clear
          </Button>
        </Paper>
      )}

      {/* Table toolbar */}
      {(showAdvancedAssetActions || (selectedProjectHasInspection && selectedProject && !archiveMode) || archiveMode) && (
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
          {showAdvancedAssetActions && (
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
                  {archiveMode ? "Archive View - Exit" : "Archive"}
                </Button>
              </Tooltip>
              <Tooltip title="Print / Save PDF">
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<PrintOutlined fontSize="small" />}
                  onClick={() => {
                    setPrintScope(selectedAssetIds.size > 0 ? "selection" : "visible");
                    setPrintOpen(true);
                  }}
                  sx={{ fontSize: 12 }}
                >
                  Print / PDF
                </Button>
              </Tooltip>
            </Stack>
          )}
          <Stack direction="row" spacing={1} alignItems="center">
            {selectedProjectHasInspection && selectedProject && !archiveMode && (
              <Button
                size="small"
                variant="outlined"
                onClick={() => navigate(`/projects/${selectedProject.id}/inspections/inbox`)}
                sx={{ fontSize: 12 }}
              >
                Inspection Inbox
              </Button>
            )}
          </Stack>
          {archiveMode && (
            <Typography variant="caption" color="text.secondary">
              Showing archived assets from the server
            </Typography>
          )}
        </Box>
      )}

      {/* Fix 7 — Stale cache warning (mobile only) */}
      {isNativePlatform && cacheStale && (
        <Alert
          severity={cacheStale === "hard" ? "error" : "warning"}
          action={
            <Button color="inherit" size="small" onClick={() => { setCacheStale(null); void refreshAssets(); }}>
              Refresh
            </Button>
          }
          sx={{ mx: 0, fontSize: "0.78rem" }}
        >
          {cacheStale === "hard"
            ? "Asset data is over 24 hours old. Refresh to get the latest."
            : "Asset data may be outdated (over 4 hours). Tap refresh to update."}
        </Alert>
      )}

      {/* Fix 3 — Pull-to-refresh tap target (mobile only) */}
      {isNativePlatform && !loadingAssets && visibleAssets.length > 0 && (
        <Stack direction="row" justifyContent="center" alignItems="center" spacing={0.5}
          onClick={() => void refreshAssets()}
          sx={{ cursor: "pointer", py: 0.5 }}>
          <RefreshOutlined sx={{ fontSize: 14, color: "text.secondary" }} />
          <Typography variant="caption" color="text.secondary" sx={{ userSelect: "none" }}>
            ↻ Tap to refresh
          </Typography>
        </Stack>
      )}

      {/* Fix 4 — Last synced timestamp (mobile only) */}
      {isNativePlatform && lastFetchedAt && (
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center", display: "block" }}>
          Last updated: {timeAgo(lastFetchedAt)}
        </Typography>
      )}

      {/* Web keeps the original table workspace; native keeps the mobile card list. */}
      {loadingAssets ? (
        <Stack alignItems="center" justifyContent="center" sx={{ p: 6 }}>
          <CircularProgress size={32} />
        </Stack>
      ) : visibleAssets.length === 0 ? (
        <Alert severity="info">
          {assets.length === 0
            ? archiveMode
              ? "No archived assets found for this product."
              : `No assets added for ${activeProduct?.name ?? "this product"} yet.`
            : !canViewAllAssets && selectedProjectId && assets.some((a) => a.projectId === selectedProjectId && !a.isDeleted)
              ? isAssignmentScoped
                ? "You have no assets assigned to you in this project."
                : "You have no assets in your managed projects matching this selection."
              : "No assets match the current filters."}
        </Alert>
      ) : isNativePlatform ? (
        <Stack spacing={0.75}>
          {visibleAssets.map((asset) => {
            const proj = projectMap.get(asset.projectId);
            const tech = asset.assignedUserId ? userMap.get(asset.assignedUserId) : null;
            const isExpanded = expandedAssetId === asset.id;
            const runs = runsMap[asset.id] ?? [];
            const healthColor = computeAssetHealth(asset, runs);

            // Signature check — same logic as web status column
            const latestLocked = runs.find(r => r.isLocked);
            const awaitingCustomerSig = asset.status === "Complete"
              && !!latestLocked
              && !latestLocked.customerSignedAt
              && latestLocked.signatureStatus !== "WaivedCustomer";

            // Smart composite status chip (reflects true condition, not raw asset.status)
            const smartChipColor: "default" | "primary" | "success" | "error" | "warning" =
              healthColor === "red" ? "error" :
              healthColor === "amber" ? "warning" :
              awaitingCustomerSig ? "warning" :
              healthColor === "green" ? "success" :
              STATUS_COLORS[asset.status as ProjectAssetStatus];
            const smartChipLabel = awaitingCustomerSig && healthColor !== "red" && healthColor !== "amber"
              ? "Awaiting Sig"
              : STATUS_LABELS[asset.status as ProjectAssetStatus];

            // Evidence/workflow sub-status badge
            const latestRun = [...runs].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
            const paused = Boolean(pausedProgress[asset.id]);
            const hasWorkflow = asset.workflowSummary?.hasWorkflow || !!asset.productConfigId || !!asset.workflowTemplateId;
            let subLabel: string | null = null;
            let subColor: "warning" | "success" | "error" | "primary" | "default" = "default";
            if (hasWorkflow || latestRun) {
              if (paused || latestRun?.status === "Paused" || asset.workflowSummary?.evidenceStatus === "Paused") {
                subLabel = "Paused"; subColor = "warning";
              } else if (asset.workflowSummary?.evidenceStatus === "MissingData" || (latestRun && runHasCompletedAllSteps(latestRun) && countMissingWorkflowItems(latestRun) > 0)) {
                subLabel = "Missing"; subColor = "error";
              } else if (!awaitingCustomerSig && (asset.workflowSummary?.evidenceStatus === "Running" || (latestRun && !latestRun.isLocked))) {
                subLabel = "Running"; subColor = "primary";
              }
            }

            // Smart one-liner description of true asset condition
            const smartDesc = (() => {
              let issues: AssetIssue[] = [];
              try { issues = JSON.parse(asset.issuesJson || "[]"); } catch {}
              const open = issues.filter(i => !i.resolved);
              const blockingCount = open.filter(i => i.isBlocking).length;
              const issueNote =
                blockingCount > 0
                  ? `${blockingCount} blocking issue${blockingCount > 1 ? "s" : ""}`
                  : open.some(i => i.severity === "high") ? "high severity issue"
                  : open.length > 0 ? `${open.length} open issue${open.length > 1 ? "s" : ""}`
                  : null;
              const st = asset.status as ProjectAssetStatus;
              let cond = "";
              if (st === "Complete") {
                if (awaitingCustomerSig) cond = "complete · awaiting signature";
                else if (subLabel === "Missing") cond = "complete · missing data";
                else cond = issueNote ? `complete · ${issueNote}` : "complete";
              } else if (st === "InProgress") {
                const base = subLabel === "Paused" ? "paused" : "in progress · running";
                cond = issueNote ? `${base} · ${issueNote}` : base;
              } else if (st === "NotStarted") {
                cond = !hasWorkflow && !latestRun ? "no workflow" : issueNote ? `not started · ${issueNote}` : "not started";
              } else if (st === "Issue") {
                cond = issueNote ? `issue · ${issueNote}` : "issue";
              } else if (st === "Paused") {
                cond = issueNote ? `paused · ${issueNote}` : "paused";
              } else if (st === "Pending") {
                cond = issueNote ? `pending · ${issueNote}` : "pending";
              } else {
                cond = (STATUS_LABELS[st as ProjectAssetStatus] ?? (st as string)).toLowerCase();
              }
              const prefix = tech?.fullName ? `${tech.fullName} · ` : "";
              return `${prefix}${cond}`;
            })();

            // Left border — reflects urgency for issues, missing data, and awaiting signature
            const borderLeftColor =
              healthColor === "red" ? "error.main" :
              healthColor === "amber" ? "warning.main" :
              subColor === "error" ? "error.main" :
              awaitingCustomerSig ? "warning.main" :
              "transparent";

            // Quick action button — most common next action without needing to expand
            const primaryAction = getPrimaryAction(asset, proj?.workflowMode);
            const quickAction = primaryAction ? (
              <Tooltip title={primaryAction.tooltip}>
                <Button
                  size="small"
                  variant={primaryAction.variant === "text" ? "outlined" : primaryAction.variant ?? "outlined"}
                  color={primaryAction.color === "inherit" ? "inherit" : primaryAction.color}
                  startIcon={primaryAction.icon}
                  onClick={(e) => {
                    e.stopPropagation();
                    primaryAction.onClick();
                  }}
                  sx={{ flexShrink: 0, whiteSpace: "nowrap", minWidth: 0 }}
                >
                  {primaryAction.label}
                </Button>
              </Tooltip>
            ) : null;

            return (
              <Paper
                key={asset.id}
                className="glass-card"
                sx={{
                  overflow: "hidden",
                  borderLeft: "3px solid",
                  borderLeftColor,
                }}
              >
                {/* Main card row */}
                <Stack direction="row" alignItems="center" sx={{ px: 1.25, py: 1.25 }} spacing={1}>
                  {/* Expand chevron */}
                  <IconButton
                    size="small"
                    sx={{ p: 0.25, flexShrink: 0 }}
                    onClick={() => {
                      const nextId = isExpanded ? null : asset.id;
                      setExpandedAssetId(nextId);
                      if (nextId) loadAssignmentsForAsset(nextId);
                    }}
                  >
                    {isExpanded
                      ? <ExpandLessOutlined sx={{ fontSize: 18 }} />
                      : <ExpandMoreOutlined sx={{ fontSize: 18 }} />}
                  </IconButton>

                  {/* Asset tag + asset name (inline) + smart description + tech */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={700} sx={{ flexShrink: 0 }}>{asset.assetTag}</Typography>
                      {asset.assetName && (
                        <Typography variant="body2" color="text.secondary" noWrap sx={{ fontWeight: 400, minWidth: 0 }}>
                          {asset.assetName}
                        </Typography>
                      )}
                      {issuesBadge(asset)}
                    </Stack>
                    <Typography
                      noWrap
                      sx={{ display: "block", fontSize: "0.68rem", color: "text.secondary", lineHeight: 1.3, mt: 0.15 }}
                    >
                      {smartDesc}
                    </Typography>
                  </Box>

                  {/* Status area: sub-status badge + smart main chip */}
                  <Stack alignItems="flex-end" spacing={0.5} sx={{ flexShrink: 0 }}>
                    {subLabel && (
                      <Chip
                        size="small"
                        label={subLabel}
                        color={subColor}
                        variant="outlined"
                        sx={{ height: 18, fontSize: "0.65rem", "& .MuiChip-label": { px: 0.75 } }}
                      />
                    )}
                    <Chip
                      size="small"
                      label={smartChipLabel}
                      color={smartChipColor}
                      onClick={(e) => {
                        e.stopPropagation();
                        setStatusMenuAnchor(e.currentTarget as HTMLElement);
                        setStatusMenuAsset(asset);
                        loadAssignmentsForAsset(asset.id);
                      }}
                      sx={{ cursor: "pointer", fontWeight: 600, fontSize: "0.7rem" }}
                    />
                  </Stack>

                  {/* Quick action icon button */}
                  {quickAction}
                </Stack>

                {/* Expandable detail panel */}
                <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                  <Box sx={{ px: 2, py: 2, bgcolor: "rgba(45,212,191,0.05)", borderTop: "1px solid", borderColor: "divider" }}>
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
              </Paper>
            );
          })}
        </Stack>
      ) : (
        <Paper className="glass-card" sx={{ overflow: "hidden" }}>
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
                      {col.id === "features" ? (
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Typography variant="caption" fontWeight={700}>{col.label}</Typography>
                          <Tooltip
                            title={
                              <Stack spacing={0.5}>
                                <Typography variant="caption" sx={{ fontWeight: 700, color: "common.white" }}>
                                  Feature Colors
                                </Typography>
                                <Typography variant="caption">Amber: Pending or Paused</Typography>
                                <Typography variant="caption">Blue: Running</Typography>
                                <Typography variant="caption">Green: Complete</Typography>
                                <Typography variant="caption">Red: Missing data</Typography>
                              </Stack>
                            }
                          >
                            <InfoOutlined sx={{ fontSize: 14, color: "text.disabled", cursor: "help" }} />
                          </Tooltip>
                        </Stack>
                      ) : (
                        <Typography variant="caption" fontWeight={700}>{col.label}</Typography>
                      )}
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
                      sx={{
                        bgcolor: hasIssue
                          ? "rgba(211,47,47,0.04)"
                          : selectedAssetIds.has(asset.id)
                            ? "rgba(var(--primary-rgb,25,118,210),0.08)"
                            : undefined
                      }}
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
                          {hasIssue && (
                            <Box
                              sx={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                bgcolor: computeAssetHealth(asset, runsMap[asset.id] ?? []) === "red" ? "error.main" : "warning.main",
                                flexShrink: 0
                              }}
                            />
                          )}
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
                          {(canRunAssetWorkflow || asset.status === "Complete") && actionButton(asset, proj?.workflowMode)}
                          {canManageAssetDocuments && (
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
                          {canViewInstallationAssets && (
                            <Tooltip title="Generate PDF report">
                              <span>
                                <IconButton
                                  size="small"
                                  disabled={reportGenerating === asset.id}
                                  onClick={() => handleGeneratePdfReport(asset)}
                                >
                                  {reportGenerating === asset.id
                                    ? <CircularProgress size={16} />
                                    : <ArticleOutlined fontSize="small" />}
                                </IconButton>
                              </span>
                            </Tooltip>
                          )}
                          {canEditInstallationAssets && canEditAssetFromWebTable(asset) && !archiveMode && (
                            <Tooltip title="Edit asset">
                              <IconButton size="small" onClick={() => openEditAsset(asset)}>
                                <EditOutlined fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {canDeleteInstallationAssets && canEditAssetFromWebTable(asset) && !archiveMode && (
                            <Tooltip title="Archive asset">
                              <IconButton size="small" color="error" onClick={() => setDeleteAsset(asset)}>
                                <DeleteOutline fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {canDeleteInstallationAssets && canEditAssetFromWebTable(asset) && archiveMode && (
                            <Tooltip title="Restore asset">
                              <span>
                                <IconButton size="small" disabled={deletingAsset} onClick={() => confirmRestoreAsset(asset)}>
                                  <RestoreOutlined fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          )}
                          {canDeleteInstallationAssets && canEditAssetFromWebTable(asset) && archiveMode && (
                            <Tooltip title="Delete asset permanently">
                              <span>
                                <IconButton size="small" color="error" disabled={purgingAsset} onClick={() => setPurgeAsset(asset)}>
                                  <DeleteForeverOutlined fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          )}
                          {!((canRunAssetWorkflow || asset.status === "Complete")
                            || canManageAssetDocuments
                            || canViewInstallationAssets
                            || (canEditInstallationAssets && canEditAssetFromWebTable(asset) && !archiveMode)
                            || (canDeleteInstallationAssets && canEditAssetFromWebTable(asset))) && (
                            <Typography variant="caption" color="text.disabled">
                              No actions
                            </Typography>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>,

                    <TableRow key={`${asset.id}-detail`}>
                      <TableCell colSpan={3 + visibleColumns.length} sx={{ py: 0 }}>
                        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                          <Box sx={{ px: 3, py: 2, bgcolor: "rgba(45,212,191,0.05)", borderBottom: "1px solid", borderColor: "divider" }}>
                            <Typography
                              variant="caption"
                              fontWeight={700}
                              color="text.secondary"
                              sx={{ textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 1.5 }}
                            >
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
        </Paper>
      )}

      {/* Status action popover */}
      <Popover
        open={Boolean(statusMenuAnchor)}
        anchorEl={statusMenuAnchor}
        onClose={() => { setStatusMenuAnchor(null); setStatusMenuAsset(null); }}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        PaperProps={{ sx: { borderRadius: 2, minWidth: 220, p: 1.5 } }}
      >
        {statusMenuAsset && (() => {
          const a = statusMenuAsset;
          const proj = projectMap.get(a.projectId);
          const docsCount = docsCountMap[a.id] ?? 0;
          return (
            <Stack spacing={1}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="body2" fontWeight={700} sx={{ flex: 1 }}>{a.assetTag}</Typography>
                <Chip size="small" label={STATUS_LABELS[a.status as ProjectAssetStatus]} color={STATUS_COLORS[a.status as ProjectAssetStatus]} sx={{ fontSize: "0.7rem" }} />
              </Stack>
              <Divider />
              {(canRunAssetWorkflow || a.status === "Complete") && (
                <Box>{actionButton(a, proj?.workflowMode)}</Box>
              )}
              {canManageAssetDocuments && (
                <Button size="small" fullWidth variant="outlined" startIcon={<FolderOutlined fontSize="small" />}
                  onClick={() => { setDocsAsset(a); setDocsOpen(true); setStatusMenuAnchor(null); setStatusMenuAsset(null); }}>
                  Documents ({docsCount}/3)
                </Button>
              )}
              {canViewInstallationAssets && (
                <Button size="small" fullWidth variant="outlined"
                  startIcon={reportGenerating === a.id ? <CircularProgress size={14} /> : <ArticleOutlined fontSize="small" />}
                  disabled={reportGenerating === a.id}
                  onClick={() => { handleGeneratePdfReport(a); setStatusMenuAnchor(null); setStatusMenuAsset(null); }}>
                  PDF Report
                </Button>
              )}
              {canEditInstallationAssets && canEditAssetFromWebTable(a) && !archiveMode && (
                <Button size="small" fullWidth variant="outlined" startIcon={<EditOutlined fontSize="small" />}
                  onClick={() => { openEditAsset(a); setStatusMenuAnchor(null); setStatusMenuAsset(null); }}>
                  Edit Asset
                </Button>
              )}
              {canDeleteInstallationAssets && canEditAssetFromWebTable(a) && !archiveMode && showAdvancedAssetActions && (
                <Button size="small" fullWidth variant="outlined" color="error" startIcon={<DeleteOutline fontSize="small" />}
                  onClick={() => { setDeleteAsset(a); setStatusMenuAnchor(null); setStatusMenuAsset(null); }}>
                  Archive
                </Button>
              )}
              {canDeleteInstallationAssets && canEditAssetFromWebTable(a) && archiveMode && (
                <Button size="small" fullWidth variant="outlined"
                  startIcon={<RestoreOutlined fontSize="small" />}
                  disabled={deletingAsset}
                  onClick={() => { confirmRestoreAsset(a); setStatusMenuAnchor(null); setStatusMenuAsset(null); }}>
                  Restore
                </Button>
              )}
              {canDeleteInstallationAssets && canEditAssetFromWebTable(a) && archiveMode && (
                <Button size="small" fullWidth variant="outlined" color="error"
                  startIcon={<DeleteForeverOutlined fontSize="small" />}
                  disabled={purgingAsset}
                  onClick={() => { setPurgeAsset(a); setStatusMenuAnchor(null); setStatusMenuAsset(null); }}>
                  Delete Permanently
                </Button>
              )}
            </Stack>
          );
        })()}
      </Popover>

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
                    {proj.jobNumber} - {proj.customerName}
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
                    {wc.configType ? `${wc.configType} - ` : ""}{wc.name}{wc.version > 1 ? ` (v${wc.version})` : ""}
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
              placeholder="i.e LV workshop, U/G"
              InputLabelProps={{ shrink: true }}
              helperText={
                addForm.projectId && projects.find((p) => p.id === addForm.projectId)?.siteName
                  ? `Site: ${projects.find((p) => p.id === addForm.projectId)?.siteName}`
                  : undefined
              }
            />
            <FormControl size="small" fullWidth>
              <InputLabel shrink>Assigned User</InputLabel>
              <Select label="Assigned User" value={addForm.assignedUserId}
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
            {addSaving ? "Saving..." : "Add asset"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit asset dialog */}
      <Dialog open={editOpen} onClose={() => !editSaving && setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Asset - {editAsset?.assetTag}</DialogTitle>
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
                    {wc.configType ? `${wc.configType} - ` : ""}{wc.name}{wc.version > 1 ? ` (v${wc.version})` : ""}
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
              onChange={(e) => setEditForm((p) => ({ ...p, location: e.target.value }))}
              placeholder="i.e LV workshop, U/G"
              InputLabelProps={{ shrink: true }} />
            <FormControl size="small" fullWidth>
              <InputLabel shrink>Assigned User</InputLabel>
              <Select label="Assigned User" value={editForm.assignedUserId}
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
                onChange={(e) => setEditStatus(e.target.value as ProjectAssetStatus)}
                disabled={!canEditAssetStatus}>
                <MenuItem value="NotStarted">Not Started</MenuItem>
                <MenuItem value="InProgress">In Progress</MenuItem>
                <MenuItem value="Paused">Paused</MenuItem>
                <MenuItem value="Pending">Pending</MenuItem>
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
            {editSaving ? "Saving..." : "Save changes"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Archive confirmation */}
      <Dialog open={Boolean(deleteAsset)} onClose={() => !deletingAsset && setDeleteAsset(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Archive Asset?</DialogTitle>
        <DialogContent>
          <Typography>
            Archive asset <strong>{deleteAsset?.assetTag}</strong>? It will be removed from active lists for all users and can be restored later.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteAsset(null)} disabled={deletingAsset}>Cancel</Button>
          <Button variant="contained" color="error" onClick={confirmDeleteAsset} disabled={deletingAsset}
            startIcon={deletingAsset ? <CircularProgress size={14} /> : undefined}>
            {deletingAsset ? "Archiving..." : "Archive"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk archive confirmation */}
      <Dialog open={bulkDeleteOpen} onClose={() => !bulkDeleting && setBulkDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Archive {selectedAssetIds.size} Asset{selectedAssetIds.size !== 1 ? "s" : ""}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" gutterBottom>
            You are about to archive <strong>{selectedAssetIds.size}</strong> asset{selectedAssetIds.size !== 1 ? "s" : ""}. They will be removed from active lists for all users and can be restored later.
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Associated workflow runs, issues, and documents will be hidden with the asset.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleting}>Cancel</Button>
          <Button variant="contained" color="error" onClick={confirmBulkDelete} disabled={bulkDeleting}
            startIcon={bulkDeleting ? <CircularProgress size={14} /> : undefined}>
            {bulkDeleting ? "Archiving..." : `Archive ${selectedAssetIds.size}`}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(purgeAsset)} onClose={() => !purgingAsset && setPurgeAsset(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Asset Permanently?</DialogTitle>
        <DialogContent>
          <Typography>
            Permanently delete asset <strong>{purgeAsset?.assetTag}</strong>? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPurgeAsset(null)} disabled={purgingAsset}>Cancel</Button>
          <Button variant="contained" color="error" onClick={confirmPurgeAsset} disabled={purgingAsset}
            startIcon={purgingAsset ? <CircularProgress size={14} /> : undefined}>
            {purgingAsset ? "Deleting..." : "Delete permanently"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add issue dialog */}
      <Dialog open={issueDialogOpen} onClose={() => { setIssueDialogOpen(false); setIssueDialogAsset(null); setIssueMedia([]); }} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <ReportProblemOutlined color="error" fontSize="small" />
            <span>Add Issue - {issueDialogAsset?.assetTag}</span>
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
              placeholder="Describe the issue..."
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
            Check to show a column. Drag rows to reorder - top of the list = leftmost in the table.
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
            <span>Assign Workflow - {assignDialogAsset?.assetTag}</span>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl size="small" fullWidth required>
              <InputLabel shrink>Workflow Type *</InputLabel>
              <Select
                label="Workflow Type *"
                value={assignForm.workflowTypeId}
                onChange={(e) => setAssignForm({ workflowTypeId: e.target.value, workflowConfigId: "" })}
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
                {filteredAssignWorkflowConfigs.length === 0 && (
                  <MenuItem value="" disabled>No published configs available</MenuItem>
                )}
                {filteredAssignWorkflowConfigs.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                    {c.configType ? ` - ${c.configType}` : ""}
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>v{c.version}</Typography>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {(() => {
              const selType = workflowTypes.find((t) => t.id === assignForm.workflowTypeId);
              const selCfg  = workflowConfigs.find((c) => c.id === assignForm.workflowConfigId);
              const msg = assignForm.workflowTypeId && assignForm.workflowConfigId
                ? workflowTypeMismatchMessage(selType?.name, selCfg?.configType)
                : null;
              return msg ? (
                <Alert severity="warning" sx={{ fontSize: "0.8rem" }}>{msg}</Alert>
              ) : null;
            })()}
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
            {assignSaving ? "Saving..." : "Assign"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Asset search dialog */}
      <Dialog
        open={assetSearchOpen}
        onClose={() => setAssetSearchOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <SearchOutlined fontSize="small" />
            <span>Search Assets</span>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ pt: "8px !important" }}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            placeholder="Asset tag, serial number, or installer name…"
            value={assetSearchQuery}
            onChange={(e) => setAssetSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined sx={{ fontSize: 18, color: "text.secondary" }} />
                </InputAdornment>
              ),
            }}
            sx={{ mb: 1.5 }}
          />
          {(() => {
            const q = assetSearchQuery.trim().toLowerCase();
            if (q.length < 2) {
              return (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                  Type at least 2 characters to search
                </Typography>
              );
            }
            const results = assets
              .filter((a) => !a.isDeleted)
              .filter((a) => {
                const installerName = (a.installedBy ?? users.find((u) => u.id === a.assignedUserId)?.fullName ?? "").toLowerCase();
                return (
                  a.assetTag?.toLowerCase().includes(q) ||
                  a.serialNumber?.toLowerCase().includes(q) ||
                  installerName.includes(q)
                );
              })
              .slice(0, 50);
            if (results.length === 0) {
              return (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                  No assets match "{assetSearchQuery}"
                </Typography>
              );
            }
            return (
              <List dense disablePadding sx={{ maxHeight: 360, overflowY: "auto" }}>
                {results.map((a) => {
                  const proj = projects.find((p) => p.id === a.projectId);
                  const installer = a.installedBy ?? users.find((u) => u.id === a.assignedUserId)?.fullName;
                  const statusColor: Record<string, "default" | "primary" | "success" | "error"> = {
                    NotStarted: "default",
                    InProgress: "primary",
                    Complete: "success",
                    Issue: "error",
                  };
                  return (
                    <ListItem key={a.id} disablePadding divider>
                      <ListItemButton
                        onClick={() => {
                          setSearch(a.assetTag);
                          if (a.projectId) setSelectedProjectId(a.projectId);
                          setAssetSearchOpen(false);
                        }}
                        sx={{ py: 1, gap: 1 }}
                      >
                        <ListItemText
                          primary={
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Typography variant="body2" fontWeight={600}>{a.assetTag}</Typography>
                              {a.serialNumber && (
                                <Typography variant="caption" color="text.secondary">S/N: {a.serialNumber}</Typography>
                              )}
                              <Chip size="small" label={a.status} color={statusColor[a.status] ?? "default"} sx={{ height: 18, fontSize: 10 }} />
                            </Stack>
                          }
                          secondary={
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                              {proj && <Typography variant="caption" color="text.secondary">{proj.jobNumber}</Typography>}
                              {installer && <Typography variant="caption" color="text.secondary">· {installer}</Typography>}
                            </Stack>
                          }
                        />
                      </ListItemButton>
                    </ListItem>
                  );
                })}
              </List>
            );
          })()}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          {search && (
            <Button size="small" color="inherit" onClick={() => { setSearch(""); setAssetSearchOpen(false); }}>
              Clear filter
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button size="small" onClick={() => setAssetSearchOpen(false)}>Close</Button>
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
                <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>i</Typography>
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
                            <TableCell><Typography variant="body2">{r.asset_name || r.assetname || "-"}</Typography></TableCell>
                            <TableCell><Typography variant="body2">{r.config_type || r.configtype || "-"}</Typography></TableCell>
                            <TableCell><Typography variant="body2">{r.serial_number || r["serial_#"] || r.serialnumber || "-"}</Typography></TableCell>
                            <TableCell><Typography variant="body2">{r.model || r.asset_model || "-"}</Typography></TableCell>
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
            {csvImporting ? "Importing..." : `Import ${csvRows.filter((r) => r.asset_tag || r.assettag).length} asset${csvRows.filter((r) => r.asset_tag || r.assettag).length !== 1 ? "s" : ""}`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Inspection Import Dialog — per-asset popup */}
      {importDialogAsset && selectedProject && (
        <InspectionImportDialog
          open={Boolean(importDialogAsset)}
          onClose={() => setImportDialogAsset(null)}
          projectId={selectedProject.id}
          asset={importDialogAsset}
          onChanged={refreshAssets}
        />
      )}

      {/* Legacy run history dialog (assignment panel history icon) */}
      {runHistoryAsset && runHistoryAssignment && (
        <AssetWorkflowRunHistoryDialog
          open={Boolean(runHistoryAsset && runHistoryAssignment)}
          onClose={() => { setRunHistoryAsset(null); setRunHistoryAssignment(null); }}
          asset={runHistoryAsset}
          assignment={runHistoryAssignment}
        />
      )}

      {/* New run history dialog â€" View/Edit button â†' history, re-run, PDF report */}
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
          onAddMissingMedia={(run) => openMissingMediaDialog(runHistoryAsset, run)}
          allowRerun={runHistoryAllowRerun}
          allowContinue={runHistoryAllowRerun}
          project={runHistoryProject ?? undefined}
          customerLogoBase64={runHistoryCustomerLogo}
          assignedTechnician={users.find((u) => u.id === runHistoryAsset?.assignedUserId)?.fullName}
        />
      )}

      {/* Paused progress popover â€" click badge to see completed steps */}
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
                Progress - {prog.done} of {prog.total} steps
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

      {/* Workflow type / config mismatch warning */}
      <Dialog open={!!wfMismatchConfirm} onClose={() => setWfMismatchConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Workflow type mismatch</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 1.5 }}>{wfMismatchConfirm?.message}</Alert>
          <Typography variant="body2">
            You can still start the workflow, but check that this is intentional.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWfMismatchConfirm(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => {
              const confirm = wfMismatchConfirm;
              setWfMismatchConfirm(null);
              if (confirm) void _doStartAssignmentRun(confirm.asset, confirm.assignment);
            }}
          >
            Start anyway
          </Button>
        </DialogActions>
      </Dialog>

      {/* Work order runner */}
      {/* â"€â"€ Auto-assign warning dialog â"€â"€ */}
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

      {photoUploadTarget && (
        <PhotoUploadDialog
          open={Boolean(photoUploadTarget)}
          flag={photoUploadTarget}
          currentUserName={currentUser.fullName ?? currentUser.email ?? "User"}
          mode="installer"
          onClose={() => setPhotoUploadTarget(null)}
          onUpdated={async () => {
            const assetId = photoUploadTarget.assetId;
            setPhotoUploadTarget(null);
            await Promise.all([
              refreshAssets().catch(() => {}),
              loadAssignmentsForAsset(assetId).catch(() => {}),
            ]);
          }}
        />
      )}

      {/* Issue detail dialog (comments / close) */}
      {issueDetailAsset && issueDetailIssueId && (() => {
        if (issueDetailRunId) {
          const run = (runsMap[issueDetailAsset.id] ?? []).find((item) => item.id === issueDetailRunId);
          if (!run) return null;
          let issues: RunIssue[] = [];
          try { issues = JSON.parse(run.issuesJson || "[]"); } catch {}
          const issue = issues.find((i) => i.id === issueDetailIssueId);
          return issue ? (
            <IssueDetailDialog
              open={Boolean(issueDetailIssueId)}
              issue={issue}
              currentUser={currentUser?.fullName ?? currentUser?.email ?? "User"}
              onClose={() => { setIssueDetailIssueId(null); setIssueDetailAsset(null); setIssueDetailRunId(null); }}
              onSave={(updated) => saveInlineRunIssue(issueDetailRunId, issueDetailAsset.id, updated as RunIssue)}
            />
          ) : null;
        }

        let issues: AssetIssue[] = [];
        try { issues = JSON.parse(issueDetailAsset.issuesJson || "[]"); } catch {}
        const issue = issues.find((i) => i.id === issueDetailIssueId);
        return issue ? (
          <IssueDetailDialog
            open={Boolean(issueDetailIssueId)}
            issue={issue}
            currentUser={currentUser?.fullName ?? currentUser?.email ?? "User"}
            onClose={() => { setIssueDetailIssueId(null); setIssueDetailAsset(null); setIssueDetailRunId(null); }}
            onSave={(updated) => handleIssueDetailSave(updated as AssetIssue)}
          />
        ) : null;
      })()}
      {/* Override warning dialog â€" appears before any destructive bulk action */}
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
            Understood - continue
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk: Assign user dialog */}
      <Dialog open={bulkTechOpen} onClose={() => setBulkTechOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Assign user to {selectedAssetIds.size} asset{selectedAssetIds.size !== 1 ? "s" : ""}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel shrink>User</InputLabel>
            <Select label="User" value={bulkTechId} onChange={(e) => setBulkTechId(e.target.value)}>
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
                const selectedAssets = [...selectedAssetIds]
                  .map((assetId) => assets.find((a) => a.id === assetId))
                  .filter((a): a is ProjectAsset => Boolean(a));
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
            {bulkTechSaving ? "Saving..." : "Apply"}
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
              <Select
                label="Workflow type"
                value={bulkWfTypeId}
                onChange={(e) => {
                  setBulkWfTypeId(e.target.value);
                  setBulkWfConfigId("");
                }}
              >
                {workflowTypes.map((wt) => (
                  <MenuItem key={wt.id} value={wt.id}>{wt.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel shrink>Workflow config</InputLabel>
              <Select label="Workflow config" value={bulkWfConfigId} onChange={(e) => setBulkWfConfigId(e.target.value)}>
                {filteredBulkWorkflowConfigs.map((wc) => (
                  <MenuItem key={wc.id} value={wc.id}>{wc.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {(() => {
              const selType = workflowTypes.find((t) => t.id === bulkWfTypeId);
              const selCfg  = latestPublishedWfConfigs.find((c) => c.id === bulkWfConfigId);
              const msg = bulkWfTypeId && bulkWfConfigId
                ? workflowTypeMismatchMessage(selType?.name, selCfg?.configType)
                : null;
              return msg ? (
                <Alert severity="warning" sx={{ fontSize: "0.8rem" }}>{msg}</Alert>
              ) : null;
            })()}
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
            {bulkWfSaving ? "Saving..." : "Apply"}
          </Button>
        </DialogActions>
      </Dialog>
      {/* â"€â"€ Print / PDF dialog â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
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

            {/* â"€â"€ Scope â"€â"€ */}
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

            {/* â"€â"€ Custom filters â"€â"€ */}
            {printScope === "custom" && (
              <Box sx={{ pl: 2, borderLeft: "3px solid var(--stroke)" }}>
                <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Custom filters</Typography>
                <Stack spacing={2}>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <FormControl size="small" sx={{ minWidth: 200 }}>
                      <InputLabel shrink>User</InputLabel>
                      <Select label="User" value={printTechId} onChange={(e) => setPrintTechId(e.target.value)}>
                        <MenuItem value="">(All users)</MenuItem>
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
                      {(["NotStarted", "InProgress", "Paused", "Pending", "Complete", "Issue"] as const).map((s) => {
                        const labels: Record<string, string> = {
                          NotStarted: "Not Started", InProgress: "In Progress", Paused: "Paused", Pending: "Pending", Complete: "Complete", Issue: "Issue",
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

            {/* â"€â"€ Column picker â"€â"€ */}
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

            {/* â"€â"€ Group by â"€â"€ */}
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

            {/* â"€â"€ Preview count â"€â"€ */}
            <Alert
              severity={printRows.length === 0 ? "warning" : "info"}
              sx={{ py: 0.5 }}
            >
              {printRows.length === 0
                ? "No assets match the current filters."
                : `${printRows.length} asset${printRows.length !== 1 ? "s" : ""} will be included | ${printColumns.length} column${printColumns.length !== 1 ? "s" : ""} | grouped by ${printGroupBy}`}
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
                      ? [printTechId ? `Tech: ${userMap.get(printTechId)?.fullName}` : "", printModel ? `Model: ${printModel}` : "", printPendingSig ? "Pending Sig" : ""].filter(Boolean).join(" | ")
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
            {printGenerating ? "Generating..." : "Download PDF"}
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
                      ? [printTechId ? `Tech: ${userMap.get(printTechId)?.fullName}` : "", printModel ? `Model: ${printModel}` : "", printPendingSig ? "Pending Sig" : ""].filter(Boolean).join(" | ")
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
            {printGenerating ? "Generating..." : "Print"}
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
                {bulkDocsFile ? bulkDocsFile.name : "Choose file..."}
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
                  setBulkDocsResult(`Done - ${parts.join(", ")}.`);
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
              setBulkDocsResult(`Done - ${parts.join(", ")}.`);
              if (failed === 0) {
                setSelectedAssetIds(new Set());
              }
            }}
          >
            {bulkDocsSaving ? "Uploading..." : "Upload to all"}
          </Button>
        </DialogActions>
      </Dialog>

      <AssetInspectionDialog
        asset={inspectionDialogAsset}
        open={!!inspectionDialogAsset}
        onClose={() => setInspectionDialogAsset(null)}
      />

      <Snackbar
        open={!!inlineSaveError}
        autoHideDuration={5000}
        onClose={() => setInlineSaveError(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="error" onClose={() => setInlineSaveError(null)} sx={{ width: "100%" }}>
          {inlineSaveError}
        </Alert>
      </Snackbar>
    </Stack>
  );
};

export default AssetInstallationPage;
