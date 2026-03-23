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
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

function isImage(ct?: string | null) {
  return !!ct && ct.startsWith("image/");
}

// ── Document preview dialog ───────────────────────────────────────────────────
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
    documentService.openDocument(doc.downloadUrl)
      .then((url) => { if (mountedRef.current) setBlobUrl(url); })
      .catch(() => {})
      .finally(() => { if (mountedRef.current) setLoading(false); });
    return () => { mountedRef.current = false; };
  }, [doc?.downloadUrl]);

  if (!doc) return null;

  // Title bar height approx 64px, meta footer approx 36px
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
          // On mobile fullScreen mode the paper already fills the screen.
          // On desktop constrain height so it doesn't overflow.
          maxHeight: isMobile ? "100dvh" : "90vh",
          height: isMobile ? "100dvh" : "auto",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      {/* Fixed title bar */}
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pb: 1, flexShrink: 0 }}>
        <LightbulbOutlined sx={{ color: "#f59e0b", fontSize: 20 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={700} noWrap>{doc.name}</Typography>
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

      {/* Scrollable content fills remaining height */}
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

        {/* Meta footer */}
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1, flexShrink: 0 }}>
          {doc.createdBy && (
            <Typography variant="caption" color="text.disabled">{doc.createdBy}</Typography>
          )}
          {doc.uploadedAt && (
            <Typography variant="caption" color="text.disabled">· {fmtDate(doc.uploadedAt)}</Typography>
          )}
          {fmtSize(doc.fileSize) && (
            <Chip label={fmtSize(doc.fileSize)} size="small" sx={{ fontSize: "0.6rem", height: 18, ml: "auto" }} />
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TipsAndTricksPage() {
  const { user } = useAuth();
  const [docs, setDocs]           = useState<DocumentRecord[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState("");
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

  // Load user's assigned product IDs for default filter
  useEffect(() => {
    const role = user?.role ?? "";
    if (["Installer", "Engineer", "Supervisor", "Project Manager"].includes(role)) {
      projectAssetService.myProjectIds().then(async (projectIds) => {
        if (!projectIds.length) return;
        const assetArrays = await Promise.all(
          projectIds.map((id) => projectAssetService.listByProject(id).catch(() => []))
        );
        const ids = Array.from(new Set(assetArrays.flat().map((a) => a.productId).filter(Boolean)));
        setMyProductIds(ids);
      }).catch(() => {});
    }
  }, [user?.role]);

  useEffect(() => { load(); }, []);

  // All unique linkedTo values in the tips docs (act as product/topic buckets)
  const allLinkedIds = useMemo(() =>
    Array.from(new Set(docs.map((d) => d.linkedTo).filter(Boolean))),
    [docs]
  );

  // Filtered docs
  const filteredDocs = useMemo(() => {
    let result = docs;

    // Product/topic filter
    if (productFilter === "__mine__" && myProductIds.length > 0) {
      const mySet = new Set(myProductIds);
      const mine = result.filter((d) => d.linkedTo && mySet.has(d.linkedTo));
      // Fall back to all if no match (so page is never empty for new users)
      if (mine.length > 0) result = mine;
    } else if (productFilter !== "__all__" && productFilter !== "__mine__") {
      result = result.filter((d) => d.linkedTo === productFilter);
    }

    // Text search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          (d.notes ?? "").toLowerCase().includes(q)
      );
    }

    return result;
  }, [docs, productFilter, myProductIds, search]);

  return (
    <Box sx={{ maxWidth: 700, mx: "auto", pb: 6 }}>

      {/* ── Header row: icon + title + search + refresh — all on one line ── */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <LightbulbOutlined sx={{ color: "#f59e0b", fontSize: 22, flexShrink: 0 }} />
        <Typography variant="h6" sx={{ fontFamily: "Sora", fontWeight: 700, flexShrink: 0 }}>
          Tips & Tricks
        </Typography>

        {/* Search — grows to fill space */}
        <TextField
          size="small"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{
            flex: 1,
            minWidth: 0,
            "& .MuiOutlinedInput-root": { height: 32, fontSize: "0.8rem" },
          }}
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

        <Tooltip title="Refresh">
          <IconButton size="small" onClick={load} disabled={loading} sx={{ flexShrink: 0 }}>
            <RefreshOutlined sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* ── Product / topic filter chips ── */}
      {(allLinkedIds.length > 0 || myProductIds.length > 0) && (
        <Stack direction="row" spacing={0.75} sx={{ mb: 2, flexWrap: "wrap", gap: 0.5 }}>
          <FilterListOutlined sx={{ fontSize: 16, color: "text.disabled", mt: 0.25 }} />
          {myProductIds.length > 0 && (
            <Chip
              label="My Products"
              size="small"
              color={productFilter === "__mine__" ? "primary" : "default"}
              onClick={() => setProductFilter("__mine__")}
              sx={{ fontSize: "0.7rem", height: 22 }}
            />
          )}
          <Chip
            label="All"
            size="small"
            color={productFilter === "__all__" ? "primary" : "default"}
            onClick={() => setProductFilter("__all__")}
            sx={{ fontSize: "0.7rem", height: 22 }}
          />
          {allLinkedIds.map((id) => (
            <Chip
              key={id}
              label={id}
              size="small"
              color={productFilter === id ? "secondary" : "default"}
              onClick={() => setProductFilter(id)}
              sx={{ fontSize: "0.7rem", height: 22 }}
            />
          ))}
        </Stack>
      )}

      {/* Loading */}
      {loading && (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={28} />
        </Stack>
      )}

      {/* Error */}
      {error && !loading && (
        <Box className="glass-card" sx={{ p: 2 }}>
          <Typography variant="body2" color="error">{error}</Typography>
        </Box>
      )}

      {/* Empty */}
      {!loading && !error && filteredDocs.length === 0 && (
        <Box className="glass-card" sx={{ p: 4, textAlign: "center" }}>
          <LightbulbOutlined sx={{ fontSize: 40, color: "text.disabled", mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            {search ? `No results for "${search}"` : "No Tips & Tricks documents found."}
          </Typography>
        </Box>
      )}

      {/* ── 2-column card grid ── */}
      {!loading && filteredDocs.length > 0 && (
        <Grid container spacing={1.5}>
          {filteredDocs.map((doc) => (
            <Grid item xs={6} key={doc.id}>
              <Card
                elevation={0}
                sx={{
                  height: "100%",
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.04)",
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
                  {/* Thumbnail */}
                  {doc.downloadUrl && (
                    <DocThumbnail
                      downloadUrl={doc.downloadUrl}
                      contentType={doc.contentType}
                      height={110}
                    />
                  )}

                  <CardContent sx={{ width: "100%", p: "8px !important" }}>
                    <Typography
                      variant="caption"
                      fontWeight={700}
                      sx={{ display: "block", lineHeight: 1.3, mb: 0.4 }}
                      className="line-clamp-2"
                    >
                      {doc.name}
                    </Typography>
                    {doc.notes && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: "block", fontSize: "0.62rem", lineHeight: 1.3 }}
                        className="line-clamp-2"
                      >
                        {doc.notes}
                      </Typography>
                    )}
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 0.75 }}>
                      {fmtSize(doc.fileSize) && (
                        <Typography variant="caption" sx={{ fontSize: "0.58rem", color: "text.disabled" }}>
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

      {/* ── Preview dialog ── */}
      <DocPreviewDialog doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </Box>
  );
}
