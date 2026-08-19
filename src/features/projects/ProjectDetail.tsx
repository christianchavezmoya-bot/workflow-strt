import { Alert, Box, Button, Chip, Stack, Tab, Tabs, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import StatusStepper from "../../components/ui/StatusStepper";
import { useAuth } from "../../hooks/useAuth";
import { usePermissions } from "../../hooks/usePermissions";
import { projectAssetService } from "../../services/projectAssetService";
import { projectService } from "../../services/projectService";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { fetchProjects } from "../../store/projectSlice";
import { fetchProducts } from "../../store/productsSlice";
import type { Project, WorkflowMode } from "../../types/project";
import type { ProjectAsset } from "../../types/projectAsset";
import ProjectEditDialog from "./ProjectEditDialog";
import ProjectInspectionInboxPage from "./ProjectInspectionInboxPage";
import { INSPECTION_INBOX_UI_ENABLED } from "../../config/productFeatureFlags";
import {
  executeProjectWorkflowAction,
  getProjectWorkflowActions,
  installationEnabledForProject,
  type ProjectWorkflowAction,
} from "./projectWorkflowActions";

type DetailTab = "overview" | "inbox";

const inspectionEnabled = (workflowMode?: WorkflowMode) =>
  INSPECTION_INBOX_UI_ENABLED
  && (workflowMode === "INSPECTION_ONLY" || workflowMode === "MIXED");

const ProjectDetail = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const can = usePermissions();
  const dispatch = useAppDispatch();
  const { items } = useAppSelector((state) => state.projects);
  const productsState = useAppSelector((state) => state.products);
  const [project, setProject] = useState<Project | null>(null);
  const [projectAssets, setProjectAssets] = useState<ProjectAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const localProject = useMemo(() => items.find((item) => item.id === id), [id, items]);
  const products = productsState.items;
  const canEditProject = useMemo(() => {
    if (!project || !user) return false;
    if (can.projects?.editScope === "all") return true;
    if (can.projects?.editScope === "own") return project.assignedPmUserId === user.id;
    return false;
  }, [project, user, can.projects?.editScope]);

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

  useEffect(() => {
    if (!project?.id || !inspectionEnabled(project.workflowMode)) {
      setProjectAssets([]);
      return;
    }

    projectAssetService
      .listByProject(project.id)
      .then(setProjectAssets)
      .catch(() => setProjectAssets([]));
  }, [project?.id, project?.workflowMode]);

  const currentTab = useMemo<DetailTab>(() => {
    if (location.pathname.endsWith("/inspections/inbox")) return "inbox";
    return "overview";
  }, [location.pathname]);

  const availableTabs = useMemo(() => {
    if (!project) return [] as DetailTab[];
    const tabs: DetailTab[] = [];
    if (installationEnabledForProject(project.workflowMode)) tabs.push("overview");
    if (inspectionEnabled(project.workflowMode)) tabs.push("inbox");
    return tabs;
  }, [project]);

  useEffect(() => {
    if (!project || availableTabs.length === 0) return;
    if (!availableTabs.includes(currentTab)) {
      navigate(inspectionEnabled(project.workflowMode) ? `/projects/${project.id}/inspections/inbox` : `/projects/${project.id}`, {
        replace: true,
      });
    }
  }, [availableTabs, currentTab, navigate, project]);

  const actions = useMemo(() => {
    if (!project) return [];
    return getProjectWorkflowActions(project, {
      userRole: user?.role,
      canApprove: !!can.projects?.approve,
      canEditProject,
      installationEnabled: installationEnabledForProject(project.workflowMode),
      surface: "detail",
    });
  }, [can.projects?.approve, canEditProject, project, user?.role]);

  const handleTabChange = (_: React.SyntheticEvent, value: DetailTab) => {
    if (!project) return;
    const route =
      value === "overview"
        ? `/projects/${project.id}`
        : `/projects/${project.id}/inspections/inbox`;
    navigate(route);
  };

  const handleAction = async (label: ProjectWorkflowAction) => {
    if (!project) return;
    const updated = await executeProjectWorkflowAction(dispatch, navigate, project, label, {
      onError: (message) => window.alert(message),
    });
    if (updated) setProject(updated);
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
              Project detail -
            </Typography>
            {installationEnabledForProject(project.workflowMode) ? (
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
            ) : (
              <Chip
                label={project.jobNumber}
                size="small"
                sx={{
                  background: "linear-gradient(135deg, rgba(45,212,191,0.2), rgba(45,212,191,0.1))",
                  border: "1px solid rgba(45,212,191,0.3)",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                }}
              />
            )}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {[project.customerName, project.office].filter(Boolean).join(" • ")}
          </Typography>
        </Box>
        {canEditProject && (
          <Button variant="outlined" onClick={() => setEditOpen(true)}>
            Edit project
          </Button>
        )}
      </Stack>

      <StatusStepper type={project.projectType} status={project.status} />

      {availableTabs.length > 1 && (
        <Box className="glass-card" sx={{ p: 1.5 }}>
          <Tabs value={currentTab} onChange={handleTabChange}>
            {installationEnabledForProject(project.workflowMode) && <Tab value="overview" label="Installation" />}
            {inspectionEnabled(project.workflowMode) && <Tab value="inbox" label="Inspection Inbox" />}
          </Tabs>
        </Box>
      )}

      {currentTab === "overview" && installationEnabledForProject(project.workflowMode) && (
        <>
          <Box className="glass-card" sx={{ padding: 3 }}>
            <Stack spacing={1}>
              <Typography variant="subtitle1">Workflow actions</Typography>
              {actions.length ? (
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {actions.map((label) => (
                    <Button key={label} variant="outlined" onClick={() => void handleAction(label)}>
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
              {project.completedAtUtc && (
                <Typography variant="body2">
                  Completed: {new Date(project.completedAtUtc).toLocaleString()}
                  {project.completedBy ? ` by ${project.completedBy}` : ""}
                </Typography>
              )}
              {project.closedAtUtc && (
                <Typography variant="body2">
                  Closed: {new Date(project.closedAtUtc).toLocaleString()}
                  {project.closedBy ? ` by ${project.closedBy}` : ""}
                </Typography>
              )}
              {project.deletedAtUtc && (
                <Typography variant="body2">
                  Deleted: {new Date(project.deletedAtUtc).toLocaleString()}
                </Typography>
              )}
              {project.approvalDecision && <Typography variant="body2">Approval: {project.approvalDecision}</Typography>}
              <Typography variant="body2">Type: {project.projectType}</Typography>
              <Typography variant="body2">
                Workflow mode: {project.workflowMode || (project.isInstallationProject ? "INSTALLATION_ONLY" : "INSPECTION_ONLY")}
              </Typography>
              <Typography variant="body2">
                Products:{" "}
                {project.productIds?.length
                  ? project.productIds
                      .map((productId) => products.find((product) => product.id === productId)?.name || productId)
                      .join(", ")
                  : "None"}
              </Typography>
              <Button
                component={Link}
                to={`/installations/assets?product=${encodeURIComponent(project.productIds?.[0] ?? "")}&project=${encodeURIComponent(project.id)}`}
                variant="contained"
                sx={{ alignSelf: "flex-start", mt: 1 }}
              >
                Assets
              </Button>
            </Stack>
          </Box>
        </>
      )}

      {currentTab === "inbox" && inspectionEnabled(project.workflowMode) && (
        <ProjectInspectionInboxPage projectId={project.id} assets={projectAssets} />
      )}

      <ProjectEditDialog
        open={editOpen}
        projectId={project.id}
        onClose={() => setEditOpen(false)}
        onSaved={async (saved) => {
          setProject(saved);
          setEditOpen(false);
          await dispatch(fetchProjects({}));
        }}
      />
    </Stack>
  );
};

export default ProjectDetail;
