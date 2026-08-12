import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  AssessmentOutlined,
  BuildOutlined,
  CheckCircleOutlineOutlined,
  DeleteOutline,
  DrawOutlined,
  EmailOutlined,
  ErrorOutlineOutlined,
  ExpandMoreOutlined,
  FileDownloadOutlined,
  GridOnOutlined,
  HistoryOutlined,
  LocalShippingOutlined,
  MoveToInboxOutlined,
  InventoryOutlined,
  OpenInNewOutlined,
  PendingActionsOutlined,
  PictureAsPdfOutlined,
  RefreshOutlined,
  SendOutlined,
  SettingsOutlined,
} from "@mui/icons-material";
import { useAppSelector } from "../../store/hooks";
import { projectContactService } from "../../services/projectContactService";
import { projectAssetService } from "../../services/projectAssetService";
import { assetWorkflowRunService } from "../../services/assetWorkflowRunService";
import { quickbaseService } from "../../services/quickbaseService";
import { brandSettingsService } from "../../services/brandSettingsService";
import { customerService } from "../../services/customerService";
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
import { mergeRunRecord } from "../../types/assetWorkflowRunSummary";
import type { BomActualItem } from "../../types/workflow";
import {
  exportBomPdf,
  exportBomExcel,
  exportBomCsv,
  type BomExportRow,
  type BomCaptureDetail,
  type MissingBomAsset,
  type BomExportData,
} from "../../utils/generateBomReport";
import {
  generateProjectReport,
  type ProjectReportData,
} from "../../utils/generateProjectReport";
import { formatInstant } from "../../utils/datetime";
import { resolveImageToDataUrl } from "../../utils/generateWorkflowReport";
import { signatureService } from "../../services/signatureService";
import type { SignatureToken } from "../../types/signature";
import ClosedSignedAssetsDialog from "./ClosedSignedAssetsDialog";

// ─── helpers ──────────────────────────────────────────────────────────────────

const SIGN_METHODS: { value: SignMethod; label: string }[] = [
  { value: "email", label: "Email link" },
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

interface Props {
  projectId: string;
  productId?: string;
  projectJobNumber?: string;
  projectCustomer?: string;
  projectSite?: string;
  projectManager?: string;
  projectStatus?: string;
  projectStartDate?: string;
  projectFinishDate?: string;
  projectDescription?: string;
  projectCustomerId?: string;
  projectTimeZoneId?: string;
}
type TabId = "contacts" | "installations" | "goodsMovements" | "inbound" | "bom" | "history";

export default function ProjectChevronPanel({
  projectId,
  productId,
  projectJobNumber = "",
  projectCustomer = "",
  projectSite = "",
  projectManager = "",
  projectStatus = "",
  projectStartDate = "",
  projectFinishDate = "",
  projectDescription = "",
  projectCustomerId,
  projectTimeZoneId,
}: Props) {
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
  const [contactSaved,     setContactSaved]     = useState(false);

  // ── Signature Tokens (send + track customer signature requests) ────────────
  const [sigTokens,        setSigTokens]        = useState<Record<string, SignatureToken[]>>({});
  const [sigTokenLoading,  setSigTokenLoading]  = useState<string | null>(null);
  const [sigSendRunId,     setSigSendRunId]     = useState<string | null>(null);
  const [sigRecipEmail,    setSigRecipEmail]    = useState("");
  const [sigRecipName,     setSigRecipName]     = useState("");
  const [sigMessage,       setSigMessage]       = useState("");
  const [sigSending,       setSigSending]       = useState(false);

  const loadTokensForRun = useCallback(async (runId: string) => {
    setSigTokenLoading(runId);
    try {
      const tokens = await signatureService.listTokens(runId);
      setSigTokens(prev => ({ ...prev, [runId]: tokens }));
    } catch { /* ignore */ }
    finally { setSigTokenLoading(null); }
  }, []);

  const handleSendSignatureRequest = async () => {
    if (!sigSendRunId || !sigRecipEmail.trim()) return;
    setSigSending(true);
    try {
      await signatureService.createToken({
        runId:          sigSendRunId,
        recipientEmail: sigRecipEmail.trim(),
        recipientName:  sigRecipName.trim() || undefined,
        expiresInHours: 72,
        customMessage:  sigMessage.trim() || undefined,
      });
      await loadTokensForRun(sigSendRunId);
      setSigSendRunId(null);
      setSigRecipEmail("");
      setSigRecipName("");
      setSigMessage("");
    } catch { /* ignore */ }
    finally { setSigSending(false); }
  };

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
  const fullRunsLoadedRef = useRef(false);
  const fullRunsLoadingRef = useRef<Promise<void> | null>(null);

  const collapseNewestRunPerAsset = useCallback((runs: AssetWorkflowRun[]) => {
    const newestByAsset = new Map<string, AssetWorkflowRun>();
    for (const r of runs) {
      const cur = newestByAsset.get(r.assetId);
      if (!cur || new Date(r.startedAt).getTime() > new Date(cur.startedAt).getTime()) {
        newestByAsset.set(r.assetId, r);
      }
    }
    return [...newestByAsset.values()];
  }, []);

  const ensureFullRunDetails = useCallback(async () => {
    if (fullRunsLoadedRef.current || installAssets.length === 0) return;
    if (fullRunsLoadingRef.current) return fullRunsLoadingRef.current;
    fullRunsLoadingRef.current = (async () => {
      try {
        const assetIds = installAssets.map((a) => a.id);
        if (assetIds.length === 0) return;
        const full = await assetWorkflowRunService.loadRunDetailsForAssets(projectId, assetIds);
        setLatestRuns((prev) => {
          const byId = new Map(prev.map((run) => [run.id, run]));
          for (const run of full) {
            byId.set(run.id, mergeRunRecord(byId.get(run.id), run));
          }
          return collapseNewestRunPerAsset([...byId.values()]);
        });
        fullRunsLoadedRef.current = true;
      } finally {
        fullRunsLoadingRef.current = null;
      }
    })();
    return fullRunsLoadingRef.current;
  }, [collapseNewestRunPerAsset, installAssets, projectId]);

  const runByAsset = useMemo(() => {
    // Group all runs by assetId, then pick the most relevant one per asset.
    // Priority: locked+pending-signature > any locked > first available.
    // Prevents assets with multiple workflow configs from silently dropping a pending run.
    const groups = new Map<string, AssetWorkflowRun[]>();
    for (const r of latestRuns) {
      const arr = groups.get(r.assetId) ?? [];
      arr.push(r);
      groups.set(r.assetId, arr);
    }
    const result = new Map<string, AssetWorkflowRun>();
    groups.forEach((arr, assetId) => {
      const best =
        arr.find(r => r.isLocked && !r.customerSignedAt && r.signatureStatus !== "WaivedCustomer") ??
        arr.find(r => r.isLocked) ??
        arr[0];
      if (best) result.set(assetId, best);
    });
    return result;
  }, [latestRuns]);

  // Aggregate BOM across all latest runs for this project → BomExportRow[]
  const bomSummary = useMemo((): BomExportRow[] => {
    const map: Record<string, BomExportRow> = {};
    for (const run of latestRuns) {
      if (!run.bomActualJson || run.bomActualJson === "[]") continue;
      let items: BomActualItem[] = [];
      try { items = JSON.parse(run.bomActualJson) as BomActualItem[]; } catch { continue; }
      const asset = installAssets.find(a => a.id === run.assetId);
      for (const item of items) {
        if (!map[item.description]) {
          map[item.description] = {
            description: item.description,
            isInventory: item.isInventory,
            unitOfMeasure: item.unitOfMeasure,
            totalExpected: 0,
            totalActual: 0,
            captures: [],
          };
        }
        map[item.description].totalExpected += item.expectedQty;
        map[item.description].totalActual   += item.actualQty;
        if (item.isInventory) {
          (item.unitCaptures ?? []).forEach((fields, i) => {
            if (Object.values(fields).some(Boolean)) {
              const cap: BomCaptureDetail = {
                assetTag:      asset?.assetTag ?? run.assetId,
                assetLocation: asset?.location ?? "",
                unitIdx:       i + 1,
                fields,
                installedBy:  run.completedByName ?? "",
                installedAt:  run.completedAt    ?? "",
              };
              map[item.description].captures.push(cap);
            }
          });
        }
      }
    }
    return Object.values(map).sort((a, b) => a.description.localeCompare(b.description));
  }, [latestRuns, installAssets]);

  // Assets with completed runs but no BOM recorded
  const missingBomAssets = useMemo((): MissingBomAsset[] => {
    return installAssets
      .filter(a => {
        const run = latestRuns.find(r => r.assetId === a.id);
        return run && run.isLocked && !run.bomActualJson;
      })
      .map(a => ({
        assetTag: a.assetTag,
        location: a.location ?? "",
        status:   a.status,
      }));
  }, [latestRuns, installAssets]);

  // ── Export state ───────────────────────────────────────────────────────────
  const [pdfLogoOpen,      setPdfLogoOpen]      = useState(false);
  const [includeLogo,      setIncludeLogo]       = useState(true);
  const [exportingPdf,     setExportingPdf]      = useState(false);
  const [reportLogoOpen, setReportLogoOpen] = useState(false);
  const [reportLogo, setReportLogo] = useState(true);
  const [reportCustomerLogo, setReportCustomerLogo] = useState(true);
  const [signedAssetsOpen, setSignedAssetsOpen] = useState(false);
  const [exportingReport, setExportingReport] = useState(false);

  const buildExportData = async (withLogo: boolean): Promise<BomExportData> => {
    await ensureFullRunDetails();
    let logoBase64: string | null = null;
    if (withLogo) {
      try { logoBase64 = (await brandSettingsService.get()).logoBase64 ?? null; } catch { /* ignore */ }
    }
    return {
      projectJobNumber:   projectJobNumber,
      projectCustomer:    projectCustomer,
      projectSite:        projectSite,
      projectManager:     projectManager,
      exportDate:         formatInstant(new Date().toISOString(), projectTimeZoneId, { time: false, withZone: false }),
      totalAssets:        installAssets.length,
      assetsWithBom:      latestRuns.filter(r => r.isLocked && r.bomActualJson && r.bomActualJson !== "[]").length,
      rows:               bomSummary,
      missingBomAssets,
      businessLogoBase64: logoBase64,
      projectTimeZoneId,
    };
  };

  const handleGenerateProjectReport = async (withBusinessLogo: boolean, withCustomerLogo: boolean) => {
    setExportingReport(true);
    try {
      await ensureFullRunDetails();

      let businessLogoBase64: string | null = null;
      let customerLogoBase64: string | null = null;

      if (withBusinessLogo) {
        try {
          const brand = await brandSettingsService.get();
          businessLogoBase64 = brand.logoBase64 ? await resolveImageToDataUrl(brand.logoBase64) : null;
        } catch {
          businessLogoBase64 = null;
        }
      }

      if (withCustomerLogo && projectCustomerId) {
        try {
          const customers = await customerService.getCustomers();
          const rawLogo = customers.find((customer) => customer.customerId === projectCustomerId || customer.id === projectCustomerId)?.logo ?? null;
          customerLogoBase64 = rawLogo ? await resolveImageToDataUrl(rawLogo) : null;
        } catch {
          customerLogoBase64 = null;
        }
      }

      const data: ProjectReportData = {
        jobNumber: projectJobNumber,
        customerName: projectCustomer,
        siteName: projectSite,
        projectManager,
        status: projectStatus,
        startDate: projectStartDate,
        finishDate: projectFinishDate,
        description: projectDescription,
        assets: installAssets,
        latestRuns,
        bomRows: bomSummary,
        missingBomAssets,
        businessLogoBase64,
        customerLogoBase64,
        exportDate: formatInstant(new Date().toISOString(), projectTimeZoneId, { time: false, withZone: false }),
        projectTimeZoneId,
      };
      await generateProjectReport(data);
    } finally {
      setExportingReport(false);
      setReportLogoOpen(false);
    }
  };
  const handleExportCsv = async () => {
    exportBomCsv(await buildExportData(false));
  };

  const handleExportExcel = async () => {
    exportBomExcel(await buildExportData(false));
  };

  const handleExportPdfConfirm = async () => {
    setExportingPdf(true);
    try {
      await exportBomPdf(await buildExportData(includeLogo));
    } finally {
      setExportingPdf(false);
      setPdfLogoOpen(false);
    }
  };

  const loadInstallAssets = useCallback(async () => {
    setInstallAssetsLoading(true);
    fullRunsLoadedRef.current = false;
    fullRunsLoadingRef.current = null;
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
      setLatestRuns(collapseNewestRunPerAsset(runs));
    } catch { /* silently fail */ }
    finally { setInstallAssetsLoading(false); }
  }, [collapseNewestRunPerAsset, projectId, productId]);

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

  // ── Eager load on mount (health bar always needs this data) ───────────────
  useEffect(() => { loadInstallAssets(); }, [loadInstallAssets]);

  // ── Lazy load per tab ──────────────────────────────────────────────────────
  useEffect(() => {
    if (tab === "contacts" && contacts.length === 0 && !contactsLoading) loadContacts();
    if ((tab === "goodsMovements" || tab === "inbound") && !qbLoaded && !qbLoading) syncQb();
    if (tab === "inbound" && inbounds.length === 0 && !inboundsLoading) loadInbounds();
    if ((tab === "bom" || tab === "history") && installAssets.length > 0) void ensureFullRunDetails();
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
      // Confirm the write landed. Without this the button snaps straight back to
      // "Save changes" and the user cannot tell whether anything happened.
      setContactSaved(true);
    } finally { setContactSaving(false); }
  };

  // Clear the "Saved" confirmation after a beat, or as soon as the user edits again.
  useEffect(() => {
    if (!contactSaved) return;
    const timer = setTimeout(() => setContactSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [contactSaved]);

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
  const setCF = (f: keyof ContactFormState, v: unknown) => {
    setContactSaved(false); // editing again invalidates the "Saved" confirmation
    setContactForm(p => ({ ...p, [f]: v }));
  };
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

  // ── Health KPIs (computed from eagerly-loaded data) ────────────────────────
  const healthKpis = useMemo(() => {
    const total    = installAssets.length;
    const complete = installAssets.filter(a => a.status === "Complete").length;
    const pct      = total > 0 ? Math.round((complete / total) * 100) : 0;
    const paused   = installAssets.filter(a => a.workflowSummary?.latestRunStatus === "Paused").length;
    const missingEvidence = installAssets.filter(a => (a.workflowSummary?.missingItems ?? 0) > 0).length;

    let blocking = 0;
    for (const run of latestRuns) {
      try {
        const iss = JSON.parse(run.issuesJson || "[]") as Array<{ resolved: boolean; isBlocking: boolean }>;
        blocking += iss.filter(i => !i.resolved && i.isBlocking).length;
      } catch { /* skip */ }
    }

    const pendingSig = latestRuns.filter(
      r => r.isLocked && !r.customerSignedAt && r.signatureStatus !== "WaivedCustomer"
    ).length;

    const locked   = latestRuns.filter(r => r.isLocked).length;
    const bomDone  = latestRuns.filter(r => r.isLocked && r.bomActualJson).length;

    return { total, complete, pct, blocking, pendingSig, locked, bomDone, paused, missingEvidence };
  }, [installAssets, latestRuns]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Box sx={{
      p: 1.5, background: "rgba(0,0,0,0.18)", borderRadius: 1,
      maxWidth: PANEL_MAX_W, minWidth: 0, overflow: "hidden", boxSizing: "border-box"
    }}>

      {/* ── Project Health Bar ─────────────────────────────────────────────── */}
      {installAssets.length > 0 && (
        <Stack
          direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap
          sx={{ mb: 1.5, pb: 1.5, borderBottom: "1px solid", borderColor: "divider" }}
        >
          {/* Completion */}
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <CheckCircleOutlineOutlined sx={{ fontSize: 14, color: healthKpis.pct === 100 ? "success.main" : "text.secondary" }} />
            <Typography variant="caption" fontWeight={700} color={healthKpis.pct === 100 ? "success.main" : "text.primary"}>
              {healthKpis.complete}/{healthKpis.total}
            </Typography>
            <Typography variant="caption" color="text.secondary">complete ({healthKpis.pct}%)</Typography>
          </Stack>

          {/* Blocking issues */}
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <ErrorOutlineOutlined sx={{ fontSize: 14, color: healthKpis.blocking > 0 ? "error.main" : "success.main" }} />
            <Typography variant="caption" fontWeight={700} color={healthKpis.blocking > 0 ? "error.main" : "text.secondary"}>
              {healthKpis.blocking}
            </Typography>
            <Typography variant="caption" color="text.secondary">blocking</Typography>
          </Stack>

          {/* Pending signatures */}
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <PendingActionsOutlined sx={{ fontSize: 14, color: healthKpis.pendingSig > 0 ? "warning.main" : "text.secondary" }} />
            <Typography variant="caption" fontWeight={700} color={healthKpis.pendingSig > 0 ? "warning.main" : "text.secondary"}>
              {healthKpis.pendingSig}
            </Typography>
            <Typography variant="caption" color="text.secondary">pending sig</Typography>
          </Stack>

          <Stack direction="row" alignItems="center" spacing={0.5}>
            <BuildOutlined sx={{ fontSize: 14, color: healthKpis.paused > 0 ? "warning.main" : "text.secondary" }} />
            <Typography variant="caption" fontWeight={700} color={healthKpis.paused > 0 ? "warning.main" : "text.secondary"}>
              {healthKpis.paused}
            </Typography>
            <Typography variant="caption" color="text.secondary">paused</Typography>
          </Stack>

          <Stack direction="row" alignItems="center" spacing={0.5}>
            <ErrorOutlineOutlined sx={{ fontSize: 14, color: healthKpis.missingEvidence > 0 ? "warning.main" : "text.secondary" }} />
            <Typography variant="caption" fontWeight={700} color={healthKpis.missingEvidence > 0 ? "warning.main" : "text.secondary"}>
              {healthKpis.missingEvidence}
            </Typography>
            <Typography variant="caption" color="text.secondary">missing evidence</Typography>
          </Stack>

          {/* BOM */}
          {healthKpis.locked > 0 && (
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <InventoryOutlined sx={{ fontSize: 14, color: "text.secondary" }} />
              <Typography variant="caption" fontWeight={700}>
                {healthKpis.bomDone}/{healthKpis.locked}
              </Typography>
              <Typography variant="caption" color="text.secondary">BOM recorded</Typography>
            </Stack>
          )}

          <Box sx={{ flex: 1 }} />

                    {/* Project Report button */}
          <Tooltip title="Generate Project Completion Report (PDF)">
            <span>
              <Button
                size="small"
                variant="outlined"
                startIcon={exportingReport ? <CircularProgress size={12} /> : <AssessmentOutlined sx={{ fontSize: 14 }} />}
                disabled={exportingReport || installAssets.length === 0}
                onClick={() => setReportLogoOpen(true)}
                sx={{ fontSize: "0.72rem", py: 0.25, px: 1 }}
              >
                Project Report
              </Button>
            </span>
          </Tooltip>

          <Tooltip title="Save closed signed asset PDFs into the document library">
            <span>
              <Button
                size="small"
                variant="outlined"
                startIcon={<PictureAsPdfOutlined sx={{ fontSize: 14 }} />}
                disabled={installAssets.length === 0}
                onClick={() => setSignedAssetsOpen(true)}
                sx={{ fontSize: "0.72rem", py: 0.25, px: 1 }}
              >
                Closed & Signed Assets
              </Button>
            </span>
          </Tooltip>
        </Stack>
      )}

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
          label={`Assets${installAssets.length ? ` (${installAssets.length})` : ""}`} />
        <Tab value="goodsMovements" icon={<LocalShippingOutlined sx={{ fontSize: 15 }} />} iconPosition="start"
          label={`Dispatched${despatched.length ? ` (${despatched.length})` : ""}`} />
        <Tab value="inbound" icon={<MoveToInboxOutlined sx={{ fontSize: 15 }} />} iconPosition="start"
          label={`Inbound${received.length ? ` (${received.length})` : ""}`} />
        <Tab value="bom" icon={<InventoryOutlined sx={{ fontSize: 15 }} />} iconPosition="start"
          label={`Parts${bomSummary.length ? ` (${bomSummary.length})` : ""}`} />
        <Tab value="history" icon={<HistoryOutlined sx={{ fontSize: 15 }} />} iconPosition="start"
          label="History" />
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
                Assets
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
                  const isPaused = a.workflowSummary?.latestRunStatus === "Paused";
                  const stepSummary = a.workflowSummary?.requiredItems
                    ? `${a.workflowSummary.completedItems}/${a.workflowSummary.requiredItems} captured`
                    : run?.stepResultsJson
                      ? `${(() => { try { return (JSON.parse(run.stepResultsJson || "[]") as Array<unknown>).length; } catch { return 0; } })()} steps`
                      : "";
                  const missingSummary = (a.workflowSummary?.missingItems ?? 0) > 0
                    ? `${a.workflowSummary?.missingItems} missing`
                    : "";
                  const awaitingSignature = a.status === "Complete" && !!run
                    && run.isLocked && !run.customerSignedAt && run.signatureStatus !== "WaivedCustomer";
                  const statusColor: "error" | "warning" | "success" | "primary" | "default" =
                    hasHigh            ? "error"   :
                    isPaused           ? "warning" :
                    hasMedium          ? "warning" :
                    awaitingSignature  ? "warning" :
                    a.status === "Complete"   ? "success" :
                    a.status === "InProgress" ? "primary" :
                    a.status === "Issue"      ? "error"   : "default";
                  const statusLabel =
                    awaitingSignature && !hasHigh && !hasMedium ? "Awaiting Signature" :
                    isPaused                 ? "Paused"     :
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
                        <Stack spacing={0.25} alignItems="flex-start">
                          <Chip
                            label={statusLabel}
                            size="small"
                            color={statusColor}
                            variant="outlined"
                            sx={{ height: 18, fontSize: "0.65rem" }}
                          />
                          {(stepSummary || missingSummary) && (
                            <Typography variant="caption" color={missingSummary ? "warning.main" : "text.secondary"} sx={{ fontSize: "0.62rem", lineHeight: 1.2 }}>
                              {[stepSummary, missingSummary].filter(Boolean).join(" · ")}
                            </Typography>
                          )}
                        </Stack>
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
                InputLabelProps={{ shrink: true }}
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
                  color={contactSaved ? "success" : "primary"}
                  startIcon={contactSaved ? <CheckCircleOutlineOutlined sx={{ fontSize: 15 }} /> : undefined}
                  disabled={contactSaving || !contactForm.name.trim()}
                  onClick={savePrimaryContact}>
                  {contactSaving ? <CircularProgress size={14} />
                    : contactSaved ? "Saved"
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

              {/* ── Signature Requests ──────────────────────────────────────── */}
              {latestRuns.filter(r => r.isLocked && r.signatureStatus === "PendingCustomer").length > 0 && (
                <>
                  <Divider sx={{ my: 0.5 }}>
                    <Typography variant="caption" color="warning.main" fontWeight={700}>
                      Pending Customer Signatures
                    </Typography>
                  </Divider>
                  {latestRuns
                    .filter(r => r.isLocked && r.signatureStatus === "PendingCustomer")
                    .map(run => {
                      const asset  = installAssets.find(a => a.id === run.assetId);
                      const tokens = sigTokens[run.id] ?? [];
                      const latest = tokens[0];
                      return (
                        <Box key={run.id} sx={{
                          px: 1.25, py: 1, borderRadius: 1, border: "1px solid",
                          borderColor: "warning.main", background: "rgba(230,119,0,0.06)"
                        }}>
                          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                            <PendingActionsOutlined sx={{ fontSize: 14, color: "warning.main" }} />
                            <Typography variant="caption" fontWeight={700}>
                              {asset?.assetName ?? asset?.assetTag ?? run.assetId}
                            </Typography>
                            {latest && !latest.isRevoked && !latest.isExpired && (
                              <Chip label="Request sent" size="small" color="warning" variant="outlined"
                                sx={{ height: 16, fontSize: "0.6rem" }} />
                            )}
                            {latest?.isExpired && (
                              <Chip label="Expired" size="small" color="error" variant="outlined"
                                sx={{ height: 16, fontSize: "0.6rem" }} />
                            )}
                            <Box sx={{ flex: 1 }} />
                            {/* Load tokens on demand */}
                            {!(run.id in sigTokens) && (
                              <Tooltip title="Load token status">
                                <IconButton size="small" onClick={() => loadTokensForRun(run.id)}
                                  disabled={sigTokenLoading === run.id}>
                                  {sigTokenLoading === run.id
                                    ? <CircularProgress size={12} />
                                    : <RefreshOutlined sx={{ fontSize: 13 }} />}
                                </IconButton>
                              </Tooltip>
                            )}
                            <Tooltip title="Send / resend signature link">
                              <IconButton size="small" color="warning"
                                onClick={() => {
                                  setSigSendRunId(run.id);
                                  const primary = contacts.find(c => c.isPrimarySigner) ?? contacts[0];
                                  setSigRecipEmail(primary?.email ?? "");
                                  setSigRecipName(primary?.name ?? "");
                                  setSigMessage("");
                                }}>
                                <SendOutlined sx={{ fontSize: 13 }} />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                          {latest && (
                            <Typography variant="caption" color="text.disabled">
                              Last sent to {latest.recipientEmail}
                              {latest.usedAtUtc
                                ? ` · opened ${new Date(latest.usedAtUtc).toLocaleDateString()}`
                                : " · not yet opened"}
                            </Typography>
                          )}
                        </Box>
                      );
                    })}
                </>
              )}
            </Stack>
          )}
        </Box>
      )}

      {/* ── Send Signature Request dialog ─────────────────────────────────────── */}
      {sigSendRunId && (
        <Dialog open onClose={() => setSigSendRunId(null)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ fontSize: "0.95rem", pb: 1 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <SendOutlined sx={{ fontSize: 16 }} />
              <span>Send Signature Request</span>
            </Stack>
          </DialogTitle>
          <DialogContent>
            <Stack spacing={1.5} sx={{ pt: 0.5 }}>
              <TextField label="Recipient email *" size="small" fullWidth type="email"
                value={sigRecipEmail} onChange={e => setSigRecipEmail(e.target.value)} />
              <TextField label="Recipient name" size="small" fullWidth
                value={sigRecipName} onChange={e => setSigRecipName(e.target.value)} />
              <TextField label="Custom message (optional)" size="small" fullWidth multiline minRows={2}
                placeholder="Add a personal note to the email…"
                InputLabelProps={{ shrink: true }}
                value={sigMessage} onChange={e => setSigMessage(e.target.value)} />
              <Typography variant="caption" color="text.secondary">
                A secure signing link will be emailed to the recipient. Link expires in 72 hours.
              </Typography>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button size="small" onClick={() => setSigSendRunId(null)}>Cancel</Button>
            <Button
              size="small" variant="contained" color="warning"
              disabled={sigSending || !sigRecipEmail.trim()}
              startIcon={sigSending ? <CircularProgress size={12} /> : <SendOutlined sx={{ fontSize: 14 }} />}
              onClick={handleSendSignatureRequest}
            >
              {sigSending ? "Sending…" : "Send Link"}
            </Button>
          </DialogActions>
        </Dialog>
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
                      InputLabelProps={{ shrink: true }}
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

      {/* ── PARTS & MATERIALS ─────────────────────────────────────────────── */}
      {tab === "bom" && (
        <Box sx={{ maxHeight: "65vh", overflowY: "auto", pr: 0.5 }}>
          {/* toolbar */}
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
            <Typography variant="caption" color="text.secondary">
              Aggregated parts from all completed workflow runs in this project
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Tooltip title="Refresh">
              <IconButton size="small" onClick={loadInstallAssets} disabled={installAssetsLoading}>
                <RefreshOutlined sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Export CSV">
              <span>
                <IconButton size="small" onClick={handleExportCsv} disabled={bomSummary.length === 0}>
                  <FileDownloadOutlined sx={{ fontSize: 14 }} />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Export Excel">
              <span>
                <IconButton size="small" onClick={handleExportExcel} disabled={bomSummary.length === 0}>
                  <GridOnOutlined sx={{ fontSize: 14 }} />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Export PDF">
              <span>
                <IconButton size="small" onClick={() => setPdfLogoOpen(true)} disabled={bomSummary.length === 0}>
                  <PictureAsPdfOutlined sx={{ fontSize: 14 }} />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>

          {installAssetsLoading ? (
            <CircularProgress size={20} />
          ) : bomSummary.length === 0 ? (
            <Typography variant="caption" color="text.secondary">
              No parts recorded yet. Parts are captured when technicians complete workflow runs with BOM steps.
            </Typography>
          ) : (
            <>
              {/* Summary table */}
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "rgba(255,255,255,0.04)" }}>
                    <TableCell sx={{ fontSize: 11, py: 0.5, fontWeight: 700 }}>Item</TableCell>
                    <TableCell sx={{ fontSize: 11, py: 0.5, fontWeight: 700 }}>Type</TableCell>
                    <TableCell sx={{ fontSize: 11, py: 0.5, fontWeight: 700, textAlign: "center" }}>Expected</TableCell>
                    <TableCell sx={{ fontSize: 11, py: 0.5, fontWeight: 700, textAlign: "center" }}>Actual</TableCell>
                    <TableCell sx={{ fontSize: 11, py: 0.5, fontWeight: 700, textAlign: "center" }}>Variance</TableCell>
                    <TableCell sx={{ fontSize: 11, py: 0.5, fontWeight: 700 }}>Inventory Capture</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {bomSummary.map((row) => {
                    const diff = row.totalActual - row.totalExpected;
                    return (
                      <TableRow key={row.description} sx={{ verticalAlign: "top" }}>
                        <TableCell sx={{ fontSize: 12, py: 0.75 }}>{row.description}</TableCell>
                        <TableCell sx={{ fontSize: 11, py: 0.75 }}>
                          <Chip size="small" label={row.isInventory ? "Inventory" : "Consumable"}
                            color={row.isInventory ? "primary" : "default"} variant="outlined"
                            sx={{ fontSize: 10, height: 18 }} />
                        </TableCell>
                        <TableCell sx={{ fontSize: 12, py: 0.75, textAlign: "center" }}>
                          {row.totalExpected > 0 ? `${row.totalExpected} ${row.unitOfMeasure}` : "—"}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12, py: 0.75, fontWeight: 600, textAlign: "center" }}>
                          {row.totalActual} {row.unitOfMeasure}
                        </TableCell>
                        <TableCell sx={{
                          fontSize: 12, py: 0.75, fontWeight: 700, textAlign: "center",
                          color: diff === 0 ? "text.secondary" : diff > 0 ? "success.main" : "error.main"
                        }}>
                          {diff === 0 ? "—" : diff > 0 ? `+${diff}` : `${diff}`}
                        </TableCell>
                        <TableCell sx={{ fontSize: 11, py: 0.75 }}>
                          {row.captures.length === 0 ? (
                            <Typography variant="caption" color="text.disabled">—</Typography>
                          ) : (
                            <Stack spacing={0.75}>
                              {row.captures.map((cap, i) => (
                                <Box key={i} sx={{ pl: 0.5, borderLeft: "2px solid", borderColor: "divider" }}>
                                  <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                                    <Typography variant="caption" fontWeight={700} color="text.primary">
                                      {cap.assetTag}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      Unit {cap.unitIdx}
                                    </Typography>
                                    {cap.assetLocation && (
                                      <Typography variant="caption" color="text.disabled">· {cap.assetLocation}</Typography>
                                    )}
                                  </Stack>
                                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                                    {Object.entries(cap.fields).filter(([, v]) => v).map(([k, v]) => (
                                      <Typography key={k} variant="caption">
                                        <strong>{k}:</strong> {v}
                                      </Typography>
                                    ))}
                                  </Stack>
                                  {(cap.installedBy || cap.installedAt) && (
                                    <Typography variant="caption" color="text.disabled" sx={{ display: "block" }}>
                                      {cap.installedBy && `By ${cap.installedBy}`}
                                      {cap.installedAt && ` · ${new Date(cap.installedAt).toLocaleDateString()}`}
                                    </Typography>
                                  )}
                                </Box>
                              ))}
                            </Stack>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Missing BOM assets */}
              {missingBomAssets.length > 0 && (
                <>
                  <Divider sx={{ my: 1.5 }}>
                    <Typography variant="caption" color="error.main" fontWeight={700}>
                      BOM Not Recorded ({missingBomAssets.length})
                    </Typography>
                  </Divider>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: "rgba(211,47,47,0.06)" }}>
                        <TableCell sx={{ fontSize: 11, py: 0.4, fontWeight: 700 }}>Asset Tag</TableCell>
                        <TableCell sx={{ fontSize: 11, py: 0.4, fontWeight: 700 }}>Location</TableCell>
                        <TableCell sx={{ fontSize: 11, py: 0.4, fontWeight: 700 }}>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {missingBomAssets.map((a) => (
                        <TableRow key={a.assetTag}>
                          <TableCell sx={{ fontSize: 12, py: 0.5 }}>{a.assetTag}</TableCell>
                          <TableCell sx={{ fontSize: 12, py: 0.5, color: "text.secondary" }}>{a.location || "—"}</TableCell>
                          <TableCell sx={{ fontSize: 12, py: 0.5 }}>
                            <Chip size="small" label={a.status} color="warning" variant="outlined"
                              sx={{ fontSize: 10, height: 18 }} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </>
          )}
        </Box>
      )}

      {/* ── HISTORY ───────────────────────────────────────────────────────── */}
      {tab === "history" && (() => {
        type ActivityEvent = {
          key: string;
          ts: Date;
          icon: React.ReactNode;
          color: string;
          label: string;
          detail: string;
        };

        const events: ActivityEvent[] = [];
        for (const run of latestRuns) {
          const asset = installAssets.find(a => a.id === run.assetId);
          const name  = asset?.assetName ?? asset?.assetTag ?? run.assetId;
          if (run.startedAt) events.push({
            key: `${run.id}-start`, ts: new Date(run.startedAt),
            icon: <BuildOutlined sx={{ fontSize: 14 }} />, color: "primary.main",
            label: `Run started — ${name}`,
            detail: run.completedByName ? `by ${run.completedByName}` : "",
          });
          if (run.completedAt) events.push({
            key: `${run.id}-complete`, ts: new Date(run.completedAt),
            icon: <CheckCircleOutlineOutlined sx={{ fontSize: 14 }} />, color: "success.main",
            label: `Run completed — ${name}`,
            detail: run.completedByName ? `by ${run.completedByName}` : "",
          });
          if (run.installerSignedAt) events.push({
            key: `${run.id}-inst-sign`, ts: new Date(run.installerSignedAt),
            icon: <DrawOutlined sx={{ fontSize: 14 }} />, color: "info.main",
            label: `Installer signed off — ${name}`,
            detail: run.completedByName ?? "",
          });
          if (run.customerSignedAt) events.push({
            key: `${run.id}-cust-sign`, ts: new Date(run.customerSignedAt),
            icon: <CheckCircleOutlineOutlined sx={{ fontSize: 14 }} />, color: "success.main",
            label: `Customer signed off — ${name}`,
            detail: "",
          });
          try {
            const issues = JSON.parse(run.issuesJson || "[]") as Array<{
              id: string; description: string; reportedAt: string; isBlocking: boolean; severity: string;
            }>;
            for (const iss of issues) {
              if (!iss.reportedAt) continue;
              events.push({
                key: `${run.id}-iss-${iss.id}`, ts: new Date(iss.reportedAt),
                icon: <ErrorOutlineOutlined sx={{ fontSize: 14 }} />,
                color: iss.isBlocking ? "error.main" : iss.severity === "high" ? "warning.main" : "text.secondary",
                label: `${iss.isBlocking ? "Blocking issue" : "Issue"} flagged — ${name}`,
                detail: iss.description.slice(0, 80),
              });
            }
          } catch { /* skip */ }
        }
        events.sort((a, b) => b.ts.getTime() - a.ts.getTime());

        // Time analytics — runs with any time tracked
        const runsWithTime = latestRuns.filter(r => r.productiveSeconds > 0 || r.downtimeSeconds > 0);
        const totalProd = runsWithTime.reduce((s, r) => s + r.productiveSeconds, 0);
        const totalDown = runsWithTime.reduce((s, r) => s + r.downtimeSeconds, 0);
        const totalAll  = totalProd + totalDown;

        const fmtSecs = (s: number) => {
          if (s <= 0) return "0m";
          const h = Math.floor(s / 3600);
          const m = Math.floor((s % 3600) / 60);
          return h > 0 ? `${h}h ${m}m` : `${m}m`;
        };

        return (
          <Box sx={{ maxHeight: "65vh", overflowY: "auto", pr: 0.5 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Project activity — newest first
              </Typography>
              <Box sx={{ flex: 1 }} />
              <Tooltip title="Refresh">
                <IconButton size="small" onClick={loadInstallAssets} disabled={installAssetsLoading}>
                  <RefreshOutlined sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            </Stack>
            {installAssetsLoading ? <CircularProgress size={20} sx={{ display: "block", mx: "auto", mt: 4 }} /> : (
              <>
                {events.length === 0 ? (
                  <Typography variant="caption" color="text.disabled">No activity recorded yet.</Typography>
                ) : (
                  <Stack spacing={0}>
                    {events.map((ev, idx) => (
                      <Stack key={ev.key} direction="row" spacing={1.25} alignItems="flex-start">
                        <Stack alignItems="center" sx={{ pt: 0.75 }}>
                          <Box sx={{ color: ev.color, display: "flex" }}>{ev.icon}</Box>
                          {idx < events.length - 1 && (
                            <Box sx={{ width: 1, flex: 1, minHeight: 16, background: "rgba(255,255,255,0.08)", my: 0.25 }} />
                          )}
                        </Stack>
                        <Stack sx={{ pb: 1.5, flex: 1, minWidth: 0 }}>
                          <Stack direction="row" spacing={1} alignItems="baseline">
                            <Typography variant="caption" fontWeight={600} sx={{ color: ev.color }}>{ev.label}</Typography>
                            <Typography variant="caption" color="text.disabled" noWrap sx={{ flexShrink: 0 }}>
                              {ev.ts.toLocaleDateString()} {ev.ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </Typography>
                          </Stack>
                          {ev.detail && (
                            <Typography variant="caption" color="text.secondary">{ev.detail}</Typography>
                          )}
                        </Stack>
                      </Stack>
                    ))}
                  </Stack>
                )}

                {/* ── Time Analytics ── */}
                {runsWithTime.length > 0 && (
                  <>
                    <Divider sx={{ my: 1.5 }}>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>Time Analytics</Typography>
                    </Divider>

                    {/* Summary KPIs */}
                    <Stack direction="row" spacing={2} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
                      <Box>
                        <Typography variant="caption" color="text.disabled" display="block">Productive</Typography>
                        <Typography variant="body2" fontWeight={700} color="success.main">{fmtSecs(totalProd)}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.disabled" display="block">Downtime</Typography>
                        <Typography variant="body2" fontWeight={700} color="warning.main">{fmtSecs(totalDown)}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.disabled" display="block">Efficiency</Typography>
                        <Typography variant="body2" fontWeight={700}>
                          {totalAll > 0 ? `${Math.round((totalProd / totalAll) * 100)}%` : "—"}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.disabled" display="block">Runs tracked</Typography>
                        <Typography variant="body2" fontWeight={700}>{runsWithTime.length}</Typography>
                      </Box>
                    </Stack>

                    {/* Per-run stacked bars */}
                    <Stack spacing={0.75}>
                      {runsWithTime.map(run => {
                        const asset   = installAssets.find(a => a.id === run.assetId);
                        const name    = asset?.assetName ?? asset?.assetTag ?? run.assetId;
                        const total   = run.productiveSeconds + run.downtimeSeconds;
                        const prodPct = total > 0 ? (run.productiveSeconds / total) * 100 : 0;
                        const downPct = total > 0 ? (run.downtimeSeconds  / total) * 100 : 0;
                        return (
                          <Box key={run.id}>
                            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
                              <Typography variant="caption" noWrap sx={{ maxWidth: "60%" }}>{name}</Typography>
                              <Typography variant="caption" color="text.disabled">{fmtSecs(total)} total</Typography>
                            </Stack>
                            <Box sx={{ display: "flex", height: 10, borderRadius: 1, overflow: "hidden", background: "rgba(255,255,255,0.06)" }}>
                              {prodPct > 0 && (
                                <Tooltip title={`Productive: ${fmtSecs(run.productiveSeconds)}`}>
                                  <Box sx={{ width: `${prodPct}%`, background: "rgba(45,212,191,0.7)", transition: "width 0.4s" }} />
                                </Tooltip>
                              )}
                              {downPct > 0 && (
                                <Tooltip title={`Downtime: ${fmtSecs(run.downtimeSeconds)} (${run.downtimeEvents} event${run.downtimeEvents !== 1 ? "s" : ""})`}>
                                  <Box sx={{ width: `${downPct}%`, background: "rgba(255,152,0,0.7)", transition: "width 0.4s" }} />
                                </Tooltip>
                              )}
                            </Box>
                          </Box>
                        );
                      })}
                    </Stack>

                    {/* Legend */}
                    <Stack direction="row" spacing={1.5} sx={{ mt: 1 }}>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Box sx={{ width: 10, height: 10, borderRadius: 0.5, background: "rgba(45,212,191,0.7)" }} />
                        <Typography variant="caption" color="text.secondary">Productive</Typography>
                      </Stack>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Box sx={{ width: 10, height: 10, borderRadius: 0.5, background: "rgba(255,152,0,0.7)" }} />
                        <Typography variant="caption" color="text.secondary">Downtime</Typography>
                      </Stack>
                    </Stack>
                  </>
                )}
              </>
            )}
          </Box>
        );
      })()}

      {/* ── Project Report dialog ──────────────────────────────────────────── */}
            <Dialog open={reportLogoOpen} onClose={() => setReportLogoOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: "0.95rem", pb: 1 }}>Project Completion Report</DialogTitle>
        <DialogContent>
          <FormControlLabel
            control={<Checkbox checked={reportLogo} onChange={e => setReportLogo(e.target.checked)} size="small" />}
            label={<Typography variant="body2">Include business logo in header</Typography>}
          />
          <FormControlLabel
            control={<Checkbox checked={reportCustomerLogo} onChange={e => setReportCustomerLogo(e.target.checked)} size="small" />}
            label={<Typography variant="body2">Include customer logo in header</Typography>}
          />
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            Includes project details, health summary, issues, time tracking, BOM, assets, and signature status.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => setReportLogoOpen(false)}>Cancel</Button>
          <Button
            size="small"
            variant="contained"
            disabled={exportingReport}
            startIcon={exportingReport ? <CircularProgress size={12} /> : <AssessmentOutlined sx={{ fontSize: 14 }} />}
            onClick={() => handleGenerateProjectReport(reportLogo, reportCustomerLogo)}
          >
            {exportingReport ? "Generating..." : "Generate PDF"}
          </Button>
        </DialogActions>
      </Dialog>

      <ClosedSignedAssetsDialog
        open={signedAssetsOpen}
        onClose={() => setSignedAssetsOpen(false)}
        projectId={projectId}
        projectJobNumber={projectJobNumber}
        projectCustomer={projectCustomer}
        projectSite={projectSite}
        projectCustomerId={projectCustomerId}
        projectTimeZoneId={projectTimeZoneId}
        assets={installAssets}
        latestRuns={latestRuns}
        users={users}
      />

      {/* ── PDF logo dialog ────────────────────────────────────────────────── */}
      <Dialog open={pdfLogoOpen} onClose={() => setPdfLogoOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: "0.95rem", pb: 1 }}>Export BOM as PDF</DialogTitle>
        <DialogContent>
          <FormControlLabel
            control={
              <Checkbox
                checked={includeLogo}
                onChange={e => setIncludeLogo(e.target.checked)}
                size="small"
              />
            }
            label={<Typography variant="body2">Include business logo in header</Typography>}
          />
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            Logo is configured in Settings → Brand.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => setPdfLogoOpen(false)}>Cancel</Button>
          <Button
            size="small" variant="contained"
            disabled={exportingPdf}
            startIcon={exportingPdf ? <CircularProgress size={12} /> : <PictureAsPdfOutlined sx={{ fontSize: 14 }} />}
            onClick={handleExportPdfConfirm}
          >
            {exportingPdf ? "Generating…" : "Export PDF"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}





