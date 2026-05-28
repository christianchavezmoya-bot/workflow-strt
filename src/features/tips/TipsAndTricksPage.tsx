import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  CloseOutlined,
  DownloadOutlined,
  FilterListOutlined,
  LightbulbOutlined,
  RefreshOutlined,
  SearchOutlined,
} from "@mui/icons-material";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery, useTheme } from "@mui/material";
import { documentService, type DocumentRecord } from "../../services/documentService";
import { projectAssetService } from "../../services/projectAssetService";
import { useAuth } from "../../hooks/useAuth";
import DocThumbnail from "../../components/ui/DocThumbnail";

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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
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

  const contentHeight = isMobile ? "calc(100dvh - 110px)" : "72vh";

  return (
    <Dialog
      open={!!doc}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: {
          borderRadius: isMobile ? 0 : 3,
          bgcolor: "background.paper",
          maxHeight: isMobile ? "100dvh" : "90vh",
          height: isMobile ? "100dvh" : "auto",
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
              height: contentHeight,
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
              height: contentHeight,
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
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [myProductIds, setMyProductIds] = useState<string[]>([]);
  const [productFilter, setProductFilter] = useState<string>("__mine__");
  const [previewDoc, setPreviewDoc] = useState<DocumentRecord | null>(null);

  async function load() {
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
  }

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

  useEffect(() => {
    load();
  }, []);

  const allLinkedIds = useMemo(
    () => Array.from(new Set(docs.map((d) => d.linkedTo).filter(Boolean))),
    [docs]
  );

  const myProductSet = useMemo(() => new Set(myProductIds), [myProductIds]);

  const filteredDocs = useMemo(() => {
    let result = docs;

    if (productFilter === "__mine__" && myProductIds.length > 0) {
      const mine = result.filter((d) => d.linkedTo && myProductSet.has(d.linkedTo));
      if (mine.length > 0) result = mine;
    } else if (productFilter !== "__all__" && productFilter !== "__mine__") {
      result = result.filter((d) => d.linkedTo === productFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((d) => d.name.toLowerCase().includes(q) || (d.notes ?? "").toLowerCase().includes(q));
    }

    return result;
  }, [docs, myProductIds.length, myProductSet, productFilter, search]);

  const myMatches = useMemo(
    () => docs.filter((d) => d.linkedTo && myProductSet.has(d.linkedTo)).length,
    [docs, myProductSet]
  );

  return (
    <Stack spacing={3} sx={{ pb: 6 }}>
      <Box>
        <Stack direction="row" alignItems="center" spacing={1}>
          <LightbulbOutlined sx={{ color: "#f59e0b", fontSize: 22, flexShrink: 0 }} />
          <Typography variant="h5" sx={{ fontFamily: "Sora" }}>
            Tips & Tricks
          </Typography>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={load} disabled={loading}>
              {loading ? <CircularProgress size={16} /> : <RefreshOutlined fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ display: { xs: "none", md: "block" } }}>
          Field notes, pinouts, drawings, and quick references shared across products and projects.
        </Typography>
      </Box>

      <Grid container spacing={1}>
        {[
          { label: "Visible", value: filteredDocs.length, color: "info.main" },
          { label: "Total Tips", value: docs.length, color: "text.primary" },
          { label: "My Products", value: myProductIds.length, color: "primary.main" },
          { label: "My Matches", value: myMatches, color: "success.main" },
        ].map(({ label, value, color }) => (
          <Grid item xs={3} key={label}>
            <Box className="glass-card" sx={{ py: { xs: 1, md: 1.5 }, px: { xs: 0.5, md: 2 }, textAlign: "center" }}>
              <Typography variant="h5" fontWeight={700} color={color} sx={{ fontSize: { xs: "1.2rem", md: "2rem" } }}>
                {value}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: "0.58rem", md: "0.75rem" }, lineHeight: 1.2, display: "block" }}>
                {label}
              </Typography>
            </Box>
          </Grid>
        ))}
      </Grid>

      <Stack spacing={1}>
        <TextField
          size="small"
          placeholder="Search title or notes…"
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

        <Typography variant="caption" color="text.secondary">
          {filteredDocs.length} of {docs.length} tips
        </Typography>
      </Stack>

      {loading && (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={28} />
        </Stack>
      )}

      {error && !loading && (
        <Box className="glass-card" sx={{ p: 2 }}>
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        </Box>
      )}

      {!loading && !error && filteredDocs.length === 0 && (
        <Box className="glass-card" sx={{ p: 4, textAlign: "center" }}>
          <LightbulbOutlined sx={{ fontSize: 40, color: "text.disabled", mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            {search ? `No results for "${search}"` : "No Tips & Tricks documents found."}
          </Typography>
        </Box>
      )}

      {!loading && filteredDocs.length > 0 && (
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
                    {doc.notes && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: "block", lineHeight: 1.4 }}
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
                      <IconButton
                        size="small"
                        component="a"
                        href={doc.downloadUrl ?? "#"}
                        download
                        onClick={(e) => e.stopPropagation()}
                        sx={{ p: 0.25, ml: "auto" }}
                      >
                        <DownloadOutlined sx={{ fontSize: 14, color: "text.disabled" }} />
                      </IconButton>
                    </Stack>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <DocPreviewDialog doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </Stack>
  );
}
