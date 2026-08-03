import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AddOutlined,
  DeleteOutlined,
  EditOutlined,
  SaveOutlined,
  CloseOutlined,
  WarningAmberOutlined,
} from "@mui/icons-material";
import type { AssetWorkflowRun, RunTimeEntry } from "../../types/assetWorkflowRun";
import { assetWorkflowRunService } from "../../services/assetWorkflowRunService";
import { randomId } from "../../utils/randomId";
import {
  datetimeLocalInZoneToUtc,
  formatInstant,
  utcToDatetimeLocalInZone,
  zoneAbbreviation,
} from "../../utils/datetime";
import { useProjectTimeZone } from "../../hooks/useProjectTimeZone";
import TimeEntriesTimelineEditor from "./TimeEntriesTimelineEditor";

interface Props {
  open: boolean;
  run: AssetWorkflowRun;
  /** Project id — used to resolve site timezone when timeZoneId is not passed. */
  projectId?: string | null;
  /** IANA project site zone for wall-clock display/editing. */
  timeZoneId?: string | null;
  /** If true, no edits allowed — only view. */
  readOnly?: boolean;
  onClose: () => void;
  onSaved: (updated: AssetWorkflowRun) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDuration(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtDatetime(iso: string, timeZoneId?: string | null): string {
  return formatInstant(iso, timeZoneId, { withZone: true });
}

/** Convert UTC ISO string → value for <input type="datetime-local"> in project zone. */
function toDatetimeLocal(utcIso: string | null | undefined, timeZoneId?: string | null): string {
  return utcToDatetimeLocalInZone(utcIso, timeZoneId);
}

/** Convert datetime-local string (project wall clock) → UTC ISO string. */
function fromDatetimeLocal(localStr: string, timeZoneId?: string | null): string {
  return datetimeLocalInZoneToUtc(localStr, timeZoneId);
}

function entryDurationSeconds(entry: RunTimeEntry, nowIso: string): number {
  const end = entry.endedAtUtc ?? nowIso;
  return Math.max(0, Math.floor((new Date(end).getTime() - new Date(entry.startedAtUtc).getTime()) / 1000));
}

function parseEntries(json: string): RunTimeEntry[] {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>[];
    if (!Array.isArray(raw)) return [];
    return raw.map((e) => ({
      id: String(e.id ?? e.Id ?? ""),
      category: String(e.category ?? e.Category ?? "productive") as "productive" | "downtime",
      startedAtUtc: String(e.startedAtUtc ?? e.StartedAtUtc ?? ""),
      endedAtUtc: (e.endedAtUtc ?? e.EndedAtUtc ?? null) as string | null,
      reason: (e.reason ?? e.Reason ?? null) as string | null,
    }));
  } catch { return []; }
}

function computeTotals(entries: RunTimeEntry[], nowIso: string) {
  let productive = 0;
  let downtime = 0;
  let downtimeEvents = 0;
  for (const e of entries) {
    const secs = entryDurationSeconds(e, nowIso);
    if (e.category === "productive") productive += secs;
    else { downtime += secs; downtimeEvents++; }
  }
  return { productive, downtime, downtimeEvents };
}

/** Returns IDs of entries that overlap with any other entry. */
function findOverlappingIds(entries: RunTimeEntry[], nowIso: string): Set<string> {
  const overlapping = new Set<string>();
  for (let i = 0; i < entries.length; i++) {
    const a = entries[i];
    const aStart = new Date(a.startedAtUtc).getTime();
    const aEnd = new Date(a.endedAtUtc ?? nowIso).getTime();
    for (let j = i + 1; j < entries.length; j++) {
      const b = entries[j];
      const bStart = new Date(b.startedAtUtc).getTime();
      const bEnd = new Date(b.endedAtUtc ?? nowIso).getTime();
      if (aStart < bEnd && aEnd > bStart) {
        overlapping.add(a.id);
        overlapping.add(b.id);
      }
    }
  }
  return overlapping;
}

const BLANK_FORM = {
  category: "productive" as "productive" | "downtime",
  reason: "",
  startStr: "",
  endStr: "",
};

const DURATION_PRESETS = [
  { label: "30m", minutes: 30 },
  { label: "1h", minutes: 60 },
  { label: "1.5h", minutes: 90 },
  { label: "2h", minutes: 120 },
  { label: "3h", minutes: 180 },
  { label: "4h", minutes: 240 },
  { label: "6h", minutes: 360 },
  { label: "8h", minutes: 480 },
  { label: "12h", minutes: 720 },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export default function TimeEntriesEditorDialog({
  open,
  run,
  projectId,
  timeZoneId: timeZoneIdProp,
  readOnly = false,
  onClose,
  onSaved,
}: Props) {
  const fetchedTimeZone = useProjectTimeZone(projectId ?? undefined);
  const timeZoneId = timeZoneIdProp ?? fetchedTimeZone;
  const [entries, setEntries] = useState<RunTimeEntry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null); // null = add-new mode when formOpen
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"timeline" | "table">("timeline");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addCategory, setAddCategory] = useState<"productive" | "downtime">("productive");
  const [addDurationMin, setAddDurationMin] = useState(60);
  const [addReason, setAddReason] = useState("");

  useEffect(() => {
    if (open) {
      setEntries(parseEntries(run.timeTrackingJson));
      setFormOpen(false);
      setEditingId(null);
      setError(null);
      setFormError(null);
      setViewMode("timeline");
    }
  }, [open, run.timeTrackingJson]);

  const nowIso = useMemo(() => new Date().toISOString(), []);
  const totals = useMemo(() => computeTotals(entries, nowIso), [entries, nowIso]);
  const overlappingIds = useMemo(() => findOverlappingIds(entries, nowIso), [entries, nowIso]);
  const openEntries = entries.filter((e) => !e.endedAtUtc);

  // Sort by start time ascending for display
  const sortedEntries = [...entries].sort(
    (a, b) => new Date(a.startedAtUtc).getTime() - new Date(b.startedAtUtc).getTime()
  );

  function openAddForm() {
    setAddCategory("productive");
    setAddDurationMin(60);
    setAddReason("");
    setAddDialogOpen(true);
  }

  function appendDurationEntry() {
    const sorted = [...entries].sort(
      (a, b) => new Date(a.startedAtUtc).getTime() - new Date(b.startedAtUtc).getTime(),
    );
    const lastEndMs = sorted.reduce((max, e) => {
      const end = e.endedAtUtc ? new Date(e.endedAtUtc).getTime() : new Date(nowIso).getTime();
      return Math.max(max, end);
    }, sorted.length ? new Date(sorted[0].startedAtUtc).getTime() : Date.now());
    const startMs = sorted.length ? lastEndMs : Date.now();
    const endMs = startMs + addDurationMin * 60_000;
    const newEntry: RunTimeEntry = {
      id: randomId(),
      category: addCategory,
      reason: addReason.trim() || (addCategory === "downtime" ? "Downtime" : "Productive"),
      startedAtUtc: new Date(startMs).toISOString(),
      endedAtUtc: new Date(endMs).toISOString(),
    };
    setEntries((prev) => [...prev, newEntry]);
    setAddDialogOpen(false);
    setViewMode("timeline");
  }

  function openEditForm(entry: RunTimeEntry) {
    setEditingId(entry.id);
    setForm({
      category: entry.category,
      reason: entry.reason ?? "",
      startStr: toDatetimeLocal(entry.startedAtUtc, timeZoneId),
      endStr: toDatetimeLocal(entry.endedAtUtc ?? null, timeZoneId),
    });
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setFormError(null);
  }

  function handleFormSave() {
    if (!form.startStr) { setFormError("Start time is required."); return; }
    const startIso = fromDatetimeLocal(form.startStr, timeZoneId);
    const endIso = form.endStr ? fromDatetimeLocal(form.endStr, timeZoneId) : null;
    if (endIso && new Date(endIso) <= new Date(startIso)) {
      setFormError("End time must be after start time.");
      return;
    }

    if (editingId) {
      setEntries((prev) =>
        prev.map((e) =>
          e.id === editingId
            ? { ...e, category: form.category, reason: form.reason || null, startedAtUtc: startIso, endedAtUtc: endIso }
            : e
        )
      );
    } else {
      const newEntry: RunTimeEntry = {
        id: randomId(),
        category: form.category,
        reason: form.reason || null,
        startedAtUtc: startIso,
        endedAtUtc: endIso,
      };
      setEntries((prev) => [...prev, newEntry]);
    }
    closeForm();
  }

  function handleDelete(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    if (editingId === id) closeForm();
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await assetWorkflowRunService.patchTimeEntries(run.id, JSON.stringify(entries));
      onSaved(updated);
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        className: "glass-card",
        sx: { background: "var(--panel)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 3 },
      }}
    >
      <DialogTitle>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h6" fontWeight={700}>
              Time Entries — Run #{run.runNumber}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {readOnly ? "View only — run is locked" : "Add, edit or remove time entries to correct tracking."}
              {timeZoneId
                ? ` Times shown in ${zoneAbbreviation(timeZoneId)} (${timeZoneId}).`
                : " Warning: project timezone not loaded — times may show as UTC."}
            </Typography>
          </Box>
          {!readOnly ? (
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant={viewMode === "timeline" ? "contained" : "outlined"}
                onClick={() => setViewMode("timeline")}
              >
                Timeline
              </Button>
              <Button
                size="small"
                variant={viewMode === "table" ? "contained" : "outlined"}
                onClick={() => setViewMode("table")}
              >
                Table
              </Button>
              <Button size="small" variant="outlined" startIcon={<AddOutlined />} onClick={openAddForm}>
                Add Entry
              </Button>
            </Stack>
          ) : (
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant={viewMode === "timeline" ? "contained" : "outlined"}
                onClick={() => setViewMode("timeline")}
              >
                Timeline
              </Button>
              <Button
                size="small"
                variant={viewMode === "table" ? "contained" : "outlined"}
                onClick={() => setViewMode("table")}
              >
                Table
              </Button>
            </Stack>
          )}
        </Stack>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        {/* Warnings */}
        {(openEntries.length > 0 || overlappingIds.size > 0) && (
          <Box sx={{ px: 2.5, pt: 2, display: "flex", flexDirection: "column", gap: 1 }}>
            {openEntries.length > 0 && (
              <Alert severity="warning" icon={<WarningAmberOutlined />} sx={{ fontSize: "0.78rem" }}>
                {openEntries.length} entry{openEntries.length > 1 ? " entries are" : " is"} still open (no end time). Set an end time or they will count until now.
              </Alert>
            )}
            {overlappingIds.size > 0 && (
              <Alert severity="warning" icon={<WarningAmberOutlined />} sx={{ fontSize: "0.78rem" }}>
                Some entries overlap in time — totals may be overstated. Review highlighted rows.
              </Alert>
            )}
          </Box>
        )}

        {/* Add / Edit form */}
        {formOpen && !readOnly && (
          <Box sx={{ px: 2.5, pt: 2, pb: 1 }}>
            <Typography variant="caption" fontWeight={700} sx={{ textTransform: "uppercase", letterSpacing: 0.8, color: "text.secondary" }}>
              {editingId ? "Edit Entry" : "Add Manual Entry"}
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel shrink>Category</InputLabel>
                <Select
                  label="Category"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as "productive" | "downtime" }))}
                >
                  <MenuItem value="productive">Productive</MenuItem>
                  <MenuItem value="downtime">Downtime</MenuItem>
                </Select>
              </FormControl>
              <TextField
                size="small"
                label="Reason / note"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder={form.category === "downtime" ? "Waiting for parts..." : ""}
                InputLabelProps={{ shrink: true }}
                sx={{ flex: 1, minWidth: 180 }}
              />
              <TextField
                size="small"
                label="Start"
                type="datetime-local"
                value={form.startStr}
                onChange={(e) => setForm((f) => ({ ...f, startStr: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 200 }}
              />
              <TextField
                size="small"
                label="End (leave blank = still open)"
                type="datetime-local"
                value={form.endStr}
                onChange={(e) => setForm((f) => ({ ...f, endStr: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 200 }}
              />
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Button size="small" variant="contained" startIcon={<SaveOutlined />} onClick={handleFormSave}>
                  {editingId ? "Update" : "Add"}
                </Button>
                <IconButton size="small" onClick={closeForm}>
                  <CloseOutlined fontSize="small" />
                </IconButton>
              </Stack>
            </Stack>
            {formError && (
              <Typography variant="caption" color="error" sx={{ mt: 0.5, display: "block" }}>
                {formError}
              </Typography>
            )}
            <Divider sx={{ mt: 2 }} />
          </Box>
        )}

        {/* Interactive timeline editor */}
        {viewMode === "timeline" && (
          <>
            <TimeEntriesTimelineEditor
              entries={entries}
              timeZoneId={timeZoneId}
              nowIso={nowIso}
              readOnly={readOnly}
              onChange={setEntries}
            />
            <Divider />
          </>
        )}

        {/* Entries table */}
        {viewMode === "table" && (
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Category</TableCell>
                <TableCell>Reason</TableCell>
                <TableCell>Start</TableCell>
                <TableCell>End</TableCell>
                <TableCell align="right">Duration</TableCell>
                {!readOnly && <TableCell align="right">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedEntries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={readOnly ? 5 : 6}>
                    <Typography variant="body2" color="text.disabled" sx={{ fontStyle: "italic", py: 1 }}>
                      No time entries recorded.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {sortedEntries.map((entry) => {
                const isOverlap = overlappingIds.has(entry.id);
                const isOpen = !entry.endedAtUtc;
                const durationSecs = entryDurationSeconds(entry, nowIso);
                return (
                  <TableRow
                    key={entry.id}
                    selected={editingId === entry.id}
                    sx={isOverlap ? { bgcolor: "rgba(255,152,0,0.06)" } : undefined}
                  >
                    <TableCell>
                      <Chip
                        size="small"
                        label={entry.category === "productive" ? "Productive" : "Downtime"}
                        color={entry.category === "productive" ? "success" : "warning"}
                        variant="outlined"
                      />
                      {isOverlap && (
                        <Tooltip title="Overlaps with another entry">
                          <WarningAmberOutlined sx={{ fontSize: "0.9rem", color: "warning.main", ml: 0.5, verticalAlign: "middle" }} />
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color={entry.reason ? undefined : "text.disabled"}>
                        {entry.reason ?? "—"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{fmtDatetime(entry.startedAtUtc, timeZoneId)}</Typography>
                    </TableCell>
                    <TableCell>
                      {isOpen ? (
                        <Chip size="small" label="Open" color="warning" variant="outlined" sx={{ fontSize: "0.7rem" }} />
                      ) : (
                        <Typography variant="body2">{fmtDatetime(entry.endedAtUtc!, timeZoneId)}</Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontFamily="monospace">
                        {fmtDuration(durationSecs)}
                      </Typography>
                    </TableCell>
                    {!readOnly && (
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.25} justifyContent="flex-end">
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => openEditForm(entry)}>
                              <EditOutlined fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" onClick={() => handleDelete(entry.id)}>
                              <DeleteOutlined fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
        )}

        {/* Totals summary */}
        <Box sx={{ px: 2.5, py: 1.5, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
              Recalculated totals:
            </Typography>
            <Chip size="small" color="success" variant="outlined" label={`Productive: ${fmtDuration(totals.productive)}`} />
            <Chip size="small" color="warning" variant="outlined" label={`Downtime: ${fmtDuration(totals.downtime)}`} />
            <Chip size="small" variant="outlined" label={`${totals.downtimeEvents} downtime event${totals.downtimeEvents !== 1 ? "s" : ""}`} />
          </Stack>
        </Box>

        {error && (
          <Box sx={{ px: 2.5, pb: 1.5 }}>
            <Alert severity="error">{error}</Alert>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2.5, py: 1.5 }}>
        <Button onClick={onClose}>Cancel</Button>
        {!readOnly && (
          <Button variant="contained" disabled={saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        )}
      </DialogActions>

      {/* Quick add: category + duration preset, appended after last segment */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add time segment</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl size="small" fullWidth>
              <InputLabel shrink>Category</InputLabel>
              <Select
                label="Category"
                value={addCategory}
                onChange={(e) => setAddCategory(e.target.value as "productive" | "downtime")}
              >
                <MenuItem value="productive">Productive</MenuItem>
                <MenuItem value="downtime">Downtime</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="Reason / note (optional)"
              value={addReason}
              onChange={(e) => setAddReason(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: "block", mb: 1 }}>
                Duration — placed after the last recorded segment
              </Typography>
              <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.75}>
                {DURATION_PRESETS.map((p) => (
                  <Chip
                    key={p.minutes}
                    label={p.label}
                    clickable
                    color={addDurationMin === p.minutes ? "primary" : "default"}
                    variant={addDurationMin === p.minutes ? "filled" : "outlined"}
                    onClick={() => setAddDurationMin(p.minutes)}
                    sx={{ fontWeight: addDurationMin === p.minutes ? 700 : 400 }}
                  />
                ))}
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" startIcon={<AddOutlined />} onClick={appendDurationEntry}>
            Add to timeline
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
