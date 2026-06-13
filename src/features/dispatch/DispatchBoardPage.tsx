import React, { useCallback, useEffect, useState } from "react";
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
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import {
  AddOutlined,
  DeleteOutlined,
  EditOutlined,
  LocalShippingOutlined,
  RefreshOutlined
} from "@mui/icons-material";
import { usePermissions } from "../../hooks/usePermissions";
import { dispatchService } from "../../services/dispatchService";
import type {
  AddDeliveryEventRequest,
  DeliveryEventType,
  DispatchOrder,
  DispatchStatus,
  UpsertDispatchLineRequest,
  UpsertDispatchOrderRequest
} from "../../types/dispatch";

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_ORDER: DispatchStatus[] = ["Draft", "Confirmed", "Packed", "Shipped", "Delivered", "Cancelled"];

const STATUS_COLOR: Record<DispatchStatus, "default" | "warning" | "info" | "primary" | "success" | "error"> = {
  Draft: "default",
  Confirmed: "warning",
  Packed: "info",
  Shipped: "primary",
  Delivered: "success",
  Cancelled: "error"
};

function StatusChip({ status }: { status: DispatchStatus }) {
  return <Chip label={status} color={STATUS_COLOR[status]} size="small" />;
}

// ── Order form dialog ─────────────────────────────────────────────────────────

function OrderFormDialog({
  open,
  initial,
  onClose,
  onSaved
}: {
  open: boolean;
  initial?: DispatchOrder;
  onClose: () => void;
  onSaved: (o: DispatchOrder) => void;
}) {
  const [projectId, setProjectId] = useState(initial?.projectId ?? "");
  const [recipientName, setRecipientName] = useState(initial?.recipientName ?? "");
  const [recipientAddress, setRecipientAddress] = useState(initial?.recipientAddress ?? "");
  const [reference, setReference] = useState(initial?.reference ?? "");
  const [carrier, setCarrier] = useState(initial?.carrier ?? "");
  const [trackingNumber, setTrackingNumber] = useState(initial?.trackingNumber ?? "");
  const [expectedDate, setExpectedDate] = useState(
    initial?.expectedDeliveryDate ? initial.expectedDeliveryDate.substring(0, 10) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setProjectId(initial?.projectId ?? "");
      setRecipientName(initial?.recipientName ?? "");
      setRecipientAddress(initial?.recipientAddress ?? "");
      setReference(initial?.reference ?? "");
      setCarrier(initial?.carrier ?? "");
      setTrackingNumber(initial?.trackingNumber ?? "");
      setExpectedDate(initial?.expectedDeliveryDate ? initial.expectedDeliveryDate.substring(0, 10) : "");
      setError(null);
    }
  }, [open, initial]);

  const handleSave = async () => {
    if (!projectId.trim()) { setError("Project ID is required."); return; }
    setSaving(true);
    setError(null);
    try {
      const payload: UpsertDispatchOrderRequest = {
        projectId: projectId.trim(),
        recipientName: recipientName.trim() || undefined,
        recipientAddress: recipientAddress.trim() || undefined,
        reference: reference.trim() || undefined,
        carrier: carrier.trim() || undefined,
        trackingNumber: trackingNumber.trim() || undefined,
        expectedDeliveryDate: expectedDate || undefined
      };
      const saved = initial
        ? await dispatchService.update(initial.id, payload)
        : await dispatchService.create(payload);
      onSaved(saved);
    } catch {
      setError("Failed to save dispatch order.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{initial ? "Edit Dispatch Order" : "New Dispatch Order"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Project ID *" value={projectId} onChange={e => setProjectId(e.target.value)} size="small" fullWidth />
          <TextField label="Recipient name" value={recipientName} onChange={e => setRecipientName(e.target.value)} size="small" fullWidth />
          <TextField label="Delivery address" value={recipientAddress} onChange={e => setRecipientAddress(e.target.value)} size="small" fullWidth multiline minRows={2} />
          <Stack direction="row" spacing={1}>
            <TextField label="Reference / PO#" value={reference} onChange={e => setReference(e.target.value)} size="small" fullWidth />
            <TextField label="Carrier" value={carrier} onChange={e => setCarrier(e.target.value)} size="small" fullWidth />
          </Stack>
          <Stack direction="row" spacing={1}>
            <TextField label="Tracking number" value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} size="small" fullWidth />
            <TextField label="Expected delivery" type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} size="small" fullWidth InputLabelProps={{ shrink: true }} />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? <CircularProgress size={18} /> : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Order detail dialog ───────────────────────────────────────────────────────

function OrderDetailDialog({
  open,
  order,
  canEdit,
  onClose,
  onUpdated
}: {
  open: boolean;
  order: DispatchOrder | null;
  canEdit: boolean;
  onClose: () => void;
  onUpdated: (o: DispatchOrder) => void;
}) {
  const [tab, setTab] = useState(0);
  const [detail, setDetail] = useState<DispatchOrder | null>(order);
  const [loading, setLoading] = useState(false);

  // Line form
  const [lineDesc, setLineDesc] = useState("");
  const [linePart, setLinePart] = useState("");
  const [lineQty, setLineQty] = useState("1");
  const [lineUnit, setLineUnit] = useState("");
  const [lineNotes, setLineNotes] = useState("");
  const [lineError, setLineError] = useState<string | null>(null);
  const [savingLine, setSavingLine] = useState(false);

  // Event form
  const [evtType, setEvtType] = useState<DeliveryEventType>("Confirmed");
  const [evtLocation, setEvtLocation] = useState("");
  const [evtNotes, setEvtNotes] = useState("");
  const [evtError, setEvtError] = useState<string | null>(null);
  const [savingEvt, setSavingEvt] = useState(false);

  useEffect(() => {
    if (open && order) {
      setDetail(order);
      setTab(0);
      setLineDesc(""); setLinePart(""); setLineQty("1"); setLineUnit(""); setLineNotes(""); setLineError(null);
      setEvtType("Confirmed"); setEvtLocation(""); setEvtNotes(""); setEvtError(null);
    }
  }, [open, order]);

  const refresh = useCallback(async () => {
    if (!detail) return;
    setLoading(true);
    try {
      const fresh = await dispatchService.get(detail.id);
      setDetail(fresh);
      onUpdated(fresh);
    } finally {
      setLoading(false);
    }
  }, [detail, onUpdated]);

  const handleAddLine = async () => {
    if (!detail || !lineDesc.trim()) { setLineError("Description is required."); return; }
    setSavingLine(true); setLineError(null);
    try {
      const payload: UpsertDispatchLineRequest = {
        description: lineDesc.trim(),
        partNumber: linePart.trim() || undefined,
        quantity: parseFloat(lineQty) || 1,
        unit: lineUnit.trim() || undefined,
        notes: lineNotes.trim() || undefined
      };
      await dispatchService.addLine(detail.id, payload);
      setLineDesc(""); setLinePart(""); setLineQty("1"); setLineUnit(""); setLineNotes("");
      await refresh();
    } catch {
      setLineError("Failed to add line.");
    } finally {
      setSavingLine(false);
    }
  };

  const handleRemoveLine = async (lineId: string) => {
    if (!detail) return;
    await dispatchService.removeLine(detail.id, lineId);
    await refresh();
  };

  const handleAddEvent = async () => {
    if (!detail) return;
    setSavingEvt(true); setEvtError(null);
    try {
      const payload: AddDeliveryEventRequest = {
        eventType: evtType,
        location: evtLocation.trim() || undefined,
        notes: evtNotes.trim() || undefined
      };
      await dispatchService.addEvent(detail.id, payload);
      setEvtLocation(""); setEvtNotes("");
      await refresh();
    } catch {
      setEvtError("Failed to record event.");
    } finally {
      setSavingEvt(false);
    }
  };

  if (!detail) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <LocalShippingOutlined />
          <Typography fontWeight={700} sx={{ flex: 1 }}>
            Dispatch Order {detail.reference ? `— ${detail.reference}` : ""}
          </Typography>
          <StatusChip status={detail.status} />
          <IconButton size="small" onClick={refresh} disabled={loading}>
            <RefreshOutlined fontSize="small" />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        {/* Summary bar */}
        <Box sx={{ px: 3, py: 1.5, bgcolor: "grey.50", borderBottom: "1px solid", borderColor: "divider" }}>
          <Stack direction="row" spacing={3} flexWrap="wrap">
            {detail.recipientName && <Typography variant="body2"><b>To:</b> {detail.recipientName}</Typography>}
            {detail.carrier && <Typography variant="body2"><b>Carrier:</b> {detail.carrier}</Typography>}
            {detail.trackingNumber && <Typography variant="body2"><b>Tracking:</b> {detail.trackingNumber}</Typography>}
            {detail.expectedDeliveryDate && (
              <Typography variant="body2">
                <b>Expected:</b> {new Date(detail.expectedDeliveryDate).toLocaleDateString()}
              </Typography>
            )}
          </Stack>
        </Box>

        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ px: 2, borderBottom: "1px solid", borderColor: "divider" }}>
          <Tab label={`Items (${detail.lines.length})`} />
          <Tab label={`History (${detail.events.length})`} />
        </Tabs>

        {/* Items tab */}
        {tab === 0 && (
          <Box sx={{ p: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Part #</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="right">Qty</TableCell>
                  <TableCell>Unit</TableCell>
                  <TableCell>Notes</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {detail.lines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Typography variant="body2" color="text.secondary">No items yet</Typography>
                    </TableCell>
                  </TableRow>
                )}
                {detail.lines.map(line => (
                  <TableRow key={line.id}>
                    <TableCell>{line.partNumber ?? "—"}</TableCell>
                    <TableCell>{line.description}</TableCell>
                    <TableCell align="right">{line.quantity}</TableCell>
                    <TableCell>{line.unit ?? "—"}</TableCell>
                    <TableCell>{line.notes ?? "—"}</TableCell>
                    <TableCell padding="checkbox">
                      {canEdit ? (
                        <IconButton size="small" onClick={() => handleRemoveLine(line.id)}>
                          <DeleteOutlined fontSize="small" />
                        </IconButton>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {canEdit && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>Add item</Typography>
                {lineError && <Alert severity="error" sx={{ mb: 1 }}>{lineError}</Alert>}
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <TextField label="Part #" value={linePart} onChange={e => setLinePart(e.target.value)} size="small" sx={{ width: 120 }} />
                  <TextField label="Description *" value={lineDesc} onChange={e => setLineDesc(e.target.value)} size="small" sx={{ flex: 1, minWidth: 160 }} />
                  <TextField label="Qty" value={lineQty} onChange={e => setLineQty(e.target.value)} size="small" type="number" sx={{ width: 80 }} />
                  <TextField label="Unit" value={lineUnit} onChange={e => setLineUnit(e.target.value)} size="small" sx={{ width: 80 }} />
                  <TextField label="Notes" value={lineNotes} onChange={e => setLineNotes(e.target.value)} size="small" sx={{ flex: 1, minWidth: 120 }} />
                  <Button variant="outlined" size="small" startIcon={<AddOutlined />} onClick={handleAddLine} disabled={savingLine}>
                    Add
                  </Button>
                </Stack>
              </>
            )}
          </Box>
        )}

        {/* History tab */}
        {tab === 1 && (
          <Box sx={{ p: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Event</TableCell>
                  <TableCell>Date / Time</TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell>Notes</TableCell>
                  <TableCell>By</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {detail.events.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      <Typography variant="body2" color="text.secondary">No events yet</Typography>
                    </TableCell>
                  </TableRow>
                )}
                {detail.events.map(evt => (
                  <TableRow key={evt.id}>
                    <TableCell><Chip label={evt.eventType} size="small" /></TableCell>
                    <TableCell>{new Date(evt.eventAtUtc).toLocaleString()}</TableCell>
                    <TableCell>{evt.location ?? "—"}</TableCell>
                    <TableCell>{evt.notes ?? "—"}</TableCell>
                    <TableCell>{evt.recordedByName ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {canEdit && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>Record event</Typography>
                {evtError && <Alert severity="error" sx={{ mb: 1 }}>{evtError}</Alert>}
                <Stack direction="row" spacing={1} alignItems="flex-start" flexWrap="wrap" useFlexGap>
                  <FormControl size="small" sx={{ minWidth: 140 }}>
                    <InputLabel shrink>Event type</InputLabel>
                    <Select value={evtType} label="Event type" onChange={e => setEvtType(e.target.value as DeliveryEventType)}>
                      <MenuItem value="Confirmed">Confirmed</MenuItem>
                      <MenuItem value="Packed">Packed</MenuItem>
                      <MenuItem value="Shipped">Shipped</MenuItem>
                      <MenuItem value="Delivered">Delivered</MenuItem>
                      <MenuItem value="Exception">Exception</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField label="Location" value={evtLocation} onChange={e => setEvtLocation(e.target.value)} size="small" sx={{ flex: 1, minWidth: 140 }} />
                  <TextField label="Notes" value={evtNotes} onChange={e => setEvtNotes(e.target.value)} size="small" sx={{ flex: 1, minWidth: 160 }} />
                  <Button variant="outlined" size="small" startIcon={<AddOutlined />} onClick={handleAddEvent} disabled={savingEvt}>
                    Record
                  </Button>
                </Stack>
              </>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Board page ────────────────────────────────────────────────────────────────

export default function DispatchBoardPage() {
  const can = usePermissions();
  const canEditDispatch = !!can.projects?.edit;
  const canDeleteDispatch = !!can.projects?.delete;
  const [orders, setOrders] = useState<DispatchOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<DispatchStatus | "All">("All");
  const [projectFilter, setProjectFilter] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<DispatchOrder | undefined>(undefined);
  const [detailOrder, setDetailOrder] = useState<DispatchOrder | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await dispatchService.list();
      setOrders(data);
    } catch {
      setError("Failed to load dispatch orders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaved = (o: DispatchOrder) => {
    setOrders(prev => {
      const idx = prev.findIndex(x => x.id === o.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = o; return next; }
      return [o, ...prev];
    });
    setFormOpen(false);
    setEditOrder(undefined);
  };

  const handleUpdated = (o: DispatchOrder) => {
    setOrders(prev => prev.map(x => x.id === o.id ? o : x));
    setDetailOrder(o);
  };

  const handleDelete = async (id: string) => {
    await dispatchService.remove(id);
    setOrders(prev => prev.filter(x => x.id !== id));
  };

  const filtered = orders.filter(o => {
    if (statusFilter !== "All" && o.status !== statusFilter) return false;
    if (projectFilter.trim() && !(o.projectJobNumber ?? o.projectId).toLowerCase().includes(projectFilter.toLowerCase())) return false;
    return true;
  });

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
        <LocalShippingOutlined sx={{ fontSize: 32, color: "primary.main" }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={700}>Dispatch Board</Typography>
          <Typography variant="body2" color="text.secondary">Manage parts dispatch and delivery tracking</Typography>
        </Box>
        {canEditDispatch && (
          <Button variant="contained" startIcon={<AddOutlined />} onClick={() => { setEditOrder(undefined); setFormOpen(true); }}>
            New Order
          </Button>
        )}
        <IconButton onClick={load} disabled={loading}>
          <RefreshOutlined />
        </IconButton>
      </Stack>

      {/* Filters */}
      <Stack direction="row" spacing={2} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel shrink>Status</InputLabel>
          <Select value={statusFilter} label="Status" onChange={e => setStatusFilter(e.target.value as DispatchStatus | "All")}>
            <MenuItem value="All">All statuses</MenuItem>
            {STATUS_ORDER.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField
          label="Project"
          value={projectFilter}
          onChange={e => setProjectFilter(e.target.value)}
          size="small"
          placeholder="Filter by project…"
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 200 }}
        />
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : filtered.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>
          <LocalShippingOutlined sx={{ fontSize: 48, mb: 1, opacity: 0.3 }} />
          <Typography>No dispatch orders found.</Typography>
        </Box>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Reference</TableCell>
              <TableCell>Project</TableCell>
              <TableCell>Recipient</TableCell>
              <TableCell>Carrier</TableCell>
              <TableCell>Expected</TableCell>
              <TableCell>Items</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map(order => (
              <TableRow
                key={order.id}
                hover
                sx={{ cursor: "pointer" }}
                onClick={() => { setDetailOrder(order); setDetailOpen(true); }}
              >
                <TableCell>{order.reference ?? <Typography variant="body2" color="text.disabled">—</Typography>}</TableCell>
                <TableCell>{order.projectJobNumber ?? order.projectId}</TableCell>
                <TableCell>{order.recipientName ?? "—"}</TableCell>
                <TableCell>{order.carrier ?? "—"}</TableCell>
                <TableCell>
                  {order.expectedDeliveryDate
                    ? new Date(order.expectedDeliveryDate).toLocaleDateString()
                    : "—"}
                </TableCell>
                <TableCell>{order.lines.length}</TableCell>
                <TableCell><StatusChip status={order.status} /></TableCell>
                <TableCell align="right" onClick={e => e.stopPropagation()}>
                  {canEditDispatch && (
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => { setEditOrder(order); setFormOpen(true); }}>
                        <EditOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  {canDeleteDispatch && (
                    <Tooltip title="Delete">
                      <IconButton size="small" onClick={() => handleDelete(order.id)}>
                        <DeleteOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  {!canEditDispatch && !canDeleteDispatch && (
                    <Typography variant="caption" color="text.disabled">
                      No actions
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <OrderFormDialog
        open={formOpen}
        initial={editOrder}
        onClose={() => { setFormOpen(false); setEditOrder(undefined); }}
        onSaved={handleSaved}
      />

      <OrderDetailDialog
        open={detailOpen}
        order={detailOrder}
        canEdit={canEditDispatch}
        onClose={() => setDetailOpen(false)}
        onUpdated={handleUpdated}
      />
    </Box>
  );
}
