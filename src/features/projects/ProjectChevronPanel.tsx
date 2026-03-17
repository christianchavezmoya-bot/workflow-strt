import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
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
  BuildOutlined,
  DeleteOutline,
  EmailOutlined,
  ExpandMoreOutlined,
  LocalShippingOutlined,
  MoveToInboxOutlined,
  OpenInNewOutlined,
  RefreshOutlined,
  SettingsOutlined
} from "@mui/icons-material";
import { useAppSelector } from "../../store/hooks";
import { projectContactService } from "../../services/projectContactService";
import { projectAssetService } from "../../services/projectAssetService";
import { assetWorkflowRunService } from "../../services/assetWorkflowRunService";
import { quickbaseService } from "../../services/quickbaseService";
import type {
  InboundCondition,
  InboundItemType,
  ProjectContact,
  ProjectInboundItem,
  SignMethod
} from "../../types/projectContact";
import type { GoodsMovement } from "../../types/goodsMovement";
import type { ProjectAsset } from "../../types/projectAsset";
import type { AssetWorkflowRun } from "../../types/assetWorkflowRun";

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

const PANEL_MAX_W = 900;

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
  { key: "orderRef",       label: "PO #",        width: 90 },
  { key: "consignmentRef", label: "Consignment", width: 110 }
];

function GoodsMovementsTable({ rows, realmHostname, tableId }: {
  rows: GoodsMovement[];
  realmHostname: string;
  tableId: string;
}) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const qbRecordUrl = (recordId: string) =>
    realmHostname && tableId && recordId
      ? `https://${realmHostname}/db/${tableId}?a=er&rid=${recordId}`
      : null;

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
            <TableCell sx={{ width: 52, py: 0.5 }} />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, i) => {
            const url = qbRecordUrl(row.recordId);
            const isExpanded = expandedRow === i;
            return (
              <React.Fragment key={i}>
                <TableRow sx={{ "&:hover": { background: "rgba(255,255,255,0.03)" } }}>
                  {GM_COLS.map(c => (
                    <TableCell key={c.key} sx={{ py: 0.5, fontSize: "0.72rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <Tooltip title={String(row[c.key] ?? "")} disableHoverListener={String(row[c.key] ?? "").length < 20}>
                        <span>
                          {c.key === "date" ? fmtDate(row[c.key] as string) : String(row[c.key] ?? "")}
                        </span>
                      </Tooltip>
                    </TableCell>
                  ))}
                  <TableCell sx={{ py: 0, px: 0.5 }}>
                    <Stack direction="row" spacing={0}>
                      <Tooltip title="Show all QB fields">
                        <IconButton size="small" onClick={() => setExpandedRow(isExpanded ? null : i)}
                          sx={{ p: 0.25 }}>
                          <ExpandMoreOutlined sx={{ fontSize: 14, transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                        </IconButton>
                      </Tooltip>
                      {url && (
                        <Tooltip title="Open record in Quickbase">
                          <IconButton size="small" component="a" href={url} target="_blank" rel="noopener" sx={{ p: 0.25 }}>
                            <OpenInNewOutlined sx={{ fontSize: 13 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={GM_COLS.length + 1} sx={{ py: 0, border: 0 }}>
                    <Collapse in={isExpanded} unmountOnExit>
                      <Box sx={{ px: 1, py: 0.75, background: "rgba(255,255,255,0.02)", borderRadius: 1, mb: 0.5 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5, fontWeight: 600 }}>
                          All QB fields (raw)
                        </Typography>
                        <Stack direction="row" flexWrap="wrap" gap={0.5}>
                          {Object.entries(row.rawFields ?? {}).map(([name, val]) => (
                            <Chip
                              key={name}
                              label={`${name}: ${val || "—"}`}
                              size="small"
                              variant="outlined"
                              sx={{ height: 18, fontSize: "0.62rem", maxWidth: 260,
                                    "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" },
                                    opacity: val ? 1 : 0.4 }}
                            />
                          ))}
                        </Stack>
                      </Box>
                    </Collapse>
                  </TableCell>
                </TableRow>
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    </Box>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface Props { projectId: string; productId?: string; }
type TabId = "contacts" | "installations" | "goodsMovements" | "inbound";

export default function ProjectChevronPanel({ projectId, productId }: Props) {
  const navigate = useNavigate();
  const users = useAppSelector((s) => s.users.items);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
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
  const [despatched,    setDespatched]    = useState<GoodsMovement[]>([]);
  const [received,      setReceived]      = useState<GoodsMovement[]>([]);
  const [qbLoading,     setQbLoading]     = useState(false);
  const [qbError,       setQbError]       = useState<string | null>(null);
  const [qbLoaded,      setQbLoaded]      = useState(false);
  const [qbRealmHost,   setQbRealmHost]   = useState("");
  const [qbTableId,     setQbTableId]     = useState("");
  const [qbFilterQuery, setQbFilterQuery] = useState("");

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
      setQbRealmHost(result.realmHostname ?? "");
      setQbTableId(result.tableId ?? "");
      setQbFilterQuery(result.filterQuery ?? "");
      setQbLoaded(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? "Failed to load from Quickbase.";
      setQbError(msg);
    } finally {
      setQbLoading(false);
    }
  }, [projectId]);

  // ── Installations ──────────────────────────────────────────────────────────
  const [installAssets,        setInstallAssets]        = useState<ProjectAsset[]>([]);
  const [installAssetsLoading, setInstallAssetsLoading] = useState(false);
  const [latestRuns,           setLatestRuns]           = useState<AssetWorkflowRun[]>([]);

  const runByAsset = useMemo(
    () => new Map(latestRuns.map(r => [r.assetId, r])),
    [latestRuns]
  );

  const loadInstallAssets = useCallback(async () => {
    setInstallAssetsLoading(true);
    try {
      let assets: ProjectAsset[];
      if (productId) {
        const all = await projectAssetService.listByProduct(productId);
        assets = all.filter(a => a.projectId === projectId);
      } else {
        assets = await projectAssetService.listByProject(projectId);
      }
      setInstallAssets(assets);
      const runs = await assetWorkflowRunService.listLatestByProject(projectId);
      setLatestRuns(runs);
    } catch { /* silently fail */ }
    finally { setInstallAssetsLoading(false); }
  }, [projectId, productId]);

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
    if (tab === "installations" && installAssets.length === 0 && !installAssetsLoading) loadInstallAssets();
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

  // ── QB header row (sync button + filter info) ─────────────────────────────
  const qbTableUrl = qbRealmHost && qbTableId
    ? `https://${qbRealmHost}/db/${qbTableId}`
    : null;

  const QbHeader = ({ count }: { count: number }) => (
    <Stack spacing={0.5} sx={{ mb: 1 }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        {qbLoaded && (
          <Chip
            label={`${count} record${count !== 1 ? "s" : ""} from QB`}
            size="small"
            variant="outlined"
            sx={{ height: 20, fontSize: "0.68rem" }}
          />
        )}
        <Box sx={{ flex: 1 }} />
        {qbTableUrl && (
          <Tooltip title="Open table in Quickbase">
            <IconButton size="small" component="a" href={qbTableUrl} target="_blank" rel="noopener">
              <OpenInNewOutlined sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        )}
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
      {qbLoaded && qbFilterQuery && (
        <Tooltip title={`QB filter: ${qbFilterQuery}`} placement="bottom-start">
          <Typography variant="caption" color="text.disabled" noWrap sx={{ cursor: "help", fontSize: "0.65rem" }}>
            Filter: <code style={{ fontSize: "0.65rem" }}>{qbFilterQuery}</code>
          </Typography>
        </Tooltip>
      )}
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
        <Tab value="installations" icon={<BuildOutlined sx={{ fontSize: 15 }} />} iconPosition="start"
          label={`Installations${installAssets.length ? ` (${installAssets.length})` : ""}`} />
        <Tab value="goodsMovements" icon={<LocalShippingOutlined sx={{ fontSize: 15 }} />} iconPosition="start"
          label={`Dispatched${despatched.length ? ` (${despatched.length})` : ""}`} />
        <Tab value="inbound" icon={<MoveToInboxOutlined sx={{ fontSize: 15 }} />} iconPosition="start"
          label={`Inbound${received.length ? ` (${received.length})` : ""}`} />
      </Tabs>

      {/* ── INSTALLATIONS ─────────────────────────────────────────────────── */}
      {tab === "installations" && (
        <Box sx={{ maxHeight: "65vh", overflowY: "auto", pr: 0.5 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Asset installation status for this project
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Tooltip title="Refresh">
              <IconButton size="small" onClick={loadInstallAssets} disabled={installAssetsLoading}>
                <RefreshOutlined sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          </Stack>
          {installAssetsLoading ? <Spinner /> : installAssets.length === 0 ? (
            <Stack spacing={1} alignItems="flex-start" sx={{ py: 2 }}>
              <Typography variant="caption" color="text.disabled">No assets added to this project yet.</Typography>
              <Button
                size="small"
                variant="outlined"
                startIcon={<BuildOutlined sx={{ fontSize: 13 }} />}
                onClick={() => navigate(`/installations/assets?project=${encodeURIComponent(projectId)}${productId ? `&product=${encodeURIComponent(productId)}` : ""}`)}
                sx={{ fontSize: "0.72rem", py: 0.25, px: 1 }}
              >
                Go to Asset Installations
              </Button>
            </Stack>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontSize: "0.7rem", py: 0.5, color: "text.secondary" }}>Asset</TableCell>
                  <TableCell sx={{ fontSize: "0.7rem", py: 0.5, color: "text.secondary" }}>Tag</TableCell>
                  <TableCell sx={{ fontSize: "0.7rem", py: 0.5, color: "text.secondary" }}>Status</TableCell>
                  <TableCell sx={{ fontSize: "0.7rem", py: 0.5, color: "text.secondary" }}>Assigned Tech</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {installAssets.map(a => {
                  // Compute highest open issue severity across asset + latest run issues
                  let openIssues: Array<{ severity?: string; isBlocking?: boolean; resolved?: boolean }> = [];
                  try { openIssues = (JSON.parse(a.issuesJson || "[]") as typeof openIssues).filter(i => !i.resolved); } catch {}
                  const run = runByAsset.get(a.id);
                  try {
                    if (run) {
                      const runIssues = (JSON.parse(run.issuesJson || "[]") as typeof openIssues).filter(i => !i.resolved);
                      openIssues = [...openIssues, ...runIssues];
                    }
                  } catch {}
                  const hasHigh   = openIssues.some(i => i.severity === "high" || i.isBlocking);
                  const hasMedium = openIssues.some(i => i.severity === "medium");
                  const awaitingSignature = a.status === "Complete" && !!run
                    && run.isLocked && !run.customerSignedAt && run.signatureStatus !== "WaivedCustomer";
                  const statusColor: "error" | "warning" | "success" | "primary" | "default" =
                    hasHigh            ? "error"   :
                    hasMedium          ? "warning" :
                    awaitingSignature  ? "warning" :
                    a.status === "Complete"   ? "success" :
                    a.status === "InProgress" ? "primary" :
                    a.status === "Issue"      ? "error"   : "default";
                  const statusLabel =
                    awaitingSignature && !hasHigh && !hasMedium ? "Awaiting Signature" :
                    a.status === "Complete"   ? "Complete"   :
                    a.status === "InProgress" ? "In Progress" :
                    a.status === "Issue"      ? "Issue"      : a.status;
                  const tech = a.assignedUserId ? userMap.get(a.assignedUserId) : null;
                  return (
                    <TableRow key={a.id} hover sx={{ cursor: "default" }}>
                      <TableCell sx={{ fontSize: "0.72rem", py: 0.4 }}>
                        <Typography variant="caption" fontWeight={600}>{a.assetName ?? a.assetTag}</Typography>
                        {a.serialNumber && (
                          <Typography variant="caption" color="text.disabled" display="block">{a.serialNumber}</Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ fontSize: "0.72rem", py: 0.4 }}>
                        <Typography variant="caption" color="text.secondary">{a.assetTag || "—"}</Typography>
                      </TableCell>
                      <TableCell sx={{ py: 0.4 }}>
                        <Chip
                          label={statusLabel}
                          size="small"
                          color={statusColor}
                          variant="outlined"
                          sx={{ height: 18, fontSize: "0.65rem" }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontSize: "0.72rem", py: 0.4 }}>
                        {tech
                          ? <Typography variant="caption">{tech.fullName || tech.email}</Typography>
                          : <Typography variant="caption" color="text.disabled">—</Typography>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Box>
      )}

      {/* ── CONTACTS ──────────────────────────────────────────────────────── */}
      {tab === "contacts" && (
        <Box sx={{ maxHeight: "65vh", overflowY: "auto", pr: 0.5 }}>
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
        <Box sx={{ maxHeight: "65vh", overflowY: "auto", pr: 0.5 }}>
          <QbHeader count={despatched.length} />
          {qbError && (
            <Alert severity="warning" sx={{ mb: 1, fontSize: "0.75rem" }}>{qbError}</Alert>
          )}
          {qbLoading ? <Spinner /> : <GoodsMovementsTable rows={despatched} realmHostname={qbRealmHost} tableId={qbTableId} />}
        </Box>
      )}

      {/* ── INBOUND (QB Received + local manual entries) ───────────────────── */}
      {tab === "inbound" && (
        <Box sx={{ maxHeight: "65vh", overflowY: "auto", pr: 0.5 }}>
          <QbHeader count={received.length} />
          {qbError && (
            <Alert severity="warning" sx={{ mb: 1, fontSize: "0.75rem" }}>{qbError}</Alert>
          )}
          {qbLoading ? <Spinner /> : <GoodsMovementsTable rows={received} realmHostname={qbRealmHost} tableId={qbTableId} />}

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
