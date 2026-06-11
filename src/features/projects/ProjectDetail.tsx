import { Alert, Box, Button, Chip, Dialog, DialogContent, DialogTitle, Stack, Tab, Tabs, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import StatusStepper from "../../components/ui/StatusStepper";
import { demoProducts } from "../../data/demo";
import { useAuth } from "../../hooks/useAuth";
import { usePermissions } from "../../hooks/usePermissions";
import { projectAssetService } from "../../services/projectAssetService";
import { projectService } from "../../services/projectService";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { fetchProjects, updateProjectStatus } from "../../store/projectSlice";
import { fetchProducts } from "../../store/productsSlice";
import type { Project, WorkflowMode } from "../../types/project";
import type { ProjectAsset } from "../../types/projectAsset";
import ProjectForm from "./ProjectForm";
import ProjectInspectionInboxPage from "./ProjectInspectionInboxPage";

type DetailTab = "overview" | "inbox";

const installationEnabled = (workflowMode?: WorkflowMode) =>
  workflowMode === "INSTALLATION_ONLY" || workflowMode === "MIXED" || !workflowMode;

const inspectionEnabled = (workflowMode?: WorkflowMode) =>
  workflowMode === "INSPECTION_ONLY" || workflowMode === "MIXED";

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
  const products = productsState.items.length ? productsState.items : demoProducts;
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
    if (installationEnabled(project.workflowMode)) tabs.push("overview");
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
    const list: string[] = [];
    if (project.status === "Pending Approval" && can.projects?.editScope === "all") {
      list.push("Approve", "Reject");
    }
    if (project.status === "Approved" && canEditProject && installationEnabled(project.workflowMode)) {
      list.push("Start Work");
    }
    if (project.status === "In Progress" && canEditProject && installationEnabled(project.workflowMode)) {
      list.push("Mark Completed");
    }
    return list;
  }, [canEditProject, project, can.projects?.editScope]);

  const handleTabChange = (_: React.SyntheticEvent, value: DetailTab) => {
    if (!project) return;
    const route =
      value === "overview"
        ? `/projects/${project.id}`
        : `/projects/${project.id}/inspections/inbox`;
    navigate(route);
  };

  const handleAction = async (label: string) => {
    if (!project?.id) return;

    if (label === "Approve") {
      const updated = await dispatch(
        updateProjectStatus({
          id: project.id,
          payload: { status: "Approved", approvalDecision: "Approved" },
        })
      ).unwrap();
      setProject(updated);
    }

    if (label === "Reject") {
      const updated = await dispatch(
        updateProjectStatus({
          id: project.id,
          payload: { status: "Cancelled", approvalDecision: "Rejected" },
        })
      ).unwrap();
      setProject(updated);
    }

    if (label === "Start Work") {
      const updated = await dispatch(updateProjectStatus({ id: project.id, payload: { status: "In Progress" } })).unwrap();
      setProject(updated);
      navigate(
        `/installations/assets?product=${encodeURIComponent(updated.productIds?.[0] ?? project.productIds?.[0] ?? "")}&project=${encodeURIComponent(project.id)}`
      );
    }

    if (label === "Mark Completed") {
      try {
        const assets = await projectAssetService.listByProject(project.id);
        const totalAssets = assets.length;
        const completedAssets = assets.filter((a) => a.status === "Complete").length;
        const percentComplete = totalAssets > 0 ? Math.round((completedAssets / totalAssets) * 100) : 0;
        if (percentComplete < 100) {
          window.alert(
            `This project is only ${percentComplete}% complete (${completedAssets}/${totalAssets} assets completed). Complete all project assets before marking the project completed.`
          );
          return;
        }
        window.alert("Project assets are 100% complete. The Project Manager has been notified to change the project status to Completed.");
      } catch {
        window.alert("Unable to verify project completion right now. Check asset progress and API availability.");
      }
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
              Project detail -
            </Typography>
            {installationEnabled(project.workflowMode) ? (
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
            {installationEnabled(project.workflowMode) && <Tab value="overview" label="Installation" />}
            {inspectionEnabled(project.workflowMode) && <Tab value="inbox" label="Inspection Inbox" />}
          </Tabs>
        </Box>
      )}

      {currentTab === "overview" && installationEnabled(project.workflowMode) && (
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

      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          className: "glass-card",
          sx: { backgroundColor: "var(--panel)", border: "1px solid var(--stroke)", minHeight: "80vh" },
        }}
      >
        <DialogTitle>Edit project</DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {project && (
            <Box sx={{ p: 3 }}>
              <ProjectForm
                embedded
                projectId={project.id}
                onClose={() => setEditOpen(false)}
                onSaved={async (saved) => {
                  setProject(saved);
                  setEditOpen(false);
                  await dispatch(fetchProjects({}));
                }}
              />
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Stack>
  );
};

export default ProjectDetail;
