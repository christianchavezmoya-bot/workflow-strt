import { useEffect, useRef, useState } from "react";
import { Box, CircularProgress, Stack, Typography } from "@mui/material";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

function previewLoadErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Could not render PDF preview.";
}

type Props = {
  blob: Blob;
  zoom?: number;
  /** Hint shown above the scroll area on narrow screens */
  scrollHint?: string;
};

const WIDTH_EPSILON = 2;
const RESIZE_DEBOUNCE_MS = 120;

/** Scrollable multi-page PDF preview (pdf.js). Use instead of iframe blobs on mobile. */
export default function PdfBlobPreview({ blob, zoom = 1, scrollHint }: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const containerWidthRef = useRef(0);
  const [layoutWidth, setLayoutWidth] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [renderedPages, setRenderedPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPdfData(null);
    setPageCount(0);
    setRenderedPages(0);
    setLoading(true);
    setError(null);
    void blob.arrayBuffer().then((data) => {
      if (!cancelled) setPdfData(data);
    }).catch(() => {
      if (!cancelled) setError("Could not read PDF data.");
    });
    return () => { cancelled = true; };
  }, [blob]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;

    let frame = 0;
    let debounceId: ReturnType<typeof setTimeout> | null = null;

    const commitWidth = (width: number) => {
      if (width <= 0) return;
      if (Math.abs(width - containerWidthRef.current) < WIDTH_EPSILON) return;
      containerWidthRef.current = width;
      setLayoutWidth(width);
    };

    const resizeObserver = new ResizeObserver((entries) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const width = entries[0]?.contentRect.width ?? 0;
        if (debounceId) clearTimeout(debounceId);
        debounceId = setTimeout(() => commitWidth(width), RESIZE_DEBOUNCE_MS);
      });
    });

    resizeObserver.observe(node);
    commitWidth(node.getBoundingClientRect().width);

    return () => {
      cancelAnimationFrame(frame);
      if (debounceId) clearTimeout(debounceId);
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const renderWidth = layoutWidth;

    async function renderPdf() {
      if (!pdfData || pdfData.byteLength === 0 || !pagesRef.current || renderWidth <= 0) return;

      const host = pagesRef.current;
      host.innerHTML = "";
      setPageCount(0);
      setRenderedPages(0);
      setLoading(true);
      setError(null);

      try {
        const loadingTask = pdfjsLib.getDocument({ data: pdfData.slice(0), disableFontFace: true });
        const pdf = await loadingTask.promise;
        if (cancelled) {
          void loadingTask.destroy();
          return;
        }

        const totalPages = pdf.numPages;
        setPageCount(totalPages);

        for (let index = 1; index <= totalPages; index += 1) {
          const page = await pdf.getPage(index);
          if (cancelled) break;

          const baseViewport = page.getViewport({ scale: 1 });
          const fittedScale = Math.max(0.35, ((renderWidth - 32) / baseViewport.width) * zoom);
          const viewport = page.getViewport({ scale: fittedScale });

          if (totalPages > 1) {
            const label = document.createElement("div");
            label.textContent = `Page ${index} of ${totalPages}`;
            label.style.margin = "0 auto 8px";
            label.style.maxWidth = "100%";
            label.style.textAlign = "center";
            label.style.fontSize = "12px";
            label.style.fontWeight = "600";
            label.style.color = "rgba(255,255,255,0.88)";
            host.appendChild(label);
          }

          const shell = document.createElement("div");
          shell.style.margin = "0 auto 16px";
          shell.style.width = `${viewport.width}px`;
          shell.style.maxWidth = "100%";
          shell.style.borderRadius = "8px";
          shell.style.overflow = "hidden";
          shell.style.boxShadow = "0 8px 24px rgba(0,0,0,0.25)";
          shell.style.background = "#fff";

          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) continue;

          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          canvas.style.display = "block";
          canvas.style.width = "100%";
          canvas.style.height = "auto";

          shell.appendChild(canvas);
          host.appendChild(shell);

          await page.render({ canvas, canvasContext: context, viewport } as never).promise;
          if (!cancelled) setRenderedPages(index);
        }
      } catch (err) {
        if (!cancelled) {
          host.innerHTML = "";
          setError(previewLoadErrorMessage(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void renderPdf();
    return () => { cancelled = true; };
  }, [pdfData, layoutWidth, zoom]);

  const multiPage = pageCount > 1;
  const scrollMessage = scrollHint ?? (multiPage ? "Scroll down to review all pages" : undefined);

  return (
    <Box
      ref={viewportRef}
      sx={{
        height: "100%",
        minHeight: 0,
        flex: 1,
        overflow: "auto",
        WebkitOverflowScrolling: "touch",
        bgcolor: "#525659",
        px: 1,
        py: 1.5,
      }}
    >
      {multiPage && !loading && !error && (
        <Typography
          variant="body2"
          sx={{
            position: "sticky",
            top: 0,
            zIndex: 2,
            textAlign: "center",
            py: 0.75,
            px: 1,
            mb: 1,
            borderRadius: 1,
            bgcolor: "rgba(15, 42, 51, 0.92)",
            color: "#9df0e5",
            fontWeight: 600,
          }}
        >
          {pageCount} pages — scroll to review all before signing
          {renderedPages > 0 && renderedPages < pageCount ? ` (${renderedPages}/${pageCount} rendered)` : ""}
        </Typography>
      )}
      {scrollMessage && multiPage && (
        <Typography variant="caption" sx={{ display: "block", textAlign: "center", color: "rgba(255,255,255,0.75)", mb: 1 }}>
          {scrollMessage}
        </Typography>
      )}
      {loading && renderedPages === 0 && (
        <Stack alignItems="center" justifyContent="center" spacing={1} sx={{ py: 4 }}>
          <CircularProgress size={28} sx={{ color: "#fff" }} />
          <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.8)" }}>Rendering report…</Typography>
        </Stack>
      )}
      {error && (
        <Typography variant="body2" sx={{ color: "#ffb4a2", textAlign: "center", py: 2 }}>
          {error}
        </Typography>
      )}
      <Box ref={pagesRef} sx={{ pb: 2 }} />
    </Box>
  );
}
