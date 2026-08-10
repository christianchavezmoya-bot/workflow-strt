import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ChevronLeftOutlined,
  ChevronRightOutlined,
  FileDownloadOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { API_BASE_URL } from "../../services/api";
import PdfBlobPreview from "../../components/reports/PdfBlobPreview";
import {
  assetReportShareService,
  type AssetReportShareManifest,
} from "../../services/assetReportShareService";

export default function AssetReportShareViewPage() {
  const { shareId = "" } = useParams<{ shareId: string }>();
  const [manifest, setManifest] = useState<AssetReportShareManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFileName, setActiveFileName] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!shareId) {
      setError("Invalid share link.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    void assetReportShareService.getManifest(shareId)
      .then((data) => {
        setManifest(data);
        setActiveFileName(data.files[0]?.fileName ?? null);
      })
      .catch(() => setError("This share link was not found or has expired."))
      .finally(() => setLoading(false));
  }, [shareId]);

  const activeIndex = useMemo(
    () => manifest?.files.findIndex((file) => file.fileName === activeFileName) ?? -1,
    [manifest, activeFileName],
  );

  const previewUrl = useMemo(() => {
    if (!shareId || !activeFileName) return null;
    return `${API_BASE_URL}/asset-report-shares/${encodeURIComponent(shareId)}/files/${encodeURIComponent(activeFileName)}`;
  }, [shareId, activeFileName]);

  useEffect(() => {
    if (!previewUrl) {
      setPreviewBlob(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewBlob(null);

    void fetch(previewUrl)
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load report");
        return response.blob();
      })
      .then((blob) => {
        if (!cancelled) setPreviewBlob(blob);
      })
      .catch(() => {
        if (!cancelled) setPreviewError("Could not load report preview.");
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => { cancelled = true; };
  }, [previewUrl]);

  function goRelative(delta: number) {
    if (!manifest || manifest.files.length === 0) return;
    const current = manifest.files.findIndex((file) => file.fileName === activeFileName);
    const base = current >= 0 ? current : 0;
    const next = (base + delta + manifest.files.length) % manifest.files.length;
    setActiveFileName(manifest.files[next]?.fileName ?? null);
  }

  if (loading) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !manifest) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Alert severity="error">{error ?? "Unable to load shared reports."}</Alert>
      </Container>
    );
  }

  const expiresLabel = new Date(manifest.expiresAtUtc).toLocaleString();

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", display: "flex", flexDirection: "column" }}>
      <Paper square elevation={1} sx={{ px: 2, py: 1.5 }}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} spacing={1}>
          <Box>
            <Typography variant="h6">Shared installation reports</Typography>
            <Typography variant="body2" color="text.secondary">
              {manifest.jobLabel ? `Job ${manifest.jobLabel} · ` : ""}{manifest.files.length} report{manifest.files.length !== 1 ? "s" : ""} · expires {expiresLabel}
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<FileDownloadOutlined />}
            href={manifest.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Download ZIP
          </Button>
        </Stack>
      </Paper>

      <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
        <Box
          sx={{
            width: 280,
            flexShrink: 0,
            borderRight: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            overflowY: "auto",
          }}
        >
          <List dense disablePadding>
            {manifest.files.map((file) => (
              <ListItemButton
                key={file.fileName}
                selected={file.fileName === activeFileName}
                onClick={() => setActiveFileName(file.fileName)}
              >
                <ListItemText
                  primary={file.label}
                  secondary={file.fileName}
                  primaryTypographyProps={{ fontWeight: file.fileName === activeFileName ? 700 : 600 }}
                />
              </ListItemButton>
            ))}
          </List>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", bgcolor: "#525659" }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ px: 2, py: 1, bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "divider" }}
          >
            <Typography variant="body2" fontWeight={600} noWrap>
              {manifest.files.find((file) => file.fileName === activeFileName)?.label ?? "Select a report"}
            </Typography>
            {manifest.files.length > 1 && (
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Button size="small" startIcon={<ChevronLeftOutlined />} onClick={() => goRelative(-1)}>Prev</Button>
                <Typography variant="caption" color="text.secondary">
                  {activeIndex >= 0 ? `${activeIndex + 1} / ${manifest.files.length}` : "—"}
                </Typography>
                <Button size="small" endIcon={<ChevronRightOutlined />} onClick={() => goRelative(1)}>Next</Button>
              </Stack>
            )}
          </Stack>

          <Box sx={{ flex: 1, minHeight: 0 }}>
            {previewLoading ? (
              <Stack alignItems="center" justifyContent="center" spacing={2} sx={{ height: "100%", color: "common.white" }}>
                <CircularProgress color="inherit" />
                <Typography variant="body2">Loading report preview…</Typography>
              </Stack>
            ) : previewError ? (
              <Stack alignItems="center" justifyContent="center" sx={{ height: "100%", px: 2 }}>
                <Alert severity="warning" sx={{ maxWidth: 480 }}>{previewError}</Alert>
              </Stack>
            ) : previewBlob ? (
              <PdfBlobPreview
                blob={previewBlob}
                scrollHint="Scroll to view all pages"
              />
            ) : (
              <Stack alignItems="center" justifyContent="center" sx={{ height: "100%", color: "common.white" }}>
                <Typography variant="body2">Select a report to preview.</Typography>
              </Stack>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
