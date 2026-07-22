import { useEffect, useMemo, useRef, useState } from "react";
import {
  CloseOutlined,
  DescriptionOutlined,
  DownloadOutlined,
  InsertDriveFileOutlined,
  PictureAsPdfOutlined,
  RestartAltOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  IconButton,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { documentService, type DocumentRecord } from "../../services/documentService";

type PreviewMode = "pdf" | "image" | "video" | "html" | "iframe" | "unsupported";

interface Props {
  doc: DocumentRecord | null;
  open: boolean;
  onClose: () => void;
}

function isPdf(contentType?: string | null, name?: string) {
  if (contentType === "application/pdf" || contentType === "application/x-pdf") return true;
  return !!name && name.toLowerCase().endsWith(".pdf");
}

function getFileType(contentType?: string | null, name?: string): string | undefined {
  const type = (contentType ?? "").toLowerCase();
  const ext = (name ?? "").split(".").pop()?.toLowerCase();
  if (type.includes("pdf")) return "pdf";
  if (type.startsWith("image/")) return ext ?? "jpg";
  if (type.startsWith("video/")) return ext ?? "mp4";
  if (type.includes("openxmlformats") || ext === "docx") return "docx";
  if (type.includes("word") || type.includes("msword") || ext === "doc") return "doc";
  if (type.includes("sheet") || type.includes("excel") || type.includes("spreadsheet") || ext === "xlsx" || ext === "xls") return ext ?? "xlsx";
  if (type.includes("json")) return "json";
  if (type.startsWith("text/")) return ext ?? "txt";
  return ext;
}

function formatSize(bytes?: number | null) {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso?: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function PdfCanvasPreview({
  blobUrl,
  zoom,
  onPageCount,
}: {
  blobUrl: string;
  zoom: number;
  onPageCount: (count: number) => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? 0;
      setContainerWidth(nextWidth);
    });
    resizeObserver.observe(node);
    setContainerWidth(node.getBoundingClientRect().width);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function renderPdf() {
      if (!blobUrl || !pagesRef.current || containerWidth <= 0) return;

      const host = pagesRef.current;
      host.innerHTML = "";
      onPageCount(0);

      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();

      const loadingTask = pdfjsLib.getDocument({ url: blobUrl });

      try {
        const pdf = await loadingTask.promise;
        if (cancelled) {
          void loadingTask.destroy();
          return;
        }

        onPageCount(pdf.numPages);

        for (let index = 1; index <= pdf.numPages; index += 1) {
          const page = await pdf.getPage(index);
          if (cancelled) break;

          const baseViewport = page.getViewport({ scale: 1 });
          const fittedScale = Math.max(0.35, ((containerWidth - 32) / baseViewport.width) * zoom);
          const viewport = page.getViewport({ scale: fittedScale });

          const shell = document.createElement("div");
          shell.style.margin = "0 auto 16px";
          shell.style.width = `${viewport.width}px`;
          shell.style.maxWidth = "100%";
          shell.style.borderRadius = "16px";
          shell.style.overflow = "hidden";
          shell.style.boxShadow = "0 16px 40px rgba(0,0,0,0.28)";
          shell.style.background = "#fff";

          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) continue;

          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.display = "block";
          canvas.style.width = "100%";
          canvas.style.height = "auto";

          shell.appendChild(canvas);
          host.appendChild(shell);

          await page.render({ canvas, canvasContext: context, viewport } as never).promise;
        }
      } catch {
        if (!cancelled) {
          host.innerHTML = "";
        }
      }
    }

    void renderPdf();

    return () => {
      cancelled = true;
      if (pagesRef.current) pagesRef.current.innerHTML = "";
    };
  }, [blobUrl, containerWidth, onPageCount, zoom]);

  return (
    <Box
      ref={viewportRef}
      sx={{
        flex: 1,
        overflow: "auto",
        px: { xs: 1.25, sm: 2.5 },
        py: { xs: 1.25, sm: 2 },
      }}
    >
      <Box ref={pagesRef} />
    </Box>
  );
}

export default function MobileDocumentPreviewDialog({ doc, open, onClose }: Props) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"));
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [htmlPreview, setHtmlPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pageCount, setPageCount] = useState(0);

  const fileType = useMemo(
    () => getFileType(doc?.contentType, doc?.name),
    [doc?.contentType, doc?.name],
  );

  const previewMode = useMemo<PreviewMode>(() => {
    if (!doc) return "unsupported";
    if (isPdf(doc.contentType, doc.name)) return "pdf";
    if (doc.contentType?.startsWith("image/")) return "image";
    if (doc.contentType?.startsWith("video/")) return "video";
    if (fileType === "docx" || fileType === "doc" || fileType === "xlsx" || fileType === "xls") return "html";
    if (fileType === "json" || (doc.contentType?.startsWith("text/") ?? false)) return "iframe";
    return doc.downloadUrl ? "iframe" : "unsupported";
  }, [doc, fileType]);

  useEffect(() => {
    const activeDoc = doc;
    const activeDownloadUrl = activeDoc?.downloadUrl ?? null;

    if (!open || !activeDownloadUrl) {
      setLoading(false);
      setError(null);
      setHtmlPreview(null);
      setBlobUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      setZoom(1);
      setPageCount(0);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setZoom(1);
    setPageCount(0);

    setBlobUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setHtmlPreview(null);

    async function loadPreview() {
      try {
        if (previewMode === "html") {
          const buffer = await documentService.openDocumentAsBuffer(activeDownloadUrl!);

          if (fileType === "docx") {
            const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
            if (cancelled) return;
            setHtmlPreview(
              `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" /><style>
                body{font-family:Arial,sans-serif;padding:24px;line-height:1.6;background:#fff;color:#111;margin:0}
                table{border-collapse:collapse;width:100%}
                td,th{border:1px solid #ccc;padding:6px 10px}
                img{max-width:100%;height:auto}
              </style></head><body>${result.value}</body></html>`,
            );
            return;
          }

          if (fileType === "doc") {
            if (cancelled) return;
            setHtmlPreview(
              `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" /><style>
                body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fff;color:#444}
                .wrap{max-width:520px;padding:32px;text-align:center}
                .title{font-size:18px;font-weight:700;color:#222;margin:0 0 10px}
                .copy{font-size:14px;line-height:1.6}
              </style></head><body><div class="wrap"><p class="title">Preview unavailable for .doc files</p><p class="copy">Open or download this file locally, or resave it as .docx to enable in-app preview.</p></div></body></html>`,
            );
            return;
          }

          const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const rawHtml = XLSX.utils.sheet_to_html(firstSheet);
          if (cancelled) return;
          setHtmlPreview(
            rawHtml.replace(
              "</head>",
              `<meta name="viewport" content="width=device-width, initial-scale=1" /><style>
                body{font-family:Arial,sans-serif;padding:16px;background:#fff;margin:0;overflow:auto}
                table{border-collapse:collapse;font-size:12px;min-width:100%}
                td,th{border:1px solid #d0d0d0;padding:6px 10px;white-space:nowrap;vertical-align:top;background:#fff!important;color:#000!important}
                tr:first-child td,tr:first-child th{font-weight:700;background:#f4f4f4!important}
              </style></head>`,
            ),
          );
          return;
        }

        const nextBlobUrl = await documentService.openDocument(activeDownloadUrl!);
        if (cancelled) {
          URL.revokeObjectURL(nextBlobUrl);
          return;
        }
        setBlobUrl(nextBlobUrl);
      } catch {
        if (!cancelled) {
          setError("Could not load this file. If the phone is offline, make sure the document was previously synced to the device.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, [doc, fileType, open, previewMode]);

  const canZoom = previewMode === "pdf" || previewMode === "image";
  const showDownload = !!doc?.downloadUrl;
  const sizeLabel = formatSize(doc?.fileSize);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={isPhone}
      maxWidth="xl"
      fullWidth
      PaperProps={{
        sx: {
          height: isPhone ? "100%" : "92vh",
          borderRadius: isPhone ? 0 : 4,
          overflow: "hidden",
          background: "linear-gradient(180deg, rgba(8,18,24,0.98), rgba(8,14,19,0.99))",
          border: "1px solid rgba(45,212,191,0.18)",
        },
      }}
    >
      <Toolbar
        sx={{
          minHeight: { xs: 64, sm: 76 },
          px: { xs: 1.25, sm: 2.5 },
          gap: 1,
          borderBottom: "1px solid rgba(148,163,184,0.14)",
          bgcolor: "rgba(7,15,20,0.82)",
          backdropFilter: "blur(12px)",
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle1" fontWeight={700} noWrap sx={{ color: "#f8fafc" }}>
            {doc?.name ?? "Preview"}
          </Typography>
          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.25 }}>
            {doc?.type && (
              <Chip label={doc.type} size="small" sx={{ height: 22, bgcolor: "rgba(45,212,191,0.12)", color: "#99f6e4" }} />
            )}
            {sizeLabel && (
              <Chip label={sizeLabel} size="small" variant="outlined" sx={{ height: 22, borderColor: "rgba(148,163,184,0.22)", color: "rgba(226,232,240,0.82)" }} />
            )}
            {doc?.uploadedAt && (
              <Typography variant="caption" sx={{ color: "rgba(226,232,240,0.58)" }}>
                {formatDate(doc.uploadedAt)}
              </Typography>
            )}
          </Stack>
        </Box>

        {canZoom && (
          <Stack direction="row" spacing={0.5} sx={{ mr: 0.5 }}>
            <Tooltip title="Zoom out">
              <span>
                <IconButton
                  size="small"
                  onClick={() => setZoom((current) => Math.max(0.7, Number((current - 0.15).toFixed(2))))}
                  disabled={loading}
                  sx={{ color: "#cbd5e1" }}
                >
                  <ZoomOutOutlined fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Reset zoom">
              <span>
                <IconButton
                  size="small"
                  onClick={() => setZoom(1)}
                  disabled={loading}
                  sx={{ color: "#cbd5e1" }}
                >
                  <RestartAltOutlined fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Zoom in">
              <span>
                <IconButton
                  size="small"
                  onClick={() => setZoom((current) => Math.min(2.4, Number((current + 0.15).toFixed(2))))}
                  disabled={loading}
                  sx={{ color: "#cbd5e1" }}
                >
                  <ZoomInOutlined fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        )}

        {showDownload && (
          <Button
            variant="outlined"
            size="small"
            onClick={() => void documentService.downloadDocument(doc!.downloadUrl!, doc!.name)}
            startIcon={<DownloadOutlined />}
            sx={{
              display: { xs: "none", sm: "inline-flex" },
              color: "#e2e8f0",
              borderColor: "rgba(148,163,184,0.24)",
            }}
          >
            Download
          </Button>
        )}

        <IconButton onClick={onClose} sx={{ color: "#f8fafc" }}>
          <CloseOutlined />
        </IconButton>
      </Toolbar>

      <DialogContent
        sx={{
          p: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          bgcolor: "transparent",
        }}
      >
        {loading && (
          <Stack alignItems="center" justifyContent="center" spacing={1.25} sx={{ flex: 1 }}>
            <CircularProgress size={30} />
            <Typography variant="body2" sx={{ color: "rgba(226,232,240,0.72)" }}>
              Loading preview...
            </Typography>
          </Stack>
        )}

        {!loading && error && (
          <Box sx={{ p: 2 }}>
            <Alert severity="error">{error}</Alert>
          </Box>
        )}

        {!loading && !error && previewMode === "pdf" && blobUrl && (
          <>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{
                px: { xs: 1.25, sm: 2.5 },
                py: 1,
                borderBottom: "1px solid rgba(148,163,184,0.12)",
                color: "rgba(226,232,240,0.72)",
              }}
            >
              <PictureAsPdfOutlined sx={{ fontSize: 18, color: "#f87171" }} />
              <Typography variant="caption">
                Opens fit-to-page first, then you can zoom in or out.
              </Typography>
              {pageCount > 0 && (
                <Typography variant="caption" sx={{ ml: "auto" }}>
                  {pageCount} page{pageCount === 1 ? "" : "s"}
                </Typography>
              )}
            </Stack>
            <PdfCanvasPreview blobUrl={blobUrl} zoom={zoom} onPageCount={setPageCount} />
          </>
        )}

        {!loading && !error && previewMode === "image" && blobUrl && (
          <Box sx={{ flex: 1, overflow: "auto", p: { xs: 1.25, sm: 2.5 } }}>
            <Box
              component="img"
              src={blobUrl}
              alt={doc?.name}
              sx={{
                display: "block",
                width: `${Math.max(100, zoom * 100)}%`,
                maxWidth: "none",
                height: "auto",
                mx: "auto",
                borderRadius: 3,
                boxShadow: "0 18px 42px rgba(0,0,0,0.28)",
              }}
            />
          </Box>
        )}

        {!loading && !error && previewMode === "video" && blobUrl && (
          <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", p: { xs: 1.25, sm: 2.5 } }}>
            <Box
              component="video"
              src={blobUrl}
              controls
              sx={{
                width: "100%",
                maxHeight: "100%",
                borderRadius: 3,
                bgcolor: "#000",
              }}
            />
          </Box>
        )}

        {!loading && !error && previewMode === "html" && htmlPreview && (
          <Box sx={{ flex: 1, overflow: "hidden", p: { xs: 1.25, sm: 2.5 } }}>
            <Box
              component="iframe"
              srcDoc={htmlPreview}
              title={doc?.name ?? "Preview"}
              sandbox="allow-same-origin"
              sx={{
                width: "100%",
                height: "100%",
                border: "none",
                borderRadius: 3,
                bgcolor: "#fff",
                boxShadow: "0 18px 42px rgba(0,0,0,0.28)",
              }}
            />
          </Box>
        )}

        {!loading && !error && previewMode === "iframe" && blobUrl && (
          <Box sx={{ flex: 1, overflow: "hidden", p: { xs: 1.25, sm: 2.5 } }}>
            <Box
              component="iframe"
              src={blobUrl}
              title={doc?.name ?? "Preview"}
              sx={{
                width: "100%",
                height: "100%",
                border: "none",
                borderRadius: 3,
                bgcolor: "#fff",
                boxShadow: "0 18px 42px rgba(0,0,0,0.28)",
              }}
            />
          </Box>
        )}

        {!loading && !error && previewMode === "unsupported" && (
          <Stack alignItems="center" justifyContent="center" spacing={1.25} sx={{ flex: 1, px: 3 }}>
            {doc?.contentType?.includes("pdf") ? (
              <PictureAsPdfOutlined sx={{ fontSize: 42, color: "#f87171" }} />
            ) : doc?.downloadUrl ? (
              <DescriptionOutlined sx={{ fontSize: 42, color: "#94a3b8" }} />
            ) : (
              <InsertDriveFileOutlined sx={{ fontSize: 42, color: "#94a3b8" }} />
            )}
            <Typography variant="body1" sx={{ color: "#f8fafc" }}>
              Preview is not available for this file type.
            </Typography>
            <Typography variant="body2" sx={{ color: "rgba(226,232,240,0.64)", textAlign: "center", maxWidth: 420 }}>
              Use the download button to open it in another app. Offline access still works for files that were already synced to the phone.
            </Typography>
            {showDownload && (
              <Button
                variant="contained"
                onClick={() => void documentService.downloadDocument(doc!.downloadUrl!, doc!.name)}
                startIcon={<DownloadOutlined />}
              >
                Download file
              </Button>
            )}
          </Stack>
        )}

        {!loading && doc?.notes && (
          <Box sx={{ px: { xs: 1.25, sm: 2.5 }, py: 1.25, borderTop: "1px solid rgba(148,163,184,0.12)" }}>
            <Typography variant="caption" sx={{ color: "rgba(153,246,228,0.84)", textTransform: "uppercase", letterSpacing: 0.8 }}>
              Notes
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5, color: "rgba(226,232,240,0.82)" }}>
              {doc.notes}
            </Typography>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
