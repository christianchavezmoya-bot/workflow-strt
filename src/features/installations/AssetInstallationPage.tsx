import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import {
  ArrowDropDown,
  CheckBoxOutlineBlankOutlined,
  CheckBoxOutlined,
  DrawOutlined,
  ErrorOutlined,
  PhotoCameraOutlined,
  RefreshOutlined,
  ReportProblemOutlined,
  ViewColumnOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Badge,
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
  FormGroup,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  Paper,
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
  Snackbar,
  Tooltip,
  Typography,
} from "@mui/material";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { resolveReportTimeZone } from "../../utils/datetime";
import { resolveProjectTimeZoneForReport } from "../../utils/projectTimeZone";
import { BulkWorkflowReportDialog } from "../../components/reports/BulkWorkflowReportDialog";
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
import { useMobileWebLayout } from "../../hooks/useMobileWebLayout";
import { useOfficeTimeZone } from "../../hooks/useOfficeTimeZone";
import { markWorkflowOpenTap } from "../../utils/workflowOpenPerf";
import {
  loadWorkflowOpenPayload,
  refreshWorkflowOpenDataInBackground,
  OFFLINE_CONFIG_MISSING_MESSAGE,
  retryOfflineDownload,
} from "../../services/workflowOpenService";
import AssetInstallationColumnFilterMenu from "./AssetInstallationColumnFilterMenu";
import AssetInstallationColumnSettingsDialog from "./AssetInstallationColumnSettingsDialog";
import AssetInstallationFilterBar from "./AssetInstallationFilterBar";
import AssetInstallationHealthSummaryBar from "./AssetInstallationHealthSummaryBar";
import AssetInstallationPageHeader from "./AssetInstallationPageHeader";
import AssetInstallationPausedProgressPopover from "./AssetInstallationPausedProgressPopover";
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
import AssetInstallationAddIssueDialog from "./AssetInstallationAddIssueDialog";
import {
  AssetInstallationAssignmentContextMenu,
  AssetInstallationRowActionsMenu,
} from "./AssetInstallationRowActionsMenu";
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
import { useAssetInstallationAssetSearch } from "./useAssetInstallationAssetSearch";
import { useAssetInstallationPrint } from "./useAssetInstallationPrint";
import { useAssetInstallationAssetExport } from "./useAssetInstallationAssetExport";
import {
  useAssetInstallationReportExport,
  type BuildAssetReportContextParams,
} from "./useAssetInstallationReportExport";
import {
  useAssetInstallationWorkflowLaunch,
  type AssetInstallationAutoAssignConfirm,
  type AssetInstallationWfMismatchConfirm,
} from "./useAssetInstallationWorkflowLaunch";
import { type AssetExportColumnOption } from "./assetInstallationDataExport";
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
  isInspectionConfigType,
  isInspectionWorkflowType,
  type AssetHealth,
} from "./assetInstallationPageLogic";

const WorkOrderRunner = lazy(() => import("../workInstructions/WorkOrderRunner"));
const CaptureSpreadsheetDialog = lazy(() => import("./CaptureSpreadsheetDialog"));
const PhotoUploadDialog = lazy(() => import("../dashboard/PhotoUploadDialog"));
const AssetDocumentsDialog = lazy(() => import("./AssetDocumentsDialog"));

// Reference media is merged inside loadWorkflowOpenPayload when mergeMedia: true.

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
  const {
    assetSearchOpen,
    assetSearchQuery,
    setAssetSearchQuery,
    openAssetSearch,
    closeAssetSearch,
  } = useAssetInstallationAssetSearch();
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
  const [autoAssignConfirm, setAutoAssignConfirm] = useState<AssetInstallationAutoAssignConfirm | null>(null);
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
  const [wfMismatchConfirm, setWfMismatchConfirm] = useState<AssetInstallationWfMismatchConfirm | null>(null);
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
  // Print / PDF dialog — state in useAssetInstallationPrint (after visibleAssets)
  // PDF report — state in useAssetInstallationReportExport (after wfConfigMap)
  // Asset export — state in useAssetInstallationAssetExport (after column options)
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

  const {
    printOpen,
    setPrintOpen,
    printScope,
    setPrintScope,
    printTechId,
    setPrintTechId,
    printModel,
    setPrintModel,
    printStatuses,
    setPrintStatuses,
    printPendingSig,
    setPrintPendingSig,
    printColumns,
    setPrintColumns,
    printGroupBy,
    setPrintGroupBy,
    printGenerating,
    printRows,
    handlePrintDownload,
    handlePrintAction,
  } = useAssetInstallationPrint({
    assets,
    visibleAssets,
    selectedAssetIds,
    userMap,
    projectMap,
    runsMap,
    assignmentsMap,
    activeProductName: activeProduct?.name,
  });

  const reportExportServices = useMemo(() => ({
    assetWorkflowRunService,
    customerService,
    brandSettingsService,
    featureService,
    signatureService,
    mediaStore,
    isMobileNativePlatform,
    pickCaptureRun,
    runHasCaptureBlobs,
    resolveProjectTimeZoneForReport,
  }), []);

  const {
    reportGenerating,
    reportExportOpen,
    reportExportAsset,
    reportPreviewBlob,
    reportPreviewLoading,
    reportPreviewError,
    openReportExportDialog,
    closeReportExportDialog,
    handleAssetReportExport,
    buildAssetReportContext,
  } = useAssetInstallationReportExport();

  const getReportExportContextParams = useCallback(
    (asset: ProjectAsset): BuildAssetReportContextParams => ({
      runsMap,
      wfConfigMap,
      users,
      projects,
      asset,
      ...reportExportServices,
    }),
    [runsMap, wfConfigMap, users, projects, reportExportServices],
  );

  const openReportExportDialogForAsset = useCallback(
    (asset: ProjectAsset) => void openReportExportDialog(asset, getReportExportContextParams(asset)),
    [openReportExportDialog, getReportExportContextParams],
  );

  const buildAssetReportContextForBulk = useCallback(
    (asset: ProjectAsset) => buildAssetReportContext(getReportExportContextParams(asset)),
    [buildAssetReportContext, getReportExportContextParams],
  );

  const exportReportFormat = useCallback(
    (format: "pdf" | "json" | "docx") => {
      if (!reportExportAsset) return;
      void handleAssetReportExport(format, getReportExportContextParams(reportExportAsset));
    },
    [handleAssetReportExport, getReportExportContextParams, reportExportAsset],
  );

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

  const {
    assetExportDialogOpen,
    setAssetExportDialogOpen,
    assetExportFormat,
    setAssetExportFormat,
    assetExportSelectedColumnIds,
    setAssetExportSelectedColumnIds,
    assetExportIncludeProjectMeta,
    setAssetExportIncludeProjectMeta,
    assetExportIncludeBusinessLogo,
    setAssetExportIncludeBusinessLogo,
    assetExportIncludeCustomerLogo,
    setAssetExportIncludeCustomerLogo,
    assetExportRunning,
    openAssetExportDialog,
    exportAssetDataset,
  } = useAssetInstallationAssetExport();

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

  const {
    startAssetFromBestWorkflowSource,
    doStartAssignmentRun,
    handleStartAssignmentRun,
    checkAssignmentThenStart,
    confirmAutoAssignAndStart,
  } = useAssetInstallationWorkflowLaunch({
    runsMap,
    wfConfigMap,
    publishedWfConfigs,
    workflowConfigs,
    workflowTypes,
    currentUserId: currentUser.id,
    users,
    autoAssignConfirm,
    setAssignmentsMap,
    setAssets,
    setInlineSaveError,
    setRunnerLoading,
    setRunnerExistingRunId,
    setRunnerAsset,
    setRunnerWorkflow,
    setRunnerWorkflowConfigId,
    setRunnerFeatureSelections,
    setRunnerOpen,
    setWfMismatchConfirm,
    setAutoAssignConfirm,
    parseFeatureSelectionsForConfig,
    handleStartWorkOrder,
  });

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
        openReportExportDialog: openReportExportDialogForAsset,
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
      openReportExportDialogForAsset,
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
      <AssetInstallationPageHeader
        activeProductName={activeProduct?.name}
        selectedProjectJobNumber={selectedProject?.jobNumber}
        selectedProjectHasInspection={selectedProjectHasInspection}
        showAdvancedAssetActions={showAdvancedAssetActions}
        canModifyData={can.modifyData}
        canCreateWorkflow={canCreateWorkflow}
        creatingWorkflowDraft={creatingWorkflowDraft}
        onRefresh={refreshAssets}
        onNavigateInspectionAssets={() => navigate(`/projects/${selectedProject!.id}`)}
        onCreateWorkflow={() => { void openWorkflowBuilderForProduct(); }}
        onImportCsv={() => {
          if (!activeProduct) return;
          workflowConfigService.listByProduct(activeProduct.id, "Published").then(setWorkflowConfigs);
          setCsvImportOpen(true);
        }}
        onAddAsset={openAdd}
      />

      {arrivalBanner && (
        <Alert severity={arrivalBanner.severity} sx={{ mt: 0.5 }}>
          {arrivalBanner.message}
        </Alert>
      )}

      {!loadingAssets && activeHealth && activeHealth.total > 0 && (
        <AssetInstallationHealthSummaryBar
          productName={activeProduct?.name}
          health={activeHealth}
          expanded={healthExpanded}
          onExpandedChange={setHealthExpanded}
          timeRollup={activeTimeRollup}
        />
      )}

      <AssetInstallationFilterBar
        isNativePlatform={isNativePlatform}
        projects={productProjects}
        selectedProjectId={selectedProjectId}
        allProjectsExplicit={allProjectsExplicit}
        search={search}
        statusFilter={statusFilter}
        showNoWorkflow={showNoWorkflow}
        mobileScope={mobileScope}
        canViewCaptureMatrix={canViewCaptureMatrix && !!activeProduct}
        onProjectChange={handleProjectChange}
        onSearchChange={setSearch}
        onOpenAssetSearch={openAssetSearch}
        onStatusFilterChange={setStatusFilter}
        onShowNoWorkflowChange={setShowNoWorkflow}
        onMobileScopeChange={setMobileScope}
        onOpenCaptureTable={() => setCapturePopupOpen(true)}
        onNavigateCaptureTable={(projectId) => navigate(`/installations/capture?project=${encodeURIComponent(projectId)}`)}
      />

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
        onOpenExportDialog={() => openAssetExportDialog(assetExportColumnOptions, Boolean(assetExportSingleProject?.customerId))}
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
        onExport={() => void exportAssetDataset({
          columnOptions: assetExportColumnOptions,
          displayAssets,
          products,
          projectMap,
          projectContext: assetExportSingleProject,
          activeProduct,
          archiveMode,
          showNoWorkflow,
          statusFilter,
          search,
          exportMode: assetExportMode,
        })}
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

      <AssetInstallationRowActionsMenu
        anchorEl={statusMenuAnchor}
        asset={statusMenuAsset}
        docsCount={statusMenuAsset ? (docsCountMap[statusMenuAsset.id] ?? 0) : 0}
        archiveMode={archiveMode}
        showAdvancedAssetActions={showAdvancedAssetActions}
        reportGeneratingAssetId={reportGenerating}
        deletingAsset={deletingAsset}
        purgingAsset={purgingAsset}
        canRunAssetWorkflow={canRunAssetWorkflow}
        canManageAssetDocuments={canManageAssetDocuments}
        canViewInstallationAssets={canViewInstallationAssets}
        canEditInstallationAssets={canEditInstallationAssets}
        canDeleteInstallationAssets={canDeleteInstallationAssets}
        canEditAsset={canEditAssetFromWebTable}
        projectWorkflowMode={statusMenuAsset ? projectMap.get(statusMenuAsset.projectId)?.workflowMode : undefined}
        renderWorkflowAction={actionButton}
        onClose={() => {
          setStatusMenuAnchor(null);
          setStatusMenuAsset(null);
        }}
        onOpenDocuments={(asset) => {
          setDocsAsset(asset);
          setDocsOpen(true);
        }}
        onOpenReport={openReportExportDialogForAsset}
        onEditAsset={openEditAsset}
        onArchiveAsset={setDeleteAsset}
        onRestoreAsset={confirmRestoreAsset}
        onPurgeAsset={setPurgeAsset}
      />

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

      <AssetInstallationColumnFilterMenu
        anchorEl={autoMenu.anchorEl}
        columnKey={autoMenu.key}
        filterOptions={assetFilterOptions[autoMenu.key] ?? []}
        selectedOptions={autoMenu.key ? autoFilters[autoMenu.key] : undefined}
        onClose={() => setAutoMenu({ anchorEl: null, key: "" })}
        onApplySort={(direction) => {
          if (autoMenu.key) setAutoSort({ key: autoMenu.key, dir: direction });
        }}
        onClearSort={() => setAutoSort({ key: "", dir: "asc" })}
        onToggleFilterOption={(option) => {
          if (!autoMenu.key) return;
          setAutoFilters((prev) => {
            const cur = new Set(prev[autoMenu.key] ?? []);
            if (cur.has(option)) cur.delete(option);
            else cur.add(option);
            return { ...prev, [autoMenu.key]: cur };
          });
        }}
      />

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

      <AssetInstallationAddIssueDialog
        open={issueDialogOpen}
        asset={issueDialogAsset}
        form={issueForm}
        media={issueMedia}
        onClose={() => {
          setIssueDialogOpen(false);
          setIssueDialogAsset(null);
          setIssueMedia([]);
        }}
        onFormChange={setIssueForm}
        onMediaChange={setIssueMedia}
        onSubmit={() => { void handleAddIssue(); }}
      />

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
        onClose={closeAssetSearch}
        onQueryChange={setAssetSearchQuery}
        onSelectAsset={(asset) => {
          setSearch(asset.assetTag);
          if (asset.projectId) setSelectedProjectId(asset.projectId);
          closeAssetSearch();
        }}
        onClearFilter={() => {
          setSearch("");
          closeAssetSearch();
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
        onExportPdf={() => exportReportFormat("pdf")}
        onExportJson={() => exportReportFormat("json")}
        onExportDocx={() => exportReportFormat("docx")}
      />

      <BulkWorkflowReportDialog
        open={bulkWorkflowReportsOpen}
        onClose={() => setBulkWorkflowReportsOpen(false)}
        assets={bulkReportSelectedAssets}
        buildReportContext={buildAssetReportContextForBulk}
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

      <AssetInstallationPausedProgressPopover
        anchorEl={progressPopoverAnchor}
        progress={progressPopoverAssetId ? pausedProgress[progressPopoverAssetId] : null}
        onClose={() => {
          setProgressPopoverAnchor(null);
          setProgressPopoverAssetId(null);
        }}
      />

      <AssetInstallationAssignmentContextMenu
        anchorEl={contextMenuAnchor}
        asset={contextMenuAsset}
        assignment={contextMenuAssignment}
        onClose={() => setContextMenuAnchor(null)}
        onRerunWorkflow={handleStartAssignmentRun}
        onViewRunHistory={(asset, assignment) => {
          void openRunHistory(asset, assignment.workflowConfigId, assignment.workflowConfigName);
        }}
      />

      <AssetInstallationWorkflowMismatchDialog
        message={wfMismatchConfirm?.message}
        onClose={() => setWfMismatchConfirm(null)}
        onConfirm={() => {
          const confirm = wfMismatchConfirm;
          setWfMismatchConfirm(null);
          if (confirm) void doStartAssignmentRun(confirm.asset, confirm.assignment);
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

