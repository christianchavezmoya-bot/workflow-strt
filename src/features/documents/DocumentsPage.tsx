import { useEffect, useMemo, useRef, useState } from "react";
import { useServerRecovery } from "../../hooks/useServerRecovery";
import {
  AddOutlined,
  ArrowDropDown,
  AttachFileOutlined,
  DeleteOutline,
  DragIndicatorOutlined,
  DownloadOutlined,
  EditOutlined,
  FolderOutlined,
  LinkOutlined,
  RefreshOutlined,
  SearchOutlined,
  SettingsOutlined,
  UploadFileOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
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
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import MobileDocumentPreviewDialog from "../../components/ui/MobileDocumentPreviewDialog";
import { documentService, type DocumentRecord } from "../../services/documentService";
import QRUploadButton from "../../components/QRUploadButton";
import { productService } from "../../services/productService";
import { projectService } from "../../services/projectService";
import { customerService } from "../../services/customerService";
import { useAuth } from "../../hooks/useAuth";
import { usePermissions } from "../../hooks/usePermissions";
import { useComplexView } from "../../contexts/ComplexViewContext";
import { isDesktopLikePlatform } from "../../utils/platform";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

interface DocTab {
  id: string;
  label: string;
  color: "default" | "primary" | "success" | "warning" | "error" | "info" | "secondary";
}

interface CustomField {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "relation";
  options?: string[];
  /** For type === "relation" — which entity table to pull values from */
  relatesTo?: "products" | "projects" | "customers";
}

interface BulkFile {
  id: string;
  file: File;
  name: string;
}

interface DocForm {
  name: string;
  type: string;
  linkedTo: string;
  notes: string;
  mode: "url" | "upload";
  url: string;
  files: BulkFile[];
  customValues: Record<string, string>;
}

// ------------------------------------------------------------------
// Constants & helpers
// ------------------------------------------------------------------

const LS_TABS_KEY   = "doc_tabs_config_v1";
const LS_FIELDS_KEY = "doc_custom_fields_v1";

const DEFAULT_TABS: DocTab[] = [
  { id: "all",         label: "All",               color: "default"   },
  { id: "technical",   label: "Technical",          color: "primary"   },
  { id: "drawings",    label: "Drawings",           color: "secondary" },
  { id: "procedures",  label: "Procedures",         color: "info"      },
  { id: "atw",         label: "Authority to Work",  color: "error"     },
  { id: "bulletins",   label: "Tech Bulletins",     color: "warning"   },
  { id: "informative", label: "Informative",        color: "default"   },
];

const TAB_COLOR_OPTIONS: DocTab["color"][] = [
  "default", "primary", "secondary", "info", "success", "warning", "error",
];

const RELATION_TARGETS: { value: CustomField["relatesTo"]; label: string }[] = [
  { value: "products",  label: "Products"  },
  { value: "projects",  label: "Projects"  },
  { value: "customers", label: "Customers" },
];

function lsGet<T>(key: string, fallback: T): T {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch { return fallback; }
}
function lsSet(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const BUILTIN_COL_IDS = ["name", "category", "linkedTo", "size", "dateCreated", "createdBy"] as const;
type BuiltinColId = typeof BUILTIN_COL_IDS[number];
type DocumentSortKey = "name" | "category" | "linkedTo" | "size" | "dateCreated" | "createdBy";
const BUILTIN_COL_LABELS: Record<BuiltinColId, string> = {
  name: "Name", category: "Category", linkedTo: "Linked To",
  size: "Size", dateCreated: "Date Created", createdBy: "Created By",
};

const MIME_TO_EXT: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "application/zip": ".zip",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
};

/** Append a file extension based on MIME type if the name has none (covers legacy records). */
function addExtIfMissing(name: string, contentType?: string | null): string {
  if (!name || /\.[a-zA-Z0-9]+$/.test(name)) return name;
  const ext = contentType ? MIME_TO_EXT[contentType] : undefined;
  return ext ? name + ext : name;
}

function parseFieldsJson(json: string): { customFields: CustomField[]; columnOrder: string[] } {
  try {
    const raw = JSON.parse(json);
    if (Array.isArray(raw)) {
      // Old format: just CustomField[]
      const fields = raw as CustomField[];
      return { customFields: fields, columnOrder: [...BUILTIN_COL_IDS, ...fields.map((f) => f.id)] };
    }
    // New format: { customFields, columnOrder }
    const { customFields = [], columnOrder } = raw as { customFields: CustomField[]; columnOrder?: string[] };
    const cfSet = new Set(customFields.map((f) => f.id));
    const base: string[] = columnOrder?.length ? columnOrder : [...BUILTIN_COL_IDS];
    // Append any custom fields not yet in the order
    const full = [...base, ...customFields.filter((f) => !base.includes(f.id)).map((f) => f.id)];
    // Remove stale IDs
    const filtered = full.filter((id) => (BUILTIN_COL_IDS as readonly string[]).includes(id) || cfSet.has(id));
    return { customFields, columnOrder: filtered };
  } catch {
    return { customFields: [], columnOrder: [...BUILTIN_COL_IDS] };
  }
}

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

export default function DocumentsPage() {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"));
  useAuth(); // keep auth context available for future use
  const can = usePermissions();
  const canUploadDocuments = can.documents.upload;
  const canDeleteDocuments = can.documents.delete;
  const { complexViewActive } = useComplexView();
  // Web always shows full document controls; native keeps them behind Complex View.
  const showComplexControls = isDesktopLikePlatform() || complexViewActive;
  // ---- data -------------------------------------------------------
  const [docs, setDocs]       = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [catTab, setCatTab]   = useState(0);
  const [search, setSearch]   = useState("");
  const [autoSort,    setAutoSort]    = useState({ key: "dateCreated", dir: "desc" as "asc" | "desc" });
  const [autoFilters, setAutoFilters] = useState<Record<string, Set<string>>>({});
  const [autoMenu,    setAutoMenu]    = useState<{ anchorEl: HTMLElement | null; key: string }>({ anchorEl: null, key: "" });

  // ---- tab & field config — loaded from backend, cached in LS -----
  const [tabs, setTabs]               = useState<DocTab[]>(() => lsGet<DocTab[]>(LS_TABS_KEY, DEFAULT_TABS).filter((t) => t.id !== "tips"));
  const [customFields, setCustomFields] = useState<CustomField[]>(() => {
    const raw = localStorage.getItem(LS_FIELDS_KEY);
    return raw ? parseFieldsJson(raw).customFields : [];
  });
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    const raw = localStorage.getItem(LS_FIELDS_KEY);
    return raw ? parseFieldsJson(raw).columnOrder : [...BUILTIN_COL_IDS];
  });
  const [configLoaded, setConfigLoaded] = useState(false);

  // ---- relation data (fetched lazily) -----------------------------
  const [relProducts,  setRelProducts]  = useState<{ id: string; name: string }[]>([]);
  const [relProjects,  setRelProjects]  = useState<{ id: string; name: string }[]>([]);
  const [relCustomers, setRelCustomers] = useState<{ id: string; name: string }[]>([]);

  // Derived — must precede makeEmptyForm (which is a lazy useState initializer)
  const activeCategoryId = tabs[catTab]?.id ?? "all";

  // ---- add dialog -------------------------------------------------
  const makeEmptyForm = (): DocForm => ({
    name: "",
    type: activeCategoryId !== "all" ? activeCategoryId : (tabs.find((t) => t.id !== "all")?.id ?? "technical"),
    linkedTo: "",
    notes: "",
    mode: "url",
    url: "",
    files: [],
    customValues: {},
  });

  const [addOpen,        setAddOpen]        = useState(false);
  const [addForm,        setAddForm]         = useState<DocForm>(makeEmptyForm);
  const [addError,       setAddError]        = useState<string | null>(null);
  const [addSaving,      setAddSaving]       = useState(false);
  const [uploadProgress, setUploadProgress]  = useState<{ current: number; total: number } | null>(null);

  // ---- edit dialog ------------------------------------------------
  const [editDoc,          setEditDoc]          = useState<DocumentRecord | null>(null);
  const [editName,         setEditName]         = useState("");
  const [editLinkedTo,     setEditLinkedTo]     = useState("");
  const [editNotes,        setEditNotes]        = useState("");
  const [editCustomValues, setEditCustomValues] = useState<Record<string, string>>({});
  const [editSaving,       setEditSaving]       = useState(false);

  // ---- preview dialog ---------------------------------------------
  const [previewDoc, setPreviewDoc] = useState<DocumentRecord | null>(null);

  // ---- delete confirm dialog --------------------------------------
  const [deleteDoc,     setDeleteDoc]     = useState<DocumentRecord | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError,   setDeleteError]   = useState<string | null>(null);

  // ---- gear menu --------------------------------------------------
  const gearRef    = useRef<HTMLButtonElement | null>(null);
  const mgrDragIdx = useRef<number | null>(null);
  const cfgDragIdx = useRef<number | null>(null);
  const [gearOpen, setGearOpen] = useState(false);

  // ---- Tab Manager ------------------------------------------------
  const [tabMgrOpen,   setTabMgrOpen]   = useState(false);
  const [mgrTabs,      setMgrTabs]      = useState<DocTab[]>([]);
  const [mgrNewLabel,  setMgrNewLabel]  = useState("");
  const [mgrNewColor,  setMgrNewColor]  = useState<DocTab["color"]>("primary");
  const [mgrEditId,    setMgrEditId]    = useState<string | null>(null);
  const [mgrEditLabel, setMgrEditLabel] = useState("");
  const [mgrSaving,    setMgrSaving]    = useState(false);

  // ---- Field Config -----------------------------------------------
  const [fieldCfgOpen,     setFieldCfgOpen]     = useState(false);
  const [cfgFields,        setCfgFields]         = useState<CustomField[]>([]);
  const [cfgNewLabel,      setCfgNewLabel]       = useState("");
  const [cfgNewType,       setCfgNewType]        = useState<CustomField["type"]>("text");
  const [cfgNewRelatesTo,  setCfgNewRelatesTo]   = useState<CustomField["relatesTo"]>("products");
  const [cfgColumnOrder,   setCfgColumnOrder]     = useState<string[]>([]);
  const [cfgSaving,        setCfgSaving]          = useState(false);

  // ----------------------------------------------------------------
  // Load docs + config from backend on mount
  // ----------------------------------------------------------------

  useEffect(() => {
    loadDocs();
    loadConfig();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Native document reads fast-bail while the server is flagged unreachable, so
  // a page that loaded during that window would otherwise stay empty forever.
  // Ask again the moment the link is back.
  useServerRecovery(() => {
    void loadDocs();
    void loadConfig();
  });

  async function loadDocs() {
    setLoading(true);
    try { setDocs(await documentService.getDocuments()); } catch {} finally { setLoading(false); }
  }

  async function loadConfig() {
    try {
      const cfg = await documentService.getDocumentConfig();
      if (cfg.tabsJson && cfg.tabsJson !== "[]") {
        const parsed = JSON.parse(cfg.tabsJson) as DocTab[];
        const filtered = parsed.filter((t) => t.id !== "tips");
        if (filtered.length) { setTabs(filtered); lsSet(LS_TABS_KEY, filtered); }
      }
      if (cfg.fieldsJson && cfg.fieldsJson !== "[]") {
        const { customFields: cf, columnOrder: co } = parseFieldsJson(cfg.fieldsJson);
        setCustomFields(cf); setColumnOrder(co);
        localStorage.setItem(LS_FIELDS_KEY, cfg.fieldsJson);
      }
    } catch {} finally { setConfigLoaded(true); }
  }

  // ---- Fetch relation data when customFields include a relation type
  useEffect(() => {
    const needs = new Set(customFields.filter((f) => f.type === "relation").map((f) => f.relatesTo));
    if (needs.has("products")  && !relProducts.length)  productService.getProducts().then((r) => setRelProducts(r.map((p) => ({ id: p.id, name: p.name })))).catch(() => {});
    if (needs.has("projects")  && !relProjects.length)  projectService.getProjects({}).then((r) => { const items = Array.isArray(r) ? r : (r as { items?: unknown[] }).items ?? []; setRelProjects((items as { id: string; customerName: string; jobNumber: string }[]).map((p) => ({ id: p.id, name: `${p.jobNumber} — ${p.customerName}` }))); }).catch(() => {});
    if (needs.has("customers") && !relCustomers.length) customerService.getCustomers().then((r) => setRelCustomers((r as { id: string; name: string }[]).map((c) => ({ id: c.id, name: c.name })))).catch(() => {});
  }, [customFields]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----------------------------------------------------------------
  // Derived
  // ----------------------------------------------------------------

  const visibleDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => {
      if (activeCategoryId !== "all" && d.type !== activeCategoryId) return false;
      if (q && !([d.name, d.linkedTo, d.type, d.createdBy, d.notes].some((f) => f?.toLowerCase().includes(q)))) return false;
      return true;
    });
  }, [docs, activeCategoryId, search]);

  const docAccessors = useMemo(() => {
    const n = (v: string | null | undefined) => String(v ?? "");
    return {
      name:        (d: DocumentRecord) => n(d.name),
      category:    (d: DocumentRecord) => n(d.type),
      linkedTo:    (d: DocumentRecord) => n(d.linkedTo),
      size:        (d: DocumentRecord) => String(d.fileSize ?? 0).padStart(20, "0"),
      dateCreated: (d: DocumentRecord) => n(d.uploadedAt),
      createdBy:   (d: DocumentRecord) => n(d.createdBy),
    };
  }, []);

  const docFilterOptions = useMemo(() => {
    const opts: Record<string, string[]> = {};
    (["name","category","linkedTo","createdBy"] as const).forEach((k) => {
      opts[k] = Array.from(new Set(visibleDocs.map((d) => docAccessors[k](d)))).sort();
    });
    return opts;
  }, [visibleDocs, docAccessors]);

  const sortedDocs = useMemo(() => {
    let rows = visibleDocs.filter((d) =>
      Object.entries(autoFilters).every(([k, sel]) => {
        if (!sel || sel.size === 0) return true;
        return sel.has((docAccessors[k as keyof typeof docAccessors])?.(d) ?? "");
      })
    );
    if (autoSort.key && docAccessors[autoSort.key as keyof typeof docAccessors]) {
      const acc = docAccessors[autoSort.key as keyof typeof docAccessors];
      rows = [...rows].sort((a, b) => {
        const av = acc(a), bv = acc(b);
        if (av < bv) return autoSort.dir === "asc" ? -1 : 1;
        if (av > bv) return autoSort.dir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return rows;
  }, [visibleDocs, autoFilters, autoSort, docAccessors]);

  const categoryCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of docs) { m[d.type] = (m[d.type] ?? 0) + 1; }
    return m;
  }, [docs]);

  function relationOptions(cf: CustomField): { id: string; name: string }[] {
    if (cf.relatesTo === "products")  return relProducts;
    if (cf.relatesTo === "projects")  return relProjects;
    if (cf.relatesTo === "customers") return relCustomers;
    return [];
  }

  // ----------------------------------------------------------------
  // Add document
  // ----------------------------------------------------------------

  async function saveDoc() {
    if (!canUploadDocuments) {
      setAddError("You don't have permission to add documents.");
      return;
    }
    if (addForm.mode === "url") {
      if (!addForm.name.trim()) { setAddError("Document name is required."); return; }
      if (!addForm.url.trim())  { setAddError("URL is required."); return; }
    } else {
      if (addForm.files.length === 0) { setAddError("Select at least one file to upload."); return; }
    }
    setAddSaving(true); setAddError(null); setUploadProgress(null);

    const notes     = addForm.notes.trim() || undefined;
    const customValues = Object.keys(addForm.customValues).length ? addForm.customValues : undefined;

    try {
      if (addForm.mode === "upload") {
        const total = addForm.files.length;
        const uploaded: DocumentRecord[] = [];
        let firstError: string | null = null;

        for (let i = 0; i < total; i++) {
          const bf = addForm.files[i];
          setUploadProgress({ current: i + 1, total });
          try {
            const displayName = bf.name.trim() || bf.file.name;
            let record = await documentService.uploadDocument(
              bf.file, addForm.type, addForm.linkedTo.trim(), undefined, notes, customValues
            );
            // Patch the display name if it differs from the original filename
            if (record.name !== displayName) {
              record = await documentService.updateDocument(record.id, { ...record, name: displayName, notes, customValues });
            }
            uploaded.push({ ...record, name: displayName });
          } catch {
            firstError = `Failed to upload "${bf.file.name}". Other files may have been saved.`;
          }
        }

        setDocs((prev) => [...uploaded.reverse(), ...prev]);
        setUploadProgress(null);
        if (firstError) { setAddError(firstError); } else { setAddOpen(false); setAddForm(makeEmptyForm()); }
      } else {
        const raw = await documentService.createDocument({
          id: "", name: addForm.name.trim(), type: addForm.type,
          linkedTo: addForm.linkedTo.trim(), uploadedAt: new Date().toISOString(),
          downloadUrl: addForm.url.trim(), notes, customValues,
        });
        setDocs((prev) => [raw, ...prev]);
        setAddOpen(false); setAddForm(makeEmptyForm());
      }
    } catch {
      setAddError("Failed to save document. Check your connection.");
      setUploadProgress(null);
    } finally {
      setAddSaving(false);
    }
  }

  // ----------------------------------------------------------------
  // Edit document
  // ----------------------------------------------------------------

  function openEdit(doc: DocumentRecord) {
    setEditDoc(doc); setEditName(doc.name);
    setEditLinkedTo(doc.linkedTo ?? ""); setEditNotes(doc.notes ?? "");
    setEditCustomValues(doc.customValues ?? {});
  }

  async function saveEdit() {
    if (!canUploadDocuments) return;
    if (!editDoc || !editName.trim()) return;
    setEditSaving(true);
    try {
      const updated = await documentService.updateDocument(editDoc.id, {
        ...editDoc,
        name: editName.trim(),
        linkedTo: editLinkedTo.trim(),
        notes: editNotes.trim() || undefined,
        customValues: Object.keys(editCustomValues).length ? editCustomValues : undefined,
      });
      setDocs((prev) => prev.map((d) => d.id === updated.id ? updated : d));
      setEditDoc(null);
    } catch {} finally { setEditSaving(false); }
  }

  // ----------------------------------------------------------------
  // Preview document
  // ----------------------------------------------------------------

  function isBackendFile(url: string) {
    return /\/api\/documents\/[^/]+\/download/.test(url);
  }

  async function openPreview(doc: DocumentRecord) {
    if (!doc.downloadUrl) return;
    // External URL — open directly in a new tab, no dialog
    if (!isBackendFile(doc.downloadUrl)) {
      window.open(doc.downloadUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setPreviewDoc(doc);
  }

  function renderMobileCards() {
    return (
      <Box sx={{ display: "grid", gap: 1.25, p: 1.25 }}>
        {sortedDocs.map((doc) => {
          const tabDef = tabs.find((tab) => tab.id === doc.type);
          return (
            <Box
              key={doc.id}
              className="glass-card"
              sx={{
                p: 1.5,
                borderRadius: 3,
                border: "1px solid rgba(148,163,184,0.12)",
                background: "linear-gradient(180deg, rgba(10,18,24,0.94), rgba(8,14,19,0.98))",
              }}
            >
              <Stack spacing={1.1}>
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <Box
                    sx={{
                      width: 38,
                      height: 38,
                      borderRadius: 2.5,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      bgcolor: "rgba(45,212,191,0.08)",
                      color: "#99f6e4",
                      flexShrink: 0,
                    }}
                  >
                    <FolderOutlined fontSize="small" />
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" fontWeight={700} sx={{ lineHeight: 1.35 }} className="line-clamp-2">
                      {addExtIfMissing(doc.name, doc.contentType)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" className="line-clamp-2">
                      {doc.notes || "No description"}
                    </Typography>
                  </Box>
                </Stack>

                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                  <Chip size="small" label={tabDef?.label ?? doc.type} color={tabDef?.color ?? "default"} variant="outlined" />
                  <Chip
                    size="small"
                    label={doc.linkedTo || "General"}
                    variant="outlined"
                    sx={{ maxWidth: "100%", "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" } }}
                  />
                </Stack>

                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 0.75 }}>
                  <Box sx={{ borderRadius: 2, p: 1, bgcolor: "rgba(255,255,255,0.03)" }}>
                    <Typography variant="caption" color="text.secondary">Size</Typography>
                    <Typography variant="body2" fontWeight={600}>{formatBytes(doc.fileSize)}</Typography>
                  </Box>
                  <Box sx={{ borderRadius: 2, p: 1, bgcolor: "rgba(255,255,255,0.03)" }}>
                    <Typography variant="caption" color="text.secondary">Date</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : "—"}
                    </Typography>
                  </Box>
                  <Box sx={{ borderRadius: 2, p: 1, bgcolor: "rgba(255,255,255,0.03)" }}>
                    <Typography variant="caption" color="text.secondary">By</Typography>
                    <Typography variant="body2" fontWeight={600} className="line-clamp-1">
                      {doc.createdBy || "—"}
                    </Typography>
                  </Box>
                </Box>

                <Stack direction="row" spacing={0.75}>
                  {doc.downloadUrl && can.documents.view && (
                    <Button fullWidth size="small" variant="contained" onClick={() => void openPreview(doc)}>
                      Preview
                    </Button>
                  )}
                  {canUploadDocuments && showComplexControls && (
                    <Button fullWidth size="small" variant="outlined" onClick={() => openEdit(doc)}>
                      Edit
                    </Button>
                  )}
                  {canDeleteDocuments && showComplexControls && (
                    <Button fullWidth size="small" color="error" variant="outlined" onClick={() => setDeleteDoc(doc)}>
                      Delete
                    </Button>
                  )}
                </Stack>
              </Stack>
            </Box>
          );
        })}
      </Box>
    );
  }

  // ----------------------------------------------------------------
  // Delete document
  // ----------------------------------------------------------------

  async function deleteDocConfirmed() {
    if (!canDeleteDocuments) {
      setDeleteError("You don't have permission to delete documents.");
      return;
    }
    if (!deleteDoc) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await documentService.deleteDocument(deleteDoc.id);
      setDocs((prev) => prev.filter((d) => d.id !== deleteDoc.id));
      setDeleteDoc(null);
    } catch (err: unknown) {
      console.error("[deleteDoc]", err);
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403 || status === 401) {
        setDeleteError("You don't have permission to delete documents (Admin or Project Manager role required).");
      } else if (status) {
        setDeleteError(`Server returned HTTP ${status}. Check the server logs for details.`);
      } else {
        setDeleteError("No response from server — check that the backend is running and reachable.");
      }
    } finally { setDeleteLoading(false); }
  }

  // ----------------------------------------------------------------
  // Gear menu
  // ----------------------------------------------------------------

  function openTabManager() {
    setGearOpen(false);
    setMgrTabs(tabs.filter((t) => t.id !== "all").map((t) => ({ ...t })));
    setMgrNewLabel(""); setMgrNewColor("primary"); setMgrEditId(null); setMgrEditLabel("");
    setTabMgrOpen(true);
  }

  function openFieldConfig() {
    setGearOpen(false);
    setCfgFields(customFields.map((f) => ({ ...f })));
    setCfgColumnOrder([...columnOrder]);
    setCfgNewLabel(""); setCfgNewType("text"); setCfgNewRelatesTo("products");
    setFieldCfgOpen(true);
  }

  // ---- Tab Manager ------------------------------------------------

  function mgrAddTab() {
    const label = mgrNewLabel.trim();
    if (!label) return;
    setMgrTabs((prev) => [...prev, { id: `tab_${Date.now()}`, label, color: mgrNewColor }]);
    setMgrNewLabel(""); setMgrNewColor("primary");
  }

  function mgrCommitRename(id: string) {
    const label = mgrEditLabel.trim();
    if (label) setMgrTabs((prev) => prev.map((t) => t.id === id ? { ...t, label } : t));
    setMgrEditId(null); setMgrEditLabel("");
  }

  function mgrDrop(toIdx: number) {
    const fromIdx = mgrDragIdx.current;
    if (fromIdx === null || fromIdx === toIdx) return;
    const next = [...mgrTabs];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setMgrTabs(next);
    mgrDragIdx.current = null;
  }

  async function applyTabManager() {
    const next: DocTab[] = [{ id: "all", label: "All", color: "default" }, ...mgrTabs];
    setTabs(next); lsSet(LS_TABS_KEY, next);
    if (catTab >= next.length) setCatTab(0);
    setMgrSaving(true);
    try {
      const fieldsJson = JSON.stringify(customFields);
      await documentService.saveDocumentConfig({ tabsJson: JSON.stringify(next), fieldsJson });
    } catch {} finally { setMgrSaving(false); }
    setTabMgrOpen(false);
  }

  // ---- Field Config -----------------------------------------------

  function cfgAddField() {
    const label = cfgNewLabel.trim();
    if (!label) return;
    const newField: CustomField = {
      id: `cf_${Date.now()}`,
      label,
      type: cfgNewType,
      ...(cfgNewType === "relation" ? { relatesTo: cfgNewRelatesTo } : {}),
    };
    setCfgFields((prev) => [...prev, newField]);
    setCfgColumnOrder((prev) => [...prev, newField.id]);
    setCfgNewLabel(""); setCfgNewType("text"); setCfgNewRelatesTo("products");
  }

  function cfgDrop(toIdx: number) {
    const fromIdx = cfgDragIdx.current;
    if (fromIdx === null || fromIdx === toIdx) return;
    const next = [...cfgColumnOrder];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setCfgColumnOrder(next);
    cfgDragIdx.current = null;
  }

  async function applyFieldConfig() {
    setCustomFields(cfgFields);
    setColumnOrder(cfgColumnOrder);
    const fieldsJson = JSON.stringify({ customFields: cfgFields, columnOrder: cfgColumnOrder });
    localStorage.setItem(LS_FIELDS_KEY, fieldsJson);
    setCfgSaving(true);
    try {
      const tabsJson = JSON.stringify(tabs);
      await documentService.saveDocumentConfig({ tabsJson, fieldsJson });
    } catch {} finally { setCfgSaving(false); }
    setFieldCfgOpen(false);
  }

  // ----------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------

  return (
    <Stack spacing={3}>
      {/* Header */}
      <Box className="glass-card" sx={{ p: { xs: 1.5, sm: 2 }, background: "linear-gradient(135deg, rgba(8,18,24,0.98), rgba(12,28,36,0.94))" }}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems="center" gap={2}>
        <Box>
          <Typography variant="h5" sx={{ fontFamily: "Sora" }}>Documents</Typography>
          <Typography variant="body2" color="text.secondary">
            Technical bulletins, drawings, procedures, authority-to-work and more — linked to assets or general.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Button size="small" variant="outlined" startIcon={<RefreshOutlined />} onClick={loadDocs}>Refresh</Button>

          {/* Gear settings — admin only */}
          {can.editForms && (
            <>
              <Tooltip title="Document settings">
                <IconButton ref={gearRef} size="small" onClick={() => setGearOpen(true)}
                  sx={{ opacity: 0.75, "&:hover": { opacity: 1 } }}>
                  <SettingsOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
              <Menu anchorEl={gearRef.current} open={gearOpen} onClose={() => setGearOpen(false)}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}>
                <MenuItem dense onClick={openTabManager} sx={{ py: 1 }}>
                  <Stack spacing={0.25}>
                    <Typography variant="body2" fontWeight={600}>Document Tab Manager</Typography>
                    <Typography variant="caption" color="text.secondary">Edit, remove, or relocate document tabs</Typography>
                  </Stack>
                </MenuItem>
                <Divider />
                <MenuItem dense onClick={openFieldConfig} sx={{ py: 1 }}>
                  <Stack spacing={0.25}>
                    <Typography variant="body2" fontWeight={600}>Configure Document Window</Typography>
                    <Typography variant="caption" color="text.secondary">Add, edit, or delete fields in the document form</Typography>
                  </Stack>
                </MenuItem>
              </Menu>
            </>
          )}

          {canUploadDocuments && showComplexControls && (
            <>
              <QRUploadButton
                docType={activeCategoryId !== "all" ? activeCategoryId : "technical"}
                linkedTo=""
                onUploaded={() => { loadDocs(); }}
              />
              <Button variant="contained" startIcon={<AddOutlined />}
                onClick={() => { setAddForm(makeEmptyForm()); setAddError(null); setAddOpen(true); }}>
                Add document
              </Button>
            </>
          )}
        </Stack>
      </Stack>
      <Box
        sx={{
          mt: 1.75,
          display: "grid",
          gridTemplateColumns: { xs: "repeat(3, minmax(0, 1fr))", sm: "repeat(3, minmax(0, 1fr))" },
          gap: 1,
        }}
      >
        <Box sx={{ borderRadius: 2.5, p: 1.25, bgcolor: "rgba(45,212,191,0.08)", border: "1px solid rgba(45,212,191,0.18)" }}>
          <Typography variant="caption" sx={{ color: "rgba(153,246,228,0.84)", textTransform: "uppercase", letterSpacing: 0.8 }}>
            Library
          </Typography>
          <Typography variant="h6" sx={{ mt: 0.25 }}>{docs.length}</Typography>
        </Box>
        <Box sx={{ borderRadius: 2.5, p: 1.25, bgcolor: "rgba(14,165,233,0.08)", border: "1px solid rgba(14,165,233,0.18)" }}>
          <Typography variant="caption" sx={{ color: "rgba(125,211,252,0.88)", textTransform: "uppercase", letterSpacing: 0.8 }}>
            Visible
          </Typography>
          <Typography variant="h6" sx={{ mt: 0.25 }}>{sortedDocs.length}</Typography>
        </Box>
        <Box sx={{ borderRadius: 2.5, p: 1.25, bgcolor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)" }}>
          <Typography variant="caption" sx={{ color: "rgba(253,224,71,0.88)", textTransform: "uppercase", letterSpacing: 0.8 }}>
            Tabs
          </Typography>
          <Typography variant="h6" sx={{ mt: 0.25 }}>{Math.max(0, tabs.length - 1)}</Typography>
        </Box>
      </Box>
      </Box>

      {/* Config loading indicator */}
      {!configLoaded && (
        <Stack direction="row" alignItems="center" spacing={1}>
          <CircularProgress size={12} />
          <Typography variant="caption" color="text.secondary">Loading document configuration…</Typography>
        </Stack>
      )}

      {/* Category tabs */}
      <Paper className="glass-card" sx={{ p: 1.5 }}>
        <Tabs value={catTab} onChange={(_, next) => setCatTab(next)} variant="scrollable" allowScrollButtonsMobile scrollButtons="auto">
          {tabs.map((cat) => (
            <Tab key={cat.id} label={
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <span>{cat.label}</span>
                {cat.id !== "all" && categoryCounts[cat.id] ? (
                  <Typography variant="caption" sx={{ opacity: 0.65 }}>{categoryCounts[cat.id]}</Typography>
                ) : null}
              </Stack>
            } />
          ))}
        </Tabs>
      </Paper>

      {/* Search + sorting */}
      <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} alignItems={{ md: "center" }}>
        <TextField size="small" placeholder="Search by name, asset tag, category, creator…"
          value={search} onChange={(e) => setSearch(e.target.value)} sx={{ maxWidth: 440, width: "100%" }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchOutlined fontSize="small" /></InputAdornment> }}
        />
      </Stack>

      {/* Documents table */}
      <Paper className="glass-card" sx={{ overflow: "hidden" }}>
        {loading ? (
          <Stack alignItems="center" justifyContent="center" sx={{ p: 6 }}><CircularProgress size={32} /></Stack>
        ) : sortedDocs.length === 0 ? (
          <Box sx={{ p: 3 }}>
            <Alert severity="info">
              {docs.length === 0 ? "No documents yet. Click \"Add document\" to upload or link one." : "No documents match the current filters."}
            </Alert>
          </Box>
        ) : isPhone ? (
          renderMobileCards()
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                {columnOrder.map((colId) => {
                    const label = (BUILTIN_COL_IDS as readonly string[]).includes(colId)
                      ? BUILTIN_COL_LABELS[colId as BuiltinColId]
                      : (customFields.find((f) => f.id === colId)?.label ?? colId);
                    const sortable = (BUILTIN_COL_IDS as readonly string[]).includes(colId);
                    return (
                      <TableCell key={colId}>
                        <Stack direction="row" alignItems="center" spacing={0.25}>
                          <Typography variant="caption" fontWeight={700}>{label}</Typography>
                          {sortable && (
                            <IconButton size="small" sx={{ p: 0.25 }} onClick={(e) => setAutoMenu({ anchorEl: e.currentTarget, key: colId })}>
                              <ArrowDropDown fontSize="small" />
                            </IconButton>
                          )}
                        </Stack>
                      </TableCell>
                    );
                  })}
                <TableCell align="right"><Typography variant="caption" fontWeight={700}>Actions</Typography></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedDocs.map((doc) => {
                const tabDef = tabs.find((t) => t.id === doc.type);
                return (
                  <TableRow key={doc.id} hover>
                    {columnOrder.map((colId) => {
                      if (colId === "name") return (
                        <TableCell key={colId}>
                          <Stack direction="row" alignItems="flex-start" spacing={0.75}>
                            <FolderOutlined fontSize="small" sx={{ color: "text.disabled", flexShrink: 0, mt: 0.25 }} />
                            <Box>
                              <Typography variant="body2" fontWeight={500}>{addExtIfMissing(doc.name, doc.contentType)}</Typography>
                              {doc.notes && (
                                <Typography variant="caption" color="text.secondary" display="block">
                                  {doc.notes.length > 64 ? doc.notes.slice(0, 64) + "…" : doc.notes}
                                </Typography>
                              )}
                            </Box>
                          </Stack>
                        </TableCell>
                      );
                      if (colId === "category") return (
                        <TableCell key={colId}>
                          <Chip size="small" label={tabDef?.label ?? doc.type} color={tabDef?.color ?? "default"} variant="outlined" />
                        </TableCell>
                      );
                      if (colId === "linkedTo") return (
                        <TableCell key={colId}>
                          <Typography variant="body2" color="text.secondary">
                            {doc.linkedTo || <em style={{ opacity: 0.5 }}>General</em>}
                          </Typography>
                        </TableCell>
                      );
                      if (colId === "size") return (
                        <TableCell key={colId}>
                          <Typography variant="body2" color="text.secondary">{formatBytes(doc.fileSize)}</Typography>
                        </TableCell>
                      );
                      if (colId === "dateCreated") return (
                        <TableCell key={colId}>
                          <Typography variant="body2" color="text.secondary">
                            {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : "—"}
                          </Typography>
                        </TableCell>
                      );
                      if (colId === "createdBy") return (
                        <TableCell key={colId}>
                          <Typography variant="body2" color="text.secondary">{doc.createdBy || "—"}</Typography>
                        </TableCell>
                      );
                      // Custom field column
                      const cf = customFields.find((f) => f.id === colId);
                      if (!cf) return <TableCell key={colId} />;
                      // Custom values live in doc.customValues (hydrated from customValuesJson),
                      // NOT as top-level properties of doc.
                      const rawVal = doc.customValues?.[colId];
                      // For relation fields the stored value is an entity ID — resolve to name.
                      let displayVal: string | undefined;
                      if (cf.type === "relation" && rawVal) {
                        const opts = relationOptions(cf);
                        displayVal = opts.find((o) => o.id === rawVal)?.name ?? rawVal;
                      } else {
                        displayVal = rawVal;
                      }
                      return (
                        <TableCell key={colId}>
                          <Typography variant="body2" color="text.secondary">{displayVal || "—"}</Typography>
                        </TableCell>
                      );
                    })}
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.25} justifyContent="flex-end">
                        {doc.downloadUrl && can.documents.view && (
                          <Tooltip title="Preview / open">
                            <IconButton size="small" onClick={() => openPreview(doc)}>
                              <DownloadOutlined fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {canUploadDocuments && showComplexControls && (
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => openEdit(doc)}>
                              <EditOutlined fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {canDeleteDocuments && showComplexControls && (
                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" onClick={() => setDeleteDoc(doc)}>
                              <DeleteOutline fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {!((doc.downloadUrl && can.documents.view) || (canUploadDocuments && showComplexControls) || (canDeleteDocuments && showComplexControls)) && (
                          <Typography variant="caption" color="text.disabled">
                            No actions
                          </Typography>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Paper>

      {/* ================================================================ */}
      {/* Add document dialog                                               */}
      {/* ================================================================ */}
      <Dialog open={addOpen} onClose={() => !addSaving && setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Document</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {addForm.mode === "url" && (
              <TextField label="Document Name *" size="small" fullWidth required
                value={addForm.name} onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Wiring Diagram Rev3"
                InputLabelProps={{ shrink: true }} />
            )}
            <FormControl size="small" fullWidth>
              <InputLabel shrink>Category</InputLabel>
              <Select label="Category" value={addForm.type}
                onChange={(e) => setAddForm((p) => ({ ...p, type: e.target.value }))}>
                {tabs.filter((t) => t.id !== "all").map((tab) => (
                  <MenuItem key={tab.id} value={tab.id}>{tab.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField label="Linked To (asset tag or product name)" size="small" fullWidth
              value={addForm.linkedTo} onChange={(e) => setAddForm((p) => ({ ...p, linkedTo: e.target.value }))}
              placeholder="e.g. VEH-001 or leave blank for general"
              InputLabelProps={{ shrink: true }} />
            <TextField label="Notes / Description" size="small" fullWidth multiline rows={3}
              value={addForm.notes} onChange={(e) => setAddForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Optional notes about this document…"
              InputLabelProps={{ shrink: true }} />

            {/* Custom fields */}
            {customFields.length > 0 && (
              <>
                <Divider><Typography variant="caption" color="text.secondary">Additional fields</Typography></Divider>
                {customFields.map((cf) => {
                  if (cf.type === "relation") {
                    const opts = relationOptions(cf);
                    return (
                      <FormControl key={cf.id} size="small" fullWidth>
                        <InputLabel shrink>{cf.label}</InputLabel>
                        <Select label={cf.label} value={addForm.customValues[cf.id] ?? ""}
                          onChange={(e) => setAddForm((p) => ({ ...p, customValues: { ...p.customValues, [cf.id]: e.target.value } }))}>
                          <MenuItem value=""><em>None</em></MenuItem>
                          {opts.length === 0
                            ? <MenuItem disabled value=""><em>Loading…</em></MenuItem>
                            : opts.map((o) => <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>)
                          }
                        </Select>
                      </FormControl>
                    );
                  }
                  if (cf.type === "textarea") return (
                    <TextField key={cf.id} label={cf.label} size="small" fullWidth multiline rows={2}
                      value={addForm.customValues[cf.id] ?? ""}
                      onChange={(e) => setAddForm((p) => ({ ...p, customValues: { ...p.customValues, [cf.id]: e.target.value } }))} />
                  );
                  if (cf.type === "select") return (
                    <FormControl key={cf.id} size="small" fullWidth>
                      <InputLabel shrink>{cf.label}</InputLabel>
                      <Select label={cf.label} value={addForm.customValues[cf.id] ?? ""}
                        onChange={(e) => setAddForm((p) => ({ ...p, customValues: { ...p.customValues, [cf.id]: e.target.value } }))}>
                        {(cf.options ?? []).map((opt) => <MenuItem key={opt} value={opt}>{opt}</MenuItem>)}
                      </Select>
                    </FormControl>
                  );
                  return (
                    <TextField key={cf.id} label={cf.label} size="small" fullWidth
                      value={addForm.customValues[cf.id] ?? ""}
                      onChange={(e) => setAddForm((p) => ({ ...p, customValues: { ...p.customValues, [cf.id]: e.target.value } }))} />
                  );
                })}
              </>
            )}

            <Divider><Typography variant="caption" color="text.secondary">Source</Typography></Divider>

            <Stack direction="row" spacing={1}>
              <Button size="small" variant={addForm.mode === "url" ? "contained" : "outlined"} startIcon={<LinkOutlined />}
                onClick={() => setAddForm((p) => ({ ...p, mode: "url" }))}>Link URL</Button>
              <Button size="small" variant={addForm.mode === "upload" ? "contained" : "outlined"} startIcon={<UploadFileOutlined />}
                onClick={() => setAddForm((p) => ({ ...p, mode: "upload" }))}>Upload File</Button>
            </Stack>

            {addForm.mode === "url" && (
              <TextField label="Document URL *" size="small" fullWidth
                value={addForm.url} onChange={(e) => setAddForm((p) => ({ ...p, url: e.target.value }))}
                placeholder="https://…"
                InputLabelProps={{ shrink: true }}
                InputProps={{ startAdornment: <InputAdornment position="start"><LinkOutlined fontSize="small" /></InputAdornment> }} />
            )}

            {addForm.mode === "upload" && (
              <Box>
                <Button component="label" variant="outlined" startIcon={<AttachFileOutlined />} size="small">
                  {addForm.files.length === 0 ? "Choose files…" : "Add more files"}
                  <input type="file" multiple hidden onChange={(e) => {
                    const picked = Array.from(e.target.files ?? []);
                    if (!picked.length) return;
                    const newEntries: BulkFile[] = picked.map((f) => ({
                      id: `bf_${Date.now()}_${Math.random()}`,
                      file: f,
                      name: f.name,
                    }));
                    setAddForm((p) => ({ ...p, files: [...p.files, ...newEntries] }));
                    e.target.value = "";
                  }} />
                </Button>

                {addForm.files.length > 0 && (
                  <Stack spacing={0.75} sx={{ mt: 1.25 }}>
                    {addForm.files.map((bf) => (
                      <Stack key={bf.id} direction="row" alignItems="center" spacing={1}
                        sx={{ px: 1, py: 0.5, borderRadius: 1, border: "1px solid", borderColor: "divider", bgcolor: "action.hover" }}>
                        <AttachFileOutlined fontSize="small" sx={{ color: "text.disabled", flexShrink: 0 }} />
                        <TextField size="small" value={bf.name}
                          onChange={(e) => setAddForm((p) => ({ ...p, files: p.files.map((f) => f.id === bf.id ? { ...f, name: e.target.value } : f) }))}
                          sx={{ flex: 1 }} inputProps={{ style: { padding: "3px 6px", fontSize: 13 } }} placeholder="Display name" />
                        <Chip size="small" label={formatBytes(bf.file.size)} variant="outlined" sx={{ fontSize: 10, flexShrink: 0 }} />
                        <Tooltip title="Remove">
                          <IconButton size="small" onClick={() => setAddForm((p) => ({ ...p, files: p.files.filter((f) => f.id !== bf.id) }))}>
                            <DeleteOutline fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    ))}
                    <Typography variant="caption" color="text.secondary">
                      {addForm.files.length} file{addForm.files.length !== 1 ? "s" : ""} selected
                      {" · "}{formatBytes(addForm.files.reduce((s, bf) => s + bf.file.size, 0))} total
                    </Typography>
                  </Stack>
                )}

                {uploadProgress && (
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
                    <CircularProgress size={14} />
                    <Typography variant="caption" color="text.secondary">
                      Uploading file {uploadProgress.current} of {uploadProgress.total}…
                    </Typography>
                  </Stack>
                )}
              </Box>
            )}

            {addError && <Alert severity="error" sx={{ fontSize: 12 }}>{addError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)} disabled={addSaving}>Cancel</Button>
          <Button variant="contained" onClick={saveDoc} disabled={addSaving}
            startIcon={addSaving ? <CircularProgress size={14} /> : <AddOutlined />}>
            {addSaving ? "Saving…" : "Add document"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ================================================================ */}
      {/* Edit document dialog                                              */}
      {/* ================================================================ */}
      <Dialog open={Boolean(editDoc)} onClose={() => !editSaving && setEditDoc(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Document</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Name" size="small" fullWidth value={editName} onChange={(e) => setEditName(e.target.value)} />
            <TextField label="Linked To" size="small" fullWidth value={editLinkedTo}
              onChange={(e) => setEditLinkedTo(e.target.value)} placeholder="Asset tag, product name, or leave blank"
              InputLabelProps={{ shrink: true }} />
            <TextField label="Notes / Description" size="small" fullWidth multiline rows={3} value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)} />

            {/* Custom fields */}
            {customFields.length > 0 && (
              <>
                <Divider><Typography variant="caption" color="text.secondary">Additional fields</Typography></Divider>
                {customFields.map((cf) => {
                  if (cf.type === "relation") {
                    const opts = relationOptions(cf);
                    return (
                      <FormControl key={cf.id} size="small" fullWidth>
                        <InputLabel shrink>{cf.label}</InputLabel>
                        <Select label={cf.label} value={editCustomValues[cf.id] ?? ""}
                          onChange={(e) => setEditCustomValues((p) => ({ ...p, [cf.id]: e.target.value }))}>
                          <MenuItem value=""><em>None</em></MenuItem>
                          {opts.length === 0
                            ? <MenuItem disabled value=""><em>Loading…</em></MenuItem>
                            : opts.map((o) => <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>)
                          }
                        </Select>
                      </FormControl>
                    );
                  }
                  if (cf.type === "textarea") return (
                    <TextField key={cf.id} label={cf.label} size="small" fullWidth multiline rows={2}
                      value={editCustomValues[cf.id] ?? ""}
                      onChange={(e) => setEditCustomValues((p) => ({ ...p, [cf.id]: e.target.value }))} />
                  );
                  if (cf.type === "select") return (
                    <FormControl key={cf.id} size="small" fullWidth>
                      <InputLabel shrink>{cf.label}</InputLabel>
                      <Select label={cf.label} value={editCustomValues[cf.id] ?? ""}
                        onChange={(e) => setEditCustomValues((p) => ({ ...p, [cf.id]: e.target.value }))}>
                        {(cf.options ?? []).map((opt) => <MenuItem key={opt} value={opt}>{opt}</MenuItem>)}
                      </Select>
                    </FormControl>
                  );
                  return (
                    <TextField key={cf.id} label={cf.label} size="small" fullWidth
                      value={editCustomValues[cf.id] ?? ""}
                      onChange={(e) => setEditCustomValues((p) => ({ ...p, [cf.id]: e.target.value }))} />
                  );
                })}
              </>
            )}

            {editDoc?.createdBy && (
              <Typography variant="caption" color="text.secondary">
                Created by: <strong>{editDoc.createdBy}</strong>
              </Typography>
            )}
            {editDoc?.downloadUrl && (
              <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>
                URL: {editDoc.downloadUrl}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDoc(null)} disabled={editSaving}>Cancel</Button>
          <Button variant="contained" onClick={saveEdit} disabled={editSaving || !editName.trim()}
            startIcon={editSaving ? <CircularProgress size={14} /> : undefined}>
            {editSaving ? "Saving…" : "Save changes"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ================================================================ */}
      {/* Document Tab Manager                                              */}
      {/* ================================================================ */}
      <Dialog open={tabMgrOpen} onClose={() => setTabMgrOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Document Tab Manager</DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
            Drag rows to reorder. Click a label to rename inline. The "All" tab is pinned and cannot be removed.
          </Typography>

          <Stack direction="row" alignItems="center" spacing={1}
            sx={{ px: 1, py: 0.75, mb: 0.5, borderRadius: 1, border: "1px solid", borderColor: "divider",
              bgcolor: "action.disabledBackground", opacity: 0.55 }}>
            <DragIndicatorOutlined fontSize="small" sx={{ color: "text.disabled" }} />
            <Typography variant="body2" sx={{ flex: 1 }}>All (pinned)</Typography>
            <Chip size="small" label="pinned" variant="outlined" sx={{ fontSize: 10 }} />
          </Stack>

          <Stack spacing={0.5}>
            {mgrTabs.map((tab, idx) => (
              <Stack key={tab.id} direction="row" alignItems="center" spacing={1} draggable
                onDragStart={() => { mgrDragIdx.current = idx; }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => mgrDrop(idx)}
                sx={{ px: 1, py: 0.5, borderRadius: 1, border: "1px solid", borderColor: "divider",
                  bgcolor: "action.hover", cursor: "grab", "&:active": { cursor: "grabbing" } }}>
                <DragIndicatorOutlined fontSize="small" sx={{ color: "text.disabled", flexShrink: 0 }} />
                {mgrEditId === tab.id ? (
                  <TextField size="small" value={mgrEditLabel} autoFocus sx={{ flex: 1 }}
                    inputProps={{ style: { padding: "3px 6px", fontSize: 13 } }}
                    onChange={(e) => setMgrEditLabel(e.target.value)}
                    onBlur={() => mgrCommitRename(tab.id)}
                    onKeyDown={(e) => { if (e.key === "Enter") mgrCommitRename(tab.id); if (e.key === "Escape") { setMgrEditId(null); setMgrEditLabel(""); } }} />
                ) : (
                  <Typography variant="body2" sx={{ flex: 1, cursor: "text", "&:hover": { textDecoration: "underline dotted" } }}
                    onClick={() => { setMgrEditId(tab.id); setMgrEditLabel(tab.label); }}>
                    {tab.label}
                  </Typography>
                )}
                <Chip size="small" label={tab.color} color={tab.color} sx={{ fontSize: 10, minWidth: 72 }} />
                <Tooltip title="Remove tab">
                  <IconButton size="small" color="error" onClick={() => setMgrTabs((prev) => prev.filter((t) => t.id !== tab.id))}>
                    <DeleteOutline fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            ))}
          </Stack>

          <Divider sx={{ my: 1.5 }} />
          <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" mb={1}>Add new tab</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField size="small" placeholder="Tab label" value={mgrNewLabel} sx={{ flex: 1 }}
              onChange={(e) => setMgrNewLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") mgrAddTab(); }} />
            <FormControl size="small" sx={{ minWidth: 110 }}>
              <InputLabel shrink>Color</InputLabel>
              <Select label="Color" value={mgrNewColor} onChange={(e) => setMgrNewColor(e.target.value as DocTab["color"])}>
                {TAB_COLOR_OPTIONS.map((c) => (
                  <MenuItem key={c} value={c}>
                    <Stack direction="row" alignItems="center" spacing={0.75}>
                      <Chip size="small" label="" color={c} sx={{ width: 14, height: 14, "& .MuiChip-label": { display: "none" } }} />
                      <span>{c}</span>
                    </Stack>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button size="small" variant="outlined" startIcon={<AddOutlined />} onClick={mgrAddTab} disabled={!mgrNewLabel.trim()}>
              Add
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTabMgrOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={applyTabManager} disabled={mgrSaving}
            startIcon={mgrSaving ? <CircularProgress size={14} /> : undefined}>
            {mgrSaving ? "Saving…" : "Apply"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ================================================================ */}
      {/* Document Preview dialog                                           */}
      {/* ================================================================ */}
      <MobileDocumentPreviewDialog doc={previewDoc} open={Boolean(previewDoc)} onClose={() => setPreviewDoc(null)} />

      {/* ================================================================ */}
      {/* Delete confirmation dialog                                        */}
      {/* ================================================================ */}
      <Dialog open={Boolean(deleteDoc)} onClose={() => { if (!deleteLoading) { setDeleteDoc(null); setDeleteError(null); } }} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Document?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Are you sure you want to delete{" "}
            <strong>{deleteDoc?.name}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This action cannot be undone. Uploaded files will also be removed from the server.
          </Typography>
          {deleteError && <Alert severity="error" sx={{ mt: 1.5, fontSize: 12 }}>{deleteError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteDoc(null); setDeleteError(null); }} disabled={deleteLoading}>Cancel</Button>
          <Button variant="contained" color="error" onClick={deleteDocConfirmed} disabled={deleteLoading}
            startIcon={deleteLoading ? <CircularProgress size={14} /> : <DeleteOutline />}>
            {deleteLoading ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ================================================================ */}
      {/* Configure Document Window                                         */}
      {/* ================================================================ */}
      <Dialog open={fieldCfgOpen} onClose={() => setFieldCfgOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Configure Document Window</DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
            Drag rows to reorder table columns. Built-in columns cannot be removed. Changes are saved to the server and visible to all users.
          </Typography>

          <Stack spacing={0.5} sx={{ mb: 1 }}>
            {cfgColumnOrder.map((colId, idx) => {
              const isBuiltin = (BUILTIN_COL_IDS as readonly string[]).includes(colId);
              const cf = cfgFields.find((f) => f.id === colId);
              const label = isBuiltin
                ? BUILTIN_COL_LABELS[colId as BuiltinColId]
                : (cf?.label ?? colId);
              return (
                <Stack key={colId} direction="row" alignItems="center" spacing={1} draggable
                  onDragStart={() => { cfgDragIdx.current = idx; }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => cfgDrop(idx)}
                  sx={{ px: 1, py: 0.5, borderRadius: 1, border: "1px solid", borderColor: "divider",
                    bgcolor: isBuiltin ? "action.disabledBackground" : "action.hover",
                    cursor: "grab", "&:active": { cursor: "grabbing" },
                    opacity: isBuiltin ? 0.75 : 1 }}>
                  <DragIndicatorOutlined fontSize="small" sx={{ color: "text.disabled", flexShrink: 0 }} />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2">{label}</Typography>
                    {!isBuiltin && cf?.type === "relation" && cf.relatesTo && (
                      <Typography variant="caption" color="text.secondary">→ {cf.relatesTo}</Typography>
                    )}
                  </Box>
                  <Chip size="small" label={isBuiltin ? "built-in" : cf?.type} variant="outlined" sx={{ fontSize: 10 }} />
                  {!isBuiltin && (
                    <Tooltip title="Remove field">
                      <IconButton size="small" color="error" onClick={() => {
                        setCfgFields((prev) => prev.filter((f) => f.id !== colId));
                        setCfgColumnOrder((prev) => prev.filter((id) => id !== colId));
                      }}>
                        <DeleteOutline fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
              );
            })}
          </Stack>

          <Divider sx={{ my: 1.5 }} />
          <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" mb={1}>Add custom field</Typography>
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField size="small" placeholder="Field label" value={cfgNewLabel} sx={{ flex: 1 }}
                onChange={(e) => setCfgNewLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") cfgAddField(); }} />
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel shrink>Type</InputLabel>
                <Select label="Type" value={cfgNewType} onChange={(e) => setCfgNewType(e.target.value as CustomField["type"])}>
                  <MenuItem value="text">Text</MenuItem>
                  <MenuItem value="textarea">Textarea</MenuItem>
                  <MenuItem value="select">Select</MenuItem>
                  <MenuItem value="relation">Relation</MenuItem>
                </Select>
              </FormControl>
              <Button size="small" variant="outlined" startIcon={<AddOutlined />} onClick={cfgAddField} disabled={!cfgNewLabel.trim()}>
                Add
              </Button>
            </Stack>
            {cfgNewType === "relation" && (
              <FormControl size="small" sx={{ maxWidth: 260 }}>
                <InputLabel shrink>Relates to</InputLabel>
                <Select label="Relates to" value={cfgNewRelatesTo ?? "products"}
                  onChange={(e) => setCfgNewRelatesTo(e.target.value as CustomField["relatesTo"])}>
                  {RELATION_TARGETS.map((t) => (
                    <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFieldCfgOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={applyFieldConfig} disabled={cfgSaving}
            startIcon={cfgSaving ? <CircularProgress size={14} /> : undefined}>
            {cfgSaving ? "Saving…" : "Apply"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Column sort / filter menu */}
      <Menu anchorEl={autoMenu.anchorEl} open={Boolean(autoMenu.anchorEl)} onClose={() => setAutoMenu({ anchorEl: null, key: "" })}>
        <MenuItem onClick={() => { if (autoMenu.key) setAutoSort({ key: autoMenu.key, dir: "asc" }); setAutoMenu({ anchorEl: null, key: "" }); }}>Sort A → Z</MenuItem>
        <MenuItem onClick={() => { if (autoMenu.key) setAutoSort({ key: autoMenu.key, dir: "desc" }); setAutoMenu({ anchorEl: null, key: "" }); }}>Sort Z → A</MenuItem>
        <MenuItem onClick={() => { setAutoSort({ key: "dateCreated", dir: "desc" }); setAutoMenu({ anchorEl: null, key: "" }); }}>Clear sort</MenuItem>
        {(docFilterOptions[autoMenu.key] ?? []).map((option) => {
          const label = option || "(Blank)";
          const selected = !!autoFilters[autoMenu.key]?.has(option);
          return (
            <MenuItem key={`${autoMenu.key}-${option}`} onClick={() => {
              if (!autoMenu.key) return;
              setAutoFilters((prev) => {
                const cur = new Set(prev[autoMenu.key] ?? []);
                if (cur.has(option)) cur.delete(option); else cur.add(option);
                return { ...prev, [autoMenu.key]: cur };
              });
            }}>
              <Checkbox checked={selected} size="small" />
              <ListItemText primary={label} />
            </MenuItem>
          );
        })}
      </Menu>
    </Stack>
  );
}
