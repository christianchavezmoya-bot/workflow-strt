import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Checkbox,
  IconButton,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography
} from "@mui/material";
import { ArrowDropDown, DeleteOutline, EditOutlined } from "@mui/icons-material";
import { Link } from "react-router-dom";
import StatusChip from "../../components/ui/StatusChip";
import TableConfigDialog from "../../components/TableConfigDialog";
import { demoProducts } from "../../data/demo";
import { useActiveOffice } from "../../hooks/useActiveOffice";
import { useAuth } from "../../hooks/useAuth";
import { useDynamicFields } from "../../hooks/useDynamicFields";
import { useTableConfig } from "../../hooks/useTableConfig";
import { useFieldDefinitions } from "../../hooks/useFieldDefinitions";
import { fieldService } from "../../services/fieldService";
import { officesService } from "../../services/officesService";
import type { Office } from "../../components/GlobalOfficeMap";
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
          to={`/installations?job=${encodeURIComponent(project.jobNumber)}`}
          sx={{ minWidth: "auto", padding: 0 }}
        >
          {project.jobNumber}
        </Button>
      </Box>
    )
  },
  {
    id: "customerName",
    name: "Customer",
    required: false,
    minWidth: 150,
    renderCell: (project: Project) => project.customerName || "-"
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
    name: "Products",
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
  const { user } = useAuth();
  const { activeOffice } = useActiveOffice();
  const dispatch = useAppDispatch();
  const { items, total, loading, error } = useAppSelector((state) => state.projects);
  const productsState = useAppSelector((state) => state.products);
  const projectsDynamic = useDynamicFields("projects");
  const [tableConfigOpen, setTableConfigOpen] = useState(false);
  const [globalOffices, setGlobalOffices] = useState<Office[]>([]);

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
  const projectFixedColumns = useMemo(
    () =>
      new Set(
        ["Job Number", "Customer", "Products", "Project Type", "Status", "Office"].map((value) => value.toLowerCase())
      ),
    []
  );
  const projectDynamicColumns = useMemo(
    () =>
      projectsTableConfig.visibleFields.filter((field) => {
        if (projectFixedColumns.has(field.name.toLowerCase())) return false;
        const hasValue = Object.values(projectsDynamic.valuesByEntity).some(
          (values) => values[field.id]?.value?.trim()
        );
        return hasValue;
      }),
    [projectsTableConfig.visibleFields, projectsDynamic.valuesByEntity, projectFixedColumns]
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
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Clear column filters when active office changes
  useEffect(() => {
    setAutoFilters({});
    setPage(0);
  }, [activeOffice]);

  useEffect(() => {
    dispatch(
      fetchProjects({
        // Don't filter by office on server-side - we'll filter client-side to support country-based filtering
        page: page + 1,
        pageSize: rowsPerPage
      })
    );
  }, [dispatch, page, rowsPerPage]);

  useEffect(() => {
    dispatch(fetchProducts());
  }, [dispatch]);

  const sourceProjects = items;
  const products = productsState.items.length ? productsState.items : demoProducts;

  // Map office cities to countries
  const getCountryForOffice = useMemo(() => {
    const map = new Map<string, string>();
    globalOffices.forEach((office) => {
      if (office.city && office.country) {
        map.set(office.city, office.country);
      }
    });
    return (officeCity: string) => map.get(officeCity) || officeCity;
  }, [globalOffices]);

  const projectAccessors = useMemo(
    () => ({
      jobNumber: (project: Project) => normalize(project.jobNumber),
      customerName: (project: Project) => normalize(project.customerName),
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
    const officeFiltered = sourceProjects.filter(
      (project) => {
        if (activeOffice === "All") return true;
        const projectCountry = getCountryForOffice(project.office);
        return projectCountry === activeOffice || project.office === activeOffice;
      }
    );

    const filtered = applyAutoFilter(officeFiltered, autoFilters, projectAccessors);
    return applyAutoSort(filtered, autoSort, projectAccessors);
  }, [activeOffice, sourceProjects, autoFilters, autoSort, projectAccessors, getCountryForOffice]);

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
          return { ...builtIn, isBuiltIn: true };
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

  const handleAction = (project: Project, label: string) => {
    if (!project.id) {
      return;
    }

    if (label === "Submit for Approval") {
      dispatch(updateProjectStatus({ id: project.id, payload: { status: "Pending Approval" } }));
    }

    if (label === "Approve") {
      dispatch(
        updateProjectStatus({
          id: project.id,
          payload: { status: "Approved", approvalDecision: "Approved" }
        })
      );
    }

    if (label === "Request Info") {
      dispatch(
        updateProjectStatus({
          id: project.id,
          payload: { status: "Pending Approval", approvalDecision: "More Info Required" }
        })
      );
    }

    if (label === "Reject") {
      dispatch(
        updateProjectStatus({
          id: project.id,
          payload: { status: "Cancelled", approvalDecision: "Rejected" }
        })
      );
    }

    if (label === "Start Work") {
      dispatch(updateProjectStatus({ id: project.id, payload: { status: "In Progress" } }));
    }

    if (label === "Mark Completed") {
      dispatch(updateProjectStatus({ id: project.id, payload: { status: "Completed" } }));
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

    if (project.status === "Approved" && user?.role !== "Viewer") {
      actions.push("Start Work");
    }

    if (project.status === "In Progress" && user?.role !== "Viewer") {
      actions.push("Mark Completed");
    }

    if (actions.length === 0) {
      return <Chip label="No actions" size="small" variant="outlined" />;
    }

    return (
      <Stack direction="row" spacing={1} flexWrap="wrap">
        {actions.map((label) => (
          <Button key={label} size="small" variant="outlined" onClick={() => handleAction(project, label)}>
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
          <Typography variant="h5" sx={{ fontFamily: "Sora" }}>
            Projects
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Showing {activeOffice === "All" ? "all offices" : activeOffice} projects.
          </Typography>
        </Box>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <Button variant="contained" component={Link} to="/projects/new">
            Create project
          </Button>
          <Button variant="outlined" onClick={() => setTableConfigOpen(true)}>
            Table configuration
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Typography variant="body2" color="warning.main">
          API unavailable. Showing demo data for local testing.
        </Typography>
      )}

      <Box
        className="glass-card"
        sx={{
          padding: 2,
          paddingBottom: 0,
          marginBottom: '80px',
          minHeight: 'calc(100vh - 280px)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <Box sx={{ overflowX: 'auto', width: '100%', flex: 1 }}>
          <Table sx={{ minWidth: 2000 }} size="small">
          <TableHead>
            <TableRow>
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
            {pagedProjects.map((project) => (
              <TableRow key={project.id} hover>
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
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    {renderActions(project)}
                    <IconButton size="small" component={Link} to={`/projects/${project.id}/edit`}>
                      <EditOutlined fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => setDeleteTarget(project)}>
                      <DeleteOutline fontSize="small" />
                    </IconButton>
                  </Stack>
                </TableCell>
            </TableRow>
          ))}
        </TableBody>
          </Table>
        </Box>
      </Box>

      <Box
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
      </Box>

      {deleteTarget && (
        <Box className="glass-card" sx={{ padding: 2, marginTop: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
            <Typography variant="body2">
              Delete project {deleteTarget.jobNumber}? This cannot be undone.
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="contained"
                color="error"
                onClick={() => {
                  dispatch(deleteProject(deleteTarget.id));
                  setDeleteTarget(null);
                }}
              >
                Delete
              </Button>
            </Stack>
          </Stack>
        </Box>
      )}

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

      <TableConfigDialog
        open={tableConfigOpen}
        onClose={() => setTableConfigOpen(false)}
        title="Table configuration: projects"
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
          { id: "customerName", name: "Customer", type: "text", required: false },
          { id: "customerId", name: "Customer ID", type: "text", required: true },
          { id: "products", name: "Products", type: "multi-select", required: true },
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
          await fieldService.createDefinition({
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
          await projectsDynamic.reload();
        }}
        onDeleteField={async (fieldId) => {
          await fieldService.deleteDefinition(fieldId);
          await projectsDynamic.reload();
        }}
      />
    </Stack>
  );
};

export default ProjectList;
