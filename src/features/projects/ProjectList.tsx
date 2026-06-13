import React, { useEffect, useMemo, useState } from "react";
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
} from "@mui/material";
import { ArrowDropDown, CalendarTodayOutlined, DeleteForeverOutlined, DeleteOutline, EditOutlined, ExpandLess, ExpandMore, FilterAltOffOutlined, PersonOutlined, RestoreOutlined } from "@mui/icons-material";
import ProjectChevronPanel from "./ProjectChevronPanel";
import { Link, useNavigate } from "react-router-dom";
import StatusChip from "../../components/ui/StatusChip";
import DeleteConfirmDialog from "../../components/ui/DeleteConfirmDialog";
import TableConfigDialog from "../../components/TableConfigDialog";
import { demoProducts } from "../../data/demo";
import { useActiveOffice } from "../../hooks/useActiveOffice";
import { useAuth } from "../../hooks/useAuth";
import { usePermissions } from "../../hooks/usePermissions";
import { useDynamicFields } from "../../hooks/useDynamicFields";
import { useTableConfig } from "../../hooks/useTableConfig";
import { useFieldDefinitions } from "../../hooks/useFieldDefinitions";
import { useWorkScope } from "../../hooks/useWorkScope";
import { fieldService } from "../../services/fieldService";
import { officesService } from "../../services/officesService";
import { projectAssetService } from "../../services/projectAssetService";
import type { Office } from "../../components/GlobalOfficeMap";
import { createCountryResolver } from "../../utils/officeCountry";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { fetchProducts } from "../../store/productsSlice";
import { deleteProject, fetchProjects, updateProjectStatus } from "../../store/projectSlice";
import { projectService } from "../../services/projectService";
import { Project } from "../../types/project";
import ProjectForm from "./ProjectForm";
import { useComplexView } from "../../contexts/ComplexViewContext";
import { Capacitor } from "@capacitor/core";

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

const builtInColumnConfigs: ColumnConfig[] = [
  {
    id: "jobNumber",
    name: "Job Number",
    required: true,
    minWidth: 120,
    renderCell: (project: Project) => (
      <Box
        component="span"
        sx={{
          display: "inline-flex",
          alignItems: "center",
          borderRadius: 999,
          px: 0.5,
          py: 0.25,
          background: "linear-gradient(135deg, rgba(45,212,191,0.2), rgba(45,212,191,0.1))",
          border: "1px solid rgba(45,212,191,0.3)"
        }}
      >
        <Button
          component={Link}
          to={`/installations/assets?product=${encodeURIComponent(project.productIds?.[0] ?? "")}&project=${encodeURIComponent(project.id)}`}
          sx={{ minWidth: "auto", padding: 0 }}
        >
          {project.jobNumber}
        </Button>
        {(project.assetCount ?? 0) > 0 && (
          <Box
            component="span"
            sx={{
              ml: 0.75,
              px: 0.75,
              py: 0.1,
              borderRadius: 999,
              fontSize: "0.6rem",
              fontWeight: 700,
              lineHeight: 1.6,
              background: "rgba(45,212,191,0.25)",
              color: "rgba(45,212,191,1)",
              border: "1px solid rgba(45,212,191,0.4)",
              letterSpacing: "0.02em",
            }}
          >
            {project.assetCount}
          </Box>
        )}
      </Box>
    )
  },
  {
    id: "customerName",
    name: "Customer name",
    required: false,
    minWidth: 150,
    renderCell: (project: Project) => project.customerName || "-"
  },
  {
    id: "siteName",
    name: "Site",
    required: false,
    minWidth: 160,
    renderCell: (project: Project) => project.siteName || "-"
  },
  {
    id: "customerId",
    name: "Customer ID",
    required: true,
    minWidth: 120,
    renderCell: (project: Project) => project.customerId || "-"
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
    id: "office",
    name: "Office",
    required: true,
    minWidth: 120,
    renderCell: (project: Project) => project.office || "-"
  },
  {
    id: "region",
    name: "Country/State",
    required: false,
    minWidth: 120,
    renderCell: (project: Project) => project.region || "-"
  },
  {
    id: "projectManager",
    name: "Project Manager",
    required: false,
    minWidth: 130,
    renderCell: (project: Project) => project.projectManager || "-"
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
  }
];

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
  const dispatch = useAppDispatch();
  const { items, total, loading, error } = useAppSelector((state) => state.projects);
  const productsState = useAppSelector((state) => state.products);
  const projectsDynamic = useDynamicFields("projects");
  const [tableConfigOpen, setTableConfigOpen] = useState(false);
  const [globalOffices, setGlobalOffices] = useState<Office[]>([]);
  const [myProjectIds, setMyProjectIds] = useState<string[]>([]);

  useEffect(() => {
    officesService.getAll().then(setGlobalOffices);
  }, []);

  const projectsTableConfig = useTableConfig(
    "projects",
    projectsDynamic.definitions.map((field) => ({
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
  // PM defaults to "mine" (consistent with dashboard My Projects default).
  // Admin and all other roles default to "all".
  const [projectViewFilter, setProjectViewFilter] = useState<"all" | "mine">(
    user?.role === "Project Manager" ? "mine" : "all"
  );
  const [projectNumberFilter, setProjectNumberFilter] = useState("");
  const isAdminUser = user?.role === "Admin";
  const isPmUser = user?.role === "Project Manager";
  const canCreateProjects = isAdminUser || isPmUser;
  const canManageProjectTable = isAdminUser || isPmUser;
  // Scope dropdown visible only when the role's viewScope permits seeing all projects
  const canViewAllProjects = (can.projects?.viewScope ?? "own") === "all";
  const canActAsFieldTechnician = !!can.installationAssets?.runWorkflow && !can.viewOnly;
  const { complexViewActive } = useComplexView();
  // Web always shows full management controls; native keeps them behind Complex View.
  const showComplexControls = !Capacitor.isNativePlatform() || complexViewActive;

  // Load my project IDs when in my-work scope for non-PM field users
  useEffect(() => {
    if (isMyWork && canActAsFieldTechnician && !isPmUser) {
      projectAssetService.myProjectIds().then(setMyProjectIds);
    } else {
      setMyProjectIds([]);
    }
  }, [canActAsFieldTechnician, isMyWork, isPmUser]);

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
  const [blockComplete, setBlockComplete] = useState<{ open: boolean; incomplete: number; total: number }>({ open: false, incomplete: 0, total: 0 });
  const [completingProjectId, setCompletingProjectId] = useState<string | null>(null);

  // Clear column filters when active office changes
  useEffect(() => {
    setAutoFilters({});
    setPage(0);
  }, [activeOffice]);

  useEffect(() => {
    dispatch(
      fetchProjects({
        // Filter by country on the server so pagination doesn't hide matching projects.
        country: activeOffice !== "All" ? activeOffice : undefined,
        scope: "browse",
        ownershipScope: canViewAllProjects ? projectViewFilter : "mine",
        projectNumber: projectNumberFilter.trim() || undefined,
        page: page + 1,
        pageSize: rowsPerPage,
        includeDeleted: showArchived
      })
    );
  }, [dispatch, activeOffice, page, rowsPerPage, showArchived, canViewAllProjects, projectViewFilter, projectNumberFilter]);

  useEffect(() => {
    setPage(0);
  }, [showArchived, projectViewFilter, projectNumberFilter]);

  useEffect(() => {
    dispatch(fetchProducts());
  }, [dispatch]);


  const sourceProjects = items;
  const products = productsState.items.length ? productsState.items : demoProducts;

  const countryForOffice = useMemo(() => createCountryResolver(globalOffices), [globalOffices]);
  const officeIdsForRegion = useMemo(() => {
    if (activeOffice === "All") return null;
    return new Set(globalOffices.filter((o) => o.country === activeOffice).map((o) => o.id));
  }, [activeOffice, globalOffices]);

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

    // Scope-aware filtering.
    // PM: driven by the canViewAllProjects permission + projectViewFilter dropdown.
    //     Replaces the old isMyWork check so the two systems don't conflict.
    // Field-execution users: keep the isMyWork toggle (scoped to assigned assets).
    let scopeFiltered = officeFiltered;
    if (!isAdmin) {
      if (role === "Project Manager") {
        if (!canViewAllProjects || projectViewFilter === "mine") {
          const myName = String(user?.fullName ?? "").trim().toLowerCase();
          scopeFiltered = officeFiltered.filter(
            (p) => String(p.projectManager ?? "").trim().toLowerCase() === myName
          );
        }
        // projectViewFilter === "all" && canViewAllProjects → no extra filter
      } else if (isMyWork && canActAsFieldTechnician) {
        const idSet = new Set(myProjectIds);
        scopeFiltered = officeFiltered.filter((p) => idSet.has(p.id));
      }
    }

    const filtered = applyAutoFilter(scopeFiltered, autoFilters, projectAccessors);
    return applyAutoSort(filtered, autoSort, projectAccessors);
  }, [activeOffice, canActAsFieldTechnician, canViewAllProjects, globalOffices, projectViewFilter, sourceProjects, autoFilters, autoSort, projectAccessors, countryForOffice, isMyWork, myProjectIds, user?.role, user?.fullName]);

  // Auto-fallback: if PM's "My projects" filter returns nothing once data is loaded,
  // switch to "all" so they don't land on a blank page.
  useEffect(() => {
    if (
      user?.role === "Project Manager" &&
      projectViewFilter === "mine" &&
      !loading &&
      globalOffices.length > 0 &&   // offices loaded — avoids false trigger during race
      sourceProjects.length > 0 &&   // data is actually loaded
      filteredProjects.length === 0
    ) {
      setProjectViewFilter("all");
    }
  }, [filteredProjects.length, globalOffices.length, loading, projectViewFilter, sourceProjects.length, user?.role]);

  const numberedProjects = useMemo(
    () => filteredProjects.map((project, index) => ({ ...project, seq: index + 1 })),
    [filteredProjects]
  );

  const pagedProjects = useMemo(() => {
    const start = page * rowsPerPage;
    return numberedProjects.slice(start, start + rowsPerPage);
  }, [numberedProjects, page, rowsPerPage]);

  const totalCount = items.length ? total : filteredProjects.length;

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
    const allIds = [...builtInIds, ...dynamicIds];

    let order: string[];
    if (projectsTableConfig.config.order.length > 0) {
      order = [...projectsTableConfig.config.order];
      const remaining = allIds.filter((id) => !order.includes(id));
      order = [...order, ...remaining];
    } else {
      order = allIds;
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

  const handleAction = async (project: Project, label: string) => {
    if (!project.id) {
      return;
    }

    if (label === "Approve") {
      dispatch(updateProjectStatus({ id: project.id, payload: { status: "Approved", approvalDecision: "Approved" } }));
    }

    if (label === "Request Info") {
      dispatch(updateProjectStatus({ id: project.id, payload: { status: "Pending Approval", approvalDecision: "More Info Required" } }));
    }

    if (label === "Reject") {
      dispatch(updateProjectStatus({ id: project.id, payload: { status: "Cancelled", approvalDecision: "Rejected" } }));
    }

    if (label === "Start Work") {
      const updated = await dispatch(updateProjectStatus({ id: project.id, payload: { status: "In Progress" } })).unwrap();
      navigate(
        `/installations/assets?product=${encodeURIComponent(updated.productIds?.[0] ?? project.productIds?.[0] ?? "")}&project=${encodeURIComponent(project.id)}`
      );
    }

    if (label === "Mark Completed") {
      // Enforce: all installation assets must be Complete before project can be marked Completed.
      // Project Managers (and above) are subject to the same rule — no exceptions.
      setCompletingProjectId(project.id);
      try {
        const assets = await projectAssetService.listByProject(project.id);
        const total = assets.length;
        const incomplete = assets.filter((a) => a.status !== "Complete").length;
        if (incomplete > 0) {
          setBlockComplete({ open: true, incomplete, total });
          return;
        }
        dispatch(updateProjectStatus({ id: project.id, payload: { status: "Completed" } }));
      } catch {
        // If we can't verify assets, block the action to be safe
        setBlockComplete({ open: true, incomplete: -1, total: 0 });
      } finally {
        setCompletingProjectId(null);
      }
    }
  };

  const renderActions = (project: Project) => {
    const actions: string[] = [];

    if (project.status === "Pending Approval" && can.projects?.approve) {
      actions.push("Approve", "Request Info", "Reject");
    }

    if (project.status === "Approved" && canEditProjectFromWebTable(project)) {
      actions.push("Start Work");
    }

    if (project.status === "In Progress" && canEditProjectFromWebTable(project)) {
      actions.push("Mark Completed");
    }

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
            disabled={label === "Mark Completed" && completingProjectId === project.id}
            startIcon={label === "Mark Completed" && completingProjectId === project.id
              ? <CircularProgress size={12} /> : undefined}
            onClick={() => handleAction(project, label)}
          >
            {label}
          </Button>
        ))}
      </Stack>
    );
  };

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
              <Button variant="contained" component={Link} to="/projects/new">
                Create project
              </Button>
            )}
            {canManageProjectTable && (
              <Button variant="outlined" onClick={() => setTableConfigOpen(true)}>
                Table configuration
              </Button>
            )}
          </Stack>
        )}
      </Stack>

      <Box className="glass-card" sx={{ p: 2 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }}>
          {canViewAllProjects && (
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel id="project-view-filter-label">Project View</InputLabel>
              <Select
                labelId="project-view-filter-label"
                label="Project View"
                value={projectViewFilter}
                onChange={(event) => setProjectViewFilter(event.target.value as "all" | "mine")}
              >
                <MenuItem value="all">All projects</MenuItem>
                <MenuItem value="mine">My projects</MenuItem>
              </Select>
            </FormControl>
          )}
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
                  setProjectViewFilter("all");
                  setProjectNumberFilter("");
                  setAutoFilters({});
                }}
                sx={{
                  border: "1px solid",
                  borderColor: (projectViewFilter !== "all" || projectNumberFilter || Object.keys(autoFilters ?? {}).length > 0)
                    ? "primary.main" : "divider",
                  color: (projectViewFilter !== "all" || projectNumberFilter || Object.keys(autoFilters ?? {}).length > 0)
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

            // Mobile actions — excludes "Start Work"
            const mobileActions = (() => {
              const actions: string[] = [];
              if (project.status === "Draft" && user?.role === "Project Manager") actions.push("Submit for Approval");
              if (project.status === "Pending Approval" && user?.role === "Admin") actions.push("Approve", "Request Info", "Reject");
              if (project.status === "In Progress" && can.modifyData) actions.push("Mark Completed");
              return actions;
            })();

            return (
              <Box key={project.id} className="glass-card" sx={{
                overflow: "hidden",
                transition: "all 0.2s ease",
                "&:hover": {
                  transform: "translateY(-3px)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
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
                        <Typography variant="body2" fontWeight={700}>{project.jobNumber}</Typography>
                        <Box component="span" sx={{
                          px: 0.75, py: 0.1, borderRadius: 999,
                          fontSize: "0.6rem", fontWeight: 700, lineHeight: 1.6,
                          background: "rgba(45,212,191,0.25)", color: "rgba(45,212,191,1)",
                          border: "1px solid rgba(45,212,191,0.4)",
                        }}>
                          {project.assetCount ?? 0}
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
                        onClick={() => handleAction(project, label)}>
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
                    <ProjectChevronPanel
                      projectId={project.id}
                      productId={project.productIds?.[0]}
                      projectJobNumber={project.jobNumber}
                      projectCustomer={project.customerName}
                      projectSite={project.siteName}
                      projectManager={project.projectManager}
                    />
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
              <TableCell sx={{ width: 40, padding: '8px 12px' }} />
              <TableCell sx={{ minWidth: 50, padding: '8px 12px' }}>#</TableCell>
              {orderedColumns.map((column) => (
                <TableCell
                  key={column.id}
                  sx={{
                    minWidth: column.minWidth || 100,
                    maxWidth: column.maxWidth,
                    whiteSpace: column.maxWidth ? 'normal' : 'nowrap',
                    padding: '8px 12px'
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
                    <TableCell sx={{ width: 40, padding: '4px 8px' }}>
                      <IconButton
                        size="small"
                        onClick={() => setExpandedProjectId(isExpanded ? null : project.id)}
                        sx={{ color: isExpanded ? 'primary.main' : 'text.secondary' }}
                      >
                        {isExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                      </IconButton>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', padding: '8px 12px' }}>{project.seq}</TableCell>
                    {orderedColumns.map((column) => (
                      <TableCell
                        key={`${project.id}-${column.id}`}
                        sx={{
                          maxWidth: column.maxWidth,
                          whiteSpace: column.maxWidth ? 'normal' : 'nowrap',
                          overflow: column.maxWidth ? 'hidden' : 'visible',
                          textOverflow: column.maxWidth ? 'ellipsis' : 'clip',
                          padding: '8px 12px'
                        }}
                      >
                        {column.renderCell(project, products)}
                      </TableCell>
                    ))}
                    <TableCell sx={{ padding: '8px 12px' }}>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="nowrap">
                        {!project.isDeleted && renderActions(project)}
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
                                  await dispatch(
                                    fetchProjects({
                                      country: activeOffice !== "All" ? activeOffice : undefined,
                                      scope: "browse",
                                      ownershipScope: isPmUser ? projectViewFilter : "all",
                                      projectNumber: projectNumberFilter.trim() || undefined,
                                      page: page + 1,
                                      pageSize: rowsPerPage,
                                      includeDeleted: showArchived
                                    })
                                  );
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
                        {!renderActions(project) && !(can.projects?.edit && canEditProjectFromWebTable(project) && !project.isDeleted)
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
                          <ProjectChevronPanel
                            projectId={project.id}
                            productId={project.productIds?.[0]}
                            projectJobNumber={project.jobNumber}
                            projectCustomer={project.customerName}
                            projectSite={project.siteName}
                            projectManager={project.projectManager}
                          />
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
            await dispatch(
              fetchProjects({
                country: activeOffice !== "All" ? activeOffice : undefined,
                scope: "browse",
                ownershipScope: isPmUser ? projectViewFilter : "all",
                projectNumber: projectNumberFilter.trim() || undefined,
                page: page + 1,
                pageSize: rowsPerPage,
                includeDeleted: showArchived
              })
            );
          } catch (e) {
            console.error("Purge project failed:", e);
            alert("Unable to permanently delete project. Check your permissions and API availability.");
          } finally {
            setDeleteSavingId(null);
          }
        }}
      />

      {/* Block-complete dialog — shown when not all assets are done */}
      <Dialog open={blockComplete.open} onClose={() => setBlockComplete({ open: false, incomplete: 0, total: 0 })} maxWidth="xs" fullWidth>
        <DialogTitle>Cannot Complete Project</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 1 }}>
            {blockComplete.incomplete === -1
              ? "Unable to verify installation asset status. Please try again or contact support."
              : `${blockComplete.incomplete} of ${blockComplete.total} installation asset${blockComplete.incomplete !== 1 ? "s are" : " is"} not yet completed.`}
          </Alert>
          <Typography variant="body2" color="text.secondary">
            A project can only be marked as Completed once <strong>all installation assets</strong> have a "Complete" status. Please finish the remaining assets first.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBlockComplete({ open: false, incomplete: 0, total: 0 })} variant="contained">
            OK
          </Button>
        </DialogActions>
      </Dialog>

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
          { id: "customerName", name: "Customer name", type: "text", required: false },
          { id: "siteName", name: "Site", type: "text", required: false },
          { id: "customerId", name: "Customer ID", type: "text", required: true },
          { id: "products", name: "Product name", type: "multi-select", required: true },
          { id: "office", name: "Office", type: "text", required: true },
          { id: "region", name: "Country/State", type: "text", required: false },
          { id: "projectManager", name: "Project Manager", type: "text", required: false },
          { id: "description", name: "Description", type: "text", required: true },
          { id: "startDate", name: "Start Date", type: "date", required: true },
          { id: "finishDate", name: "Finish Date", type: "date", required: true },
          { id: "status", name: "Status", type: "single select", required: true },
          { id: "projectType", name: "Project Type", type: "single select", required: true }
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

      <Dialog
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          className: "glass-card",
          sx: { backgroundColor: "var(--panel)", border: "1px solid var(--stroke)", minHeight: "80vh" }
        }}
      >
        <DialogTitle>Edit project</DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {editTarget && (
            <Box sx={{ p: 3 }}>
              <ProjectForm
                embedded
                projectId={editTarget.id}
                onClose={() => setEditTarget(null)}
                onSaved={async () => {
                  setEditTarget(null);
                  await dispatch(
                    fetchProjects({
                      country: activeOffice !== "All" ? activeOffice : undefined,
                      scope: "browse",
                      ownershipScope: isPmUser ? projectViewFilter : "all",
                      projectNumber: projectNumberFilter.trim() || undefined,
                      page: page + 1,
                      pageSize: rowsPerPage,
                      includeDeleted: showArchived
                    })
                  );
                }}
              />
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Stack>
  );
};

export default ProjectList;
