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
import { useEffect, useMemo, useState } from "react";
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
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { fetchProducts } from "../../store/productsSlice";
import { deleteProject, fetchProjects, updateProjectStatus } from "../../store/projectSlice";
import { Project } from "../../types/project";

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
  const projectsTableConfig = useTableConfig(
    "projects",
    user?.id || "anonymous",
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
        ["Job Number", "Customer", "Products", "Type", "Status", "Office"].map((value) => value.toLowerCase())
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
  const [rowsPerPage, setRowsPerPage] = useState(5);

  useEffect(() => {
    dispatch(
      fetchProjects({
        office: activeOffice !== "All" ? activeOffice : undefined,
        page: page + 1,
        pageSize: rowsPerPage
      })
    );
  }, [dispatch, activeOffice, page, rowsPerPage]);

  useEffect(() => {
    dispatch(fetchProducts());
  }, [dispatch]);

  const sourceProjects = items;
  const products = productsState.items.length ? productsState.items : demoProducts;

  const projectAccessors = useMemo(
    () => ({
      jobNumber: (project: Project) => normalize(project.jobNumber),
      customerName: (project: Project) => normalize(project.customerName),
      products: (project: Project) =>
        normalize(
          project.productIds?.length
            ? project.productIds
                .map((productId) => products.find((product) => product.id === productId)?.name || productId)
                .join(", ")
            : ""
        ),
      projectType: (project: Project) => normalize(project.projectType),
      status: (project: Project) => normalize(project.status),
      office: (project: Project) => normalize(project.office)
    }),
    [products]
  );

  const filteredProjects = useMemo(() => {
    const officeFiltered = sourceProjects.filter(
      (project) => activeOffice === "All" || project.office === activeOffice
    );
    const filtered = applyAutoFilter(officeFiltered, autoFilters, projectAccessors);
    return applyAutoSort(filtered, autoSort, projectAccessors);
  }, [activeOffice, sourceProjects, autoFilters, autoSort, projectAccessors]);

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
      products: Array.from(new Set(sourceProjects.map((project) => projectAccessors.products(project)))).sort(),
      projectType: Array.from(new Set(sourceProjects.map((project) => projectAccessors.projectType(project)))).sort(),
      status: Array.from(new Set(sourceProjects.map((project) => projectAccessors.status(project)))).sort(),
      office: Array.from(new Set(sourceProjects.map((project) => projectAccessors.office(project)))).sort()
    }),
    [sourceProjects, projectAccessors]
  );

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

      <Box className="glass-card" sx={{ padding: 2 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              <TableCell>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <span>Job Number</span>
                  <IconButton size="small" onClick={(event) => setAutoMenu({ anchorEl: event.currentTarget, key: "jobNumber" })}>
                    <ArrowDropDown fontSize="small" />
                  </IconButton>
                </Stack>
              </TableCell>
              <TableCell>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <span>Customer</span>
                  <IconButton size="small" onClick={(event) => setAutoMenu({ anchorEl: event.currentTarget, key: "customerName" })}>
                    <ArrowDropDown fontSize="small" />
                  </IconButton>
                </Stack>
              </TableCell>
              <TableCell>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <span>Products</span>
                  <IconButton size="small" onClick={(event) => setAutoMenu({ anchorEl: event.currentTarget, key: "products" })}>
                    <ArrowDropDown fontSize="small" />
                  </IconButton>
                </Stack>
              </TableCell>
              <TableCell>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <span>Type</span>
                  <IconButton size="small" onClick={(event) => setAutoMenu({ anchorEl: event.currentTarget, key: "projectType" })}>
                    <ArrowDropDown fontSize="small" />
                  </IconButton>
                </Stack>
              </TableCell>
              <TableCell>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <span>Status</span>
                  <IconButton size="small" onClick={(event) => setAutoMenu({ anchorEl: event.currentTarget, key: "status" })}>
                    <ArrowDropDown fontSize="small" />
                  </IconButton>
                </Stack>
              </TableCell>
              <TableCell>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <span>Office</span>
                  <IconButton size="small" onClick={(event) => setAutoMenu({ anchorEl: event.currentTarget, key: "office" })}>
                    <ArrowDropDown fontSize="small" />
                  </IconButton>
                </Stack>
              </TableCell>
              {projectDynamicColumns.map((field) => (
                <TableCell key={`projects-field-${field.id}`}>{field.name}</TableCell>
              ))}
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pagedProjects.map((project) => (
              <TableRow key={project.id} hover>
                <TableCell>{project.seq}</TableCell>
                <TableCell>
                  <Box
                    component="span"
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      borderRadius: 999,
                      px: 0.5,
                      py: 0.25,
                      backgroundColor: "rgba(255, 193, 7, 0.2)",
                      fontWeight: 600
                    }}
                  >
                    <Button
                      variant="text"
                      size="small"
                      component={Link}
                      to={`/installations?job=${encodeURIComponent(project.jobNumber)}`}
                      sx={{ minWidth: "auto", padding: 0 }}
                    >
                      {project.jobNumber}
                    </Button>
                  </Box>
                </TableCell>
                <TableCell>{project.customerName}</TableCell>
                <TableCell>
                  {project.productIds?.length
                    ? project.productIds
                        .map((productId) => products.find((product) => product.id === productId)?.name || productId)
                        .join(", ")
                    : "-"}
                </TableCell>
                <TableCell>{project.projectType}</TableCell>
                <TableCell>
                  <StatusChip status={project.status} />
                </TableCell>
                <TableCell>{project.office}</TableCell>
                {projectDynamicColumns.map((field) => (
                  <TableCell key={`${project.id}-${field.id}`}>
                    {projectsDynamic.valuesByEntity[project.id]?.[field.id]?.value || "-"}
                  </TableCell>
                ))}
                <TableCell>
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
          rowsPerPageOptions={[5, 10, 25]}
        />
      </Box>
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
