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
  IconButton,
  InputLabel,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { ArrowDropDown, CalendarTodayOutlined, DeleteOutline, EditOutlined, ExpandLess, ExpandMore, PersonOutlined } from "@mui/icons-material";
import ProjectChevronPanel from "./ProjectChevronPanel";
import { Link } from "react-router-dom";
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
import { Project } from "../../types/project";

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

  // Load my project IDs when in my-work scope for non-PM roles
  useEffect(() => {
    const role = user?.role ?? "";
    if (isMyWork && ["Installer", "Engineer", "Supervisor"].includes(role)) {
      projectAssetService.myProjectIds().then(setMyProjectIds);
    } else {
      setMyProjectIds([]);
    }
  }, [isMyWork, user?.role]);
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
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleteSavingId, setDeleteSavingId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const canDeleteProjects = can.modifyData;
  const isPmUser = user?.role === "Project Manager";
  const [projectViewFilter, setProjectViewFilter] = useState<"all" | "mine">("all");
  const [projectSearch, setProjectSearch] = useState("");

  // Block-complete dialog — shown when assets are not all done
  const [blockComplete, setBlockComplete] = useState<{ open: boolean; incomplete: number; total: number }>({ open: false, incomplete: 0, total: 0 });
  const [completingProjectId, setCompletingProjectId] = useState<string | null>(null);

  // Clear column filters when active office changes
  useEffect(() => {
    setAutoFilters({});
    setPage(0);
  }, [activeOffice]);

  useEffect(() => {
    setPage(0);
  }, [projectViewFilter, projectSearch]);

  useEffect(() => {
    dispatch(
      fetchProjects({
        // Filter by country on the server so pagination doesn't hide matching projects.
        country: activeOffice !== "All" ? activeOffice : undefined,
        search: projectSearch.trim() || undefined,
        page: page + 1,
        pageSize: rowsPerPage
      })
    );
  }, [dispatch, activeOffice, page, rowsPerPage, projectSearch]);

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
    const searchNeedle = projectSearch.trim().toLowerCase();

    // Customers see nothing here (redirected elsewhere)
    if (isCustomer) return [];

    // Office-based filter (Admin always global, officeView uses activeOffice)
    const officeFiltered = sourceProjects.filter((project) => {
      if (isAdmin || activeOffice === "All") return true;
      const projectCountry = countryForOffice(project.office);
      return projectCountry === activeOffice || project.office === activeOffice;
    });

    // Scope-aware filtering
    let scopeFiltered = officeFiltered;
    if (isMyWork && !isAdmin) {
      if (role === "Project Manager") {
        scopeFiltered = officeFiltered.filter((p) => p.projectManager === user?.fullName);
      } else if (["Installer", "Engineer", "Supervisor"].includes(role)) {
        const idSet = new Set(myProjectIds);
        scopeFiltered = officeFiltered.filter((p) => idSet.has(p.id));
      }
    }

    if (!isMyWork && role === "Project Manager" && projectViewFilter === "mine") {
      scopeFiltered = scopeFiltered.filter((p) => p.projectManager === user?.fullName);
    }

    if (searchNeedle) {
      scopeFiltered = scopeFiltered.filter((project) =>
        [project.jobNumber, project.customerName, project.siteName, project.projectManager]
          .some((value) => value?.toLowerCase().includes(searchNeedle))
      );
    }

    const filtered = applyAutoFilter(scopeFiltered, autoFilters, projectAccessors);
    return applyAutoSort(filtered, autoSort, projectAccessors);
  }, [activeOffice, sourceProjects, autoFilters, autoSort, projectAccessors, countryForOffice, isMyWork, myProjectIds, user?.role, user?.fullName, projectSearch, projectViewFilter]);

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
    if (!project.id) return;

    if (label === "Submit for Approval") {
      dispatch(updateProjectStatus({ id: project.id, payload: { status: "Pending Approval" } }));
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
      dispatch(updateProjectStatus({ id: project.id, payload: { status: "In Progress" } }));
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

    if (project.status === "Draft" && user?.role === "Project Manager") {
      actions.push("Submit for Approval");
    }

    if (project.status === "Pending Approval" && user?.role === "Admin") {
      actions.push("Approve", "Request Info", "Reject");
    }

    if (project.status === "Approved" && can.modifyData) {
      actions.push("Start Work");
    }

    if (project.status === "In Progress" && can.modifyData) {
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
            Showing {activeOffice === "All" ? "all offices" : activeOffice} projects.
          </Typography>
        </Box>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          {can.modifyData && (
            <Button variant="contained" component={Link} to="/projects/new">
              Create project
            </Button>
          )}
          {can.editFields && !isMobile && (
            <Button variant="outlined" onClick={() => setTableConfigOpen(true)}>
              Table configuration
            </Button>
          )}
        </Stack>
      </Stack>

      <Paper className="glass-card" sx={{ p: 1.5 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "center" }}>
          {isPmUser && (
            <FormControl size="small" sx={{ minWidth: { xs: "100%", md: 180 } }}>
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
            placeholder="Search job, customer, site, or PM"
            value={projectSearch}
            onChange={(event) => setProjectSearch(event.target.value)}
            sx={{ minWidth: { xs: "100%", md: 320 }, flex: 1 }}
          />
          <Button
            variant="text"
            onClick={() => {
              setProjectSearch("");
              setProjectViewFilter("all");
              setAutoFilters({});
              setAutoSort({ key: "", dir: "asc" });
            }}
          >
            Clear
          </Button>
        </Stack>
      </Paper>

      {error && (
        <Typography variant="body2" color="warning.main">
          API unavailable. Showing demo data for local testing.
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
              <Paper key={project.id} className="glass-card" sx={{
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

                  {/* Bottom row: Asset Installs button + Edit/Delete + workflow actions */}
                  <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 1 }}
                    onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="small"
                      variant="outlined"
                      component="a"
                      href={`/installations/assets?product=${encodeURIComponent(project.productIds?.[0] ?? "")}&project=${encodeURIComponent(project.id)}`}
                      sx={{ fontSize: "0.7rem", py: 0.25, px: 1, height: 26, flexShrink: 0 }}
                    >
                      Asset Installs
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
                      {canDeleteProjects && (
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
              </Paper>
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
                        {renderActions(project)}
                        {can.modifyData && (
                          <IconButton size="small" component={Link} to={`/projects/${project.id}/edit`}>
                            <EditOutlined fontSize="small" />
                          </IconButton>
                        )}
                        {canDeleteProjects && (
                          <IconButton
                            size="small"
                            disabled={deleteSavingId === project.id}
                            onClick={() => setDeleteTarget(project)}
                          >
                            <DeleteOutline fontSize="small" />
                          </IconButton>
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
            console.error("Delete project failed:", e);
            alert("Unable to delete project. Check your permissions and API availability.");
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
    </Stack>
  );
};

export default ProjectList;

