import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Switch,
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
  DeleteOutline,
  EmailOutlined,
  LocalShippingOutlined,
  MoveToInboxOutlined,
  RefreshOutlined,
  SettingsOutlined
} from "@mui/icons-material";
import { projectContactService } from "../../services/projectContactService";
import { quickbaseService } from "../../services/quickbaseService";
import type {
  InboundCondition,
  InboundItemType,
  ProjectContact,
  ProjectInboundItem,
  SignMethod
} from "../../types/projectContact";
import type { GoodsMovement } from "../../types/goodsMovement";

// ─── helpers ──────────────────────────────────────────────────────────────────

const SIGN_METHODS: { value: SignMethod; label: string }[] = [
  { value: "email", label: "Email link" },
  { value: "sms",   label: "SMS link"   }
];
const CONDITIONS: InboundCondition[] = ["Good", "Damaged", "Needs Assessment"];
const ITEM_TYPES: InboundItemType[]  = ["Part", "Warranty", "Return", "Other"];

function fmtDate(iso: string) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

// ─── Form state types ─────────────────────────────────────────────────────────

type ContactFormState = {
  name: string; title: string; email: string; phone: string;
  preferredSignMethod: SignMethod; isPrimarySigner: boolean; ccReports: boolean;
  address: string;
};
const emptyContact = (): ContactFormState => ({
  name: "", title: "", email: "", phone: "",
  preferredSignMethod: "email", isPrimarySigner: false, ccReports: false, address: ""
});

type InboundFormState = {
  description: string; quantity: string; unit: string; condition: InboundCondition;
  referenceNumber: string; receivedDate: string; receivedBy: string; notes: string;
  itemType: InboundItemType;
};
const emptyInbound = (): InboundFormState => ({
  description: "", quantity: "1", unit: "", condition: "Good",
  referenceNumber: "", receivedDate: "", receivedBy: "", notes: "", itemType: "Part"
});

// ─── Layout constants ─────────────────────────────────────────────────────────

const PANEL_MAX_W = 760;
const BODY_H      = 420;

// ─── QB enabled check ─────────────────────────────────────────────────────────

function isQbEnabled(): boolean {
  try {
    const s = JSON.parse(localStorage.getItem("qb_settings") ?? "{}");
    return !!s?.enabled && !!s?.goodsMovementsTableId;
  } catch { return false; }
}

// ─── Goods Movement table ─────────────────────────────────────────────────────

const GM_COLS: { key: keyof GoodsMovement; label: string; width?: number | string }[] = [
  { key: "date",           label: "Date",        width: 90 },
  { key: "movementRef",    label: "Ref #",       width: 110 },
  { key: "toFrom",         label: "To / From",   width: 120 },
  { key: "goods",          label: "Goods",       width: "auto" },
  { key: "handledBy",      label: "By",          width: 110 },
  { key: "navPoNumber",    label: "PO #",        width: 90 },
  { key: "consignmentRef", label: "Consignment", width: 110 }
];

function GoodsMovementsTable({ rows }: { rows: GoodsMovement[] }) {
  if (rows.length === 0) {
    return (
      <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 2, textAlign: "center" }}>
        No records found.
      </Typography>
    );
  }
  return (
    <Box sx={{ overflowX: "auto" }}>
      <Table size="small" sx={{ tableLayout: "fixed", minWidth: 560 }}>
        <TableHead>
          <TableRow>
            {GM_COLS.map(c => (
              <TableCell key={c.key} sx={{ width: c.width, py: 0.5, fontSize: "0.7rem", color: "text.secondary", whiteSpace: "nowrap" }}>
                {c.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i} sx={{ "&:hover": { background: "rgba(255,255,255,0.03)" } }}>
              {GM_COLS.map(c => (
                <TableCell key={c.key} sx={{ py: 0.5, fontSize: "0.72rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <Tooltip title={String(row[c.key] ?? "")} disableHoverListener={String(row[c.key] ?? "").length < 20}>
                    <span>
                      {c.key === "date" ? fmtDate(row[c.key]) : String(row[c.key] ?? "")}
                    </span>
                  </Tooltip>
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface Props { projectId: string; }
type TabId = "contacts" | "goodsMovements" | "inbound";

export default function ProjectChevronPanel({ projectId }: Props) {
  const [tab, setTab] = useState<TabId>("contacts");

  // ── Contacts ───────────────────────────────────────────────────────────────
  const [contacts,         setContacts]         = useState<ProjectContact[]>([]);
  const [contactsLoading,  setContactsLoading]  = useState(false);
  const [contactForm,      setContactForm]      = useState<ContactFormState>(emptyContact());
  const [primaryContactId, setPrimaryContactId] = useState<string | null>(null);
  const [contactSaving,    setContactSaving]    = useState(false);

  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      const list = await projectContactService.listContacts(projectId);
      setContacts(list);
      const primary = list.find(c => c.isPrimarySigner) ?? list[0] ?? null;
      if (primary) {
        setPrimaryContactId(primary.id);
        setContactForm({
          name: primary.name, title: primary.title ?? "",
          email: primary.email ?? "", phone: primary.phone ?? "",
          preferredSignMethod: primary.preferredSignMethod,
          isPrimarySigner: primary.isPrimarySigner,
          ccReports: primary.ccReports, address: primary.address ?? ""
        });
      } else {
        setPrimaryContactId(null);
        setContactForm(emptyContact());
      }
    } catch { /* silently fail */ }
    finally { setContactsLoading(false); }
  }, [projectId]);

  // ── Goods Movements (QB) ───────────────────────────────────────────────────
  const [despatched, setDespatched] = useState<GoodsMovement[]>([]);
  const [received,   setReceived]   = useState<GoodsMovement[]>([]);
  const [qbLoading,  setQbLoading]  = useState(false);
  const [qbError,    setQbError]    = useState<string | null>(null);
  const [qbLoaded,   setQbLoaded]   = useState(false);

  const syncQb = useCallback(async () => {
    if (!isQbEnabled()) {
      setQbError("Quickbase integration is not enabled. Configure it in Settings → Integrations.");
      return;
    }
    setQbLoading(true);
    setQbError(null);
    try {
      const result = await quickbaseService.getGoodsMovements(projectId);
      setDespatched(result.despatched);
      setReceived(result.received);
      setQbLoaded(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? "Failed to load from Quickbase.";
      setQbError(msg);
    } finally {
      setQbLoading(false);
    }
  }, [projectId]);

  // ── Inbound (local) ────────────────────────────────────────────────────────
  const [inbounds,        setInbounds]        = useState<ProjectInboundItem[]>([]);
  const [inboundsLoading, setInboundsLoading] = useState(false);
  const [inboundForm,     setInboundForm]     = useState<InboundFormState>(emptyInbound());
  const [inboundSaving,   setInboundSaving]   = useState(false);

  const loadInbounds = useCallback(async () => {
    setInboundsLoading(true);
    try { setInbounds(await projectContactService.listInboundItems(projectId)); }
    catch { /* silently fail */ }
    finally { setInboundsLoading(false); }
  }, [projectId]);

  // ── Load on tab switch (lazy) ──────────────────────────────────────────────
  useEffect(() => {
    if (tab === "contacts" && contacts.length === 0 && !contactsLoading) loadContacts();
    if ((tab === "goodsMovements" || tab === "inbound") && !qbLoaded && !qbLoading) syncQb();
    if (tab === "inbound" && inbounds.length === 0 && !inboundsLoading) loadInbounds();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  // ── Contacts CRUD ──────────────────────────────────────────────────────────
  const savePrimaryContact = async () => {
    if (!contactForm.name.trim()) return;
    setContactSaving(true);
    try {
      if (primaryContactId) {
        const u = await projectContactService.updateContact(primaryContactId, contactForm);
        setContacts(prev => prev.map(c => c.id === u.id ? u : c));
      } else {
        const c = await projectContactService.createContact(projectId, { ...contactForm, isPrimarySigner: true });
        setContacts(prev => [...prev, c]);
        setPrimaryContactId(c.id);
      }
    } finally { setContactSaving(false); }
  };

  const deleteContact = async (id: string) => {
    await projectContactService.deleteContact(id);
    setContacts(prev => prev.filter(c => c.id !== id));
    if (id === primaryContactId) { setPrimaryContactId(null); setContactForm(emptyContact()); }
  };

  // ── Inbound CRUD ───────────────────────────────────────────────────────────
  const saveNewInbound = async () => {
    if (!inboundForm.description.trim()) return;
    setInboundSaving(true);
    try {
      const created = await projectContactService.createInboundItem(projectId, {
        description: inboundForm.description,
        quantity: parseFloat(inboundForm.quantity) || 1,
        unit: inboundForm.unit || undefined,
        condition: inboundForm.condition,
        referenceNumber: inboundForm.referenceNumber || undefined,
        receivedDate: inboundForm.receivedDate || undefined,
        receivedBy: inboundForm.receivedBy || undefined,
        notes: inboundForm.notes || undefined,
        itemType: inboundForm.itemType
      });
      setInbounds(prev => [created, ...prev]);
      setInboundForm(emptyInbound());
    } finally { setInboundSaving(false); }
  };

  const deleteInbound = async (id: string) => {
    await projectContactService.deleteInboundItem(id);
    setInbounds(prev => prev.filter(i => i.id !== id));
  };

  // ── Field setters ──────────────────────────────────────────────────────────
  const setCF = (f: keyof ContactFormState, v: unknown) => setContactForm(p => ({ ...p, [f]: v }));
  const setIF = (f: keyof InboundFormState, v: unknown) => setInboundForm(p => ({ ...p, [f]: v }));

  // ── Shared spinner ─────────────────────────────────────────────────────────
  const Spinner = () => <CircularProgress size={20} sx={{ display: "block", mx: "auto", mt: 6 }} />;

  // ── QB header row (sync button + status) ──────────────────────────────────
  const QbHeader = ({ count }: { count: number }) => (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
      {qbLoaded && (
        <Chip
          label={`${count} record${count !== 1 ? "s" : ""} from QB`}
          size="small"
          variant="outlined"
          sx={{ height: 20, fontSize: "0.68rem" }}
        />
      )}
      <Box sx={{ flex: 1 }} />
      <Button
        size="small"
        variant="outlined"
        startIcon={qbLoading ? <CircularProgress size={12} /> : <RefreshOutlined sx={{ fontSize: 14 }} />}
        onClick={syncQb}
        disabled={qbLoading}
        sx={{ fontSize: "0.72rem", py: 0.25, px: 1 }}
      >
        Sync from QB
      </Button>
      <Tooltip title="Configure in Settings → Integrations">
        <IconButton size="small" href="/settings?tab=quickbase" component="a">
          <SettingsOutlined sx={{ fontSize: 14 }} />
        </IconButton>
      </Tooltip>
    </Stack>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Box sx={{
      p: 1.5, background: "rgba(0,0,0,0.18)", borderRadius: 1,
      maxWidth: PANEL_MAX_W, minWidth: 0, overflow: "hidden", boxSizing: "border-box"
    }}>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v as TabId)}
        textColor="inherit"
        indicatorColor="primary"
        sx={{ mb: 1.5, minHeight: 34, "& .MuiTab-root": { minHeight: 34, py: 0.5, px: 1.5, fontSize: "0.78rem" } }}
      >
        <Tab value="contacts" icon={<EmailOutlined sx={{ fontSize: 15 }} />} iconPosition="start"
          label={`Contacts${contacts.length ? ` (${contacts.length})` : ""}`} />
        <Tab value="goodsMovements" icon={<LocalShippingOutlined sx={{ fontSize: 15 }} />} iconPosition="start"
          label={`Good Movements${despatched.length ? ` (${despatched.length})` : ""}`} />
        <Tab value="inbound" icon={<MoveToInboxOutlined sx={{ fontSize: 15 }} />} iconPosition="start"
          label={`Inbound${received.length ? ` (${received.length})` : ""}`} />
      </Tabs>

      {/* ── CONTACTS ──────────────────────────────────────────────────────── */}
      {tab === "contacts" && (
        <Box sx={{ height: BODY_H, overflowY: "auto", pr: 0.5 }}>
          {contactsLoading ? <Spinner /> : (
            <Stack spacing={1}>
              <TextField label="Full name *" size="small" fullWidth
                value={contactForm.name} onChange={e => setCF("name", e.target.value)} />
              <TextField label="Title / Role" size="small" fullWidth
                value={contactForm.title} onChange={e => setCF("title", e.target.value)} />
              <TextField label="Email" size="small" fullWidth
                value={contactForm.email} onChange={e => setCF("email", e.target.value)} />
              <TextField label="Phone" size="small" fullWidth
                value={contactForm.phone} onChange={e => setCF("phone", e.target.value)} />
              <TextField label="Address" size="small" fullWidth
                placeholder="Street, City, State / Country"
                value={contactForm.address} onChange={e => setCF("address", e.target.value)} />
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                  Sign method
                </Typography>
                <Select size="small" fullWidth value={contactForm.preferredSignMethod}
                  onChange={e => setCF("preferredSignMethod", e.target.value)}>
                  {SIGN_METHODS.map(m => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
                </Select>
              </Stack>
              <Stack direction="row" spacing={0.5}>
                <FormControlLabel sx={{ flex: 1, m: 0 }}
                  control={<Switch size="small" checked={contactForm.isPrimarySigner}
                    onChange={e => setCF("isPrimarySigner", e.target.checked)} />}
                  label={<Typography variant="caption">Primary signer</Typography>}
                />
                <FormControlLabel sx={{ flex: 1, m: 0 }}
                  control={<Switch size="small" checked={contactForm.ccReports}
                    onChange={e => setCF("ccReports", e.target.checked)} />}
                  label={<Typography variant="caption">CC on reports</Typography>}
                />
              </Stack>
              <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ pt: 0.5 }}>
                {primaryContactId && (
                  <Button size="small" color="error" startIcon={<DeleteOutline sx={{ fontSize: 15 }} />}
                    onClick={() => deleteContact(primaryContactId)}>
                    Remove
                  </Button>
                )}
                <Button variant="contained" size="small"
                  disabled={contactSaving || !contactForm.name.trim()}
                  onClick={savePrimaryContact}>
                  {contactSaving ? <CircularProgress size={14} />
                    : primaryContactId ? "Save changes" : "Save contact"}
                </Button>
              </Stack>

              {contacts.filter(c => c.id !== primaryContactId).map(c => (
                <Box key={c.id} sx={{
                  display: "flex", alignItems: "center", gap: 1, px: 1, py: 0.75,
                  borderRadius: 1, background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)"
                }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap>
                      {c.name}{c.title ? ` · ${c.title}` : ""}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {[c.email, c.phone].filter(Boolean).join(" · ")}
                    </Typography>
                  </Box>
                  <IconButton size="small" onClick={() => deleteContact(c.id)}>
                    <DeleteOutline sx={{ fontSize: 15 }} />
                  </IconButton>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      )}

      {/* ── GOOD MOVEMENTS (QB Despatched) ────────────────────────────────── */}
      {tab === "goodsMovements" && (
        <Box sx={{ height: BODY_H, overflowY: "auto", pr: 0.5 }}>
          <QbHeader count={despatched.length} />
          {qbError && (
            <Alert severity="warning" sx={{ mb: 1, fontSize: "0.75rem" }}>{qbError}</Alert>
          )}
          {qbLoading ? <Spinner /> : <GoodsMovementsTable rows={despatched} />}
        </Box>
      )}

      {/* ── INBOUND (QB Received + local manual entries) ───────────────────── */}
      {tab === "inbound" && (
        <Box sx={{ height: BODY_H, overflowY: "auto", pr: 0.5 }}>
          <QbHeader count={received.length} />
          {qbError && (
            <Alert severity="warning" sx={{ mb: 1, fontSize: "0.75rem" }}>{qbError}</Alert>
          )}
          {qbLoading ? <Spinner /> : <GoodsMovementsTable rows={received} />}

          {!qbLoading && (
            <>
              <Divider sx={{ my: 1.5 }}>
                <Typography variant="caption" color="text.secondary">Manual entries</Typography>
              </Divider>
              {inboundsLoading ? <Spinner /> : (
                <Stack spacing={1}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                      Item type
                    </Typography>
                    <Select size="small" fullWidth value={inboundForm.itemType}
                      onChange={e => setIF("itemType", e.target.value)}>
                      {ITEM_TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                    </Select>
                  </Stack>
                  <TextField label="Description *" size="small" fullWidth multiline minRows={2}
                    value={inboundForm.description} onChange={e => setIF("description", e.target.value)} />
                  <Stack direction="row" spacing={1}>
                    <TextField label="Qty" type="number" size="small" sx={{ width: 80 }}
                      value={inboundForm.quantity} onChange={e => setIF("quantity", e.target.value)} />
                    <TextField label="Unit" size="small" sx={{ width: 80 }} placeholder="pcs, kg…"
                      value={inboundForm.unit} onChange={e => setIF("unit", e.target.value)} />
                    <Select size="small" fullWidth value={inboundForm.condition}
                      onChange={e => setIF("condition", e.target.value)}>
                      {CONDITIONS.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                    </Select>
                  </Stack>
                  <TextField label="Reference # (PO / RMA / Warranty)" size="small" fullWidth
                    value={inboundForm.referenceNumber} onChange={e => setIF("referenceNumber", e.target.value)} />
                  <Stack direction="row" spacing={1}>
                    <TextField label="Received date" type="date" size="small" fullWidth
                      value={inboundForm.receivedDate} onChange={e => setIF("receivedDate", e.target.value)}
                      InputLabelProps={{ shrink: true }} />
                    <TextField label="Received by" size="small" fullWidth
                      value={inboundForm.receivedBy} onChange={e => setIF("receivedBy", e.target.value)} />
                  </Stack>
                  <Stack direction="row" justifyContent="flex-end" sx={{ pt: 0.5 }}>
                    <Button variant="contained" size="small"
                      disabled={inboundSaving || !inboundForm.description.trim()}
                      onClick={saveNewInbound}>
                      {inboundSaving ? <CircularProgress size={14} /> : "Add item"}
                    </Button>
                  </Stack>

                  {inbounds.length > 0 && (
                    <>
                      <Divider sx={{ my: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">Recorded items</Typography>
                      </Divider>
                      {inbounds.map(i => (
                        <Box key={i.id} sx={{
                          display: "flex", alignItems: "flex-start", gap: 1, px: 1, py: 0.75,
                          borderRadius: 1, background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.07)"
                        }}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.25 }}>
                              <Chip label={i.itemType} size="small" variant="outlined"
                                sx={{ height: 16, fontSize: "0.6rem", flexShrink: 0 }} />
                              <Typography variant="body2" noWrap>{i.description}</Typography>
                            </Stack>
                            <Typography variant="caption" color="text.secondary">
                              Qty {i.quantity}{i.unit ? ` ${i.unit}` : ""}
                              {" · "}{i.condition}
                              {i.referenceNumber ? ` · ${i.referenceNumber}` : ""}
                              {i.receivedDate ? ` · ${fmtDate(i.receivedDate)}` : ""}
                              {i.receivedBy ? ` · ${i.receivedBy}` : ""}
                            </Typography>
                          </Box>
                          <IconButton size="small" onClick={() => deleteInbound(i.id)}>
                            <DeleteOutline sx={{ fontSize: 15 }} />
                          </IconButton>
                        </Box>
                      ))}
                    </>
                  )}
                </Stack>
              )}
            </>
          )}
        </Box>
      )}
    </Box>
  );
}
