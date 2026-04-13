import { Alert, Box, Button, Chip, Dialog, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import StatusStepper from "../../components/ui/StatusStepper";
import { demoProducts } from "../../data/demo";
import { useAuth } from "../../hooks/useAuth";
import { projectService } from "../../services/projectService";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { fetchProjects, updateProjectStatus } from "../../store/projectSlice";
import { fetchProducts } from "../../store/productsSlice";
import { Project } from "../../types/project";
import ProjectForm from "./ProjectForm";
import { getProjectCompletionSummary, notifyProjectReadyForCompletion } from "./projectActionUtils";

const ProjectDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const { items } = useAppSelector((state) => state.projects);
  const productsState = useAppSelector((state) => state.products);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const localProject = useMemo(() => items.find((item) => item.id === id), [id, items]);
  const products = productsState.items.length ? productsState.items : demoProducts;
  const canEditProject = useMemo(() => {
    if (!project || !user) return false;
    if (user.role === "Admin") return true;
    return user.role === "Project Manager" && project.assignedPmUserId === user.id;
  }, [project, user]);

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

  const actions = useMemo(() => {
    if (!project) return [];

    const list: string[] = [];
    if (project.status === "Pending Approval" && user?.role === "Admin") {
      list.push("Approve", "Reject");
    }
    if (project.status === "Approved" && canEditProject) {
      list.push("Start Work");
    }
    if (project.status === "In Progress" && canEditProject) {
      list.push("Mark Completed");
    }
    return list;
  }, [canEditProject, project, user]);

  const handleAction = async (label: string) => {
    if (!project || !project.id) return;

    if (label === "Approve") {
      dispatch(
        updateProjectStatus({
          id: project.id,
          payload: { status: "Approved", approvalDecision: "Approved" }
        })
      );
      setProject({ ...project, status: "Approved", approvalDecision: "Approved" });
    }

    if (label === "Reject") {
      dispatch(
        updateProjectStatus({
          id: project.id,
          payload: { status: "Cancelled", approvalDecision: "Rejected" }
        })
      );
      setProject({ ...project, status: "Cancelled", approvalDecision: "Rejected" });
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
        const completion = await getProjectCompletionSummary(project.id);
        if (completion.percentComplete < 100) {
          window.alert(
            `This project is only ${completion.percentComplete}% complete (${completion.completedAssets}/${completion.totalAssets} assets completed). Complete all project assets before marking the project completed.`
          );
          return;
        }

        await notifyProjectReadyForCompletion(project, {
          id: user?.id ?? null,
          fullName: user?.fullName ?? null,
        });
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
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {project.customerName} � {project.office}
          </Typography>
        </Box>
        {canEditProject && (
          <Button variant="outlined" onClick={() => setEditOpen(true)}>
            Edit project
          </Button>
        )}
      </Stack>

      <StatusStepper type={project.projectType} status={project.status} />

      <Box className="glass-card" sx={{ padding: 3 }}>
        <Stack spacing={1}>
          <Typography variant="subtitle1">Workflow actions</Typography>
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
          <Typography variant="body2">Installation: {project.isInstallationProject ? "Yes" : "No"}</Typography>
          <Typography variant="body2">
            Products:{" "}
            {project.productIds?.length
              ? project.productIds
                  .map((productId) => products.find((product) => product.id === productId)?.name || productId)
                  .join(", ")
              : "None"}
          </Typography>
        </Stack>
      </Box>

      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          className: "glass-card",
          sx: { backgroundColor: "var(--panel)", border: "1px solid var(--stroke)", minHeight: "80vh" }
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


