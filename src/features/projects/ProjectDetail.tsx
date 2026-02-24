import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import StatusStepper from "../../components/ui/StatusStepper";
import { demoProducts } from "../../data/demo";
import { useAuth } from "../../hooks/useAuth";
import { projectService } from "../../services/projectService";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { updateProjectStatus } from "../../store/projectSlice";
import { fetchProducts } from "../../store/productsSlice";
import { Project } from "../../types/project";

const ProjectDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const { items } = useAppSelector((state) => state.projects);
  const productsState = useAppSelector((state) => state.products);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const actions = useMemo(() => {
    if (!project) return [];

    const list: string[] = [];
    if (project.status === "Draft" && user?.role === "Project Manager") {
      list.push("Submit for Approval");
    }
    if (project.status === "Pending Approval" && user?.role === "Admin") {
      list.push("Approve", "Request Info", "Reject");
    }
    if (project.status === "Approved" && user?.role !== "Viewer") {
      list.push("Start Work");
    }
    if (project.status === "In Progress" && user?.role !== "Viewer") {
      list.push("Mark Completed");
    }
    return list;
  }, [project, user]);

  const handleAction = (label: string) => {
    if (!project || !project.id) return;

    if (label === "Submit for Approval") {
      dispatch(updateProjectStatus({ id: project.id, payload: { status: "Pending Approval" } }));
      setProject({ ...project, status: "Pending Approval" });
    }

    if (label === "Approve") {
      dispatch(
        updateProjectStatus({
          id: project.id,
          payload: { status: "Approved", approvalDecision: "Approved" }
        })
      );
      setProject({ ...project, status: "Approved", approvalDecision: "Approved" });
    }

    if (label === "Request Info") {
      dispatch(
        updateProjectStatus({
          id: project.id,
          payload: { status: "Pending Approval", approvalDecision: "More Info Required" }
        })
      );
      setProject({ ...project, approvalDecision: "More Info Required" });
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
      dispatch(updateProjectStatus({ id: project.id, payload: { status: "In Progress" } }));
      setProject({ ...project, status: "In Progress" });
    }

    if (label === "Mark Completed") {
      dispatch(updateProjectStatus({ id: project.id, payload: { status: "Completed" } }));
      setProject({ ...project, status: "Completed" });
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
          <Typography variant="h5" sx={{ fontFamily: "Sora" }}>
            Project detail - {project.jobNumber}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {project.customerName} • {project.office}
          </Typography>
        </Box>
        <Button variant="outlined" component={Link} to={`/projects/${project.id}/edit`}>
          Edit project
        </Button>
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
    </Stack>
  );
};

export default ProjectDetail;


