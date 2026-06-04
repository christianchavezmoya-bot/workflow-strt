import { Alert, Box, Button, Chip, Stack, Tab, Tabs, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { demoProducts } from "../../data/demo";
import { useAuth } from "../../hooks/useAuth";
import { usePermissions } from "../../hooks/usePermissions";
import { projectAssetService } from "../../services/projectAssetService";
import { projectService } from "../../services/projectService";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { updateProjectStatus } from "../../store/projectSlice";
import { fetchProducts } from "../../store/productsSlice";
import type { Project, ProjectStatus, WorkflowMode } from "../../types/project";
import InspectionsTab from "./InspectionsTab";
import InspectionInboxTab from "./InspectionInboxTab";

/** Derive effective workflow mode, providing safe backward-compat default. */
function effectiveMode(project: Project): WorkflowMode {
  if (project.workflowMode) return project.workflowMode as WorkflowMode;
  return project.isInstallationProject ? "INSTALLATION_ONLY" : "INSPECTION_ONLY";
}

const ProjectDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const can = usePermissions();
  const dispatch = useAppDispatch();
  const { items } = useAppSelector((state) => state.projects);
  const productsState = useAppSelector((state) => state.products);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);

  const localProject = useMemo(() => items.find((item) => item.id === id), [id, items]);
  const products = productsState.items.length ? productsState.items : demoProducts;

  useEffect(() => {
    if (!id) return;

    if (localProject) {
      setProject(localProject);
      return;
    }

    setLoading(true);
    projectService
      .getProject(id)
      .then((data) => setProject(data))
      .catch(() => setError("Unable to load project"))
      .finally(() => setLoading(false));
  }, [id, localProject]);

  useEffect(() => {
    dispatch(fetchProducts());
  }, [dispatch]);

  const mode = project ? effectiveMode(project) : "INSTALLATION_ONLY";
  const showInstallations = mode === "INSTALLATION_ONLY" || mode === "MIXED";
  const showInspections = mode === "INSPECTION_ONLY" || mode === "MIXED";

  const tabs = useMemo(() => {
    const list: string[] = ["Overview"];
    if (showInstallations) list.push("Installations");
    if (showInspections) list.push("Inspections", "Inspection Inbox");
    return list;
  }, [showInstallations, showInspections]);

  // Keep tab index in bounds when project loads and tabs change
  useEffect(() => {
    setTab((prev) => Math.min(prev, tabs.length - 1));
  }, [tabs.length]);

  const actions = useMemo(() => {
    if (!project) return [];
    const list: string[] = [];
    if (project.status === "Draft" && user?.role === "Project Manager") {
      list.push("Submit for Approval");
    }
    if (project.status === "Pending Approval" && user?.role === "Admin") {
      list.push("Approve", "Request Info", "Reject");
    }
    if (project.status === "Approved" && can.modifyData) {
      list.push("Start Work");
    }
    if (project.status === "In Progress" && can.modifyData) {
      list.push("Mark Completed");
    }
    return list;
  }, [project, user, can]);

  const handleAction = async (label: string) => {
    if (!project || !project.id) return;
    setActionError(null);

    const dispatchAndSet = (status: ProjectStatus, extra: Partial<Project> = {}) => {
      dispatch(updateProjectStatus({ id: project.id, payload: { status } }));
      setProject({ ...project, status, ...extra });
    };

    switch (label) {
      case "Submit for Approval":
        dispatchAndSet("Pending Approval");
        break;
      case "Approve":
        dispatch(updateProjectStatus({ id: project.id, payload: { status: "Approved", approvalDecision: "Approved" } }));
        setProject({ ...project, status: "Approved", approvalDecision: "Approved" });
        break;
      case "Request Info":
        dispatch(updateProjectStatus({ id: project.id, payload: { status: "Pending Approval", approvalDecision: "More Info Required" } }));
        setProject({ ...project, approvalDecision: "More Info Required" });
        break;
      case "Reject":
        dispatch(updateProjectStatus({ id: project.id, payload: { status: "Cancelled", approvalDecision: "Rejected" } }));
        setProject({ ...project, status: "Cancelled", approvalDecision: "Rejected" });
        break;
      case "Start Work":
        dispatchAndSet("In Progress");
        navigate(
          `/installations/assets?product=${encodeURIComponent(project.productIds?.[0] ?? "")}&project=${encodeURIComponent(project.id)}`
        );
        break;
      case "Mark Completed":
        try {
          const assets = await projectAssetService.listByProject(project.id);
          const total = assets.length;
          const completed = assets.filter((a) => a.status === "Complete").length;
          const completionPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
          const threshold = Math.min(100, Math.max(1, project.minimumCompletionPercent ?? 100));
          if (completionPercent < threshold) {
            const incomplete = total - completed;
            setActionError(
              `Project progress is ${completionPercent}% and requires ${threshold}% before completion is allowed. ${incomplete} of ${total} installation asset${incomplete !== 1 ? "s are" : " is"} not yet completed.`
            );
            return;
          }
          dispatchAndSet("Completed");
        } catch {
          setActionError("Unable to verify project progress. Please try again or contact support.");
        }
        break;
    }
  };

  if (loading) {
    return (
      <Typography variant="body2" color="text.secondary">
        Loading project...
      </Typography>
    );
  }

  if (!project) {
    return <Alert severity="warning">{error || "Project not found"}</Alert>;
  }

  return (
    <Stack spacing={3}>
      {/* ── Header ── */}
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems="center">
        <Box>
          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
            <Typography variant="h5" sx={{ fontFamily: "Sora" }}>
              Project detail —
            </Typography>
            <Chip
              label={project.jobNumber}
              size="small"
              clickable
              onClick={() =>
                navigate(
                  `/installations/assets?product=${encodeURIComponent(project.productIds?.[0] ?? "")}&project=${encodeURIComponent(project.id)}`
                )
              }
              sx={{
                background: "linear-gradient(135deg, rgba(45,212,191,0.2), rgba(45,212,191,0.1))",
                border: "1px solid rgba(45,212,191,0.3)",
                fontWeight: 600,
                fontSize: "0.875rem",
              }}
            />
            <Chip
              label={mode.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
              size="small"
              variant="outlined"
              sx={{ fontSize: "0.75rem" }}
            />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {project.customerName} · {project.office}
          </Typography>
        </Box>
        <Button variant="outlined" component={Link} to={`/projects/${project.id}/edit`}>
          Edit project
        </Button>
      </Stack>


      {/* ── Tabs ── */}
      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
          {tabs.map((label) => (
            <Tab key={label} label={label} />
          ))}
        </Tabs>
      </Box>

      {/* ── Tab: Overview ── */}
      {tabs[tab] === "Overview" && (
        <Stack spacing={2}>
          <Box className="glass-card" sx={{ padding: 3 }}>
            <Stack spacing={1}>
              <Typography variant="subtitle1">Workflow actions</Typography>
              {actionError && <Alert severity="warning">{actionError}</Alert>}
              {actions.length ? (
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {actions.map((label) => (
                    <Button key={label} variant="outlined" onClick={() => handleAction(label)}>
                      {label}
                    </Button>
                  ))}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No actions available for your role.
                </Typography>
              )}
            </Stack>
          </Box>

          <Box className="glass-card" sx={{ padding: 3 }}>
            <Stack spacing={1}>
              <Typography variant="subtitle1">Project snapshot</Typography>
              <Typography variant="body2">Status: {project.status}</Typography>
              {project.approvalDecision && (
                <Typography variant="body2">Approval: {project.approvalDecision}</Typography>
              )}
              <Typography variant="body2">Type: {project.projectType}</Typography>
              <Typography variant="body2">
                Workflow mode: {mode.replace(/_/g, " ")}
              </Typography>
              <Typography variant="body2">
                Minimum completion to allow Mark Completed: {project.minimumCompletionPercent ?? 100}%
              </Typography>
              <Typography variant="body2">
                Products:{" "}
                {project.productIds?.length
                  ? project.productIds
                      .map((pid) => products.find((p) => p.id === pid)?.name || pid)
                      .join(", ")
                  : "None"}
              </Typography>
            </Stack>
          </Box>
        </Stack>
      )}

      {/* ── Tab: Installations ── */}
      {tabs[tab] === "Installations" && (
        <Box>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              View and manage installation assets for this project.
            </Typography>
            <Button
              variant="contained"
              onClick={() =>
                navigate(
                  `/installations/assets?product=${encodeURIComponent(project.productIds?.[0] ?? "")}&project=${encodeURIComponent(project.id)}`
                )
              }
            >
              Open project assets
            </Button>
          </Stack>
        </Box>
      )}

      {/* ── Tab: Inspections ── */}
      {tabs[tab] === "Inspections" && <InspectionsTab projectId={project.id} />}

      {/* ── Tab: Inspection Inbox ── */}
      {tabs[tab] === "Inspection Inbox" && <InspectionInboxTab projectId={project.id} />}
    </Stack>
  );
};

export default ProjectDetail;
