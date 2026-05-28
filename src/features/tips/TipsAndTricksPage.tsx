import { useEffect, useMemo, useRef, useState } from "react";
import {
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
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
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
  FilterListOutlined,
  GridViewOutlined,
  InsertDriveFileOutlined,
  LightbulbOutlined,
  RefreshOutlined,
  SearchOutlined,
  TableRowsOutlined,
  UploadFileOutlined,
} from "@mui/icons-material";
import { documentService, type DocumentRecord } from "../../services/documentService";
import { productService } from "../../services/productService";
import { projectAssetService } from "../../services/projectAssetService";
import { useAuth } from "../../hooks/useAuth";
import { usePermissions } from "../../hooks/usePermissions";
import QRUploadButton from "../../components/QRUploadButton";
import DocThumbnail from "../../components/ui/DocThumbnail";
import type { Product } from "../../types/product";

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

function isImage(ct?: string | null) {
  return !!ct && ct.startsWith("image/");
}

function DocPreviewDialog({
  doc,
  onClose,
}: {
  doc: DocumentRecord | null;
  onClose: () => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    setBlobUrl(null);
    if (!doc?.downloadUrl) return;

    setLoading(true);
    documentService
      .openDocument(doc.downloadUrl)
      .then((url) => {
        if (mountedRef.current) setBlobUrl(url);
      })
      .catch(() => {})
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });

    return () => {
      mountedRef.current = false;
    };
  }, [doc?.downloadUrl]);

  if (!doc) return null;

  return (
    <Dialog
      open={!!doc}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          bgcolor: "background.paper",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pb: 1, flexShrink: 0 }}>
        <LightbulbOutlined sx={{ color: "#f59e0b", fontSize: 20 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={700} noWrap>
            {doc.name}
          </Typography>
          {doc.notes && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>
              {doc.notes}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
          {doc.downloadUrl && (
            <Tooltip title="Download">
              <IconButton size="small" component="a" href={doc.downloadUrl} download>
                <DownloadOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <IconButton size="small" onClick={onClose}>
            <CloseOutlined fontSize="small" />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent
        sx={{
          p: { xs: 1, sm: 2 },
          pt: "4px !important",
          flex: 1,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {loading && (
          <Stack alignItems="center" justifyContent="center" sx={{ flex: 1 }}>
            <CircularProgress size={28} />
          </Stack>
        )}

        {!loading && blobUrl && isImage(doc.contentType) && (
          <Box
            component="img"
            src={blobUrl}
            alt={doc.name}
            sx={{
              width: "100%",
              height: "72vh",
              objectFit: "contain",
              borderRadius: 1,
              display: "block",
            }}
          />
        )}

        {!loading && blobUrl && !isImage(doc.contentType) && (
          <Box
            component="iframe"
            src={blobUrl}
            title={doc.name}
            sx={{
              width: "100%",
              height: "72vh",
              border: "none",
              borderRadius: 1,
              flex: 1,
              display: "block",
            }}
          />
        )}

        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1, flexShrink: 0 }}>
          {doc.createdBy && <Typography variant="caption" color="text.disabled">{doc.createdBy}</Typography>}
          {doc.uploadedAt && <Typography variant="caption" color="text.disabled">• {fmtDate(doc.uploadedAt)}</Typography>}
          {fmtSize(doc.fileSize) && (
            <Chip label={fmtSize(doc.fileSize)} size="small" sx={{ fontSize: "0.6rem", height: 18, ml: "auto" }} />
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

export default function TipsAndTricksPage() {
  const { user } = useAuth();
  const can = usePermissions();
  const canUploadTips = can.documents.upload;
  const canDeleteTips = can.documents.delete;

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
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [previewDoc, setPreviewDoc] = useState<DocumentRecord | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addContentType, setAddContentType] = useState<ContentTypeLabel>("Photo");
  const [addDivision, setAddDivision] = useState("");
  const [addProduct, setAddProduct] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addDragOver, setAddDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocs = async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await documentService.getDocuments();
      setDocs(all.filter((d) => d.type === "tips"));
    } catch {
      setError("Could not load documents. Make sure the server is reachable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocs();
    productService.getProducts().then(setProducts).catch(() => {});
  }, []);

  useEffect(() => {
    const role = user?.role ?? "";
    if (["Installer", "Engineer", "Supervisor", "Project Manager"].includes(role)) {
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
  }, [user?.role]);

  const productNameById = useMemo(
    () => new Map(products.map((product) => [product.id, product.name])),
    [products]
  );

  const myProductNameSet = useMemo(
    () => new Set(myProductIds.map((id) => productNameById.get(id)).filter(Boolean) as string[]),
    [myProductIds, productNameById]
  );

  const allLinkedIds = useMemo(
    () => Array.from(new Set(docs.map((d) => d.linkedTo).filter(Boolean))).sort(),
    [docs]
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

  const filteredDocs = useMemo(() => {
    let result = docs;

    if (productFilter === "__mine__" && myProductIds.length > 0) {
      const mine = result.filter((doc) => {
        const linked = doc.linkedTo ?? "";
        const docProduct = doc.customValues?.product ?? "";
        return myProductIds.includes(linked) || myProductNameSet.has(linked) || myProductNameSet.has(docProduct);
      });
      if (mine.length > 0) result = mine;
    } else if (productFilter !== "__all__" && productFilter !== "__mine__") {
      result = result.filter((doc) => doc.linkedTo === productFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((doc) => {
        const division = doc.customValues?.division ?? "";
        const product = doc.customValues?.product ?? "";
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
      result = result.filter((doc) => (doc.customValues?.product ?? "") === filterProduct);
    }

    if (filterContentType !== "All") {
      result = result.filter((doc) => (doc.customValues?.contentType ?? "") === filterContentType);
    }

    return result;
  }, [docs, filterContentType, filterDivision, filterProduct, myProductIds, myProductNameSet, productFilter, search]);

  const myMatches = useMemo(
    () =>
      docs.filter((doc) => {
        const linked = doc.linkedTo ?? "";
        const docProduct = doc.customValues?.product ?? "";
        return myProductIds.includes(linked) || myProductNameSet.has(linked) || myProductNameSet.has(docProduct);
      }).length,
    [docs, myProductIds, myProductNameSet]
  );

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
    if (!canUploadTips) return;
    if (!addTitle.trim()) return;
    setSaving(true);
    try {
      const linkedTo = addProduct || addDivision || "General";
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
                setAddProduct("");
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
            value={addProductsForDivision.find((product) => product.name === addProduct) ?? null}
            onChange={(_, next) => setAddProduct(next?.name ?? "")}
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
                accept="image/*,video/*,application/pdf,.dwg"
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

  const renderGrid = () => (
    <Grid container spacing={2}>
      {filteredDocs.map((doc) => (
        <Grid item xs={12} sm={6} lg={4} xl={3} key={doc.id}>
          <Card
            className="glass-card"
            elevation={0}
            sx={{
              height: "100%",
              border: "1px solid var(--stroke)",
              background: "linear-gradient(180deg, rgba(10,18,24,0.92), rgba(8,14,19,0.96))",
              borderRadius: 2,
              overflow: "hidden",
              transition: "all 0.2s",
              "&:hover": {
                borderColor: "rgba(45,212,191,0.4)",
                background: "rgba(45,212,191,0.06)",
                transform: "translateY(-2px)",
              },
            }}
          >
            <CardActionArea
              onClick={() => setPreviewDoc(doc)}
              sx={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "flex-start" }}
            >
              {doc.downloadUrl && (
                <DocThumbnail
                  downloadUrl={doc.downloadUrl}
                  contentType={doc.contentType}
                  height={180}
                />
              )}

              <CardContent sx={{ width: "100%", p: 1.5 }}>
                <Typography
                  variant="subtitle2"
                  fontWeight={700}
                  sx={{ display: "block", lineHeight: 1.35, mb: 0.4 }}
                  className="line-clamp-2"
                >
                  {doc.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" noWrap>
                  {[doc.customValues?.division, doc.customValues?.product, doc.customValues?.contentType].filter(Boolean).join(" • ")}
                </Typography>
                {doc.notes && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", lineHeight: 1.4, mt: 0.5 }}
                    className="line-clamp-2"
                  >
                    {doc.notes}
                  </Typography>
                )}
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 0.75 }}>
                  {fmtSize(doc.fileSize) && (
                    <Typography variant="caption" sx={{ color: "text.disabled" }}>
                      {fmtSize(doc.fileSize)}
                    </Typography>
                  )}
                  <Stack direction="row" spacing={0.25} sx={{ ml: "auto" }}>
                    {doc.downloadUrl && (
                      <IconButton
                        size="small"
                        component="a"
                        href={doc.downloadUrl}
                        download
                        onClick={(e) => e.stopPropagation()}
                        sx={{ p: 0.25 }}
                      >
                        <DownloadOutlined sx={{ fontSize: 14, color: "text.disabled" }} />
                      </IconButton>
                    )}
                    {canDeleteTips && (
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDelete(doc.id);
                        }}
                        sx={{ p: 0.25 }}
                      >
                        <DeleteOutline sx={{ fontSize: 16 }} />
                      </IconButton>
                    )}
                  </Stack>
                </Stack>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>
      ))}
    </Grid>
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
                <TableCell>{doc.customValues?.product || "-"}</TableCell>
                <TableCell>{doc.customValues?.contentType || "-"}</TableCell>
                <TableCell>{doc.linkedTo || "-"}</TableCell>
                <TableCell>{doc.createdBy || "-"}</TableCell>
                <TableCell>{fmtDate(doc.uploadedAt) || "-"}</TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    <Button size="small" onClick={() => setPreviewDoc(doc)}>
                      Open
                    </Button>
                    {doc.downloadUrl && (
                      <Button size="small" component="a" href={doc.downloadUrl} download>
                        Download
                      </Button>
                    )}
                    {canDeleteTips && (
                      <Button size="small" color="error" onClick={() => void handleDelete(doc.id)}>
                        Delete
                      </Button>
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
      <Box>
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
            <Typography variant="body2" color="text.secondary" sx={{ display: { xs: "none", md: "block" } }}>
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
                  docType="tips"
                  linkedTo="General"
                  onUploaded={() => void loadDocs()}
                />
                <Button variant="contained" startIcon={<AddOutlined />} onClick={() => setAddOpen(true)}>
                  Add Tip
                </Button>
              </>
            )}
          </Stack>
        </Stack>
      </Box>

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

          {(allLinkedIds.length > 0 || myProductIds.length > 0) && (
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
              {allLinkedIds.map((id) => (
                <Chip
                  key={id}
                  label={id}
                  size="small"
                  color={productFilter === id ? "secondary" : "default"}
                  variant={productFilter === id ? "filled" : "outlined"}
                  onClick={() => setProductFilter(id)}
                />
              ))}
            </Stack>
          )}

          <Grid container spacing={1.25}>
            <Grid item xs={12} sm={4}>
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
            </Grid>
            <Grid item xs={12} sm={4}>
              <Autocomplete
                options={productsForDivision}
                getOptionLabel={(product) => product.name}
                value={productsForDivision.find((product) => product.name === filterProduct) ?? null}
                onChange={(_, next) => setFilterProduct(next?.name ?? "")}
                size="small"
                fullWidth
                renderInput={(params) => <TextField {...params} placeholder="All Products" />}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
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
            </Grid>
          </Grid>

          <Typography variant="caption" color="text.secondary">
            {filteredDocs.length} of {docs.length} tips
          </Typography>
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
            {search ? `No results for "${search}"` : "No Tips & Tricks documents found."}
          </Typography>
        </Box>
      ) : viewMode === "grid" ? (
        renderGrid()
      ) : (
        renderTable()
      )}

      {renderAddDialog()}
      <DocPreviewDialog doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </Stack>
  );
}
