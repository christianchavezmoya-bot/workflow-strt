import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
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
import { alpha } from "@mui/material/styles";
import {
  AddOutlined,
  DownloadOutlined,
  KeyboardArrowDownOutlined,
  KeyboardArrowUpOutlined,
  OpenInNewOutlined,
  RefreshOutlined,
} from "@mui/icons-material";
import { Fragment, useCallback, useEffect, useState } from "react";
import {
  faultReportAdminService,
  type FaultReportDetail,
  type FaultReportHistoryRow,
  type FaultReportRow,
  type FaultReportSummary,
} from "../../services/faultReportAdminService";
import { useRepoSubscription } from "../../hooks/useRepoSubscription";

const STATUSES = ["New", "Investigating", "Fixed", "WontFix", "Duplicate"];
const SEVERITIES = ["S0", "S1", "S2", "S3", "S4"];

const SEVERITY_COLOR: Record<string, "error" | "warning" | "info" | "default"> = {
  S0: "error",
  S1: "error",
  S2: "warning",
  S3: "info",
  S4: "default",
};

function statusColor(status: string): "primary" | "warning" | "success" | "default" {
  switch (status) {
    case "New":
      return "primary";
    case "Investigating":
      return "warning";
    case "Fixed":
      return "success";
    default:
      return "default";
  }
}

function formatWhen(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatOriginalReport(row: FaultReportRow): string {
  const primary = row.description?.trim() || row.title.trim();
  return primary || "Untitled fault report";
}

function historyAscending(history: FaultReportHistoryRow[]): FaultReportHistoryRow[] {
  return [...history].sort(
    (left, right) => new Date(left.createdAtUtc).getTime() - new Date(right.createdAtUtc).getTime(),
  );
}

function historyStatusSummary(entry: FaultReportHistoryRow): string {
  if (entry.eventType === "Created") {
    return `Initial status: ${entry.newStatus}`;
  }

  if (entry.previousStatus && entry.previousStatus !== entry.newStatus) {
    return `${entry.previousStatus} -> ${entry.newStatus}`;
  }

  return `Status: ${entry.newStatus}`;
}

function historyFindings(entry: FaultReportHistoryRow): string | null {
  const previous = (entry.previousNotes ?? "").trim();
  const next = (entry.newNotes ?? "").trim();
  if (!next) return null;
  if (next === previous) return next;
  return next;
}

function historyActor(row: FaultReportHistoryRow): string {
  return row.actorUserEmail ?? row.actorUserRole ?? "System";
}

function historyCardTone(status: string): { border: string; bg: string } {
  switch (status) {
    case "New":
      return { border: "#14b8a6", bg: alpha("#14b8a6", 0.08) };
    case "Investigating":
      return { border: "#f59e0b", bg: alpha("#f59e0b", 0.08) };
    case "Fixed":
      return { border: "#22c55e", bg: alpha("#22c55e", 0.08) };
    case "WontFix":
      return { border: "#94a3b8", bg: alpha("#94a3b8", 0.08) };
    case "Duplicate":
      return { border: "#a78bfa", bg: alpha("#a78bfa", 0.08) };
    default:
      return { border: "#475569", bg: alpha("#475569", 0.08) };
  }
}

function hasDraftChanges(
  detail: FaultReportDetail | null,
  statusDraft: string,
  severityDraft: string,
  notesDraft: string,
): boolean {
  if (!detail) return false;
  return (
    detail.report.status !== statusDraft ||
    detail.report.severity !== severityDraft ||
    (detail.report.notes ?? "") !== notesDraft
  );
}

export default function FaultReportsPage() {
  const [rows, setRows] = useState<FaultReportRow[]>([]);
  const [summary, setSummary] = useState<FaultReportSummary | null>(null);
  const [statusFilter, setStatusFilter] = useState("unresolved");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<FaultReportDetail | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, FaultReportDetail>>({});
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusDraft, setStatusDraft] = useState("New");
  const [severityDraft, setSeverityDraft] = useState("S2");
  const [notesDraft, setNotesDraft] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const primeDraft = useCallback((full: FaultReportDetail) => {
    setStatusDraft(full.report.status);
    setSeverityDraft(full.report.severity);
    setNotesDraft(full.report.notes ?? "");
  }, []);

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

  const fetchDetail = useCallback(async (id: string): Promise<FaultReportDetail | null> => {
    try {
      const full = await faultReportAdminService.get(id);
      setDetailCache((prev) => ({ ...prev, [id]: full }));
      return full;
    } catch {
      setError("Could not load that report.");
      return null;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRepoSubscription(["sse:fault-reports:updated"], () => {
    void load();
  });

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setSaveError(null);
    try {
      const full = await fetchDetail(id);
      if (!full) return;
      setDetail(full);
      primeDraft(full);
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => (
      prev.includes(id)
        ? prev.filter((entry) => entry !== id)
        : [...prev, id]
    ));
    if (!detailCache[id]) {
      void fetchDetail(id);
    }
  };

  const closeDetail = () => {
    setDetail(null);
    setSaveError(null);
  };

  const saveAndClose = async () => {
    if (!detail) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await faultReportAdminService.update(detail.report.id, {
        status: statusDraft,
        severity: severityDraft,
        notes: notesDraft,
      });
      const full = await faultReportAdminService.get(detail.report.id);
      setRows((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      setDetailCache((prev) => ({ ...prev, [updated.id]: full }));
      setDetail(null);
      void load();
    } catch {
      setSaveError("Could not save the report changes.");
    } finally {
      setSaving(false);
    }
  };

  const downloadDiagnostics = (full: FaultReportDetail) => {
    if (!full.diagnosticsJson) return;
    const blob = new Blob([full.diagnosticsJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `fault-${full.report.referenceCode}-diagnostics.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const dirty = hasDraftChanges(detail, statusDraft, severityDraft, notesDraft);

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
          {STATUSES.map((status) => (
            <MenuItem key={status} value={status}>
              {status}
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
            <Typography color="text.secondary">No reports here. That means no open faults match this filter.</Typography>
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 48 }} />
                <TableCell>Reference</TableCell>
                <TableCell>Original report</TableCell>
                <TableCell>Severity</TableCell>
                <TableCell>Where</TableCell>
                <TableCell>Who</TableCell>
                <TableCell>Platform</TableCell>
                <TableCell>When</TableCell>
                <TableCell>Last updated</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const expanded = expandedIds.includes(row.id);
                const cached = detailCache[row.id];

                return (
                  <Fragment key={row.id}>
                    <TableRow hover sx={{ cursor: "pointer" }} onClick={() => void openDetail(row.id)}>
                      <TableCell>
                        <IconButton
                          size="small"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleExpanded(row.id);
                          }}
                        >
                          {expanded ? <KeyboardArrowUpOutlined /> : <KeyboardArrowDownOutlined />}
                        </IconButton>
                      </TableCell>
                      <TableCell sx={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>
                        {row.referenceCode}
                      </TableCell>
                      <TableCell sx={{ maxWidth: 360 }}>
                        <Typography variant="body2" noWrap title={formatOriginalReport(row)}>
                          {formatOriginalReport(row)}
                        </Typography>
                        <Stack direction="row" spacing={0.75} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                          {row.kind !== "user-report" && (
                            <Chip size="small" variant="outlined" label={`Automatic: ${row.kind}`} />
                          )}
                          {row.title !== formatOriginalReport(row) && (
                            <Typography variant="caption" color="text.secondary" noWrap title={row.title}>
                              {row.title}
                            </Typography>
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={row.severity} color={SEVERITY_COLOR[row.severity] ?? "default"} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">{row.routePath ?? "—"}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">{row.userEmail ?? "—"}</Typography>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                          <Chip size="small" variant="outlined" label={row.platform} />
                          {row.wasOffline && <Chip size="small" color="info" label="offline" />}
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        <Typography variant="caption">{formatWhen(row.occurredAtUtc)}</Typography>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        <Typography variant="caption">{formatWhen(row.lastUpdatedAtUtc)}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={row.status}
                          color={statusColor(row.status)}
                          variant={row.status === "New" ? "filled" : "outlined"}
                        />
                      </TableCell>
                    </TableRow>

                    <TableRow>
                      <TableCell sx={{ p: 0, borderBottom: expanded ? undefined : 0 }} colSpan={10}>
                        <Collapse in={expanded} timeout="auto" unmountOnExit>
                          <Box sx={{ p: 2.5, bgcolor: "background.default" }}>
                            {!cached ? (
                              <Stack direction="row" spacing={1} alignItems="center">
                                <CircularProgress size={18} />
                                <Typography variant="body2" color="text.secondary">
                                  Loading history...
                                </Typography>
                              </Stack>
                            ) : (
                              <Stack spacing={2}>
                                <Typography variant="subtitle2">Report journey</Typography>
                                <FaultReportJourney
                                  report={cached.report}
                                  history={cached.history}
                                  onAddEvent={() => void openDetail(row.id)}
                                />
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                  <Button
                                    size="small"
                                    startIcon={<OpenInNewOutlined />}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void openDetail(row.id);
                                    }}
                                  >
                                    Open
                                  </Button>
                                  {cached.diagnosticsJson && (
                                    <Button
                                      size="small"
                                      startIcon={<DownloadOutlined />}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        downloadDiagnostics(cached);
                                      }}
                                    >
                                      Diagnostics JSON
                                    </Button>
                                  )}
                                </Stack>
                              </Stack>
                            )}
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Dialog open={Boolean(detail) || detailLoading} onClose={closeDetail} maxWidth="md" fullWidth>
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
                <Chip size="small" label={detail.report.severity} color={SEVERITY_COLOR[detail.report.severity] ?? "default"} />
                <Chip size="small" label={detail.report.status} color={statusColor(detail.report.status)} variant="outlined" />
                <Chip size="small" variant="outlined" label={detail.report.kind} />
              </Stack>
            </DialogTitle>
            <DialogContent dividers>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="subtitle2">Original report</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 0.5 }}>
                    {formatOriginalReport(detail.report)}
                  </Typography>
                  {detail.report.description && detail.report.title !== detail.report.description && (
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.75 }}>
                      System title: {detail.report.title}
                    </Typography>
                  )}
                </Box>

                <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
                  <MiniDetail label="Severity" value={detail.report.severity} />
                  <MiniDetail label="Where" value={detail.report.routePath ?? "—"} />
                  <MiniDetail label="Who" value={detail.report.userEmail ?? "—"} />
                  <MiniDetail label="Platform" value={detail.report.platform} />
                  <MiniDetail label="When" value={formatWhen(detail.report.occurredAtUtc)} />
                  <MiniDetail label="Last updated" value={formatWhen(detail.report.lastUpdatedAtUtc)} />
                  <MiniDetail label="Status" value={detail.report.status} />
                </Stack>

                {detail.report.errorMessage && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Automatic error capture
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
                    value={statusDraft}
                    onChange={(event) => setStatusDraft(event.target.value)}
                    sx={{ minWidth: 170 }}
                  >
                    {STATUSES.map((status) => (
                      <MenuItem key={status} value={status}>
                        {status}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    size="small"
                    label="Severity"
                    value={severityDraft}
                    onChange={(event) => setSeverityDraft(event.target.value)}
                    sx={{ minWidth: 120 }}
                  >
                    {SEVERITIES.map((severity) => (
                      <MenuItem key={severity} value={severity}>
                        {severity}
                      </MenuItem>
                    ))}
                  </TextField>
                  {detail.diagnosticsJson && (
                    <Button startIcon={<DownloadOutlined />} onClick={() => downloadDiagnostics(detail)}>
                      Diagnostics JSON
                    </Button>
                  )}
                </Stack>

                <TextField
                  label="Admin notes"
                  value={notesDraft}
                  onChange={(event) => setNotesDraft(event.target.value)}
                  fullWidth
                  multiline
                  minRows={3}
                />

                {saveError && <Alert severity="error">{saveError}</Alert>}

                <Divider />

                <FaultReportJourney
                  report={detail.report}
                  history={detail.history}
                  onAddEvent={() => {}}
                  hideAddEvent
                />

                <Divider />

                <Stack spacing={1}>
                  <Typography variant="subtitle2">Add event</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Save a new case event when you update the status or add findings/comments.
                  </Typography>
                </Stack>
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={closeDetail} disabled={saving}>Cancel</Button>
              <Button onClick={() => void saveAndClose()} disabled={!dirty || saving} variant="contained">
                {saving ? "Saving…" : "Save & Close"}
              </Button>
            </DialogActions>
          </>
        ) : null}
      </Dialog>
    </Box>
  );
}

function MiniDetail({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Box>
  );
}

function FaultReportJourney({
  report,
  history,
  onAddEvent,
  hideAddEvent = false,
}: {
  report: FaultReportRow;
  history: FaultReportHistoryRow[];
  onAddEvent: () => void;
  hideAddEvent?: boolean;
}) {
  const orderedHistory = historyAscending(history);

  if (orderedHistory.length === 0) {
    return (
      <Stack spacing={1.5}>
        <Typography variant="body2" color="text.secondary">
          No saved history yet.
        </Typography>
        {!hideAddEvent && <AddEventCard onClick={onAddEvent} />}
      </Stack>
    );
  }

  return (
    <Stack spacing={1.5}>
      <OriginalReportCard report={report} />
      {orderedHistory.map((entry, index) => (
        <HistoryEventCard key={entry.id} entry={entry} index={index} />
      ))}
      {!hideAddEvent && <AddEventCard onClick={onAddEvent} />}
    </Stack>
  );
}

function OriginalReportCard({ report }: { report: FaultReportRow }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderRadius: 2,
        borderColor: alpha("#2dd4bf", 0.35),
        background: "linear-gradient(180deg, rgba(45,212,191,0.08) 0%, rgba(15,23,42,0.04) 100%)",
      }}
    >
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="subtitle2" sx={{ fontFamily: "monospace" }}>
            {report.referenceCode}
          </Typography>
          <Chip size="small" label={report.severity} color={SEVERITY_COLOR[report.severity] ?? "default"} />
          <Chip size="small" label={report.status} color={statusColor(report.status)} variant="outlined" />
          <Chip size="small" variant="outlined" label="Original report" />
        </Stack>

        <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
          {formatOriginalReport(report)}
        </Typography>

        <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
          <MiniDetail label="Where" value={report.routePath ?? "—"} />
          <MiniDetail label="Who" value={report.userEmail ?? "—"} />
          <MiniDetail label="Platform" value={report.platform} />
          <MiniDetail label="When" value={formatWhen(report.occurredAtUtc)} />
          <MiniDetail label="Last updated" value={formatWhen(report.lastUpdatedAtUtc)} />
        </Stack>
      </Stack>
    </Paper>
  );
}

function HistoryEventCard({ entry, index }: { entry: FaultReportHistoryRow; index: number }) {
  const tone = historyCardTone(entry.newStatus);
  const findings = historyFindings(entry);

  return (
    <Box
      sx={{
        ml: { xs: Math.min(index + 1, 4) * 1.25, md: Math.min(index + 1, 6) * 2.5 },
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          p: 1.5,
          borderRadius: 2,
          borderLeft: `4px solid ${tone.border}`,
          borderColor: alpha(tone.border, 0.35),
          bgcolor: tone.bg,
        }}
      >
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Chip size="small" variant="outlined" label={entry.eventType} />
            <Chip size="small" label={entry.newStatus} color={statusColor(entry.newStatus)} variant="outlined" />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {historyStatusSummary(entry)}
            </Typography>
          </Stack>

          <Typography variant="caption" color="text.secondary">
            {formatWhen(entry.createdAtUtc)} by {historyActor(entry)}
          </Typography>

          {entry.previousSeverity && entry.previousSeverity !== entry.newSeverity && (
            <Typography variant="caption" color="text.secondary">
              Severity: {entry.previousSeverity} → {entry.newSeverity}
            </Typography>
          )}

          <Box>
            <Typography variant="caption" color="text.secondary" display="block">
              Comments / actions
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
              {findings ?? "No extra notes recorded for this event."}
            </Typography>
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}

function AddEventCard({ onClick }: { onClick: () => void }) {
  return (
    <Box sx={{ ml: { xs: 1.25, md: 2.5 } }}>
      <Paper
        variant="outlined"
        sx={{
          p: 1.5,
          borderStyle: "dashed",
          borderRadius: 2,
          borderColor: alpha("#2dd4bf", 0.35),
          bgcolor: alpha("#2dd4bf", 0.04),
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
          <Stack spacing={0.25}>
            <Typography variant="subtitle2">Add event</Typography>
            <Typography variant="body2" color="text.secondary">
              Record the next status update or findings/comments for this report.
            </Typography>
          </Stack>
          <Button size="small" variant="outlined" startIcon={<AddOutlined />} onClick={onClick}>
            Add event
          </Button>
        </Stack>
      </Paper>
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
        {entries.slice(-15).map((entry, index) => (
          <Typography key={`${entry.ts}-${index}`} variant="caption" sx={{ fontFamily: "monospace" }}>
            {entry.type === "route" ? "→" : "•"} {entry.label}
          </Typography>
        ))}
      </Stack>
    </Box>
  );
}
