import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  Stack,
  Switch,
  Table,
  TextField,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
  Alert,
} from "@mui/material";
import { ArrowDropDown, CalendarTodayOutlined, DeleteForeverOutlined, DeleteOutline, EditOutlined, ExpandLess, ExpandMore, FilterAltOffOutlined, PersonOutlined, RestoreOutlined } from "@mui/icons-material";
import ProjectChevronPanel from "./ProjectChevronPanel";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import StatusChip from "../../components/ui/StatusChip";
import DeleteConfirmDialog from "../../components/ui/DeleteConfirmDialog";
import TableConfigDialog from "../../components/TableConfigDialog";
import { useActiveOffice } from "../../hooks/useActiveOffice";
import { useAuth } from "../../hooks/useAuth";
import { usePermissions } from "../../hooks/usePermissions";
import { useDynamicFields } from "../../hooks/useDynamicFields";
import { useTableConfig } from "../../hooks/useTableConfig";
import { useFieldDefinitions } from "../../hooks/useFieldDefinitions";
import { useWorkScope } from "../../hooks/useWorkScope";
import { fieldService } from "../../services/fieldService";
import { officesService } from "../../services/officesService";
import { buildProjectRequestKey, ProjectRepository, type ProjectRepositoryUpdateDetail } from "../../repositories/ProjectRepository";
import type { Office } from "../../components/GlobalOfficeMap";
import { createCountryResolver } from "../../utils/officeCountry";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { fetchProducts } from "../../store/productsSlice";
import { deleteProject, fetchProjects, setProjects } from "../../store/projectSlice";
import { projectService } from "../../services/projectService";
import { Project, ProjectStatus } from "../../types/project";
import ProjectEditDialog from "./ProjectEditDialog";
import { buildProjectListFilters } from "./buildProjectListFilters";
import { buildProjectChevronProps } from "./projectChevronProps";
import {
  executeProjectWorkflowAction,
  getProjectWorkflowActions,
  installationEnabledForProject,
  type ProjectWorkflowAction,
} from "./projectWorkflowActions";
import { useComplexView } from "../../contexts/ComplexViewContext";
import { isDesktopLikePlatform, isMobileNativePlatform } from "../../utils/platform";
import { CACHE_SOFT_LIMIT_MS, syncMetaGet } from "../../services/localDB";
import { useSyncEngine } from "../../hooks/useSyncEngine";
import { useStaleOnResume } from "../../hooks/useStaleOnResume";

// Style for field definition labels (yellow bold)
const fieldLabelStyle = {
  color: '#FFD700',
  fontWeight: 'bold'
};

const normalize = (value: string | number | undefined | null) => String(value ?? "");

const applyAutoSort = <T,>(
  rows: T[],
  sort: { key: string; dir: "asc" | "desc" },
  accessorMap: Record<string, (row: T) => string>
) => {
  if (!sort.key || !accessorMap[sort.key]) return rows;
  const accessor = accessorMap[sort.key];
  return [...rows].sort((a, b) => {
    const aVal = accessor(a).toLowerCase();
    const bVal = accessor(b).toLowerCase();
    if (aVal < bVal) return sort.dir === "asc" ? -1 : 1;
    if (aVal > bVal) return sort.dir === "asc" ? 1 : -1;
    return 0;
  });
};

type ColumnConfig = {
  id: string;
  name: string;
  required: boolean;
  minWidth?: number;
  maxWidth?: number;
  renderCell: (project: Project, products: any[]) => React.ReactNode;
};

const DEFAULT_PROJECT_COLUMN_ORDER = [
  "jobNumber",
  "projectManager",
  "customerName",
  "products",
  "siteName",
  "region",
  "description",
  "startDate",
  "finishDate",
  "status",
  "projectType",
  "customerId",
  "office",
];

const PROJECT_CHEVRON_W = 40;
const PROJECT_INDEX_W = 56;
// "#" and Job Number are both pinned, so the row stays identifiable while the table is
// scrolled horizontally. Job Number therefore has to clear the chevron AND the index.
const PROJECT_INDEX_STICKY_LEFT = PROJECT_CHEVRON_W;
const PROJECT_JOB_STICKY_LEFT = PROJECT_CHEVRON_W + PROJECT_INDEX_W;
const stickyCol = (left: number, zIndex: number) => ({
  position: "sticky" as const,
  left,
  zIndex,
  bgcolor: "background.paper",
});

const PROJECT_JOB_LABEL_W = 132;
const projectJobLabelSx = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: PROJECT_JOB_LABEL_W,
  width: PROJECT_JOB_LABEL_W,
  minHeight: 28,
  borderRadius: 1,
  px: 0.75,
  py: 0.25,
  background: "linear-gradient(135deg, rgba(45,212,191,0.2), rgba(45,212,191,0.1))",
  border: "1px solid rgba(45,212,191,0.3)",
} as const;

const projectAssetCountBadgeSx = {
  ml: 0.5,
  minWidth: 22,
  px: 0.5,
  py: 0.1,
  borderRadius: 1,
  fontSize: "0.6rem",
  fontWeight: 700,
  lineHeight: 1.6,
  textAlign: "center" as const,
  background: "rgba(45,212,191,0.25)",
  color: "rgba(45,212,191,1)",
  border: "1px solid rgba(45,212,191,0.4)",
  letterSpacing: "0.02em",
};

const builtInColumnConfigs: ColumnConfig[] = [
  {
    id: "jobNumber",
    name: "Job Number",
    required: true,
    minWidth: 120,
    renderCell: (project: Project) => (
      <Box component="span" sx={projectJobLabelSx}>
        <Button
          component={Link}
          to={`/installations/assets?product=${encodeURIComponent(project.productIds?.[0] ?? "")}&project=${encodeURIComponent(project.id)}`}
          sx={{ minWidth: 0, padding: 0, fontSize: "0.8125rem", fontWeight: 700, flex: 1, textAlign: "center" }}
        >
          {project.jobNumber}
        </Button>
        {(project.assetCount ?? 0) > 0 && (
          <Box component="span" sx={projectAssetCountBadgeSx}>
            {project.assetCount}
          </Box>
        )}
      </Box>
    )
  },
  {
    id: "projectManager",
    name: "Project Manager",
    required: false,
    minWidth: 130,
    renderCell: (project: Project) => project.projectManager || "-"
  },
  {
    id: "customerName",
    name: "Customer name",
    required: false,
    minWidth: 150,
    renderCell: (project: Project) => project.customerName || "-"
  },
  {
    id: "products",
    name: "Product name",
    required: true,
    minWidth: 150,
    renderCell: (project: Project, products: any[]) =>
      project.productIds?.length
        ? project.productIds
            .map((productId) => products.find((product) => product.id === productId)?.name || productId)
            .join(", ")
        : "-"
  },
  {
    id: "siteName",
    name: "Site",
    required: false,
    minWidth: 160,
    renderCell: (project: Project) => project.siteName || "-"
  },
  {
    id: "region",
    name: "Country/State",
    required: false,
    minWidth: 120,
    renderCell: (project: Project) => project.region || "-"
  },
  {
    id: "description",
    name: "Description",
    required: true,
    minWidth: 200,
    maxWidth: 300,
    renderCell: (project: Project) => project.description || "-"
  },
  {
    id: "startDate",
    name: "Start Date",
    required: true,
    minWidth: 110,
    renderCell: (project: Project) => project.startDate || "-"
  },
  {
    id: "finishDate",
    name: "Finish Date",
    required: true,
    minWidth: 110,
    renderCell: (project: Project) => project.finishDate || "-"
  },
  {
    id: "status",
    name: "Status",
    required: true,
    minWidth: 120,
    renderCell: (project: Project) => <StatusChip status={project.status} />
  },
  {
    id: "projectType",
    name: "Project Type",
    required: true,
    minWidth: 120,
    renderCell: (project: Project) => project.projectType || "-"
  },
  {
    id: "customerId",
    name: "Customer ID",
    required: true,
    minWidth: 120,
    renderCell: (project: Project) => project.customerId || "-"
  },
  {
    id: "office",
    name: "Office",
    required: true,
    minWidth: 120,
    renderCell: (project: Project) => project.office || "-"
  }
];

const PROJECT_BUILTIN_COLUMN_IDS = new Set(builtInColumnConfigs.map((col) => col.id));

/** Dynamic field names that duplicate built-in project columns (Mac DB had overlaps). */
const PROJECT_DUPLICATE_DYNAMIC_NAMES = new Set([
  "job number",
  "project manager",
  "customer name",
  "customer",
  "product name",
  "products",
  "site",
  "country/state",
  "description",
  "start date",
  "finish date",
  "status",
  "project type",
  "customer id",
  "office",
  "global offices",
  "global office",
]);

function isDuplicateProjectDynamicField(field: { id: string; name: string }): boolean {
  if (PROJECT_BUILTIN_COLUMN_IDS.has(field.id)) return true;
  const normalized = field.name.trim().toLowerCase();
  if (PROJECT_DUPLICATE_DYNAMIC_NAMES.has(normalized)) return true;
  return builtInColumnConfigs.some((col) => col.name.trim().toLowerCase() === normalized);
}

const applyAutoFilter = <T,>(
  rows: T[],
  filters: Record<string, Set<string>>,
  accessorMap: Record<string, (row: T) => string>
) => {
  return rows.filter((row) =>
    Object.entries(filters).every(([key, selected]) => {
      if (!selected || selected.size === 0) return true;
      const value = accessorMap[key]?.(row) ?? "";
      return selected.has(value);
    })
  );
};

const ProjectList = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { user } = useAuth();
  const can = usePermissions();
  const { activeOffice } = useActiveOffice();
  const { isMyWork, canUseOfficeView } = useWorkScope();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const dispatch = useAppDispatch();
  const { items, total, loading, error } = useAppSelector((state) => state.projects);
  const { isOnline } = useSyncEngine();
  const [projectsCacheStale, setProjectsCacheStale] = useState(false);
  const productsState = useAppSelector((state) => state.products);
  const projectsDynamic = useDynamicFields("projects");
  const [tableConfigOpen, setTableConfigOpen] = useState(false);
  const [globalOffices, setGlobalOffices] = useState<Office[]>([]);

  const projectsDynamicFieldDefs = useMemo(
    () => projectsDynamic.definitions.filter((field) => !isDuplicateProjectDynamicField(field)),
    [projectsDynamic.definitions]
  );

  useEffect(() => {
    officesService.getAll().then(setGlobalOffices);
  }, []);

  const projectsTableConfig = useTableConfig(
    "projects",
    projectsDynamicFieldDefs.map((field) => ({
      id: field.id,
      name: field.name,
      type: field.fieldType,
      linkToFieldId: field.linkToFieldId,
      actionType: field.actionType
    }))
  );
  const allFieldDefinitions = useFieldDefinitions();
  const projectDynamicColumns = useMemo(
    // Show all dynamic fields assigned to Projects, even if none have values yet.
    () => projectsTableConfig.visibleFields,
    [projectsTableConfig.visibleFields]
  );
  const availableFieldsForProjects = useMemo(
    () => allFieldDefinitions.definitions.filter((field) => !field.tables.includes("projects")),
    [allFieldDefinitions.definitions]
  );
  const [autoSort, setAutoSort] = useState({ key: "", dir: "asc" as "asc" | "desc" });
  const [autoFilters, setAutoFilters] = useState<Record<string, Set<string>>>({});
  const [autoMenu, setAutoMenu] = useState<{ anchorEl: HTMLElement | null; key: string }>({
    anchorEl: null,
    key: ""
  });
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<Project | null>(null);
  const [deleteSavingId, setDeleteSavingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [projectNumberFilter, setProjectNumberFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "All">("All");
  const isAdminUser = user?.role === "Admin";
  const isPmUser = user?.role === "Project Manager";
  const canCreateProjects = isAdminUser || isPmUser;
  const canManageProjectTable = isAdminUser || isPmUser;
  const { complexViewActive } = useComplexView();
  // Web always shows full management controls; native keeps them behind Complex View.
  const showComplexControls = isDesktopLikePlatform() || complexViewActive;

  const canEditProject = useMemo(() => (project: Project) => {
    if (isAdminUser) return true;
    if (!isPmUser) return false;
    return project.assignedPmUserId === user?.id;
  }, [isAdminUser, isPmUser, user?.id]);

  const canEditProjectFromWebTable = useMemo(() => (project: Project) => {
    if (can.projects?.editScope === "all") return true;
    if (can.projects?.editScope !== "own") return false;
    if (project.assignedPmUserId && project.assignedPmUserId === user?.id) return true;
    // Fallback for legacy rows where the PM name is visible but the owner id was not populated.
    return String(project.projectManager ?? "").trim().toLowerCase() === String(user?.fullName ?? "").trim().toLowerCase();
  }, [can.projects?.editScope, user?.fullName, user?.id]);

  // Block-complete dialog — shown when assets are not all done
  const [closingProjectId, setClosingProjectId] = useState<string | null>(null);

  // Clear column filters when active office changes
  useEffect(() => {
    setAutoFilters({});
    setPage(0);
  }, [activeOffice]);

  useEffect(() => {
    setPage(0);
  }, [showArchived, projectNumberFilter, statusFilter]);

  useEffect(() => {
    if (!isMobileNativePlatform()) return;
    void syncMetaGet("projects").then((lastSync) => {
      if (!lastSync) return;
      setProjectsCacheStale(Date.now() - new Date(lastSync).getTime() > CACHE_SOFT_LIMIT_MS);
    });
  }, [items.length]);

  const listFilters = useMemo(
    () =>
      buildProjectListFilters({
        activeOffice,
        statusFilter,
        projectNumberFilter,
        showArchived,
      }),
    [activeOffice, projectNumberFilter, showArchived, statusFilter]
  );

  const currentRequestKey = useMemo(() => buildProjectRequestKey(listFilters), [listFilters]);

  const reloadProjects = useCallback(() => {
    dispatch(fetchProjects(listFilters));
  }, [dispatch, listFilters]);

  useEffect(() => {
    reloadProjects();
  }, [reloadProjects]);

  useStaleOnResume("projects", useCallback(() => {
    void ProjectRepository.syncCatalogFromServer();
  }, []));

  useEffect(() => {
    const handleUpdated = (event: Event) => {
      const detail = (event as CustomEvent<ProjectRepositoryUpdateDetail>).detail;
      if (!detail) return;
      if (isMobileNativePlatform()) {
        reloadProjects();
        setProjectsCacheStale(false);
        return;
      }
      if (detail.requestKey !== currentRequestKey) return;
      dispatch(setProjects({ items: detail.items, total: detail.total }));
    };
    window.addEventListener("repo:projects:updated", handleUpdated);
    return () => window.removeEventListener("repo:projects:updated", handleUpdated);
  }, [currentRequestKey, dispatch, reloadProjects]);

  useEffect(() => {
    if (productsState.hasFetchedOnce || productsState.loading) return;
    dispatch(fetchProducts());
  }, [dispatch, productsState.hasFetchedOnce, productsState.loading]);

  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId || loading) return;
    const exists = items.some((project) => project.id === openId);
    if (!exists) return;
    setExpandedProjectId(openId);
    const next = new URLSearchParams(searchParams);
    next.delete("open");
    setSearchParams(next, { replace: true });
  }, [items, loading, searchParams, setSearchParams]);

  const sourceProjects = items;
  const products = productsState.items;

  const countryForOffice = useMemo(() => createCountryResolver(globalOffices), [globalOffices]);

  const projectAccessors = useMemo(
    () => ({
      jobNumber: (project: Project) => normalize(project.jobNumber),
      customerName: (project: Project) => normalize(project.customerName),
      siteName: (project: Project) => normalize(project.siteName),
      customerId: (project: Project) => normalize(project.customerId),
      products: (project: Project) =>
        normalize(
          project.productIds?.length
            ? project.productIds
                .map((productId) => products.find((product) => product.id === productId)?.name || productId)
                .join(", ")
            : ""
        ),
      office: (project: Project) => normalize(project.office),
      region: (project: Project) => normalize(project.region),
      projectManager: (project: Project) => normalize(project.projectManager),
      description: (project: Project) => normalize(project.description),
      startDate: (project: Project) => normalize(project.startDate),
      finishDate: (project: Project) => normalize(project.finishDate),
      status: (project: Project) => normalize(project.status),
      projectType: (project: Project) => normalize(project.projectType)
    }),
    [products]
  );

  const filteredProjects = useMemo(() => {
    const role = user?.role ?? "";
    const isAdmin = role === "Admin";
    const isCustomer = role === "Customer";

    if (isCustomer) return [];

    // Office-based filter. Guard: skip until globalOffices have loaded so
    // countryForOffice("Newcastle") resolves to "Australia" rather than falling
    // back to the raw string and incorrectly excluding all projects.
    const officeFiltered = sourceProjects.filter((project) => {
      if (isAdmin || activeOffice === "All") return true;
      if (globalOffices.length === 0) return true; // offices not yet loaded — don't filter
      const projectCountry = countryForOffice(project.office);
      return projectCountry === activeOffice || project.office === activeOffice;
    });

    const filtered = applyAutoFilter(officeFiltered, autoFilters, projectAccessors);
    return applyAutoSort(filtered, autoSort, projectAccessors);
  }, [activeOffice, globalOffices, sourceProjects, autoFilters, autoSort, projectAccessors, countryForOffice, user?.role]);

  const numberedProjects = useMemo(
    () => filteredProjects.map((project, index) => ({ ...project, seq: index + 1 })),
    [filteredProjects]
  );

  const pagedProjects = useMemo(() => {
    const start = page * rowsPerPage;
    return numberedProjects.slice(start, start + rowsPerPage);
  }, [numberedProjects, page, rowsPerPage]);

  const totalCount = filteredProjects.length;

  const projectActionOptions = useMemo(
    () => ({
      userRole: user?.role,
      canApprove: !!can.projects?.approve,
    }),
    [can.projects?.approve, user?.role]
  );

  const handleAction = async (project: Project, label: ProjectWorkflowAction) => {
    await executeProjectWorkflowAction(dispatch, navigate, project, label, {
      onBeforeClose: () => setClosingProjectId(project.id ?? null),
      onAfterClose: () => setClosingProjectId(null),
      onError: (message) => window.alert(message),
    });
  };

  const renderActions = (project: Project, surface: "list-web" | "list-mobile") => {
    const actions = getProjectWorkflowActions(project, {
      ...projectActionOptions,
      canEditProject:
        surface === "list-web"
          ? canEditProjectFromWebTable(project)
          : canEditProject(project),
      installationEnabled: installationEnabledForProject(project.workflowMode),
      surface,
    });

    if (actions.length === 0) {
      return null;
    }

    return (
      <Stack direction="row" spacing={1} flexWrap="nowrap">
        {actions.map((label) => (
          <Button
            key={label}
            size="small"
            variant="outlined"
            color="primary"
            disabled={label === "Mark as Closed" && closingProjectId === project.id}
            startIcon={label === "Mark as Closed" && closingProjectId === project.id
              ? <CircularProgress size={12} /> : undefined}
            onClick={() => void handleAction(project, label)}
          >
            {label}
          </Button>
        ))}
      </Stack>
    );
  };

  const projectFilterOptions = useMemo(
    () => ({
      jobNumber: Array.from(new Set(sourceProjects.map((project) => projectAccessors.jobNumber(project)))).sort(),
      customerName: Array.from(new Set(sourceProjects.map((project) => projectAccessors.customerName(project)))).sort(),
      siteName: Array.from(new Set(sourceProjects.map((project) => projectAccessors.siteName(project)))).sort(),
      customerId: Array.from(new Set(sourceProjects.map((project) => projectAccessors.customerId(project)))).sort(),
      products: Array.from(new Set(sourceProjects.map((project) => projectAccessors.products(project)))).sort(),
      office: Array.from(new Set(sourceProjects.map((project) => projectAccessors.office(project)))).sort(),
      region: Array.from(new Set(sourceProjects.map((project) => projectAccessors.region(project)))).sort(),
      projectManager: Array.from(new Set(sourceProjects.map((project) => projectAccessors.projectManager(project)))).sort(),
      description: Array.from(new Set(sourceProjects.map((project) => projectAccessors.description(project)))).sort(),
      startDate: Array.from(new Set(sourceProjects.map((project) => projectAccessors.startDate(project)))).sort(),
      finishDate: Array.from(new Set(sourceProjects.map((project) => projectAccessors.finishDate(project)))).sort(),
      status: Array.from(new Set(sourceProjects.map((project) => projectAccessors.status(project)))).sort(),
      projectType: Array.from(new Set(sourceProjects.map((project) => projectAccessors.projectType(project)))).sort()
    }),
    [sourceProjects, projectAccessors]
  );

  const orderedColumns = useMemo(() => {
    const builtInIds = builtInColumnConfigs.map((col) => col.id);
    const dynamicIds = projectDynamicColumns.map((field) => field.id);
    const cityField = projectDynamicColumns.find(
      (field) => /city/i.test(field.name) || /city/i.test(field.id),
    );

    let order: string[];
    if (projectsTableConfig.config.order.length > 0) {
      order = [...projectsTableConfig.config.order];
      const allIds = [...builtInIds, ...dynamicIds];
      const remaining = allIds.filter((id) => !order.includes(id));
      order = [...order, ...remaining];
    } else {
      order = [...DEFAULT_PROJECT_COLUMN_ORDER];
      if (cityField && !order.includes(cityField.id)) {
        const siteIdx = order.indexOf("siteName");
        order.splice(siteIdx >= 0 ? siteIdx + 1 : order.length, 0, cityField.id);
      }
      const remainingDynamic = dynamicIds.filter((id) => !order.includes(id));
      order = [...order, ...remainingDynamic];
    }

    const hiddenSet = new Set(projectsTableConfig.config.hidden);

    return order
      .filter((id) => !hiddenSet.has(id))
      .map((id) => {
        const builtIn = builtInColumnConfigs.find((col) => col.id === id);
        if (builtIn) {
          const overrideName = projectsTableConfig.config.baseFieldNames?.[builtIn.id];
          return { ...builtIn, name: overrideName || builtIn.name, isBuiltIn: true };
        }
        const dynamic = projectDynamicColumns.find((field) => field.id === id);
        if (dynamic) {
          return {
            id: dynamic.id,
            name: dynamic.name,
            required: false,
            isBuiltIn: false,
            renderCell: (project: Project) =>
              projectsDynamic.valuesByEntity[project.id]?.[dynamic.id]?.value || "-"
          };
        }
        return null;
      })
      .filter((col): col is NonNullable<typeof col> => col !== null);
  }, [projectsTableConfig.config.order, projectsTableConfig.config.hidden, projectDynamicColumns, projectsDynamic.valuesByEntity]);

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems="center">
        <Box>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="h5" sx={{ fontFamily: "Sora" }}>
              Projects
            </Typography>
            {isMyWork && canUseOfficeView && (
              <Chip label="My Work" color="primary" size="small" />
            )}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Showing {activeOffice === "All" ? "all offices" : activeOffice} {showArchived ? "projects including archived records." : "projects."}
          </Typography>
        </Box>
        {showComplexControls && (
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <FormControlLabel
              control={<Switch size="small" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />}
              label="Show archived"
            />
            {canCreateProjects && (
              <Tooltip title={!isOnline && isMobileNativePlatform() ? "Connect to the server to create projects" : ""}>
                <span>
                  <Button
                    variant="contained"
                    component={Link}
                    to="/projects/new"
                    disabled={!isOnline && isMobileNativePlatform()}
                  >
                    Create project
                  </Button>
                </span>
              </Tooltip>
            )}
            {canManageProjectTable && (
              <Button variant="outlined" onClick={() => setTableConfigOpen(true)}>
                Table configuration
              </Button>
            )}
          </Stack>
        )}
      </Stack>

      {projectsCacheStale && isMobileNativePlatform() && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Project list may be out of date — connect to refresh.
        </Alert>
      )}

      <Box className="glass-card" sx={{ p: 2 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }}>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="project-status-filter-label">Status</InputLabel>
            <Select
              labelId="project-status-filter-label"
              label="Status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as ProjectStatus | "All")}
            >
              <MenuItem value="All">All statuses</MenuItem>
              {(["Draft", "In Planning", "Pending Approval", "Approved", "In Progress", "On Hold", "Completed", "Closed", "Cancelled"] as const).map((status) => (
                <MenuItem key={status} value={status}>{status}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="Project number"
            placeholder="Search job / project number"
            value={projectNumberFilter}
            onChange={(event) => setProjectNumberFilter(event.target.value)}
            sx={{ minWidth: { xs: "100%", md: 280 } }}
          />
          <Tooltip title="Reset filters">
            <span>
              <IconButton
                size="small"
                onClick={() => {
                  setStatusFilter("All");
                  setProjectNumberFilter("");
                  setAutoFilters({});
                }}
                sx={{
                  border: "1px solid",
                  borderColor: (statusFilter !== "All" || !!projectNumberFilter || Object.keys(autoFilters ?? {}).length > 0)
                    ? "primary.main" : "divider",
                  color: (statusFilter !== "All" || !!projectNumberFilter || Object.keys(autoFilters ?? {}).length > 0)
                    ? "primary.main" : "text.disabled",
                  borderRadius: 1.5,
                  p: 0.75,
                  flexShrink: 0,
                }}
              >
                <FilterAltOffOutlined sx={{ fontSize: 18 }} />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Box>

      {error && (
        <Typography variant="body2" color="warning.main">
          Unable to load the latest server project data.
        </Typography>
      )}

      {/* ── Mobile card list ── */}
      {isMobile && (
        <Stack spacing={1} sx={{ mb: 10 }}>
          {loading ? (
            <Stack alignItems="center" py={6}><CircularProgress size={28} /></Stack>
          ) : pagedProjects.length === 0 ? (
            <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>
              No projects found.
            </Typography>
          ) : pagedProjects.map((project) => {
            const isExpanded = expandedProjectId === project.id;
            const productNames = (project.productIds ?? [])
              .map((id) => products.find((p) => p.id === id)?.name ?? id)
              .join(", ");

            const mobileActions = getProjectWorkflowActions(project, {
              ...projectActionOptions,
              canEditProject: canEditProject(project),
              installationEnabled: installationEnabledForProject(project.workflowMode),
              surface: "list-mobile",
            });

            return (
              <Box key={project.id} className="glass-card" sx={{
                overflow: "hidden",
                transition: "border-color 0.2s, background 0.2s",
                "&:hover": {
                  borderColor: "rgba(45,212,191,0.35)",
                  background: "rgba(45,212,191,0.04)",
                },
              }}>
                {/* Tap row to expand */}
                <Box sx={{ px: 1.5, py: 1.25, cursor: "pointer" }}
                  onClick={() => setExpandedProjectId(isExpanded ? null : project.id)}>
                  <Stack direction="row" alignItems="flex-start" spacing={1}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      {/* Job number (plain) + asset count badge (always) + status */}
                      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.4 }}>
                        <Box sx={projectJobLabelSx}>
                          <Typography variant="body2" fontWeight={700} noWrap sx={{ flex: 1, textAlign: "center" }}>
                            {project.jobNumber}
                          </Typography>
                          <Box component="span" sx={projectAssetCountBadgeSx}>
                            {project.assetCount ?? 0}
                          </Box>
                        </Box>
                        <Box sx={{ ml: "auto", flexShrink: 0 }}><StatusChip status={project.status} /></Box>
                      </Stack>

                      {/* Customer + site */}
                      {project.customerName && (
                        <Typography variant="body2" fontWeight={600} noWrap>{project.customerName}</Typography>
                      )}
                      {project.siteName && (
                        <Typography variant="caption" color="text.secondary" noWrap>{project.siteName}</Typography>
                      )}

                      {/* PM + product */}
                      <Stack direction="row" spacing={1} sx={{ mt: 0.4, flexWrap: "wrap", gap: 0.25 }}>
                        {project.projectManager && (
                          <Stack direction="row" alignItems="center" spacing={0.25}>
                            <PersonOutlined sx={{ fontSize: 12, color: "text.disabled" }} />
                            <Typography variant="caption" color="text.disabled">{project.projectManager}</Typography>
                          </Stack>
                        )}
                        {productNames && (
                          <Typography variant="caption" color="text.disabled" noWrap>· {productNames}</Typography>
                        )}
                      </Stack>

                      {/* Dates */}
                      {(project.startDate || project.finishDate) && (
                        <Stack direction="row" alignItems="center" spacing={0.25} sx={{ mt: 0.25 }}>
                          <CalendarTodayOutlined sx={{ fontSize: 11, color: "text.disabled" }} />
                          <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.65rem" }}>
                            {project.startDate || "?"} → {project.finishDate || "?"}
                          </Typography>
                        </Stack>
                      )}
                    </Box>

                    <IconButton size="small" sx={{ flexShrink: 0, mt: -0.25 }}>
                      {isExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                    </IconButton>
                  </Stack>

                  {/* Bottom row: Assets button + Edit/Delete + workflow actions */}
                  <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 1 }}
                    onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="small"
                      variant="outlined"
                      component={Link}
                      to={`/installations/assets?product=${encodeURIComponent(project.productIds?.[0] ?? "")}&project=${encodeURIComponent(project.id)}`}
                      sx={{ fontSize: "0.7rem", py: 0.25, px: 1, height: 26, flexShrink: 0 }}
                    >
                      Assets
                    </Button>
                    {mobileActions.map((label) => (
                      <Button key={label} size="small" variant="outlined" color="primary"
                        sx={{ fontSize: "0.7rem", py: 0.25, px: 1, height: 26, flexShrink: 0 }}
                        onClick={() => void handleAction(project, label)}>
                        {label}
                      </Button>
                    ))}
                    <Box sx={{ ml: "auto" }}>
                      {can.modifyData && (
                        <IconButton size="small" component="a" href={`/projects/${project.id}/edit`}>
                          <EditOutlined fontSize="small" />
                        </IconButton>
                      )}
                      {canEditProject(project) && (
                        <IconButton size="small" color="error" disabled={deleteSavingId === project.id}
                          onClick={() => setDeleteTarget(project)}>
                          <DeleteOutline fontSize="small" />
                        </IconButton>
                      )}
                    </Box>
                  </Stack>
                </Box>

                {/* Expanded chevron panel */}
                <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                  <Divider />
                  <Box sx={{ overflow: "hidden" }}>
                    <ProjectChevronPanel {...buildProjectChevronProps(project)} />
                  </Box>
                </Collapse>
              </Box>
            );
          })}

          {/* Mobile pagination */}
          <TablePagination
            component="div"
            count={totalCount}
            page={page}
            onPageChange={(_, next) => setPage(next)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
            rowsPerPageOptions={[25, 50, 100]}
            sx={{ borderTop: "1px solid", borderColor: "divider" }}
          />
        </Stack>
      )}

      {/* ── Desktop table ── */}
      {!isMobile && <Box
        className="glass-card"
        sx={{
          padding: 2,
          paddingBottom: 0,
          marginBottom: '80px',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <Box sx={{
          overflowX: 'auto',
          overflowY: 'auto',
          width: '100%',
          maxHeight: 'calc(100vh - 280px)',
        }}>
          <Table sx={{ minWidth: 2000 }} size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{
                width: PROJECT_CHEVRON_W,
                padding: '8px 12px',
                position: 'sticky',
                left: 0,
                zIndex: 5,
                bgcolor: 'background.paper',
              }} />
              <TableCell sx={{
                minWidth: PROJECT_INDEX_W,
                width: PROJECT_INDEX_W,
                padding: '8px 12px',
                ...stickyCol(PROJECT_INDEX_STICKY_LEFT, 5),
              }}>#</TableCell>
              {orderedColumns.map((column) => (
                <TableCell
                  key={column.id}
                  sx={{
                    minWidth: column.minWidth || 100,
                    maxWidth: column.maxWidth,
                    whiteSpace: column.maxWidth ? 'normal' : 'nowrap',
                    padding: '8px 12px',
                    ...(column.id === "jobNumber"
                      ? {
                        position: "sticky",
                        left: PROJECT_JOB_STICKY_LEFT,
                        zIndex: 4,
                        bgcolor: "background.paper",
                        boxShadow: "2px 0 6px rgba(0,0,0,0.12)",
                      }
                      : {}),
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <span style={fieldLabelStyle}>{column.name}{column.required ? " *" : ""}</span>
                    <IconButton
                      size="small"
                      onClick={(event) => setAutoMenu({ anchorEl: event.currentTarget, key: column.id })}
                    >
                      <ArrowDropDown fontSize="small" />
                    </IconButton>
                  </Stack>
                </TableCell>
              ))}
              <TableCell sx={{ padding: '8px 12px' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pagedProjects.map((project) => {
              const isExpanded = expandedProjectId === project.id;
              const colSpan = orderedColumns.length + 3; // chevron + seq + actions
              return (
                <React.Fragment key={project.id}>
                  <TableRow hover selected={isExpanded}>
                    <TableCell sx={{
                      width: PROJECT_CHEVRON_W,
                      padding: '4px 8px',
                      position: 'sticky',
                      left: 0,
                      zIndex: 3,
                      bgcolor: 'background.paper',
                    }}>
                      <IconButton
                        size="small"
                        onClick={() => setExpandedProjectId(isExpanded ? null : project.id)}
                        sx={{ color: isExpanded ? 'primary.main' : 'text.secondary' }}
                      >
                        {isExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                      </IconButton>
                    </TableCell>
                    <TableCell sx={{
                      whiteSpace: 'nowrap',
                      padding: '8px 12px',
                      minWidth: PROJECT_INDEX_W,
                      width: PROJECT_INDEX_W,
                      ...stickyCol(PROJECT_INDEX_STICKY_LEFT, 2),
                    }}>{project.seq}</TableCell>
                    {orderedColumns.map((column) => (
                      <TableCell
                        key={`${project.id}-${column.id}`}
                        sx={{
                          maxWidth: column.maxWidth,
                          whiteSpace: column.maxWidth ? 'normal' : 'nowrap',
                          overflow: column.maxWidth ? 'hidden' : 'visible',
                          textOverflow: column.maxWidth ? 'ellipsis' : 'clip',
                          padding: '8px 12px',
                          ...(column.id === "jobNumber"
                            ? {
                              position: "sticky",
                              left: PROJECT_JOB_STICKY_LEFT,
                              zIndex: 2,
                              bgcolor: "background.paper",
                              boxShadow: "2px 0 6px rgba(0,0,0,0.12)",
                            }
                            : {}),
                        }}
                      >
                        {column.renderCell(project, products)}
                      </TableCell>
                    ))}
                    <TableCell sx={{ padding: '8px 12px' }}>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="nowrap">
                        {!project.isDeleted && renderActions(project, "list-web")}
                        {can.projects?.edit && canEditProjectFromWebTable(project) && !project.isDeleted && (
                          <IconButton size="small" onClick={() => setEditTarget(project)}>
                            <EditOutlined fontSize="small" />
                          </IconButton>
                        )}
                        {can.projects?.delete && canEditProjectFromWebTable(project) && !project.isDeleted && (
                          <IconButton
                            size="small"
                            disabled={deleteSavingId === project.id}
                            onClick={() => setDeleteTarget(project)}
                          >
                            <DeleteOutline fontSize="small" />
                          </IconButton>
                        )}
                        {can.projects?.delete && canEditProjectFromWebTable(project) && project.isDeleted && (
                          <>
                            <IconButton
                              size="small"
                              disabled={deleteSavingId === project.id}
                              onClick={async () => {
                                try {
                                  setDeleteSavingId(project.id);
                                  await projectService.restoreProject(project.id);
                                  await dispatch(fetchProjects(listFilters));
                                } finally {
                                  setDeleteSavingId(null);
                                }
                              }}
                              >
                                <RestoreOutlined fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                              disabled={deleteSavingId === project.id}
                              onClick={() => setPurgeTarget(project)}
                              >
                                <DeleteForeverOutlined fontSize="small" />
                              </IconButton>
                            </>
                          )}
                        {!renderActions(project, "list-web") && !(can.projects?.edit && canEditProjectFromWebTable(project) && !project.isDeleted)
                          && !(can.projects?.delete && canEditProjectFromWebTable(project))
                          && (
                            <Typography variant="caption" color="text.disabled">
                              No actions
                            </Typography>
                          )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={colSpan} sx={{ p: 0, border: 0 }}>
                      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                        <Box sx={{ position: "sticky", left: 0, width: "calc(100vw - 20px)", maxWidth: "100%", overflow: "hidden" }}>
                          <ProjectChevronPanel {...buildProjectChevronProps(project)} />
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}
        </TableBody>
          </Table>
        </Box>
      </Box>}

      {!isMobile && <Box
        sx={{
          position: 'fixed',
          bottom: 0,
          left: '264px',
          right: 0,
          backgroundColor: 'var(--panel)',
          borderTop: '1px solid var(--stroke)',
          zIndex: 1000,
          transition: 'left 0.3s ease'
        }}
        className="pagination-bar"
      >
        <TablePagination
          component="div"
          count={totalCount}
          page={page}
          onPageChange={(_, nextPage) => setPage(nextPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(event) => {
            setRowsPerPage(Number(event.target.value));
            setPage(0);
          }}
          rowsPerPageOptions={[25, 50, 100, 500]}
        />
      </Box>}

      <Menu
        anchorEl={autoMenu.anchorEl}
        open={Boolean(autoMenu.anchorEl)}
        onClose={() => setAutoMenu({ anchorEl: null, key: "" })}
      >
        <MenuItem
          onClick={() => {
            if (autoMenu.key) setAutoSort({ key: autoMenu.key, dir: "asc" });
            setAutoMenu({ anchorEl: null, key: "" });
          }}
        >
          Sort A → Z
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (autoMenu.key) setAutoSort({ key: autoMenu.key, dir: "desc" });
            setAutoMenu({ anchorEl: null, key: "" });
          }}
        >
          Sort Z → A
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAutoSort({ key: "", dir: "asc" });
            setAutoMenu({ anchorEl: null, key: "" });
          }}
        >
          Clear sort
        </MenuItem>
        {(projectFilterOptions[autoMenu.key as keyof typeof projectFilterOptions] || []).map((option) => {
          const label = option || "(Blank)";
          const selected = !!autoFilters[autoMenu.key]?.has(option);
          return (
            <MenuItem
              key={`${autoMenu.key}-${option}`}
              onClick={() => {
                if (!autoMenu.key) return;
                setAutoFilters((prev) => {
                  const current = new Set(prev[autoMenu.key] ?? []);
                  if (current.has(option)) {
                    current.delete(option);
                  } else {
                    current.add(option);
                  }
                  return { ...prev, [autoMenu.key]: current };
                });
              }}
            >
              <Checkbox checked={selected} />
              <ListItemText primary={label} />
            </MenuItem>
          );
        })}
      </Menu>
      {loading && (
        <Typography variant="caption" color="text.secondary">
          Loading projects...
        </Typography>
      )}

      <DeleteConfirmDialog
        open={!!deleteTarget}
        entityType="project"
        entityLabel={deleteTarget?.jobNumber || deleteTarget?.id}
        title="Archive Project"
        message={`Archive project ${(deleteTarget?.jobNumber || deleteTarget?.id) ? `(${deleteTarget?.jobNumber || deleteTarget?.id})` : ""}? It will be removed from active lists for all users and can be restored later.`}
        confirmLabel="Archive"
        loading={!!deleteTarget && deleteSavingId === deleteTarget.id}
        onClose={() => {
          if (deleteSavingId) return;
          setDeleteTarget(null);
        }}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            setDeleteSavingId(deleteTarget.id);
            await dispatch(deleteProject(deleteTarget.id)).unwrap();
            setDeleteTarget(null);
          } catch (e) {
            console.error("Archive project failed:", e);
            alert("Unable to archive project. Check your permissions and API availability.");
          } finally {
            setDeleteSavingId(null);
          }
        }}
      />

      <DeleteConfirmDialog
        open={!!purgeTarget}
        entityType="project"
        entityLabel={purgeTarget?.jobNumber || purgeTarget?.id}
        title="Delete Project Permanently"
        message={`Permanently delete project ${(purgeTarget?.jobNumber || purgeTarget?.id) ? `(${purgeTarget?.jobNumber || purgeTarget?.id})` : ""}? This cannot be undone.`}
        confirmLabel="Delete permanently"
        loading={!!purgeTarget && deleteSavingId === purgeTarget.id}
        onClose={() => {
          if (deleteSavingId) return;
          setPurgeTarget(null);
        }}
        onConfirm={async () => {
          if (!purgeTarget) return;
          try {
            setDeleteSavingId(purgeTarget.id);
            await projectService.purgeProject(purgeTarget.id);
            setPurgeTarget(null);
            await dispatch(fetchProjects(listFilters));
          } catch (e) {
            console.error("Purge project failed:", e);
            alert("Unable to permanently delete project. Check your permissions and API availability.");
          } finally {
            setDeleteSavingId(null);
          }
        }}
      />

      {/* Block-complete dialog — shown when not all assets are done */}

      <TableConfigDialog
        open={tableConfigOpen}
        onClose={() => setTableConfigOpen(false)}
        title="Table configuration: projects"
        deferFieldChanges
        availableFields={availableFieldsForProjects.map((field) => ({
          id: field.id,
          name: field.name,
          fieldType: field.fieldType,
          linkToFieldId: field.linkToFieldId,
          actionType: field.actionType
        }))}
        fields={projectsTableConfig.orderedFields}
        config={projectsTableConfig.config}
        onChange={projectsTableConfig.setConfig}
        builtInColumns={[
          { id: "jobNumber", name: "Job Number", type: "text", required: true },
          { id: "projectManager", name: "Project Manager", type: "text", required: false },
          { id: "customerName", name: "Customer name", type: "text", required: false },
          { id: "products", name: "Product name", type: "multi-select", required: true },
          { id: "siteName", name: "Site", type: "text", required: false },
          { id: "region", name: "Country/State", type: "text", required: false },
          { id: "description", name: "Description", type: "text", required: true },
          { id: "startDate", name: "Start Date", type: "date", required: true },
          { id: "finishDate", name: "Finish Date", type: "date", required: true },
          { id: "status", name: "Status", type: "single select", required: true },
          { id: "projectType", name: "Project Type", type: "single select", required: true },
          { id: "customerId", name: "Customer ID", type: "text", required: true },
          { id: "office", name: "Office", type: "text", required: true },
        ]}
        onAddField={async (fieldId) => {
          const existing = allFieldDefinitions.definitions.find((item) => item.id === fieldId);
          if (!existing) return;
          const tables = existing.tables.includes("projects")
            ? existing.tables
            : [...existing.tables, "projects"];
          await fieldService.updateDefinition(fieldId, { ...existing, tables });
          await allFieldDefinitions.reload();
          await projectsDynamic.reload();
        }}
        onCreateField={async (name, type, linkToFieldId, actionType) => {
          const created = await fieldService.createDefinition({
            id: "",
            name,
            fieldType: type,
            linkToFieldId: linkToFieldId || null,
            actionType: actionType || null,
            tables: ["projects"],
            sortOrder: allFieldDefinitions.definitions.length + 1,
            isActive: true
          });
          await allFieldDefinitions.reload();
          await projectsDynamic.reload();
          return created;
        }}
        onEditField={async (fieldId, name, type, linkToFieldId, actionType) => {
          const existing = projectsDynamic.definitions.find((item) => item.id === fieldId);
          if (!existing) return;
          await fieldService.updateDefinition(fieldId, {
            ...existing,
            name,
            fieldType: type,
            linkToFieldId: linkToFieldId || null,
            actionType: actionType || null
          });
          await allFieldDefinitions.reload();
          await projectsDynamic.reload();
        }}
        onDeleteField={async (fieldId) => {
          // In Projects table config, "remove" means unassign from Projects (do not delete globally).
          const existing =
            allFieldDefinitions.definitions.find((item) => item.id === fieldId) ??
            projectsDynamic.definitions.find((item) => item.id === fieldId);
          if (!existing) return;
          const tables = (existing.tables || []).filter((t) => t !== "projects");
          await fieldService.updateDefinition(fieldId, { ...existing, tables });
          await allFieldDefinitions.reload();
          await projectsDynamic.reload();
        }}
      />

      <ProjectEditDialog
        open={!!editTarget}
        projectId={editTarget?.id ?? ""}
        onClose={() => setEditTarget(null)}
        onSaved={async () => {
          setEditTarget(null);
          await dispatch(fetchProjects(listFilters));
        }}
      />
    </Stack>
  );
};

export default ProjectList;




