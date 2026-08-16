import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { DownloadOutlined, RefreshOutlined } from "@mui/icons-material";
import { useCallback, useEffect, useState } from "react";
import {
  faultReportAdminService,
  type FaultReportDetail,
  type FaultReportRow,
  type FaultReportSummary,
} from "../../services/faultReportAdminService";

const STATUSES = ["New", "Investigating", "Fixed", "WontFix", "Duplicate"];
const SEVERITIES = ["S0", "S1", "S2", "S3", "S4"];

const SEVERITY_COLOR: Record<string, "error" | "warning" | "info" | "default"> = {
  S0: "error",
  S1: "error",
  S2: "warning",
  S3: "info",
  S4: "default",
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function FaultReportsPage() {
  const [rows, setRows] = useState<FaultReportRow[]>([]);
  const [summary, setSummary] = useState<FaultReportSummary | null>(null);
  const [statusFilter, setStatusFilter] = useState("unresolved");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<FaultReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, counts] = await Promise.all([
        faultReportAdminService.list({ status: statusFilter, take: 200 }),
        faultReportAdminService.summary(),
      ]);
      setRows(list);
      setSummary(counts);
    } catch {
      setError("Could not load fault reports.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const full = await faultReportAdminService.get(id);
      setDetail(full);
      setNotesDraft(full.report.notes ?? "");
    } catch {
      setError("Could not load that report.");
    } finally {
      setDetailLoading(false);
    }
  };

  const patch = async (id: string, changes: { status?: string; severity?: string; notes?: string }) => {
    const updated = await faultReportAdminService.update(id, changes);
    setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
    setDetail((prev) => (prev && prev.report.id === id ? { ...prev, report: updated } : prev));
    void load();
  };

  const downloadDiagnostics = () => {
    if (!detail?.diagnosticsJson) return;
    const blob = new Blob([detail.diagnosticsJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `fault-${detail.report.referenceCode}-diagnostics.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <Typography variant="h5">Fault reports</Typography>
        <Box sx={{ flex: 1 }} />
        <TextField
          select
          size="small"
          label="Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="unresolved">Unresolved</MenuItem>
          <MenuItem value="all">All</MenuItem>
          {STATUSES.map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </TextField>
        <Button startIcon={<RefreshOutlined />} onClick={() => void load()}>
          Refresh
        </Button>
      </Stack>

      {summary && (
        <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
          <Chip label={`${summary.unresolved} unresolved`} color={summary.unresolved > 0 ? "warning" : "default"} />
          <Chip label={`${summary.new} new`} variant="outlined" />
          <Chip label={`${summary.investigating} investigating`} variant="outlined" />
          <Chip label={`${summary.lastSevenDays} in last 7 days`} variant="outlined" />
          <Chip label={`${summary.total} total`} variant="outlined" />
        </Stack>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined">
        {loading ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <CircularProgress size={24} />
          </Box>
        ) : rows.length === 0 ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography color="text.secondary">No reports here. That's the good outcome.</Typography>
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Reference</TableCell>
                <TableCell>Severity</TableCell>
                <TableCell>What happened</TableCell>
                <TableCell>Where</TableCell>
                <TableCell>Who</TableCell>
                <TableCell>Platform</TableCell>
                <TableCell>When</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  hover
                  sx={{ cursor: "pointer" }}
                  onClick={() => void openDetail(row.id)}
                >
                  <TableCell sx={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>
                    {row.referenceCode}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={row.severity}
                      color={SEVERITY_COLOR[row.severity] ?? "default"}
                    />
                  </TableCell>
                  <TableCell sx={{ maxWidth: 320 }}>
                    <Typography variant="body2" noWrap title={row.title}>
                      {row.title}
                    </Typography>
                    {row.kind !== "user-report" && (
                      <Typography variant="caption" color="error">
                        automatic ({row.kind})
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">{row.routePath ?? "—"}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">{row.userEmail ?? "—"}</Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5}>
                      <Chip size="small" variant="outlined" label={row.platform} />
                      {row.wasOffline && <Chip size="small" color="info" label="offline" />}
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>
                    <Typography variant="caption">{formatWhen(row.createdAtUtc)}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={row.status}
                      color={row.status === "New" ? "primary" : "default"}
                      variant={row.status === "New" ? "filled" : "outlined"}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Dialog open={Boolean(detail) || detailLoading} onClose={() => setDetail(null)} maxWidth="md" fullWidth>
        {detailLoading && !detail ? (
          <DialogContent>
            <Box sx={{ p: 4, textAlign: "center" }}>
              <CircularProgress size={24} />
            </Box>
          </DialogContent>
        ) : detail ? (
          <>
            <DialogTitle>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography sx={{ fontFamily: "monospace" }}>{detail.report.referenceCode}</Typography>
                <Chip
                  size="small"
                  label={detail.report.severity}
                  color={SEVERITY_COLOR[detail.report.severity] ?? "default"}
                />
                <Chip size="small" variant="outlined" label={detail.report.kind} />
              </Stack>
            </DialogTitle>
            <DialogContent dividers>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="subtitle2">{detail.report.title}</Typography>
                  {detail.report.description && (
                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 0.5 }}>
                      {detail.report.description}
                    </Typography>
                  )}
                </Box>

                <Divider />

                <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
                  <Detail label="Reported by" value={detail.report.userEmail ?? "—"} />
                  <Detail label="Role" value={detail.report.userRole ?? "—"} />
                  <Detail label="Platform" value={detail.report.platform} />
                  <Detail label="App version" value={detail.report.appVersion ?? "—"} />
                  <Detail label="Offline at the time" value={detail.report.wasOffline ? "Yes" : "No"} />
                  <Detail label="Screen" value={detail.report.routePath ?? "—"} />
                  <Detail label="Happened" value={formatWhen(detail.report.occurredAtUtc)} />
                  {detail.report.traceId && <Detail label="Trace id" value={detail.report.traceId} />}
                </Stack>

                {detail.report.errorMessage && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Error
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                      {detail.report.errorName}: {detail.report.errorMessage}
                    </Typography>
                  </Box>
                )}

                {detail.breadcrumbsJson && <Breadcrumbs json={detail.breadcrumbsJson} />}

                {detail.errorStack && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Stack
                    </Typography>
                    <Box
                      component="pre"
                      sx={{
                        m: 0,
                        p: 1.5,
                        maxHeight: 200,
                        overflow: "auto",
                        bgcolor: "action.hover",
                        borderRadius: 1,
                        fontSize: 12,
                      }}
                    >
                      {detail.errorStack}
                    </Box>
                  </Box>
                )}

                <Divider />

                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                  <TextField
                    select
                    size="small"
                    label="Status"
                    value={detail.report.status}
                    onChange={(e) => void patch(detail.report.id, { status: e.target.value })}
                    sx={{ minWidth: 160 }}
                  >
                    {STATUSES.map((s) => (
                      <MenuItem key={s} value={s}>
                        {s}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    size="small"
                    label="Severity"
                    value={detail.report.severity}
                    onChange={(e) => void patch(detail.report.id, { severity: e.target.value })}
                    sx={{ minWidth: 120 }}
                  >
                    {SEVERITIES.map((s) => (
                      <MenuItem key={s} value={s}>
                        {s}
                      </MenuItem>
                    ))}
                  </TextField>
                  {detail.diagnosticsJson && (
                    <Button startIcon={<DownloadOutlined />} onClick={downloadDiagnostics}>
                      Diagnostics JSON
                    </Button>
                  )}
                </Stack>

                <TextField
                  label="Triage notes"
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  onBlur={() => {
                    if (notesDraft !== (detail.report.notes ?? "")) {
                      void patch(detail.report.id, { notes: notesDraft });
                    }
                  }}
                  fullWidth
                  multiline
                  minRows={2}
                />
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDetail(null)}>Close</Button>
            </DialogActions>
          </>
        ) : null}
      </Dialog>
    </Box>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Box>
  );
}

function Breadcrumbs({ json }: { json: string }) {
  let entries: { ts: string; type: string; label: string }[] = [];
  try {
    entries = JSON.parse(json);
  } catch {
    return null;
  }
  if (entries.length === 0) return null;

  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        Leading up to it
      </Typography>
      <Stack spacing={0.25} sx={{ mt: 0.5 }}>
        {entries.slice(-15).map((entry, i) => (
          <Typography key={`${entry.ts}-${i}`} variant="caption" sx={{ fontFamily: "monospace" }}>
            {entry.type === "route" ? "→" : "•"} {entry.label}
          </Typography>
        ))}
      </Stack>
    </Box>
  );
}
