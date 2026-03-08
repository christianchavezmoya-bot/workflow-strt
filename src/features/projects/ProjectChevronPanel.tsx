import React, { useCallback, useEffect, useState } from "react";
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
  FormControlLabel,
  FormHelperText,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import {
  AddOutlined,
  DeleteOutline,
  EditOutlined,
  EmailOutlined,
  LocalShippingOutlined,
  MoveToInboxOutlined,
  StarOutlined,
  StarBorderOutlined
} from "@mui/icons-material";
import { projectContactService } from "../../services/projectContactService";
import type {
  InboundCondition,
  InboundItemType,
  ProjectContact,
  ProjectDeliveryProfile,
  ProjectInboundItem,
  SignMethod
} from "../../types/projectContact";

// ─── helpers ──────────────────────────────────────────────────────────────────

const SIGN_METHODS: { value: SignMethod; label: string }[] = [
  { value: "email", label: "Email link" },
  { value: "sms",   label: "SMS link" }
];

const CONDITIONS: InboundCondition[] = ["Good", "Damaged", "Needs Assessment"];
const ITEM_TYPES: InboundItemType[]  = ["Part", "Warranty", "Return", "Other"];

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

// ─── Contact dialog ───────────────────────────────────────────────────────────

type ContactFormState = {
  name: string; title: string; email: string; phone: string;
  preferredSignMethod: SignMethod; isPrimarySigner: boolean; ccReports: boolean;
};

const emptyContact = (): ContactFormState => ({
  name: "", title: "", email: "", phone: "",
  preferredSignMethod: "email", isPrimarySigner: false, ccReports: false
});

interface ContactDialogProps {
  open: boolean;
  initial?: ProjectContact | null;
  onClose: () => void;
  onSave: (data: ContactFormState) => Promise<void>;
}

function ContactDialog({ open, initial, onClose, onSave }: ContactDialogProps) {
  const [form, setForm] = useState<ContactFormState>(emptyContact);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial
        ? {
            name: initial.name,
            title: initial.title ?? "",
            email: initial.email ?? "",
            phone: initial.phone ?? "",
            preferredSignMethod: initial.preferredSignMethod,
            isPrimarySigner: initial.isPrimarySigner,
            ccReports: initial.ccReports
          }
        : emptyContact()
      );
    }
  }, [open, initial]);

  const set = (field: keyof ContactFormState, value: unknown) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try { await onSave(form); onClose(); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{initial ? "Edit Contact" : "Add Customer Representative"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Full name *" value={form.name} onChange={e => set("name", e.target.value)} size="small" fullWidth />
          <TextField label="Title / Role" value={form.title} onChange={e => set("title", e.target.value)} size="small" fullWidth />
          <TextField label="Email" value={form.email} onChange={e => set("email", e.target.value)} size="small" fullWidth />
          <TextField label="Phone" value={form.phone} onChange={e => set("phone", e.target.value)} size="small" fullWidth />
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="body2" sx={{ minWidth: 140 }}>Preferred sign method</Typography>
            <Select
              size="small"
              value={form.preferredSignMethod}
              onChange={e => set("preferredSignMethod", e.target.value)}
              sx={{ flex: 1 }}
            >
              {SIGN_METHODS.map(m => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
            </Select>
          </Stack>
          <FormControlLabel
            control={<Switch checked={form.isPrimarySigner} onChange={e => set("isPrimarySigner", e.target.checked)} />}
            label="Primary signer (default recipient for signature requests)"
          />
          <FormControlLabel
            control={<Switch checked={form.ccReports} onChange={e => set("ccReports", e.target.checked)} />}
            label="CC on generated reports"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving || !form.name.trim()}>
          {saving ? <CircularProgress size={18} /> : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Delivery Profile dialog ──────────────────────────────────────────────────

type DeliveryFormState = {
  label: string; contactName: string; contactPhone: string; contactEmail: string;
  addressLine1: string; addressLine2: string; city: string; state: string;
  postCode: string; country: string; deliveryNotes: string; accessHours: string;
  isDefault: boolean;
};

const emptyDelivery = (): DeliveryFormState => ({
  label: "", contactName: "", contactPhone: "", contactEmail: "",
  addressLine1: "", addressLine2: "", city: "", state: "",
  postCode: "", country: "", deliveryNotes: "", accessHours: "", isDefault: false
});

interface DeliveryDialogProps {
  open: boolean;
  initial?: ProjectDeliveryProfile | null;
  onClose: () => void;
  onSave: (data: DeliveryFormState) => Promise<void>;
}

function DeliveryDialog({ open, initial, onClose, onSave }: DeliveryDialogProps) {
  const [form, setForm] = useState<DeliveryFormState>(emptyDelivery);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial
        ? {
            label: initial.label,
            contactName: initial.contactName ?? "",
            contactPhone: initial.contactPhone ?? "",
            contactEmail: initial.contactEmail ?? "",
            addressLine1: initial.addressLine1 ?? "",
            addressLine2: initial.addressLine2 ?? "",
            city: initial.city ?? "",
            state: initial.state ?? "",
            postCode: initial.postCode ?? "",
            country: initial.country ?? "",
            deliveryNotes: initial.deliveryNotes ?? "",
            accessHours: initial.accessHours ?? "",
            isDefault: initial.isDefault
          }
        : emptyDelivery()
      );
    }
  }, [open, initial]);

  const set = (field: keyof DeliveryFormState, value: unknown) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.label.trim()) return;
    setSaving(true);
    try { await onSave(form); onClose(); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{initial ? "Edit Delivery Profile" : "Add Delivery Profile"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Label *" placeholder="Main Site, Warehouse…" value={form.label}
            onChange={e => set("label", e.target.value)} size="small" fullWidth />
          <Divider><Typography variant="caption" color="text.secondary">Site contact</Typography></Divider>
          <Stack direction="row" spacing={1}>
            <TextField label="Contact name" value={form.contactName} onChange={e => set("contactName", e.target.value)} size="small" fullWidth />
            <TextField label="Phone" value={form.contactPhone} onChange={e => set("contactPhone", e.target.value)} size="small" fullWidth />
          </Stack>
          <TextField label="Contact email" value={form.contactEmail} onChange={e => set("contactEmail", e.target.value)} size="small" fullWidth />
          <Divider><Typography variant="caption" color="text.secondary">Ship-to address</Typography></Divider>
          <TextField label="Address line 1" value={form.addressLine1} onChange={e => set("addressLine1", e.target.value)} size="small" fullWidth />
          <TextField label="Address line 2" value={form.addressLine2} onChange={e => set("addressLine2", e.target.value)} size="small" fullWidth />
          <Stack direction="row" spacing={1}>
            <TextField label="City" value={form.city} onChange={e => set("city", e.target.value)} size="small" fullWidth />
            <TextField label="State / Province" value={form.state} onChange={e => set("state", e.target.value)} size="small" sx={{ maxWidth: 160 }} />
          </Stack>
          <Stack direction="row" spacing={1}>
            <TextField label="Post code" value={form.postCode} onChange={e => set("postCode", e.target.value)} size="small" sx={{ maxWidth: 160 }} />
            <TextField label="Country" value={form.country} onChange={e => set("country", e.target.value)} size="small" fullWidth />
          </Stack>
          <Divider><Typography variant="caption" color="text.secondary">Logistics notes</Typography></Divider>
          <TextField label="Delivery notes / instructions" value={form.deliveryNotes}
            onChange={e => set("deliveryNotes", e.target.value)} size="small" fullWidth multiline minRows={2} />
          <TextField label="Access hours" placeholder="e.g. Mon–Fri 8am–5pm" value={form.accessHours}
            onChange={e => set("accessHours", e.target.value)} size="small" fullWidth />
          <FormControlLabel
            control={<Switch checked={form.isDefault} onChange={e => set("isDefault", e.target.checked)} />}
            label="Default delivery address for this project"
          />
          <FormHelperText>Setting a new default will clear the existing default profile.</FormHelperText>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving || !form.label.trim()}>
          {saving ? <CircularProgress size={18} /> : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Inbound Item dialog ──────────────────────────────────────────────────────

type InboundFormState = {
  description: string; quantity: string; unit: string; condition: InboundCondition;
  referenceNumber: string; receivedDate: string; receivedBy: string; notes: string;
  itemType: InboundItemType;
};

const emptyInbound = (): InboundFormState => ({
  description: "", quantity: "1", unit: "", condition: "Good",
  referenceNumber: "", receivedDate: "", receivedBy: "", notes: "", itemType: "Part"
});

interface InboundDialogProps {
  open: boolean;
  initial?: ProjectInboundItem | null;
  onClose: () => void;
  onSave: (data: InboundFormState) => Promise<void>;
}

function InboundDialog({ open, initial, onClose, onSave }: InboundDialogProps) {
  const [form, setForm] = useState<InboundFormState>(emptyInbound);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial
        ? {
            description: initial.description,
            quantity: String(initial.quantity),
            unit: initial.unit ?? "",
            condition: initial.condition,
            referenceNumber: initial.referenceNumber ?? "",
            receivedDate: initial.receivedDate ?? "",
            receivedBy: initial.receivedBy ?? "",
            notes: initial.notes ?? "",
            itemType: initial.itemType
          }
        : emptyInbound()
      );
    }
  }, [open, initial]);

  const set = (field: keyof InboundFormState, value: unknown) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.description.trim()) return;
    setSaving(true);
    try { await onSave(form); onClose(); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{initial ? "Edit Inbound Item" : "Record Inbound Item"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Select size="small" value={form.itemType} onChange={e => set("itemType", e.target.value)}>
            {ITEM_TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </Select>
          <TextField label="Description *" value={form.description}
            onChange={e => set("description", e.target.value)} size="small" fullWidth multiline minRows={2} />
          <Stack direction="row" spacing={1}>
            <TextField label="Quantity" type="number" value={form.quantity}
              onChange={e => set("quantity", e.target.value)} size="small" sx={{ maxWidth: 120 }} />
            <TextField label="Unit" placeholder="pcs, kg…" value={form.unit}
              onChange={e => set("unit", e.target.value)} size="small" sx={{ maxWidth: 120 }} />
            <Select size="small" value={form.condition} onChange={e => set("condition", e.target.value)} sx={{ flex: 1 }}>
              {CONDITIONS.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </Select>
          </Stack>
          <TextField label="Reference # (PO, RMA, Warranty)" value={form.referenceNumber}
            onChange={e => set("referenceNumber", e.target.value)} size="small" fullWidth />
          <Stack direction="row" spacing={1}>
            <TextField label="Received date" type="date" value={form.receivedDate}
              onChange={e => set("receivedDate", e.target.value)} size="small" fullWidth
              InputLabelProps={{ shrink: true }} />
            <TextField label="Received by" value={form.receivedBy}
              onChange={e => set("receivedBy", e.target.value)} size="small" fullWidth />
          </Stack>
          <TextField label="Notes" value={form.notes} onChange={e => set("notes", e.target.value)}
            size="small" fullWidth multiline minRows={2} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving || !form.description.trim()}>
          {saving ? <CircularProgress size={18} /> : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface Props {
  projectId: string;
}

type TabId = "contacts" | "delivery" | "inbound";

export default function ProjectChevronPanel({ projectId }: Props) {
  const [tab, setTab] = useState<TabId>("contacts");

  // ── Contacts state ─────────────────────────────────────────────────────────
  const [contacts, setContacts] = useState<ProjectContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactDialog, setContactDialog] = useState<{ open: boolean; item?: ProjectContact | null }>({ open: false });

  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    try { setContacts(await projectContactService.listContacts(projectId)); }
    catch { /* silently fail */ }
    finally { setContactsLoading(false); }
  }, [projectId]);

  // ── Delivery state ─────────────────────────────────────────────────────────
  const [deliveries, setDeliveries] = useState<ProjectDeliveryProfile[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [deliveryDialog, setDeliveryDialog] = useState<{ open: boolean; item?: ProjectDeliveryProfile | null }>({ open: false });

  const loadDeliveries = useCallback(async () => {
    setDeliveriesLoading(true);
    try { setDeliveries(await projectContactService.listDeliveryProfiles(projectId)); }
    catch { /* silently fail */ }
    finally { setDeliveriesLoading(false); }
  }, [projectId]);

  // ── Inbound state ──────────────────────────────────────────────────────────
  const [inbounds, setInbounds] = useState<ProjectInboundItem[]>([]);
  const [inboundsLoading, setInboundsLoading] = useState(false);
  const [inboundDialog, setInboundDialog] = useState<{ open: boolean; item?: ProjectInboundItem | null }>({ open: false });

  const loadInbounds = useCallback(async () => {
    setInboundsLoading(true);
    try { setInbounds(await projectContactService.listInboundItems(projectId)); }
    catch { /* silently fail */ }
    finally { setInboundsLoading(false); }
  }, [projectId]);

  // Load data on tab switch (lazy)
  useEffect(() => {
    if (tab === "contacts" && contacts.length === 0 && !contactsLoading) loadContacts();
    if (tab === "delivery" && deliveries.length === 0 && !deliveriesLoading) loadDeliveries();
    if (tab === "inbound" && inbounds.length === 0 && !inboundsLoading) loadInbounds();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Initial load for first tab
  useEffect(() => { loadContacts(); }, [loadContacts]);

  // ── Contacts CRUD ──────────────────────────────────────────────────────────
  const saveContact = async (data: ReturnType<typeof emptyContact>) => {
    if (contactDialog.item) {
      const updated = await projectContactService.updateContact(contactDialog.item.id, data);
      setContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
    } else {
      const created = await projectContactService.createContact(projectId, data);
      setContacts(prev => [...prev, created]);
    }
  };

  const deleteContact = async (id: string) => {
    await projectContactService.deleteContact(id);
    setContacts(prev => prev.filter(c => c.id !== id));
  };

  // ── Delivery CRUD ──────────────────────────────────────────────────────────
  const saveDelivery = async (data: ReturnType<typeof emptyDelivery>) => {
    if (deliveryDialog.item) {
      const updated = await projectContactService.updateDeliveryProfile(deliveryDialog.item.id, data);
      setDeliveries(prev => prev.map(d => d.id === updated.id ? updated : d));
    } else {
      const created = await projectContactService.createDeliveryProfile(projectId, data);
      setDeliveries(prev => [...prev, created]);
    }
    // refresh to reflect default flag changes
    loadDeliveries();
  };

  const deleteDelivery = async (id: string) => {
    await projectContactService.deleteDeliveryProfile(id);
    setDeliveries(prev => prev.filter(d => d.id !== id));
  };

  // ── Inbound CRUD ───────────────────────────────────────────────────────────
  const saveInbound = async (data: InboundFormState) => {
    const payload = {
      description: data.description,
      quantity: parseFloat(data.quantity) || 1,
      unit: data.unit || undefined,
      condition: data.condition,
      referenceNumber: data.referenceNumber || undefined,
      receivedDate: data.receivedDate || undefined,
      receivedBy: data.receivedBy || undefined,
      notes: data.notes || undefined,
      itemType: data.itemType
    };
    if (inboundDialog.item) {
      const updated = await projectContactService.updateInboundItem(inboundDialog.item.id, payload);
      setInbounds(prev => prev.map(i => i.id === updated.id ? updated : i));
    } else {
      const created = await projectContactService.createInboundItem(projectId, payload);
      setInbounds(prev => [created, ...prev]);
    }
  };

  const deleteInbound = async (id: string) => {
    await projectContactService.deleteInboundItem(id);
    setInbounds(prev => prev.filter(i => i.id !== id));
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ p: 2, background: "rgba(0,0,0,0.15)", borderRadius: 1 }}>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v as TabId)}
        textColor="inherit"
        indicatorColor="primary"
        sx={{ mb: 1.5, minHeight: 36, "& .MuiTab-root": { minHeight: 36, py: 0.5, fontSize: "0.8rem" } }}
      >
        <Tab value="contacts" icon={<EmailOutlined sx={{ fontSize: 16 }} />} iconPosition="start"
          label={`Contacts${contacts.length ? ` (${contacts.length})` : ""}`} />
        <Tab value="delivery" icon={<LocalShippingOutlined sx={{ fontSize: 16 }} />} iconPosition="start"
          label={`Delivery${deliveries.length ? ` (${deliveries.length})` : ""}`} />
        <Tab value="inbound" icon={<MoveToInboxOutlined sx={{ fontSize: 16 }} />} iconPosition="start"
          label={`Inbound${inbounds.length ? ` (${inbounds.length})` : ""}`} />
      </Tabs>

      {/* ── CONTACTS TAB ──────────────────────────────────────────────────── */}
      {tab === "contacts" && (
        <Stack spacing={1}>
          <Stack direction="row" justifyContent="flex-end">
            <Button size="small" startIcon={<AddOutlined />}
              onClick={() => setContactDialog({ open: true, item: null })}>
              Add contact
            </Button>
          </Stack>
          {contactsLoading && <CircularProgress size={20} sx={{ mx: "auto" }} />}
          {!contactsLoading && contacts.length === 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center", py: 1 }}>
              No customer representatives yet.
            </Typography>
          )}
          {contacts.map(c => (
            <Box key={c.id} sx={{
              display: "flex", alignItems: "flex-start", gap: 1,
              p: 1, borderRadius: 1, background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)"
            }}>
              <Box sx={{ flex: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography variant="body2" fontWeight="bold">{c.name}</Typography>
                  {c.title && <Typography variant="caption" color="text.secondary">{c.title}</Typography>}
                  {c.isPrimarySigner && (
                    <Tooltip title="Primary signer">
                      <StarOutlined sx={{ fontSize: 14, color: "warning.main" }} />
                    </Tooltip>
                  )}
                  {c.ccReports && (
                    <Chip label="CC reports" size="small" variant="outlined" sx={{ height: 18, fontSize: "0.65rem" }} />
                  )}
                </Stack>
                <Stack direction="row" spacing={2} flexWrap="wrap">
                  {c.email && <Typography variant="caption" color="text.secondary">{c.email}</Typography>}
                  {c.phone && <Typography variant="caption" color="text.secondary">{c.phone}</Typography>}
                  <Typography variant="caption" color="text.disabled">
                    via {c.preferredSignMethod === "email" ? "Email link" : "SMS link"}
                  </Typography>
                </Stack>
              </Box>
              <Stack direction="row" spacing={0.5}>
                <IconButton size="small" onClick={() => setContactDialog({ open: true, item: c })}>
                  <EditOutlined sx={{ fontSize: 16 }} />
                </IconButton>
                <IconButton size="small" onClick={() => deleteContact(c.id)}>
                  <DeleteOutline sx={{ fontSize: 16 }} />
                </IconButton>
              </Stack>
            </Box>
          ))}
        </Stack>
      )}

      {/* ── DELIVERY TAB ──────────────────────────────────────────────────── */}
      {tab === "delivery" && (
        <Stack spacing={1}>
          <Stack direction="row" justifyContent="flex-end">
            <Button size="small" startIcon={<AddOutlined />}
              onClick={() => setDeliveryDialog({ open: true, item: null })}>
              Add profile
            </Button>
          </Stack>
          {deliveriesLoading && <CircularProgress size={20} sx={{ mx: "auto" }} />}
          {!deliveriesLoading && deliveries.length === 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center", py: 1 }}>
              No delivery profiles yet.
            </Typography>
          )}
          {deliveries.map(d => (
            <Box key={d.id} sx={{
              p: 1, borderRadius: 1, background: "rgba(255,255,255,0.04)",
              border: `1px solid ${d.isDefault ? "rgba(45,212,191,0.4)" : "rgba(255,255,255,0.06)"}`
            }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Stack direction="row" spacing={1} alignItems="center">
                  {d.isDefault && <StarOutlined sx={{ fontSize: 14, color: "warning.main" }} />}
                  <Typography variant="body2" fontWeight="bold">{d.label}</Typography>
                  {d.isDefault && <Chip label="Default" size="small" color="primary" sx={{ height: 18, fontSize: "0.65rem" }} />}
                </Stack>
                <Stack direction="row" spacing={0.5}>
                  <IconButton size="small" onClick={() => setDeliveryDialog({ open: true, item: d })}>
                    <EditOutlined sx={{ fontSize: 16 }} />
                  </IconButton>
                  <IconButton size="small" onClick={() => deleteDelivery(d.id)}>
                    <DeleteOutline sx={{ fontSize: 16 }} />
                  </IconButton>
                </Stack>
              </Stack>
              {(d.addressLine1 || d.city) && (
                <Typography variant="caption" color="text.secondary">
                  {[d.addressLine1, d.addressLine2, d.city, d.state, d.postCode, d.country]
                    .filter(Boolean).join(", ")}
                </Typography>
              )}
              {d.contactName && (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  Contact: {d.contactName}{d.contactPhone ? ` · ${d.contactPhone}` : ""}
                  {d.contactEmail ? ` · ${d.contactEmail}` : ""}
                </Typography>
              )}
              {d.deliveryNotes && (
                <Typography variant="caption" color="text.disabled" sx={{ display: "block" }}>
                  Notes: {d.deliveryNotes}
                </Typography>
              )}
              {d.accessHours && (
                <Typography variant="caption" color="text.disabled" sx={{ display: "block" }}>
                  Access: {d.accessHours}
                </Typography>
              )}
            </Box>
          ))}
        </Stack>
      )}

      {/* ── INBOUND TAB ───────────────────────────────────────────────────── */}
      {tab === "inbound" && (
        <Stack spacing={1}>
          <Stack direction="row" justifyContent="flex-end">
            <Button size="small" startIcon={<AddOutlined />}
              onClick={() => setInboundDialog({ open: true, item: null })}>
              Record inbound
            </Button>
          </Stack>
          {inboundsLoading && <CircularProgress size={20} sx={{ mx: "auto" }} />}
          {!inboundsLoading && inbounds.length === 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center", py: 1 }}>
              No inbound items recorded yet.
            </Typography>
          )}
          {inbounds.map(i => (
            <Box key={i.id} sx={{
              display: "flex", alignItems: "flex-start", gap: 1,
              p: 1, borderRadius: 1, background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)"
            }}>
              <Box sx={{ flex: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Chip label={i.itemType} size="small" variant="outlined"
                    sx={{ height: 18, fontSize: "0.65rem" }} />
                  <Typography variant="body2">{i.description}</Typography>
                </Stack>
                <Stack direction="row" spacing={2} flexWrap="wrap" sx={{ mt: 0.25 }}>
                  <Typography variant="caption" color="text.secondary">
                    Qty: {i.quantity}{i.unit ? ` ${i.unit}` : ""}
                  </Typography>
                  <Typography variant="caption" color={
                    i.condition === "Damaged" ? "error.main"
                      : i.condition === "Needs Assessment" ? "warning.main"
                      : "text.secondary"
                  }>
                    {i.condition}
                  </Typography>
                  {i.referenceNumber && (
                    <Typography variant="caption" color="text.secondary">Ref: {i.referenceNumber}</Typography>
                  )}
                  {i.receivedDate && (
                    <Typography variant="caption" color="text.secondary">Received: {fmtDate(i.receivedDate)}</Typography>
                  )}
                  {i.receivedBy && (
                    <Typography variant="caption" color="text.secondary">By: {i.receivedBy}</Typography>
                  )}
                </Stack>
                {i.notes && (
                  <Typography variant="caption" color="text.disabled">{i.notes}</Typography>
                )}
              </Box>
              <Stack direction="row" spacing={0.5}>
                <IconButton size="small" onClick={() => setInboundDialog({ open: true, item: i })}>
                  <EditOutlined sx={{ fontSize: 16 }} />
                </IconButton>
                <IconButton size="small" onClick={() => deleteInbound(i.id)}>
                  <DeleteOutline sx={{ fontSize: 16 }} />
                </IconButton>
              </Stack>
            </Box>
          ))}
        </Stack>
      )}

      {/* ── Dialogs ───────────────────────────────────────────────────────── */}
      <ContactDialog
        open={contactDialog.open}
        initial={contactDialog.item}
        onClose={() => setContactDialog({ open: false })}
        onSave={saveContact}
      />
      <DeliveryDialog
        open={deliveryDialog.open}
        initial={deliveryDialog.item}
        onClose={() => setDeliveryDialog({ open: false })}
        onSave={saveDelivery}
      />
      <InboundDialog
        open={inboundDialog.open}
        initial={inboundDialog.item}
        onClose={() => setInboundDialog({ open: false })}
        onSave={saveInbound}
      />
    </Box>
  );
}
