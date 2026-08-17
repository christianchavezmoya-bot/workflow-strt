import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import {
  AddOutlined,
  ArrowDropDown,
  ArticleOutlined,
  AssignmentOutlined,
  CheckBoxOutlineBlankOutlined,
  CheckBoxOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  DeleteForeverOutlined,
  DeleteOutline,
  DrawOutlined,
  EditOutlined,
  ErrorOutlined,
  ExpandLessOutlined,
  ExpandMoreOutlined,
  FileUploadOutlined,
  FolderOutlined,
  GridOnOutlined,
  HistoryOutlined,
  HourglassEmptyOutlined,
  InfoOutlined,
  PhotoCameraOutlined,
  PlayArrowOutlined,
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
  Select,
  Skeleton,
  Stack,
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
import { type GroupByKey, type PrintRow } from "../../utils/assetListReportColumns";
import { useComplexView } from "../../contexts/ComplexViewContext";
import { useAuth } from "../../hooks/useAuth";
import { usePermissions } from "../../hooks/usePermissions";
import { useProjectTimeZone } from "../../hooks/useProjectTimeZone";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { fetchProducts } from "../../store/productsSlice";
import { fetchProjects } from "../../store/projectSlice";
import { fetchUsers } from "../../store/usersSlice";
import { projectAssetService } from "../../services/projectAssetService";
import { productConfigService, type ProductConfig } from "../../services/productConfigService";
import { workflowTemplateService } from "../../services/workflowTemplateService";
import { workflowConfigService } from "../../services/workflowConfigService";
import { assetWorkflowAssignmentService } from "../../services/assetWorkflowAssignmentService";
import { assetWorkflowRunService, deriveOfflineAssetStatusFromRun, isPendingCustomerSignature, isPendingInstallerSignature } from "../../services/assetWorkflowRunService";
import { RunHydrationPriority } from "../../services/runHydrationQueue";
import { signatureService } from "../../services/signatureService";
import { workflowTypeService } from "../../services/workflowTypeService";
import { brandSettingsService } from "../../services/brandSettingsService";
import { customerService } from "../../services/customerService";
import { assetDocumentLinkService } from "../../services/assetDocumentLinkService";
import { entityGetAssetCacheAgeMs, CACHE_SOFT_LIMIT_MS, CACHE_HARD_LIMIT_MS, entityReplaceIssuesForAsset } from "../../services/localDB";
import type { WorkflowReportExportContext } from "../../utils/workflowReportExport";
import { resolveReportTimeZone } from "../../utils/datetime";
import { resolveProjectTimeZoneForReport } from "../../utils/projectTimeZone";
import { BulkWorkflowReportDialog } from "../../components/reports/BulkWorkflowReportDialog";
import ProjectJobSelect from "../../components/ProjectJobSelect";
import { countMissingWorkflowItems, runHasCompletedAllSteps } from "../../utils/workflowCompleteness";
import { randomId } from "../../utils/randomId";
import { getWorkflowDisplayState, type WorkflowDisplayState } from "../../utils/workflowDisplayState";
import type { AssetIssue, ProjectAsset, ProjectAssetStatus } from "../../types/projectAsset";
import type { WorkflowConfig } from "../../types/workflowConfig";
import type { WorkflowAssignment, WorkflowType } from "../../types/workflowType";
import type { AssetWorkflowRun, RunIssue } from "../../types/assetWorkflowRun";
import { mergeRunsIntoMap, mergeRunRecord, runHasCaptureBlobs } from "../../types/assetWorkflowRunSummary";
import type { BomItem, StepInput, Workflow } from "../../types/workflow";
import { featureService } from "../../services/featureService";
import { featureDependencyService } from "../../services/featureDependencyService";
import { siteService } from "../../services/siteService";
import type { Site } from "../../types/site";
import WorkflowRunHistoryDialog from "./WorkflowRunHistoryDialog";
import WorkflowSignatureFlowHost, { type WorkflowSignatureFlowTarget } from "../../components/ui/WorkflowSignatureFlowHost";
import AssetInspectionDialog from "./AssetInspectionDialog";
import IssueDetailDialog from "../../components/ui/IssueDetailDialog";
import MediaCapture from "../../components/ui/MediaCapture";
import AssetAddDialog from "./AssetAddDialog";
import AssetEditDialog from "./AssetEditDialog";
import type { MissingMediaFlag } from "../dashboard/photoUploadTypes";
import InspectionImportDialog from "../projects/InspectionImportDialog";
import { useStaleOnResume } from "../../hooks/useStaleOnResume";
import { AssetRepository } from "../../repositories/AssetRepository";
import { WorkflowAssignmentRepository } from "../../repositories/WorkflowAssignmentRepository";
import { mediaStore } from "../../services/mediaStore";
import { shouldSkipBlockingFetch } from "../../services/connectivityMonitor";
import { deriveOpenIssuesFromAsset } from "../../utils/issueDerivation";
import type { Feature as LibFeature } from "../../types/feature";
import type { FeatureDependency } from "../../types/featureDependency";
import { buildFullCaptureJobColumns } from "../../utils/captureAssetJobColumns";
import { formatAssetTableDate, resolveAssetClosedAt } from "../../utils/assetTableDates";
import {
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
import AssetInstallationFeatureExpandedRow from "./AssetInstallationFeatureExpandedRow";
import AssetInstallationIssuesPanel from "./AssetInstallationIssuesPanel";
import AssetInstallationMobileCardStack, {
  AssetInstallationMobileCardSkeleton,
} from "./AssetInstallationMobileCardStack";
import AssetInstallationOperationsTable from "./AssetInstallationOperationsTable";
import AssetInstallationTimeTrackingPanel from "./AssetInstallationTimeTrackingPanel";
import AssetInstallationWorkflowAssignmentsPanel from "./AssetInstallationWorkflowAssignmentsPanel";
import { createAssetInstallationWorkflowPresentation } from "./assetInstallationWorkflowPresentation";
import { createOperationsAssetRowRenderer } from "./assetInstallationOperationsAssetRows";
import { createOperationsColumnCellRenderer } from "./assetInstallationOperationsColumnCell";
import { getOperationsColumnText, resolveOperationsConfigName, resolveOperationsConfigType } from "./assetInstallationOperationsTableLogic";
import {
  OPERATIONS_CHECKBOX_W,
  OPERATIONS_TAG_STICKY_LEFT,
  shouldVirtualizeOperationsTable,
} from "./operationsTableLayout";
import { STATUS_COLORS, STATUS_LABELS } from "./assetStatusDisplay";
import { useMobileWebLayout } from "../../hooks/useMobileWebLayout";
import { useOfficeTimeZone } from "../../hooks/useOfficeTimeZone";
import { markWorkflowOpenTap } from "../../utils/workflowOpenPerf";
import {
  loadWorkflowOpenPayload,
  refreshWorkflowOpenDataInBackground,
  OFFLINE_CONFIG_MISSING_MESSAGE,
  retryOfflineDownload,
} from "../../services/workflowOpenService";
import { escapeHtml, openPrintWindow } from "../../utils/printWindow";
import AssetInstallationColumnSettingsDialog from "./AssetInstallationColumnSettingsDialog";
import AssetInstallationBulkDocsUploadDialog from "./AssetInstallationBulkDocsUploadDialog";
import AssetInstallationBulkTechAssignDialog from "./AssetInstallationBulkTechAssignDialog";
import AssetInstallationBulkWarnDialog from "./AssetInstallationBulkWarnDialog";
import AssetInstallationBulkWorkflowAssignDialog from "./AssetInstallationBulkWorkflowAssignDialog";
import AssetInstallationCsvImportDialog from "./AssetInstallationCsvImportDialog";
import AssetInstallationWorkflowAssignDialog from "./AssetInstallationWorkflowAssignDialog";
import AssetInstallationBulkToolbar from "./AssetInstallationBulkToolbar";
import AssetInstallationTableToolbar from "./AssetInstallationTableToolbar";
import AssetInstallationExportDialog from "./AssetInstallationExportDialog";
import AssetInstallationPrintDialog from "./AssetInstallationPrintDialog";
import AssetInstallationReportExportDialog from "./AssetInstallationReportExportDialog";
import AssetInstallationAssetSearchDialog from "./AssetInstallationAssetSearchDialog";
import AssetInstallationArchiveConfirmDialog from "./AssetInstallationArchiveConfirmDialog";
import AssetInstallationBulkArchiveConfirmDialog from "./AssetInstallationBulkArchiveConfirmDialog";
import AssetInstallationPurgeConfirmDialog from "./AssetInstallationPurgeConfirmDialog";
import AssetInstallationWorkflowMismatchDialog from "./AssetInstallationWorkflowMismatchDialog";
import AssetInstallationAutoAssignConfirmDialog from "./AssetInstallationAutoAssignConfirmDialog";
import {
  buildBulkDocsWarnRows,
  buildBulkTechWarnRows,
  findAssetsWithAssignedUser,
} from "./assetInstallationBulkActions";
import { useAssetInstallationBulkDocsUpload } from "./useAssetInstallationBulkDocsUpload";
import { useAssetInstallationBulkTechAssign } from "./useAssetInstallationBulkTechAssign";
import { useAssetInstallationBulkWorkflowAssign } from "./useAssetInstallationBulkWorkflowAssign";
import { useAssetInstallationColumnConfig } from "./useAssetInstallationColumnConfig";
import { mergeImportedAssets, useAssetInstallationCsvImport } from "./useAssetInstallationCsvImport";
import { useAssetInstallationWorkflowAssign } from "./useAssetInstallationWorkflowAssign";
import { useBulkActionWarning } from "./useBulkActionWarning";
import {
  buildBulkAssignWarnRows,
  dedupeLatestPublishedWorkflowConfigs,
  findAssetsNeedingBulkAssignWarning,
} from "./assetInstallationWorkflowAssign";
import {
  assetHasConfiguredWorkflow,
  computeHealth,
  nextDraftConfigNumber,
  operationsStickyPrefixSx,
  projectHasInspection,
  timeAgo,
  workflowTypeMismatchMessage,
  isInspectionConfigType,
  isInspectionWorkflowType,
  type AssetHealth,
} from "./assetInstallationPageLogic";

const WorkOrderRunner = lazy(() => import("../workInstructions/WorkOrderRunner"));
const CaptureSpreadsheetDialog = lazy(() => import("./CaptureSpreadsheetDialog"));
const PhotoUploadDialog = lazy(() => import("../dashboard/PhotoUploadDialog"));
const AssetDocumentsDialog = lazy(() => import("./AssetDocumentsDialog"));

// Reference media is merged inside loadWorkflowOpenPayload when mergeMedia: true.

type AssetExportColumnOption = {
  id: string;
  label: string;
  headerLabel?: string;
  groupLabel: string;
  noteLabel?: string;
  valueFor: (asset: ProjectAsset) => string;
};

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
  const { zone: officeZone } = useOfficeTimeZone();
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
  const requestedWorkflowType = searchParams.get("workflowType");
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
  const getPrimaryActionRef = useRef<ReturnType<typeof createAssetInstallationWorkflowPresentation>["getPrimaryAction"]>(
    () => null,
  );
  const assetsRefreshTimerRef = useRef<number | null>(null);
  const assetsRefreshWhenVisibleRef = useRef(false);

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
  const paginatedWebProject = useMemo(() => {
    if (isNativePlatform || !selectedProjectId) return false;
    const workflowTypeFilter = searchParams.get("workflowType")?.trim();
    const hasClientOnlyFilters =
      statusFilter !== "All"
      || showNoWorkflow
      || !!workflowTypeFilter
      || Object.values(autoFilters).some((sel) => sel && sel.size > 0);
    return !hasClientOnlyFilters;
  }, [autoFilters, isNativePlatform, searchParams, selectedProjectId, showNoWorkflow, statusFilter]);
  const [healthMap, setHealthMap] = useState<Record<string, AssetHealth>>({});

  const [expandedAssetId, setExpandedAssetId] = useState<string | null>(null);
  const [expandedBomAsgnId, setExpandedBomAsgnId] = useState<string | null>(null);

  // Add dialog — form state lives in AssetAddDialog so keystrokes don't re-render this page.
  const [addOpen, setAddOpen] = useState(false);

  // Edit dialog — form state lives in AssetEditDialog so keystrokes don't re-render this page.
  const [editAsset, setEditAsset] = useState<ProjectAsset | null>(null);

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
  const [runnerSignoffReviewMode, setRunnerSignoffReviewMode] = useState(false);
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

  // Archive view
  const [archiveMode, setArchiveMode] = useState(false);

  const {
    colSettingsOpen,
    setColSettingsOpen,
    settingsOrder,
    setSettingsOrder,
    settingsHidden,
    setSettingsHidden,
    visibleColumns,
    applyColumnSettings,
  } = useAssetInstallationColumnConfig(archiveMode);

  const {
    csvImportOpen,
    setCsvImportOpen,
    csvRows,
    setCsvRows,
    csvImporting,
    closeCsvImport,
    importCsv,
  } = useAssetInstallationCsvImport();

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

  const loadAssignmentsForAsset = useCallback(async (assetId: string) => {
    try {
      const [assignments, runs] = await Promise.all([
        assetWorkflowAssignmentService.listByAsset(assetId),
        assetWorkflowRunService.listByAsset(assetId),
      ]);
      setAssignmentsMap((prev) => ({ ...prev, [assetId]: assignments }));
      setRunsMap((prev) => ({ ...prev, [assetId]: runs }));
    } catch {
      console.warn("[AssetInstallationPage] loadAssignmentsForAsset failed");
    }
  }, []);

  const {
    assignDialogOpen,
    assignDialogAsset,
    assignForm,
    assignSaving,
    workflowConfigs: assignWorkflowConfigs,
    openAssignDialog,
    closeAssignDialog,
    selectAssignConfig,
    saveAssignment,
  } = useAssetInstallationWorkflowAssign({
    requestedWorkflowType,
    onWorkflowTypesLoaded: setWorkflowTypes,
    onWorkflowConfigsLoaded: setWorkflowConfigs,
    onAssignmentSaved: loadAssignmentsForAsset,
    onSaveError: setInlineSaveError,
  });

  const [inspectionDialogAsset, setInspectionDialogAsset] = useState<ProjectAsset | null>(null);
  const [runHistoryAsset, setRunHistoryAsset] = useState<ProjectAsset | null>(null);
  // New run history dialog (with re-run support)
  const [runHistoryOpen, setRunHistoryOpen] = useState(false);
  const [runHistoryConfigId, setRunHistoryConfigId] = useState("");
  const [runHistoryConfigName, setRunHistoryConfigName] = useState("");
  // False when the run was created synthetically from a JSON import (no point re-running)
  const [runHistoryAllowRerun, setRunHistoryAllowRerun] = useState(true);
  const [runHistoryEntryMode, setRunHistoryEntryMode] = useState<"default" | "customer-sign">("default");
  const [signatureFlowTarget, setSignatureFlowTarget] = useState<WorkflowSignatureFlowTarget | null>(null);
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

  // Bulk selection
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const {
    bulkWarnOpen,
    bulkWarnTitle,
    bulkWarnBody,
    bulkWarnRows,
    showBulkWarning,
    closeBulkWarning,
    proceedBulkWarning,
  } = useBulkActionWarning();
  const {
    bulkTechOpen,
    bulkTechId,
    bulkTechSaving,
    openBulkTechDialog,
    closeBulkTechDialog,
    selectBulkTechUser,
    applyBulkTechAssign,
  } = useAssetInstallationBulkTechAssign();
  const {
    bulkDocsOpen,
    bulkDocsFile,
    bulkDocsType,
    bulkDocsName,
    bulkDocsSaving,
    bulkDocsResult,
    openBulkDocsDialog,
    closeBulkDocsDialog,
    selectBulkDocsFile,
    setBulkDocsType,
    setBulkDocsName,
    uploadBulkDocsFile,
    attachBulkDocsQrUpload,
  } = useAssetInstallationBulkDocsUpload();
  // Bulk documents (toolbar uses bulk docs hook above)
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

  // PDF report
  const [reportGenerating, setReportGenerating] = useState<string | null>(null);
  const [reportExportOpen, setReportExportOpen] = useState(false);
  const [reportExportAsset, setReportExportAsset] = useState<ProjectAsset | null>(null);
  const [reportPreviewBlob, setReportPreviewBlob] = useState<Blob | null>(null);
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
    () => (productsState.loading ? [] : productsState.items),
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

    if (assetIdFromUrl && !actionFromUrl) {
      const asset = assets.find((item) => item.id === assetIdFromUrl);
      if (asset) {
        setExpandedAssetId(asset.id);
        return;
      }
      void projectAssetService.getById(assetIdFromUrl).then((fetched) => {
        if (!fetched) return;
        setAssets((prev) => (prev.some((item) => item.id === fetched.id) ? prev : [...prev, fetched]));
        setExpandedAssetId(fetched.id);
        const projectIdFromUrl = searchParams.get("project");
        if (projectIdFromUrl && selectedProjectId !== projectIdFromUrl) {
          handleProjectChange(projectIdFromUrl);
        }
      });
      return;
    }

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
    if (!asset) {
      void projectAssetService.getById(assetIdFromUrl).then((fetched) => {
        if (!fetched) return;
        setAssets((prev) => (prev.some((item) => item.id === fetched.id) ? prev : [...prev, fetched]));
        const projectIdFromUrl = searchParams.get("project");
        if (projectIdFromUrl && selectedProjectId !== projectIdFromUrl) {
          handleProjectChange(projectIdFromUrl);
        }
      });
      return;
    }

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

    if (actionFromUrl === "signature") {
      if (targetRun) {
        void openSignatureFlow(asset, targetRun);
        deepLinkHandledRef.current = key;
        return;
      }
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

      // Dependencies enrich capture-column metadata — load immediately on native
      // so the schema skeleton can paint before run blobs finish hydrating.
      const loadDeps = async () => {
        try {
          const map = await featureDependencyService.mapByProduct(activeProduct.id);
          if (cancelled) return;
          const complete: Record<string, FeatureDependency[]> = {};
          for (const f of feats) complete[f.id] = map[f.id] ?? [];
          setDepsByFeature(complete);
        } catch {
          if (!cancelled) setDepsByFeature({});
        }
      };
      if (isNativePlatform) {
        void loadDeps();
      } else {
        setTimeout(() => { void loadDeps(); }, 0);
      }
    }).catch(() => {
      if (!cancelled) {
        setLibFeatures([]);
        setDepsByFeature({});
      }
    });
    return () => { cancelled = true; };
  }, [activeProduct?.id, isNativePlatform]);

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
      const hydrateDetails = isNativePlatform && projectIds.length === 1;
      const loadPromise = isNativePlatform
        ? Promise.all(projectIds.map((pid) =>
            assetWorkflowRunService.listLatestByProject(pid, {
              hydrate: hydrateDetails,
              hydratePriority: RunHydrationPriority.high,
            }),
          )).then((results) => results.flat())
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
          const hydrateDetails = projectIds.length === 1;
          return Promise.all(
            projectIds.map((pid) => assetWorkflowRunService.listLatestByProject(pid, {
              hydrate: hydrateDetails,
              hydratePriority: RunHydrationPriority.high,
            })),
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

  const scheduleRefreshAssets = useCallback(() => {
    if (typeof document !== "undefined" && document.hidden) {
      assetsRefreshWhenVisibleRef.current = true;
      return;
    }
    if (isNativePlatform) {
      void refreshAssets();
      return;
    }
    if (assetsRefreshTimerRef.current !== null) {
      window.clearTimeout(assetsRefreshTimerRef.current);
    }
    assetsRefreshTimerRef.current = window.setTimeout(() => {
      assetsRefreshTimerRef.current = null;
      void refreshAssets();
    }, 400);
  }, [isNativePlatform, refreshAssets]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (!document.hidden && assetsRefreshWhenVisibleRef.current) {
        assetsRefreshWhenVisibleRef.current = false;
        scheduleRefreshAssets();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [scheduleRefreshAssets]);

  useEffect(() => () => {
    if (assetsRefreshTimerRef.current !== null) {
      window.clearTimeout(assetsRefreshTimerRef.current);
    }
  }, []);

  // Fix 9 — Real-time server push: re-fetch when SSE notifies this product/project changed
  useEffect(() => {
    const handler = (e: Event) => {
      const { productId, projectId } = (e as CustomEvent<{ productId?: string; projectId?: string }>).detail ?? {};
      const productIds = new Set(products.map((p) => p.id));
      // Web + project scoped: unscoped broadcast SSE is usually another job — skip full refetch.
      if (!isNativePlatform && selectedProjectId && !productId && !projectId) {
        return;
      }
      if (
        (productId && productIds.has(productId)) ||
        (projectId && projectId === selectedProjectId) ||
        (!productId && !projectId)
      ) {
        scheduleRefreshAssets();
      }
    };
    window.addEventListener("sse:assets:updated", handler as EventListener);
    return () => window.removeEventListener("sse:assets:updated", handler as EventListener);
  }, [isNativePlatform, products, scheduleRefreshAssets, selectedProjectId]);

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
            const merged = existing.map((r) => {
              const updated = runs.find((u) => u.id === r.id);
              return updated ? mergeRunRecord(r, updated) : r;
            });
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
            const merged = existing.map((r) => {
              const updated = fresh.find((u) => u.id === r.id);
              return updated ? mergeRunRecord(r, updated) : r;
            });
            fresh.forEach((u) => { if (!merged.some((r) => r.id === u.id)) merged.push(u); });
            next[id] = merged;
          });
        }
        return next;
      });
      if (assetId && mergeById) {
        const primaryRun = runs[0];
        if (primaryRun) {
          const derivedStatus = deriveOfflineAssetStatusFromRun(primaryRun);
          setAssets((prev) => prev.map((a) => (
            a.id === assetId && a.status !== derivedStatus ? { ...a, status: derivedStatus } : a
          )));
        }
      }
    };
    window.addEventListener("workflow-runs-cache-updated", handler as EventListener);
    return () => window.removeEventListener("workflow-runs-cache-updated", handler as EventListener);
  }, []);

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

  // Defer expensive capture index until capture-field search or native capture popup needs it.
  const needsCaptureTableIndex = search.trim().length > 0 || capturePopupOpen;

  const captureTableBase = useMemo(
    () => (
      needsCaptureTableIndex && libFeatures.length
        ? buildProjectCaptureTable(assets, runsMap, libFeatures)
        : null
    ),
    [needsCaptureTableIndex, assets, runsMap, libFeatures],
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
        if (requestedWorkflowType?.trim().toLowerCase() === "inspection") {
          const projectWorkflowMode = projects.find((p) => p.id === a.projectId)?.workflowMode;
          if (!projectHasInspection(projectWorkflowMode)) return false;
          const assignments = assignmentsMap[a.id];
          if (assignments && assignments.length > 0) {
            const hasInspectionWorkflow = assignments.some((asgn) =>
              isInspectionWorkflowType(asgn.workflowTypeName)
              || isInspectionConfigType(
                publishedWfConfigs.find((cfg) => cfg.id === asgn.workflowConfigId)?.configType
              )
            );
            if (!hasInspectionWorkflow) return false;
          }
        }
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
  }, [assets, selectedProjectId, statusFilter, showNoWorkflow, search, archiveMode, captureIndexByAsset, requestedWorkflowType, assignmentsMap, projects, publishedWfConfigs]);

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
  const latestPublishedWfConfigs = useMemo(
    () => dedupeLatestPublishedWorkflowConfigs(publishedWfConfigs),
    [publishedWfConfigs],
  );
  const {
    bulkWfOpen,
    bulkWfForm,
    bulkWfSaving,
    filteredBulkWorkflowConfigs,
    openBulkAssignDialog,
    closeBulkAssignDialog,
    selectBulkWorkflowType,
    selectBulkWorkflowConfig,
    applyBulkAssign,
  } = useAssetInstallationBulkWorkflowAssign({
    requestedWorkflowType,
    workflowTypes,
    latestPublishedConfigs: latestPublishedWfConfigs,
  });
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
    } else if (autoSort.key === "dateCreated" || autoSort.key === "dateClosed") {
      rows = [...rows].sort((a, b) => {
        const av = autoSort.key === "dateCreated"
          ? Date.parse(a.createdAt ?? "")
          : Date.parse(resolveAssetClosedAt(a, runsMap[a.id]) ?? "");
        const bv = autoSort.key === "dateCreated"
          ? Date.parse(b.createdAt ?? "")
          : Date.parse(resolveAssetClosedAt(b, runsMap[b.id]) ?? "");
        const aVal = Number.isNaN(av) ? 0 : av;
        const bVal = Number.isNaN(bv) ? 0 : bv;
        return autoSort.dir === "asc" ? aVal - bVal : bVal - aVal;
      });
    }
    return rows;
  }, [visibleAssets, autoFilters, autoSort, assetAccessors, runsMap]);

  const displayStateByAssetId = useMemo(() => {
    const map = new Map<string, WorkflowDisplayState>();
    for (const asset of displayAssets) {
      const runs = runsMap[asset.id] ?? [];
      const projectWorkflowMode = projectMap.get(asset.projectId)?.workflowMode;
      map.set(asset.id, getWorkflowDisplayState(asset, runs, {
        paused: Boolean(pausedProgress[asset.id]),
        inspectionMode: projectHasInspection(projectWorkflowMode),
        hasRunnableWorkflowSource:
          (assignmentsMap[asset.id]?.length ?? 0) > 0
          || !!asset.productConfigId
          || !!asset.workflowTemplateId
          || !!asset.workflowSummary?.hasWorkflow,
      }));
    }
    return map;
  }, [displayAssets, runsMap, pausedProgress, assignmentsMap, projectMap]);

  const resolveAssetDisplayState = useCallback((
    asset: ProjectAsset,
    projectWorkflowMode?: string | null,
  ): WorkflowDisplayState => {
    const cached = displayStateByAssetId.get(asset.id);
    if (cached) return cached;
    const runs = runsMap[asset.id] ?? [];
    return getWorkflowDisplayState(asset, runs, {
      paused: Boolean(pausedProgress[asset.id]),
      inspectionMode: projectHasInspection(projectWorkflowMode),
      hasRunnableWorkflowSource:
        (assignmentsMap[asset.id]?.length ?? 0) > 0
        || !!asset.productConfigId
        || !!asset.workflowTemplateId
        || !!asset.workflowSummary?.hasWorkflow,
    });
  }, [displayStateByAssetId, runsMap, pausedProgress, assignmentsMap]);

  const virtualizeOperationsTable = shouldVirtualizeOperationsTable(
    paginatedWebProject,
    displayAssets.length,
  );

  const mobileAssets = useMemo(() => {
    if (!isNativePlatform || mobileScope === "all") return displayAssets;
    return displayAssets.filter((a) => a.assignedUserId === currentUser.id);
  }, [displayAssets, isNativePlatform, mobileScope, currentUser.id]);

  useEffect(() => {
    if (!isNativePlatform || !selectedProjectId || assets.length === 0) return;
    const assetIds = assets
      .filter((asset) => asset.projectId === selectedProjectId)
      .map((asset) => asset.id);
    if (assetIds.length === 0) return;
    void assetWorkflowRunService.prioritizeRunHydration(selectedProjectId, assetIds);
  }, [isNativePlatform, selectedProjectId, assetsKey]);

  useEffect(() => {
    if (!isNativePlatform || !capturePopupOpen || mobileAssets.length === 0) return;
    const byProject = new Map<string, string[]>();
    for (const asset of mobileAssets) {
      if (!asset.projectId) continue;
      const ids = byProject.get(asset.projectId) ?? [];
      ids.push(asset.id);
      byProject.set(asset.projectId, ids);
    }
    for (const [projectId, assetIds] of byProject) {
      void assetWorkflowRunService.prioritizeRunHydration(projectId, assetIds);
    }
  }, [capturePopupOpen, isNativePlatform, mobileAssets]);

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

  const assetExportMode = "operations" as const;

  const assetExportSingleProject = useMemo(() => {
    if (selectedProject) return selectedProject;
    const projectIds = Array.from(new Set(displayAssets.map((asset) => asset.projectId).filter(Boolean)));
    if (projectIds.length !== 1) return null;
    return projectMap.get(projectIds[0]) ?? null;
  }, [displayAssets, projectMap, selectedProject]);

  const assetCaptureJobColumns = useMemo(
    () => buildFullCaptureJobColumns({
      projectMap, userMap, assignmentsMap, runsMap, workflowConfigMap: wfConfigMap, timeZoneId: officeZone,
    }),
    [assignmentsMap, officeZone, projectMap, runsMap, userMap, wfConfigMap],
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
        groupLabel: ["project", "siteName", "location", "dateCreated", "dateClosed"].includes(column.id) ? "ASSET & JOB" : "WORKFLOW",
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

  function handleBulkAssignWorkflowClick() {
    const sel = visibleAssets.filter((a) => selectedAssetIds.has(a.id));
    const withWf = findAssetsNeedingBulkAssignWarning(sel, assignmentsMap);
    if (withWf.length === 0) {
      openBulkAssignDialog();
      return;
    }
    showBulkWarning({
      title: "Some assets already have workflow assignments",
      body: "These assets already have one or more workflow assignments. Adding a new assignment will not remove existing ones. Assets that are in progress, complete, or closed may behave unexpectedly with additional assignments.",
      rows: buildBulkAssignWarnRows(withWf, assignmentsMap),
      onProceed: openBulkAssignDialog,
    });
  }

  function handleBulkAssignUserClick() {
    const sel = visibleAssets.filter((a) => selectedAssetIds.has(a.id));
    const withTech = findAssetsWithAssignedUser(sel);
    if (withTech.length === 0) {
      openBulkTechDialog();
      return;
    }
    showBulkWarning({
      title: "Some assets already have a user assigned",
      body: "These assets already have a user assigned. Proceeding will replace their current assignment.",
      rows: buildBulkTechWarnRows(withTech, userMap),
      onProceed: openBulkTechDialog,
    });
  }

  function handleBulkUploadDocumentsClick() {
    const sel = visibleAssets.filter((a) => selectedAssetIds.has(a.id));
    const affected = buildBulkDocsWarnRows(sel, docsCountMap);
    if (affected.length === 0) {
      openBulkDocsDialog();
      return;
    }
    showBulkWarning({
      title: "Some assets already have documents",
      body: "Assets at the 3-document limit will be skipped. For assets with fewer than 3 documents, existing documents will NOT be deleted - the new document will be added alongside them.",
      rows: affected,
      onProceed: openBulkDocsDialog,
    });
  }

  async function buildPrintReportMeta() {
    const logoBase64 = await brandSettingsService.get().then((s) => s?.logoBase64 ?? null).catch(() => null);
    return {
      productName: activeProduct?.name ?? "",
      filterSummary: printScope === "selection"
        ? `${printRows.length} selected assets`
        : printScope === "custom"
        ? [printTechId ? `Tech: ${userMap.get(printTechId)?.fullName}` : "", printModel ? `Model: ${printModel}` : "", printPendingSig ? "Pending Sig" : ""].filter(Boolean).join(" | ")
        : "All visible assets",
      exportDate: new Date().toLocaleDateString(),
      logoBase64,
    };
  }

  async function handlePrintDownload() {
    setPrintGenerating(true);
    try {
      const { generateAssetListReport } = await import("../../utils/generateAssetListReport");
      await generateAssetListReport({
        rows: printRows,
        columns: printColumns.includes("assetTag") ? printColumns : ["assetTag", ...printColumns],
        groupBy: printGroupBy,
        meta: await buildPrintReportMeta(),
        mode: "download",
        filename: `assets-${activeProduct?.name ?? "report"}-${new Date().toISOString().slice(0, 10)}.pdf`,
      });
    } finally {
      setPrintGenerating(false);
    }
  }

  async function handlePrintAction() {
    setPrintGenerating(true);
    try {
      const { generateAssetListReport } = await import("../../utils/generateAssetListReport");
      await generateAssetListReport({
        rows: printRows,
        columns: printColumns.includes("assetTag") ? printColumns : ["assetTag", ...printColumns],
        groupBy: printGroupBy,
        meta: await buildPrintReportMeta(),
        mode: "print",
      });
    } finally {
      setPrintGenerating(false);
    }
  }

  // ------------------------------------------------------------------
  // Add asset
  // ------------------------------------------------------------------

  function openAdd() {
    setAddOpen(true);
  }

  async function handleImportCsv() {
    if (!activeProduct) return;
    await importCsv({
      activeProduct,
      projectId: selectedProjectId,
      fallbackProjectId: projects[0]?.id,
      workflowConfigs,
      onAssetsCreated: (created) => {
        setAssets((prev) => mergeImportedAssets(prev, created));
      },
      onRefresh: () => { void refreshAssets(); },
    });
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
    setEditAsset(asset);
  }

  function handleEditAssetUpdated(updated: ProjectAsset) {
    setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    setEditAsset((cur) => (cur?.id === updated.id ? updated : cur));
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
      const updated = await projectAssetService.patchIssues(issueDetailAsset.id, issuesJson);
      setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setIssueDetailAsset(updated);
      if (updatedIssue.resolved) {
        setIssueDetailIssueId(null);
        setIssueDetailAsset(null);
      }
    } catch (err) {
      console.error("[AssetInstallationPage] Failed to save asset issue", err);
      alert(err instanceof Error ? err.message : "Failed to save issue offline.");
    }
  }

  // ------------------------------------------------------------------
  // Workflow assignment helpers
  // ------------------------------------------------------------------

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

  async function openRunnerForSignoffReview(asset: ProjectAsset, run: AssetWorkflowRun) {
    markWorkflowOpenTap("assets-signoff-review", run.workflowConfigId);
    setRunnerLoading(asset.id);
    try {
      const cfgFromMemory = wfConfigMap.get(run.workflowConfigId) ?? null;
      const payload = await loadWorkflowOpenPayload(run.workflowConfigId, asset, {
        configFromMemory: cfgFromMemory,
        runs: runsMap[asset.id],
        mergeMedia: true,
      });
      if (!payload) {
        alert("Workflow config not found.");
        return;
      }

      setRunnerExistingRunId(run.id);
      setRunnerSignoffReviewMode(true);
      setRunnerAsset(asset);
      setRunnerWorkflow(payload.workflow);
      setRunnerWorkflowConfigId(run.workflowConfigId);
      setRunnerFeatureSelections(parseFeatureSelectionsForConfig(run.workflowConfigId));
      setRunnerOpen(true);
      refreshWorkflowOpenDataInBackground(asset.id, run.workflowConfigId);
    } catch {
      alert("Failed to load workflow.");
    } finally {
      setRunnerLoading(null);
    }
  }

  async function openSignatureFlow(asset: ProjectAsset, preferredRun?: AssetWorkflowRun | null) {
    let run = preferredRun ?? null;
    if (!run) {
      let assetRuns = runsMap[asset.id];
      if (!assetRuns) {
        try {
          assetRuns = await assetWorkflowRunService.listByAsset(asset.id);
          setRunsMap((prev) => ({ ...prev, [asset.id]: assetRuns! }));
        } catch {
          assetRuns = [];
        }
      }
      run = [...assetRuns]
        .filter((item) => isPendingInstallerSignature(item.signatureStatus) || isPendingCustomerSignature(item.signatureStatus))
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0] ?? null;
    }
    const canRequestCustomer = currentUser.role === "Admin" || currentUser.role === "Project Manager";
    if (run && isPendingInstallerSignature(run.signatureStatus)) {
      await openRunnerForSignoffReview(asset, run);
      return;
    }
    if (
      run
      && isPendingCustomerSignature(run.signatureStatus)
      && canRequestCustomer
    ) {
      const proj = projects.find((p) => p.id === asset.projectId);
      setSignatureFlowTarget({ asset, run, jobNumber: proj?.jobNumber });
      return;
    }
    void openRunHistory(asset, run?.workflowConfigId, undefined, "customer-sign");
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
          const resolved = rawLogo
            ? await import("../../utils/generateWorkflowReport").then(({ resolveImageToDataUrl }) => resolveImageToDataUrl(rawLogo))
            : null;
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
    return resolveAssetDisplayState(asset, projectWorkflowMode).status.label;
  }

  function getAssetActionLabel(asset: ProjectAsset, projectWorkflowMode?: string | null): string {
    return getPrimaryActionRef.current(asset, projectWorkflowMode)?.label ?? "No workflow";
  }

  function getOperationsExportCellText(
    colId: string,
    asset: ProjectAsset,
    cfg: ProductConfig | null | undefined,
    proj: ReturnType<typeof projectMap.get>,
    tech: ReturnType<typeof userMap.get>,
  ): string {
    return getOperationsColumnText(colId, asset, {
      officeZone,
      runs: runsMap[asset.id],
      project: proj ?? undefined,
      tech: tech ?? undefined,
      cfg,
      wfConfigById: wfConfigMap,
      featuresSummary: getCaptureStatusSummary(asset),
      statusLabel: getOperationsStatusLabel(asset, proj?.workflowMode),
    });
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
      const { resolveImageToDataUrl } = await import("../../utils/generateWorkflowReport");
      businessLogo = rawBusinessLogo ? await resolveImageToDataUrl(rawBusinessLogo) : null;
    }

    if (assetExportIncludeCustomerLogo && projectContext?.customerId) {
      const rawCustomerLogo = await customerService.getCustomers()
        .then((all) => all.find((customer) => customer.customerId === projectContext.customerId || customer.id === projectContext.customerId)?.logo ?? null)
        .catch(() => null);
      const { resolveImageToDataUrl } = await import("../../utils/generateWorkflowReport");
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

  async function buildAssetExportWorkbook(report: Awaited<ReturnType<typeof buildAssetExportPackage>>) {
    const XLSX = await import("xlsx");
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
        const workbook = await buildAssetExportWorkbook(report);
        const XLSX = await import("xlsx");
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
    setReportPreviewBlob(null);
  }

  async function openReportExportDialog(asset: ProjectAsset) {
    setReportExportAsset(asset);
    setReportPreviewContext(null);
    setReportPreviewFileBase(null);
    setReportPreviewError(null);
    setReportPreviewLoading(true);
    setReportPreviewBlob(null);
    setReportExportOpen(true);
    try {
      const reportContext = await buildAssetReportContext(asset);
      const { generateWorkflowReport } = await import("../../utils/generateWorkflowReport");
      const { workflowReportBaseFileName } = await import("../../utils/workflowReportExport");
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
      setReportPreviewBlob(pdfBlob);
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

    let run = pickCaptureRun(runs ?? []);

    // Web perf loads slim run summaries (empty stepResultsJson). Hydrate before report export.
    if (run && !runHasCaptureBlobs(run)) {
      try {
        const full = await assetWorkflowRunService.getById(run.id);
        if (full && runHasCaptureBlobs(full)) {
          run = full;
        } else {
          const loaded = await assetWorkflowRunService.loadRunDetailsForAssets(asset.projectId, [asset.id]);
          const hydrated = pickCaptureRun(loaded.filter((r) => r.assetId === asset.id));
          if (hydrated && runHasCaptureBlobs(hydrated)) run = hydrated;
        }
      } catch {
        /* keep best available run */
      }
    }

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
      brandSettings.logoBase64
        ? import("../../utils/generateWorkflowReport").then(({ resolveImageToDataUrl }) => resolveImageToDataUrl(brandSettings.logoBase64!))
        : Promise.resolve(null),
      rawCustomerLogo
        ? import("../../utils/generateWorkflowReport").then(({ resolveImageToDataUrl }) => resolveImageToDataUrl(rawCustomerLogo))
        : Promise.resolve(null),
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
      timeZoneId: await resolveProjectTimeZoneForReport(proj),
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
      const { generateWorkflowReport } = await import("../../utils/generateWorkflowReport");
      const {
        buildWorkflowReportJson,
        createWorkflowReportDocx,
        workflowReportBaseFileName,
      } = await import("../../utils/workflowReportExport");
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
    return (
      <AssetInstallationIssuesPanel
        asset={asset}
        runs={runsMap[asset.id] ?? []}
        currentUserName={currentUser?.fullName ?? "User"}
        inlineCommentTexts={inlineCommentTexts}
        inlineCorrectiveTexts={inlineCorrectiveTexts}
        inlineReportMedia={inlineReportMedia}
        inlineResolutionMedia={inlineResolutionMedia}
        inlineSaving={inlineSaving}
        onCommentTextChange={(issueId, text) =>
          setInlineCommentTexts((prev) => ({ ...prev, [issueId]: text }))
        }
        onCorrectiveTextChange={(issueId, text) =>
          setInlineCorrectiveTexts((prev) => ({ ...prev, [issueId]: text }))
        }
        onReportMediaChange={(issueId, media) =>
          setInlineReportMedia((prev) => ({ ...prev, [issueId]: media }))
        }
        onResolutionMediaChange={(issueId, media) =>
          setInlineResolutionMedia((prev) => ({ ...prev, [issueId]: media }))
        }
        onClearCommentText={(issueId) =>
          setInlineCommentTexts((prev) => ({ ...prev, [issueId]: "" }))
        }
        onClearCorrectiveText={(issueId) =>
          setInlineCorrectiveTexts((prev) => ({ ...prev, [issueId]: "" }))
        }
        onClearResolutionMedia={(issueId) =>
          setInlineResolutionMedia((prev) => ({ ...prev, [issueId]: [] }))
        }
        onSaveAssetIssue={saveInlineAssetIssue}
        onSaveRunIssue={saveInlineRunIssue}
        onOpenAddIssue={(a) => {
          setIssueDialogAsset(a);
          setIssueDialogOpen(true);
        }}
      />
    );
  }

  const workflowPresentation = useMemo(
    () =>
      createAssetInstallationWorkflowPresentation({
        runsMap,
        pausedProgress,
        assignmentsMap,
        runnerLoading,
        activeFeatures,
        projectMap,
        users,
        resolveAssetDisplayState,
        computeAssetHealth,
        checkAssignmentThenStart,
        openBlockingIssue,
        startAssetFromBestWorkflowSource,
        openSignatureFlow,
        openRunHistory,
        setImportDialogAsset,
        setPhotoUploadTarget,
        setProgressPopoverAnchor,
        setProgressPopoverAssetId,
      }),
    [
      runsMap,
      pausedProgress,
      assignmentsMap,
      runnerLoading,
      activeFeatures,
      projectMap,
      users,
      resolveAssetDisplayState,
      checkAssignmentThenStart,
      openBlockingIssue,
      startAssetFromBestWorkflowSource,
      openSignatureFlow,
      openRunHistory,
    ],
  );

  const {
    getPrimaryAction,
    actionButton,
    captureTableStatusChip,
    featureCompletenessChip,
    openMissingMediaDialog,
  } = workflowPresentation;

  getPrimaryActionRef.current = getPrimaryAction;

  function renderFeatureExpandedRow(asset: ProjectAsset) {
    return (
      <AssetInstallationFeatureExpandedRow
        featureValuesJson={asset.featureValuesJson}
        inventoryFeatures={activeFeatures.filter((feat) => feat.isInventory)}
      />
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

  const featureCompletenessChipRef = useRef(featureCompletenessChip);
  featureCompletenessChipRef.current = featureCompletenessChip;
  const captureTableStatusChipRef = useRef(captureTableStatusChip);
  captureTableStatusChipRef.current = captureTableStatusChip;

  const renderColumnCell = useMemo(
    () =>
      createOperationsColumnCellRenderer({
        officeZone,
        runsMap,
        wfConfigMap,
        renderFeatureCompletenessChip: (asset) => featureCompletenessChipRef.current(asset),
        renderStatusChip: (asset, mode) => captureTableStatusChipRef.current(asset, mode),
      }),
    [officeZone, runsMap, wfConfigMap],
  );

  function renderWorkflowAssignmentsPanel(asset: ProjectAsset) {
    return (
      <AssetInstallationWorkflowAssignmentsPanel
        asset={asset}
        assignments={assignmentsMap[asset.id] ?? []}
        runs={runsMap[asset.id] ?? []}
        runLoading={runnerLoading === asset.id}
        canModifyData={can.modifyData}
        expandedBomAsgnId={expandedBomAsgnId}
        onOpenInspections={setInspectionDialogAsset}
        onOpenAssignDialog={openAssignDialog}
        onToggleBomExpanded={setExpandedBomAsgnId}
        onOpenRunHistory={openRunHistory}
        onStartAssignment={checkAssignmentThenStart}
        onAssignmentContextMenu={(anchor, a, asgn) => {
          setContextMenuAnchor(anchor);
          setContextMenuAsset(a);
          setContextMenuAssignment(asgn);
        }}
        onRemoveAssignment={removeAssignment}
      />
    );
  }

  function renderTimeTrackingPanel(asset: ProjectAsset) {
    return <AssetInstallationTimeTrackingPanel runs={runsMap[asset.id] ?? []} />;
  }

  const renderOperationsAssetRows = useMemo(
    () =>
      createOperationsAssetRowRenderer({
        visibleColumns,
        expandedAssetId,
        selectedAssetIds,
        configMap,
        projectMap,
        userMap,
        runsMap,
        docsCountMap,
        reportGenerating,
        archiveMode,
        deletingAsset,
        purgingAsset,
        canRunAssetWorkflow,
        canManageAssetDocuments,
        canViewInstallationAssets,
        canEditInstallationAssets,
        canDeleteInstallationAssets,
        onToggleSelect: (assetId, checked) => {
          setSelectedAssetIds((prev) => {
            const next = new Set(prev);
            if (checked) next.add(assetId);
            else next.delete(assetId);
            return next;
          });
        },
        onToggleExpand: (assetId) => {
          setExpandedAssetId((prev) => (prev === assetId ? null : assetId));
        },
        loadAssignmentsForAsset,
        setDocsAsset,
        setDocsOpen,
        openReportExportDialog,
        openEditAsset,
        setDeleteAsset,
        confirmRestoreAsset,
        setPurgeAsset,
        canEditAssetFromWebTable,
        computeAssetHealth,
        issuesBadge,
        actionButton,
        renderColumnCell,
        renderFeatureExpandedRow,
        renderIssuesPanel,
        renderTimeTrackingPanel,
        renderWorkflowAssignmentsPanel,
      }),
    [
      visibleColumns,
      expandedAssetId,
      selectedAssetIds,
      configMap,
      projectMap,
      userMap,
      runsMap,
      docsCountMap,
      reportGenerating,
      archiveMode,
      deletingAsset,
      purgingAsset,
      canRunAssetWorkflow,
      canManageAssetDocuments,
      canViewInstallationAssets,
      canEditInstallationAssets,
      canDeleteInstallationAssets,
      loadAssignmentsForAsset,
      openReportExportDialog,
      openEditAsset,
      confirmRestoreAsset,
      canEditAssetFromWebTable,
    ],
  );

  const getProjectById = useCallback(
    (projectId: string) => projectMap.get(projectId),
    [projectMap],
  );

  const captureOnRunUpdated = useCallback((run: AssetWorkflowRun) => {
    startTransition(() => {
      setRunsMap((prev) => {
        const list = prev[run.assetId] ?? [];
        const next = list.some((r) => r.id === run.id)
          ? list.map((r) => (r.id === run.id ? run : r))
          : [...list, run];
        return { ...prev, [run.assetId]: next };
      });
    });
  }, []);

  const captureRenderStatusRef = useRef(captureTableStatusChip);
  captureRenderStatusRef.current = captureTableStatusChip;
  const captureRenderActionsRef = useRef(actionButton);
  captureRenderActionsRef.current = actionButton;

  const captureRenderStatus = useCallback(
    (asset: ProjectAsset) => captureRenderStatusRef.current(asset, projectMap.get(asset.projectId)?.workflowMode),
    [projectMap],
  );

  const captureRenderActions = useCallback(
    (asset: ProjectAsset) => {
      const proj = projectMap.get(asset.projectId);
      return (canRunAssetWorkflow || asset.status === "Complete" || asset.status === "Closed" || asset.status === "Cancelled")
        ? captureRenderActionsRef.current(asset, proj?.workflowMode)
        : null;
    },
    [projectMap, canRunAssetWorkflow],
  );

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
            {search.trim() && (
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                startIcon={<CloseOutlined sx={{ fontSize: 16 }} />}
                onClick={() => setSearch("")}
                sx={{ flexShrink: 0, fontSize: 11, whiteSpace: "nowrap", height: 34 }}
              >
                Clear search
              </Button>
            )}
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
          {search.trim() && (
            <Chip
              size="small"
              color="primary"
              variant="outlined"
              label={`Filter: ${search}`}
              onDelete={() => setSearch("")}
              sx={{ alignSelf: "flex-start", maxWidth: "100%" }}
            />
          )}
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
          {search.trim() && (
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              startIcon={<CloseOutlined sx={{ fontSize: 16 }} />}
              onClick={() => setSearch("")}
              sx={{ whiteSpace: "nowrap", height: 40 }}
            >
              Clear search
            </Button>
          )}
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

      {search.trim() && !isNativePlatform && (
        <Chip
          size="small"
          color="primary"
          variant="outlined"
          label={`Search filter: ${search}`}
          onDelete={() => setSearch("")}
          sx={{ alignSelf: "flex-start" }}
        />
      )}

      <AssetInstallationBulkToolbar
        selectedCount={selectedAssetIds.size}
        archiveMode={archiveMode}
        showBulkWorkflowReports={showBulkWorkflowReports}
        onAssignWorkflow={handleBulkAssignWorkflowClick}
        onAssignUser={handleBulkAssignUserClick}
        onUploadDocuments={handleBulkUploadDocumentsClick}
        onViewReports={() => setBulkWorkflowReportsOpen(true)}
        onArchiveSelected={() => setBulkDeleteOpen(true)}
        onClearSelection={() => setSelectedAssetIds(new Set())}
      />

      <AssetInstallationTableToolbar
        showAdvancedAssetActions={showAdvancedAssetActions}
        archiveMode={archiveMode}
        selectedCount={selectedAssetIds.size}
        displayAssetCount={displayAssets.length}
        showBulkWorkflowReports={showBulkWorkflowReports}
        selectedProjectHasInspection={selectedProjectHasInspection}
        selectedProject={selectedProject}
        onToggleArchiveMode={() => setArchiveMode((v) => !v)}
        onOpenPrintDialog={(scope) => {
          setPrintScope(scope);
          setPrintOpen(true);
        }}
        onOpenBulkReports={() => setBulkWorkflowReportsOpen(true)}
        onOpenExportDialog={openAssetExportDialog}
        onNavigateInspectionInbox={() => navigate(`/projects/${selectedProject!.id}/inspections/inbox`)}
      />

      <AssetInstallationExportDialog
        open={assetExportDialogOpen}
        running={assetExportRunning}
        rowCount={displayAssets.length}
        format={assetExportFormat}
        includeProjectMeta={assetExportIncludeProjectMeta}
        includeBusinessLogo={assetExportIncludeBusinessLogo}
        includeCustomerLogo={assetExportIncludeCustomerLogo}
        customerLogoAvailable={Boolean(assetExportSingleProject?.customerId)}
        columnOptions={assetExportColumnOptions}
        selectedColumnIds={assetExportSelectedColumnIds}
        onClose={() => setAssetExportDialogOpen(false)}
        onExport={() => void exportAssetDataset()}
        onFormatChange={setAssetExportFormat}
        onIncludeProjectMetaChange={setAssetExportIncludeProjectMeta}
        onIncludeBusinessLogoChange={setAssetExportIncludeBusinessLogo}
        onIncludeCustomerLogoChange={setAssetExportIncludeCustomerLogo}
        onSelectedColumnIdsChange={setAssetExportSelectedColumnIds}
      />

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
          <AssetInstallationMobileCardSkeleton />
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
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" onClick={() => { setAssetLoadError(null); void refreshAssets(); }}>
              Retry
            </Button>
          }
        >
          {isNativePlatform
            ? "Could not load assets — you may be offline. Open this project once while online, or pull down to refresh."
            : assetLoadError}
        </Alert>
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
        <AssetInstallationMobileCardStack
          assets={mobileAssets}
          projectMap={projectMap}
          userMap={userMap}
          runsMap={runsMap}
          pausedProgress={pausedProgress}
          expandedAssetId={expandedAssetId}
          onExpandToggle={(assetId, expanding) => {
            setExpandedAssetId(expanding ? assetId : null);
            if (expanding) loadAssignmentsForAsset(assetId);
          }}
          computeAssetHealth={computeAssetHealth}
          resolveAssetDisplayState={resolveAssetDisplayState}
          getPrimaryAction={getPrimaryAction}
          issuesBadge={issuesBadge}
          onOpenStatusMenu={(anchor, asset) => {
            setStatusMenuAnchor(anchor);
            setStatusMenuAsset(asset);
            loadAssignmentsForAsset(asset.id);
          }}
          renderFeatureExpandedRow={renderFeatureExpandedRow}
          renderIssuesPanel={renderIssuesPanel}
          renderTimeTrackingPanel={renderTimeTrackingPanel}
          renderWorkflowAssignmentsPanel={renderWorkflowAssignmentsPanel}
        />
      ) : (
        <AssetInstallationOperationsTable
          virtualize={virtualizeOperationsTable}
          scrollRef={operationsScrollRef}
          displayAssets={displayAssets}
          visibleColumns={visibleColumns}
          selectedAssetIds={selectedAssetIds}
          onToggleSelectAll={(selectAll) => {
            if (selectAll) setSelectedAssetIds(new Set(displayAssets.map((a) => a.id)));
            else setSelectedAssetIds(new Set());
          }}
          onOpenColumnMenu={(anchorEl, columnKey) => setAutoMenu({ anchorEl, key: columnKey })}
          renderAssetRows={renderOperationsAssetRows}
          paginatedWebProject={paginatedWebProject}
          projectAssetTotal={projectAssetTotal}
          projectAssetPage={projectAssetPage}
          pageSize={PROJECT_ASSET_PAGE_SIZE}
          onPageChange={setProjectAssetPage}
        />
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

      {/* Edit asset dialog — isolated so typing doesn't re-render the operations table */}
      <AssetEditDialog
        open={Boolean(editAsset)}
        asset={editAsset}
        users={users}
        latestPublishedWfConfigs={latestPublishedWfConfigs}
        getProject={getProjectById}
        getSiteLocation={getSiteLocation}
        canEditAssetStatus={canEditAssetStatus}
        onClose={() => setEditAsset(null)}
        onUpdated={handleEditAssetUpdated}
      />

      {/* Column sort / filter menu */}
      <Menu anchorEl={autoMenu.anchorEl} open={Boolean(autoMenu.anchorEl)} onClose={() => setAutoMenu({ anchorEl: null, key: "" })}>
        {(autoMenu.key === "dateCreated" || autoMenu.key === "dateClosed") ? (
          <>
            <MenuItem onClick={() => { if (autoMenu.key) setAutoSort({ key: autoMenu.key, dir: "asc" }); setAutoMenu({ anchorEl: null, key: "" }); }}>Sort oldest first</MenuItem>
            <MenuItem onClick={() => { if (autoMenu.key) setAutoSort({ key: autoMenu.key, dir: "desc" }); setAutoMenu({ anchorEl: null, key: "" }); }}>Sort newest first</MenuItem>
          </>
        ) : (
          <>
            <MenuItem onClick={() => { if (autoMenu.key) setAutoSort({ key: autoMenu.key, dir: "asc" }); setAutoMenu({ anchorEl: null, key: "" }); }}>Sort A → Z</MenuItem>
            <MenuItem onClick={() => { if (autoMenu.key) setAutoSort({ key: autoMenu.key, dir: "desc" }); setAutoMenu({ anchorEl: null, key: "" }); }}>Sort Z → A</MenuItem>
          </>
        )}
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

      <AssetInstallationArchiveConfirmDialog
        asset={deleteAsset}
        deleting={deletingAsset}
        onClose={() => setDeleteAsset(null)}
        onConfirm={confirmDeleteAsset}
      />

      <AssetInstallationBulkArchiveConfirmDialog
        open={bulkDeleteOpen}
        selectedCount={selectedAssetIds.size}
        deleting={bulkDeleting}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={confirmBulkDelete}
      />

      <AssetInstallationPurgeConfirmDialog
        asset={purgeAsset}
        purging={purgingAsset}
        onClose={() => setPurgeAsset(null)}
        onConfirm={confirmPurgeAsset}
      />

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

      <AssetInstallationColumnSettingsDialog
        open={colSettingsOpen}
        order={settingsOrder}
        hidden={settingsHidden}
        onClose={() => setColSettingsOpen(false)}
        onApply={applyColumnSettings}
        onOrderChange={setSettingsOrder}
        onHiddenChange={setSettingsHidden}
      />

      <AssetInstallationWorkflowAssignDialog
        open={assignDialogOpen}
        saving={assignSaving}
        asset={assignDialogAsset}
        form={assignForm}
        workflowConfigs={assignWorkflowConfigs}
        onClose={closeAssignDialog}
        onConfigChange={selectAssignConfig}
        onSave={() => { void saveAssignment(); }}
      />

      <AssetInstallationAssetSearchDialog
        open={assetSearchOpen}
        query={assetSearchQuery}
        activeFilter={search}
        assets={assets}
        users={users}
        projects={projects}
        captureIndexByAsset={captureIndexByAsset}
        onClose={() => setAssetSearchOpen(false)}
        onQueryChange={setAssetSearchQuery}
        onSelectAsset={(asset) => {
          setSearch(asset.assetTag);
          if (asset.projectId) setSelectedProjectId(asset.projectId);
          setAssetSearchOpen(false);
        }}
        onClearFilter={() => {
          setSearch("");
          setAssetSearchOpen(false);
        }}
      />

      <AssetInstallationCsvImportDialog
        open={csvImportOpen}
        importing={csvImporting}
        rows={csvRows}
        onClose={closeCsvImport}
        onRowsChange={setCsvRows}
        onImport={() => { void handleImportCsv(); }}
      />

      <AssetInstallationReportExportDialog
        open={reportExportOpen}
        asset={reportExportAsset}
        previewLoading={reportPreviewLoading}
        previewError={reportPreviewError}
        previewBlob={reportPreviewBlob}
        generatingAssetId={reportGenerating}
        onClose={closeReportExportDialog}
        onExportPdf={() => void handleAssetReportExport("pdf")}
        onExportJson={() => void handleAssetReportExport("json")}
        onExportDocx={() => void handleAssetReportExport("docx")}
      />

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

      {docsOpen && docsAsset && (
        <Suspense fallback={null}>
        <AssetDocumentsDialog
          open={docsOpen}
          onClose={() => setDocsOpen(false)}
          asset={docsAsset}
          currentUserName={currentUser?.fullName ?? ""}

          onDocsChanged={handleDocsChanged}
          products={products}
        />
        </Suspense>
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

      <WorkflowSignatureFlowHost
        target={signatureFlowTarget}
        assignedTechnician={currentUser?.fullName ?? undefined}
        canRequestCustomerSignature={currentUser.role === "Admin" || currentUser.role === "Project Manager"}
        onClose={() => setSignatureFlowTarget(null)}
        onComplete={() => { void refreshAssets(); }}
      />

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
              void openRunHistory(
                contextMenuAsset,
                contextMenuAssignment.workflowConfigId,
                contextMenuAssignment.workflowConfigName,
              );
            }
          }}
        >
          <ListItemIcon><HistoryOutlined fontSize="small" /></ListItemIcon>
          <ListItemText>View run history</ListItemText>
        </MenuItem>
      </Menu>

      <AssetInstallationWorkflowMismatchDialog
        message={wfMismatchConfirm?.message}
        onClose={() => setWfMismatchConfirm(null)}
        onConfirm={() => {
          const confirm = wfMismatchConfirm;
          setWfMismatchConfirm(null);
          if (confirm) void _doStartAssignmentRun(confirm.asset, confirm.assignment);
        }}
      />

      <AssetInstallationAutoAssignConfirmDialog
        confirm={autoAssignConfirm}
        currentUserName={currentUser.fullName}
        onClose={() => setAutoAssignConfirm(null)}
        onConfirm={confirmAutoAssignAndStart}
      />

      {runnerOpen && runnerWorkflow && runnerAsset && runnerProduct && (
        <Suspense fallback={null}>
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
            setRunnerSignoffReviewMode(false);
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
          signoffReviewMode={runnerSignoffReviewMode}
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
        </Suspense>
      )}

      {photoUploadTarget && (
        <Suspense fallback={null}>
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
        </Suspense>
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
              timeZoneId={runnerProjectTimeZone}
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
            timeZoneId={officeZone}
            onClose={() => { setIssueDetailIssueId(null); setIssueDetailAsset(null); setIssueDetailRunId(null); }}
            onSave={(updated) => handleIssueDetailSave(updated as AssetIssue)}
          />
        ) : null;
      })()}
      <AssetInstallationBulkWarnDialog
        open={bulkWarnOpen}
        title={bulkWarnTitle}
        body={bulkWarnBody}
        rows={bulkWarnRows}
        onClose={closeBulkWarning}
        onProceed={proceedBulkWarning}
      />

      <AssetInstallationBulkTechAssignDialog
        open={bulkTechOpen}
        saving={bulkTechSaving}
        assetCount={selectedAssetIds.size}
        users={users}
        selectedUserId={bulkTechId}
        onClose={closeBulkTechDialog}
        onUserChange={selectBulkTechUser}
        onApply={() => {
          void applyBulkTechAssign([...selectedAssetIds], () => {
            refreshAssets();
            setSelectedAssetIds(new Set());
          });
        }}
      />

      <AssetInstallationBulkWorkflowAssignDialog
        open={bulkWfOpen}
        saving={bulkWfSaving}
        assetCount={selectedAssetIds.size}
        workflowTypes={workflowTypes}
        filteredConfigs={filteredBulkWorkflowConfigs}
        latestPublishedConfigs={latestPublishedWfConfigs}
        workflowTypeId={bulkWfForm.workflowTypeId}
        workflowConfigId={bulkWfForm.workflowConfigId}
        onClose={closeBulkAssignDialog}
        onWorkflowTypeChange={selectBulkWorkflowType}
        onWorkflowConfigChange={selectBulkWorkflowConfig}
        onApply={() => {
          void applyBulkAssign([...selectedAssetIds], () => setSelectedAssetIds(new Set()));
        }}
      />

      <AssetInstallationPrintDialog
        open={printOpen}
        generating={printGenerating}
        scope={printScope}
        selectedCount={selectedAssetIds.size}
        visibleCount={visibleAssets.length}
        printRows={printRows}
        printColumns={printColumns}
        printGroupBy={printGroupBy}
        printTechId={printTechId}
        printModel={printModel}
        printStatuses={printStatuses}
        printPendingSig={printPendingSig}
        users={users}
        onClose={() => setPrintOpen(false)}
        onScopeChange={setPrintScope}
        onPrintTechIdChange={setPrintTechId}
        onPrintModelChange={setPrintModel}
        onPrintStatusesChange={setPrintStatuses}
        onPrintPendingSigChange={setPrintPendingSig}
        onPrintColumnsChange={setPrintColumns}
        onPrintGroupByChange={setPrintGroupBy}
        onDownload={() => void handlePrintDownload()}
        onPrint={() => void handlePrintAction()}
      />

      <AssetInstallationBulkDocsUploadDialog
        open={bulkDocsOpen}
        saving={bulkDocsSaving}
        assetCount={selectedAssetIds.size}
        file={bulkDocsFile}
        docType={bulkDocsType}
        docName={bulkDocsName}
        result={bulkDocsResult}
        onClose={closeBulkDocsDialog}
        onFileChange={selectBulkDocsFile}
        onDocTypeChange={setBulkDocsType}
        onDocNameChange={setBulkDocsName}
        onQrUploaded={(documentId) => {
          void attachBulkDocsQrUpload(documentId, {
            assetIds: [...selectedAssetIds],
            docsCountMap,
            uploadedBy: currentUser?.fullName ?? undefined,
            onDocLinked: (assetId) => {
              setDocsCountMap((prev) => ({ ...prev, [assetId]: (prev[assetId] ?? 0) + 1 }));
            },
            onComplete: (_result, clearSelection) => {
              if (clearSelection) setSelectedAssetIds(new Set());
            },
          });
        }}
        onUpload={() => {
          void uploadBulkDocsFile({
            assetIds: [...selectedAssetIds],
            docsCountMap,
            uploadedBy: currentUser?.fullName ?? undefined,
            onDocLinked: (assetId) => {
              setDocsCountMap((prev) => ({ ...prev, [assetId]: (prev[assetId] ?? 0) + 1 }));
            },
            onComplete: (_result, clearSelection) => {
              if (clearSelection) setSelectedAssetIds(new Set());
            },
          });
        }}
      />

      <AssetInspectionDialog
        asset={inspectionDialogAsset}
        open={!!inspectionDialogAsset}
        onClose={() => setInspectionDialogAsset(null)}
      />

      {isNativePlatform && (
        <Suspense fallback={null}>
        <CaptureSpreadsheetDialog
          open={capturePopupOpen}
          onClose={() => setCapturePopupOpen(false)}
          fullScreen
          hideSelectionColumn
          assets={mobileAssets}
          runsMap={runsMap}
          captureRunsLoading={libFeatures.length === 0}
          schemaFallback
          features={libFeatures}
          depsByFeature={depsByFeature}
          featureSelectionsByConfig={featureSelectionsByConfig}
          activeCountForAsset={getActiveCountForAsset}
          readOnly
          canEditCapture={false}
          onRunUpdated={captureOnRunUpdated}
          assetJobColumns={assetCaptureJobColumns}
          renderStatus={captureRenderStatus}
          renderActions={captureRenderActions}
        />
        </Suspense>
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

