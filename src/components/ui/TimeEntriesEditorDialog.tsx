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

interface Props {
  open: boolean;
  run: AssetWorkflowRun;
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

function fmtDatetime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

/** Convert UTC ISO string → value for <input type="datetime-local"> (local time) */
function toDatetimeLocal(utcIso: string | null | undefined): string {
  if (!utcIso) return "";
  const d = new Date(utcIso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convert datetime-local string (local time) → UTC ISO string */
function fromDatetimeLocal(localStr: string): string {
  return new Date(localStr).toISOString();
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function TimeEntriesEditorDialog({ open, run, readOnly = false, onClose, onSaved }: Props) {
  const [entries, setEntries] = useState<RunTimeEntry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null); // null = add-new mode when formOpen
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEntries(parseEntries(run.timeTrackingJson));
      setFormOpen(false);
      setEditingId(null);
      setError(null);
      setFormError(null);
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
    setEditingId(null);
    setForm({ ...BLANK_FORM, startStr: toDatetimeLocal(new Date().toISOString()) });
    setFormError(null);
    setFormOpen(true);
  }

  function openEditForm(entry: RunTimeEntry) {
    setEditingId(entry.id);
    setForm({
      category: entry.category,
      reason: entry.reason ?? "",
      startStr: toDatetimeLocal(entry.startedAtUtc),
      endStr: toDatetimeLocal(entry.endedAtUtc ?? null),
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
    const startIso = fromDatetimeLocal(form.startStr);
    const endIso = form.endStr ? fromDatetimeLocal(form.endStr) : null;
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
        id: crypto.randomUUID(),
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
            </Typography>
          </Box>
          {!readOnly && (
            <Button size="small" variant="outlined" startIcon={<AddOutlined />} onClick={openAddForm}>
              Add Entry
            </Button>
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

        {/* Entries table */}
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
                      <Typography variant="body2">{fmtDatetime(entry.startedAtUtc)}</Typography>
                    </TableCell>
                    <TableCell>
                      {isOpen ? (
                        <Chip size="small" label="Open" color="warning" variant="outlined" sx={{ fontSize: "0.7rem" }} />
                      ) : (
                        <Typography variant="body2">{fmtDatetime(entry.endedAtUtc!)}</Typography>
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
    </Dialog>
  );
}
