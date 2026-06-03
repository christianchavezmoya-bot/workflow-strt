import { useEffect, useState } from "react";
import {
  Box, Typography, Button, Stack, Card, CardContent, Divider,
  Table, TableBody, TableCell, TableHead, TableRow, Paper,
  Chip, CircularProgress, Alert, IconButton, Tooltip, Switch, FormControlLabel,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from "@mui/material";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import RestoreOutlinedIcon from "@mui/icons-material/RestoreOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import { useNavigate } from "react-router-dom";
import { useBomProject } from "../store/BomProjectContext";
import { bomApiService } from "../services/bomApiService";
import ImportRunStatusBadge from "../components/ImportRunStatusBadge";
import { downloadBomTemplate } from "../services/bomTemplateGenerator";

export default function BomDashboard() {
  const { state, dispatch } = useBomProject();
  const navigate = useNavigate();
  const [showArchived, setShowArchived] = useState(false);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; fileName: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    dispatch({ type: "SET_RUNS_LOADING", payload: true });
    bomApiService
      .listRuns(showArchived)
      .then((runs) => dispatch({ type: "SET_RUNS", payload: runs }))
      .catch((err) => dispatch({ type: "SET_ERROR", payload: String(err) }))
      .finally(() => dispatch({ type: "SET_RUNS_LOADING", payload: false }));
  }, [dispatch, showArchived]);

  const handleArchive = async (id: string, restore: boolean) => {
    setArchiving(id);
    try {
      if (restore) {
        await bomApiService.restoreRun(id);
      } else {
        await bomApiService.deleteRun(id);
      }
      const runs = await bomApiService.listRuns(showArchived);
      dispatch({ type: "SET_RUNS", payload: runs });
    } catch { /* ignore */ }
    finally { setArchiving(null); }
  };

  const handlePurge = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await bomApiService.purgeRun(deleteTarget.id);
      const runs = await bomApiService.listRuns(showArchived);
      dispatch({ type: "SET_RUNS", payload: runs });
    } catch { /* ignore */ }
    finally { setDeleting(false); setDeleteTarget(null); }
  };

  const visibleRuns = showArchived
    ? state.runs
    : state.runs.filter((r) => !r.isDeleted);

  const stats = {
    total: state.runs.filter((r) => !r.isDeleted).length,
    published: state.runs.filter((r) => !r.isDeleted && r.status === "published").length,
    ready: state.runs.filter((r) => !r.isDeleted && r.status === "ready").length,
    failed: state.runs.filter((r) => !r.isDeleted && r.status === "failed").length,
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

      {/* ── Two-path getting started ── */}
      <Paper variant="outlined" sx={{ p: 2.5, mb: 1 }}>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          How would you like to import?
        </Typography>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} divider={<Divider orientation="vertical" flexItem />}>
          {/* Path A — template */}
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" fontWeight={600} gutterBottom>Use our template (recommended)</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Download our pre-formatted Excel file, fill in your equipment list, then upload. No column mapping needed.
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                size="small"
                startIcon={<DownloadOutlinedIcon />}
                onClick={downloadBomTemplate}
              >
                Download Template
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<UploadFileOutlinedIcon />}
                onClick={() => navigate("/admin/bom-project/upload")}
              >
                Upload Filled Template
              </Button>
            </Stack>
          </Box>
          {/* Path B — own file */}
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" fontWeight={600} gutterBottom>Upload your own file</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Already have a BOM from your supplier or engineering team? Upload it and map the columns manually.
            </Typography>
            <Button
              variant="outlined"
              size="small"
              startIcon={<UploadFileOutlinedIcon />}
              onClick={() => navigate("/admin/bom-project/upload")}
            >
              Upload My File
            </Button>
          </Box>
        </Stack>
      </Paper>

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
                const isArchived = !!run.isDeleted;
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
                        {!isArchived && run.status === "published" && run.publishedProjectId && (
                          <Button size="small" variant="outlined" color="primary"
                            onClick={() => navigate(`/projects/${run.publishedProjectId}`)}>
                            View Project
                          </Button>
                        )}
                        {!isArchived && run.status !== "published" && (
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
                        <Tooltip title="Delete permanently">
                          <IconButton
                            size="small"
                            onClick={() => setDeleteTarget({ id: run.id, fileName: run.fileName })}
                          >
                            <DeleteOutlinedIcon sx={{ fontSize: 16, color: "error.main" }} />
                          </IconButton>
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

      {/* Permanent delete confirmation */}
      <Dialog open={!!deleteTarget} onClose={() => !deleting && setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Import?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Permanently delete <strong>{deleteTarget?.fileName}</strong>? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handlePurge}
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={14} /> : <DeleteOutlinedIcon />}
          >
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
