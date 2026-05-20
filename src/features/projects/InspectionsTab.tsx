import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";

interface AssetWorkflowRun {
  id: string;
  assetId: string;
  assetName?: string;
  workflowTypeName?: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  assignedTo?: string;
}

interface Props {
  projectId: string;
}

const STATUS_COLOR: Record<string, "default" | "info" | "warning" | "success" | "error"> = {
  "not-started": "default",
  "in-progress": "info",
  "on-hold": "warning",
  completed: "success",
  failed: "error",
};

const InspectionsTab = ({ projectId }: Props) => {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<AssetWorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<AssetWorkflowRun[]>("/asset-workflow-runs", {
        params: { projectId, workflowType: "Inspection" },
      })
      .then((r) => {
        if (!cancelled) setRuns(r.data);
      })
      .catch(() => {
        if (!cancelled) setError("Unable to load inspection runs.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle1">Inspection runs</Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={() =>
            navigate(`/installations/assets?project=${encodeURIComponent(projectId)}&workflowType=Inspection`)
          }
        >
          Create inspection
        </Button>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {!error && runs.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No inspection runs yet. Click "Create inspection" to start one.
        </Typography>
      )}

      {runs.map((run) => (
        <Box
          key={run.id}
          className="glass-card"
          sx={{ p: 2, cursor: "pointer" }}
          onClick={() =>
            navigate(
              `/installations/assets?project=${encodeURIComponent(projectId)}&run=${encodeURIComponent(run.id)}`
            )
          }
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="body2" fontWeight={600}>
                {run.assetName || run.assetId}
              </Typography>
              {run.assignedTo && (
                <Typography variant="caption" color="text.secondary">
                  Assigned to {run.assignedTo}
                </Typography>
              )}
            </Box>
            <Chip
              label={run.status}
              size="small"
              color={STATUS_COLOR[run.status] ?? "default"}
            />
          </Stack>
          {run.startedAt && (
            <>
              <Divider sx={{ my: 1 }} />
              <Typography variant="caption" color="text.secondary">
                Started {new Date(run.startedAt).toLocaleDateString()}
                {run.completedAt && ` · Completed ${new Date(run.completedAt).toLocaleDateString()}`}
              </Typography>
            </>
          )}
        </Box>
      ))}
    </Stack>
  );
};

export default InspectionsTab;
