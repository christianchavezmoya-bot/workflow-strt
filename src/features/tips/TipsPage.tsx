import { useEffect, useRef, useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import QRUploadButton from "../../components/QRUploadButton";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import TableRowsOutlinedIcon from "@mui/icons-material/TableRowsOutlined";
import ThumbUpOutlinedIcon from "@mui/icons-material/ThumbUpOutlined";
import OndemandVideoOutlinedIcon from "@mui/icons-material/OndemandVideoOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import OpenInNewOutlinedIcon from "@mui/icons-material/OpenInNewOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import * as pdfjsLib from "pdfjs-dist";
import { documentService, DocumentRecord } from "../../services/documentService";
import { productService } from "../../services/productService";
import type { Product } from "../../types/product";
import { useAuth } from "../../hooks/useAuth";
import { usePermissions } from "../../hooks/usePermissions";

// Point PDF.js worker at the bundled copy shipped with pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

// ── Types ─────────────────────────────────────────────────────────────────────

type ContentTypeLabel =
  | "Photo"
  | "Video"
  | "Drawing"
  | "Pinout"
  | "Config"
  | "Procedure"
  | "Tip";

type ChipColor =
  | "default"
  | "primary"
  | "secondary"
  | "error"
  | "info"
  | "success"
  | "warning";

type ViewMode = "grid" | "table";

// ── Constants ─────────────────────────────────────────────────────────────────

const CONTENT_TYPES: ContentTypeLabel[] = [
  "Photo",
  "Video",
  "Drawing",
  "Pinout",
  "Config",
  "Procedure",
  "Tip",
];

const CHIP_COLORS: Record<ContentTypeLabel, ChipColor> = {
  Photo: "success",
  Video: "primary",
  Drawing: "secondary",
  Pinout: "warning",
  Config: "info",
  Procedure: "default",
  Tip: "success",
};

const HELPFUL_STORAGE_KEY = "tips_helpful_v1";

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadHelpfulCounts(): Record<string, number> {
  try {
    const raw = localStorage.getItem(HELPFUL_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, number>;
  } catch {
    // ignore
  }
  return {};
}

function saveHelpfulCounts(counts: Record<string, number>): void {
  localStorage.setItem(HELPFUL_STORAGE_KEY, JSON.stringify(counts));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString();
  } catch {
    return dateStr;
  }
}

const MIME_TO_EXT: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "text/plain": ".txt",
};

function addExtIfMissing(name: string, contentType?: string | null): string {
  const trimmed = name.trim();
  if (!trimmed) return name;
  if (/\.[a-z0-9]{2,5}$/i.test(trimmed)) return trimmed;
  const ext = contentType ? MIME_TO_EXT[contentType.toLowerCase()] : "";
  return ext ? `${trimmed}${ext}` : trimmed;
}

// ── Thumbnail helpers ─────────────────────────────────────────────────────────

interface ThumbnailBoxProps {
  doc: DocumentRecord;
  size?: number;
}

const PdfThumbnail = ({ downloadUrl, size }: { downloadUrl: string; size: number }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const arrayBuffer = await documentService.openDocumentAsBuffer(downloadUrl);
        if (cancelled) return;
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) return;
        const page = await pdf.getPage(1);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 1 });
        const scale = size / Math.max(viewport.width, viewport.height);
        const scaled = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = scaled.width;
        canvas.height = scaled.height;
        await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport: scaled }).promise;
        if (!cancelled) setReady(true);
      } catch {
        // silently fall back to icon
      }
    })();
    return () => { cancelled = true; };
  }, [downloadUrl, size]);

  return (
    <Box sx={{ position: "relative", width: "100%", height: size, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "action.hover" }}>
      <canvas
        ref={canvasRef}
        style={{ display: ready ? "block" : "none", maxWidth: "100%", maxHeight: size, objectFit: "contain" }}
      />
      {!ready && <PictureAsPdfOutlinedIcon color="error" sx={{ fontSize: 64, position: "absolute" }} />}
    </Box>
  );
};

const ThumbnailBox = ({ doc, size = 160 }: ThumbnailBoxProps) => {
  const mimeType = doc.contentType ?? "";
  const isImage = mimeType.startsWith("image/");
  const isVideo = mimeType.startsWith("video/");
  const isPdf = mimeType === "application/pdf";

  if (isPdf && doc.downloadUrl) return <PdfThumbnail downloadUrl={doc.downloadUrl} size={size} />;

  return (
    <Box sx={{ height: size, bgcolor: "action.hover", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {isImage && doc.downloadUrl ? (
        <img src={doc.downloadUrl} alt={addExtIfMissing(doc.name, doc.contentType)} style={{ objectFit: "cover", width: "100%", height: "100%" }} />
      ) : isVideo ? (
        <OndemandVideoOutlinedIcon color="primary" sx={{ fontSize: 64 }} />
      ) : (
        <InsertDriveFileOutlinedIcon color="action" sx={{ fontSize: 64 }} />
      )}
    </Box>
  );
};

const SmallThumbnail = ({ doc }: { doc: DocumentRecord }) => {
  const mimeType = doc.contentType ?? "";
  const isImage = mimeType.startsWith("image/");
  const isVideo = mimeType.startsWith("video/");
  const isPdf = mimeType === "application/pdf";

  return (
    <Box
      sx={{
        width: 40,
        height: 40,
        bgcolor: "action.hover",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 1,
        flexShrink: 0,
      }}
    >
      {isImage && doc.downloadUrl ? (
        <img
          src={doc.downloadUrl}
          alt={addExtIfMissing(doc.name, doc.contentType)}
          style={{ objectFit: "cover", width: "100%", height: "100%" }}
        />
      ) : isVideo ? (
        <OndemandVideoOutlinedIcon color="primary" sx={{ fontSize: 20 }} />
      ) : isPdf ? (
        <PictureAsPdfOutlinedIcon color="error" sx={{ fontSize: 20 }} />
      ) : (
        <InsertDriveFileOutlinedIcon color="action" sx={{ fontSize: 20 }} />
      )}
    </Box>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

const TipsPage = () => {
  const { user } = useAuth();
  const can = usePermissions();

  // Data
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [helpfulCounts, setHelpfulCounts] = useState<Record<string, number>>(
    () => loadHelpfulCounts()
  );

  // Filter state
  const [search, setSearch] = useState("");
  const [filterDivision, setFilterDivision] = useState<string>("");
  const [filterProduct, setFilterProduct] = useState<string>("");
  const [filterContentType, setFilterContentType] = useState<ContentTypeLabel | "All">("All");

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  // Add tip dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addContentType, setAddContentType] = useState<ContentTypeLabel>("Photo");
  const [addDivision, setAddDivision] = useState<string>("");
  const [addProduct, setAddProduct] = useState<string>("");
  const [addNotes, setAddNotes] = useState("");
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addDragOver, setAddDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Open/view dialog
  const [viewDoc, setViewDoc] = useState<DocumentRecord | null>(null);
  const [viewBlobUrl, setViewBlobUrl] = useState<string | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  // ── Load data ───────────────────────────────────────────────────────────────

  const loadDocs = async () => {
    setLoading(true);
    try {
      const all = await documentService.getDocuments();
      setDocs(all.filter((d) => d.type === "tips"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocs();
    productService.getProducts().then(setProducts).catch(() => {});
  }, []);

  // ── Derived data ────────────────────────────────────────────────────────────

  const divisions: string[] = Array.from(
    new Set(products.map((p) => p.divisionName ?? "").filter(Boolean))
  ).sort();

  const productsForDivision: Product[] = filterDivision
    ? products.filter((p) => p.divisionName === filterDivision)
    : products;

  const addProductsForDivision: Product[] = addDivision
    ? products.filter((p) => p.divisionName === addDivision)
    : products;

  // ── Filtering ───────────────────────────────────────────────────────────────

  const filtered = docs.filter((doc) => {
    const division = doc.customValues?.division ?? "";
    const product = doc.customValues?.product ?? "";
    const contentType = doc.customValues?.contentType ?? "";

    if (search) {
      const q = search.toLowerCase();
      const matchTitle = addExtIfMissing(doc.name, doc.contentType).toLowerCase().includes(q);
      const matchNotes = (doc.notes ?? "").toLowerCase().includes(q);
      const matchDivProd = `${division} ${product}`.toLowerCase().includes(q);
      if (!matchTitle && !matchNotes && !matchDivProd) return false;
    }

    if (filterDivision && division !== filterDivision) return false;
    if (filterProduct && product !== filterProduct) return false;
    if (filterContentType !== "All" && contentType !== filterContentType) return false;

    return true;
  });

  // ── Helpful count ───────────────────────────────────────────────────────────

  const toggleHelpful = (id: string) => {
    setHelpfulCounts((prev) => {
      const current = prev[id] ?? 0;
      const updated = { ...prev, [id]: current > 0 ? 0 : 1 };
      saveHelpfulCounts(updated);
      return updated;
    });
  };

  // ── Add Tip ─────────────────────────────────────────────────────────────────

  const resetAddForm = () => {
    setAddTitle("");
    setAddContentType("Photo");
    setAddDivision("");
    setAddProduct("");
    setAddNotes("");
    setAddFile(null);
  };

  const handleAddClose = () => {
    setAddOpen(false);
    resetAddForm();
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setAddDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setAddFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setAddFile(file);
  };

  const handleSaveTip = async () => {
    if (!addTitle.trim()) return;
    setSaving(true);
    try {
      const linkedTo =
        addDivision && addProduct
          ? `${addDivision} — ${addProduct}`
          : addDivision || addProduct || "General";

      const customValues: Record<string, string> = {
        contentType: addContentType,
        division: addDivision,
        product: addProduct,
      };

      if (addFile) {
        await documentService.uploadDocument(
          addFile,
          "tips",
          linkedTo,
          user?.fullName ?? undefined,
          addNotes || undefined,
          customValues
        );
      } else {
        await documentService.createDocument({
          id: "",
          name: addTitle.trim(),
          type: "tips",
          linkedTo,
          uploadedAt: new Date().toISOString(),
          createdBy: user?.fullName ?? null,
          notes: addNotes || null,
          customValues,
        });
      }

      await loadDocs();
      setAddOpen(false);
      resetAddForm();
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    await documentService.deleteDocument(id);
    await loadDocs();
  };

  // ── Open / View ─────────────────────────────────────────────────────────────

  const handleOpen = async (doc: DocumentRecord) => {
    setViewDoc(doc);
    setViewBlobUrl(null);
    if (doc.downloadUrl) {
      setViewLoading(true);
      try {
        const blobUrl = await documentService.openDocument(doc.downloadUrl);
        setViewBlobUrl(blobUrl);
      } finally {
        setViewLoading(false);
      }
    }
  };

  const handleViewClose = () => {
    setViewDoc(null);
    if (viewBlobUrl) {
      URL.revokeObjectURL(viewBlobUrl);
      setViewBlobUrl(null);
    }
  };

  // ── Render helpers ──────────────────────────────────────────────────────────

  const renderContentTypeChip = (label: string, size: "small" | "medium" = "small") => {
    const ct = label as ContentTypeLabel;
    const color: ChipColor = CHIP_COLORS[ct] ?? "default";
    return <Chip label={label} size={size} color={color} />;
  };

  // ── Card Grid View ──────────────────────────────────────────────────────────

  const renderCardGrid = () => (
    <Grid container spacing={2}>
      {filtered.map((doc) => {
        const division = doc.customValues?.division ?? "";
        const product = doc.customValues?.product ?? "";
        const contentType = doc.customValues?.contentType ?? "";
        const divProd = [division, product].filter(Boolean).join(" — ");
        const helpfulCount = helpfulCounts[doc.id] ?? 0;
        const isHelpful = helpfulCount > 0;

        return (
          <Grid item xs={12} sm={6} md={4} lg={3} key={doc.id}>
            <Card variant="outlined" sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
              <ThumbnailBox doc={doc} />
              <CardContent sx={{ flexGrow: 1, pb: 0 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" mb={0.5}>
                  {contentType ? renderContentTypeChip(contentType) : <span />}
                  {divProd && (
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 120 }}>
                      {divProd}
                    </Typography>
                  )}
                </Stack>
                <Typography
                  variant="subtitle2"
                  fontWeight={700}
                  sx={{
                    mt: 0.5,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {addExtIfMissing(doc.name, doc.contentType)}
                </Typography>
                {doc.createdBy && (
                  <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                    {doc.createdBy} &bull; {formatDate(doc.uploadedAt)}
                  </Typography>
                )}
                <Stack direction="row" alignItems="center" spacing={0.5} mt={1}>
                  <ThumbUpOutlinedIcon sx={{ fontSize: 14, color: isHelpful ? "primary.main" : "text.secondary" }} />
                  <Typography variant="caption" color={isHelpful ? "primary.main" : "text.secondary"}>
                    {helpfulCount}
                  </Typography>
                  <Tooltip title={isHelpful ? "Remove helpful mark" : "Mark as helpful"}>
                    <IconButton size="small" onClick={() => toggleHelpful(doc.id)} sx={{ ml: 0.5 }}>
                      <ThumbUpOutlinedIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </CardContent>
              <CardActions sx={{ pt: 0 }}>
                <Button size="small" startIcon={<OpenInNewOutlinedIcon />} onClick={() => handleOpen(doc)}>
                  Open
                </Button>
                {can.modifyData && (
                  <Tooltip title="Delete">
                    <IconButton size="small" color="error" onClick={() => handleDelete(doc.id)}>
                      <DeleteOutlineIcon />
                    </IconButton>
                  </Tooltip>
                )}
              </CardActions>
            </Card>
          </Grid>
        );
      })}
    </Grid>
  );

  // ── Table View ──────────────────────────────────────────────────────────────

  const renderTable = () => (
    <Paper variant="outlined">
      <TableContainer sx={{ overflowX: "auto" }}>
        <Table size="small" sx={{ minWidth: 900 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 48 }} />
              <TableCell>Title</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Division / Product</TableCell>
              <TableCell>Posted By</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((doc) => {
              const division = doc.customValues?.division ?? "";
              const product = doc.customValues?.product ?? "";
              const contentType = doc.customValues?.contentType ?? "";
              const divProd = [division, product].filter(Boolean).join(" — ");

              return (
                <TableRow key={doc.id} hover>
                  <TableCell>
                    <SmallThumbnail doc={doc} />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {addExtIfMissing(doc.name, doc.contentType)}
                    </Typography>
                    {doc.notes && (
                      <Typography variant="caption" color="text.secondary">
                        {doc.notes.slice(0, 60)}{doc.notes.length > 60 ? "…" : ""}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {contentType ? renderContentTypeChip(contentType) : "—"}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{divProd || "—"}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{doc.createdBy ?? "—"}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{formatDate(doc.uploadedAt)}</Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Button size="small" startIcon={<OpenInNewOutlinedIcon />} onClick={() => handleOpen(doc)}>
                        Open
                      </Button>
                      {can.modifyData && (
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error" onClick={() => handleDelete(doc.id)}>
                            <DeleteOutlineIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );

  // ── Open / View Dialog ──────────────────────────────────────────────────────

  const renderViewDialog = () => {
    if (!viewDoc) return null;
    const mimeType = viewDoc.contentType ?? "";
    const isImage = mimeType.startsWith("image/");
    const isVideo = mimeType.startsWith("video/");
    const division = viewDoc.customValues?.division ?? "";
    const product = viewDoc.customValues?.product ?? "";
    const divProd = [division, product].filter(Boolean).join(" — ");
    const contentType = viewDoc.customValues?.contentType ?? "";

    return (
      <Dialog open maxWidth="md" fullWidth onClose={handleViewClose}>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            {contentType && renderContentTypeChip(contentType, "medium")}
            <Typography variant="h6" component="span">
              {addExtIfMissing(viewDoc.name, viewDoc.contentType)}
            </Typography>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {viewLoading && (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress />
            </Box>
          )}
          {!viewLoading && viewBlobUrl && isImage && (
            <Box component="img" src={viewBlobUrl} alt={addExtIfMissing(viewDoc.name, viewDoc.contentType)} sx={{ maxWidth: "100%", borderRadius: 1 }} />
          )}
          {!viewLoading && viewBlobUrl && isVideo && (
            <Box component="video" controls src={viewBlobUrl} sx={{ width: "100%", borderRadius: 1 }} />
          )}
          {!viewLoading && viewBlobUrl && !isImage && !isVideo && (
            <Box
              component="iframe"
              src={viewBlobUrl}
              title={addExtIfMissing(viewDoc.name, viewDoc.contentType)}
              sx={{ width: "100%", height: 500, border: "none", borderRadius: 1 }}
            />
          )}
          {!viewLoading && !viewBlobUrl && !viewDoc.downloadUrl && (
            <Typography color="text.secondary" py={2}>
              No file attached to this tip.
            </Typography>
          )}
          <Divider sx={{ my: 2 }} />
          <Stack spacing={0.5}>
            {divProd && (
              <Typography variant="body2">
                <strong>Division / Product:</strong> {divProd}
              </Typography>
            )}
            {viewDoc.notes && (
              <Typography variant="body2">
                <strong>Notes:</strong> {viewDoc.notes}
              </Typography>
            )}
            {viewDoc.createdBy && (
              <Typography variant="caption" color="text.secondary">
                Posted by {viewDoc.createdBy} on {formatDate(viewDoc.uploadedAt)}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleViewClose}>Close</Button>
        </DialogActions>
      </Dialog>
    );
  };

  // ── Add Tip Dialog ──────────────────────────────────────────────────────────

  const renderAddDialog = () => (
    <Dialog open={addOpen} maxWidth="sm" fullWidth onClose={handleAddClose}>
      <DialogTitle>Add Tip</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {/* Title */}
          <TextField
            label="Title"
            required
            fullWidth
            value={addTitle}
            onChange={(e) => setAddTitle(e.target.value)}
          />

          {/* Content Type */}
          <FormControl fullWidth>
            <Typography variant="caption" color="text.secondary" mb={0.5}>
              Content Type
            </Typography>
            <Select
              value={addContentType}
              onChange={(e) => setAddContentType(e.target.value as ContentTypeLabel)}
              size="small"
            >
              {CONTENT_TYPES.map((ct) => (
                <MenuItem key={ct} value={ct}>
                  {ct}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Division */}
          <FormControl fullWidth>
            <Typography variant="caption" color="text.secondary" mb={0.5}>
              Division
            </Typography>
            <Select
              value={addDivision}
              onChange={(e) => {
                setAddDivision(e.target.value);
                setAddProduct("");
              }}
              size="small"
              displayEmpty
            >
              <MenuItem value="">All Divisions</MenuItem>
              {divisions.map((d) => (
                <MenuItem key={d} value={d}>
                  {d}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Product */}
          <Autocomplete
            options={addProductsForDivision}
            getOptionLabel={(p) => p.name}
            value={addProductsForDivision.find((p) => p.name === addProduct) ?? null}
            onChange={(_, val) => setAddProduct(val?.name ?? "")}
            renderInput={(params) => (
              <TextField {...params} label="Product" size="small" />
            )}
          />

          {/* Notes */}
          <TextField
            label="Notes"
            fullWidth
            multiline
            rows={3}
            value={addNotes}
            onChange={(e) => setAddNotes(e.target.value)}
          />

          {/* File Upload */}
          <Box>
            <Typography variant="caption" color="text.secondary" mb={0.5} display="block">
              File (optional)
            </Typography>
            <Box
              onDragOver={(e) => {
                e.preventDefault();
                setAddDragOver(true);
              }}
              onDragLeave={() => setAddDragOver(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              sx={{
                border: "2px dashed",
                borderColor: addDragOver ? "primary.main" : "divider",
                borderRadius: 1,
                p: 3,
                textAlign: "center",
                cursor: "pointer",
                bgcolor: addDragOver ? "action.hover" : "background.paper",
                transition: "border-color 0.2s, background-color 0.2s",
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,application/pdf,.dwg"
                style={{ display: "none" }}
                onChange={handleFileInput}
              />
              {addFile ? (
                <Stack alignItems="center" spacing={0.5}>
                  <InsertDriveFileOutlinedIcon color="primary" />
                  <Typography variant="body2" fontWeight={600}>
                    {addFile.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatBytes(addFile.size)}
                  </Typography>
                </Stack>
              ) : (
                <Stack alignItems="center" spacing={0.5}>
                  <UploadFileOutlinedIcon color="action" sx={{ fontSize: 36 }} />
                  <Typography variant="body2" color="text.secondary">
                    Drag & drop or click to browse
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Accepts: images, videos, PDF, .dwg
                  </Typography>
                </Stack>
              )}
            </Box>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleAddClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSaveTip}
          disabled={saving || !addTitle.trim()}
          startIcon={saving ? <CircularProgress size={16} /> : undefined}
        >
          Save Tip
        </Button>
      </DialogActions>
    </Dialog>
  );

  // ── Page ────────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" mb={2}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Tips &amp; Tricks
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Field knowledge base — pinouts, configs, how-to guides
          </Typography>
        </Box>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Tooltip title="Card grid">
            <IconButton
              color={viewMode === "grid" ? "primary" : "default"}
              onClick={() => setViewMode("grid")}
            >
              <GridViewOutlinedIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Table view">
            <IconButton
              color={viewMode === "table" ? "primary" : "default"}
              onClick={() => setViewMode("table")}
            >
              <TableRowsOutlinedIcon />
            </IconButton>
          </Tooltip>
          <QRUploadButton
            docType="tips"
            linkedTo="General"
            onUploaded={() => loadDocs()}
          />
          <Button
            variant="contained"
            startIcon={<AddOutlinedIcon />}
            onClick={() => setAddOpen(true)}
          >
            Add Tip
          </Button>
        </Stack>
      </Stack>

      {/* Filter bar */}
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" alignItems="center">
            {/* Search */}
            <TextField
              placeholder="Search tips…"
              size="small"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ flex: 1, minWidth: 200 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlinedIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />

            {/* Division */}
            <Select
              value={filterDivision}
              onChange={(e) => {
                setFilterDivision(e.target.value);
                setFilterProduct("");
              }}
              size="small"
              displayEmpty
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="">All Divisions</MenuItem>
              {divisions.map((d) => (
                <MenuItem key={d} value={d}>
                  {d}
                </MenuItem>
              ))}
            </Select>

            {/* Product */}
            <Autocomplete
              options={productsForDivision}
              getOptionLabel={(p) => p.name}
              value={productsForDivision.find((p) => p.name === filterProduct) ?? null}
              onChange={(_, val) => setFilterProduct(val?.name ?? "")}
              sx={{ minWidth: 180 }}
              size="small"
              renderInput={(params) => (
                <TextField {...params} placeholder="All Products" />
              )}
            />
          </Stack>

          {/* Content type chip bar */}
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Chip
              label="All"
              clickable
              variant={filterContentType === "All" ? "filled" : "outlined"}
              color={filterContentType === "All" ? "primary" : "default"}
              onClick={() => setFilterContentType("All")}
            />
            {CONTENT_TYPES.map((ct) => (
              <Chip
                key={ct}
                label={ct}
                clickable
                variant={filterContentType === ct ? "filled" : "outlined"}
                color={filterContentType === ct ? CHIP_COLORS[ct] : "default"}
                onClick={() => setFilterContentType(ct)}
              />
            ))}
          </Stack>
        </Stack>
      </Paper>

      {/* Content area */}
      {loading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : filtered.length === 0 ? (
        <Box textAlign="center" py={6}>
          <Typography color="text.secondary">
            No tips found. Try adjusting filters or add a new tip.
          </Typography>
        </Box>
      ) : viewMode === "grid" ? (
        renderCardGrid()
      ) : (
        renderTable()
      )}

      {/* Dialogs */}
      {renderAddDialog()}
      {renderViewDialog()}
    </Box>
  );
};

export default TipsPage;
