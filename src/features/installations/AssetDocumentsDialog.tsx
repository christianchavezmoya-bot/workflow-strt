/**
 * AssetDocumentsDialog
 *
 * Shows up to 3 documents linked to a project asset.
 * Documents live in the global library; this dialog stores references (links)
 * to them — detaching a link does NOT delete the library document.
 *
 * Two ways to attach:
 *   1. "Upload New" — file picker → metadata form (Name, Type, Product, Notes)
 *      → uploads to library and creates a link in one step.
 *   2. "Link from Library" — search existing library docs and create a link.
 *
 * Document types come from the library's tab configuration (same types as the
 * Documents page), so the classification stays consistent.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useServerRecovery } from "../../hooks/useServerRecovery";
import {
  AttachFileOutlined,
  CloudUploadOutlined,
  DeleteOutline,
  DescriptionOutlined,
  FileDownloadOutlined,
  LinkOutlined,
  PictureAsPdfOutlined,
  TableChartOutlined,
  TextSnippetOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";
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
  IconButton,
  InputAdornment,
  LinearProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import DocViewer, { DocViewerRenderers } from "@cyntler/react-doc-viewer";
import type { ProjectAsset } from "../../types/projectAsset";
import type { Product } from "../../types/product";
import {
  assetDocumentLinkService,
  type AssetDocumentLink,
} from "../../services/assetDocumentLinkService";
import { documentService, type DocumentRecord } from "../../services/documentService";
import QRUploadButton from "../../components/QRUploadButton";

const MAX_DOCS = 3;
const ACCEPTED_TYPES = ".pdf,.xlsx,.xls,.docx,.doc,.json,.png,.jpg,.jpeg";
// Mirrors DocumentsPage DEFAULT_TABS (excluding "All") so the fallback is consistent.
const FALLBACK_TYPES = [
  "Technical",
  "Drawings",
  "Procedures",
  "Authority to Work",
  "Tips & Tricks",
  "Tech Bulletins",
  "Informative",
  "Other",
];

interface DocTab {
  id: string;
  label: string;
}

interface CustomField {
  id: string;
  label: string;
  type: string;
  relatesTo?: "products" | "projects" | "customers";
}

interface Props {
  open: boolean;
  onClose: () => void;
  asset: ProjectAsset;
  currentUserName: string;
  onDocsChanged: (assetId: string, count: number) => void;
  products?: Product[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function docIcon(contentType?: string | null) {
  const t = contentType ?? "";
  if (t.includes("pdf"))  return <PictureAsPdfOutlined fontSize="small" color="error" />;
  if (t.includes("sheet") || t.includes("excel") || t.includes("spreadsheet"))
    return <TableChartOutlined fontSize="small" color="success" />;
  if (t.includes("word") || t.includes("document"))
    return <TextSnippetOutlined fontSize="small" color="primary" />;
  return <DescriptionOutlined fontSize="small" />;
}

function getFileType(contentType?: string | null, name?: string): string | undefined {
  const t = (contentType ?? "").toLowerCase();
  const ext = (name ?? "").split(".").pop()?.toLowerCase();
  if (t.includes("pdf"))  return "pdf";
  if (t.includes("sheet") || t.includes("excel") || t.includes("spreadsheet") || ext === "xlsx" || ext === "xls") return "xlsx";
  // DOCX (Office Open XML) = mammoth-renderable; DOC (legacy binary) is not
  if (t.includes("openxmlformats") || ext === "docx") return "docx";
  if (t.includes("word") || t.includes("msword") || ext === "doc") return "doc";
  if (t.includes("json")) return "json";
  return ext;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AssetDocumentsDialog({
  open,
  onClose,
  asset,
  currentUserName,
  onDocsChanged,
  products = [],
}: Props) {
  // ── Links (attached docs) ─────────────────────────────────────────────────
  const [links, setLinks]   = useState<AssetDocumentLink[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Document types + custom fields (from library config) ─────────────────
  const [docTypes, setDocTypes]       = useState<string[]>(FALLBACK_TYPES);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);

  // ── Upload flow ───────────────────────────────────────────────────────────
  const uploadInputRef      = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadFormOpen, setUploadFormOpen] = useState(false);
  const [uploadName, setUploadName]   = useState("");
  const [uploadType, setUploadType]   = useState("");
  const [uploadProduct, setUploadProduct] = useState("");   // product id
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploading, setUploading]     = useState(false);

  // ── Library tab ───────────────────────────────────────────────────────────
  const [activeTab, setActiveTab]     = useState<"attached" | "library">("attached");
  const [libraryDocs, setLibraryDocs] = useState<DocumentRecord[]>([]);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [attaching, setAttaching]     = useState<string | null>(null);

  // ── Viewer ────────────────────────────────────────────────────────────────
  const [viewerLink, setViewerLink]         = useState<AssetDocumentLink | null>(null);
  const [viewerBlobUrl, setViewerBlobUrl]   = useState<string | null>(null);
  const [viewerHtml, setViewerHtml]         = useState<string | null>(null); // DOCX/XLSX rendered to HTML
  const [viewerLoading, setViewerLoading]   = useState(false);

  // ── Duplicate detection ───────────────────────────────────────────────────
  const [dupDialogOpen, setDupDialogOpen] = useState(false);
  const [dupCandidates, setDupCandidates] = useState<DocumentRecord[]>([]);

  // ── Feedback ──────────────────────────────────────────────────────────────
  const [snack, setSnack] = useState<{ msg: string; sev: "success" | "error" } | null>(null);

  // ── Load doc types — same source as DocumentsPage ─────────────────────────
  // DocumentsPage stores tab config in localStorage ("doc_tabs_config_v1") as
  // primary source and only periodically syncs to the backend. Reading from LS
  // first ensures we see all user-defined tabs (including custom ones like
  // "Interface Agreements", "Tips & Tricks", etc.) without a round-trip.
  useEffect(() => {
    function extractLabels(json: string): string[] {
      try {
        const tabs: DocTab[] = JSON.parse(json);
        return tabs.filter((t) => t.id !== "all").map((t) => t.label);
      } catch {
        return [];
      }
    }

    // 1. localStorage — show immediately (fast, no round-trip)
    const lsRaw = localStorage.getItem("doc_tabs_config_v1");
    if (lsRaw) {
      const labels = extractLabels(lsRaw);
      if (labels.length > 0) setDocTypes(labels);
    }

    // 2. API — always fetch (authoritative; updates if localStorage is stale or from a
    //    different browser where custom tabs like "Interface Agreements" were added)
    documentService.getDocumentConfig().then((cfg) => {
      const labels = extractLabels(cfg.tabsJson);
      if (labels.length > 0) setDocTypes(labels);
      // Also parse fieldsJson so we can populate custom relation fields on upload
      try {
        const fields: CustomField[] = JSON.parse(cfg.fieldsJson ?? "[]");
        setCustomFields(fields);
      } catch { /* keep empty */ }
    }).catch(() => {/* keep current */});
  }, []);

  // ── Load links ────────────────────────────────────────────────────────────
  // onDocsChanged is intentionally NOT in the dependency array — it's called
  // from the effect below so it never destabilises reload's identity.
  const reload = useCallback(async () => {
    setLoading(true);
    const data = await assetDocumentLinkService.listByAsset(asset.id);
    setLinks(data);
    setLoading(false);
    return data;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.id]);

  useEffect(() => {
    if (!open) return;
    setActiveTab("attached");
    setLibrarySearch("");
    reload().then((data) => {
      if (data) onDocsChanged(asset.id, data.length);
    });
  // onDocsChanged is stable (useCallback in parent) but kept out of deps to be safe
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reload]);

  // Native document reads fast-bail while the server is flagged unreachable. If
  // the dialog was opened during that window it would show an empty list and
  // never retry, so pull again as soon as the link is back.
  useServerRecovery(() => {
    if (!open) return;
    void reload().then((data) => {
      if (data) onDocsChanged(asset.id, data.length);
    });
  });

  // ── Load library when Library tab is active ────────────────────────────────
  useEffect(() => {
    if (activeTab !== "library") return;
    setLibraryLoading(true);
    documentService
      .getDocuments()
      .then((docs) => setLibraryDocs(docs))
      .catch(() => setLibraryDocs([]))
      .finally(() => setLibraryLoading(false));
  }, [activeTab]);

  // ── Upload flow: step 1 — file chosen ─────────────────────────────────────
  function handleUploadClick() {
    uploadInputRef.current?.click();
  }

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (links.length >= MAX_DOCS) {
      setSnack({ msg: "Maximum 3 documents per asset.", sev: "error" });
      return;
    }

    // Pre-fill form fields (shared between normal and dup-warning flows)
    setPendingFile(file);
    setUploadName(file.name);
    setUploadType(docTypes[0] ?? "");
    setUploadProduct("");
    setUploadNotes("");

    // Check the library for a document with the same name before uploading.
    // Normalize both sides: strip extension and collapse spaces/underscores/dashes
    // so "BHP Layout.pdf" ↔ "BHP_Layout" ↔ "bhp-layout.docx" are all treated equal.
    function normName(s: string) {
      return s.toLowerCase().replace(/\.[^.]+$/, "").replace(/[\s_-]+/g, "");
    }
    try {
      const allDocs = await documentService.getDocuments();
      const normFile = normName(file.name);
      const matches = allDocs.filter((d) => normName(d.name) === normFile);
      if (matches.length > 0) {
        setDupCandidates(matches);
        setDupDialogOpen(true);
        return; // user must decide in the dup dialog
      }
    } catch {
      // If the check fails just proceed normally
    }

    setUploadFormOpen(true);
  }

  function handleDupUploadAnyway() {
    setDupDialogOpen(false);
    setUploadFormOpen(true);
  }

  async function handleDupUseExisting(doc: DocumentRecord) {
    setDupDialogOpen(false);
    setPendingFile(null);
    await handleAttach(doc);
  }

  function handleDupCancel() {
    setDupDialogOpen(false);
    setPendingFile(null);
  }

  // ── Upload flow: step 2 — form confirmed ─────────────────────────────────
  async function handleUploadConfirm() {
    if (!pendingFile) return;

    setUploading(true);
    try {
      // Resolve product name/id to pass as linkedTo (plain text) AND as custom field values
      // so the document shows correctly in the Documents page Products relation column.
      const selectedProduct = products.find((p) => p.id === uploadProduct);

      // Build customValues: for every relation field that targets "products", set fieldId → productId
      let customValuesJson: string | undefined;
      if (selectedProduct) {
        const productFields = customFields.filter(
          (f) => f.type === "relation" && f.relatesTo === "products",
        );
        if (productFields.length > 0) {
          const cv: Record<string, string> = {};
          productFields.forEach((f) => { cv[f.id] = selectedProduct.id; });
          customValuesJson = JSON.stringify(cv);
        }
      }

      const link = await assetDocumentLinkService.uploadAndLink(
        asset.id,
        pendingFile,
        uploadType,
        uploadName || pendingFile.name,
        selectedProduct ? selectedProduct.name : undefined,
        uploadNotes || undefined,
        currentUserName,
        customValuesJson,
      );
      setLinks((prev) => [...prev, link]);
      onDocsChanged(asset.id, links.length + 1);
      setUploadFormOpen(false);
      setPendingFile(null);
      setSnack({ msg: "Document uploaded and attached.", sev: "success" });
    } catch (err: unknown) {
      // Extract the actual server error message so the user sees something actionable.
      const e = err as { response?: { data?: unknown; status?: number } };
      let msg = "Upload failed.";
      const data = e?.response?.data;
      if (typeof data === "string" && data.length < 300) {
        msg = data;
      } else if (data && typeof data === "object") {
        const d = data as Record<string, unknown>;
        if (typeof d["title"] === "string") msg = d["title"] as string;
        else if (d["errors"]) {
          const errs = d["errors"] as Record<string, string[]>;
          const first = Object.values(errs)[0]?.[0];
          if (first) msg = first;
        }
      }
      const status = e?.response?.status;
      setSnack({ msg: status === 400 ? msg : `Upload failed (${status ?? "network error"}).`, sev: "error" });
    } finally {
      setUploading(false);
    }
  }

  function handleUploadCancel() {
    setUploadFormOpen(false);
    setPendingFile(null);
  }

  // ── Attach from library ───────────────────────────────────────────────────
  async function handleAttach(doc: DocumentRecord) {
    if (links.length >= MAX_DOCS) {
      setSnack({ msg: "Maximum 3 documents per asset.", sev: "error" });
      return;
    }
    setAttaching(doc.id);
    try {
      const link = await assetDocumentLinkService.attach(asset.id, doc.id, currentUserName);
      setLinks((prev) => [...prev, link]);
      onDocsChanged(asset.id, links.length + 1);
      setSnack({ msg: `"${doc.name}" attached.`, sev: "success" });
      setActiveTab("attached");
    } catch (err: unknown) {
      const raw = err as { response?: { status?: number } };
      if (raw?.response?.status === 409) {
        setSnack({ msg: "This document is already attached.", sev: "error" });
      } else {
        setSnack({ msg: "Could not attach document.", sev: "error" });
      }
    } finally {
      setAttaching(null);
    }
  }

  // ── Detach ────────────────────────────────────────────────────────────────
  async function handleDetach(linkId: string) {
    try {
      await assetDocumentLinkService.detach(linkId);
      const updated = links.filter((l) => l.id !== linkId);
      setLinks(updated);
      onDocsChanged(asset.id, updated.length);
      setSnack({ msg: "Detached (document remains in library).", sev: "success" });
    } catch {
      setSnack({ msg: "Could not detach document.", sev: "error" });
    }
  }

  // ── Preview ───────────────────────────────────────────────────────────────
  async function handleView(link: AssetDocumentLink) {
    setViewerLoading(true);
    setViewerLink(link);
    setViewerBlobUrl(null);
    setViewerHtml(null);

    const fileType = getFileType(link.document.contentType, link.document.name);
    const downloadUrl = assetDocumentLinkService.getDownloadUrl(link.documentId);

    try {
      if (fileType === "docx") {
        // Client-side DOCX → HTML via mammoth (Office Open XML only — no internet required)
        const buffer = await documentService.openDocumentAsBuffer(downloadUrl);
        const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
        setViewerHtml(
          `<!DOCTYPE html><html><head><style>
            body{font-family:Arial,sans-serif;padding:24px;line-height:1.6;background:#fff;color:#000}
            table{border-collapse:collapse;width:100%}
            td,th{border:1px solid #ccc;padding:4px 8px}
            img{max-width:100%}
          </style></head><body>${result.value}</body></html>`,
        );
      } else if (fileType === "doc") {
        // Legacy Word binary format — mammoth cannot process it; prompt download instead
        setViewerHtml(
          `<!DOCTYPE html><html><head><style>
            body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100%;margin:0;background:#fff;color:#555}
            .msg{text-align:center;padding:40px}
            .icon{font-size:56px;margin:0 0 12px}
            .title{font-size:17px;font-weight:600;color:#333;margin:0 0 8px}
            .sub{font-size:14px}
          </style></head><body>
            <div class="msg">
              <div class="icon">📄</div>
              <p class="title">Old Word format (.doc) cannot be previewed</p>
              <p class="sub">Save the file as <strong>.docx</strong> to enable in-browser preview,<br>or use the Download button to open it locally.</p>
            </div>
          </body></html>`,
        );
      } else if (fileType === "xlsx" || fileType === "xls") {
        // Client-side XLSX → HTML table via SheetJS (no internet required)
        const buffer = await documentService.openDocumentAsBuffer(downloadUrl);
        const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        // sheet_to_html returns a full HTML document — inject styles into its <head>
        const rawHtml = XLSX.utils.sheet_to_html(sheet);
        const styledHtml = rawHtml.replace(
          "</head>",
          `<style>
            body{font-family:Arial,sans-serif;padding:16px;background:#fff;margin:0;overflow:auto}
            table{border-collapse:collapse;font-size:12px;min-width:100%}
            td,th{border:1px solid #d0d0d0;padding:4px 10px;white-space:nowrap;vertical-align:top;background:#fff!important;color:#000!important}
            tr:first-child td,tr:first-child th{font-weight:600;background:#f5f5f5!important}
          </style></head>`,
        );
        setViewerHtml(styledHtml);
      } else {
        // PDF, images, JSON → blob URL → DocViewer (PDF.js, etc., no internet required)
        const blobUrl = await documentService.openDocument(downloadUrl);
        setViewerBlobUrl(blobUrl);
      }
    } catch {
      setSnack({ msg: "Could not open document for preview.", sev: "error" });
      setViewerLink(null);
    } finally {
      setViewerLoading(false);
    }
  }

  function handleViewerClose() {
    if (viewerBlobUrl) URL.revokeObjectURL(viewerBlobUrl);
    setViewerLink(null);
    setViewerBlobUrl(null);
    setViewerHtml(null);
  }

  // ── Download ──────────────────────────────────────────────────────────────
  function handleDownload(link: AssetDocumentLink) {
    const url = assetDocumentLinkService.getDownloadUrl(link.documentId);
    const a = document.createElement("a");
    a.href = url;
    a.download = link.document.name ?? "document";
    a.click();
  }

  // ── Library filter ────────────────────────────────────────────────────────
  const attachedDocIds  = new Set(links.map((l) => l.documentId));
  const filteredLibrary = libraryDocs.filter((d) => {
    const q = librarySearch.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      (d.type ?? "").toLowerCase().includes(q)
    );
  });

  const title = asset.assetName
    ? `${asset.assetTag} — ${asset.assetName}`
    : (asset.assetTag ?? "Asset");

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Pre-upload metadata form ──────────────────────────────────────── */}
      <Dialog open={uploadFormOpen} onClose={handleUploadCancel} maxWidth="sm" fullWidth>
        <DialogTitle>Document Details</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="File name / Title"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              fullWidth
              size="small"
              helperText={pendingFile ? `File: ${pendingFile.name}` : ""}
            />

            <TextField
              select
              label="Document Type"
              value={uploadType}
              onChange={(e) => setUploadType(e.target.value)}
              fullWidth
              size="small"
              required
            >
              {docTypes.map((t) => (
                <MenuItem key={t} value={t}>{t}</MenuItem>
              ))}
            </TextField>

            {products.length > 0 && (
              <TextField
                select
                label="Product (optional)"
                value={uploadProduct}
                onChange={(e) => setUploadProduct(e.target.value)}
                fullWidth
                size="small"
                helperText="Associates this document with a product in the library."
              >
                <MenuItem value=""><em>None</em></MenuItem>
                {products.map((p) => (
                  <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                ))}
              </TextField>
            )}

            <TextField
              label="Notes (optional)"
              value={uploadNotes}
              onChange={(e) => setUploadNotes(e.target.value)}
              fullWidth
              size="small"
              multiline
              rows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleUploadCancel} disabled={uploading}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleUploadConfirm}
            disabled={uploading || !uploadType}
            startIcon={uploading ? <CircularProgress size={16} /> : <CloudUploadOutlined />}
          >
            {uploading ? "Uploading…" : "Upload & Attach"}
          </Button>
        </DialogActions>
        {uploading && <LinearProgress />}
      </Dialog>

      {/* ── Duplicate Detection dialog ────────────────────────────────────── */}
      <Dialog open={dupDialogOpen} onClose={handleDupCancel} maxWidth="sm" fullWidth>
        <DialogTitle>Document Already Exists in Library</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            A document with a similar name is already in the library. You can attach the
            existing one (no extra copy) or upload a new version anyway.
          </Alert>
          <Typography variant="body2" gutterBottom>
            <strong>Uploading:</strong> {pendingFile?.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, mb: 0.5 }}>
            Matching document{dupCandidates.length > 1 ? "s" : ""} in library:
          </Typography>
          <List disablePadding>
            {dupCandidates.map((doc) => {
              const alreadyLinked = attachedDocIds.has(doc.id);
              return (
                <ListItem
                  key={doc.id}
                  disableGutters
                  sx={{ py: 0.75 }}
                  secondaryAction={
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<LinkOutlined />}
                      disabled={alreadyLinked || links.length >= MAX_DOCS}
                      onClick={() => handleDupUseExisting(doc)}
                    >
                      {alreadyLinked ? "Already Attached" : "Use Existing"}
                    </Button>
                  }
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>{docIcon(doc.contentType)}</ListItemIcon>
                  <ListItemText
                    primary={doc.name}
                    secondary={[
                      doc.type,
                      doc.createdBy,
                      doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  />
                </ListItem>
              );
            })}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDupCancel}>Cancel</Button>
          <Button
            variant="outlined"
            startIcon={<CloudUploadOutlined />}
            onClick={handleDupUploadAnyway}
          >
            Upload Anyway
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Main dialog ───────────────────────────────────────────────────── */}
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle sx={{ pb: 0 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">Documents — {title}</Typography>
            <Chip
              label={`${links.length} / ${MAX_DOCS}`}
              color={
                links.length === 0
                  ? "default"
                  : links.length === MAX_DOCS
                  ? "success"
                  : "primary"
              }
              size="small"
              sx={{ fontWeight: 700, minWidth: 52 }}
            />
          </Stack>

          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mt: 1 }}>
            <Tab label="Attached" value="attached" />
            <Tab label="Link from Library" value="library" />
          </Tabs>
        </DialogTitle>

        <DialogContent sx={{ p: 0, minHeight: 340 }}>

          {/* ── Attached tab ──────────────────────────────────────────────── */}
          {activeTab === "attached" && (
            <Box sx={{ px: 2, py: 1.5 }}>
              <Stack direction="row" spacing={1} alignItems="center" mb={1.5}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<CloudUploadOutlined />}
                  onClick={handleUploadClick}
                  disabled={links.length >= MAX_DOCS}
                >
                  Upload New
                </Button>

                <input
                  ref={uploadInputRef}
                  type="file"
                  accept={ACCEPTED_TYPES}
                  style={{ display: "none" }}
                  onChange={handleFileChosen}
                />

                <QRUploadButton
                  docType="asset-document"
                  linkedTo={asset.assetName ?? asset.id ?? ""}
                  disabled={links.length >= MAX_DOCS}
                  onUploaded={async (documentId) => {
                    const link = await assetDocumentLinkService.attach(asset.id, documentId, currentUserName);
                    setLinks((prev) => [...prev, link]);
                    onDocsChanged(asset.id, links.length + 1);
                    setSnack({ msg: "Document uploaded and attached via phone.", sev: "success" });
                  }}
                />

                {links.length >= MAX_DOCS && (
                  <Typography variant="caption" color="text.secondary">
                    Max 3 reached — detach one to add another.
                  </Typography>
                )}
              </Stack>

              {loading ? (
                <Box display="flex" justifyContent="center" py={4}>
                  <CircularProgress size={28} />
                </Box>
              ) : links.length === 0 ? (
                <Box
                  sx={{
                    border: "1px dashed",
                    borderColor: "divider",
                    borderRadius: 1,
                    py: 5,
                    textAlign: "center",
                    color: "text.disabled",
                  }}
                >
                  <AttachFileOutlined sx={{ fontSize: 36, mb: 1, opacity: 0.4 }} />
                  <Typography variant="body2">
                    No documents attached yet.
                    <br />
                    Upload a new file or link one from the library.
                  </Typography>
                </Box>
              ) : (
                <List disablePadding>
                  {links.map((link, idx) => {
                    const doc = link.document;
                    return (
                      <React.Fragment key={link.id}>
                        {idx > 0 && <Divider component="li" />}
                        <ListItem
                          disableGutters
                          sx={{ py: 1, alignItems: "flex-start" }}
                          secondaryAction={
                            <Stack direction="row" spacing={0.5}>
                              <Tooltip title="Preview in browser">
                                <IconButton size="small" onClick={() => handleView(link)}>
                                  <VisibilityOutlined fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Download">
                                <IconButton size="small" onClick={() => handleDownload(link)}>
                                  <FileDownloadOutlined fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Detach from this asset (stays in library)">
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => handleDetach(link.id)}
                                >
                                  <DeleteOutline fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          }
                        >
                          <ListItemIcon sx={{ minWidth: 36, mt: 0.5 }}>
                            {docIcon(doc.contentType)}
                          </ListItemIcon>
                          <ListItemText
                            primary={
                              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                <Typography variant="body2" fontWeight={600}>
                                  {doc.name}
                                </Typography>
                                {doc.type && (
                                  <Chip label={doc.type} size="small" variant="outlined" />
                                )}
                                {doc.linkedTo && (
                                  <Chip
                                    label={doc.linkedTo}
                                    size="small"
                                    variant="outlined"
                                    color="info"
                                  />
                                )}
                              </Stack>
                            }
                            secondary={
                              <Typography variant="caption" color="text.secondary">
                                {formatBytes(doc.fileSize)}
                                {doc.createdBy ? ` · ${doc.createdBy}` : ""}
                                {doc.uploadedAt
                                  ? ` · ${new Date(doc.uploadedAt).toLocaleDateString()}`
                                  : ""}
                                {link.attachedBy ? ` · Attached by ${link.attachedBy}` : ""}
                              </Typography>
                            }
                          />
                        </ListItem>
                      </React.Fragment>
                    );
                  })}
                </List>
              )}
            </Box>
          )}

          {/* ── Library tab ───────────────────────────────────────────────── */}
          {activeTab === "library" && (
            <Box sx={{ px: 2, py: 1.5 }}>
              <TextField
                fullWidth
                size="small"
                placeholder="Search by name or type…"
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LinkOutlined fontSize="small" />
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 1.5 }}
              />

              {libraryLoading ? (
                <Box display="flex" justifyContent="center" py={4}>
                  <CircularProgress size={28} />
                </Box>
              ) : filteredLibrary.length === 0 ? (
                <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>
                  {librarySearch ? "No matching documents." : "Library is empty."}
                </Typography>
              ) : (
                <List disablePadding>
                  {filteredLibrary.map((doc, idx) => {
                    const alreadyLinked = attachedDocIds.has(doc.id);
                    return (
                      <React.Fragment key={doc.id}>
                        {idx > 0 && <Divider component="li" />}
                        <ListItem
                          disableGutters
                          sx={{ py: 0.75 }}
                          secondaryAction={
                            <Button
                              size="small"
                              variant={alreadyLinked ? "outlined" : "contained"}
                              disabled={
                                alreadyLinked ||
                                links.length >= MAX_DOCS ||
                                attaching === doc.id
                              }
                              onClick={() => handleAttach(doc)}
                              startIcon={
                                attaching === doc.id ? (
                                  <CircularProgress size={14} />
                                ) : (
                                  <LinkOutlined />
                                )
                              }
                            >
                              {alreadyLinked ? "Attached" : "Attach"}
                            </Button>
                          }
                        >
                          <ListItemIcon sx={{ minWidth: 36 }}>
                            {docIcon(doc.contentType)}
                          </ListItemIcon>
                          <ListItemText
                            primary={
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Typography variant="body2" fontWeight={500}>
                                  {doc.name}
                                </Typography>
                                {doc.type && (
                                  <Chip label={doc.type} size="small" variant="outlined" />
                                )}
                                {doc.linkedTo && (
                                  <Chip
                                    label={doc.linkedTo}
                                    size="small"
                                    variant="outlined"
                                    color="info"
                                  />
                                )}
                              </Stack>
                            }
                            secondary={
                              <Typography variant="caption" color="text.secondary">
                                {formatBytes(doc.fileSize)}
                                {doc.createdBy ? ` · ${doc.createdBy}` : ""}
                              </Typography>
                            }
                          />
                        </ListItem>
                      </React.Fragment>
                    );
                  })}
                </List>
              )}
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Document viewer dialog ─────────────────────────────────────────── */}
      <Dialog
        open={Boolean(viewerLink)}
        onClose={handleViewerClose}
        maxWidth="xl"
        fullWidth
        PaperProps={{ sx: { height: "90vh" } }}
      >
        <DialogTitle sx={{ pb: 0 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="subtitle1" fontWeight={600}>
              {viewerLink?.document.name ?? "Preview"}
            </Typography>
            <Button size="small" onClick={handleViewerClose}>Close</Button>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ p: 0, overflow: "hidden" }}>
          {viewerLoading ? (
            <Box display="flex" justifyContent="center" alignItems="center" height="100%">
              <CircularProgress />
            </Box>
          ) : viewerHtml ? (
            // DOCX / XLSX rendered to HTML via mammoth / SheetJS
            <iframe
              srcDoc={viewerHtml}
              title="Document preview"
              sandbox="allow-same-origin"
              style={{ width: "100%", height: "100%", border: "none" }}
            />
          ) : viewerBlobUrl ? (
            // PDF / images / JSON via DocViewer (PDF.js — no internet required)
            <DocViewer
              documents={[
                {
                  uri: viewerBlobUrl,
                  fileType: getFileType(
                    viewerLink?.document.contentType,
                    viewerLink?.document.name,
                  ),
                  fileName: viewerLink?.document.name,
                },
              ]}
              pluginRenderers={DocViewerRenderers}
              style={{ height: "100%", width: "100%" }}
              config={{ header: { disableHeader: true } }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ── Snackbar ───────────────────────────────────────────────────────── */}
      <Snackbar
        open={Boolean(snack)}
        autoHideDuration={3500}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={snack?.sev} onClose={() => setSnack(null)} sx={{ width: "100%" }}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </>
  );
}
