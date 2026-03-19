import { useEffect, useState } from "react";
import {
  Box, Typography, Button, Stack, Card, CardContent,
  Table, TableBody, TableCell, TableHead, TableRow, Paper,
  Chip, CircularProgress, Alert, IconButton, Tooltip, Switch, FormControlLabel,
} from "@mui/material";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import RestoreOutlinedIcon from "@mui/icons-material/RestoreOutlined";
import { useNavigate } from "react-router-dom";
import { useBomProject } from "../store/BomProjectContext";
import { bomApiService } from "../services/bomApiService";
import ImportRunStatusBadge from "../components/ImportRunStatusBadge";

export default function BomDashboard() {
  const { state, dispatch } = useBomProject();
  const navigate = useNavigate();
  const [showArchived, setShowArchived] = useState(false);
  const [archiving, setArchiving] = useState<string | null>(null);

  useEffect(() => {
    dispatch({ type: "SET_RUNS_LOADING", payload: true });
    bomApiService
      .listRuns()
      .then((runs) => dispatch({ type: "SET_RUNS", payload: runs }))
      .catch((err) => dispatch({ type: "SET_ERROR", payload: String(err) }))
      .finally(() => dispatch({ type: "SET_RUNS_LOADING", payload: false }));
  }, [dispatch]);

  const handleArchive = async (id: string, restore: boolean) => {
    setArchiving(id);
    try {
      if (restore) {
        await bomApiService.updateRun(id, { status: "ready" } as never);
      } else {
        await bomApiService.deleteRun(id);
      }
      const runs = await bomApiService.listRuns();
      dispatch({ type: "SET_RUNS", payload: runs });
    } catch { /* ignore */ }
    finally { setArchiving(null); }
  };

  const visibleRuns = showArchived
    ? state.runs
    : state.runs.filter((r) => r.status !== "archived");

  const stats = {
    total: state.runs.filter((r) => r.status !== "archived").length,
    published: state.runs.filter((r) => r.status === "published").length,
    ready: state.runs.filter((r) => r.status === "ready").length,
    failed: state.runs.filter((r) => r.status === "failed").length,
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>BOM to Project</Typography>
          <Typography variant="body2" color="text.secondary">
            Import BOMs, generate draft projects, and publish to the workflow system.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddOutlinedIcon />}
          onClick={() => navigate("/admin/bom-project/upload")}
        >
          New Import
        </Button>
      </Stack>

      {/* KPI strip */}
      <Box display="grid" gridTemplateColumns="repeat(4, 1fr)" gap={2} mb={3}>
        {[
          { label: "Total Imports", value: stats.total },
          { label: "Published", value: stats.published, color: "success.main" },
          { label: "Ready to Publish", value: stats.ready, color: "primary.main" },
          { label: "Failed", value: stats.failed, color: "error.main" },
        ].map(({ label, value, color }) => (
          <Card key={label} variant="outlined">
            <CardContent>
              <Typography variant="h4" fontWeight={700} color={color}>{value}</Typography>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      {state.error && <Alert severity="error" sx={{ mb: 2 }}>{state.error}</Alert>}

      {/* Import runs table */}
      <Stack direction="row" alignItems="center" spacing={2} mb={1}>
        <Typography variant="subtitle1" fontWeight={600}>Import Runs</Typography>
        <Box sx={{ flex: 1 }} />
        <FormControlLabel
          control={<Switch size="small" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />}
          label={<Typography variant="caption">Show archived</Typography>}
        />
      </Stack>
      <Paper variant="outlined">
        {state.runsLoading ? (
          <Box p={4} textAlign="center"><CircularProgress /></Box>
        ) : visibleRuns.length === 0 ? (
          <Box p={6} textAlign="center">
            <FolderOpenOutlinedIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
            <Typography color="text.secondary">No imports yet. Start by uploading a BOM file.</Typography>
            <Button variant="outlined" sx={{ mt: 2 }} onClick={() => navigate("/admin/bom-project/upload")}>
              Upload BOM
            </Button>
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>File</TableCell>
                <TableCell>Uploaded</TableCell>
                <TableCell>Sheets</TableCell>
                <TableCell align="right">Rows</TableCell>
                <TableCell align="right">Errors</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleRuns.map((run) => {
                const isArchived = run.status === "archived";
                return (
                  <TableRow key={run.id} hover sx={{ opacity: isArchived ? 0.55 : 1 }}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>{run.fileName}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {(run.fileSizeBytes / 1024).toFixed(1)} KB
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">
                        {new Date(run.uploadedAt).toLocaleDateString()}
                      </Typography>
                      {run.uploadedBy && (
                        <Typography variant="caption" color="text.disabled" display="block">
                          {run.uploadedBy}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap">
                        {run.selectedSheets.map((s) => (
                          <Chip key={s} label={s} size="small" variant="outlined" />
                        ))}
                      </Stack>
                    </TableCell>
                    <TableCell align="right">{run.normalizedRows}</TableCell>
                    <TableCell align="right">
                      <Typography color={run.validationErrors > 0 ? "error.main" : "text.secondary"}>
                        {run.validationErrors}
                      </Typography>
                    </TableCell>
                    <TableCell><ImportRunStatusBadge status={run.status} /></TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        {!isArchived && (
                          <Button size="small" onClick={() => navigate(`/admin/bom-project/imports/${run.id}`)}>
                            Open
                          </Button>
                        )}
                        <Tooltip title={isArchived ? "Restore" : "Archive"}>
                          <span>
                            <IconButton
                              size="small"
                              disabled={archiving === run.id}
                              onClick={() => handleArchive(run.id, isArchived)}
                            >
                              {archiving === run.id
                                ? <CircularProgress size={14} />
                                : isArchived
                                  ? <RestoreOutlinedIcon sx={{ fontSize: 16 }} />
                                  : <ArchiveOutlinedIcon sx={{ fontSize: 16 }} />
                              }
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Paper>
    </Box>
  );
}
