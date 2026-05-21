import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import type { ProjectAsset } from "../../types/projectAsset";
import type { InspectionImport } from "../../types/inspectionImport";
import { inspectionImportService } from "../../services/inspectionImportService";
import api from "../../services/api";

interface AssetInspectionRun {
  id: string;
  workflowTypeName: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  assignedTo?: string;
}

interface Props {
  asset: ProjectAsset | null;
  open: boolean;
  onClose: () => void;
}

const STATUS_COLOR: Record<string, "default" | "info" | "warning" | "success" | "error"> = {
  RECEIVED: "info",
  NEEDS_ASSIGNMENT: "warning",
  MAPPED: "success",
  FAILED: "error",
  InProgress: "info",
  Paused: "warning",
  Complete: "success",
  Issue: "error",
};

const AssetInspectionDialog = ({ asset, open, onClose }: Props) => {
  const [runs, setRuns] = useState<AssetInspectionRun[]>([]);
  const [imports, setImports] = useState<InspectionImport[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !asset) return;
    setLoading(true);
    Promise.all([
      api.get<AssetInspectionRun[]>("/asset-workflow-runs", {
        params: { assetId: asset.id, workflowType: "Inspection" },
      }),
      asset.projectId
        ? inspectionImportService.listByProjectIncludeArchived(asset.projectId, asset.id)
        : Promise.resolve([]),
    ])
      .then(([runResponse, importItems]) => {
        setRuns(runResponse.data);
        setImports(importItems);
      })
      .finally(() => setLoading(false));
  }, [open, asset]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Asset inspections — {asset?.assetTag}</DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={26} />
          </Box>
        ) : (
          <Stack spacing={3} sx={{ mt: 1 }}>
            <Stack spacing={1}>
              <Typography variant="subtitle2">Inspection runs</Typography>
              {runs.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No inspection runs linked to this asset.
                </Typography>
              ) : runs.map((run) => (
                <Box key={run.id} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1.5 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{run.workflowTypeName}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Started {new Date(run.startedAt).toLocaleString()}
                        {run.completedAt ? ` · Completed ${new Date(run.completedAt).toLocaleString()}` : ""}
                        {run.assignedTo ? ` · ${run.assignedTo}` : ""}
                      </Typography>
                    </Box>
                    <Chip size="small" label={run.status} color={STATUS_COLOR[run.status] ?? "default"} />
                  </Stack>
                </Box>
              ))}
            </Stack>

            <Divider />

            <Stack spacing={1}>
              <Typography variant="subtitle2">Attached imports</Typography>
              {imports.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No inspection imports linked to this asset.
                </Typography>
              ) : imports.map((item) => (
                <Box key={item.id} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1.5 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{item.id}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {item.source} · {new Date(item.receivedAt).toLocaleString()}
                        {item.mappedRunId ? ` · Run ${item.mappedRunId}` : ""}
                      </Typography>
                    </Box>
                    <Chip size="small" label={item.status} color={STATUS_COLOR[item.status] ?? "default"} />
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default AssetInspectionDialog;
