import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useServerRecovery } from "../../hooks/useServerRecovery";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputAdornment,
  MenuItem,
  Rating,
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
import {
  AddOutlined,
  CloseOutlined,
  DeleteOutline,
  DownloadOutlined,
  EditOutlined,
  FilterListOutlined,
  GridViewOutlined,
  InsertDriveFileOutlined,
  LightbulbOutlined,
  RefreshOutlined,
  SearchOutlined,
  TableRowsOutlined,
  UploadFileOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";
import { documentService, type DocumentRecord } from "../../services/documentService";
import { productService } from "../../services/productService";
import { projectAssetService } from "../../services/projectAssetService";
import { useAuth } from "../../hooks/useAuth";
import { usePermissions } from "../../hooks/usePermissions";
import { useOfflineMode } from "../../contexts/OfflineModeContext";
import { isMobileNativePlatform } from "../../utils/platform";
import QRUploadButton from "../../components/QRUploadButton";
import DocThumbnail from "../../components/ui/DocThumbnail";
import { TIPS_UPLOAD_ACCEPT } from "../../utils/documentFileTypes";
import { filterDocumentsForTips } from "../../utils/documentScope";
import type { Product } from "../../types/product";
import {
  buildTipCustomValues,
  formatRatingSummary,
  isStaleTip,
  resolveTipLinkedTo,
  sortTips,
  STALE_TIP_MONTHS,
  TIP_SORT_LABELS,
  viewCountOf,
  type TipSort,
} from "./tipsLibrary";

const MobileDocumentPreviewDialog = lazy(() => import("../../components/ui/MobileDocumentPreviewDialog"));

type ContentTypeLabel =
  | "Photo"
  | "Video"
  | "Drawing"
  | "Pinout"
  | "Config"
  | "Procedure"
  | "Tip";

type ViewMode = "grid" | "table";

const CONTENT_TYPES: ContentTypeLabel[] = [
  "Photo",
  "Video",
  "Drawing",
  "Pinout",
  "Config",
  "Procedure",
  "Tip",
];

function fmtSize(bytes?: number | null) {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso?: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function getDocProductId(doc: DocumentRecord) {
  return doc.customValues?.productId || doc.linkedTo || "";
}

function getDocProductLabel(doc: DocumentRecord, productNameById: Map<string, string>) {
  const productId = getDocProductId(doc);
  return (
    doc.customValues?.productLabel ||
    doc.customValues?.product ||
    (productId ? productNameById.get(productId) : "") ||
    doc.linkedTo ||
    ""
  );
}

export default function TipsAndTricksPage() {
  const { user } = useAuth();
  const can = usePermissions();
  const { isOfflineMode } = useOfflineMode();
  // Tips now has its own Tier-2 flags. It used to read the `documents` ones, which meant
  // you could not grant tips authoring without also granting document upload/delete.
  const canViewTips = can.tips.view;
  const canUploadTips = can.tips.create;
  const canDeleteTips = can.tips.delete;
  // tips.edit existed in the permission model but had no UI behind it until now.
  const canEditTips = can.tips.edit;
  const canReviewUsage = user?.role === "Admin" || user?.role === "Project Manager";

  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [myProductIds, setMyProductIds] = useState<string[]>([]);
  const [productFilter, setProductFilter] = useState<string>("__mine__");
  const [filterDivision, setFilterDivision] = useState("");
  const [filterProduct, setFilterProduct] = useState("");
  const [filterContentType, setFilterContentType] = useState<ContentTypeLabel | "All">("All");
  const [sort, setSort] = useState<TipSort>("newest");
  const [staleOnly, setStaleOnly] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [previewDoc, setPreviewDoc] = useState<DocumentRecord | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addContentType, setAddContentType] = useState<ContentTypeLabel>("Photo");
  const [addDivision, setAddDivision] = useState("");
  const [addProductId, setAddProductId] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addDragOver, setAddDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editDoc, setEditDoc] = useState<DocumentRecord | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContentType, setEditContentType] = useState<ContentTypeLabel>("Photo");
  const [editDivision, setEditDivision] = useState("");
  const [editProductId, setEditProductId] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const loadDocs = async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await documentService.getDocuments();
      setDocs(filterDocumentsForTips(all));
    } catch {
      if (!isMobileNativePlatform() || !isOfflineMode) {
        setError("Could not load documents. Make sure the server is reachable.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocs();
    productService.getProducts().then(setProducts).catch(() => {});
  }, []);

  // Native document reads fast-bail while the server is flagged unreachable, so
  // a page that loaded during that window would otherwise stay empty forever.
  useServerRecovery(() => { void loadDocs(); });

  useEffect(() => {
    const isPmUser = user?.role === "Project Manager";
    const canActAsFieldTechnician = !!can.installationAssets?.runWorkflow && !can.viewOnly;
    if (isPmUser || canActAsFieldTechnician) {
      projectAssetService
        .myProjectIds()
        .then(async (projectIds) => {
          if (!projectIds.length) return;
          const assetArrays = await Promise.all(
            projectIds.map((id) => projectAssetService.listByProject(id).catch(() => []))
          );
          const ids = Array.from(new Set(assetArrays.flat().map((a) => a.productId).filter(Boolean)));
          setMyProductIds(ids);
        })
        .catch(() => {});
    }
  }, [can.installationAssets?.runWorkflow, can.viewOnly, user?.role]);

  const productNameById = useMemo(
    () => new Map(products.map((product) => [product.id, product.name])),
    [products]
  );

  const myProductNameSet = useMemo(
    () => new Set(myProductIds.map((id) => productNameById.get(id)).filter(Boolean) as string[]),
    [myProductIds, productNameById]
  );

  const productFilterOptions = useMemo(
    () =>
      Array.from(
        new Map(
          docs
            .map((doc) => {
              const value = getDocProductId(doc);
              const label = getDocProductLabel(doc, productNameById);
              return value && label ? [value, label] : null;
            })
            .filter(Boolean) as Array<[string, string]>
        ).entries()
      )
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [docs, productNameById]
  );

  const divisions = useMemo(
    () => Array.from(new Set(products.map((p) => p.divisionName ?? "").filter(Boolean))).sort(),
    [products]
  );

  const productsForDivision = useMemo(
    () => (filterDivision ? products.filter((p) => p.divisionName === filterDivision) : products),
    [filterDivision, products]
  );

  const addProductsForDivision = useMemo(
    () => (addDivision ? products.filter((p) => p.divisionName === addDivision) : products),
    [addDivision, products]
  );

  const editProductsForDivision = useMemo(
    () => (editDivision ? products.filter((p) => p.divisionName === editDivision) : products),
    [editDivision, products]
  );

  // Phone uploads used to land as untyped tips linked to "General". Passing the
  // active division/product filters through the token means a QR upload arrives
  // already classified when the user has narrowed the view.
  const qrUploadMetadata = useMemo(() => {
    const product = products.find((p) => p.id === filterProduct);
    const metadata = {
      contentType: filterContentType === "All" ? "Photo" : filterContentType,
      division: filterDivision,
      productId: product?.id,
      productName: product?.name,
    };
    return {
      linkedTo: resolveTipLinkedTo(metadata),
      customValuesJson: JSON.stringify(buildTipCustomValues(metadata)),
    };
  }, [filterContentType, filterDivision, filterProduct, products]);

  const filteredDocs = useMemo(() => {
    let result = docs;

    if (productFilter === "__mine__" && myProductIds.length > 0) {
      const mine = result.filter((doc) => {
        const productId = getDocProductId(doc);
        const productLabel = getDocProductLabel(doc, productNameById);
        return myProductIds.includes(productId) || myProductNameSet.has(productLabel);
      });
      if (mine.length > 0) result = mine;
    } else if (productFilter !== "__all__" && productFilter !== "__mine__") {
      result = result.filter((doc) => getDocProductId(doc) === productFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((doc) => {
        const division = doc.customValues?.division ?? "";
        const product = getDocProductLabel(doc, productNameById);
        return (
          doc.name.toLowerCase().includes(q) ||
          (doc.notes ?? "").toLowerCase().includes(q) ||
          `${division} ${product} ${doc.linkedTo ?? ""}`.toLowerCase().includes(q)
        );
      });
    }

    if (filterDivision) {
      result = result.filter((doc) => (doc.customValues?.division ?? "") === filterDivision);
    }

    if (filterProduct) {
      result = result.filter((doc) => getDocProductId(doc) === filterProduct);
    }

    if (filterContentType !== "All") {
      result = result.filter((doc) => (doc.customValues?.contentType ?? "") === filterContentType);
    }

    if (staleOnly) {
      result = result.filter((doc) => isStaleTip(doc));
    }

    return sortTips(result, sort);
  }, [docs, filterContentType, filterDivision, filterProduct, myProductIds, myProductNameSet, productFilter, productNameById, search, sort, staleOnly]);

  const staleCount = useMemo(() => docs.filter((doc) => isStaleTip(doc)).length, [docs]);

  const myMatches = useMemo(
    () =>
      docs.filter((doc) => {
        const productId = getDocProductId(doc);
        const productLabel = getDocProductLabel(doc, productNameById);
        return myProductIds.includes(productId) || myProductNameSet.has(productLabel);
      }).length,
    [docs, myProductIds, myProductNameSet, productNameById]
  );

  const featuredTips = useMemo(() => filteredDocs.slice(0, 3), [filteredDocs]);

  const resetAddForm = () => {
    setAddTitle("");
    setAddContentType("Photo");
    setAddDivision("");
    setAddProductId("");
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
    if (!canUploadTips) return;
    if (!addTitle.trim()) return;
    setSaving(true);
    try {
      const selectedProduct = products.find((product) => product.id === addProductId);
      const metadata = {
        contentType: addContentType,
        division: addDivision,
        productId: selectedProduct?.id,
        productName: selectedProduct?.name,
      };
      const linkedTo = resolveTipLinkedTo(metadata);
      const customValues = buildTipCustomValues(metadata);

      if (addFile) {
        const uploaded = await documentService.uploadDocument(
          addFile,
          "tips",
          linkedTo,
          user?.fullName ?? undefined,
          addNotes || undefined,
          customValues
        );
        // Upload stores the file name; the Title the user typed was discarded.
        const title = addTitle.trim();
        if (title && title !== uploaded.name) {
          await documentService.updateDocument(uploaded.id, { ...uploaded, name: title });
        }
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
      handleAddClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!canDeleteTips) return;
    await documentService.deleteDocument(id);
    await loadDocs();
  };

  /**
   * Opening the preview is what counts as a "view". The counter is patched into
   * local state from the response so the card updates without a full reload.
   */
  const handleOpenPreview = (doc: DocumentRecord) => {
    setPreviewDoc(doc);
    void documentService.recordDocumentView(doc.id).then((usage) => {
      if (!usage) return;
      setDocs((prev) =>
        prev.map((item) =>
          item.id === doc.id
            ? { ...item, viewCount: usage.viewCount, lastViewedAtUtc: usage.lastViewedAtUtc }
            : item,
        ),
      );
    });
  };

  const handleRate = async (doc: DocumentRecord, stars: number | null) => {
    try {
      const usage = stars === null
        ? await documentService.clearDocumentRating(doc.id)
        : await documentService.rateDocument(doc.id, stars);
      setDocs((prev) =>
        prev.map((item) =>
          item.id === doc.id
            ? {
                ...item,
                ratingAverage: usage.ratingAverage,
                ratingCount: usage.ratingCount,
                myRating: usage.myRating ?? null,
              }
            : item,
        ),
      );
    } catch {
      setError("Could not save your rating. Check the connection and try again.");
    }
  };

  const handleEditOpen = (doc: DocumentRecord) => {
    setEditDoc(doc);
    setEditTitle(doc.name ?? "");
    setEditContentType((doc.customValues?.contentType as ContentTypeLabel) || "Tip");
    setEditDivision(doc.customValues?.division ?? "");
    setEditProductId(getDocProductId(doc));
    setEditNotes(doc.notes ?? "");
    setEditFile(null);
    setEditError(null);
  };

  const handleEditClose = () => {
    setEditDoc(null);
    setEditFile(null);
    setEditError(null);
  };

  const handleEditSave = async () => {
    if (!editDoc || !canEditTips) return;
    const title = editTitle.trim();
    if (!title) {
      setEditError("Title is required.");
      return;
    }

    setSaving(true);
    setEditError(null);
    try {
      const selectedProduct = products.find((product) => product.id === editProductId);
      const metadata = {
        contentType: editContentType,
        division: editDivision,
        productId: selectedProduct?.id,
        productName: selectedProduct?.name,
      };

      // Replace the blob first: it also rewrites contentType/fileSize, which the
      // metadata update below would otherwise overwrite with the old values.
      if (editFile) {
        await documentService.replaceDocumentFile(editDoc.id, editFile, { keepName: true });
      }

      await documentService.updateDocument(editDoc.id, {
        ...editDoc,
        name: title,
        type: "tips",
        linkedTo: resolveTipLinkedTo(metadata),
        uploadedAt: editDoc.uploadedAt,
        contentType: editFile ? editFile.type : editDoc.contentType,
        fileSize: editFile ? editFile.size : editDoc.fileSize,
        notes: editNotes || null,
        customValues: buildTipCustomValues(metadata),
        customValuesJson: undefined,
      });

      await loadDocs();
      handleEditClose();
    } catch {
      setEditError("Could not save changes. Check the connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const renderAddDialog = () => (
    <Dialog open={addOpen} maxWidth="sm" fullWidth onClose={handleAddClose}>
      <DialogTitle>Add Tip</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Title"
            required
            fullWidth
            value={addTitle}
            onChange={(e) => setAddTitle(e.target.value)}
          />

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

          <FormControl fullWidth>
            <Typography variant="caption" color="text.secondary" mb={0.5}>
              Division
            </Typography>
            <Select
              value={addDivision}
              onChange={(e) => {
                setAddDivision(e.target.value);
                setAddProductId("");
              }}
              size="small"
              displayEmpty
            >
              <MenuItem value="">All Divisions</MenuItem>
              {divisions.map((division) => (
                <MenuItem key={division} value={division}>
                  {division}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Autocomplete
            options={addProductsForDivision}
            getOptionLabel={(product) => product.name}
            value={addProductsForDivision.find((product) => product.id === addProductId) ?? null}
            onChange={(_, next) => setAddProductId(next?.id ?? "")}
            renderInput={(params) => <TextField {...params} label="Product" size="small" />}
          />

          <TextField
            label="Notes"
            fullWidth
            multiline
            rows={3}
            value={addNotes}
            onChange={(e) => setAddNotes(e.target.value)}
          />

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
                accept={TIPS_UPLOAD_ACCEPT}
                style={{ display: "none" }}
                onChange={handleFileInput}
              />
              {addFile ? (
                <Stack alignItems="center" spacing={0.5}>
                  <InsertDriveFileOutlined color="primary" />
                  <Typography variant="body2" fontWeight={600}>
                    {addFile.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {fmtSize(addFile.size)}
                  </Typography>
                </Stack>
              ) : (
                <Stack alignItems="center" spacing={0.5}>
                  <UploadFileOutlined color="action" sx={{ fontSize: 36 }} />
                  <Typography variant="body2" color="text.secondary">
                    Drag & drop or click to browse
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Accepts: images, videos, PDF, Office docs, spreadsheets, JSON, CAD (.dwg/.dxf)
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

  const renderEditDialog = () => (
    <Dialog open={Boolean(editDoc)} maxWidth="sm" fullWidth onClose={handleEditClose}>
      <DialogTitle>Edit Tip</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {editError && <Alert severity="error">{editError}</Alert>}

          <TextField
            label="Title"
            required
            fullWidth
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
          />

          <FormControl fullWidth>
            <Typography variant="caption" color="text.secondary" mb={0.5}>
              Content Type
            </Typography>
            <Select
              value={editContentType}
              onChange={(e) => setEditContentType(e.target.value as ContentTypeLabel)}
              size="small"
            >
              {CONTENT_TYPES.map((ct) => (
                <MenuItem key={ct} value={ct}>
                  {ct}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <Typography variant="caption" color="text.secondary" mb={0.5}>
              Division
            </Typography>
            <Select
              value={editDivision}
              onChange={(e) => {
                setEditDivision(e.target.value);
                setEditProductId("");
              }}
              size="small"
              displayEmpty
            >
              <MenuItem value="">All Divisions</MenuItem>
              {divisions.map((division) => (
                <MenuItem key={division} value={division}>
                  {division}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Autocomplete
            options={editProductsForDivision}
            getOptionLabel={(product) => product.name}
            value={editProductsForDivision.find((product) => product.id === editProductId) ?? null}
            onChange={(_, next) => setEditProductId(next?.id ?? "")}
            renderInput={(params) => <TextField {...params} label="Product" size="small" />}
          />

          <TextField
            label="Notes"
            fullWidth
            multiline
            rows={3}
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
          />

          <Box>
            <Typography variant="caption" color="text.secondary" mb={0.5} display="block">
              Replace file (optional)
            </Typography>
            <Box
              onClick={() => editFileInputRef.current?.click()}
              sx={{
                border: "2px dashed",
                borderColor: "divider",
                borderRadius: 1,
                p: 2,
                textAlign: "center",
                cursor: "pointer",
              }}
            >
              <input
                ref={editFileInputRef}
                type="file"
                accept={TIPS_UPLOAD_ACCEPT}
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setEditFile(file);
                }}
              />
              {editFile ? (
                <Stack alignItems="center" spacing={0.5}>
                  <InsertDriveFileOutlined color="primary" />
                  <Typography variant="body2" fontWeight={600}>
                    {editFile.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {fmtSize(editFile.size)} — replaces the current file
                  </Typography>
                </Stack>
              ) : (
                <Stack alignItems="center" spacing={0.5}>
                  <UploadFileOutlined color="action" sx={{ fontSize: 28 }} />
                  <Typography variant="body2" color="text.secondary">
                    {editDoc?.downloadUrl ? "Click to upload a new version" : "Click to attach a file"}
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    Views and ratings are kept when the file is replaced
                  </Typography>
                </Stack>
              )}
            </Box>
          </Box>

          {editDoc && (
            <Typography variant="caption" color="text.disabled">
              {viewCountOf(editDoc)} view{viewCountOf(editDoc) === 1 ? "" : "s"} · Rating {formatRatingSummary(editDoc)}
              {editDoc.createdBy ? ` · Added by ${editDoc.createdBy}` : ""}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleEditClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleEditSave}
          disabled={saving || !editTitle.trim()}
          startIcon={saving ? <CircularProgress size={16} /> : undefined}
        >
          Save Changes
        </Button>
      </DialogActions>
    </Dialog>
  );

  const renderGrid = () => (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "repeat(3, minmax(0, 1fr))",
          sm: "repeat(3, minmax(0, 1fr))",
          md: "repeat(4, minmax(0, 1fr))",
          xl: "repeat(5, minmax(0, 1fr))",
        },
        gap: { xs: 1, sm: 1.5, lg: 2 },
      }}
    >
      {filteredDocs.map((doc) => (
          <Card
            key={doc.id}
            className="glass-card"
            elevation={0}
            sx={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              border: "1px solid var(--stroke)",
              background: "linear-gradient(180deg, rgba(10,18,24,0.96), rgba(8,14,19,0.99))",
              borderRadius: 3,
              overflow: "hidden",
              minWidth: 0,
              transition: "transform 0.2s, border-color 0.2s, background 0.2s",
              "&:hover": {
                borderColor: "rgba(45,212,191,0.4)",
                background: "rgba(45,212,191,0.06)",
                transform: "translateY(-2px)",
              },
            }}
          >
            <CardActionArea
              onClick={() => handleOpenPreview(doc)}
              sx={{ flexGrow: 1, display: "flex", flexDirection: "column", alignItems: "flex-start" }}
            >
              {doc.downloadUrl && (
                <DocThumbnail
                  downloadUrl={doc.downloadUrl}
                  contentType={doc.contentType}
                  height={104}
                />
              )}

              <CardContent sx={{ width: "100%", p: 1.2 }}>
                <Chip
                  label={doc.customValues?.contentType || "Tip"}
                  size="small"
                  sx={{
                    height: 20,
                    mb: 0.9,
                    bgcolor: "rgba(245,158,11,0.12)",
                    color: "#fcd34d",
                    fontSize: "0.62rem",
                  }}
                />
                <Typography
                  variant="body2"
                  fontWeight={700}
                  sx={{ display: "block", lineHeight: 1.3, mb: 0.4, minWidth: 0 }}
                  className="line-clamp-2"
                >
                  {doc.name}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                  sx={{ lineHeight: 1.35, minWidth: 0 }}
                  className="line-clamp-2"
                >
                  {[doc.customValues?.division, getDocProductLabel(doc, productNameById)].filter(Boolean).join(" • ") || "General"}
                </Typography>
                {doc.notes && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", lineHeight: 1.35, mt: 0.65, minWidth: 0 }}
                    className="line-clamp-2"
                  >
                    {doc.notes}
                  </Typography>
                )}
              </CardContent>
            </CardActionArea>

            {/* Action footer lives OUTSIDE CardActionArea: nesting IconButtons
                (each a <button>) inside the card's <button> (CardActionArea) is
                invalid DOM. Kept at the card bottom to preserve the layout, and
                since these are no longer inside the click target, the previous
                e.stopPropagation() guards are no longer needed. */}
            <Box sx={{ px: 1.5, pb: 1.5 }}>
              <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.5, minWidth: 0 }}>
                <Rating
                  size="small"
                  value={doc.myRating ?? doc.ratingAverage ?? 0}
                  precision={doc.myRating ? 1 : 0.5}
                  onChange={(_, next) => void handleRate(doc, next)}
                  sx={{ fontSize: "0.9rem" }}
                />
                <Typography variant="caption" sx={{ color: "text.disabled", whiteSpace: "nowrap" }}>
                  {formatRatingSummary(doc)}
                </Typography>
              </Stack>
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={0.5}>
                <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
                  <Tooltip title={`${viewCountOf(doc)} view${viewCountOf(doc) === 1 ? "" : "s"}`}>
                    <Stack direction="row" alignItems="center" spacing={0.25}>
                      <VisibilityOutlined sx={{ fontSize: 13, color: "text.disabled" }} />
                      <Typography variant="caption" sx={{ color: "text.disabled" }}>
                        {viewCountOf(doc)}
                      </Typography>
                    </Stack>
                  </Tooltip>
                  {fmtSize(doc.fileSize) && (
                    <Typography variant="caption" sx={{ color: "text.disabled", minWidth: 0 }}>
                      {fmtSize(doc.fileSize)}
                    </Typography>
                  )}
                </Stack>
                <Stack direction="row" spacing={0.25} sx={{ ml: "auto" }}>
                  {doc.downloadUrl && canViewTips && (
                    <IconButton
                      size="small"
                      onClick={() => void documentService.downloadDocument(doc.downloadUrl!, doc.name)}
                      sx={{ p: 0.25 }}
                    >
                      <DownloadOutlined sx={{ fontSize: 14, color: "text.disabled" }} />
                    </IconButton>
                  )}
                  {canEditTips && (
                    <IconButton size="small" onClick={() => handleEditOpen(doc)} sx={{ p: 0.25 }}>
                      <EditOutlined sx={{ fontSize: 15, color: "text.disabled" }} />
                    </IconButton>
                  )}
                  {canDeleteTips && (
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => void handleDelete(doc.id)}
                      sx={{ p: 0.25 }}
                    >
                      <DeleteOutline sx={{ fontSize: 16 }} />
                    </IconButton>
                  )}
                  {!((doc.downloadUrl && canViewTips) || canEditTips || canDeleteTips) && (
                    <Typography variant="caption" color="text.disabled">
                      No actions
                    </Typography>
                  )}
                </Stack>
              </Stack>
            </Box>
          </Card>
      ))}
    </Box>
  );

  const renderTable = () => (
    <Box className="glass-card" sx={{ overflow: "hidden" }}>
      <TableContainer sx={{ overflowX: "auto" }}>
        <Table size="small" sx={{ minWidth: 960 }}>
          <TableHead>
            <TableRow>
              <TableCell>Title</TableCell>
              <TableCell>Division</TableCell>
              <TableCell>Product</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Linked To</TableCell>
              <TableCell>Posted By</TableCell>
              <TableCell>Date</TableCell>
              <TableCell align="right">Views</TableCell>
              <TableCell>Rating</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredDocs.map((doc) => (
              <TableRow key={doc.id} hover>
                <TableCell>
                  <Box sx={{ minWidth: 220 }}>
                    <Typography variant="body2" fontWeight={600}>
                      {doc.name}
                    </Typography>
                    {doc.notes && (
                      <Typography variant="caption" color="text.secondary">
                        {doc.notes.length > 70 ? `${doc.notes.slice(0, 70)}...` : doc.notes}
                      </Typography>
                    )}
                  </Box>
                </TableCell>
                <TableCell>{doc.customValues?.division || "-"}</TableCell>
                <TableCell>{getDocProductLabel(doc, productNameById) || "-"}</TableCell>
                <TableCell>{doc.customValues?.contentType || "-"}</TableCell>
                <TableCell>{getDocProductLabel(doc, productNameById) || doc.linkedTo || "-"}</TableCell>
                <TableCell>{doc.createdBy || "-"}</TableCell>
                <TableCell>{fmtDate(doc.uploadedAt) || "-"}</TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
                    <Typography variant="body2">{viewCountOf(doc)}</Typography>
                    {isStaleTip(doc) && (
                      <Tooltip title={`No opens in ${STALE_TIP_MONTHS} months`}>
                        <Chip label="Unused" size="small" color="warning" variant="outlined" sx={{ height: 18, fontSize: "0.6rem" }} />
                      </Tooltip>
                    )}
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Rating
                      size="small"
                      value={doc.myRating ?? doc.ratingAverage ?? 0}
                      precision={doc.myRating ? 1 : 0.5}
                      onChange={(_, next) => void handleRate(doc, next)}
                      sx={{ fontSize: "0.85rem" }}
                    />
                    <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: "nowrap" }}>
                      {formatRatingSummary(doc)}
                    </Typography>
                  </Stack>
                </TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    {canViewTips && (
                      <Button size="small" onClick={() => handleOpenPreview(doc)}>
                        Open
                      </Button>
                    )}
                    {doc.downloadUrl && canViewTips && (
                      <Button size="small" onClick={() => void documentService.downloadDocument(doc.downloadUrl!, doc.name)}>
                        Download
                      </Button>
                    )}
                    {canEditTips && (
                      <Button size="small" onClick={() => handleEditOpen(doc)}>
                        Edit
                      </Button>
                    )}
                    {canDeleteTips && (
                      <Button size="small" color="error" onClick={() => void handleDelete(doc.id)}>
                        Delete
                      </Button>
                    )}
                    {!(canViewTips || canEditTips || canDeleteTips) && (
                      <Typography variant="caption" color="text.disabled">
                        No actions
                      </Typography>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );

  return (
    <Stack spacing={3} sx={{ pb: 6 }}>
      <Box className="glass-card" sx={{ p: { xs: 1.5, sm: 2 }, background: "linear-gradient(135deg, rgba(8,18,24,0.98), rgba(12,28,36,0.94))" }}>
        <Stack
          direction={{ xs: "column", lg: "row" }}
          alignItems={{ lg: "center" }}
          justifyContent="space-between"
          spacing={1.5}
        >
          <Box>
            <Stack direction="row" alignItems="center" spacing={1}>
              <LightbulbOutlined sx={{ color: "#f59e0b", fontSize: 22, flexShrink: 0 }} />
              <Typography variant="h5" sx={{ fontFamily: "Sora" }}>
                Tips & Tricks
              </Typography>
              <Tooltip title="Refresh">
                <IconButton size="small" onClick={loadDocs} disabled={loading}>
                  {loading ? <CircularProgress size={16} /> : <RefreshOutlined fontSize="small" />}
                </IconButton>
              </Tooltip>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ display: { xs: "block", md: "block" }, maxWidth: 680 }}>
              Field notes, pinouts, drawings, and quick references shared across products and projects.
            </Typography>
          </Box>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
            <Box className="glass-card" sx={{ px: 0.5, py: 0.25, display: "flex", alignItems: "center", gap: 0.5 }}>
              <Tooltip title="Card grid">
                <IconButton size="small" color={viewMode === "grid" ? "primary" : "default"} onClick={() => setViewMode("grid")}>
                  <GridViewOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Table view">
                <IconButton size="small" color={viewMode === "table" ? "primary" : "default"} onClick={() => setViewMode("table")}>
                  <TableRowsOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>

            {canUploadTips && (
              <>
                <QRUploadButton
                  key={`${qrUploadMetadata.linkedTo}:${qrUploadMetadata.customValuesJson ?? ""}`}
                  docType="tips"
                  linkedTo={qrUploadMetadata.linkedTo}
                  customValuesJson={qrUploadMetadata.customValuesJson}
                  onUploaded={() => void loadDocs()}
                />
                <Button variant="contained" startIcon={<AddOutlined />} onClick={() => setAddOpen(true)}>
                  Add Tip
                </Button>
              </>
            )}
          </Stack>
        </Stack>

        <Box
          sx={{
            mt: 1.75,
            display: "grid",
            gridTemplateColumns: { xs: "repeat(3, minmax(0, 1fr))", md: "repeat(3, minmax(0, 1fr))" },
            gap: 1,
          }}
        >
          <Box sx={{ borderRadius: 2.5, p: 1.25, bgcolor: "rgba(45,212,191,0.08)", border: "1px solid rgba(45,212,191,0.18)" }}>
            <Typography variant="caption" sx={{ color: "rgba(153,246,228,0.84)", textTransform: "uppercase", letterSpacing: 0.8 }}>
              Total
            </Typography>
            <Typography variant="h6" sx={{ mt: 0.25 }}>
              {docs.length}
            </Typography>
          </Box>
          <Box sx={{ borderRadius: 2.5, p: 1.25, bgcolor: "rgba(14,165,233,0.08)", border: "1px solid rgba(14,165,233,0.18)" }}>
            <Typography variant="caption" sx={{ color: "rgba(125,211,252,0.88)", textTransform: "uppercase", letterSpacing: 0.8 }}>
              Visible
            </Typography>
            <Typography variant="h6" sx={{ mt: 0.25 }}>
              {filteredDocs.length}
            </Typography>
          </Box>
          <Box sx={{ borderRadius: 2.5, p: 1.25, bgcolor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)" }}>
            <Typography variant="caption" sx={{ color: "rgba(253,224,71,0.88)", textTransform: "uppercase", letterSpacing: 0.8 }}>
              My Match
            </Typography>
            <Typography variant="h6" sx={{ mt: 0.25 }}>
              {myMatches}
            </Typography>
          </Box>
        </Box>

        {featuredTips.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ mt: 1.5, overflowX: "auto", pb: 0.25 }}>
            {featuredTips.map((doc) => (
              <Button
                key={doc.id}
                variant="outlined"
                onClick={() => handleOpenPreview(doc)}
                sx={{
                  justifyContent: "flex-start",
                  minWidth: 180,
                  px: 1.25,
                  py: 1,
                  borderRadius: 2.5,
                  borderColor: "rgba(148,163,184,0.2)",
                  color: "#e2e8f0",
                }}
              >
                <Stack alignItems="flex-start" spacing={0.2} sx={{ minWidth: 0 }}>
                  <Typography variant="caption" sx={{ color: "rgba(153,246,228,0.8)", textTransform: "uppercase", letterSpacing: 0.7 }}>
                    Quick Preview
                  </Typography>
                  <Typography variant="body2" fontWeight={600} className="line-clamp-1">
                    {doc.name}
                  </Typography>
                </Stack>
              </Button>
            ))}
          </Stack>
        )}
      </Box>

      {isMobileNativePlatform() && isOfflineMode && (
        <Alert severity="info">
          Showing cached tips. Files not downloaded during field sync cannot be previewed offline.
        </Alert>
      )}

      <Box className="glass-card" sx={{ p: 1.5 }}>
        <Stack spacing={1.25}>
          <TextField
            size="small"
            placeholder="Search title, notes, division, product..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined sx={{ fontSize: 16, color: "text.disabled" }} />
                </InputAdornment>
              ),
              endAdornment: search ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearch("")} sx={{ p: 0.25 }}>
                    <CloseOutlined sx={{ fontSize: 14 }} />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />

          {(productFilterOptions.length > 0 || myProductIds.length > 0) && (
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <FilterListOutlined sx={{ fontSize: 16, color: "text.secondary", flexShrink: 0 }} />
              {myProductIds.length > 0 && (
                <Chip
                  label="My Products"
                  size="small"
                  color={productFilter === "__mine__" ? "primary" : "default"}
                  variant={productFilter === "__mine__" ? "filled" : "outlined"}
                  onClick={() => setProductFilter("__mine__")}
                />
              )}
              <Chip
                label="All"
                size="small"
                color={productFilter === "__all__" ? "primary" : "default"}
                variant={productFilter === "__all__" ? "filled" : "outlined"}
                onClick={() => setProductFilter("__all__")}
              />
              {productFilterOptions.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  size="small"
                  color={productFilter === option.value ? "secondary" : "default"}
                  variant={productFilter === option.value ? "filled" : "outlined"}
                  onClick={() => setProductFilter(option.value)}
                />
              ))}
            </Stack>
          )}

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" }, gap: 1.25 }}>
            <Box>
              <Select
                value={filterDivision}
                onChange={(e) => {
                  setFilterDivision(e.target.value);
                  setFilterProduct("");
                }}
                size="small"
                displayEmpty
                fullWidth
              >
                <MenuItem value="">All Divisions</MenuItem>
                {divisions.map((division) => (
                  <MenuItem key={division} value={division}>
                    {division}
                  </MenuItem>
                ))}
              </Select>
            </Box>
            <Box>
              <Autocomplete
                options={productsForDivision}
                getOptionLabel={(product) => product.name}
                value={productsForDivision.find((product) => product.id === filterProduct) ?? null}
                onChange={(_, next) => setFilterProduct(next?.id ?? "")}
                size="small"
                fullWidth
                renderInput={(params) => <TextField {...params} placeholder="All Products" />}
              />
            </Box>
            <Box>
              <Select
                value={filterContentType}
                onChange={(e) => setFilterContentType(e.target.value as ContentTypeLabel | "All")}
                size="small"
                fullWidth
              >
                <MenuItem value="All">All Types</MenuItem>
                {CONTENT_TYPES.map((type) => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </Select>
            </Box>
          </Box>

          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Select
              value={sort}
              onChange={(e) => setSort(e.target.value as TipSort)}
              size="small"
              sx={{ minWidth: 170 }}
            >
              {(Object.keys(TIP_SORT_LABELS) as TipSort[]).map((option) => (
                <MenuItem key={option} value={option}>
                  {TIP_SORT_LABELS[option]}
                </MenuItem>
              ))}
            </Select>
            {canReviewUsage && staleCount > 0 && (
              <Tooltip title={`Tips with no opens in the last ${STALE_TIP_MONTHS} months — candidates for removal`}>
                <Chip
                  label={`Unused ${STALE_TIP_MONTHS}m (${staleCount})`}
                  size="small"
                  color={staleOnly ? "warning" : "default"}
                  variant={staleOnly ? "filled" : "outlined"}
                  onClick={() => setStaleOnly((prev) => !prev)}
                />
              </Tooltip>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
              {filteredDocs.length} of {docs.length} tips
            </Typography>
          </Stack>
        </Stack>
      </Box>

      {loading ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : error ? (
        <Box className="glass-card" sx={{ p: 2 }}>
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        </Box>
      ) : filteredDocs.length === 0 ? (
        <Box className="glass-card" sx={{ p: 4, textAlign: "center" }}>
          <LightbulbOutlined sx={{ fontSize: 40, color: "text.disabled", mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            {search
              ? `No results for "${search}"`
              : docs.length === 0 && isMobileNativePlatform() && isOfflineMode
                ? "No tips cached on this device. Connect to the internet and download field data from Sync Center."
                : "No Tips & Tricks documents found."}
          </Typography>
        </Box>
      ) : viewMode === "grid" ? (
        renderGrid()
      ) : (
        renderTable()
      )}

      {renderAddDialog()}
      {renderEditDialog()}
      <Suspense fallback={null}>
        <MobileDocumentPreviewDialog doc={previewDoc} open={Boolean(previewDoc)} onClose={() => setPreviewDoc(null)} />
      </Suspense>
    </Stack>
  );
}
