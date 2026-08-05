import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import {
  AddOutlined,
  ArrowDropDown,
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
  GridOnOutlined,
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
  Skeleton,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Snackbar,
  Tooltip,
  Typography,
} from "@mui/material";
import { useNavigate, useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { useComplexView } from "../../contexts/ComplexViewContext";
import { useAuth } from "../../hooks/useAuth";
import { usePermissions } from "../../hooks/usePermissions";
import { useProjectTimeZone } from "../../hooks/useProjectTimeZone";
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
import { signatureService } from "../../services/signatureService";
import { workflowTypeService } from "../../services/workflowTypeService";
import { brandSettingsService } from "../../services/brandSettingsService";
import { customerService } from "../../services/customerService";
import { assetDocumentLinkService } from "../../services/assetDocumentLinkService";
import { entityGetAssetCacheAgeMs, CACHE_SOFT_LIMIT_MS, CACHE_HARD_LIMIT_MS, entityReplaceIssuesForAsset } from "../../services/localDB";
import { generateWorkflowReport, resolveImageToDataUrl } from "../../utils/generateWorkflowReport";
import { resolveReportTimeZone } from "../../utils/datetime";
import { BulkWorkflowReportDialog } from "../../components/reports/BulkWorkflowReportDialog";
import ProjectJobSelect from "../../components/ProjectJobSelect";
import { buildWorkflowReportJson, createWorkflowReportDocx, workflowReportBaseFileName, type WorkflowReportExportContext } from "../../utils/workflowReportExport";
import { countMissingWorkflowItems, runHasCompletedAllSteps } from "../../utils/workflowCompleteness";
import { randomId } from "../../utils/randomId";
import { getWorkflowDisplayState } from "../../utils/workflowDisplayState";
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
import { mergeRunsIntoMap, captureBlobsReadyForAssets } from "../../types/assetWorkflowRunSummary";
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
import AssetAddDialog from "./AssetAddDialog";
import InspectionImportDialog from "../projects/InspectionImportDialog";
import { useStaleOnResume } from "../../hooks/useStaleOnResume";
import { AssetRepository } from "../../repositories/AssetRepository";
import { WorkflowAssignmentRepository } from "../../repositories/WorkflowAssignmentRepository";
import { mediaStore } from "../../services/mediaStore";
import { shouldSkipBlockingFetch } from "../../services/connectivityMonitor";
import { deriveOpenIssuesFromAsset } from "../../utils/issueDerivation";
import type { Feature as LibFeature } from "../../types/feature";
import type { FeatureDependency } from "../../types/featureDependency";
import CaptureSpreadsheetDialog from "./CaptureSpreadsheetDialog";
import { buildFullCaptureJobColumns } from "../../utils/captureAssetJobColumns";
import {
  buildCaptureColumns,
  buildCaptureRow,
  computeMaxUnitsByFeature,
  pickCaptureRun,
} from "../../utils/captureSpreadsheet";
import { buildProjectCaptureTable, findCaptureMatch, type ProjectCaptureSearchHit } from "../../utils/projectCaptureTable";
import { anyMatchesWordStart, matchesWordStart } from "../../utils/textMatch";
import type { FeatureSelection } from "../../services/productConfigService";
import { isDesktopLikePlatform, isMobileNativePlatform } from "../../utils/platform";
import { resolveProjectScopeId } from "../../utils/resolveProjectScopeId";
import { peekWebSessionCache, webCacheKey } from "../../services/webFreshCache";
import type { PaginatedResult } from "../../types/paginatedList";
import OperationsVirtualizedTableBody from "./OperationsVirtualizedTableBody";
import { OPERATIONS_VIRTUALIZE_MIN_ROWS } from "./operationsTableLayout";
import { useMobileWebLayout } from "../../hooks/useMobileWebLayout";
import { markWorkflowOpenTap } from "../../utils/workflowOpenPerf";
import {
  loadWorkflowOpenPayload,
  refreshWorkflowOpenDataInBackground,
  OFFLINE_CONFIG_MISSING_MESSAGE,
  retryOfflineDownload,
} from "../../services/workflowOpenService";
import { escapeHtml, openPrintWindow } from "../../utils/printWindow";

// Reference media is merged inside loadWorkflowOpenPayload when mergeMedia: true.

// ------------------------------------------------------------------
// Column configuration
// ------------------------------------------------------------------

interface ColumnDef {
  id: string;
  label: string;
}

type AssetExportColumnOption = {
  id: string;
  label: string;
  headerLabel?: string;
  groupLabel: string;
  noteLabel?: string;
  valueFor: (asset: ProjectAsset) => string;
};

const CONFIGURABLE_COLUMNS: ColumnDef[] = [
  { id: "assetName",     label: "Asset Name" },
  { id: "serialNumber",  label: "Serial #" },
  { id: "assetModel",    label: "Asset Model" },
  { id: "manufacturer",  label: "Manufacturer" },
  { id: "configType",    label: "Config Type" },
  { id: "configName",    label: "Workflow Configuration Name" },
  { id: "project",       label: "Project" },
  { id: "siteName",      label: "Site Name" },
  { id: "location",      label: "Location" },
  { id: "assignedTech",  label: "Assigned Tech" },
  { id: "features",      label: "Features" },
  { id: "status",        label: "Status" },
];

const DEFAULT_COL_ORDER = CONFIGURABLE_COLUMNS.map((c) => c.id);
const LS_COL_KEY = "asset_installation_columns_v1";
const CAPTURE_HIDDEN_GROUPS_KEY = "capture_spreadsheet_hidden_groups_v1";
const ARCHIVE_COL_IDS = ["serialNumber", "assetModel", "manufacturer", "project", "siteName", "configType", "status"];

function loadColumnConfig(): { order: string[]; hidden: string[] } {
  try {
    const raw = localStorage.getItem(LS_COL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { order?: string[]; hidden?: string[] };
      const knownIds = new Set(CONFIGURABLE_COLUMNS.map((column) => column.id));
      const savedOrder = Array.isArray(parsed.order) ? parsed.order.filter((id) => knownIds.has(id)) : [];
      const missingIds = DEFAULT_COL_ORDER.filter((id) => !savedOrder.includes(id));
      return {
        order: [...savedOrder, ...missingIds],
        hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter((id) => knownIds.has(id)) : [],
      };
    }
  } catch {}
  return { order: DEFAULT_COL_ORDER, hidden: [] };
}

// ------------------------------------------------------------------
// Status helpers
// ------------------------------------------------------------------

const STATUS_COLORS: Record<ProjectAssetStatus, "default" | "primary" | "success" | "error" | "warning" | "info"> = {
  NotStarted: "default",
  InProgress: "primary",
  Paused: "warning",
  Pending: "warning",
  Complete: "success",
  Closed: "info",
  Issue: "error",
  Cancelled: "error",
};

const STATUS_LABELS: Record<ProjectAssetStatus, string> = {
  NotStarted: "Not Started",
  InProgress: "In Progress",
  Paused: "Paused",
  Pending: "Pending",
  Complete: "Complete",
  Closed: "Closed",
  Issue: "Issue",
  Cancelled: "Cancelled",
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

/**
 * The Assign Workflow dialog only asks for a config now (workflow type is
 * redundant — every config already implies its own type). This derives the
 * workflowTypeId the create() call still needs from the chosen config itself:
 * its own workflowTypeId FK when set, else matched by configType name.
 */
function resolveConfigWorkflowTypeId(config: WorkflowConfig, types: WorkflowType[]): string {
  if (config.workflowTypeId) return config.workflowTypeId;
  const normalized = config.configType?.trim().toLowerCase();
  if (!normalized) return "";
  return types.find((t) => t.name.trim().toLowerCase() === normalized)?.id ?? "";
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
  closed: number;
  issue: number;
  noWorkflow: number;
}

function assetHasConfiguredWorkflow(asset: ProjectAsset): boolean {
  return !!asset.workflowSummary?.hasWorkflow || !!asset.productConfigId || !!asset.workflowTemplateId;
}

function computeHealth(list: ProjectAsset[]): AssetHealth {
  return {
    total: list.length,
    notStarted: list.filter((a) => a.status === "NotStarted").length,
    inProgress: list.filter((a) => a.status === "InProgress").length,
    paused: list.filter((a) => a.status === "Paused").length,
    pending: list.filter((a) => a.status === "Pending").length,
    complete: list.filter((a) => a.status === "Complete").length,
    closed: list.filter((a) => a.status === "Closed").length,
    issue: list.filter((a) => a.status === "Issue").length,
    noWorkflow: list.filter((a) => !assetHasConfiguredWorkflow(a)).length,
  };
}

function tabDotColor(h: AssetHealth | undefined): string | null {
  if (!h || h.total === 0) return null;
  if (h.issue > 0) return "error.main";
  if (h.complete + h.closed === h.total) return "success.main";
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

const INSTALLATIONS_PROJECT_SESSION_KEY = "installations_selected_project_id";
const INSTALLATIONS_ALL_PROJECTS_SESSION_KEY = "installations_all_projects";

const AssetInstallationPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const can = usePermissions();
  const { complexViewActive } = useComplexView();
  const isNativePlatform = isMobileNativePlatform();
  const showComplexControls = complexViewActive && isNativePlatform;
  const showAdvancedAssetActions = isDesktopLikePlatform() || showComplexControls;
  const mobileWebLayout = useMobileWebLayout();
  const showBulkWorkflowReports = showAdvancedAssetActions && !mobileWebLayout;
  const productsState = useAppSelector((s) => s.products);
  const projects = useAppSelector((s) => s.projects.items);
  const projectsLoading = useAppSelector((s) => s.projects.loading);
  const users = useAppSelector((s) => s.users.items);
  const usersLoading = useAppSelector((s) => s.users.loading);
  const [searchParams] = useSearchParams();
  const canEditAssetStatus = can.installationAssets?.editScope === "all";
  const canViewInstallationAssets = !!can.installationAssets?.view;
  const canEditInstallationAssets = !!can.installationAssets?.edit;
  const canDeleteInstallationAssets = !!can.installationAssets?.delete;
  const canRunAssetWorkflow = !!can.installationAssets?.runWorkflow;
  const canViewCaptureMatrix = !!can.installationAssets?.viewCapture;
  const canEditCaptureData = !!can.installationAssets?.editCapture;
  const deepLinkHandledRef = useRef<string | null>(null);

  // Stale-load guard: incremented every time activeProduct changes so that
  // results from a superseded fetch (triggered before the tab restoration
  // effect corrects the tab) are silently discarded.
  const assetLoadIdRef = useRef(0);
  const capturePrefetchKeyRef = useRef<string | null>(null);
  /** Tracks completed/in-flight runs-detail fetch per project+page — stops capture refetch loops. */
  const captureDetailDoneKeyRef = useRef<string | null>(null);
  const captureDetailInflightKeyRef = useRef<string | null>(null);
  const operationsScrollRef = useRef<HTMLDivElement | null>(null);
  // Separate counter for the document-counts effect so it can NEVER bump the
  // main asset-load's staleness ref — sharing one ref let the doc-counts effect
  // invalidate an in-flight load's guard, so setLoadingAssets(false) was skipped
  // and the page hung on its spinner forever.
  const docCountLoadIdRef = useRef(0);
  const lastRefreshTsRef = useRef(0);
  const isRefreshingRef = useRef(false);   // in-flight guard — prevents concurrent refreshAssets calls
  const [allProjectsExplicit, setAllProjectsExplicit] = useState(() => {
    try {
      return sessionStorage.getItem(INSTALLATIONS_ALL_PROJECTS_SESSION_KEY) === "1";
    } catch {
      return false;
    }
  });
  const serverWasOfflineRef = useRef(false); // tracks offline→online transition for api-server-reachable

  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("project");
      if (fromUrl) return fromUrl;
      if (sessionStorage.getItem(INSTALLATIONS_ALL_PROJECTS_SESSION_KEY) === "1") return "";
      return sessionStorage.getItem(INSTALLATIONS_PROJECT_SESSION_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [statusFilter, setStatusFilter] = useState<ProjectAssetStatus | "All">("All");
  const [showNoWorkflow, setShowNoWorkflow] = useState(false);
  const [autoSort,    setAutoSort]    = useState({ key: "", dir: "asc" as "asc" | "desc" });
  const [autoFilters, setAutoFilters] = useState<Record<string, Set<string>>>({});
  const [autoMenu,    setAutoMenu]    = useState<{ anchorEl: HTMLElement | null; key: string }>({ anchorEl: null, key: "" });
  const [search, setSearch] = useState("");
  const [healthExpanded, setHealthExpanded] = useState(true);
  const [assetSearchOpen, setAssetSearchOpen] = useState(false);
  const [assetSearchQuery, setAssetSearchQuery] = useState("");
  const [statusMenuAnchor, setStatusMenuAnchor] = useState<HTMLElement | null>(null);
  const [statusMenuAsset, setStatusMenuAsset] = useState<ProjectAsset | null>(null);

  const [sites, setSites] = useState<Site[]>([]);
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const assetsKey = useMemo(
    () => assets.map((a) => a.id).sort().join("|"),
    [assets],
  );
  const assetsRef = useRef(assets);
  assetsRef.current = assets;
  const [configs, setConfigs] = useState<ProductConfig[]>([]);
  const [publishedWfConfigs, setPublishedWfConfigs] = useState<WorkflowConfig[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [assetLoadError, setAssetLoadError] = useState<string | null>(null);
  const PROJECT_ASSET_PAGE_SIZE = 50;
  const [projectAssetPage, setProjectAssetPage] = useState(1);
  const [projectAssetTotal, setProjectAssetTotal] = useState(0);
  const paginatedWebProject = !isNativePlatform && !!selectedProjectId;
  const [healthMap, setHealthMap] = useState<Record<string, AssetHealth>>({});

  const [expandedAssetId, setExpandedAssetId] = useState<string | null>(null);
  const [expandedBomAsgnId, setExpandedBomAsgnId] = useState<string | null>(null);

  // Add dialog — form state lives in AssetAddDialog so keystrokes don't re-render this page.
  const [addOpen, setAddOpen] = useState(false);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editAsset, setEditAsset] = useState<ProjectAsset | null>(null);
  const [editForm, setEditForm] = useState<AssetForm>(emptyForm());
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelDialogMode, setCancelDialogMode] = useState<"cancel" | "undo">("cancel");
  const [cancelReason, setCancelReason] = useState("");
  const [cancellingAsset, setCancellingAsset] = useState(false);

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
  const [runnerProductFeatures, setRunnerProductFeatures] = useState<LibFeature[]>([]);
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
  const runsMapRef = useRef(runsMap);
  runsMapRef.current = runsMap;
  const projectAssetPageRef = useRef(projectAssetPage);
  projectAssetPageRef.current = projectAssetPage;
  const searchRef = useRef(search);
  searchRef.current = search;
  const archiveModeRef = useRef(archiveMode);
  archiveModeRef.current = archiveMode;
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
  const [runHistoryEntryMode, setRunHistoryEntryMode] = useState<"default" | "customer-sign">("default");
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
  // Capture spreadsheet view
  const [capturePopupOpen, setCapturePopupOpen] = useState(false);
  const [libFeatures, setLibFeatures] = useState<LibFeature[]>([]);
  const [depsByFeature, setDepsByFeature] = useState<Record<string, FeatureDependency[]>>({});
  const [assetExportDialogOpen, setAssetExportDialogOpen] = useState(false);
  const [assetExportFormat, setAssetExportFormat] = useState<"pdf" | "json" | "excel">("pdf");
  const [assetExportSelectedColumnIds, setAssetExportSelectedColumnIds] = useState<string[]>([]);
  const [assetExportIncludeProjectMeta, setAssetExportIncludeProjectMeta] = useState(true);
  const [assetExportIncludeBusinessLogo, setAssetExportIncludeBusinessLogo] = useState(true);
  const [assetExportIncludeCustomerLogo, setAssetExportIncludeCustomerLogo] = useState(true);
  const [assetExportRunning, setAssetExportRunning] = useState(false);
  // Print / PDF dialog
  const [printOpen, setPrintOpen]         = useState(false);
  const [printScope, setPrintScope]       = useState<"selection" | "visible" | "custom">("visible");
  const [printTechId, setPrintTechId]     = useState("");
  const [printModel, setPrintModel]       = useState("");
  const [printStatuses, setPrintStatuses] = useState<string[]>(["NotStarted", "InProgress", "Paused", "Pending", "Complete", "Closed", "Issue"]);
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
  const [reportExportOpen, setReportExportOpen] = useState(false);
  const [reportExportAsset, setReportExportAsset] = useState<ProjectAsset | null>(null);
  const [reportPreviewUrl, setReportPreviewUrl] = useState<string | null>(null);
  const [reportPreviewLoading, setReportPreviewLoading] = useState(false);
  const [reportPreviewError, setReportPreviewError] = useState<string | null>(null);
  const [reportPreviewContext, setReportPreviewContext] = useState<WorkflowReportExportContext | null>(null);
  const [reportPreviewFileBase, setReportPreviewFileBase] = useState<string | null>(null);
  const [bulkWorkflowReportsOpen, setBulkWorkflowReportsOpen] = useState(false);
  // Extra context passed into WorkflowRunHistoryDialog for the PDF download
  const [runHistoryProject, setRunHistoryProject] = useState<{ customerName: string; jobNumber: string; siteName?: string; timeZoneId?: string } | null>(null);
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
    if (!productsState.items.length && !productsState.loading) dispatch(fetchProducts());
    if (!projects.length && !projectsLoading) dispatch(fetchProjects());
    if (!users.length && !usersLoading) dispatch(fetchUsers());
    siteService.getSites().then(setSites).catch(() => {});
  }, [dispatch, productsState.items.length, productsState.loading, projects.length, projectsLoading, users.length, usersLoading]);

  const products = useMemo(
    () => (productsState.items.length ? productsState.items : productsState.loading ? [] : demoProducts),
    [productsState.items, productsState.loading],
  );
  // Stable product-id key so Redux array identity churn doesn't re-trigger the
  // full assets/configs/runs/docs load storm on every unrelated store update.
  const productsKey = useMemo(
    () => products.map((p) => p.id).sort().join("|"),
    [products],
  );
  const productsRef = useRef(products);
  productsRef.current = products;

  // The runner needs the *asset's own* product, not the page-level Project-filter-derived
  // activeProduct — activeProduct is undefined while viewing "All projects", which would
  // otherwise silently block the runner dialog from ever rendering (see below).
  const runnerProduct = useMemo(
    () => (runnerAsset ? products.find((p) => p.id === runnerAsset.productId) : undefined),
    [runnerAsset, products],
  );
  useEffect(() => {
    if (!runnerOpen || !runnerAsset?.productId) {
      setRunnerProductFeatures([]);
      return;
    }

    let cancelled = false;
    featureService.getByProduct(runnerAsset.productId)
      .then((features) => {
        if (!cancelled) setRunnerProductFeatures(features);
      })
      .catch(() => {
        if (!cancelled) setRunnerProductFeatures([]);
      });

    return () => { cancelled = true; };
  }, [runnerAsset?.productId, runnerOpen]);
  const runnerTeamMembers = useMemo(() => {
    if (!runnerAsset?.projectId) return [];
    const project = projects.find((item) => item.id === runnerAsset.projectId);
    if (!project?.teamMemberIds?.length) return [];
    return users
      .filter((item) => item.isActive && project.teamMemberIds?.includes(item.id))
      .map((item) => ({ id: item.id, fullName: item.fullName }));
  }, [projects, runnerAsset?.projectId, users]);
  const runnerProjectTimeZone = useProjectTimeZone(
    runnerAsset?.projectId ?? selectedProjectId ?? undefined,
  );
  const runnerAllUsers = useMemo(
    () => users.filter((item) => item.isActive).map((item) => ({ id: item.id, fullName: item.fullName })),
    [users],
  );

  useEffect(() => {
    return () => {
      if (reportPreviewUrl) URL.revokeObjectURL(reportPreviewUrl);
    };
  }, [reportPreviewUrl]);

  // Trigger a background pull when asset data is more than 15 minutes old.
  // Uses the stable useCallback identity of the pull function to avoid re-registration.
  useStaleOnResume("assets", useCallback(() => {
    const products = productsRef.current;
    if (selectedProjectId) {
      if (paginatedWebProject) {
        void projectAssetService.listByProjectPage(selectedProjectId, {
          page: projectAssetPageRef.current,
          pageSize: PROJECT_ASSET_PAGE_SIZE,
          search: searchRef.current.trim() || undefined,
          includeDeleted: archiveModeRef.current,
        }).catch(() => {});
      } else {
        AssetRepository.getByProject(selectedProjectId).catch(() => {});
      }
    } else if (allProjectsExplicit) {
      products.forEach((p) => AssetRepository.getByProduct(p.id).catch(() => {}));
    }
  }, [selectedProjectId, productsKey, paginatedWebProject, allProjectsExplicit]));

  // Restore selected project from URL params (priority) or sessionStorage (fallback).
  useEffect(() => {
    const projectIdFromUrl = searchParams.get("project");
    if (projectIdFromUrl) {
      setSelectedProjectId(projectIdFromUrl);
      try { sessionStorage.setItem(INSTALLATIONS_PROJECT_SESSION_KEY, projectIdFromUrl); } catch {}
    }
  }, [searchParams]);

  // Normalize job-number URL aliases (e.g. ?project=JO00991) to canonical project.id once catalog loads.
  useEffect(() => {
    if (!selectedProjectId || projects.length === 0) return;
    const resolved = resolveProjectScopeId(projects, selectedProjectId);
    if (resolved !== selectedProjectId) {
      setSelectedProjectId(resolved);
      setProjectAssetPage(1);
      try { sessionStorage.setItem(INSTALLATIONS_PROJECT_SESSION_KEY, resolved); } catch {}
    }
  }, [projects, selectedProjectId]);

  const handleProjectChange = useCallback((projectId: string) => {
    const isAllProjects = projectId === "";
    setAllProjectsExplicit(isAllProjects);
    setSelectedProjectId(projectId);
    setProjectAssetPage(1);
    setAssetLoadError(null);
    try {
      sessionStorage.setItem(INSTALLATIONS_PROJECT_SESSION_KEY, projectId);
      if (isAllProjects) {
        sessionStorage.setItem(INSTALLATIONS_ALL_PROJECTS_SESSION_KEY, "1");
      } else {
        sessionStorage.removeItem(INSTALLATIONS_ALL_PROJECTS_SESSION_KEY);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setProjectAssetPage(1);
  }, [search]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );
  const activeProduct = useMemo(() => {
    const productIdFromUrl = searchParams.get("product");
    if (productIdFromUrl) {
      const fromUrl = products.find((p) => p.id === productIdFromUrl);
      if (fromUrl) return fromUrl;
    }
    const projectProductId = selectedProject?.productIds?.[0];
    if (projectProductId) {
      return products.find((p) => p.id === projectProductId);
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
      const productFeatures = await featureService.getByProduct(activeProduct.id);
      const inventoryFeatureIds = new Set(productFeatures.filter((feature) => feature.isInventory).map((feature) => feature.id));
      const inventorySelections = (activeProduct.features ?? []).filter((feature) => inventoryFeatureIds.has(feature.id));
      const created = await workflowConfigService.create({
        name: `${activeProduct.name} Config ${nextNumber}`,
        productId: activeProduct.id,
        configType: "Version 1",
        featureSelectionsJson: JSON.stringify(
          inventorySelections.map((feature) => ({
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

  useEffect(() => {
    if (!activeProduct?.id) {
      setLibFeatures([]);
      setDepsByFeature({});
      return;
    }
    let cancelled = false;
    featureService.getByProduct(activeProduct.id).then((feats) => {
      if (cancelled) return;
      // Set features immediately — this is what the asset/capture table needs to
      // render. Do NOT block on the dependency fetch here.
      setLibFeatures(feats);

      // PERF: one batched request by productId (was N getByFeature calls).
      // Dependencies are only needed for capture-column metadata — defer so the
      // feature-driven render commits first.
      const loadDeps = async () => {
        try {
          const map = await featureDependencyService.mapByProduct(activeProduct.id);
          if (cancelled) return;
          // Ensure every feature has an entry (even if empty) so callers don't
          // treat missing keys as "not loaded yet".
          const complete: Record<string, FeatureDependency[]> = {};
          for (const f of feats) complete[f.id] = map[f.id] ?? [];
          setDepsByFeature(complete);
        } catch {
          if (!cancelled) setDepsByFeature({});
        }
      };
      setTimeout(() => { void loadDeps(); }, 0);
    }).catch(() => {
      if (!cancelled) {
        setLibFeatures([]);
        setDepsByFeature({});
      }
    });
    return () => { cancelled = true; };
  }, [activeProduct?.id]);

  const featureSelectionsByConfig = useMemo((): FeatureSelection[][] => {
    return publishedWfConfigs.map((c) => {
      try {
        return JSON.parse(c.featureSelectionsJson || "[]") as FeatureSelection[];
      } catch {
        return [];
      }
    });
  }, [publishedWfConfigs]);

  const captureMaxUnits = useMemo(
    () => computeMaxUnitsByFeature(featureSelectionsByConfig),
    [featureSelectionsByConfig],
  );

  const getActiveCountForAsset = useCallback((asset: ProjectAsset): Record<string, number> => {
    const sels = parseFeatureSelectionsForConfig(asset.productConfigId);
    if (!sels?.length) return captureMaxUnits;
    const out: Record<string, number> = {};
    for (const s of sels) {
      if (s.activeCount > 0) out[s.featureId] = s.activeCount;
    }
    return out;
  }, [captureMaxUnits, publishedWfConfigs]);
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
    const products = productsRef.current;
    // Defer expensive all-product fan-out until the user explicitly picks "All projects".
    if (!selectedProjectId && !allProjectsExplicit) {
      setAssets([]);
      setLoadingAssets(false);
      setAssetLoadError(null);
      return;
    }
    if (products.length === 0 && !selectedProjectId) {
      if (productsState.loading || projectsLoading) {
        setLoadingAssets(true);
        return;
      }
      setAssets([]);
      setConfigs([]);
      setPublishedWfConfigs([]);
      setLoadingAssets(false);
      return;
    }
    // Increment the load ID so any in-flight load from a previous product is ignored
    const loadId = ++assetLoadIdRef.current;

    // Web revisit: paint the last paginated page from sessionStorage synchronously
    // so the spinner does not flash while listByProjectPage SWR runs.
    let sessionPainted = false;
    if (paginatedWebProject) {
      const pageCacheKey = webCacheKey(`/project-assets/by-project/${selectedProjectId}`, {
        page: projectAssetPage,
        pageSize: PROJECT_ASSET_PAGE_SIZE,
        sort: "assetTag",
        includeDeleted: archiveMode || undefined,
        search: search.trim() || undefined,
      });
      const sessionPage = peekWebSessionCache<PaginatedResult<ProjectAsset>>(pageCacheKey);
      if (sessionPage) {
        setAssets(sessionPage.items);
        setProjectAssetTotal(sessionPage.total);
        setLoadingAssets(false);
        sessionPainted = true;
      }
    }

    if (!sessionPainted) {
      setLoadingAssets(true);
    }
    setAssetLoadError(null);

    // ─── Phase F — TIER 1: LOCAL-ONLY (instant) ───────────────────────────
    // Read from IndexedDB for every scope in parallel. The phone is offline-
    // first: local data is the source of truth, the network is a refresher.
    // IndexedDB index lookups (by_product / by_project) are local and instant
    // — the page does NOT block on any network call to show the primary
    // content. setLoadingAssets(false) fires the moment the local lookups
    // resolve, so a slow or failing /project-assets/by-product/{id} endpoint
    // can no longer hold the page on its loading spinner.
    const scopes: Array<{
      scopeKind: "project" | "product";
      scopeId: string;
      fetchLocal: () => Promise<ProjectAsset[]>;
      fetchRemote: () => Promise<ProjectAsset[]>;
    }> = paginatedWebProject
      ? [
          {
            scopeKind: "project",
            scopeId: selectedProjectId,
            fetchLocal: () => Promise.resolve([]),
            fetchRemote: async () => {
              const result = await projectAssetService.listByProjectPage(selectedProjectId, {
                page: projectAssetPage,
                pageSize: PROJECT_ASSET_PAGE_SIZE,
                search: search.trim() || undefined,
                includeDeleted: archiveMode,
              });
              setProjectAssetTotal(result.total);
              return result.items;
            },
          },
        ]
      : selectedProjectId
      ? [
          {
            scopeKind: "project",
            scopeId: selectedProjectId,
            fetchLocal: () => projectAssetService.listLocalByProject(selectedProjectId, archiveMode),
            fetchRemote: () => projectAssetService.listByProject(selectedProjectId, archiveMode),
          },
        ]
      : products.map((p) => ({
          scopeKind: "product",
          scopeId: p.id,
          fetchLocal: () => projectAssetService.listLocalByProduct(p.id, archiveMode),
          fetchRemote: () => projectAssetService.listByProduct(p.id, archiveMode),
        }));

    // Single shared local lookup — both Tier 1 and Tier 5 consume it so
    // IndexedDB is read once per scope, not twice.
    const localLookupPromise = Promise.all(
      scopes.map((s) =>
        s.fetchLocal()
          .then((assets) => ({ scope: s, assets }))
          .catch(() => ({ scope: s, assets: [] as ProjectAsset[] })),
      ),
    );

    // Clear the spinner as soon as EITHER tier produces a result for THIS load,
    // so a slow local Promise.all — or a remote response that wins the race —
    // can never strand the page on its spinner. Guarded by loadId so a
    // superseded product switch can't clear a newer load's spinner.
    let loadingCleared = false;
    const clearLoadingOnce = () => {
      if (loadId === assetLoadIdRef.current && !loadingCleared) {
        loadingCleared = true;
        setLoadingAssets(false);
      }
    };

    // Remote (Tier 2) is authoritative per scope. Track which scopes it has
    // already answered so a late Tier-1 local result cannot overwrite fresh
    // server data with an empty/stale local slice (the web build caches nothing
    // locally, so its Tier 1 is always empty).
    const scopeKind = scopes[0]?.scopeKind;
    const scopeIdOfAsset = (a: ProjectAsset) =>
      scopeKind === "project" ? a.projectId : a.productId;
    const remoteAnsweredScopes = new Set<string>();

    localLookupPromise.then((results) => {
      if (loadId !== assetLoadIdRef.current) return; // Stale — a newer load is in flight
      const localSeed = results.flatMap((r) => r.assets);
      setAssets((prev) => {
        // Keep any scope slices the remote already filled; seed the rest from local.
        const keptRemote = prev.filter((a) => remoteAnsweredScopes.has(scopeIdOfAsset(a)));
        const nextLocalSeed = results
          .filter((r) => !remoteAnsweredScopes.has(r.scope.scopeId))
          .flatMap((r) => r.assets);
        const next = [...keptRemote, ...nextLocalSeed];
        if (activeProduct?.id) {
          setHealthMap((hmPrev) => ({ ...hmPrev, [activeProduct.id]: computeHealth(next) }));
        }
        return next;
      });
      setLastFetchedAt(new Date());
      // Web has no IndexedDB asset cache — keep the spinner until the server responds.
      if (isNativePlatform || localSeed.length > 0) {
        clearLoadingOnce();
      }
    });

    // ─── TIER 2: SERVER REFRESH (background, per-scope) ───────────────────
    // Each scope's local-first service call runs independently. Whichever tier
    // resolves first for this load clears the spinner (clearLoadingOnce); the
    // loadId guard discards results from a superseded product switch.
    scopes.forEach((s) => {
      s.fetchRemote()
        .then((freshAssets) => {
          if (loadId !== assetLoadIdRef.current) return; // Stale
          remoteAnsweredScopes.add(s.scopeId);
          setAssets((prev) => {
            // Replace only this scope's slice; keep the other scopes' assets.
            const others = prev.filter((a) =>
              s.scopeKind === "project" ? a.projectId !== s.scopeId : a.productId !== s.scopeId,
            );
            const next = [...others, ...freshAssets];
            if (activeProduct?.id) {
              setHealthMap((hmPrev) => ({ ...hmPrev, [activeProduct.id]: computeHealth(next) }));
            }
            return next;
          });
          setLastFetchedAt(new Date());
          clearLoadingOnce();
          if (paginatedWebProject && freshAssets.length > 0) {
            const assetIds = freshAssets.map((a) => a.id);
            assetWorkflowRunService.listRunSummariesByProject(selectedProjectId, assetIds)
              .then((runs) => {
                if (loadId !== assetLoadIdRef.current) return;
                setRunsMap((prev) => mergeRunsIntoMap(prev, runs));
              })
              .catch(() => {/* non-blocking */});
          }
        })
        .catch(() => {
          if (loadId !== assetLoadIdRef.current) return;
          setAssetLoadError("Could not load assets. Check your connection and try again.");
          clearLoadingOnce();
        });
    });

    // ─── TIER 3: CONFIGS (independent, unchanged from Phase A) ────────────
    if (activeProduct?.id) {
      productConfigService.listByProduct(activeProduct.id)
        .then((c) => {
          if (loadId !== assetLoadIdRef.current) return; // Stale
          setConfigs(c);
        })
        .catch(() => {/* non-blocking */});
    } else {
      setConfigs([]);
    }

    // ─── TIER 4: PUBLISHED WORKFLOW CONFIGS (independent) ────────────────
    if (activeProduct?.id) {
      workflowConfigService.listByProduct(activeProduct.id, "Published")
        .then((wc) => {
          if (loadId !== assetLoadIdRef.current) return; // Stale
          setPublishedWfConfigs(wc);
        })
        .catch(() => {/* non-blocking */});
    } else {
      setPublishedWfConfigs([]);
    }

    // ─── TIER 5: LATEST RUNS PER PROJECT ───────────────────────────────────
    const loadRunsForProjects = (projectIds: string[]) => {
      if (projectIds.length === 0) return;
      const loadPromise = isNativePlatform
        ? Promise.all(projectIds.map((pid) => assetWorkflowRunService.listLatestByProject(pid)))
            .then((results) => results.flat())
        : assetWorkflowRunService.listRunSummariesByProjects(projectIds);

      loadPromise
        .then((runs) => {
          if (loadId !== assetLoadIdRef.current) return; // Stale
          const runMap: Record<string, AssetWorkflowRun[]> = {};
          runs.forEach((run) => {
            if (!runMap[run.assetId]) runMap[run.assetId] = [];
            runMap[run.assetId].push(run);
          });
          setRunsMap((prev) => {
            const merged = { ...runMap };
            Object.keys(prev).forEach((id) => {
              if (prev[id].length > 1) merged[id] = prev[id];
            });
            return merged;
          });
        })
        .catch(() => {/* non-blocking */});
    };

    if (selectedProjectId && !paginatedWebProject) {
      // Project-scoped full load: start runs immediately — don't wait for asset list.
      loadRunsForProjects([selectedProjectId]);
    }

    localLookupPromise
      .then((localSlices) => {
        if (loadId !== assetLoadIdRef.current) return; // Stale
        if (selectedProjectId) return;
        const localAssets = localSlices.flatMap((s) => s.assets);
        const uniqueProjectIds = [...new Set(localAssets.map((asset) => asset.projectId).filter(Boolean))];
        loadRunsForProjects(uniqueProjectIds);
      });
  }, [activeProduct?.id, allProjectsExplicit, archiveMode, productsKey, selectedProjectId, productsState.loading, projectsLoading, projectAssetPage, search, paginatedWebProject]);

  // Document counts per asset — fetched in a fully independent effect that
  // runs after the asset list is already shown. Counts are cosmetic
  // (badges / "+N docs" indicators), so a slow or failed network call here
  // never blocks the page. Never touches loadingAssets. The dependency is a
  // stable sorted-id key so optimistic per-asset updates (which create a new
  // array reference via setAssets(prev => prev.map(...))) don't re-fire the
  // full per-asset fetch loop — only changes to the underlying SET of assets
  // (e.g. product switch, manual refresh, CSV import) trigger a refetch.
  useEffect(() => {
    if (assetsKey === "") return;
    const myLoadId = ++docCountLoadIdRef.current;
    // PERF: one batched counts request per project/product instead of N listByAsset.
    const timer = setTimeout(() => {
      const snapshot = assetsRef.current;
      const load = async () => {
        const countMap: Record<string, number> = {};
        if (selectedProjectId) {
          const counts = await assetDocumentLinkService.countsByScope({ projectId: selectedProjectId });
          Object.assign(countMap, counts);
        } else {
          const productIds = [...new Set(snapshot.map((a) => a.productId).filter(Boolean))];
          const batches = await Promise.all(
            productIds.map((pid) => assetDocumentLinkService.countsByScope({ productId: pid })),
          );
          for (const counts of batches) Object.assign(countMap, counts);
        }
        if (myLoadId !== docCountLoadIdRef.current) return;
        setDocsCountMap(countMap);
      };
      void load();
    }, 0);
    return () => clearTimeout(timer);
    // assetsRef.current is intentionally read at run-time; only assetsKey
    // (the set of asset IDs) should trigger this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetsKey, selectedProjectId]);

  // Mobile only: prime assignmentsMap from the offline cache for every visible
  // asset so the "Start workflow" action works instantly offline — even for
  // assets the user never expanded. Reads are local IndexedDB only (no network).
  useEffect(() => {
    if (!isMobileNativePlatform()) return;
    if (assetsKey === "") return;
    const snapshot = assetsRef.current;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        snapshot.map(async (asset) => {
          const local = await WorkflowAssignmentRepository.getLocalByAsset(asset.id).catch(() => []);
          return [asset.id, local] as const;
        })
      );
      if (cancelled) return;
      setAssignmentsMap((prev) => {
        const next = { ...prev };
        for (const [assetId, local] of entries) {
          // Only fill from cache when there's actually something cached. Never
          // write an empty array here: that would make resolvePreferredAssignment
          // treat the asset as "loaded, no assignments" and skip its on-demand
          // network fetch. Assets with no cached assignments stay undefined so
          // the normal fetch-on-start path still runs.
          if (local.length > 0 && (prev[assetId] === undefined || prev[assetId].length === 0)) {
            next[assetId] = local;
          }
        }
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [assetsKey]);

  const refreshAssets = useCallback(async () => {
    // Collapse concurrent calls — only one refresh runs at a time.
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    try {
      // Phase F — Tier 1 (local): show what we already have instantly so the
      // page is responsive while the network refresh is in flight. The
      // local-first service call returns from IndexedDB without touching
      // the network when the cache is warm.
      const products = productsRef.current;
      const localScopes: Array<{
        scopeKind: "project" | "product";
        scopeId: string;
        fetchLocal: () => Promise<ProjectAsset[]>;
      }> = selectedProjectId
        ? [
            {
              scopeKind: "project",
              scopeId: selectedProjectId,
              fetchLocal: () => projectAssetService.listLocalByProject(selectedProjectId, archiveMode),
            },
          ]
        : products.map((p) => ({
            scopeKind: "product",
            scopeId: p.id,
            fetchLocal: () => projectAssetService.listLocalByProduct(p.id, archiveMode),
          }));

      const localPromise = Promise.all(
        localScopes.map((s) => s.fetchLocal().catch(() => [] as ProjectAsset[])),
      ).then((slices) => slices.flat());

      // Tier 2 (server refresh): fire the local-first service call per scope
      // — when local is warm, returns instantly with the same data; when
      // local is cold, does a blocking API call but the page is already
      // showing Tier 1 data.
      const remoteScopes: Array<{
        scopeKind: "project" | "product";
        scopeId: string;
        fetchRemote: () => Promise<ProjectAsset[]>;
      }> = selectedProjectId
        ? paginatedWebProject
          ? [
              {
                scopeKind: "project",
                scopeId: selectedProjectId,
                fetchRemote: async () => {
                  const result = await projectAssetService.listByProjectPage(selectedProjectId, {
                    page: projectAssetPageRef.current,
                    pageSize: PROJECT_ASSET_PAGE_SIZE,
                    search: searchRef.current.trim() || undefined,
                    includeDeleted: archiveModeRef.current,
                  });
                  setProjectAssetTotal(result.total);
                  return result.items;
                },
              },
            ]
          : [
              {
                scopeKind: "project",
                scopeId: selectedProjectId,
                fetchRemote: () => projectAssetService.listByProject(selectedProjectId, archiveMode),
              },
            ]
        : products.map((p) => ({
            scopeKind: "product",
            scopeId: p.id,
            fetchRemote: () => projectAssetService.listByProduct(p.id, archiveMode),
          }));

      // Fire the runs fetch off the LOCAL asset list so it starts
      // immediately with projectIds from local — the runs service is
      // itself local-first internally, so warm caches return instantly.
      const localForRuns = localPromise;
      const remoteAssetsPromise = Promise.all(
        remoteScopes.map((s) =>
          s.fetchRemote()
            .then((freshAssets) => ({ scope: s, assets: freshAssets }))
            .catch(() => ({ scope: s, assets: [] as ProjectAsset[] })),
        ),
      );
      const runsPromise = localForRuns.then((localAssets) => {
        const projectIds = selectedProjectId
          ? [selectedProjectId]
          : [...new Set(localAssets.map((asset) => asset.projectId).filter(Boolean))];
        if (isNativePlatform) {
          return Promise.all(
            projectIds.map((pid) => assetWorkflowRunService.listLatestByProject(pid)),
          ).then((results) => results.flat());
        }
        return assetWorkflowRunService.listRunSummariesByProjects(projectIds);
      });

      // Apply Tier 1 (local) to the UI immediately.
      const a = await localPromise;
      setAssets(a);
      lastRefreshTsRef.current = Date.now();
      setLastFetchedAt(new Date());
      if (activeProduct?.id) {
        setHealthMap((prev) => ({ ...prev, [activeProduct.id]: computeHealth(a) }));
      }

      // Release the concurrency guard as soon as Tier 1 has applied — the
      // remaining Tier 2 work is fire-and-forget, so a follow-up pull-to-
      // refresh or mutation should be able to trigger another refresh
      // without piling up behind a slow server call.
      isRefreshingRef.current = false;

      // Tier 2: replace each scope's slice with fresh server data as it
      // arrives (each scope is independent, so the slowest one decides
      // when the page is fully consistent, but the UI is responsive
      // throughout).
      remoteAssetsPromise
        .then((results) => {
          setAssets((prev) => {
            let next = prev;
            for (const r of results) {
              if (r.assets.length === 0) continue;
              const others = next.filter((a2) =>
                r.scope.scopeKind === "project"
                  ? a2.projectId !== r.scope.scopeId
                  : a2.productId !== r.scope.scopeId,
              );
              next = [...others, ...r.assets];
            }
            if (activeProduct?.id) {
              setHealthMap((hmPrev) => ({ ...hmPrev, [activeProduct.id]: computeHealth(next) }));
            }
            return next;
          });
          setLastFetchedAt(new Date());
        })
        .catch(() => {/* non-blocking */});

      // Re-load runs so signature chips stay current — fire-and-forget, non-blocking.
      void runsPromise
        .then((runs) => {
          const runMap: Record<string, AssetWorkflowRun[]> = {};
          runs.forEach((run) => {
            if (!runMap[run.assetId]) runMap[run.assetId] = [];
            runMap[run.assetId].push(run);
          });
          setRunsMap((prev) => {
            const merged = { ...runMap };
            Object.keys(prev).forEach((id) => {
              const prevRuns = prev[id];
              if (!prevRuns?.length) return;
              const freshRuns = merged[id] ?? [];
              const freshById = new Map(freshRuns.map((r) => [r.id, r]));
              // Merge by id, keeping whichever copy has the latest updatedAt.
              // Never discard fresher server signature status because an asset
              // had multiple cached runs (the old `prevRuns.length > 1` bail-out).
              const combinedIds = new Set([
                ...prevRuns.map((r) => r.id),
                ...freshRuns.map((r) => r.id),
              ]);
              const mergedRuns: AssetWorkflowRun[] = [];
              combinedIds.forEach((runId) => {
                const localRun = prevRuns.find((r) => r.id === runId);
                const freshRun = freshById.get(runId);
                const localDirty = (localRun as AssetWorkflowRun & { dirty?: boolean })?.dirty === true;
                if (localDirty && localRun) {
                  mergedRuns.push(localRun);
                  return;
                }
                if (localRun && freshRun) {
                  const localTs = new Date(localRun.updatedAt).getTime();
                  const freshTs = new Date(freshRun.updatedAt).getTime();
                  mergedRuns.push(freshTs >= localTs ? freshRun : localRun);
                } else {
                  mergedRuns.push(freshRun ?? localRun!);
                }
              });
              mergedRuns.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
              merged[id] = mergedRuns;
            });
            return merged;
          });
        })
        .catch(() => {/* non-blocking */});
    } catch {
      // Defensive — release the guard on any unexpected error.
      isRefreshingRef.current = false;
    }
  }, [selectedProjectId, archiveMode, productsKey, activeProduct?.id, paginatedWebProject]);

  // Fix 1 — Listen for background refresh event from AssetRepository.
  // IMPORTANT: must read from local IndexedDB only here — calling refreshAssets() would
  // trigger another network fetch, which fires repo:assets:updated again → infinite loop.
  useEffect(() => {
    const handler = async (e: Event) => {
      // Mobile only. This event signals that AssetRepository's background refresh
      // wrote fresh data into local IndexedDB. On web there IS no IndexedDB asset
      // store (web uses webCachedGet), so listLocalByProject/Product would return
      // [] and setAssets([]) would wipe the whole list — the "asset list vanishes
      // after editing on web" bug. Web keeps its own state via the optimistic
      // setAssets in saveEditAsset + webCachedGet invalidation, so it must skip.
      if (!isMobileNativePlatform()) return;
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
        // Fix: health bar previously stayed on a stale snapshot here because this
        // handler only updated `assets`, never `healthMap`. The status column read
        // `assets` directly so it looked correct, but the health bar reads from the
        // separately cached `healthMap` — which was never told fresh data arrived.
        if (activeProduct?.id) {
          setHealthMap((prev) => ({ ...prev, [activeProduct.id]: computeHealth(a) }));
        }
      }
    };
    window.addEventListener("repo:assets:updated", handler as EventListener);
    return () => window.removeEventListener("repo:assets:updated", handler as EventListener);
  }, [products, selectedProjectId, archiveMode, activeProduct?.id]);

  // Mark server as unreachable when background fetch fails
  useEffect(() => {
    const handler = () => {
      setServerReachable(false);
      serverWasOfflineRef.current = true;
    };
    window.addEventListener("repo:assets:fetch-failed", handler);
    return () => window.removeEventListener("repo:assets:fetch-failed", handler);
  }, []);

  // Refresh a single asset's assignments in the map when the background
  // assignment refresh (or login bootstrap) updates the offline cache.
  useEffect(() => {
    if (!isMobileNativePlatform()) return;
    const handler = async (e: Event) => {
      const assetId = (e as CustomEvent<{ assetId?: string }>).detail?.assetId;
      if (!assetId) return;
      const local = await WorkflowAssignmentRepository.getLocalByAsset(assetId).catch(() => []);
      setAssignmentsMap((prev) => {
        // Preserve a fully-loaded (expanded) entry rather than shrink it.
        if (prev[assetId] && prev[assetId].length > local.length) return prev;
        return { ...prev, [assetId]: local };
      });
    };
    window.addEventListener("repo:assignments:updated", handler as EventListener);
    return () => window.removeEventListener("repo:assignments:updated", handler as EventListener);
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

  useEffect(() => {
    const handler = (e: Event) => {
      const { assetId, projectId, runs, mergeById } = (e as CustomEvent<{
        assetId?: string; projectId?: string; runs: AssetWorkflowRun[]; mergeById?: boolean;
      }>).detail ?? {};
      if (!Array.isArray(runs) || runs.length === 0) return;
      setRunsMap((prev) => {
        const next = { ...prev };
        if (assetId) {
          if (mergeById && prev[assetId] && prev[assetId].length > 0) {
            // Local offline update of a single run — replace that run by id and
            // keep the rest of the asset's run history intact.
            const existing = prev[assetId];
            const merged = existing.map((r) => runs.find((u) => u.id === r.id) ?? r);
            // include any updated run not already present (e.g. a brand-new run)
            runs.forEach((u) => { if (!merged.some((r) => r.id === u.id)) merged.push(u); });
            next[assetId] = merged;
          } else {
            next[assetId] = runs;
          }
        } else if (projectId) {
          const byAsset: Record<string, AssetWorkflowRun[]> = {};
          runs.forEach((r) => {
            if (!byAsset[r.assetId]) byAsset[r.assetId] = [];
            byAsset[r.assetId].push(r);
          });
          Object.entries(byAsset).forEach(([id, fresh]) => {
            const existing = prev[id];
            if (!existing || existing.length === 0) {
              next[id] = fresh;
              return;
            }
            // MERGE BY ID — do not replace, and do not bail out.
            //
            // This previously read:
            //     if (!prev[id] || prev[id].length <= 1) next[id] = fresh;
            // i.e. the project-scoped background refresh only updated an asset that had
            // 0 or 1 runs. Any asset with TWO OR MORE local runs silently DISCARDED the
            // fresh server data — so a run performed on the WEB never appeared on the
            // phone, and a re-run or a deleted-and-reused asset (which stack multiple
            // runs) got permanently stuck on stale local state.
            //
            // The bail-out existed for a real reason: /by-project returns a SUBSET
            // (the newest run, plus the newest completed run, per asset+config), so
            // replacing wholesale would TRUNCATE the phone's local run history.
            // Merging by id gets both: server runs are applied, local-only runs survive.
            // This mirrors the `mergeById` branch above, which already does it correctly
            // for asset-scoped updates.
            const merged = existing.map((r) => fresh.find((u) => u.id === r.id) ?? r);
            fresh.forEach((u) => { if (!merged.some((r) => r.id === u.id)) merged.push(u); });
            next[id] = merged;
          });
        }
        return next;
      });
    };
    window.addEventListener("workflow-runs-cache-updated", handler as EventListener);
    return () => window.removeEventListener("workflow-runs-cache-updated", handler as EventListener);
  }, []);

  // Web: signature submit and run completion invalidate caches but do not emit
  // workflow-runs-cache-updated (native-only). Refresh assets + runs so signature
  // chips and action buttons stay current after signing in the runner.
  useEffect(() => {
    if (isNativePlatform) return;
    const handler = () => { void refreshAssets(); };
    window.addEventListener("notifications:run-state-changed", handler);
    window.addEventListener("repo:runs:updated", handler);
    return () => {
      window.removeEventListener("notifications:run-state-changed", handler);
      window.removeEventListener("repo:runs:updated", handler);
    };
  }, [isNativePlatform, refreshAssets]);

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

  const isAdminUser = currentUser.role === "Admin";

  // Phone-only: "mine" filters cards to assets assigned to this user; "all" shows everything.
  const [mobileScope, setMobileScope] = useState<"mine" | "all">("all");

  // View is now table-filter driven on this page. Keep edit ownership rules separate.
  const manageableProjectIds = useMemo(() => {
    const myName = (currentUser.fullName ?? "").trim().toLowerCase();
    return new Set(
      projects.filter((p) =>
        String(p.projectManager ?? "").trim().toLowerCase() === myName ||
        (p.teamMemberIds?.includes(currentUser.id) ?? false)
      ).map((p) => p.id)
    );
  }, [currentUser.fullName, currentUser.id, projects]);

  // Build capture index once from the full asset set (not search-filtered).
  // Filtering display rows is cheap; rebuilding from workflow runs is expensive
  // and used to re-run on every search keystroke via displayAssets.
  const captureTableBase = useMemo(
    () => (libFeatures.length ? buildProjectCaptureTable(assets, runsMap, libFeatures) : null),
    [assets, runsMap, libFeatures],
  );

  const captureIndexByAsset = useMemo(() => {
    const next: Record<string, { searchText: string; hits: ProjectCaptureSearchHit[] }> = {};
    if (!captureTableBase) {
      for (const asset of assets) {
        next[asset.id] = {
          searchText: [asset.assetTag, asset.assetName ?? "", asset.serialNumber ?? ""].join(" ").toLowerCase(),
          hits: [],
        };
      }
      return next;
    }
    for (const row of captureTableBase.rows) {
      next[row.assetId] = { searchText: row.searchText, hits: row.searchHits };
    }
    for (const asset of assets) {
      if (!next[asset.id]) {
        next[asset.id] = {
          searchText: [asset.assetTag, asset.assetName ?? "", asset.serialNumber ?? ""].join(" ").toLowerCase(),
          hits: [],
        };
      }
    }
    return next;
  }, [assets, captureTableBase]);

  const visibleAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((a) => {
      if (archiveMode) {
        if (!a.isDeleted) return false;
      } else {
        if (a.isDeleted) return false;
        if (selectedProjectId && a.projectId !== selectedProjectId) return false;
        if (statusFilter !== "All" && a.status !== statusFilter) return false;
        if (showNoWorkflow && assetHasConfiguredWorkflow(a)) return false;
      }
      if (q) {
        const identityHit = anyMatchesWordStart(
          [a.assetTag, a.serialNumber, a.location, a.assetModel, a.manufacturer, a.assetName],
          q,
        );
        const captureHits = captureIndexByAsset[a.id]?.hits;
        const captureHit = identityHit ? null : findCaptureMatch(captureHits, q, matchesWordStart);
        if (!identityHit && !captureHit) return false;
      }
      return true;
    });
  }, [assets, selectedProjectId, statusFilter, showNoWorkflow, search, archiveMode, captureIndexByAsset]);

  const bulkReportSelectedAssets = useMemo(
    () => visibleAssets.filter((asset) => selectedAssetIds.has(asset.id)),
    [visibleAssets, selectedAssetIds],
  );

  const bulkReportZipFileName = useMemo(() => {
    const job = selectedProject?.jobNumber?.trim();
    const stamp = new Date().toISOString().slice(0, 10);
    return job ? `${job}-workflow-reports-${stamp}` : `workflow-reports-${stamp}`;
  }, [selectedProject?.jobNumber]);

  // Projects linked to the active product (used in add/edit dialogs and the project selector).
  const productProjects = useMemo(
    () => {
      const filtered = activeProduct?.id
        ? projects.filter((p) => p.productIds?.includes(activeProduct.id))
        : projects;
      if (selectedProjectId && !filtered.some((p) => p.id === selectedProjectId)) {
        const selected = projects.find((p) => p.id === selectedProjectId);
        if (selected) return [selected, ...filtered];
      }
      return filtered;
    },
    [projects, activeProduct?.id, selectedProjectId],
  );

  // When only one project is in scope, auto-select it so the page does not open empty.
  useEffect(() => {
    if (selectedProjectId || allProjectsExplicit) return;
    if (productProjects.length !== 1) return;
    handleProjectChange(productProjects[0].id);
  }, [allProjectsExplicit, handleProjectChange, productProjects, selectedProjectId]);

  const canEditAssetFromWebTable = useMemo(() => (asset: ProjectAsset) => {
    if (can.installationAssets?.editScope === "all") return true;
    if (can.installationAssets?.editScope !== "own") return false;
    if (manageableProjectIds.has(asset.projectId)) return true;
    return asset.assignedUserId === currentUser.id;
  }, [can.installationAssets?.editScope, currentUser.id, manageableProjectIds]);

  const canEditCaptureForAsset = useCallback((asset: ProjectAsset) => {
    if (!canEditCaptureData) return false;
    const scope = can.installationAssets?.editCaptureScope ?? "none";
    if (scope === "all") return true;
    if (scope !== "own") return false;
    if (manageableProjectIds.has(asset.projectId)) return true;
    return asset.assignedUserId === currentUser.id;
  }, [canEditCaptureData, can.installationAssets?.editCaptureScope, currentUser.id, manageableProjectIds]);

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

  const assetAccessors = useMemo(() => {
    const n = (v: string | null | undefined) => String(v ?? "");
    return {
      assetTag:    (a: ProjectAsset) => n(a.assetTag),
      assetName:   (a: ProjectAsset) => n(a.assetName),
      serialNumber:(a: ProjectAsset) => n(a.serialNumber),
      assetModel:  (a: ProjectAsset) => n(a.assetModel),
      manufacturer:(a: ProjectAsset) => n(a.manufacturer),
      configType:  (a: ProjectAsset) => n(a.productConfigId ? (configMap.get(a.productConfigId)?.configType ?? wfConfigMap.get(a.productConfigId)?.configType) : ""),
      configName:  (a: ProjectAsset) => n(a.productConfigId ? (configMap.get(a.productConfigId)?.name ?? wfConfigMap.get(a.productConfigId)?.name) : ""),
      project:     (a: ProjectAsset) => n(projectMap.get(a.projectId)?.jobNumber ?? a.projectId.slice(0, 8)),
      siteName:    (a: ProjectAsset) => n(projectMap.get(a.projectId)?.siteName),
      location:    (a: ProjectAsset) => n(a.location),
      assignedTech:(a: ProjectAsset) => n(a.assignedUserId ? userMap.get(a.assignedUserId)?.fullName : ""),
      status:      (a: ProjectAsset) => n(a.status),
    };
  }, [configMap, projectMap, userMap, wfConfigMap]);

  const assetFilterOptions = useMemo(() => {
    const opts: Record<string, string[]> = {};
    (["assetTag","assetName","serialNumber","assetModel","manufacturer","configType","project","siteName","location","assignedTech","status"] as const)
      .forEach((k) => { opts[k] = Array.from(new Set(visibleAssets.map((a) => assetAccessors[k](a)))).sort(); });
    return opts;
  }, [visibleAssets, assetAccessors]);

  const displayAssets = useMemo(() => {
    let rows = visibleAssets.filter((a) =>
      Object.entries(autoFilters).every(([k, sel]) => {
        if (!sel || sel.size === 0) return true;
        return sel.has((assetAccessors[k as keyof typeof assetAccessors])?.(a) ?? "");
      })
    );
    if (autoSort.key && assetAccessors[autoSort.key as keyof typeof assetAccessors]) {
      const acc = assetAccessors[autoSort.key as keyof typeof assetAccessors];
      rows = [...rows].sort((a, b) => {
        const av = acc(a).toLowerCase(), bv = acc(b).toLowerCase();
        if (av < bv) return autoSort.dir === "asc" ? -1 : 1;
        if (av > bv) return autoSort.dir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return rows;
  }, [visibleAssets, autoFilters, autoSort, assetAccessors]);

  const virtualizeOperationsTable =
    paginatedWebProject && displayAssets.length >= OPERATIONS_VIRTUALIZE_MIN_ROWS;

  const mobileAssets = useMemo(() => {
    if (!isNativePlatform || mobileScope === "all") return displayAssets;
    return displayAssets.filter((a) => a.assignedUserId === currentUser.id);
  }, [displayAssets, isNativePlatform, mobileScope, currentUser.id]);

  const captureExportTable = useMemo(() => {
    if (!captureTableBase) {
      return { columns: [], groups: [], rows: [] as ReturnType<typeof buildProjectCaptureTable>["rows"] };
    }
    const idSet = new Set(displayAssets.map((a) => a.id));
    return {
      columns: captureTableBase.columns,
      groups: captureTableBase.groups,
      rows: captureTableBase.rows.filter((row) => idSet.has(row.assetId)),
    };
  }, [captureTableBase, displayAssets]);

  const captureExportGroups = useMemo(() => {
    const groups = captureExportTable.groups;
    if (groups.length === 0) return groups;

    let hidden = new Set<string>();
    try {
      hidden = new Set<string>(JSON.parse(localStorage.getItem(CAPTURE_HIDDEN_GROUPS_KEY) || "[]") as string[]);
    } catch {
      hidden = new Set<string>();
    }

    const filtered = groups
      .map((group) => ({
        ...group,
        columns: group.columns.filter((column) => !hidden.has(group.key) && !hidden.has(column.id)),
      }))
      .filter((group) => group.columns.length > 0);

    return filtered.length > 0 ? filtered : groups;
  }, [captureExportTable.groups]);

  const captureExportRowMap = useMemo(
    () => new Map(captureExportTable.rows.map((row) => [row.assetId, row])),
    [captureExportTable.rows],
  );

  // Print scope computation (needs userMap / projectMap / configMap / runsMap)
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
          if (!runs[0] || (runs[0].signatureStatus !== "PendingCustomer" && runs[0].signatureStatus !== "PendingInstaller")) return false;
        }
        return true;
      });
    }
    const statusLabel: Record<string, string> = {
      NotStarted: "Not Started", InProgress: "In Progress", Paused: "Paused", Pending: "Pending", Complete: "Complete", Closed: "Closed", Issue: "Issue", Cancelled: "Cancelled",
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

  const assetExportMode = "operations" as const;

  const assetExportSingleProject = useMemo(() => {
    if (selectedProject) return selectedProject;
    const projectIds = Array.from(new Set(displayAssets.map((asset) => asset.projectId).filter(Boolean)));
    if (projectIds.length !== 1) return null;
    return projectMap.get(projectIds[0]) ?? null;
  }, [displayAssets, projectMap, selectedProject]);

  const assetCaptureJobColumns = useMemo(
    () => buildFullCaptureJobColumns({ projectMap, userMap, assignmentsMap, runsMap }),
    [assignmentsMap, projectMap, runsMap, userMap],
  );

  const captureComponentExportGroups = useMemo(
    () => captureExportGroups.filter((group) => group.groupType !== "general"),
    [captureExportGroups],
  );

  const captureSignOffExportGroups = useMemo(
    () => captureExportGroups.filter((group) => group.groupType === "general"),
    [captureExportGroups],
  );

  const assetExportColumnOptions = useMemo<AssetExportColumnOption[]>(() => {
    const exportColumns = visibleColumns.filter((column) => column.id !== "assetName" && column.id !== "status");
    return [
      {
        id: "assetTag",
        label: "Asset Tag",
        headerLabel: "Asset Tag",
        groupLabel: "ASSET & JOB",
        valueFor: (asset: ProjectAsset) => asset.assetTag || "-",
      },
      {
        id: "assetName",
        label: "Asset Name",
        headerLabel: "Asset Name",
        groupLabel: "ASSET & JOB",
        valueFor: (asset: ProjectAsset) => asset.assetName || "-",
      },
      ...exportColumns.map((column) => ({
        id: column.id,
        label: column.label,
        headerLabel: column.label,
        groupLabel: ["project", "siteName", "location"].includes(column.id) ? "ASSET & JOB" : "WORKFLOW",
        valueFor: (asset: ProjectAsset) => {
          const cfg = asset.productConfigId ? configMap.get(asset.productConfigId) : null;
          const proj = projectMap.get(asset.projectId);
          const tech = asset.assignedUserId ? userMap.get(asset.assignedUserId) : null;
          return getOperationsExportCellText(column.id, asset, cfg, proj, tech ?? undefined);
        },
      })),
      {
        id: "status",
        label: "Status",
        headerLabel: "Status",
        groupLabel: "WORKFLOW",
        valueFor: (asset: ProjectAsset) => getOperationsStatusLabel(asset, projectMap.get(asset.projectId)?.workflowMode),
      },
      {
        id: "action",
        label: "Action",
        headerLabel: "Action",
        groupLabel: "WORKFLOW",
        valueFor: (asset: ProjectAsset) => getAssetActionLabel(asset, projectMap.get(asset.projectId)?.workflowMode),
      },
    ];
  }, [configMap, projectMap, userMap, visibleColumns]);

  function openAssetExportDialog() {
    setAssetExportFormat("pdf");
    setAssetExportSelectedColumnIds(assetExportColumnOptions.map((column) => column.id));
    setAssetExportIncludeProjectMeta(true);
    setAssetExportIncludeBusinessLogo(true);
    setAssetExportIncludeCustomerLogo(Boolean(assetExportSingleProject?.customerId));
    setAssetExportDialogOpen(true);
  }

  // ------------------------------------------------------------------
  // Add asset
  // ------------------------------------------------------------------

  function openAdd() {
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
        assetName: editForm.assetName.trim() || undefined,
        serialNumber: editForm.serialNumber.trim() || undefined,
        assetModel: editForm.assetModel.trim() || undefined,
        manufacturer: editForm.manufacturer.trim() || undefined,
        location: editForm.location.trim() || undefined,
        assignedUserId: editForm.assignedUserId || undefined,
        notes: editForm.notes.trim() || undefined,
        productConfigId: editForm.configId,
        featureValuesJson: Object.keys(editForm.featureValues).length
          ? JSON.stringify(editForm.featureValues)
          : undefined,
      });
      setAssets((prev) => prev.map((a) => (a.id === editAsset.id ? updated : a)));
      setEditAsset(updated);
      setEditForm((prev) => ({ ...prev, notes: updated.notes ?? prev.notes }));
      setEditOpen(false);
      setEditAsset(null);
    } catch {
      setEditError("Failed to update asset.");
    } finally {
      setEditSaving(false);
    }
  }

  // ------------------------------------------------------------------
  // Cancel asset
  //
  // Cancel is a STATUS, not a soft-delete: the asset stays visible on this page
  // (chip + filter) instead of disappearing the way a deleted asset does. It
  // rides the existing Admin/PM update endpoint, so no new backend route.
  //
  // No run surgery is needed. IsCurrentWorkspaceAsset drops a cancelled asset
  // before it inspects the run, and every active-asset query already excludes
  // "Cancelled" - so an in-flight run simply stops counting as current and the
  // captured work is preserved as an audit record.
  // ------------------------------------------------------------------

  async function confirmCancelAsset() {
    if (!editAsset) return;
    const reason = cancelReason.trim();
    if (!reason) return;
    setCancellingAsset(true);
    setEditError(null);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const existingNotes = (editForm.notes ?? "").trim();
      const cancelNote = `[Cancelled ${stamp}] ${reason}`;
      const updated = await projectAssetService.update(editAsset.id, {
        status: "Cancelled",
        notes: existingNotes ? `${existingNotes}\n${cancelNote}` : cancelNote,
      });
      setAssets((prev) => prev.map((a) => (a.id === editAsset.id ? updated : a)));
      setEditAsset(updated);
      setEditForm((prev) => ({ ...prev, notes: updated.notes ?? prev.notes }));
      setCancelConfirmOpen(false);
      setCancelReason("");
    } catch {
      setEditError("Failed to cancel asset.");
    } finally {
      setCancellingAsset(false);
    }
  }

  async function confirmUndoCancelAsset() {
    if (!editAsset) return;
    setCancellingAsset(true);
    setEditError(null);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const existingNotes = (editForm.notes ?? "").trim();
      const undoNote = `[Cancellation removed ${stamp}] Restored to Not Started`;
      const updated = await projectAssetService.update(editAsset.id, {
        status: "NotStarted",
        notes: existingNotes ? `${existingNotes}\n${undoNote}` : undoNote,
      });
      setAssets((prev) => prev.map((a) => (a.id === editAsset.id ? updated : a)));
      setEditAsset(updated);
      setEditForm((prev) => ({ ...prev, notes: updated.notes ?? prev.notes }));
      setCancelConfirmOpen(false);
      setCancelReason("");
    } catch {
      setEditError("Failed to restore cancelled asset.");
    } finally {
      setCancellingAsset(false);
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
      const depsByFeat = await featureDependencyService.mapByProduct(productId);
      const items: BomItem[] = [];
      productFeatures.forEach((feature) => {
        const deps = depsByFeat[feature.id] ?? [];
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
    markWorkflowOpenTap("assets-work-order", asset.productConfigId ?? asset.id);
    setRunnerLoading(asset.id);
    try {
      // New path: productConfigId → WorkflowConfig (published work instruction)
      if (asset.productConfigId) {
        const payload = await loadWorkflowOpenPayload(asset.productConfigId, asset, {
          runs: runsMap[asset.id],
          mergeMedia: true,
        });
        if (payload) {
          setRunnerExistingRunId(payload.existingRunId);
          setRunnerAsset(asset);
          setRunnerWorkflow(payload.workflow);
          setRunnerWorkflowConfigId(asset.productConfigId);
          setRunnerFeatureSelections(parseFeatureSelectionsForConfig(asset.productConfigId));
          setRunnerOpen(true);
          refreshWorkflowOpenDataInBackground(asset.id, asset.productConfigId);
          return;
        }

        if (asset.status === "InProgress") {
          let runs: AssetWorkflowRun[] | undefined = runsMap[asset.id];
          if (!runs) {
            try { runs = await assetWorkflowRunService.listByAsset(asset.id); } catch { /* empty */ }
          }
          const fallback = (runs ?? [])
            .filter((r) => !r.isLocked && r.status === "InProgress")
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
          if (fallback && fallback.workflowConfigId !== asset.productConfigId) {
            const fbPayload = await loadWorkflowOpenPayload(fallback.workflowConfigId, asset, {
              runs,
              mergeMedia: true,
            });
            if (fbPayload) {
              setRunnerExistingRunId(fallback.id);
              setRunnerAsset(asset);
              setRunnerWorkflow(fbPayload.workflow);
              setRunnerWorkflowConfigId(fallback.workflowConfigId);
              setRunnerFeatureSelections(parseFeatureSelectionsForConfig(fallback.workflowConfigId));
              setRunnerOpen(true);
              refreshWorkflowOpenDataInBackground(asset.id, fallback.workflowConfigId);
              return;
            }
          }
        }

        if (shouldSkipBlockingFetch()) {
          alert(OFFLINE_CONFIG_MISSING_MESSAGE);
          retryOfflineDownload();
          return;
        }
        alert("Work instruction config not found.");
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
      id: randomId(),
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
      id: randomId(),
      description: issueForm.description.trim(),
      severity: issueForm.severity,
      issueType: "observation",
      isBlocking: false,
      reportedAt: new Date().toISOString(),
      resolved: false,
      reportMedia: issueMedia.length > 0 ? issueMedia : undefined,
    };
    issues.push(newIssue);
    const issuesJson = JSON.stringify(issues);
    try {
      const updated = await projectAssetService.update(issueDialogAsset.id, { issuesJson });
      setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch {
      const optimisticAsset = { ...issueDialogAsset, issuesJson };
      setAssets((prev) => prev.map((a) => (a.id === issueDialogAsset.id ? optimisticAsset : a)));
      if (isMobileNativePlatform()) {
        await entityReplaceIssuesForAsset(optimisticAsset.id, deriveOpenIssuesFromAsset(optimisticAsset));
        window.dispatchEvent(new Event("repo:issues:updated"));
      }
      window.dispatchEvent(new Event("notifications:run-state-changed"));
      window.dispatchEvent(new Event("notifications:refresh"));
    }
    setIssueDialogOpen(false);
    setIssueDialogAsset(null);
    setIssueForm({ description: "", severity: "medium" });
    setIssueMedia([]);
  }

  async function handleToggleIssueResolved(asset: ProjectAsset, issueId: string) {
    let issues: AssetIssue[] = [];
    try { issues = JSON.parse(asset.issuesJson || "[]"); } catch {}
    issues = issues.map((i) => i.id === issueId ? { ...i, resolved: !i.resolved } : i);
    const issuesJson = JSON.stringify(issues);
    try {
      const updated = await projectAssetService.update(asset.id, { issuesJson });
      setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch {
      const optimisticAsset = { ...asset, issuesJson };
      setAssets((prev) => prev.map((a) => (a.id === asset.id ? optimisticAsset : a)));
      if (isMobileNativePlatform()) {
        await entityReplaceIssuesForAsset(optimisticAsset.id, deriveOpenIssuesFromAsset(optimisticAsset));
        window.dispatchEvent(new Event("repo:issues:updated"));
      }
      window.dispatchEvent(new Event("notifications:run-state-changed"));
      window.dispatchEvent(new Event("notifications:refresh"));
    }
  }

  async function handleIssueDetailSave(updatedIssue: AssetIssue) {
    if (!issueDetailAsset) return;
    let issues: AssetIssue[] = [];
    try { issues = JSON.parse(issueDetailAsset.issuesJson || "[]"); } catch {}
    issues = issues.map((i) => i.id === updatedIssue.id ? updatedIssue : i);
    const issuesJson = JSON.stringify(issues);
    try {
      const updated = await projectAssetService.update(issueDetailAsset.id, { issuesJson });
      setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      // Keep the dialog open with refreshed asset so the user sees the saved state
      setIssueDetailAsset(updated);
    } catch {
      const optimisticAsset = { ...issueDetailAsset, issuesJson };
      setAssets((prev) => prev.map((a) => (a.id === issueDetailAsset.id ? optimisticAsset : a)));
      setIssueDetailAsset(optimisticAsset);
      if (isMobileNativePlatform()) {
        await entityReplaceIssuesForAsset(optimisticAsset.id, deriveOpenIssuesFromAsset(optimisticAsset));
        window.dispatchEvent(new Event("repo:issues:updated"));
      }
      window.dispatchEvent(new Event("notifications:run-state-changed"));
      window.dispatchEvent(new Event("notifications:refresh"));
    }
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
    // Load workflow types (needed only to resolve a config's type id for the
    // create() call — the dialog itself only shows Published configs) + configs.
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
      const preselected = matchingConfigs.length === 1 ? matchingConfigs[0] : null;
      setAssignForm({
        workflowTypeId: preselected ? resolveConfigWorkflowTypeId(preselected, types) : "",
        workflowConfigId: preselected?.id ?? "",
      });
    } catch { console.warn("[AssetInstallationPage] failed to load workflow types/configs"); }
  }

  async function saveAssignment() {
    if (!assignDialogAsset || !assignForm.workflowConfigId) return;

    // Resolve the workflow type id. resolveConfigWorkflowTypeId() returns "" when the
    // config has no explicit workflowTypeId AND its configType can't be matched against
    // the workflowTypes list — which is exactly what happens OFFLINE if that list failed
    // to load. Previously saveAssignment() guarded on `!assignForm.workflowTypeId` and
    // silently RETURNED: the user picked a config, pressed Save, and nothing happened at
    // all — no save, no error, no closed dialog.
    //
    // Recover instead: re-resolve here (the list may have loaded since the dialog opened),
    // and fall back to the config's own workflowTypeId. Only if we still have nothing do
    // we tell the user — rather than doing nothing at all.
    let workflowTypeId = assignForm.workflowTypeId;
    if (!workflowTypeId) {
      const cfg = workflowConfigs.find((c) => c.id === assignForm.workflowConfigId);
      workflowTypeId = cfg ? resolveConfigWorkflowTypeId(cfg, workflowTypes) || (cfg.workflowTypeId ?? "") : "";
    }
    if (!workflowTypeId) {
      setInlineSaveError("Could not determine the workflow type for this config. Reconnect and try again.");
      return;
    }

    setAssignSaving(true);
    try {
      await assetWorkflowAssignmentService.create(assignDialogAsset.id, assignForm.workflowConfigId, workflowTypeId);
      await loadAssignmentsForAsset(assignDialogAsset.id);
      setAssignDialogOpen(false);
    } catch (err) {
      console.warn("[AssetInstallationPage] saveAssignment failed", err);
      setInlineSaveError("Could not assign the workflow. Please try again.");
    } finally {
      setAssignSaving(false);
    }
  }

  async function removeAssignment(assetId: string, assignmentId: string) {
    try {
      await assetWorkflowAssignmentService.remove(assignmentId);
      await loadAssignmentsForAsset(assetId);
    } catch { console.warn("[AssetInstallationPage] removeAssignment failed"); }
  }

  function pickPreferredAssignment(
    asset: ProjectAsset,
    assignments: WorkflowAssignment[],
    runs: AssetWorkflowRun[] = runsMap[asset.id] ?? [],
  ): WorkflowAssignment | undefined {
    if (assignments.length === 0) return undefined;

    const activeRun = runs.find((run) => !run.isLocked);
    if (activeRun) {
      const matchingActiveRun = assignments.find((item) => item.workflowConfigId === activeRun.workflowConfigId);
      if (matchingActiveRun) return matchingActiveRun;
    }

    if (asset.productConfigId) {
      const matchingConfig = assignments.find((item) => item.workflowConfigId === asset.productConfigId);
      if (matchingConfig) return matchingConfig;
    }

    return assignments[0];
  }

  async function resolvePreferredAssignment(asset: ProjectAsset): Promise<WorkflowAssignment | null> {
    // Always defer to the service's own local-first + background-refresh
    // pattern rather than short-circuiting on assignmentsMap directly — that
    // in-memory map is only ever populated once per asset per page session
    // (e.g. from the mobile offline-cache priming pass) and never
    // invalidated, so a short-circuit here meant a newly-assigned or
    // reassigned workflow made server-side (e.g. from the web) stayed
    // invisible until something else happened to force a refetch (expanding
    // the row, reopening run history, etc.) — even while fully online.
    // listByAsset is cheap to call repeatedly: it resolves from local cache
    // instantly and only awaits the network when there's truly nothing local.
    try {
      const assignments = await assetWorkflowAssignmentService.listByAsset(asset.id);
      setAssignmentsMap((prev) => ({ ...prev, [asset.id]: assignments }));
      return pickPreferredAssignment(asset, assignments) ?? null;
    } catch {
      return null;
    }
  }

  async function startAssetFromBestWorkflowSource(asset: ProjectAsset) {
    const assignment = await resolvePreferredAssignment(asset);
    if (assignment) {
      await handleStartAssignmentRun(asset, assignment);
      return;
    }

    await handleStartWorkOrder(asset);
  }

  async function _doStartAssignmentRun(asset: ProjectAsset, assignment: WorkflowAssignment) {
    markWorkflowOpenTap("assets-assignment", assignment.workflowConfigId);
    setRunnerLoading(asset.id);
    try {
      const cfgFromMemory = wfConfigMap.get(assignment.workflowConfigId)
        ?? publishedWfConfigs.find((c) => c.id === assignment.workflowConfigId)
        ?? null;
      const payload = await loadWorkflowOpenPayload(assignment.workflowConfigId, asset, {
        configFromMemory: cfgFromMemory,
        runs: runsMap[asset.id],
        workflowConfigIdForRun: assignment.workflowConfigId,
        mergeMedia: true,
      });
      if (!payload) { alert("Workflow config not found."); return; }

      setRunnerExistingRunId(payload.existingRunId);
      setRunnerAsset(asset);
      setRunnerWorkflow(payload.workflow);
      setRunnerWorkflowConfigId(assignment.workflowConfigId);
      setRunnerFeatureSelections(parseFeatureSelectionsForConfig(assignment.workflowConfigId));
      setRunnerOpen(true);
      refreshWorkflowOpenDataInBackground(asset.id, assignment.workflowConfigId);
    } catch { alert("Failed to load workflow."); } finally {
      setRunnerLoading(null);
    }
  }

  async function handleStartAssignmentRun(asset: ProjectAsset, assignment: WorkflowAssignment) {
    // Workflow type / config type mismatch guard - warn before proceeding.
    const matchedTypeName = workflowTypes.find((t) => t.id === assignment.workflowTypeId)?.name
      ?? assignment.workflowTypeName;
    const matchedCfg = wfConfigMap.get(assignment.workflowConfigId)
      ?? workflowConfigs.find((c) => c.id === assignment.workflowConfigId)
      ?? await workflowConfigService.getById(assignment.workflowConfigId);
    const mismatchMsg = workflowTypeMismatchMessage(matchedTypeName, matchedCfg?.configType);
    if (mismatchMsg) {
      setWfMismatchConfirm({ asset, assignment, message: mismatchMsg });
      return;
    }
    await _doStartAssignmentRun(asset, assignment);
  }

  // ------------------------------------------------------------------
  // Auto-assign check â€" intercepts start/continue before opening runner
  // ------------------------------------------------------------------

  async function checkAssignmentThenStart(asset: ProjectAsset, assignment?: WorkflowAssignment) {
    if (!asset.assignedUserId) {
      // Unassigned - warn and auto-assign
      setAutoAssignConfirm({ asset, assignment, reason: "unassigned" });
      return;
    }
    if (asset.assignedUserId !== currentUser.id) {
      // Assigned to someone else - warn before taking over
      const otherName = users.find((u) => u.id === asset.assignedUserId)?.fullName ?? "another user";
      setAutoAssignConfirm({ asset, assignment, reason: "other", otherName });
      return;
    }
    // Assigned to me - start directly
    if (assignment) {
      await handleStartAssignmentRun(asset, assignment);
      return;
    }

    await startAssetFromBestWorkflowSource(asset);
  }

  async function confirmAutoAssignAndStart() {
    if (!autoAssignConfirm) return;
    const { asset, assignment } = autoAssignConfirm;
    setAutoAssignConfirm(null);

    // Persist the assignment via the narrow, installer-permitted endpoint.
    //
    // This previously called projectAssetService.update() (the broad PUT), which is
    // Admin/PM-only — so an Installer's claim/takeover 403'd, the failure was swallowed
    // by an empty catch, and the run started anyway from an in-memory object carrying
    // the new user. Net effect: the RUN recorded the new owner (correct in the report)
    // while the ASSET kept the old one. Because asset.assignedUserId is what the Assets
    // installer column AND the Dashboard "My Jobs Today" query both read, the new owner
    // never saw the job in their dashboard and the previous owner still did.
    //
    // We now use patchAssignment() (permitted for installers, self-assign only) and do
    // NOT continue if it fails: a run whose ownership didn't persist is a job that never
    // appears in the owner's queue, which is exactly the failure we're fixing.
    try {
      const saved = await projectAssetService.patchAssignment(asset.id, currentUser.id);
      setAssets((prev) => prev.map((a) => a.id === asset.id ? { ...a, assignedUserId: saved.assignedUserId } : a));
    } catch {
      setInlineSaveError("Could not assign this asset to you. The run was not started — please try again.");
      return;
    }

    const updated = { ...asset, assignedUserId: currentUser.id };
    if (assignment) {
      await handleStartAssignmentRun(updated, assignment);
      return;
    }

    await startAssetFromBestWorkflowSource(updated);
  }

  // ------------------------------------------------------------------
  // Run history + re-run
  // ------------------------------------------------------------------

  // Open the specific blocking issue directly (like the Dashboard does) rather
  // than dumping the user into the whole run. Finds the first OPEN blocking
  // issue across the asset's own issues and its runs, and opens IssueDetailDialog
  // on it. Falls back to run history only if no blocking issue can be located.
  async function openBlockingIssue(asset: ProjectAsset) {
    // 1) asset-level issues
    try {
      const assetIssues: AssetIssue[] = JSON.parse(asset.issuesJson || "[]");
      const blk = assetIssues.find((i) => i.isBlocking && !i.resolved);
      if (blk) {
        setIssueDetailAsset(asset);
        setIssueDetailIssueId(blk.id);
        setIssueDetailRunId(null);
        return;
      }
    } catch { /* ignore parse */ }

    // 2) run-level issues (load runs if needed)
    let assetRuns = runsMap[asset.id];
    if (!assetRuns) {
      try {
        assetRuns = await assetWorkflowRunService.listByAsset(asset.id);
        setRunsMap((prev) => ({ ...prev, [asset.id]: assetRuns! }));
      } catch { assetRuns = []; }
    }
    const sortedRuns = [...(assetRuns ?? [])].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
    for (const run of sortedRuns) {
      let runIssues: RunIssue[] = [];
      try { runIssues = JSON.parse(run.issuesJson || "[]"); } catch { runIssues = []; }
      const blk = runIssues.find((i) => i.isBlocking && !i.resolved);
      if (blk) {
        setIssueDetailAsset(asset);
        setIssueDetailIssueId(blk.id);
        setIssueDetailRunId(run.id);
        return;
      }
    }

    // 3) fallback — no blocking issue found, open run history as before
    void openRunHistory(asset);
  }

  async function openRunHistory(asset: ProjectAsset, wfConfigId?: string, wfConfigName?: string, entryMode: "default" | "customer-sign" = "default") {
    // If a specific config was requested, open immediately
    if (wfConfigId) {
      const cached = wfConfigMap.get(wfConfigId);
      const cfgName = wfConfigName ?? cached?.displayName ?? cached?.name ?? "Workflow";
      setRunHistoryAsset(asset);
      setRunHistoryConfigId(wfConfigId);
      setRunHistoryConfigName(cfgName);
      setRunHistoryAllowRerun(true);
      setRunHistoryEntryMode(entryMode);
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
    setRunHistoryEntryMode(entryMode);
    _openRunHistoryProjectContext(asset);
    setRunHistoryOpen(true);
  }

  function _openRunHistoryProjectContext(asset: ProjectAsset) {
    const proj = projects.find((p) => p.id === asset.projectId);
    setRunHistoryProject(proj ? { customerName: proj.customerName, jobNumber: proj.jobNumber, siteName: proj.siteName, timeZoneId: proj.timeZoneId } : null);
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


  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  function getCaptureStatusSummary(asset: ProjectAsset): string {
    let fv: Record<string, string> = {};
    try { fv = JSON.parse(asset.featureValuesJson || "{}"); } catch {}

    const inventoryFeatures = activeFeatures.filter((feat) => feat.isInventory);
    const workflowInventoryTotal = asset.workflowSummary?.totalInventoryFeatures ?? 0;
    const workflowInventoryCompleted = asset.workflowSummary?.completedInventoryFeatures ?? 0;
    const fallbackFilled = inventoryFeatures.filter((feat) => {
      const raw = fv[feat.id];
      if (!raw) return false;
      if (feat.valueType === "component") {
        try { return Object.values(JSON.parse(raw) as Record<string, string>).some(Boolean); } catch { return false; }
      }
      return true;
    }).length;

    const total = workflowInventoryTotal > 0 ? workflowInventoryTotal : inventoryFeatures.length;
    const filled = workflowInventoryTotal > 0 ? Math.min(workflowInventoryCompleted, workflowInventoryTotal) : fallbackFilled;
    const latestRun = [...(runsMap[asset.id] ?? [])]
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
    const paused = Boolean(pausedProgress[asset.id]);

    let evidenceLabel = "Pending";
    if (paused || latestRun?.status === "Paused" || asset.workflowSummary?.evidenceStatus === "Paused") {
      evidenceLabel = "Paused";
    } else if (asset.status === "InProgress" || latestRun?.status === "InProgress") {
      evidenceLabel = "Running";
    } else if (asset.workflowSummary?.hasWorkflow) {
      if (asset.workflowSummary.evidenceStatus === "Running") evidenceLabel = "Running";
      else if (asset.workflowSummary.evidenceStatus === "Complete") evidenceLabel = "Done";
      else if (asset.workflowSummary.evidenceStatus === "MissingData") evidenceLabel = "Missing";
    } else if (latestRun) {
      if (!latestRun.isLocked) evidenceLabel = "Running";
      else evidenceLabel = countMissingWorkflowItems(latestRun) > 0 ? "Missing" : "Done";
    }

    return `${filled}/${total} inv | ${evidenceLabel}`;
  }

  function getOperationsStatusLabel(asset: ProjectAsset, projectWorkflowMode?: string | null): string {
    const runs = runsMap[asset.id] ?? [];
    const displayState = getWorkflowDisplayState(asset, runs, {
      paused: Boolean(pausedProgress[asset.id]),
      inspectionMode: projectHasInspection(projectWorkflowMode),
      hasRunnableWorkflowSource:
        (assignmentsMap[asset.id]?.length ?? 0) > 0
        || !!asset.productConfigId
        || !!asset.workflowTemplateId
        || !!asset.workflowSummary?.hasWorkflow,
    });
    return displayState.status.label;
  }

  function getAssetActionLabel(asset: ProjectAsset, projectWorkflowMode?: string | null): string {
    return getPrimaryAction(asset, projectWorkflowMode)?.label ?? "No workflow";
  }

  function getOperationsExportCellText(
    colId: string,
    asset: ProjectAsset,
    cfg: ProductConfig | null | undefined,
    proj: ReturnType<typeof projectMap.get>,
    tech: ReturnType<typeof userMap.get>,
  ): string {
    switch (colId) {
      case "assetName":
        return asset.assetName || "-";
      case "serialNumber":
        return asset.serialNumber || "-";
      case "assetModel":
        return asset.assetModel || "-";
      case "manufacturer":
        return asset.manufacturer || "-";
      case "configType":
        return cfg?.configType || (asset.productConfigId ? wfConfigMap.get(asset.productConfigId)?.configType : undefined) || "-";
      case "configName":
        return cfg?.name || (asset.productConfigId ? wfConfigMap.get(asset.productConfigId)?.name : undefined) || "-";
      case "project":
        return proj ? proj.jobNumber : asset.projectId.slice(0, 8);
      case "siteName":
        return proj?.siteName || "-";
      case "location":
        return asset.location || "-";
      case "assignedTech":
        return tech?.fullName || "-";
      case "features":
        return getCaptureStatusSummary(asset);
      case "status":
        return getOperationsStatusLabel(asset, proj?.workflowMode);
      default:
        return "-";
    }
  }

  async function buildAssetExportPackage() {
    const selectedColumns = assetExportColumnOptions.filter((column) => assetExportSelectedColumnIds.includes(column.id));
    if (selectedColumns.length === 0) {
      throw new Error("Select at least one column to export.");
    }

    const exportDate = new Date();
    const exportDateDisplay = exportDate.toLocaleString();
    const projectContext = assetExportSingleProject;
    const productNames = Array.from(new Set(displayAssets.map((asset) => products.find((product) => product.id === asset.productId)?.name).filter(Boolean))) as string[];
    const customerNames = Array.from(new Set(displayAssets.map((asset) => projectMap.get(asset.projectId)?.customerName).filter(Boolean))) as string[];
    const filtersSummary = [
      archiveMode ? "Archive view" : (showNoWorkflow ? "No workflow" : (statusFilter === "All" ? "All statuses" : `Status ${STATUS_LABELS[statusFilter] ?? statusFilter}`)),
      search.trim() ? `Search: ${search.trim()}` : null,
      "Operations view",
    ].filter(Boolean).join(" | ");

    let businessLogo: string | null = null;
    let customerLogo: string | null = null;

    if (assetExportIncludeBusinessLogo) {
      const rawBusinessLogo = await brandSettingsService.get().then((settings) => settings?.logoBase64 ?? null).catch(() => null);
      businessLogo = rawBusinessLogo ? await resolveImageToDataUrl(rawBusinessLogo) : null;
    }

    if (assetExportIncludeCustomerLogo && projectContext?.customerId) {
      const rawCustomerLogo = await customerService.getCustomers()
        .then((all) => all.find((customer) => customer.customerId === projectContext.customerId || customer.id === projectContext.customerId)?.logo ?? null)
        .catch(() => null);
      customerLogo = rawCustomerLogo ? await resolveImageToDataUrl(rawCustomerLogo) : null;
    }

    const metadata = assetExportIncludeProjectMeta
      ? [
          { label: "Customer", value: projectContext?.customerName || (customerNames.length === 1 ? customerNames[0] : customerNames.length > 1 ? "Multiple customers" : "-") },
          { label: "Project Number", value: projectContext?.jobNumber || (displayAssets.length > 0 ? `${new Set(displayAssets.map((asset) => asset.projectId)).size} project(s)` : "-") },
          { label: "Project Manager", value: projectContext?.projectManager || "-" },
          { label: "Start Date", value: projectContext?.startDate || "-" },
          { label: "Product", value: activeProduct?.name || (productNames.length === 1 ? productNames[0] : productNames.length > 1 ? productNames.join(", ") : "-") },
          { label: "Export Date", value: exportDateDisplay },
          { label: "Filters", value: filtersSummary || "Current view" },
        ]
      : [];

    const rows = displayAssets.map((asset) => selectedColumns.map((column) => column.valueFor(asset)));
    const modeLabel = "Operations";

    return {
      filenameBase: `project-assets-${assetExportMode}-${exportDate.toISOString().slice(0, 10)}`,
      title: `${modeLabel} Asset Export`,
      subtitle: `${displayAssets.length} row(s) | ${filtersSummary || "Current view"}`,
      exportDateDisplay,
      columns: selectedColumns,
      rows,
      metadata,
      businessLogo,
      customerLogo,
      modeLabel,
    };
  }

  function normalizeExcelHeaderLabel(label: string) {
    const clean = label.replace(/\s+/g, " ").trim();
    if (!clean) return clean;
    if (clean.includes(" - ")) {
      const parts = clean.split(" - ");
      if (parts.length >= 2) return `${parts[0]}
${parts.slice(1).join(" - ")}`;
    }
    const words = clean.split(" ");
    if (words.length <= 2) return clean;
    const midpoint = Math.ceil(words.length / 2);
    return `${words.slice(0, midpoint).join(" ")}
${words.slice(midpoint).join(" ")}`;
  }

  function buildAssetExportGroupSpans(columns: Awaited<ReturnType<typeof buildAssetExportPackage>>["columns"]) {
    const spans: { label: string; note: string; start: number; end: number }[] = [];
    columns.forEach((column, index) => {
      const label = column.groupLabel || "DATA";
      const note = column.noteLabel || "";
      const previous = spans[spans.length - 1];
      if (previous && previous.label === label && previous.note === note) {
        previous.end = index;
      } else {
        spans.push({ label, note, start: index, end: index });
      }
    });
    return spans;
  }

  function exportGroupPalette(label: string, index: number) {
    const normalized = label.trim().toUpperCase();
    if (normalized.includes("ASSET") || normalized.includes("JOB")) {
      return { header: "1F4E78", note: "DCE6F1", field: "2F75B5", body: "EEF5FB", bodyAlt: "E6F0F8", text: "163447" };
    }
    if (normalized.includes("WORKFLOW")) {
      return { header: "1D6F68", note: "D9F0EC", field: "2B8C82", body: "ECF8F5", bodyAlt: "E2F3EF", text: "154C47" };
    }
    if (normalized.includes("GENERAL")) {
      return { header: "5B6576", note: "E9EDF2", field: "758195", body: "F5F7FA", bodyAlt: "EDF1F5", text: "3E4A59" };
    }
    const palettes = [
      { header: "2F5597", note: "E6ECF8", field: "4472C4", body: "EEF3FD", bodyAlt: "E4ECFA", text: "203864" },
      { header: "287271", note: "E3F1F0", field: "2F8F9D", body: "ECF8FA", bodyAlt: "E2F1F4", text: "174B4A" },
      { header: "7A5C2E", note: "F6EDDD", field: "A67C32", body: "FBF5E8", bodyAlt: "F7EFDF", text: "5E451E" },
      { header: "556B7B", note: "E9EEF2", field: "6C7F90", body: "F2F6F9", bodyAlt: "EAF0F4", text: "394955" },
    ];
    return palettes[index % palettes.length];
  }

  function buildAssetExportWorkbook(report: Awaited<ReturnType<typeof buildAssetExportPackage>>) {
    const workbook = XLSX.utils.book_new();
    const normalizedHeaders = report.columns.map((column) => normalizeExcelHeaderLabel(column.headerLabel ?? column.label));
    const noteLabels = report.columns.map((column) => column.noteLabel || "");
    const groupSpans = buildAssetExportGroupSpans(report.columns).map((span, index) => ({
      ...span,
      palette: exportGroupPalette(span.label, index),
    }));
    const columnPalettes = report.columns.map((column, index) => {
      const span = groupSpans.find((candidate) => index >= candidate.start && index <= candidate.end);
      return span?.palette ?? exportGroupPalette(column.groupLabel || "DATA", index);
    });
    const metadataSummary = report.metadata.map((item) => `${item.label}: ${item.value}`).join(" | ");
    const totalColumns = Math.max(report.columns.length, 1);

    const sheetRows: (string | number)[][] = [
      [report.title, ...Array.from({ length: totalColumns - 1 }, () => "")],
      [report.subtitle, ...Array.from({ length: totalColumns - 1 }, () => "")],
      [metadataSummary || `Generated ${report.exportDateDisplay}`, ...Array.from({ length: totalColumns - 1 }, () => "")],
      report.columns.map(() => ""),
      noteLabels,
      normalizedHeaders,
      ...report.rows,
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
    const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: totalColumns - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: totalColumns - 1 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: totalColumns - 1 } },
    ];

    groupSpans.forEach((span) => {
      worksheet[XLSX.utils.encode_cell({ r: 3, c: span.start })] = { t: "s", v: span.label };
      if (span.start !== span.end) {
        merges.push({ s: { r: 3, c: span.start }, e: { r: 3, c: span.end } });
      }
    });
    worksheet["!merges"] = merges;

    worksheet["!cols"] = normalizedHeaders.map((header, index) => {
      const headerLines = header.split("\n");
      const headerWidth = Math.max(...headerLines.map((line) => line.length));
      const values = report.rows.map((row) => String(row[index] ?? ""));
      const longestValue = values.reduce((max, value) => Math.max(max, value.length), headerWidth);
      const minWidth = index < 12 ? 12 : 14;
      return { wch: Math.min(Math.max(longestValue + 3, minWidth), 26) };
    });

    worksheet["!rows"] = [
      { hpt: 24 },
      { hpt: 18 },
      { hpt: 20 },
      { hpt: 22 },
      { hpt: 18 },
      { hpt: 42 },
      ...report.rows.map(() => ({ hpt: 20 })),
    ];
    worksheet["!freeze"] = { xSplit: Math.min(2, totalColumns), ySplit: 6 };
    worksheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 5, c: 0 }, e: { r: Math.max(sheetRows.length - 1, 5), c: totalColumns - 1 } }) };

    const setCellStyle = (ref: string, style: Record<string, unknown>) => {
      const cell = worksheet[ref];
      if (!cell) return;
      cell.s = style;
    };

    const applyBoxBorder = (rgb: string) => ({
      top: { style: "thin", color: { rgb } },
      bottom: { style: "thin", color: { rgb } },
      left: { style: "thin", color: { rgb } },
      right: { style: "thin", color: { rgb } },
    });

    setCellStyle(XLSX.utils.encode_cell({ r: 0, c: 0 }), {
      font: { bold: true, sz: 16, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "163447" } },
      alignment: { horizontal: "center", vertical: "center" },
    });
    setCellStyle(XLSX.utils.encode_cell({ r: 1, c: 0 }), {
      font: { bold: true, sz: 10, color: { rgb: "163447" } },
      fill: { fgColor: { rgb: "DCE6F1" } },
      alignment: { horizontal: "center", vertical: "center" },
    });
    setCellStyle(XLSX.utils.encode_cell({ r: 2, c: 0 }), {
      font: { italic: true, sz: 9, color: { rgb: "587082" } },
      fill: { fgColor: { rgb: "EEF4F7" } },
      alignment: { horizontal: "left", vertical: "center" },
    });

    groupSpans.forEach((span) => {
      setCellStyle(XLSX.utils.encode_cell({ r: 3, c: span.start }), {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: span.palette.header } },
        alignment: { horizontal: "center", vertical: "center" },
        border: applyBoxBorder(span.palette.header),
      });
    });

    for (let col = 0; col < totalColumns; col += 1) {
      const palette = columnPalettes[col];
      setCellStyle(XLSX.utils.encode_cell({ r: 4, c: col }), {
        font: { italic: true, sz: 9, color: { rgb: noteLabels[col] ? palette.text : "8EA0AF" } },
        fill: { fgColor: { rgb: palette.note } },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
        border: applyBoxBorder(palette.header),
      });
      setCellStyle(XLSX.utils.encode_cell({ r: 5, c: col }), {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: palette.field } },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
        border: applyBoxBorder(palette.header),
      });
    }

    for (let row = 6; row < sheetRows.length; row += 1) {
      const isEven = (row - 6) % 2 === 0;
      for (let col = 0; col < totalColumns; col += 1) {
        const palette = columnPalettes[col];
        setCellStyle(XLSX.utils.encode_cell({ r: row, c: col }), {
          fill: { fgColor: { rgb: isEven ? palette.body : palette.bodyAlt } },
          alignment: { vertical: "top", wrapText: true },
          border: applyBoxBorder("D5DEE5"),
        });
      }
    }

    XLSX.utils.book_append_sheet(workbook, worksheet, report.modeLabel === "Capture" ? "Capture Table" : "Asset Export");
    const legendSheet = XLSX.utils.aoa_to_sheet([
      ["Legend"],
      ["Dark band", "Column group / feature group"],
      ["Tinted note row", "Business part number or group note when available"],
      ["Colored field row", "Field names"],
    ]);
    XLSX.utils.book_append_sheet(workbook, legendSheet, "Legend");
    return workbook;
  }

  function buildAssetExportHtml(report: Awaited<ReturnType<typeof buildAssetExportPackage>>, options: { excel: boolean }) {
    const logoCell = (src: string | null, fallback: string) => src
      ? `<div class="logo-slot"><img src="${src}" alt="${escapeHtml(fallback)}" /></div>`
      : `<div class="logo-slot logo-fallback">${escapeHtml(fallback)}</div>`;

    const metadataHtml = report.metadata.length > 0
      ? `<section class="meta-grid">${report.metadata.map((item) => `<div class="meta-card"><div class="meta-label">${escapeHtml(item.label)}</div><div class="meta-value">${escapeHtml(item.value)}</div></div>`).join("")}</section>`
      : "";

    const groupSpans = buildAssetExportGroupSpans(report.columns).map((span, index) => ({
      ...span,
      palette: exportGroupPalette(span.label, index),
    }));
    const columnPalettes = report.columns.map((column, index) => {
      const span = groupSpans.find((candidate) => index >= candidate.start && index <= candidate.end);
      return span?.palette ?? exportGroupPalette(column.groupLabel || "DATA", index);
    });
    const groupCells = groupSpans
      .map((group) => `<th class="group-cell" colspan="${group.end - group.start + 1}" style="background:#${group.palette.header};border-color:#${group.palette.header};">${escapeHtml(group.label)}</th>`)
      .join("");
    const noteCells = groupSpans
      .map((group) => `<th class="note-cell" colspan="${group.end - group.start + 1}" style="background:#${group.palette.note};border-color:#${group.palette.header};color:#${group.palette.text};">${group.note ? escapeHtml(group.note) : "&nbsp;"}</th>`)
      .join("");
    const headerCells = report.columns
      .map((column, index) => `<th class="field-cell" style="background:#${columnPalettes[index].field};border-color:#${columnPalettes[index].header};">${escapeHtml(normalizeExcelHeaderLabel(column.headerLabel ?? column.label)).replace(/\n/g, "<br />")}</th>`)
      .join("");
    const rowsHtml = report.rows.map((row, rowIndex) => `<tr>${row.map((cell, index) => `<td style="background:#${rowIndex % 2 === 0 ? columnPalettes[index].body : columnPalettes[index].bodyAlt};color:#${columnPalettes[index].text};">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");

    return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(report.title)}</title><style>
      body{font-family:Segoe UI,Arial,sans-serif;margin:0;padding:20px;background:${options.excel ? "#ffffff" : "#f3f7fa"};color:#102027}
      .sheet{max-width:1700px;margin:0 auto;background:#fff;border:1px solid #c7d1db;box-shadow:${options.excel ? "none" : "0 12px 40px rgba(16,32,39,0.12)"}}
      .hero{display:grid;grid-template-columns:180px 1fr 180px;gap:16px;align-items:center;padding:20px 24px;background:linear-gradient(135deg,#163447 0%,#28536b 100%);color:#f5fbff;border-bottom:4px solid #2bb3a3}
      .title-block h1{margin:0;font-size:24px;letter-spacing:.02em}
      .title-block p{margin:6px 0 0;font-size:12px;color:#d6e5ee}
      .logo-slot{height:72px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.2);border-radius:10px;background:rgba(255,255,255,0.08);overflow:hidden}
      .logo-slot img{max-width:100%;max-height:64px;object-fit:contain}
      .logo-fallback{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#d6e5ee}
      .meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;padding:18px 24px;background:#eef4f7;border-bottom:1px solid #d5dee5}
      .meta-card{padding:10px 12px;border:1px solid #d4dde5;border-radius:8px;background:#fff}
      .meta-label{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#587082;margin-bottom:4px}
      .meta-value{font-size:13px;font-weight:600;color:#102027;white-space:pre-wrap}
      .table-wrap{padding:18px 24px 24px;overflow:auto}
      table{border-collapse:collapse;width:100%;table-layout:auto;min-width:1200px}
      th,td{border:1px solid #c7d1db;padding:7px 9px;font-size:11px;vertical-align:top;text-align:left;word-break:break-word}
      .group-cell{color:#f4fbff;font-weight:700;text-align:center;font-size:13px}
      .note-cell{font-style:italic;font-size:9px;text-align:center}
      .field-cell{color:#fff;font-weight:700;line-height:1.35;text-align:center;min-width:92px}
      td{color:#102027}
      .footer-note{padding:0 24px 18px;color:#587082;font-size:11px}
    </style></head><body><div class="sheet"><section class="hero">${logoCell(report.businessLogo, "Business Logo")}
      <div class="title-block"><h1>${escapeHtml(report.title)}</h1><p>${escapeHtml(report.subtitle)}</p></div>
      ${logoCell(report.customerLogo, "Customer Logo")}</section>${metadataHtml}<section class="table-wrap"><table><thead><tr>${groupCells}</tr><tr>${noteCells}</tr><tr>${headerCells}</tr></thead><tbody>${rowsHtml}</tbody></table></section><div class="footer-note">Generated ${escapeHtml(report.exportDateDisplay)}</div></div></body></html>`;
  }

  async function exportAssetDataset() {
    if (assetExportSelectedColumnIds.length === 0) {
      alert("Select at least one column to export.");
      return;
    }

    setAssetExportRunning(true);
    try {
      const report = await buildAssetExportPackage();
      if (assetExportFormat === "json") {
        downloadBlob(
          new Blob([JSON.stringify({
            exportedAt: report.exportDateDisplay,
            mode: report.modeLabel,
            metadata: report.metadata,
            logos: {
              business: assetExportIncludeBusinessLogo ? report.businessLogo : null,
              customer: assetExportIncludeCustomerLogo ? report.customerLogo : null,
            },
            columns: report.columns.map((column) => column.label),
            rows: report.rows.map((row) => Object.fromEntries(report.columns.map((column, index) => [column.label, row[index] ?? ""]))),
          }, null, 2)], { type: "application/json" }),
          `${report.filenameBase}.json`,
        );
      } else if (assetExportFormat === "excel") {
        const workbook = buildAssetExportWorkbook(report);
        XLSX.writeFile(workbook, `${report.filenameBase}.xlsx`);
      } else {
        const pdfHtml = buildAssetExportHtml(report, { excel: false });
        openPrintWindow(pdfHtml, true);
      }
      setAssetExportDialogOpen(false);
    } catch (error) {
      console.error("[AssetInstallationPage] asset export failed", error);
      alert(error instanceof Error ? error.message : "Failed to export assets.");
    } finally {
      setAssetExportRunning(false);
    }
  }

  function closeReportExportDialog() {
    setReportExportOpen(false);
    setReportExportAsset(null);
    setReportPreviewContext(null);
    setReportPreviewFileBase(null);
    setReportPreviewError(null);
    setReportPreviewLoading(false);
    if (reportPreviewUrl) URL.revokeObjectURL(reportPreviewUrl);
    setReportPreviewUrl(null);
  }

  async function openReportExportDialog(asset: ProjectAsset) {
    setReportExportAsset(asset);
    setReportPreviewContext(null);
    setReportPreviewFileBase(null);
    setReportPreviewError(null);
    setReportPreviewLoading(true);
    if (reportPreviewUrl) URL.revokeObjectURL(reportPreviewUrl);
    setReportPreviewUrl(null);
    setReportExportOpen(true);
    try {
      const reportContext = await buildAssetReportContext(asset);
      const fileBase = workflowReportBaseFileName(reportContext.asset, reportContext.run);
      const pdfBlob = await generateWorkflowReport({
        ...reportContext,
        outputMode: "blob",
      });
      if (!(pdfBlob instanceof Blob)) {
        throw new Error("Failed to build PDF preview.");
      }
      setReportPreviewContext(reportContext);
      setReportPreviewFileBase(fileBase);
      setReportPreviewUrl(URL.createObjectURL(pdfBlob));
    } catch (err) {
      console.error("[AssetInstallationPage] Report preview failed", err);
      setReportPreviewError("Failed to load PDF preview.");
    } finally {
      setReportPreviewLoading(false);
    }
  }

  async function buildAssetReportContext(asset: ProjectAsset): Promise<WorkflowReportExportContext> {
    let runs = runsMap[asset.id];
    if (!runs) {
      try { runs = await assetWorkflowRunService.listByAsset(asset.id); } catch { runs = []; }
    }

    const sorted = [...(runs ?? [])].sort((a, b) => (b.runNumber ?? 0) - (a.runNumber ?? 0));
    const run = sorted.find((r) => r.isLocked) ?? sorted[0] ?? null;

    const effectiveRun: AssetWorkflowRun = run ?? {
      id: "", assetId: asset.id,
      workflowConfigId: asset.productConfigId ?? "",
      workflowVersion: 1, workflowSnapshotJson: "{}",
      status: "InProgress", isLocked: false,
      stepResultsJson: "[]", issuesJson: "[]", timeTrackingJson: "[]",
      productiveSeconds: 0, downtimeSeconds: 0, downtimeEvents: 0,
      runNumber: 1, startedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      signatureStatus: "None",
    };

    const configId = effectiveRun.workflowConfigId || asset.productConfigId;
    const wfCfg = configId ? wfConfigMap.get(configId) : null;
    const configName = wfCfg?.displayName ?? wfCfg?.name ?? "Installation Record";
    const cfgType = (wfCfg?.configType ?? "").trim().toLowerCase();
    const docType = cfgType === "inspection" || cfgType === "wftype-inspection" ? "inspection" as const : "installation" as const;
    const tech = users.find((u) => u.id === asset.assignedUserId);
    const proj = projects.find((p) => p.id === asset.projectId);

    let rawCustomerLogo: string | null = null;
    if (proj?.customerId) {
      try {
        const allCustomers = await customerService.getCustomers();
        rawCustomerLogo = allCustomers.find((c) => c.customerId === proj.customerId || c.id === proj.customerId)?.logo ?? null;
      } catch { /* ignore */ }
    }

    const [brandSettings, signatureEvents, productFeatures] = await Promise.all([
      brandSettingsService.get(),
      effectiveRun.isLocked && effectiveRun.id
        ? signatureService.listEvents(effectiveRun.id).catch(() => [])
        : Promise.resolve([]),
      asset.productId
        ? featureService.getByProduct(asset.productId).catch(() => [] as LibFeature[])
        : Promise.resolve([] as LibFeature[]),
    ]);
    const [bizLogoResolved, custLogoResolved] = await Promise.all([
      brandSettings.logoBase64 ? resolveImageToDataUrl(brandSettings.logoBase64) : Promise.resolve(null),
      rawCustomerLogo ? resolveImageToDataUrl(rawCustomerLogo) : Promise.resolve(null),
    ]);

    const reportRun = isMobileNativePlatform()
      ? await mediaStore.resolveUploadPayload(effectiveRun)
      : effectiveRun;

    return {
      run: reportRun,
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
      timeZoneId: resolveReportTimeZone(proj),
      signatureEvents,
      productFeatures,
    };
  }

  async function handleAssetReportExport(format: "pdf" | "json" | "docx") {
    const asset = reportExportAsset;
    if (!asset) return;
    setReportGenerating(asset.id);
    try {
      const reportContext = reportPreviewContext ?? await buildAssetReportContext(asset);
      const fileBase = reportPreviewFileBase ?? workflowReportBaseFileName(reportContext.asset, reportContext.run);

      if (format === "pdf") {
        await generateWorkflowReport({
          ...reportContext,
          outputMode: "download",
        });
        return;
      }

      if (format === "json") {
        const rawJson = JSON.stringify(buildWorkflowReportJson(reportContext), null, 2);
        downloadBlob(new Blob([rawJson], { type: "application/json" }), `${fileBase}.json`);
        return;
      }

      const docxBlob = await createWorkflowReportDocx(reportContext);
      downloadBlob(docxBlob, `${fileBase}.docx`);
    } catch (err) {
      console.error("[AssetInstallationPage] Report export failed", err);
      alert("Failed to export report.");
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
    markWorkflowOpenTap("assets-rerun", configId);
    setRunHistoryOpen(false);

    setRunnerLoading(asset.id);
    try {
      const cfgFromMemory = wfConfigMap.get(configId) ?? null;
      const payload = await loadWorkflowOpenPayload(configId, asset, {
        configFromMemory: cfgFromMemory,
        mergeMedia: true,
      });
      if (!payload) { alert("Workflow config not found."); return; }

      setRunnerPrefillValues(prefillValues);
      setRunnerExistingRunId(undefined);
      setRunnerAsset(asset);
      setRunnerWorkflow(payload.workflow);
      setRunnerWorkflowConfigId(configId);
      setRunnerFeatureSelections(parseFeatureSelectionsForConfig(configId));
      setRunnerOpen(true);
      refreshWorkflowOpenDataInBackground(asset.id, configId);
      // Optimistically mark asset as InProgress so the Continue button shows if the user pauses
      setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, status: "InProgress" as const } : a));
    } catch { alert("Failed to load workflow."); } finally {
      setRunnerLoading(null);
    }
  }

  async function handleContinueRun(run: AssetWorkflowRun) {
    const asset = runHistoryAsset;
    if (!asset) return;
    markWorkflowOpenTap("assets-continue", run.workflowConfigId);
    setRunHistoryOpen(false);
    setRunnerLoading(asset.id);
    try {
      const cfgFromMemory = wfConfigMap.get(run.workflowConfigId) ?? null;
      const payload = await loadWorkflowOpenPayload(run.workflowConfigId, asset, {
        configFromMemory: cfgFromMemory,
        runs: runsMap[asset.id],
        mergeMedia: true,
      });
      if (!payload) { alert("Workflow config not found."); return; }

      setRunnerExistingRunId(run.id);
      setRunnerAsset(asset);
      setRunnerWorkflow(payload.workflow);
      setRunnerWorkflowConfigId(run.workflowConfigId);
      setRunnerFeatureSelections(parseFeatureSelectionsForConfig(run.workflowConfigId));
      setRunnerOpen(true);
      refreshWorkflowOpenDataInBackground(asset.id, run.workflowConfigId);
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
    if (openIssues.length === 0 && (asset.status === "Complete" || asset.status === "Closed")) return "green";
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
                      const newComment = { id: randomId(), text, author: currentUser?.fullName ?? "User", createdAt: new Date().toISOString() };
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
    // PHASE 2: the DECISION (which action) now comes from the shared
    // getWorkflowDisplayState so the Assets page, Dashboard and Run History
    // dialog can converge on one implementation. This adapter maps the shared
    // function's action.kind back to the local onClick/icon/variant (which
    // close over component state and must stay here). getAssetAttentionSummary
    // is retained as the source for the `hasRunnableWorkflowSource` /
    // inspection inputs and is NOT removed until all three surfaces are on the
    // shared function (staged deletion, Phase 5).
    const loading = runnerLoading === asset.id;
    const assignments = assignmentsMap[asset.id];
    const summary = getAssetAttentionSummary(asset);
    const inspectionEnabled = projectHasInspection(projectWorkflowMode);
    const hasRunnableWorkflowSource = assignments !== undefined
      ? (assignments.length > 0 || !!asset.productConfigId || !!asset.workflowTemplateId)
      : (!!asset.productConfigId || !!asset.workflowTemplateId || !!asset.workflowSummary?.hasWorkflow);
    const openImportDialog = () => setImportDialogAsset(asset);

    const runs = getSortedRuns(asset.id);
    const ds = getWorkflowDisplayState(asset, runs, {
      paused: summary.paused,
      inspectionMode: inspectionEnabled,
      hasRunnableWorkflowSource,
    });

    if (!ds.action || ds.action.kind === "none") return null;

    const playIcon = loading ? <CircularProgress size={12} /> : <PlayArrowOutlined />;
    // Map action.kind → local handler + icon + variant. Labels/tooltips/colors
    // come straight from the shared function.
    const base = { label: ds.action.label, tooltip: ds.action.tooltip, color: ds.action.color };
    switch (ds.action.kind) {
      case "upload-json":
        return { ...base, icon: <FileUploadOutlined />, onClick: openImportDialog, variant: "outlined" };
      case "start":
        return { ...base, icon: playIcon, onClick: () => checkAssignmentThenStart(asset), variant: "outlined" };
      case "resume":
        return { ...base, icon: playIcon, onClick: () => checkAssignmentThenStart(asset), variant: "outlined" };
      case "continue":
        return { ...base, icon: playIcon, onClick: () => checkAssignmentThenStart(asset), variant: "outlined" };
      case "add-missing-photos":
        return { ...base, icon: <PhotoCameraOutlined />, onClick: () => openMissingMediaDialog(asset, summary.latestRun), variant: "outlined" };
      case "resolve-blocking":
        return { ...base, icon: <ReportProblemOutlined />, onClick: () => summary.latestRun ? openBlockingIssue(asset) : void startAssetFromBestWorkflowSource(asset), variant: "outlined" };
      case "installer-sign":
      case "customer-sign":
        return { ...base, icon: <DrawOutlined />, onClick: () => openRunHistory(asset, undefined, undefined, "customer-sign"), variant: "outlined" };
      case "run-details":
        return { ...base, icon: <HistoryOutlined />, onClick: () => openRunHistory(asset), variant: "text" };
      case "no-workflow":
        return null;
      default:
        return null;
    }
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
    if (!primaryAction) return <Typography variant="caption" sx={{ color: "#5a6b7a" }}>No workflow</Typography>;
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

  function captureTableStatusChip(asset: ProjectAsset, projectWorkflowMode?: string | null) {
    const status = asset.status as ProjectAssetStatus;
    const baseColor = STATUS_COLORS[status] ?? "default";
    const runs = runsMap[asset.id] ?? [];
    const issueHealth = computeAssetHealth(asset, runs);
    const rowDisplayState = getWorkflowDisplayState(asset, runs, {
      paused: Boolean(pausedProgress[asset.id]),
      inspectionMode: projectHasInspection(projectWorkflowMode),
      hasRunnableWorkflowSource:
        (assignmentsMap[asset.id]?.length ?? 0) > 0
        || !!asset.productConfigId
        || !!asset.workflowTemplateId
        || !!asset.workflowSummary?.hasWorkflow,
    });
    const chipColor =
      status === "Cancelled" ? "error"
      : issueHealth === "red" ? "error"
      : issueHealth === "amber" ? "warning"
      : issueHealth === "green" ? "success"
      : baseColor;

    return (
      <Chip
        size="small"
        label={rowDisplayState.status.label}
        color={chipColor}
        icon={
          asset.status === "InProgress" ? <HourglassEmptyOutlined sx={{ fontSize: "0.9rem !important" }} />
          : (asset.status === "Complete" || asset.status === "Closed") ? <CheckCircleOutlined sx={{ fontSize: "0.9rem !important" }} />
          : asset.status === "Issue" ? <ErrorOutlined sx={{ fontSize: "0.9rem !important" }} />
          : undefined
        }
      />
    );
  }

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

    // Feature widgets (Phase 2): issue/observation/missing-media indicators from
    // the shared display state. Stacked; resolved ones render dimmed so the
    // record stays visible (R1). Colors: yellow(camera/medium), grey(low),
    // red(blocking), orange(high-observation).
    const dsWidgets = getWorkflowDisplayState(asset, runsMap[asset.id] ?? [], {
      paused,
      inspectionMode: false,
      hasRunnableWorkflowSource: true,
    }).feature.widgets;

    const widgetColorHex: Record<string, string> = {
      yellow: "#d79b24", grey: "#8a9ba8", red: "#d32f2f", orange: "#e8833a",
    };

    return (
      <Tooltip title={`${total === 0 ? "No inventory features selected on this workflow." : `Inventory features ${filled}/${total}.`} ${evidenceTitle}.`}>
        <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" alignItems="center">
          <Chip size="small" label={`${filled}/${total} inv`}
            color={inventoryColor as "success" | "warning" | "default"}
            variant={inventoryVariant} />
          <Chip size="small" label={evidenceLabel} color={evidenceColor} variant="outlined" />
          {dsWidgets.map((w) => {
            const totalCount = w.openCount + w.resolvedCount;
            const allResolved = w.openCount === 0 && w.resolvedCount > 0;
            const Icon = w.icon === "camera" ? PhotoCameraOutlined : ReportProblemOutlined;
            const hex = widgetColorHex[w.color] ?? "#8a9ba8";
            const title = w.kind === "missing-photo" ? `${totalCount} missing photo${totalCount !== 1 ? "s" : ""}`
              : w.kind === "issue-high-blocking" ? `${w.openCount} open / ${w.resolvedCount} resolved blocking issue(s)`
              : w.kind === "high-observation" ? `${w.openCount} open / ${w.resolvedCount} resolved high observation(s)`
              : w.kind === "issue-medium" ? `${w.openCount} open / ${w.resolvedCount} resolved medium issue(s)`
              : `${w.openCount} open / ${w.resolvedCount} resolved low issue(s)`;
            return (
              <Tooltip key={w.kind} title={title}>
                <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.25, opacity: allResolved ? 0.4 : 1 }}>
                  <Icon sx={{ fontSize: 15, color: hex }} />
                  {totalCount > 1 && <Typography component="span" sx={{ fontSize: 10, fontWeight: 700, color: hex }}>{totalCount}</Typography>}
                </Box>
              </Tooltip>
            );
          })}
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
      case "configName": {
        const cfgName = cfg?.name
          || (asset.productConfigId ? wfConfigMap.get(asset.productConfigId)?.name : undefined);
        return <Typography variant="body2" color="text.secondary">{cfgName || "-"}</Typography>;
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
        return captureTableStatusChip(asset, proj?.workflowMode);
      default:
        return null;
    }
  }

  function renderOperationsAssetRows(asset: ProjectAsset): [React.ReactNode, React.ReactNode] {
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
            {(canRunAssetWorkflow || asset.status === "Complete" || asset.status === "Closed" || asset.status === "Cancelled") && actionButton(asset, proj?.workflowMode)}
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
              <Tooltip title="View/Export report">
                <span>
                  <IconButton
                    size="small"
                    disabled={reportGenerating === asset.id}
                    onClick={() => openReportExportDialog(asset)}
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
            {!((canRunAssetWorkflow || asset.status === "Complete" || asset.status === "Closed" || asset.status === "Cancelled")
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

  const isEditAssetCancelled = editAsset?.status === "Cancelled";

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
          {showAdvancedAssetActions && can.modifyData && !!activeProduct && (
            <Tooltip title={`Open the workflow builder for ${activeProduct.name}`}>
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
          {showAdvancedAssetActions && can.modifyData && !!activeProduct && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<FileUploadOutlined />}
              onClick={() => {
                workflowConfigService.listByProduct(activeProduct.id, "Published").then(setWorkflowConfigs);
                setCsvImportOpen(true);
              }}
            >
              Import CSV
            </Button>
          )}
          {showAdvancedAssetActions && can.modifyData && !!activeProduct && (
            <Button variant="contained" startIcon={<AddOutlined />} onClick={openAdd}>Add asset</Button>
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
                {activeHealth.closed > 0 && <Chip size="small" label={`${activeHealth.closed} Closed`} color="info" sx={{ height: 18, fontSize: 10 }} />}
                {activeHealth.inProgress > 0 && <Chip size="small" label={`${activeHealth.inProgress} In Progress`} color="primary" sx={{ height: 18, fontSize: 10 }} />}
                {activeHealth.paused > 0 && <Chip size="small" label={`${activeHealth.paused} Paused`} color="warning" sx={{ height: 18, fontSize: 10 }} />}
                {activeHealth.pending > 0 && <Chip size="small" label={`${activeHealth.pending} Pending`} color="warning" sx={{ height: 18, fontSize: 10 }} />}
                {activeHealth.issue > 0 && <Chip size="small" label={`${activeHealth.issue} Issue`} color="error" sx={{ height: 18, fontSize: 10 }} />}
                <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>
                  {activeHealth.total > 0 ? Math.round(((activeHealth.complete + activeHealth.closed) / activeHealth.total) * 100) : 0}%
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
                {activeHealth.closed > 0 && (
                  <Chip size="small" label={`${activeHealth.closed} Closed`} color="info" />
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
                  value={activeHealth.total > 0 ? ((activeHealth.complete + activeHealth.closed) / activeHealth.total) * 100 : 0}
                  color={activeHealth.issue > 0 ? "error" : "success"}
                  sx={{ height: 6, borderRadius: 1 }}
                />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                {activeHealth.total > 0 ? Math.round(((activeHealth.complete + activeHealth.closed) / activeHealth.total) * 100) : 0}% field work complete
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
      {isNativePlatform ? (
        <Stack spacing={0.75}>
          {/* Row 1: project picker + search */}
          <Stack direction="row" spacing={1} alignItems="center">
            <ProjectJobSelect
              projects={productProjects}
              value={selectedProjectId}
              onChange={handleProjectChange}
              labelStyle="mobile"
              sx={{ flex: 1 }}
            />
            <IconButton
              size="small"
              onClick={() => { setAssetSearchQuery(""); setAssetSearchOpen(true); }}
              sx={{ border: "1px solid", borderColor: search ? "primary.main" : "divider", borderRadius: 1, color: search ? "primary.main" : "text.secondary", p: 0.75, flexShrink: 0 }}
            >
              <SearchOutlined sx={{ fontSize: 20 }} />
            </IconButton>
            {canViewCaptureMatrix && activeProduct && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<GridOnOutlined sx={{ fontSize: 16 }} />}
                onClick={() => setCapturePopupOpen(true)}
                sx={{ flexShrink: 0, fontSize: 11, whiteSpace: "nowrap" }}
              >
                Table view
              </Button>
            )}
          </Stack>
          {/* Row 2: My/All scope toggle */}
          <ToggleButtonGroup
            value={mobileScope}
            exclusive
            size="small"
            onChange={(_, v) => { if (v) setMobileScope(v as "mine" | "all"); }}
            sx={{ alignSelf: "flex-start" }}
          >
            <ToggleButton value="mine" sx={{ fontSize: 11, py: 0.4, px: 1.25 }}>My Assets</ToggleButton>
            <ToggleButton value="all" sx={{ fontSize: 11, py: 0.4, px: 1.25 }}>All Assets</ToggleButton>
          </ToggleButtonGroup>
          {/* Row 3: status chips */}
          <Box sx={{ overflowX: "auto", pb: 0.25, mx: -0.25 }}>
            <Stack direction="row" spacing={0.6} sx={{ width: "max-content", px: 0.25 }}>
              {([
                { value: "All",        label: "All",         color: "default"  },
                { value: "NotStarted", label: "Not Started", color: "default"  },
                { value: "InProgress", label: "In Progress", color: "primary"  },
                { value: "Paused",     label: "Paused",      color: "warning"  },
                { value: "Pending",    label: "Pending",     color: "default"  },
                { value: "Complete",   label: "Complete",    color: "success"  },
                { value: "Closed",     label: "Closed",      color: "info"     },
                { value: "Issue",      label: "Issue",       color: "error"    },
              ] as const).map(({ value, label, color }) => (
                <Chip
                  key={value}
                  label={label}
                  size="small"
                  color={statusFilter === value ? (color as "default" | "primary" | "success" | "error" | "warning" | "info") : "default"}
                  variant={statusFilter === value ? "filled" : "outlined"}
                  clickable
                  onClick={() => { setStatusFilter(value as ProjectAssetStatus | "All"); setShowNoWorkflow(false); }}
                  sx={{ fontSize: 11, height: 26 }}
                />
              ))}
              <Chip
                label="No Workflow"
                size="small"
                color={showNoWorkflow ? "warning" : "default"}
                variant={showNoWorkflow ? "filled" : "outlined"}
                clickable
                onClick={() => { setShowNoWorkflow((v) => !v); if (!showNoWorkflow) setStatusFilter("All"); }}
                sx={{ fontSize: 11, height: 26 }}
              />
            </Stack>
          </Box>
        </Stack>
      ) : (
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <ProjectJobSelect
            projects={productProjects}
            value={selectedProjectId}
            onChange={handleProjectChange}
            labelStyle="desktop"
          />
          <Button
            size="small"
            variant={allProjectsExplicit ? "contained" : "outlined"}
            onClick={() => handleProjectChange("")}
            sx={{ whiteSpace: "nowrap", height: 40 }}
          >
            All projects
          </Button>
          <Tooltip title={statusFilter !== "All" ? "Reset status filter to use this" : ""}>
            <span>
              <Button
                size="small"
                variant={showNoWorkflow ? "contained" : "outlined"}
                color={showNoWorkflow ? "warning" : "inherit"}
                disabled={statusFilter !== "All"}
                onClick={() => setShowNoWorkflow((v) => !v)}
                sx={{ whiteSpace: "nowrap", height: 40 }}
              >
                No Workflow
              </Button>
            </span>
          </Tooltip>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel shrink>Status</InputLabel>
            <Select
              label="Status"
              value={statusFilter}
              disabled={showNoWorkflow}
              onChange={(e) => setStatusFilter(e.target.value as ProjectAssetStatus | "All")}
            >
              <MenuItem value="All">All statuses</MenuItem>
              <MenuItem value="NotStarted">Not Started</MenuItem>
              <MenuItem value="InProgress">In Progress</MenuItem>
              <MenuItem value="Paused">Paused</MenuItem>
              <MenuItem value="Pending">Pending</MenuItem>
              <MenuItem value="Complete">Complete</MenuItem>
              <MenuItem value="Closed">Closed</MenuItem>
              <MenuItem value="Issue">Issue</MenuItem>
              <MenuItem value="Cancelled">Cancelled</MenuItem>
            </Select>
          </FormControl>
          <Tooltip title="Search by asset tag, serial, part #, captures, or installer">
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
          {canViewCaptureMatrix && selectedProjectId && (
            // Plain link so ctrl/cmd-click opens the standalone matrix in its own tab.
            <Tooltip title="Open the full-job capture table. Ctrl/Cmd-click for a new tab.">
              <Button
                size="small"
                variant="outlined"
                component="a"
                href={`/installations/capture?project=${encodeURIComponent(selectedProjectId)}`}
                onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  navigate(`/installations/capture?project=${encodeURIComponent(selectedProjectId)}`);
                }}
                sx={{ fontSize: 11, py: 0.5, px: 1.25, whiteSpace: "nowrap" }}
              >
                Capture table
              </Button>
            </Tooltip>
          )}
        </Stack>
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
                a.status === "InProgress" || a.status === "Complete" || a.status === "Closed"
              );
              if (withWf.length === 0) { setBulkWfOpen(true); return; }
              setBulkWarnTitle("Some assets already have workflow assignments");
              setBulkWarnBody(
                "These assets already have one or more workflow assignments. Adding a new assignment will not remove existing ones. Assets that are in progress, complete, or closed may behave unexpectedly with additional assignments."
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

          {showBulkWorkflowReports && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<ArticleOutlined fontSize="small" />}
              onClick={() => setBulkWorkflowReportsOpen(true)}
            >
              View / Print Reports
            </Button>
          )}

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
              {showBulkWorkflowReports && (
                <Tooltip title={selectedAssetIds.size === 0 ? "Select one or more assets first" : "Preview and download workflow installation reports for selected assets"}>
                  <span>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<ArticleOutlined fontSize="small" />}
                      disabled={selectedAssetIds.size === 0}
                      onClick={() => setBulkWorkflowReportsOpen(true)}
                      sx={{ fontSize: 12 }}
                    >
                      View / Print Reports
                    </Button>
                  </span>
                </Tooltip>
              )}
              <Tooltip title="Export the current filtered asset view">
                <span>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<FileDownloadOutlined fontSize="small" />}
                    onClick={openAssetExportDialog}
                    disabled={displayAssets.length === 0}
                    sx={{ fontSize: 12 }}
                  >
                    Export
                  </Button>
                </span>
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
      <Dialog open={assetExportDialogOpen} onClose={() => !assetExportRunning && setAssetExportDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Export Assets</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="info">
              Export uses the current filtered operations view: {displayAssets.length} row(s)
            </Alert>

            <Stack direction={{ xs: "column", md: "row" }} spacing={3}>
              <FormControl sx={{ minWidth: 220 }}>
                <FormLabel>Format</FormLabel>
                <RadioGroup value={assetExportFormat} onChange={(event) => setAssetExportFormat(event.target.value as "pdf" | "json" | "excel") }>
                  <FormControlLabel value="pdf" control={<Radio />} label="PDF" />
                  <FormControlLabel value="excel" control={<Radio />} label="Excel (.xlsx)" />
                  <FormControlLabel value="json" control={<Radio />} label="JSON" />
                </RadioGroup>
              </FormControl>

              <FormControl sx={{ minWidth: 260 }}>
                <FormLabel>Report options</FormLabel>
                <FormGroup>
                  <FormControlLabel
                    control={<Checkbox checked={assetExportIncludeProjectMeta} onChange={(event) => setAssetExportIncludeProjectMeta(event.target.checked)} />}
                    label="Include project/customer metadata"
                  />
                  <FormControlLabel
                    control={<Checkbox checked={assetExportIncludeBusinessLogo} onChange={(event) => setAssetExportIncludeBusinessLogo(event.target.checked)} />}
                    label="Include business logo"
                  />
                  <FormControlLabel
                    control={<Checkbox checked={assetExportIncludeCustomerLogo} onChange={(event) => setAssetExportIncludeCustomerLogo(event.target.checked)} disabled={!assetExportSingleProject?.customerId} />}
                    label="Include customer logo"
                  />
                </FormGroup>
                {!assetExportSingleProject?.customerId && (
                  <Typography variant="caption" color="text.secondary">
                    Customer logo is available only when the export resolves to one project/customer.
                  </Typography>
                )}
                {assetExportFormat === "excel" && (
                  <Typography variant="caption" color="text.secondary">
                    Excel export uses a real `.xlsx` workbook with project metadata, adjusted column widths, and no logo images.
                  </Typography>
                )}
              </FormControl>
            </Stack>

            <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} mb={1}>
                <Typography variant="subtitle2">Columns</Typography>
                <Stack direction="row" spacing={1}>
                  <Button size="small" onClick={() => setAssetExportSelectedColumnIds(assetExportColumnOptions.map((column) => column.id))}>Select all</Button>
                  <Button size="small" onClick={() => setAssetExportSelectedColumnIds([])}>Clear</Button>
                </Stack>
              </Stack>
              <Box sx={{ maxHeight: 320, overflowY: "auto", pr: 1 }}>
                <FormGroup>
                  {assetExportColumnOptions.map((column) => (
                    <FormControlLabel
                      key={column.id}
                      control={
                        <Checkbox
                          checked={assetExportSelectedColumnIds.includes(column.id)}
                          onChange={(event) => {
                            setAssetExportSelectedColumnIds((prev) => event.target.checked
                              ? [...prev, column.id]
                              : prev.filter((id) => id !== column.id));
                          }}
                        />
                      }
                      label={column.label}
                    />
                  ))}
                </FormGroup>
              </Box>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssetExportDialogOpen(false)} disabled={assetExportRunning}>Close</Button>
          <Button variant="contained" onClick={() => void exportAssetDataset()} disabled={assetExportRunning || assetExportSelectedColumnIds.length === 0}>
            {assetExportRunning ? "Exporting..." : `Export ${assetExportFormat.toUpperCase()}`}
          </Button>
        </DialogActions>
      </Dialog>

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
      {isNativePlatform && !loadingAssets && mobileAssets.length > 0 && (
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

      {assetLoadError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => { setAssetLoadError(null); void refreshAssets(); }}>
              Retry
            </Button>
          }
          sx={{ mb: 1 }}
        >
          {assetLoadError}
        </Alert>
      )}

      {/* Web keeps the original table workspace; native keeps the mobile card list. */}
      {loadingAssets ? (
        isNativePlatform ? (
          <Stack spacing={0.75}>
            {[0, 1, 2, 3].map((i) => (
              <Paper key={i} className="glass-card" sx={{ overflow: "hidden", borderLeft: "3px solid transparent" }}>
                <Stack direction="row" alignItems="center" sx={{ px: 1.25, py: 1.25 }} spacing={1}>
                  <Skeleton variant="circular" width={24} height={24} sx={{ flexShrink: 0 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Skeleton variant="text" width="55%" height={16} sx={{ mb: 0.5 }} />
                    <Skeleton variant="text" width="80%" height={12} />
                  </Box>
                  <Stack alignItems="flex-end" spacing={0.5} sx={{ flexShrink: 0 }}>
                    <Skeleton variant="rounded" width={60} height={20} />
                  </Stack>
                  <Skeleton variant="rounded" width={72} height={28} sx={{ flexShrink: 0 }} />
                </Stack>
              </Paper>
            ))}
          </Stack>
        ) : (
          <Stack alignItems="center" justifyContent="center" sx={{ p: 6 }}>
            <CircularProgress size={32} />
          </Stack>
        )
      ) : !selectedProjectId && !allProjectsExplicit ? (
        <Alert
          severity="info"
          action={
            <Button color="inherit" size="small" onClick={() => handleProjectChange("")}>
              All projects
            </Button>
          }
        >
          Select a project above to view assets, or choose &quot;All projects&quot; to browse every product.
        </Alert>
      ) : assetLoadError && assets.length === 0 ? (
        null
      ) : mobileAssets.length === 0 ? (
        <Alert severity="info">
          {assets.length === 0
            ? archiveMode
              ? "No archived assets found for this product."
              : selectedProject
                ? `No assets added for ${selectedProject.jobNumber} yet.`
                : `No assets added for ${activeProduct?.name ?? "this product"} yet.`
            : "No assets match the current filters."}
        </Alert>
      ) : isNativePlatform ? (
        <Stack spacing={0.75}>
          {mobileAssets.map((asset) => {
            const proj = projectMap.get(asset.projectId);
            const tech = asset.assignedUserId ? userMap.get(asset.assignedUserId) : null;
            const isExpanded = expandedAssetId === asset.id;
            const runs = runsMap[asset.id] ?? [];
            const healthColor = computeAssetHealth(asset, runs);
            const cardDisplayState = getWorkflowDisplayState(asset, runs, {
              paused: Boolean(pausedProgress[asset.id]),
              inspectionMode: false,
              hasRunnableWorkflowSource: true,
            });
            const cardWidgets = cardDisplayState.feature.widgets;

            // Signature check — same logic as web status column
            const latestLocked = runs.find(r => r.isLocked);
            const awaitingCustomerSig = asset.status === "Complete"
              && !!latestLocked
              && !latestLocked.customerSignedAt
              && latestLocked.signatureStatus !== "WaivedCustomer";

            // Smart composite status chip (reflects lifecycle state, not just issue state)
            const smartChipColor: "default" | "primary" | "success" | "error" | "warning" | "info" =
              asset.status === "Cancelled" ? cardDisplayState.status.color :
              healthColor === "red" ? "error" :
              healthColor === "amber" ? "warning" :
              healthColor === "green" ? "success" :
              cardDisplayState.status.color;
            // Use the shared display-state label so it matches widgets/action
            // (e.g. raw "Issue" status displays as "In Progress"; the red widget
            // carries the issue signal). Previously read STATUS_LABELS directly,
            // which could show "Issue" while the shared model showed In Progress.
            const smartChipLabel = cardDisplayState.status.label;

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
                if (awaitingCustomerSig) cond = "complete · awaiting customer sign-off";
                else if (subLabel === "Missing") cond = "complete · missing data";
                else cond = issueNote ? `complete · ${issueNote}` : "complete";
              } else if (st === "Closed") {
                cond = issueNote ? `closed · ${issueNote}` : "closed";
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
              awaitingCustomerSig ? "info.main" :
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
                  transition: "transform 0.18s ease-out, box-shadow 0.18s ease-out",
                  "&:active": {
                    transform: "scale(0.982)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                    transition: "transform 0.07s, box-shadow 0.07s",
                  },
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
                    {cardWidgets.length > 0 && (
                      <Stack direction="row" spacing={0.25} alignItems="center">
                        {cardWidgets.map((w) => {
                          const totalCount = w.openCount + w.resolvedCount;
                          const allResolved = w.openCount === 0 && w.resolvedCount > 0;
                          const Icon = w.icon === "camera" ? PhotoCameraOutlined : ReportProblemOutlined;
                          const hex = w.color === "yellow" ? "#d79b24" : w.color === "grey" ? "#8a9ba8" : w.color === "red" ? "#d32f2f" : "#e8833a";
                          return (
                            <Box key={w.kind} sx={{ display: "inline-flex", alignItems: "center", gap: 0.15, opacity: allResolved ? 0.4 : 1 }}>
                              <Icon sx={{ fontSize: 14, color: hex }} />
                              {totalCount > 1 && <Typography component="span" sx={{ fontSize: 9, fontWeight: 700, color: hex }}>{totalCount}</Typography>}
                            </Box>
                          );
                        })}
                      </Stack>
                    )}
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
          <Box
            ref={virtualizeOperationsTable ? operationsScrollRef : undefined}
            sx={{
              overflowX: "auto",
              ...(virtualizeOperationsTable
                ? { maxHeight: "min(70vh, calc(100vh - 280px))", overflowY: "auto" }
                : {}),
            }}
          >
            <Table size="small" stickyHeader={virtualizeOperationsTable} sx={{ minWidth: 900 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 28, px: 0.5 }}>
                    <Checkbox
                      size="small"
                      indeterminate={selectedAssetIds.size > 0 && selectedAssetIds.size < displayAssets.length}
                      checked={displayAssets.length > 0 && selectedAssetIds.size === displayAssets.length}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedAssetIds(new Set(displayAssets.map((a) => a.id)));
                        else setSelectedAssetIds(new Set());
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ width: 36, px: 1 }} />
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={0.25}>
                      <Typography variant="caption" fontWeight={700}>Asset Tag</Typography>
                      <IconButton size="small" sx={{ p: 0.25 }} onClick={(e) => setAutoMenu({ anchorEl: e.currentTarget, key: "assetTag" })}>
                        <ArrowDropDown fontSize="small" />
                      </IconButton>
                    </Stack>
                  </TableCell>
                  {visibleColumns.map((col) => (
                    <TableCell key={col.id}>
                      <Stack direction="row" alignItems="center" spacing={0.25}>
                        <Typography variant="caption" fontWeight={700}>{col.label}</Typography>
                        {col.id === "features" ? (
                          <Tooltip
                            title={
                              <Stack spacing={0.5}>
                                <Typography variant="caption" sx={{ fontWeight: 700, color: "common.white" }}>Feature Colors</Typography>
                                <Typography variant="caption">Amber: Pending or Paused</Typography>
                                <Typography variant="caption">Blue: Running</Typography>
                                <Typography variant="caption">Green: Complete</Typography>
                                <Typography variant="caption">Red: Missing data</Typography>
                              </Stack>
                            }
                          >
                            <InfoOutlined sx={{ fontSize: 14, color: "text.disabled", cursor: "help" }} />
                          </Tooltip>
                        ) : (
                          <IconButton size="small" sx={{ p: 0.25 }} onClick={(e) => setAutoMenu({ anchorEl: e.currentTarget, key: col.id })}>
                            <ArrowDropDown fontSize="small" />
                          </IconButton>
                        )}
                      </Stack>
                    </TableCell>
                  ))}
                  <TableCell align="right"><Typography variant="caption" fontWeight={700}>Actions</Typography></TableCell>
                </TableRow>
              </TableHead>
              {virtualizeOperationsTable ? (
                <OperationsVirtualizedTableBody
                  scrollRef={operationsScrollRef}
                  rowCount={displayAssets.length * 2}
                  colSpan={3 + visibleColumns.length}
                  renderRow={(index) => {
                    const asset = displayAssets[Math.floor(index / 2)];
                    if (!asset) return null;
                    const rows = renderOperationsAssetRows(asset);
                    return rows[index % 2];
                  }}
                />
              ) : (
                <TableBody>
                  {displayAssets.flatMap((asset) => renderOperationsAssetRows(asset))}
                </TableBody>
              )}
            </Table>
          </Box>
          {paginatedWebProject && projectAssetTotal > 0 && (
            <TablePagination
              component="div"
              count={projectAssetTotal}
              page={Math.max(0, projectAssetPage - 1)}
              onPageChange={(_, nextPage) => setProjectAssetPage(nextPage + 1)}
              rowsPerPage={PROJECT_ASSET_PAGE_SIZE}
              rowsPerPageOptions={[PROJECT_ASSET_PAGE_SIZE]}
            />
          )}
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
              {(canRunAssetWorkflow || a.status === "Complete" || a.status === "Closed" || a.status === "Cancelled") && (
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
                  onClick={() => { openReportExportDialog(a); setStatusMenuAnchor(null); setStatusMenuAsset(null); }}>
                  View/Export Report
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

      {/* Add asset dialog — isolated so typing doesn't re-render the operations table */}
      <AssetAddDialog
        open={addOpen}
        defaultProjectId={selectedProjectId || ""}
        activeProduct={activeProduct ?? null}
        productProjects={productProjects}
        projects={projects}
        users={users}
        latestPublishedWfConfigs={latestPublishedWfConfigs}
        publishedWfConfigs={publishedWfConfigs}
        configs={configs}
        getSiteLocation={getSiteLocation}
        onClose={() => setAddOpen(false)}
        onSaved={refreshAssets}
      />

      {/* Edit asset dialog */}
      <Dialog open={editOpen} onClose={() => !editSaving && setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Asset - {editAsset?.assetTag}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {isEditAssetCancelled && (
              <Alert severity="warning" sx={{ fontSize: 12 }}>
                This asset is cancelled and locked. Its details and workflow can no longer be
                edited. The reason is recorded in Notes.
              </Alert>
            )}
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
              onChange={(e) => setEditForm((p) => ({ ...p, assetTag: e.target.value }))}
              InputProps={{ readOnly: Boolean(isEditAssetCancelled) }} />
            <TextField label="Asset Name" size="small" fullWidth
              value={editForm.assetName}
              onChange={(e) => setEditForm((p) => ({ ...p, assetName: e.target.value }))}
              placeholder="e.g. AGI-10, Shuttle Car, Skid Steer"
              InputLabelProps={{ shrink: true }}
              InputProps={{ readOnly: Boolean(isEditAssetCancelled) }} />
            <FormControl size="small" fullWidth>
              <InputLabel shrink>Configuration Type</InputLabel>
              <Select
                label="Configuration Type"
                value={editForm.configId}
                onChange={(e) => setEditForm((p) => ({ ...p, configId: e.target.value }))}
                disabled={Boolean(isEditAssetCancelled)}
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
              onChange={(e) => setEditForm((p) => ({ ...p, serialNumber: e.target.value }))}
              InputProps={{ readOnly: Boolean(isEditAssetCancelled) }} />
            <TextField label="Asset Model" size="small" fullWidth
              value={editForm.assetModel}
              onChange={(e) => setEditForm((p) => ({ ...p, assetModel: e.target.value }))}
              InputProps={{ readOnly: Boolean(isEditAssetCancelled) }} />
            <TextField label="Manufacturer" size="small" fullWidth
              value={editForm.manufacturer}
              onChange={(e) => setEditForm((p) => ({ ...p, manufacturer: e.target.value }))}
              InputProps={{ readOnly: Boolean(isEditAssetCancelled) }} />
            <TextField label="Location" size="small" fullWidth
              value={editForm.location}
              onChange={(e) => setEditForm((p) => ({ ...p, location: e.target.value }))}
              placeholder="i.e LV workshop, U/G"
              InputLabelProps={{ shrink: true }}
              InputProps={{ readOnly: Boolean(isEditAssetCancelled) }} />
            <FormControl size="small" fullWidth>
              <InputLabel shrink>Assigned User</InputLabel>
              <Select label="Assigned User" value={editForm.assignedUserId}
                onChange={(e) => setEditForm((p) => ({ ...p, assignedUserId: e.target.value }))}
                disabled={Boolean(isEditAssetCancelled)}>
                <MenuItem value="">(Unassigned)</MenuItem>
                {users.filter((u) => u.isActive).map((u) => (
                  <MenuItem key={u.id} value={u.id}>{u.fullName}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              alignItems={{ xs: "stretch", sm: "center" }}
              justifyContent="space-between"
            >
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="body2" color="text.secondary">Asset status</Typography>
                <Chip
                  size="small"
                  label={STATUS_LABELS[(editAsset?.status as ProjectAssetStatus) ?? "NotStarted"]}
                  color={STATUS_COLORS[(editAsset?.status as ProjectAssetStatus) ?? "NotStarted"]}
                />
              </Stack>
              {canEditAssetStatus && (
                <Button
                  color={isEditAssetCancelled ? "warning" : "error"}
                  onClick={() => {
                    setCancelDialogMode(isEditAssetCancelled ? "undo" : "cancel");
                    setCancelReason("");
                    setCancelConfirmOpen(true);
                  }}
                  disabled={editSaving}
                >
                  {isEditAssetCancelled ? "Undo cancel asset" : "Cancel asset"}
                </Button>
              )}
            </Stack>
            <TextField label="Notes" size="small" fullWidth multiline rows={2}
              value={editForm.notes}
              onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))}
              InputProps={{ readOnly: Boolean(isEditAssetCancelled) }} />
            {editError && <Alert severity="error" sx={{ fontSize: 12 }}>{editError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)} disabled={editSaving}>Close</Button>
          <Button variant="contained" onClick={saveEditAsset}
            disabled={editSaving || Boolean(isEditAssetCancelled)}
            startIcon={editSaving ? <CircularProgress size={14} /> : undefined}>
            {editSaving ? "Saving..." : "Save changes"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Column sort / filter menu */}
      <Menu anchorEl={autoMenu.anchorEl} open={Boolean(autoMenu.anchorEl)} onClose={() => setAutoMenu({ anchorEl: null, key: "" })}>
        <MenuItem onClick={() => { if (autoMenu.key) setAutoSort({ key: autoMenu.key, dir: "asc" }); setAutoMenu({ anchorEl: null, key: "" }); }}>Sort A → Z</MenuItem>
        <MenuItem onClick={() => { if (autoMenu.key) setAutoSort({ key: autoMenu.key, dir: "desc" }); setAutoMenu({ anchorEl: null, key: "" }); }}>Sort Z → A</MenuItem>
        <MenuItem onClick={() => { setAutoSort({ key: "", dir: "asc" }); setAutoMenu({ anchorEl: null, key: "" }); }}>Clear sort</MenuItem>
        {(assetFilterOptions[autoMenu.key] ?? []).map((option) => {
          const label = option || "(Blank)";
          const selected = !!autoFilters[autoMenu.key]?.has(option);
          return (
            <MenuItem key={`${autoMenu.key}-${option}`} onClick={() => {
              if (!autoMenu.key) return;
              setAutoFilters((prev) => {
                const cur = new Set(prev[autoMenu.key] ?? []);
                if (cur.has(option)) cur.delete(option); else cur.add(option);
                return { ...prev, [autoMenu.key]: cur };
              });
            }}>
              <Checkbox checked={selected} size="small" />
              <ListItemText primary={label} />
            </MenuItem>
          );
        })}
      </Menu>

      {/* Archive confirmation */}
      {/* Cancel / undo cancel asset */}
      <Dialog open={cancelConfirmOpen} onClose={() => !cancellingAsset && setCancelConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{cancelDialogMode === "undo" ? "Undo asset cancellation?" : "Cancel this asset?"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {cancelDialogMode === "undo" ? (
              <Alert severity="info" sx={{ fontSize: 12 }}>
                {editAsset?.assetTag} will be restored to <strong>Not Started</strong>. The asset stays
                visible in active lists and can be worked again.
              </Alert>
            ) : (
              <>
                <Alert severity="warning" sx={{ fontSize: 12 }}>
                  {editAsset?.assetTag} will be marked <strong>Cancelled</strong> and locked from further
                  editing. It stays visible on this page and is filterable by the Cancelled status.
                  Any work already captured is kept as a record.
                </Alert>
                <TextField
                  label="Reason for cancelling *"
                  size="small"
                  fullWidth
                  required
                  multiline
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Equipment removed from site; job descoped by customer"
                  helperText="Recorded in the asset's Notes."
                />
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelConfirmOpen(false)} disabled={cancellingAsset}>Back</Button>
          <Button
            variant="contained"
            color={cancelDialogMode === "undo" ? "warning" : "error"}
            onClick={cancelDialogMode === "undo" ? confirmUndoCancelAsset : confirmCancelAsset}
            disabled={cancellingAsset || (cancelDialogMode === "cancel" && !cancelReason.trim())}
            startIcon={cancellingAsset ? <CircularProgress size={14} /> : undefined}
          >
            {cancellingAsset
              ? (cancelDialogMode === "undo" ? "Restoring..." : "Cancelling...")
              : (cancelDialogMode === "undo" ? "Undo cancel asset" : "Cancel asset")}
          </Button>
        </DialogActions>
      </Dialog>

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
              <InputLabel shrink>Workflow Config (Published) *</InputLabel>
              <Select
                label="Workflow Config (Published) *"
                value={assignForm.workflowConfigId}
                onChange={(e) => {
                  const cfg = workflowConfigs.find((c) => c.id === e.target.value);
                  setAssignForm({
                    workflowConfigId: e.target.value,
                    workflowTypeId: cfg ? resolveConfigWorkflowTypeId(cfg, workflowTypes) : "",
                  });
                }}
              >
                {workflowConfigs.length === 0 && (
                  <MenuItem value="" disabled>No published configs available</MenuItem>
                )}
                {workflowConfigs.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                    {c.configType ? ` - ${c.configType}` : ""}
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
            disabled={assignSaving || !assignForm.workflowConfigId}
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
            placeholder="Tag, serial, brand, feature, or field (min 2 chars)…"
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
            type Ranked = {
              asset: ProjectAsset;
              score: number;
              matchLabel?: string;
            };
            const ranked: Ranked[] = [];
            for (const a of assets) {
              if (a.isDeleted) continue;
              const installerName = a.installedBy ?? users.find((u) => u.id === a.assignedUserId)?.fullName ?? "";
              const tagHit = matchesWordStart(a.assetTag, q);
              const serialHit = matchesWordStart(a.serialNumber, q);
              const nameHit = matchesWordStart(a.assetName, q);
              const brandHit = matchesWordStart(a.manufacturer, q) || matchesWordStart(a.assetModel, q);
              const installerHit = matchesWordStart(installerName, q);
              const locationHit = matchesWordStart(a.location, q);
              const captureMatch = findCaptureMatch(captureIndexByAsset[a.id]?.hits, q, matchesWordStart);

              if (!tagHit && !serialHit && !nameHit && !brandHit && !installerHit && !locationHit && !captureMatch) {
                continue;
              }

              // Brand / identity beats accidental field-label noise (word-start already
              // stops "cat"→"location"; score still ranks CAT brand above value hits).
              let score = 0;
              let matchLabel: string | undefined;
              if (tagHit) { score += 100; matchLabel = "Asset tag"; }
              else if (brandHit) { score += 90; matchLabel = a.manufacturer ? `Brand: ${a.manufacturer}` : `Model: ${a.assetModel}`; }
              else if (serialHit) { score += 80; matchLabel = `S/N: ${a.serialNumber}`; }
              else if (nameHit) { score += 70; matchLabel = a.assetName; }
              else if (installerHit) { score += 50; matchLabel = `Installer: ${installerName}`; }
              else if (locationHit) { score += 40; matchLabel = `Location: ${a.location}`; }
              else if (captureMatch) {
                score += captureMatch.kind === "value" ? 35 : captureMatch.kind === "feature" ? 25 : 15;
                matchLabel = captureMatch.label;
              }
              ranked.push({ asset: a, score, matchLabel });
            }
            ranked.sort((a, b) => b.score - a.score || a.asset.assetTag.localeCompare(b.asset.assetTag));
            const results = ranked.slice(0, 50);
            if (results.length === 0) {
              return (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                  No assets match "{assetSearchQuery}"
                </Typography>
              );
            }
            return (
              <List dense disablePadding sx={{ maxHeight: 360, overflowY: "auto" }}>
                {results.map(({ asset: a, matchLabel }) => {
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
                            <Stack spacing={0.25}>
                              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                {proj && <Typography variant="caption" color="text.secondary">{proj.jobNumber}</Typography>}
                                {installer && <Typography variant="caption" color="text.secondary">· {installer}</Typography>}
                              </Stack>
                              {matchLabel && (
                                <Typography variant="caption" color="primary.main" sx={{ display: "block" }}>
                                  {matchLabel}
                                </Typography>
                              )}
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

      <Dialog
        open={reportExportOpen}
        onClose={closeReportExportDialog}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { height: "92vh" } }}
      >
        <DialogTitle>View/Export Report</DialogTitle>
        <DialogContent sx={{ p: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <Box sx={{ px: 3, py: 1.5, borderBottom: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>
            <Typography variant="body2" fontWeight={600}>
              {reportExportAsset ? `${reportExportAsset.assetTag}${reportExportAsset.assetName ? ` - ${reportExportAsset.assetName}` : ""}` : "Report preview"}
            </Typography>
          </Box>
          <Box sx={{ flex: 1, minHeight: 0, bgcolor: "#525659" }}>
            {reportPreviewLoading ? (
              <Stack alignItems="center" justifyContent="center" spacing={2} sx={{ height: "100%", color: "common.white" }}>
                <CircularProgress color="inherit" />
                <Typography variant="body2">Loading PDF preview...</Typography>
              </Stack>
            ) : reportPreviewError ? (
              <Box sx={{ p: 2 }}>
                <Alert severity="error">{reportPreviewError}</Alert>
              </Box>
            ) : reportPreviewUrl ? (
              <Box
                component="iframe"
                title="Report PDF Preview"
                src={reportPreviewUrl}
                sx={{ width: "100%", height: "100%", border: 0, bgcolor: "common.white" }}
              />
            ) : (
              <Stack alignItems="center" justifyContent="center" sx={{ height: "100%", color: "common.white" }}>
                <Typography variant="body2">No preview available.</Typography>
              </Stack>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5, borderTop: "1px solid", borderColor: "divider", justifyContent: "space-between", flexWrap: "nowrap" }}>
          <Button onClick={closeReportExportDialog}>Close</Button>
          <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
            <Button
              variant="outlined"
              startIcon={reportGenerating === reportExportAsset?.id ? <CircularProgress size={14} /> : <FileDownloadOutlined fontSize="small" />}
              disabled={!reportExportAsset || reportPreviewLoading || reportGenerating === reportExportAsset?.id}
              onClick={() => void handleAssetReportExport("pdf")}
            >
              Export PDF
            </Button>
            <Button
              variant="outlined"
              disabled={!reportExportAsset || reportPreviewLoading || reportGenerating === reportExportAsset?.id}
              onClick={() => void handleAssetReportExport("json")}
            >
              Export JSON
            </Button>
            <Button
              variant="contained"
              disabled={!reportExportAsset || reportPreviewLoading || reportGenerating === reportExportAsset?.id}
              onClick={() => void handleAssetReportExport("docx")}
            >
              Export Word
            </Button>
          </Stack>
        </DialogActions>
      </Dialog>

      <BulkWorkflowReportDialog
        open={bulkWorkflowReportsOpen}
        onClose={() => setBulkWorkflowReportsOpen(false)}
        assets={bulkReportSelectedAssets}
        buildReportContext={buildAssetReportContext}
        zipFileName={bulkReportZipFileName}
        projectId={selectedProject?.id}
        jobLabel={selectedProject?.jobNumber}
        users={users}
        canShareReports={currentUser.role === "Admin" || currentUser.role === "Project Manager"}
      />

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
          canRequestCustomerSignature={currentUser.role === "Admin" || currentUser.role === "Project Manager"}
          entryMode={runHistoryEntryMode}
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

      {runnerOpen && runnerWorkflow && runnerAsset && runnerProduct && (
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
          productId={runnerProduct.id}
          productName={runnerProduct.name}
          projectAssetId={runnerAsset.id}
          workflowConfigId={runnerWorkflowConfigId}
          existingRunId={runnerExistingRunId}
          prefillValues={runnerPrefillValues}
          currentUserName={currentUser.fullName}
          currentUserId={currentUser.id}
          assetTag={runnerAsset.assetTag || (runnerAsset as any).assetName || ""}
          jobNumber={(runnerAsset as any).jobNumber || ""}
          projectId={runnerAsset.projectId}
          timeZoneId={runnerProjectTimeZone ?? selectedProject?.timeZoneId}
          productFeatures={runnerProductFeatures}
          featureSelections={runnerFeatureSelections}
          teamMembers={runnerTeamMembers}
          allUsers={runnerAllUsers}
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
                      {(["NotStarted", "InProgress", "Paused", "Pending", "Complete", "Closed", "Issue"] as const).map((s) => {
                        const labels: Record<string, string> = {
                          NotStarted: "Not Started", InProgress: "In Progress", Paused: "Paused", Pending: "Pending", Complete: "Complete", Closed: "Closed", Issue: "Issue", Cancelled: "Cancelled",
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

      {isNativePlatform && (
        <CaptureSpreadsheetDialog
          open={capturePopupOpen}
          onClose={() => setCapturePopupOpen(false)}
          fullScreen
          hideSelectionColumn
          assets={mobileAssets}
          runsMap={runsMap}
          features={libFeatures}
          depsByFeature={depsByFeature}
          featureSelectionsByConfig={featureSelectionsByConfig}
          activeCountForAsset={getActiveCountForAsset}
          readOnly
          canEditCapture={false}
          onRunUpdated={(run) => {
            startTransition(() => {
              setRunsMap((prev) => {
                const list = prev[run.assetId] ?? [];
                const next = list.some((r) => r.id === run.id)
                  ? list.map((r) => (r.id === run.id ? run : r))
                  : [...list, run];
                return { ...prev, [run.assetId]: next };
              });
            });
          }}
          assetJobColumns={assetCaptureJobColumns}
          renderStatus={(asset) => captureTableStatusChip(asset, projectMap.get(asset.projectId)?.workflowMode)}
          renderActions={(asset) => {
            const proj = projectMap.get(asset.projectId);
            return (canRunAssetWorkflow || asset.status === "Complete" || asset.status === "Closed" || asset.status === "Cancelled")
              ? actionButton(asset, proj?.workflowMode)
              : null;
          }}
        />
      )}

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

